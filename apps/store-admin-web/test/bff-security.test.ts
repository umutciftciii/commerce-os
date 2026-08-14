import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiClient = {
  // Faz E1 cutover — BFF artık GERÇEK StoreUser auth namespace'ini kullanır (PlatformUser
  // login/me/logout DEĞİL). `auth.platform*` bilinçli olarak MOCK'lanmaz: bir regresyon onu
  // yeniden çağırırsa test "not a function" ile patlar (fallback sızıntısını yakalar).
  storeAuth: {
    login: vi.fn(),
    logout: vi.fn(),
    session: vi.fn(),
  },
  admin: {
    // Store context artık oturumdan gelir; stores.list ÇAĞRILMAMALI (demo/first-store yok).
    stores: { list: vi.fn() },
    categories: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    products: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      variants: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    },
    inventory: { list: vi.fn(), adjust: vi.fn(), warehouses: vi.fn(), storeMatrix: vi.fn() },
    orders: {
      list: vi.fn(),
      create: vi.fn(),
      get: vi.fn(),
      place: vi.fn(),
      cancel: vi.fn(),
    },
  },
};

class MockApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

vi.mock("@commerce-os/api-client", () => ({
  ApiError: MockApiError,
  createApiClient: () => apiClient,
}));

const SESSION = "commerce_os_store_admin_session=store-session-token";
const CSRF_COOKIE = "; commerce_os_store_admin_csrf=csrf-token";

const TIMING = {
  idleExpiresAt: new Date("2026-01-01T00:30:00.000Z").toISOString(),
  absoluteExpiresAt: new Date("2026-01-01T08:00:00.000Z").toISOString(),
  warningLeadSeconds: 300,
  rememberMe: false,
  lastActivityAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
};

// Faz E1 — /auth/store/session yanıtı: StoreUser principal + oturumun bağlı olduğu
// mağaza (store context server-otoriter) + timing. Store context BURADAN gelir.
const SESSION_RESULT = {
  user: { id: "su-1", storeId: "store-1", email: "owner@demo.local", name: "Owner", role: "OWNER" },
  store: { id: "store-1", slug: "demo-store", name: "Demo Store", status: "ACTIVE" },
  session: { timing: TIMING },
};

function request(path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(`http://localhost${path}`, init);
}

function jsonInit(method: string, cookie: string, body?: unknown, csrf = false) {
  const headers: Record<string, string> = { cookie, "content-type": "application/json" };
  if (csrf) headers["x-commerce-os-csrf"] = "csrf-token";
  return { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };
}

