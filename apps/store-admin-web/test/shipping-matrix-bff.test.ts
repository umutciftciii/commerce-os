/**
 * F3C.4 — Store-admin BFF: tarife matrisi + CSV import uçları. Store/token
 * server context'ten gelir (client storeId yok sayılır), CSRF zorunlu.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MATRIX_COPY } from "../app/(app)/shipping/rates/MatrixManager";

const apiClient = {
  admin: {
    stores: { list: vi.fn() },
    shippingRatePlans: {
      matrixPreview: vi.fn(),
      matrixApply: vi.fn(),
      importPreview: vi.fn(),
      importApply: vi.fn(),
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

const SUMMARY = { create: 2, update: 0, unchanged: 0, empty: 1 };

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

const MATRIX_BODY = {
  mode: "SEGMENT",
  axis: "DESI",
  columns: ["tier_1"],
  rows: [{ min: 0, max: 0, overflowBehavior: "PER_ADDITIONAL", cells: [{ columnId: "tier_1", amountMinor: 11699 }] }],
};

describe("store-admin BFF — shipping matrix / import (F3C.4)", () => {
  it("matrix/preview rejects without a CSRF token before any upstream call", async () => {
    const { POST } = await import("../app/api/shipping/rate-plans/[id]/matrix/preview/route.js");
    const response = await POST(
      request("/api/shipping/rate-plans/rp_1/matrix/preview", jsonInit("POST", SESSION, MATRIX_BODY)),
      { params: Promise.resolve({ id: "rp_1" }) },
    );
    expect(response.status).toBe(403);
    expect(apiClient.admin.shippingRatePlans.matrixPreview).not.toHaveBeenCalled();
  });

  it("matrix/apply ignores a client-supplied storeId and uses server context", async () => {
    apiClient.admin.shippingRatePlans.matrixApply.mockResolvedValue({ summary: SUMMARY, plan: { id: "rp_1" } });
    const { POST } = await import("../app/api/shipping/rate-plans/[id]/matrix/apply/route.js");
    const response = await POST(
      request("/api/shipping/rate-plans/rp_1/matrix/apply?storeId=attacker", jsonInit("POST", SESSION + CSRF_COOKIE, MATRIX_BODY, true)),
      { params: Promise.resolve({ id: "rp_1" }) },
    );
    const raw = await response.text();
    expect(response.status).toBe(200);
    expect(apiClient.admin.shippingRatePlans.matrixApply).toHaveBeenCalledWith("store-1", "rp_1", MATRIX_BODY, "platform-token");
    expect(raw).not.toContain("platform-token");
  });

  it("import/preview forwards CSV to the resolved store and never leaks the token", async () => {
    apiClient.admin.shippingRatePlans.importPreview.mockResolvedValue({ valid: true, rowCount: 1, summary: SUMMARY, cells: [], errors: [] });
    const body = { mode: "SEGMENT", axis: "DESI", csv: "desi_min;desi_max;Tarife I\n0;0;116,99" };
    const { POST } = await import("../app/api/shipping/rate-plans/[id]/import/preview/route.js");
    const response = await POST(
      request("/api/shipping/rate-plans/rp_1/import/preview", jsonInit("POST", SESSION + CSRF_COOKIE, body, true)),
      { params: Promise.resolve({ id: "rp_1" }) },
    );
    const raw = await response.text();
    expect(response.status).toBe(200);
    expect(apiClient.admin.shippingRatePlans.importPreview).toHaveBeenCalledWith("store-1", "rp_1", body, "platform-token");
    expect(raw).not.toContain("platform-token");
  });

  it("import/apply requires a session cookie (CSRF passes, session missing => 401)", async () => {
    const { POST } = await import("../app/api/shipping/rate-plans/[id]/import/apply/route.js");
    const response = await POST(
      request(
        "/api/shipping/rate-plans/rp_1/import/apply",
        jsonInit("POST", "commerce_os_store_admin_csrf=csrf-token", { mode: "SEGMENT", axis: "DESI", csv: "x" }, true),
      ),
      { params: Promise.resolve({ id: "rp_1" }) },
    );
    expect(response.status).toBe(401);
    expect(apiClient.admin.shippingRatePlans.importApply).not.toHaveBeenCalled();
  });
});

describe("MatrixManager i18n — TR/EN parity (F3C.4)", () => {
  it("tr ve en kopya anahtarları birebir eşit", () => {
    expect(Object.keys(MATRIX_COPY.tr).sort()).toEqual(Object.keys(MATRIX_COPY.en).sort());
  });
});
