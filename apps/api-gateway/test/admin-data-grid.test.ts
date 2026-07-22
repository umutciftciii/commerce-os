import { describe, expect, it, vi } from "vitest";
import { type AppDataAccess, createServer } from "../src/server.js";

/**
 * TODO-159A (ADR-089) — Admin Data Grid liste sözleşmesi ENTEGRASYON testleri.
 *
 * Doğrulananlar: varsayılan sayfalama, page/pageSize, pageSize üst sınırı, arama,
 * her desteklenen filtrenin data-access'e TİPLİ olarak taşınması, sort allowlist'i
 * (tanınmayan değer 400), tenant izolasyonu (storeId her çağrıda), boş sonuç, son
 * sayfa, geçersiz query değerleri ve totalItems/totalPages doğruluğu.
 *
 * Data-access in-memory'dir: burada doğrulanan ROUTE sözleşmesidir (query → kriter →
 * meta). Gerçek SQL semantiği (LATERAL aggregate, ILIKE escape, NULLS LAST) Docker
 * gerçek-PG smoke'unda doğrulanır.
 */

const config = {
  APP_ENV: "test" as const,
  SERVICE_NAME: "api-gateway-test",
  LOG_LEVEL: "error" as const,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  INTERNAL_API_TOKEN: "test-internal-token",
  SESSION_SECRET: "test-session-secret-with-enough-length",
  SESSION_TTL_SECONDS: 3600,
  PASSWORD_HASH_PEPPER: "test-pepper",
  ADMIN_AUTH_COOKIE_NAME: "commerce_os_admin_session",
  AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: 60,
  AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: 50,
  API_GATEWAY_PORT: 3000,
  WORKER_CONCURRENCY: 5,
  PAYMENT_SANDBOX_HTTP_ENABLED: false,
};

const store = {
  id: "store_1",
  name: "Demo",
  slug: "demo",
  status: "ACTIVE" as const,
  metadata: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const AUTH = { authorization: "Bearer admin-token" };

function makeProduct(index: number) {
  return {
    id: `prod_${index}`,
    storeId: store.id,
    title: `Ürün ${index}`,
    slug: `urun-${index}`,
    description: null,
    status: "ACTIVE" as const,
    type: "PHYSICAL" as const,
    vendor: null,
    brand: "Acme",
    seoTitle: null,
    seoDescription: null,
    salesMode: "ONLINE" as const,
    priceVisibility: "VISIBLE" as const,
    primaryAction: "ADD_TO_CART" as const,
    inquiryEnabled: false,
    appointmentRequired: false,
    whatsappEnabled: false,
    purchasable: true,
    minOrderQuantity: 1,
    maxOrderQuantity: null,
    callToActionLabel: null,
    whatsappMessageTemplate: null,
    inquiryFormTitle: null,
    appointmentNote: null,
    shippingWeightKg: null,
    shippingDesi: null,
    primaryCategoryId: null,
    mediaDefiningAttributeId: null,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    categoryIds: [],
    images: [],
  };
}

/** Sayfalanabilir in-memory katalog: kriteri kaydeder, dilimi döndürür. */
function buildApp(totalProducts = 7) {
  const all = Array.from({ length: totalProducts }, (_, index) => makeProduct(index + 1));
  const listProductsAdmin = vi.fn(
    async (storeId: string, criteria: { limit: number; offset: number }) => {
      const scoped = all.filter((product) => product.storeId === storeId);
      return {
        data: scoped.slice(criteria.offset, criteria.offset + criteria.limit),
        total: scoped.length,
      };
    },
  );
  const listProductFilterOptions = vi.fn(async () => ({
    brands: ["Acme"],
    vendors: [],
  }));

  const dataAccess = {
    async findPlatformSessionByTokenHash() {
      return {
        id: "sess_1",
        expiresAt: new Date(Date.now() + 3_600_000),
        revokedAt: null,
        platformUser: {
          id: "pu_1",
          email: "admin@commerce-os.dev",
          name: "Admin",
          passwordHash: "x",
          role: "SUPER_ADMIN" as const,
        },
      };
    },
    async findStoreById(id: string) {
      return id === store.id ? store : null;
    },
    listProductsAdmin,
    listProductFilterOptions,
  } as unknown as AppDataAccess;

  return { app: createServer(config, { dataAccess }), listProductsAdmin, listProductFilterOptions };
}

describe("GET /stores/:storeId/products — sayfalama sözleşmesi", () => {
  it("query verilmezse varsayılan sayfa (1) ve varsayılan sayfa boyutu (25) uygulanır", async () => {
    const { app, listProductsAdmin } = buildApp();
    const res = await app.inject({ method: "GET", url: "/stores/store_1/products", headers: AUTH });

    expect(res.statusCode).toBe(200);
    expect(listProductsAdmin.mock.calls[0]?.[1]).toMatchObject({
      limit: 25,
      offset: 0,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    expect(res.json().pagination).toMatchObject({
      page: 1,
      pageSize: 25,
      totalItems: 7,
      totalPages: 1,
      // Legacy alanlar KORUNUR (geriye uyumluluk).
      limit: 25,
      offset: 0,
      total: 7,
    });
  });

  it("page/pageSize offset'e çevrilir ve totalPages doğru hesaplanır", async () => {
    const { app, listProductsAdmin } = buildApp(7);
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products?page=2&pageSize=25",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(listProductsAdmin.mock.calls[0]?.[1]).toMatchObject({ limit: 25, offset: 25 });
    expect(res.json().pagination).toMatchObject({ page: 2, pageSize: 25, totalPages: 1 });
  });

  it("son sayfada yalnız kalan kayıtlar döner (3 sayfalık kümede 3. sayfa)", async () => {
    const { app } = buildApp(7);
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products?page=3&pageSize=3",
      headers: AUTH,
    });

    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toMatchObject({ page: 3, pageSize: 3, totalItems: 7, totalPages: 3 });
  });

  it("boş katalogda totalItems=0 ve totalPages=0 döner", async () => {
    const { app } = buildApp(0);
    const res = await app.inject({ method: "GET", url: "/stores/store_1/products", headers: AUTH });

    expect(res.json().data).toEqual([]);
    expect(res.json().pagination).toMatchObject({ totalItems: 0, totalPages: 0 });
  });

  it("pageSize üst sınırı SUNUCUDA zorlanır (101 → 400)", async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products?pageSize=101",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("eski limit/offset istemcileri kabul edilir (geriye uyumluluk)", async () => {
    const { app, listProductsAdmin } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products?limit=10&offset=20",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(listProductsAdmin.mock.calls[0]?.[1]).toMatchObject({ limit: 10, offset: 20 });
    expect(res.json().pagination).toMatchObject({ page: 3, pageSize: 10 });
  });
});

