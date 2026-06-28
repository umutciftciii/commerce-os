import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiClient = {
  admin: {
    stores: { list: vi.fn() },
    shippingProviders: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsertCredential: vi.fn(),
      deleteCredential: vi.fn(),
      test: vi.fn(),
    },
    orderShipping: {
      get: vi.fn(),
      rate: vi.fn(),
      createOrder: vi.fn(),
      createBarcode: vi.fn(),
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

const SESSION = "commerce_os_store_admin_session=platform-token";
const CSRF_COOKIE = "; commerce_os_store_admin_csrf=csrf-token";

const DEMO_STORE = {
  id: "store-1",
  name: "Demo Store",
  slug: "demo-store",
  domain: null,
  status: "ACTIVE",
  metadata: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
};

// Gateway'in dondurdugu MASKELI shipping config (secret/ciphertext/customerPassword YOK).
const MASKED_CONFIG = {
  id: "spc_1",
  provider: "DHL_ECOMMERCE",
  mode: "TEST",
  status: "DISABLED",
  displayName: "DHL eCommerce",
  allowOrderCreate: false,
  allowBarcodeCreate: false,
  allowLabelPurchase: false,
  lastTestedAt: null,
  lastTestStatus: null,
  lastErrorCode: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  credentials: [
    {
      type: "IDENTITY",
      configured: true,
      maskedKey: "••••XYZ7",
      secretSet: true,
      customerNumberSet: true,
      customerPasswordSet: true,
      identityType: 1,
      lastTestedAt: null,
      lastTestStatus: null,
      lastErrorCode: null,
    },
  ],
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
  apiClient.admin.stores.list.mockResolvedValue({
    data: [DEMO_STORE],
    pagination: { limit: 50, offset: 0, total: 1 },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("store-admin BFF — shipping providers (F3C.1)", () => {
  it("rejects the list without a session cookie", async () => {
    const { GET } = await import("../app/api/shipping/providers/route.js");
    const response = await GET(request("/api/shipping/providers"));
    expect(response.status).toBe(401);
    expect(apiClient.admin.shippingProviders.list).not.toHaveBeenCalled();
  });

  it("lists providers for the resolved store and never leaks the bearer token or secrets", async () => {
    apiClient.admin.shippingProviders.list.mockResolvedValue({ data: [MASKED_CONFIG] });
    const { GET } = await import("../app/api/shipping/providers/route.js");
    const response = await GET(request("/api/shipping/providers", { headers: { cookie: SESSION } }));
    const raw = await response.text();
    expect(response.status).toBe(200);
    expect(apiClient.admin.shippingProviders.list).toHaveBeenCalledWith("store-1", "platform-token");
    expect(raw).not.toContain("platform-token");
    // Masked-only: ciphertext/secret sizmaz. (customerPasswordSet bir ALLOWLIST
    // boolean'idir — "set mi?" göstergesi; secret DEGERI degildir.)
    expect(raw).not.toContain("v1:gcm");
    expect(raw).not.toContain("encryptedCustomerPassword");
    expect(raw).toContain("••••XYZ7");
  });

  it("rejects a create without a CSRF token before any upstream call", async () => {
    const { POST } = await import("../app/api/shipping/providers/route.js");
    const response = await POST(
      request("/api/shipping/providers", jsonInit("POST", SESSION, { provider: "MOCK", displayName: "X" })),
    );
    expect(response.status).toBe(403);
    expect(apiClient.admin.shippingProviders.create).not.toHaveBeenCalled();
  });

  it("creates a provider with CSRF and forwards the server-side store + token", async () => {
    apiClient.admin.shippingProviders.create.mockResolvedValue(MASKED_CONFIG);
    const { POST } = await import("../app/api/shipping/providers/route.js");
    const body = { provider: "DHL_ECOMMERCE", displayName: "DHL eCommerce", mode: "TEST" };
    const response = await POST(
      request("/api/shipping/providers", jsonInit("POST", SESSION + CSRF_COOKIE, body, true)),
    );
    expect(response.status).toBe(201);
    expect(apiClient.admin.shippingProviders.create).toHaveBeenCalledWith("store-1", body, "platform-token");
  });

  it("rejects a credential upsert without CSRF (no upstream call, no secret forwarded)", async () => {
    const { POST } = await import("../app/api/shipping/providers/[configId]/credentials/route.js");
    const response = await POST(
      request(
        "/api/shipping/providers/spc_1/credentials",
        jsonInit("POST", SESSION, { type: "IDENTITY", key: "id", secret: "sec", customerPassword: "pw" }),
      ),
      { params: Promise.resolve({ configId: "spc_1" }) },
    );
    expect(response.status).toBe(403);
    expect(apiClient.admin.shippingProviders.upsertCredential).not.toHaveBeenCalled();
  });

  it("upserts a credential with CSRF and returns the masked config (no plaintext secret echoed)", async () => {
    apiClient.admin.shippingProviders.upsertCredential.mockResolvedValue(MASKED_CONFIG);
    const { POST } = await import("../app/api/shipping/providers/[configId]/credentials/route.js");
    const body = { type: "IDENTITY", key: "client-id", secret: "client-secret", customerNumber: "123", customerPassword: "SUPERPW", identityType: 1 };
    const response = await POST(
      request("/api/shipping/providers/spc_1/credentials", jsonInit("POST", SESSION + CSRF_COOKIE, body, true)),
      { params: Promise.resolve({ configId: "spc_1" }) },
    );
    const raw = await response.text();
    expect(response.status).toBe(200);
    expect(apiClient.admin.shippingProviders.upsertCredential).toHaveBeenCalledWith("store-1", "spc_1", body, "platform-token");
    // Yanit MASKELI config; gonderilen plain secret yanit GOVDESINDE yer almaz.
    expect(raw).not.toContain("SUPERPW");
    expect(raw).not.toContain("client-secret");
  });

  it("ignores a client-supplied storeId and uses server context for test", async () => {
    apiClient.admin.shippingProviders.test.mockResolvedValue({ ok: true, message: "ok", testedAt: "2026-01-01T00:00:00.000Z" });
    const { POST } = await import("../app/api/shipping/providers/[configId]/test/route.js");
    const response = await POST(
      request("/api/shipping/providers/spc_1/test?storeId=attacker", jsonInit("POST", SESSION + CSRF_COOKIE, undefined, true)),
      { params: Promise.resolve({ configId: "spc_1" }) },
    );
    expect(response.status).toBe(200);
    expect(apiClient.admin.shippingProviders.test).toHaveBeenCalledWith("store-1", "spc_1", "platform-token");
  });

  it("rejects order create-order without CSRF (destructive op gated before upstream)", async () => {
    const { POST } = await import("../app/api/orders/[id]/shipping/create-order/route.js");
    const response = await POST(
      request("/api/orders/o1/shipping/create-order", jsonInit("POST", SESSION, { providerConfigId: "spc_1", referenceId: "R1", recipient: {}, pieces: [{ desi: 1, kg: 1 }] })),
      { params: Promise.resolve({ id: "o1" }) },
    );
    expect(response.status).toBe(403);
    expect(apiClient.admin.orderShipping.createOrder).not.toHaveBeenCalled();
  });

  it("forwards a guarded create-order with CSRF (gateway enforces 409 by default)", async () => {
    apiClient.admin.orderShipping.createOrder.mockResolvedValue({ referenceId: "R1", externalOrderId: null });
    const { POST } = await import("../app/api/orders/[id]/shipping/create-order/route.js");
    const body = { providerConfigId: "spc_1", referenceId: "R1", recipient: {}, pieces: [{ desi: 1, kg: 1 }], explicitConfirm: false };
    const response = await POST(
      request("/api/orders/o1/shipping/create-order", jsonInit("POST", SESSION + CSRF_COOKIE, body, true)),
      { params: Promise.resolve({ id: "o1" }) },
    );
    expect(response.status).toBe(201);
    expect(apiClient.admin.orderShipping.createOrder).toHaveBeenCalledWith("store-1", "o1", body, "platform-token");
  });
});
