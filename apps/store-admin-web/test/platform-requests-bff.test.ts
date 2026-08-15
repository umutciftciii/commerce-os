// TODO-178 (Faz D) — Platform Talepleri BFF güvenlik + proxy testleri. Kapsam: auth/store guard,
// CSRF (mutasyon upstream'den ÖNCE reddedilir), query allowlist mapping, storeId server-context
// otoritesi (client storeId ENJEKTE EDEMEZ), INTERNAL içerik BFF transformunda yeniden EKLENMEZ.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiClient = {
  storeAuth: { login: vi.fn(), logout: vi.fn(), session: vi.fn() },
  admin: { stores: { list: vi.fn() } },
  platformRequests: {
    store: {
      list: vi.fn(),
      create: vi.fn(),
      get: vi.fn(),
      reply: vi.fn(),
      withdraw: vi.fn(),
      confirmClose: vi.fn(),
      reopen: vi.fn(),
      categories: vi.fn(),
      uploadAttachment: vi.fn(),
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

function request(path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(`http://localhost${path}`, init);
}
function jsonInit(method: string, cookie: string, body?: unknown, csrf = false) {
  const headers: Record<string, string> = { cookie, "content-type": "application/json" };
  if (csrf) headers["x-commerce-os-csrf"] = "csrf-token";
  return { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };
}

beforeEach(() => {
  // Faz E1 — store context oturumdan gelir (storeAuth.session); admin.stores.list KULLANILMAZ.
  apiClient.storeAuth.session.mockResolvedValue({
    user: { id: "su-1", storeId: "store-1", email: "owner@demo.local", name: "Owner", role: "OWNER" },
    store: { id: "store-1", slug: "demo-store", name: "Demo Store", status: "ACTIVE" },
    session: {
      timing: {
        idleExpiresAt: new Date("2026-01-01T00:30:00.000Z").toISOString(),
        absoluteExpiresAt: new Date("2026-01-01T08:00:00.000Z").toISOString(),
        warningLeadSeconds: 300,
        rememberMe: false,
        lastActivityAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      },
    },
  });
  apiClient.admin.stores.list.mockResolvedValue({
    data: [DEMO_STORE],
    pagination: { limit: 50, offset: 0, total: 1 },
  });
});
afterEach(() => vi.clearAllMocks());

describe("platform-requests BFF — auth + store guards", () => {
  it("list rejects reads without a session cookie (401, no upstream call)", async () => {
    const { GET } = await import("../app/api/platform-requests/route.js");
    const response = await GET(request("/api/platform-requests"));
    expect(response.status).toBe(401);
    expect(apiClient.platformRequests.store.list).not.toHaveBeenCalled();
  });

  it("rejects (401) when the session token is invalid/expired — store is session-derived, never listed", async () => {
    // Faz E1 — store context oturumdan gelir; geçersiz token'da gateway /auth/store/session
    // 401 → BFF 401. NO_STORE/first-store fallback yolu YOK.
    apiClient.storeAuth.session.mockRejectedValue(new MockApiError(401, "UNAUTHORIZED"));
    const { GET } = await import("../app/api/platform-requests/route.js");
    const response = await GET(request("/api/platform-requests", { headers: { cookie: SESSION } }));
    expect(response.status).toBe(401);
    expect(apiClient.admin.stores.list).not.toHaveBeenCalled();
    expect(apiClient.platformRequests.store.list).not.toHaveBeenCalled();
  });
});

describe("platform-requests BFF — list proxy + query allowlist", () => {
  it("lists for the resolved store with the server-side token and only allow-listed query keys", async () => {
    apiClient.platformRequests.store.list.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    const { GET } = await import("../app/api/platform-requests/route.js");
    // storeId enjeksiyonu + bilinmeyen anahtar (foo) taşınmamalı; bilinenler taşınmalı.
    const response = await GET(
      request(
        "/api/platform-requests?status=OPEN&categoryKey=PLATFORM_POLICY&slaRisk=true&search=abc&page=2&pageSize=10&foo=bar&storeId=evil",
        { headers: { cookie: SESSION } },
      ),
    );
    expect(response.status).toBe(200);
    expect(apiClient.platformRequests.store.list).toHaveBeenCalledWith(
      "store-1",
      {
        status: "OPEN",
        categoryKey: "PLATFORM_POLICY",
        slaRisk: "true",
        search: "abc",
        page: "2",
        pageSize: "10",
      },
      "platform-token",
    );
    // Çağrının storeId'si her zaman server-context'ten ("store-1"); client "evil" enjekte edemez.
    const passedQuery = apiClient.platformRequests.store.list.mock.calls[0][1];
    expect(passedQuery).not.toHaveProperty("storeId");
    expect(passedQuery).not.toHaveProperty("foo");
  });

  it("passes an empty query object when none supplied (gateway defaults apply)", async () => {
    apiClient.platformRequests.store.list.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    const { GET } = await import("../app/api/platform-requests/route.js");
    await GET(request("/api/platform-requests", { headers: { cookie: SESSION } }));
    expect(apiClient.platformRequests.store.list).toHaveBeenCalledWith("store-1", {}, "platform-token");
  });
});

describe("platform-requests BFF — create (CSRF-guarded)", () => {
  it("rejects create without a CSRF token before any upstream call (403)", async () => {
    const { POST } = await import("../app/api/platform-requests/route.js");
    const response = await POST(
      request("/api/platform-requests", jsonInit("POST", SESSION, { subject: "X", description: "Y", categoryKey: "K" })),
    );
    expect(response.status).toBe(403);
    expect(apiClient.platformRequests.store.create).not.toHaveBeenCalled();
    expect(apiClient.admin.stores.list).not.toHaveBeenCalled();
  });

  it("creates with a valid CSRF token and returns 201", async () => {
    apiClient.platformRequests.store.create.mockResolvedValue({ request: { requestNumber: "PR-000001" } });
    const { POST } = await import("../app/api/platform-requests/route.js");
    const response = await POST(
      request(
        "/api/platform-requests",
        jsonInit("POST", SESSION + CSRF_COOKIE, { subject: "Konu", description: "Açıklama", categoryKey: "PLATFORM_POLICY" }, true),
      ),
    );
    expect(response.status).toBe(201);
    expect(apiClient.platformRequests.store.create).toHaveBeenCalledWith(
      "store-1",
      { subject: "Konu", description: "Açıklama", categoryKey: "PLATFORM_POLICY" },
      "platform-token",
    );
  });
});

describe("platform-requests BFF — detail + actions", () => {
  it("detail is store-scoped and never surfaces the bearer token (passthrough, no transform)", async () => {
    // INTERNAL içerik zaten gateway store DTO'sunda yoktur; BFF hiçbir şey EKLEMEZ (birebir passthrough).
    const gatewayDto = { request: { id: "r1", requestNumber: "PR-000001", subject: "Konu", messages: [] } };
    apiClient.platformRequests.store.get.mockResolvedValue(gatewayDto);
    const { GET } = await import("../app/api/platform-requests/[id]/route.js");
    const response = await GET(request("/api/platform-requests/r1", { headers: { cookie: SESSION } }), {
      params: Promise.resolve({ id: "r1" }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual(gatewayDto);
    expect(JSON.stringify(body)).not.toContain("platform-token");
    expect(apiClient.platformRequests.store.get).toHaveBeenCalledWith("store-1", "r1", "platform-token");
  });

  it("reply rejects without a CSRF token (403)", async () => {
    const { POST } = await import("../app/api/platform-requests/[id]/messages/route.js");
    const response = await POST(
      request("/api/platform-requests/r1/messages", jsonInit("POST", SESSION, { body: "Merhaba" })),
      { params: Promise.resolve({ id: "r1" }) },
    );
    expect(response.status).toBe(403);
    expect(apiClient.platformRequests.store.reply).not.toHaveBeenCalled();
  });

  it("dispatches a versioned withdraw action to the right upstream method", async () => {
    apiClient.platformRequests.store.withdraw.mockResolvedValue({ request: { id: "r1" } });
    const { POST } = await import("../app/api/platform-requests/[id]/actions/route.js");
    const response = await POST(
      request("/api/platform-requests/r1/actions", jsonInit("POST", SESSION + CSRF_COOKIE, { action: "withdraw", expectedVersion: 3 }, true)),
      { params: Promise.resolve({ id: "r1" }) },
    );
    expect(response.status).toBe(200);
    expect(apiClient.platformRequests.store.withdraw).toHaveBeenCalledWith("store-1", "r1", { expectedVersion: 3 }, "platform-token");
    expect(apiClient.platformRequests.store.confirmClose).not.toHaveBeenCalled();
    expect(apiClient.platformRequests.store.reopen).not.toHaveBeenCalled();
  });

  it("rejects an unknown action (400) without any upstream call", async () => {
    const { POST } = await import("../app/api/platform-requests/[id]/actions/route.js");
    const response = await POST(
      request("/api/platform-requests/r1/actions", jsonInit("POST", SESSION + CSRF_COOKIE, { action: "assign", expectedVersion: 1 }, true)),
      { params: Promise.resolve({ id: "r1" }) },
    );
    expect(response.status).toBe(400);
    expect(apiClient.platformRequests.store.withdraw).not.toHaveBeenCalled();
  });

  it("rejects an action missing expectedVersion (400)", async () => {
    const { POST } = await import("../app/api/platform-requests/[id]/actions/route.js");
    const response = await POST(
      request("/api/platform-requests/r1/actions", jsonInit("POST", SESSION + CSRF_COOKIE, { action: "withdraw" }, true)),
      { params: Promise.resolve({ id: "r1" }) },
    );
    expect(response.status).toBe(400);
    expect(apiClient.platformRequests.store.withdraw).not.toHaveBeenCalled();
  });
});

describe("platform-requests BFF — attachment upload (CSRF-guarded; file passthrough)", () => {
  function reqForm(path: string, form: FormData, cookie: string, csrf = false) {
    const headers: Record<string, string> = { cookie };
    if (csrf) headers["x-commerce-os-csrf"] = "csrf-token";
    return new NextRequest(`http://localhost${path}`, { method: "POST", headers, body: form });
  }

  it("rejects upload without a CSRF token before any upstream call (403)", async () => {
    const { POST } = await import("../app/api/platform-requests/[id]/attachments/route.js");
    const form = new FormData();
    form.append("file", new File(["x"], "p.png", { type: "image/png" }));
    const res = await POST(reqForm("/api/platform-requests/r1/attachments", form, SESSION), {
      params: Promise.resolve({ id: "r1" }),
    });
    expect(res.status).toBe(403);
    expect(apiClient.platformRequests.store.uploadAttachment).not.toHaveBeenCalled();
  });

  it("with CSRF proxies ONLY the file to gateway (visibility STORE_VISIBLE forced server-side)", async () => {
    apiClient.platformRequests.store.uploadAttachment.mockResolvedValue({
      attachment: { id: "att-1", type: "PHOTO", createdAt: "2026-08-10T00:00:00.000Z" },
    });
    const { POST } = await import("../app/api/platform-requests/[id]/attachments/route.js");
    const form = new FormData();
    form.append("file", new File(["x"], "p.png", { type: "image/png" }));
    // Client visibility/storageKey enjekte etmeye çalışsa bile BFF yalnız file'ı taşır.
    form.append("visibility", "INTERNAL");
    form.append("storageKey", "stores/evil/hack.webp");
    const res = await POST(reqForm("/api/platform-requests/r1/attachments", form, SESSION + CSRF_COOKIE, true), {
      params: Promise.resolve({ id: "r1" }),
    });
    expect(res.status).toBe(201);
    const [storeId, requestId, sentForm] = apiClient.platformRequests.store.uploadAttachment.mock.calls[0];
    expect(storeId).toBe("store-1");
    expect(requestId).toBe("r1");
    // BFF gateway'e YALNIZ file gönderir; visibility/storageKey taşınmaz.
    expect(sentForm.get("file")).toBeInstanceOf(File);
    expect(sentForm.get("visibility")).toBeNull();
    expect(sentForm.get("storageKey")).toBeNull();
  });
});

describe("platform-requests BFF — categories proxy", () => {
  it("lists active categories for the resolved store with the server token", async () => {
    apiClient.platformRequests.store.categories.mockResolvedValue({ items: [] });
    const { GET } = await import("../app/api/platform-request-categories/route.js");
    const response = await GET(request("/api/platform-request-categories", { headers: { cookie: SESSION } }));
    expect(response.status).toBe(200);
    expect(apiClient.platformRequests.store.categories).toHaveBeenCalledWith("store-1", "platform-token");
  });
});
