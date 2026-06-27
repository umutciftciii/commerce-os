import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiClient = {
  admin: {
    stores: { list: vi.fn() },
    paymentProviders: {
      list: vi.fn(),
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      setStatus: vi.fn(),
      reorder: vi.fn(),
      testConnection: vi.fn(),
      events: vi.fn(),
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

// Gateway'in dondurdugu MASKELI config (secret duz metin/ciphertext YOK).
const MASKED_CONFIG = {
  id: "ppc_1",
  provider: "MOCK",
  displayName: "Mock TEST",
  status: "ENABLED",
  mode: "TEST",
  priority: 100,
  supportedMethods: ["CARD"],
  supportedCurrencies: ["TRY"],
  minAmount: null,
  maxAmount: null,
  threeDsMode: "DISABLED",
  installmentEnabled: false,
  fallbackEnabled: false,
  merchantId: null,
  callbackUrl: null,
  apiKeySet: true,
  apiKeyMasked: "••••1234",
  secretKeySet: true,
  webhookSecretSet: false,
  lastTestStatus: null,
  lastTestMessage: null,
  lastTestAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
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

describe("store-admin BFF — payment providers (F3B.2)", () => {
  it("rejects the list without a session cookie", async () => {
    const { GET } = await import("../app/api/payment-providers/route.js");
    const response = await GET(request("/api/payment-providers"));
    expect(response.status).toBe(401);
    expect(apiClient.admin.paymentProviders.list).not.toHaveBeenCalled();
  });

  it("lists providers for the resolved store and never leaks the bearer token", async () => {
    apiClient.admin.paymentProviders.list.mockResolvedValue({ data: [MASKED_CONFIG] });
    const { GET } = await import("../app/api/payment-providers/route.js");
    const response = await GET(request("/api/payment-providers", { headers: { cookie: SESSION } }));
    const raw = await response.text();
    expect(response.status).toBe(200);
    expect(apiClient.admin.paymentProviders.list).toHaveBeenCalledWith("store-1", "platform-token");
    expect(raw).not.toContain("platform-token");
  });

  it("rejects a create without a CSRF token before any upstream call", async () => {
    const { POST } = await import("../app/api/payment-providers/route.js");
    const response = await POST(
      request("/api/payment-providers", jsonInit("POST", SESSION, { provider: "MOCK", displayName: "X" })),
    );
    expect(response.status).toBe(403);
    expect(apiClient.admin.stores.list).not.toHaveBeenCalled();
    expect(apiClient.admin.paymentProviders.create).not.toHaveBeenCalled();
  });

  it("creates a provider with CSRF and forwards the server-side store + token", async () => {
    apiClient.admin.paymentProviders.create.mockResolvedValue(MASKED_CONFIG);
    const { POST } = await import("../app/api/payment-providers/route.js");
    const body = { provider: "MOCK", displayName: "Mock TEST", supportedMethods: ["CARD"], supportedCurrencies: ["TRY"] };
    const response = await POST(
      request("/api/payment-providers", jsonInit("POST", SESSION + CSRF_COOKIE, body, true)),
    );
    expect(response.status).toBe(201);
    expect(apiClient.admin.paymentProviders.create).toHaveBeenCalledWith("store-1", body, "platform-token");
  });

  it("rejects a status toggle without CSRF", async () => {
    const { POST } = await import("../app/api/payment-providers/[configId]/status/route.js");
    const response = await POST(
      request("/api/payment-providers/ppc_1/status", jsonInit("POST", SESSION, { status: "DISABLED" })),
      { params: Promise.resolve({ configId: "ppc_1" }) },
    );
    expect(response.status).toBe(403);
    expect(apiClient.admin.paymentProviders.setStatus).not.toHaveBeenCalled();
  });

  it("ignores a client-supplied storeId and uses the server context for test-connection", async () => {
    apiClient.admin.paymentProviders.testConnection.mockResolvedValue({
      ok: true,
      message: "ok",
      testedAt: "2026-01-01T00:00:00.000Z",
    });
    const { POST } = await import("../app/api/payment-providers/[configId]/test-connection/route.js");
    const response = await POST(
      request("/api/payment-providers/ppc_1/test-connection?storeId=attacker", jsonInit("POST", SESSION + CSRF_COOKIE, undefined, true)),
      { params: Promise.resolve({ configId: "ppc_1" }) },
    );
    expect(response.status).toBe(200);
    expect(apiClient.admin.paymentProviders.testConnection).toHaveBeenCalledWith("store-1", "ppc_1", "platform-token");
  });
});