describe("GET /stores/:storeId/products — arama, filtre ve sıralama", () => {
  it("arama terimi data-access'e taşınır", async () => {
    const { app, listProductsAdmin } = buildApp();
    await app.inject({
      method: "GET",
      url: "/stores/store_1/products?search=%20sweat%20",
      headers: AUTH,
    });

    expect(listProductsAdmin.mock.calls[0]?.[1]).toMatchObject({ search: "sweat" });
  });

  it("desteklenen tüm filtreler tipli olarak taşınır", async () => {
    const { app, listProductsAdmin } = buildApp();
    await app.inject({
      method: "GET",
      url:
        "/stores/store_1/products?status=DRAFT&salesMode=INQUIRY&purchasable=false" +
        "&categoryId=cat_1&brand=Acme&vendor=Acme%20Tekstil&stockStatus=OUT_OF_STOCK" +
        "&priceMin=1000&priceMax=5000",
      headers: AUTH,
    });

    expect(listProductsAdmin.mock.calls[0]?.[1]).toMatchObject({
      status: "DRAFT",
      salesMode: "INQUIRY",
      // "false" string'i BOOLEAN'a çevrilir (filtrenin kapalı olmasıyla karışmaz).
      purchasable: false,
      categoryId: "cat_1",
      brand: "Acme",
      vendor: "Acme Tekstil",
      stockStatus: "OUT_OF_STOCK",
      priceMin: 1000,
      priceMax: 5000,
    });
  });

  it("sıralama allowlist'tedir: geçerli değer taşınır", async () => {
    const { app, listProductsAdmin } = buildApp();
    await app.inject({
      method: "GET",
      url: "/stores/store_1/products?sortBy=price&sortOrder=asc",
      headers: AUTH,
    });

    expect(listProductsAdmin.mock.calls[0]?.[1]).toMatchObject({
      sortBy: "price",
      sortOrder: "asc",
    });
  });

  it("allowlist dışı sortBy 400 döner (serbest metin orderBy'a geçemez)", async () => {
    const { app, listProductsAdmin } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products?sortBy=priceMinor%3B%20DROP%20TABLE",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(400);
    expect(listProductsAdmin).not.toHaveBeenCalled();
  });

  it("geçersiz enum/sayı değerleri 400 döner", async () => {
    const { app } = buildApp();
    const badStatus = await app.inject({
      method: "GET",
      url: "/stores/store_1/products?status=SOLD_OUT",
      headers: AUTH,
    });
    const badPage = await app.inject({
      method: "GET",
      url: "/stores/store_1/products?page=0",
      headers: AUTH,
    });
    const badPrice = await app.inject({
      method: "GET",
      url: "/stores/store_1/products?priceMin=-5",
      headers: AUTH,
    });

    expect(badStatus.statusCode).toBe(400);
    expect(badPage.statusCode).toBe(400);
    expect(badPrice.statusCode).toBe(400);
  });
});

describe("Admin liste uçları — tenant izolasyonu", () => {
  it("data-access HER ZAMAN yol parametresindeki storeId ile çağrılır", async () => {
    const { app, listProductsAdmin } = buildApp();
    await app.inject({
      method: "GET",
      url: "/stores/store_1/products?search=x",
      headers: AUTH,
    });

    expect(listProductsAdmin.mock.calls[0]?.[0]).toBe("store_1");
  });

  it("başka mağazanın id'si 404 STORE_ACCESS_DENIED döner (liste sorgusu hiç çalışmaz)", async () => {
    const { app, listProductsAdmin } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_other/products",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("STORE_ACCESS_DENIED");
    expect(listProductsAdmin).not.toHaveBeenCalled();
  });

  it("oturumsuz istek 401 döner", async () => {
    const { app, listProductsAdmin } = buildApp();
    const res = await app.inject({ method: "GET", url: "/stores/store_1/products" });

    expect(res.statusCode).toBe(401);
    expect(listProductsAdmin).not.toHaveBeenCalled();
  });
});

describe("GET /stores/:storeId/products/filter-options", () => {
  it("DISTINCT marka/tedarikçi listesini döner", async () => {
    const { app, listProductFilterOptions } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products/filter-options",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brands: ["Acme"], vendors: [] });
    expect(listProductFilterOptions).toHaveBeenCalledWith("store_1");
  });
});
