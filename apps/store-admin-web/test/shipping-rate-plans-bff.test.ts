import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiClient = {
  admin: {
    stores: { list: vi.fn() },
    shippingRatePlans: {
      list: vi.fn(),
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      setDefault: vi.fn(),
      addRule: vi.fn(),
      updateRule: vi.fn(),
      deleteRule: vi.fn(),
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

const PLAN = {
  id: "rp_1",
  provider: null,
  name: "Standart Kargo",
  status: "ACTIVE",
  isDefault: true,
  pricingMode: "FREE_THRESHOLD",
  currency: "TRY",
  fixedAmountMinor: 4990,
  freeShippingThresholdMinor: 75000,
  deliveryEstimate: null,
  validFrom: null,
  validTo: null,
  ruleCount: 0,
  rules: [],
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

describe("store-admin BFF — shipping rate plans (F3C.2)", () => {
  it("rejects the list without a session cookie", async () => {
    const { GET } = await import("../app/api/shipping/rate-plans/route.js");
    const response = await GET(request("/api/shipping/rate-plans"));
    expect(response.status).toBe(401);
    expect(apiClient.admin.shippingRatePlans.list).not.toHaveBeenCalled();
  });

  it("lists rate plans for the resolved store and never leaks the bearer token", async () => {
    apiClient.admin.shippingRatePlans.list.mockResolvedValue({ data: [PLAN] });
    const { GET } = await import("../app/api/shipping/rate-plans/route.js");
    const response = await GET(request("/api/shipping/rate-plans", { headers: { cookie: SESSION } }));
    const raw = await response.text();
    expect(response.status).toBe(200);
    expect(apiClient.admin.shippingRatePlans.list).toHaveBeenCalledWith("store-1", "platform-token");
    expect(raw).not.toContain("platform-token");
    expect(raw).toContain("Standart Kargo");
  });

  it("rejects a create without a CSRF token before any upstream call", async () => {
    const { POST } = await import("../app/api/shipping/rate-plans/route.js");
    const response = await POST(
      request("/api/shipping/rate-plans", jsonInit("POST", SESSION, { name: "X", pricingMode: "FIXED" })),
    );
    expect(response.status).toBe(403);
    expect(apiClient.admin.shippingRatePlans.create).not.toHaveBeenCalled();
  });

  it("creates a fixed plan with CSRF and forwards the server-side store + token", async () => {
    apiClient.admin.shippingRatePlans.create.mockResolvedValue(PLAN);
    const { POST } = await import("../app/api/shipping/rate-plans/route.js");
    const body = { name: "Standart Kargo", pricingMode: "FIXED", currency: "TRY", fixedAmountMinor: 4990 };
    const response = await POST(
      request("/api/shipping/rate-plans", jsonInit("POST", SESSION + CSRF_COOKIE, body, true)),
    );
    expect(response.status).toBe(201);
    expect(apiClient.admin.shippingRatePlans.create).toHaveBeenCalledWith("store-1", body, "platform-token");
  });

  it("ignores a client-supplied storeId and uses server context for set-default", async () => {
    apiClient.admin.shippingRatePlans.setDefault.mockResolvedValue(PLAN);
    const { POST } = await import("../app/api/shipping/rate-plans/[id]/default/route.js");
    const response = await POST(
      request("/api/shipping/rate-plans/rp_1/default?storeId=attacker", jsonInit("POST", SESSION + CSRF_COOKIE, undefined, true)),
      { params: Promise.resolve({ id: "rp_1" }) },
    );
    expect(response.status).toBe(200);
    expect(apiClient.admin.shippingRatePlans.setDefault).toHaveBeenCalledWith("store-1", "rp_1", "platform-token");
  });

  it("adds a rule with CSRF and forwards to the resolved store", async () => {
    apiClient.admin.shippingRatePlans.addRule.mockResolvedValue(PLAN);
    const { POST } = await import("../app/api/shipping/rate-plans/[id]/rules/route.js");
    const body = { minDesi: 0, maxDesi: 5, amountMinor: 3000, sortOrder: 0 };
    const response = await POST(
      request("/api/shipping/rate-plans/rp_1/rules", jsonInit("POST", SESSION + CSRF_COOKIE, body, true)),
      { params: Promise.resolve({ id: "rp_1" }) },
    );
    expect(response.status).toBe(201);
    expect(apiClient.admin.shippingRatePlans.addRule).toHaveBeenCalledWith("store-1", "rp_1", body, "platform-token");
  });

  it("rejects a rule add without CSRF (no upstream call)", async () => {
    const { POST } = await import("../app/api/shipping/rate-plans/[id]/rules/route.js");
    const response = await POST(
      request("/api/shipping/rate-plans/rp_1/rules", jsonInit("POST", SESSION, { amountMinor: 1 })),
      { params: Promise.resolve({ id: "rp_1" }) },
    );
    expect(response.status).toBe(403);
    expect(apiClient.admin.shippingRatePlans.addRule).not.toHaveBeenCalled();
  });
});
