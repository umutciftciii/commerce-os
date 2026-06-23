import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiClient = {
  auth: {
    platformLogout: vi.fn(),
  },
  admin: {
    stores: {
      list: vi.fn(),
      create: vi.fn(),
    },
  },
  internal: {
    dbHealth: vi.fn(),
    redisHealth: vi.fn(),
  },
};

vi.mock("@commerce-os/api-client", () => ({
  ApiError: class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
  createApiClient: () => apiClient,
}));

function request(path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(`http://localhost${path}`, init);
}

function sessionCookie(extra = "") {
  return `commerce_os_admin_session=session-token${extra}`;
}

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.INTERNAL_API_TOKEN;
});

describe("admin-web BFF CSRF", () => {
  it("does not require CSRF for GET store list requests", async () => {
    apiClient.admin.stores.list.mockResolvedValue({
      data: [],
      pagination: { limit: 50, offset: 0, total: 0 },
    });
    const { GET } = await import("../app/api/admin/stores/route.js");

    const response = await GET(request("/api/admin/stores", { headers: { cookie: sessionCookie() } }));

    expect(response.status).toBe(200);
    expect(apiClient.admin.stores.list).toHaveBeenCalledWith("session-token");
  });

  it("rejects mutating store requests without CSRF", async () => {
    const { POST } = await import("../app/api/admin/stores/route.js");

    const response = await POST(
      request("/api/admin/stores", {
        method: "POST",
        headers: { cookie: sessionCookie(), "content-type": "application/json" },
        body: JSON.stringify({ name: "Demo", slug: "demo-store", status: "DRAFT" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "CSRF_TOKEN_INVALID" } });
    expect(apiClient.admin.stores.create).not.toHaveBeenCalled();
  });

  it("allows mutating store requests with matching CSRF cookie and header", async () => {
    apiClient.admin.stores.create.mockResolvedValue({
      id: "s1",
      name: "Demo",
      slug: "demo-store",
      domain: null,
      status: "DRAFT",
      metadata: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    });
    const { POST } = await import("../app/api/admin/stores/route.js");

    const response = await POST(
      request("/api/admin/stores", {
        method: "POST",
        headers: {
          cookie: sessionCookie("; commerce_os_admin_csrf=csrf-token"),
          "content-type": "application/json",
          "x-commerce-os-csrf": "csrf-token",
        },
        body: JSON.stringify({ name: "Demo", slug: "demo-store", status: "DRAFT" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(apiClient.admin.stores.create).toHaveBeenCalledWith(
      { name: "Demo", slug: "demo-store", status: "DRAFT" },
      "session-token",
    );
  });

  it("rejects logout without CSRF", async () => {
    const { POST } = await import("../app/api/auth/logout/route.js");

    const response = await POST(
      request("/api/auth/logout", {
        method: "POST",
        headers: { cookie: sessionCookie() },
      }),
    );

    expect(response.status).toBe(403);
    expect(apiClient.auth.platformLogout).not.toHaveBeenCalled();
  });

  it("allows logout with matching CSRF cookie and header", async () => {
    apiClient.auth.platformLogout.mockResolvedValue({ revoked: true });
    const { POST } = await import("../app/api/auth/logout/route.js");

    const response = await POST(
      request("/api/auth/logout", {
        method: "POST",
        headers: {
          cookie: sessionCookie("; commerce_os_admin_csrf=csrf-token"),
          "x-commerce-os-csrf": "csrf-token",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(apiClient.auth.platformLogout).toHaveBeenCalledWith("session-token");
  });
});

describe("admin-web internal health proxy", () => {
  it("returns available:false when the server-side internal token is absent", async () => {
    const { GET } = await import("../app/api/system/internal/route.js");

    const response = await GET(request("/api/system/internal", { headers: { cookie: sessionCookie() } }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false });
    expect(apiClient.internal.dbHealth).not.toHaveBeenCalled();
  });

  it("uses the server-side internal token when present", async () => {
    process.env.INTERNAL_API_TOKEN = "server-only-token";
    apiClient.internal.dbHealth.mockResolvedValue({ status: "ok" });
    apiClient.internal.redisHealth.mockResolvedValue({ status: "degraded" });
    const { GET } = await import("../app/api/system/internal/route.js");

    const response = await GET(request("/api/system/internal", { headers: { cookie: sessionCookie() } }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true, db: "ok", redis: "degraded" });
    expect(apiClient.internal.dbHealth).toHaveBeenCalledWith("server-only-token");
    expect(apiClient.internal.redisHealth).toHaveBeenCalledWith("server-only-token");
  });
});