beforeEach(() => {
  // Store context artık oturumdan türetilir (mağaza listeleme/demo-first YOK).
  apiClient.storeAuth.session.mockResolvedValue(SESSION_RESULT);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("store-admin BFF — token confidentiality", () => {
  it("login returns only the user (token is set in an httpOnly cookie, never in the body)", async () => {
    // Faz E1 — GERÇEK StoreUser login; kullanıcı DTO'su storeId + store role taşır.
    apiClient.storeAuth.login.mockResolvedValue({
      token: "secret-bearer-token",
      expiresAt: new Date("2026-12-31T00:00:00.000Z").toISOString(),
      user: { id: "su-1", storeId: "store-1", email: "owner@demo.local", name: "Owner", role: "OWNER" },
    });
    const { POST } = await import("../app/api/auth/login/route.js");

    const response = await POST(
      request("/api/auth/login", jsonInit("POST", "", { email: "a@b.co", password: "x" })),
    );
    const raw = await response.text();

    expect(response.status).toBe(200);
    expect(raw).not.toContain("secret-bearer-token");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("commerce_os_store_admin_session=");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("store context returns store metadata but never the bearer token", async () => {
    const { GET } = await import("../app/api/store/context/route.js");
    const response = await GET(request("/api/store/context", { headers: { cookie: SESSION } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      store: { id: "store-1", name: "Demo Store", slug: "demo-store", status: "ACTIVE" },
    });
    expect(JSON.stringify(body)).not.toContain("store-session-token");
  });
});

describe("store-admin BFF — auth + store guards", () => {
  it("rejects catalog reads without a session cookie", async () => {
    const { GET } = await import("../app/api/catalog/categories/route.js");
    const response = await GET(request("/api/catalog/categories"));
    expect(response.status).toBe(401);
    expect(apiClient.admin.categories.list).not.toHaveBeenCalled();
  });

  it("rejects catalog reads when the session token is invalid/expired (gateway 401) — no store listing", async () => {
    // Faz E1 — store context oturumdan gelir; geçersiz/expired token'da gateway
    // /auth/store/session 401 fırlatır → BFF 401 döner (NO_STORE/first-store yolu YOK).
    apiClient.storeAuth.session.mockRejectedValue(new MockApiError(401, "UNAUTHORIZED"));
    const { GET } = await import("../app/api/catalog/products/route.js");
    const response = await GET(request("/api/catalog/products", { headers: { cookie: SESSION } }));
    expect(response.status).toBe(401);
    // Mağaza HİÇ listelenmez (demo/first-store fallback kaldırıldı).
    expect(apiClient.admin.stores.list).not.toHaveBeenCalled();
  });
});

describe("store-admin BFF — categories proxy", () => {
  it("lists categories for the resolved store with the server-side token", async () => {
    apiClient.admin.categories.list.mockResolvedValue({
      data: [],
      pagination: { limit: 50, offset: 0, total: 0 },
    });
    const { GET } = await import("../app/api/catalog/categories/route.js");
    const response = await GET(request("/api/catalog/categories", { headers: { cookie: SESSION } }));

    expect(response.status).toBe(200);
    // TODO-159A (ADR-089) — BFF artık liste query'sini (allowlist ile) taşır; query
    // verilmeyen istekte boş nesne gider (gateway varsayılanları uygulanır).
    expect(apiClient.admin.categories.list).toHaveBeenCalledWith("store-1", "store-session-token", {});
  });

  it("rejects a forged mutating request via CSRF before any upstream store lookup", async () => {
    const { POST } = await import("../app/api/catalog/categories/route.js");
    const response = await POST(
      request("/api/catalog/categories", jsonInit("POST", "", { name: "X", slug: "x" })),
    );
    expect(response.status).toBe(403);
    expect(apiClient.admin.stores.list).not.toHaveBeenCalled();
    expect(apiClient.admin.categories.create).not.toHaveBeenCalled();
  });

  it("rejects category creation without a CSRF token", async () => {
    const { POST } = await import("../app/api/catalog/categories/route.js");
    const response = await POST(
      request(
        "/api/catalog/categories",
        jsonInit("POST", SESSION, { name: "Tişört", slug: "tisort" }),
      ),
    );
    expect(response.status).toBe(403);
    expect(apiClient.admin.categories.create).not.toHaveBeenCalled();
  });

  it("creates a category with matching CSRF cookie and header", async () => {
    apiClient.admin.categories.create.mockResolvedValue({ id: "c1" });
    const { POST } = await import("../app/api/catalog/categories/route.js");
    const response = await POST(
      request(
        "/api/catalog/categories",
        jsonInit("POST", SESSION + CSRF_COOKIE, { name: "Tişört", slug: "tisort" }, true),
      ),
    );
    expect(response.status).toBe(201);
    expect(apiClient.admin.categories.create).toHaveBeenCalledWith(
      "store-1",
      { name: "Tişört", slug: "tisort" },
      "store-session-token",
    );
  });

  it("maps a duplicate-slug ApiError to the gateway code and status", async () => {
    apiClient.admin.categories.create.mockRejectedValue(new MockApiError(409, "CATEGORY_SLUG_EXISTS"));
    const { POST } = await import("../app/api/catalog/categories/route.js");
    const response = await POST(
      request(
        "/api/catalog/categories",
        jsonInit("POST", SESSION + CSRF_COOKIE, { name: "X", slug: "apparel" }, true),
      ),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "CATEGORY_SLUG_EXISTS" } });
  });
});

describe("store-admin BFF — products & variants proxy", () => {
  it("carries the sales-model fields through product creation with CSRF", async () => {
    apiClient.admin.products.create.mockResolvedValue({ id: "p1" });
    const { POST } = await import("../app/api/catalog/products/route.js");
    const salesBody = {
      title: "Danışmanlık",
      slug: "danismanlik",
      salesMode: "INQUIRY",
      priceVisibility: "ON_REQUEST",
      primaryAction: "REQUEST_PRICE",
      purchasable: false,
      inquiryEnabled: true,
      minOrderQuantity: 1,
      maxOrderQuantity: null,
      inquiryFormTitle: "Fiyat isteyin",
    };
    const response = await POST(
      request("/api/catalog/products", jsonInit("POST", SESSION + CSRF_COOKIE, salesBody, true)),
    );
    expect(response.status).toBe(201);
    expect(apiClient.admin.products.create).toHaveBeenCalledWith(
      "store-1",
      expect.objectContaining({
        salesMode: "INQUIRY",
        priceVisibility: "ON_REQUEST",
        primaryAction: "REQUEST_PRICE",
        purchasable: false,
        inquiryEnabled: true,
        inquiryFormTitle: "Fiyat isteyin",
      }),
      "store-session-token",
    );
  });

  it("rejects product creation without a CSRF token before any upstream call", async () => {
    const { POST } = await import("../app/api/catalog/products/route.js");
    const response = await POST(
      request(
        "/api/catalog/products",
        jsonInit("POST", SESSION, { title: "X", slug: "x", salesMode: "ONLINE" }),
      ),
    );
    expect(response.status).toBe(403);
    expect(apiClient.admin.products.create).not.toHaveBeenCalled();
  });

  it("carries the sales-model fields through product update with CSRF", async () => {
    apiClient.admin.products.update.mockResolvedValue({ id: "p1" });
    const { PATCH } = await import("../app/api/catalog/products/[productId]/route.js");
    const response = await PATCH(
      request(
        "/api/catalog/products/p1",
        jsonInit(
          "PATCH",
          SESSION + CSRF_COOKIE,
          { salesMode: "APPOINTMENT", primaryAction: "BOOK_APPOINTMENT", purchasable: false },
          true,
        ),
      ),
      { params: Promise.resolve({ productId: "p1" }) },
    );
    expect(response.status).toBe(200);
    expect(apiClient.admin.products.update).toHaveBeenCalledWith(
      "store-1",
      "p1",
      expect.objectContaining({
        salesMode: "APPOINTMENT",
        primaryAction: "BOOK_APPOINTMENT",
        purchasable: false,
      }),
      "store-session-token",
    );
  });

  it("updates a product through the dynamic route with CSRF", async () => {
    apiClient.admin.products.update.mockResolvedValue({ id: "p1" });
    const { PATCH } = await import("../app/api/catalog/products/[productId]/route.js");
    const response = await PATCH(
      request(
        "/api/catalog/products/p1",
        jsonInit("PATCH", SESSION + CSRF_COOKIE, { status: "ACTIVE" }, true),
      ),
      { params: Promise.resolve({ productId: "p1" }) },
    );
    expect(response.status).toBe(200);
    expect(apiClient.admin.products.update).toHaveBeenCalledWith(
      "store-1",
      "p1",
      { status: "ACTIVE" },
      "store-session-token",
    );
  });

  it("creates a variant with CSRF and surfaces duplicate-SKU code", async () => {
    apiClient.admin.products.variants.create.mockRejectedValue(
      new MockApiError(409, "VARIANT_SKU_EXISTS"),
    );
    const { POST } = await import("../app/api/catalog/products/[productId]/variants/route.js");
    const response = await POST(
      request(
        "/api/catalog/products/p1/variants",
        jsonInit("POST", SESSION + CSRF_COOKIE, { title: "M", sku: "DEMO-1", priceMinor: 1000 }, true),
      ),
      { params: Promise.resolve({ productId: "p1" }) },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "VARIANT_SKU_EXISTS" } });
  });
});

describe("store-admin BFF — inventory proxy", () => {
  it("lists inventory for the resolved store", async () => {
    apiClient.admin.inventory.list.mockResolvedValue({
      data: [],
      pagination: { limit: 50, offset: 0, total: 0 },
    });
    const { GET } = await import("../app/api/catalog/inventory/route.js");
    const response = await GET(request("/api/catalog/inventory", { headers: { cookie: SESSION } }));
    expect(response.status).toBe(200);
    expect(apiClient.admin.inventory.list).toHaveBeenCalledWith("store-1", "store-session-token");
  });

  it("rejects an adjustment without CSRF", async () => {
    const { POST } = await import("../app/api/catalog/inventory/[variantId]/adjust/route.js");
    const response = await POST(
      request("/api/catalog/inventory/v1/adjust", jsonInit("POST", SESSION, { quantityDelta: -3 })),
      { params: Promise.resolve({ variantId: "v1" }) },
    );
    expect(response.status).toBe(403);
    expect(apiClient.admin.inventory.adjust).not.toHaveBeenCalled();
  });

  it("maps a negative-stock ApiError to a 400 friendly code", async () => {
    apiClient.admin.inventory.adjust.mockRejectedValue(
      new MockApiError(400, "INVALID_INVENTORY_ADJUSTMENT"),
    );
    const { POST } = await import("../app/api/catalog/inventory/[variantId]/adjust/route.js");
    const response = await POST(
      request(
        "/api/catalog/inventory/v1/adjust",
        jsonInit("POST", SESSION + CSRF_COOKIE, { quantityDelta: -999 }, true),
      ),
      { params: Promise.resolve({ variantId: "v1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "INVALID_INVENTORY_ADJUSTMENT" } });
  });
});

describe("store-admin BFF — orders proxy (F2G)", () => {
  it("rejects the orders list without a session cookie", async () => {
    const { GET } = await import("../app/api/orders/route.js");
    const response = await GET(request("/api/orders"));
    expect(response.status).toBe(401);
    expect(apiClient.admin.orders.list).not.toHaveBeenCalled();
  });

  it("lists orders for the resolved store with the server-side token (storeId not from client)", async () => {
    apiClient.admin.orders.list.mockResolvedValue({
      data: [],
      pagination: { limit: 50, offset: 0, total: 0 },
    });
    const { GET } = await import("../app/api/orders/route.js");
    // Istemci storeId gondermeye calissa bile sunucu kendi bağlamini kullanir.
    const response = await GET(
      request("/api/orders?storeId=attacker-store", { headers: { cookie: SESSION } }),
    );
    expect(response.status).toBe(200);
    // storeId daima server bağlamından; client'tan gelen storeId yok sayılır.
    expect(apiClient.admin.orders.list).toHaveBeenCalledWith("store-1", {}, "store-session-token");
  });

  it("forwards only known order filter keys to the gateway (TODO-073)", async () => {
    apiClient.admin.orders.list.mockResolvedValue({
      data: [],
      pagination: { limit: 50, offset: 0, total: 0 },
    });
    const { GET } = await import("../app/api/orders/route.js");
    const response = await GET(
      request("/api/orders?status=PLACED&paymentStatus=PAID&search=ahmet&bogus=x", {
        headers: { cookie: SESSION },
      }),
    );
    expect(response.status).toBe(200);
    // Yalnız bilinen filtreler taşınır; storeId server'dan, token server'dan.
    expect(apiClient.admin.orders.list).toHaveBeenCalledWith(
      "store-1",
      { status: "PLACED", paymentStatus: "PAID", search: "ahmet" },
      "store-session-token",
    );
  });

  it("proxies a single order detail through the dynamic route", async () => {
    apiClient.admin.orders.get.mockResolvedValue({ id: "o1", orderNumber: "ORD-1" });
    const { GET } = await import("../app/api/orders/[id]/route.js");
    const response = await GET(request("/api/orders/o1", { headers: { cookie: SESSION } }), {
      params: Promise.resolve({ id: "o1" }),
    });
    expect(response.status).toBe(200);
    expect(apiClient.admin.orders.get).toHaveBeenCalledWith("store-1", "o1", "store-session-token");
  });

  it("rejects placing an order without a CSRF token before any upstream call", async () => {
    const { POST } = await import("../app/api/orders/[id]/place/route.js");
    const response = await POST(request("/api/orders/o1/place", jsonInit("POST", SESSION)), {
      params: Promise.resolve({ id: "o1" }),
    });
    expect(response.status).toBe(403);
    expect(apiClient.admin.stores.list).not.toHaveBeenCalled();
    expect(apiClient.admin.orders.place).not.toHaveBeenCalled();
  });

  it("places an order with a matching CSRF cookie and header", async () => {
    apiClient.admin.orders.place.mockResolvedValue({ id: "o1", status: "PLACED" });
    const { POST } = await import("../app/api/orders/[id]/place/route.js");
    const response = await POST(
      request("/api/orders/o1/place", jsonInit("POST", SESSION + CSRF_COOKIE, undefined, true)),
      { params: Promise.resolve({ id: "o1" }) },
    );
    expect(response.status).toBe(200);
    expect(apiClient.admin.orders.place).toHaveBeenCalledWith("store-1", "o1", "store-session-token");
  });

  it("rejects cancelling an order without a CSRF token", async () => {
    const { POST } = await import("../app/api/orders/[id]/cancel/route.js");
    const response = await POST(
      request("/api/orders/o1/cancel", jsonInit("POST", SESSION, { reason: "x" })),
      { params: Promise.resolve({ id: "o1" }) },
    );
    expect(response.status).toBe(403);
    expect(apiClient.admin.orders.cancel).not.toHaveBeenCalled();
  });

  it("cancels an order with CSRF and forwards the reason to the api-client", async () => {
    apiClient.admin.orders.cancel.mockResolvedValue({ id: "o1", status: "CANCELLED" });
    const { POST } = await import("../app/api/orders/[id]/cancel/route.js");
    const response = await POST(
      request(
        "/api/orders/o1/cancel",
        jsonInit("POST", SESSION + CSRF_COOKIE, { reason: "Stok yok" }, true),
      ),
      { params: Promise.resolve({ id: "o1" }) },
    );
    expect(response.status).toBe(200);
    expect(apiClient.admin.orders.cancel).toHaveBeenCalledWith(
      "store-1",
      "o1",
      { reason: "Stok yok" },
      "store-session-token",
    );
  });

  it("creates a draft order with CSRF and never leaks the bearer token in the response", async () => {
    apiClient.admin.orders.create.mockResolvedValue({ id: "o2", orderNumber: "ORD-2" });
    const { POST } = await import("../app/api/orders/route.js");
    const body = {
      customerEmail: "buyer@example.local",
      currency: "TRY",
      lines: [{ variantId: "v1", quantity: 2 }],
      addresses: [],
    };
    const response = await POST(
      request("/api/orders", jsonInit("POST", SESSION + CSRF_COOKIE, body, true)),
    );
    const raw = await response.text();
    expect(response.status).toBe(201);
    expect(raw).not.toContain("store-session-token");
    expect(apiClient.admin.orders.create).toHaveBeenCalledWith("store-1", body, "store-session-token");
  });

  it("maps an insufficient-stock ApiError on place to the gateway code and status", async () => {
    apiClient.admin.orders.place.mockRejectedValue(
      new MockApiError(409, "ORDER_INSUFFICIENT_STOCK"),
    );
    const { POST } = await import("../app/api/orders/[id]/place/route.js");
    const response = await POST(
      request("/api/orders/o1/place", jsonInit("POST", SESSION + CSRF_COOKIE, undefined, true)),
      { params: Promise.resolve({ id: "o1" }) },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "ORDER_INSUFFICIENT_STOCK" } });
  });
});

describe("store-admin BFF — dashboard summary", () => {
  it("aggregates totals, active products and low stock server-side", async () => {
    // "Aktif ürün" sayısı artık ilk-sayfa satırları filtrelenerek DEĞİL, gateway'e
    // status=ACTIVE ile ikinci bir sayım çağrısı yapılıp `pagination.total` okunarak
    // bulunur (mağaza tek sayfadan büyükse undercount'u önler). Mock buna göre
    // status-farkındadır: filtresiz çağrı toplam 3, status=ACTIVE çağrısı 2 döner.
    apiClient.admin.products.list.mockImplementation(
      (_storeId: string, _token: string, query?: { status?: string }) =>
        Promise.resolve({
          data: [],
          pagination: {
            limit: 1,
            offset: 0,
            total: query?.status === "ACTIVE" ? 2 : 3,
          },
        }),
    );
    apiClient.admin.categories.list.mockResolvedValue({
      data: [{ id: "c1" }],
      pagination: { limit: 50, offset: 0, total: 1 },
    });
    // TODO-152A/159C — Dashboard KPI artık matrisin SAYFADAN BAĞIMSIZ `summary`'sinden türetilir
    // (LOW_STOCK durumu = tek authority reorderPoint; legacy lowStockThreshold kaldırıldı). Satırlar
    // (pageSize=1) değil summary okunur → toplamlar tüm mağazayı yansıtır (ilk sayfa değil).
    apiClient.admin.inventory.storeMatrix.mockResolvedValue({
      warehouse: { id: "wh1", code: "DEFAULT", name: "Ana Depo", status: "ACTIVE", isDefault: true, priority: 0 },
      rows: [],
      pagination: { limit: 1, offset: 0, total: 2, page: 1, pageSize: 1, totalItems: 2, totalPages: 2 },
      summary: {
        totalVariants: 2,
        totalOnHand: 14,
        totalReserved: 8,
        totalSellable: 6,
        totalIncoming: 0,
        inStock: 1,
        lowStock: 1,
        outOfStock: 0,
        incoming: 0,
        negative: 0,
        noBalance: 0,
      },
    });
    const { GET } = await import("../app/api/dashboard/summary/route.js");
    const response = await GET(request("/api/dashboard/summary", { headers: { cookie: SESSION } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.products).toEqual({ total: 3, active: 2 });
    expect(body.categories).toEqual({ total: 1 });
    expect(body.inventory).toEqual({ records: 2, lowStock: 1, totalOnHand: 14 });
    expect(JSON.stringify(body)).not.toContain("store-session-token");
  });
});
