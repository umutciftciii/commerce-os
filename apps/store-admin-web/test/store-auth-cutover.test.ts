import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Faz E1 — Store Admin Web / BFF auth cutover BFF-katmanı testleri.
 *
 * Doğrulananlar: BFF login/session/logout/extend GERÇEK StoreUser auth namespace'ini
 * (`storeAuth.*`) kullanır — PlatformUser login/me/logout/extend'e FALLBACK YOK; oturum
 * cookie'si Platform Admin'inkinden ayrıdır; store context yalnız oturumdan gelir (mağaza
 * listeleme / demo-first YOK); yanıtlar ham StoreUser/session id / linkedPlatformUserId
 * SIZDIRMAZ; extend token ROTATE ETMEZ (Faz F); geçersiz oturumda cookie temizlenir.
 *
 * `auth.platform*` BİLİNÇLİ olarak mock'lanmaz: bir fallback regresyonu onu çağırırsa
 * test "not a function" ile PATLAR (silent dual-auth'u yakalar).
 */

const storeAuth = {
  login: vi.fn(),
  logout: vi.fn(),
  session: vi.fn(),
};
const adminStores = { list: vi.fn() };

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
  createApiClient: () => ({ storeAuth, admin: { stores: adminStores } }),
}));

const SESSION = "commerce_os_store_admin_session=store-session-token";
const CSRF = "; commerce_os_store_admin_csrf=csrf-token";

const TIMING = {
  idleExpiresAt: new Date("2026-01-01T00:30:00.000Z").toISOString(),
  absoluteExpiresAt: new Date("2026-01-01T08:00:00.000Z").toISOString(),
  warningLeadSeconds: 300,
  rememberMe: false,
  lastActivityAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
};

const SESSION_RESULT = {
  user: { id: "su-1", storeId: "store-1", email: "owner@demo.local", name: "Owner", role: "MANAGER" },
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
  storeAuth.session.mockResolvedValue(SESSION_RESULT);
});
afterEach(() => vi.clearAllMocks());

describe("Faz E1 — login cutover", () => {
  it("logs in via storeAuth.login (real StoreUser), sets httpOnly store-admin cookie, returns user with store role", async () => {
    storeAuth.login.mockResolvedValue({
      token: "store-session-token",
      expiresAt: new Date("2026-01-01T08:00:00.000Z").toISOString(),
      user: { id: "su-1", storeId: "store-1", email: "owner@demo.local", name: "Owner", role: "OWNER" },
    });
    const { POST } = await import("../app/api/auth/login/route.js");
    const res = await POST(
      request("/api/auth/login", jsonInit("POST", "", { email: "owner@demo.local", password: "pw", rememberMe: true })),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(storeAuth.login).toHaveBeenCalledWith({ email: "owner@demo.local", password: "pw", rememberMe: true });
    // StoreUser role gövdede (UI insan-okunur label'a çevirir); token gövdede DEĞİL.
    expect(body.user.role).toBe("OWNER");
    expect(JSON.stringify(body)).not.toContain("store-session-token");
    const setCookie = res.headers.get("set-cookie") ?? "";
    // Platform Admin cookie'sinden AYRI ad (oturum karışması yok).
    expect(setCookie).toContain("commerce_os_store_admin_session=store-session-token");
    expect(setCookie).not.toContain("commerce_os_admin_session=");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("surfaces gateway 401 on wrong credentials without setting a session cookie", async () => {
    storeAuth.login.mockRejectedValue(new MockApiError(401, "INVALID_CREDENTIALS"));
    const { POST } = await import("../app/api/auth/login/route.js");
    const res = await POST(
      request("/api/auth/login", jsonInit("POST", "", { email: "owner@demo.local", password: "wrong" })),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "INVALID_CREDENTIALS" } });
    // Başarısız login cookie YAZMAZ (token değeri set edilmez).
    expect(res.headers.get("set-cookie") ?? "").not.toContain("store-session-token");
  });

  it("rememberMe defaults to false when omitted", async () => {
    storeAuth.login.mockResolvedValue({
      token: "store-session-token",
      expiresAt: new Date("2026-01-01T08:00:00.000Z").toISOString(),
      user: SESSION_RESULT.user,
    });
    const { POST } = await import("../app/api/auth/login/route.js");
    await POST(request("/api/auth/login", jsonInit("POST", "", { email: "a@b.co", password: "x" })));
    expect(storeAuth.login).toHaveBeenCalledWith({ email: "a@b.co", password: "x", rememberMe: false });
  });
});

describe("Faz E1 — session (me) cutover", () => {
  it("restores the session via storeAuth.session: StoreUser principal + session-derived store + timing", async () => {
    const { GET } = await import("../app/api/auth/me/route.js");
    const res = await GET(request("/api/auth/me", { headers: { cookie: SESSION } }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(storeAuth.session).toHaveBeenCalledWith("store-session-token");
    expect(body.user).toEqual(SESSION_RESULT.user);
    expect(body.store).toEqual(SESSION_RESULT.store); // store context session-derived
    expect(body.session.timing.warningLeadSeconds).toBe(300);
  });

  it("401 without a session cookie (no gateway call)", async () => {
    const { GET } = await import("../app/api/auth/me/route.js");
    const res = await GET(request("/api/auth/me"));
    expect(res.status).toBe(401);
    expect(storeAuth.session).not.toHaveBeenCalled();
  });

  it("clears the session cookie when the gateway reports the session revoked/expired (401)", async () => {
    storeAuth.session.mockRejectedValue(new MockApiError(401, "UNAUTHORIZED"));
    const { GET } = await import("../app/api/auth/me/route.js");
    const res = await GET(request("/api/auth/me", { headers: { cookie: SESSION } }));
    expect(res.status).toBe(401);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("commerce_os_store_admin_session=;");
    expect(setCookie.toLowerCase()).toContain("max-age=0");
  });

  it("does not leak raw internal ids (session id / linkedPlatformUserId) in the me response", async () => {
    const { GET } = await import("../app/api/auth/me/route.js");
    const res = await GET(request("/api/auth/me", { headers: { cookie: SESSION } }));
    const raw = await res.text();
    for (const forbidden of ["linkedPlatformUserId", "sessionId", "tokenHash", "passwordHash"]) {
      expect(raw).not.toContain(forbidden);
    }
  });
});

describe("Faz E1 — logout cutover", () => {
  it("revokes the StoreUser session via storeAuth.logout and clears cookies (CSRF-guarded)", async () => {
    storeAuth.logout.mockResolvedValue({ revoked: true });
    const { POST } = await import("../app/api/auth/logout/route.js");
    const res = await POST(request("/api/auth/logout", jsonInit("POST", SESSION + CSRF, undefined, true)));
    expect(res.status).toBe(200);
    expect(storeAuth.logout).toHaveBeenCalledWith("store-session-token");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("commerce_os_store_admin_session=;");
    expect(setCookie.toLowerCase()).toContain("max-age=0");
  });

  it("rejects logout without a CSRF token (no gateway revoke)", async () => {
    const { POST } = await import("../app/api/auth/logout/route.js");
    const res = await POST(request("/api/auth/logout", jsonInit("POST", SESSION)));
    expect(res.status).toBe(403);
    expect(storeAuth.logout).not.toHaveBeenCalled();
  });
});

describe("Faz E1 — extend (soft reconcile; token rotation deferred to Faz F)", () => {
  it("returns server-authoritative timing from storeAuth.session and does NOT rotate the cookie", async () => {
    const { POST } = await import("../app/api/auth/extend/route.js");
    const res = await POST(request("/api/auth/extend", jsonInit("POST", SESSION + CSRF, undefined, true)));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(storeAuth.session).toHaveBeenCalledWith("store-session-token");
    expect(body.timing.warningLeadSeconds).toBe(300);
    // Rotation YOK → oturum cookie'si yeniden yazılmaz (Set-Cookie'de token yok).
    expect(res.headers.get("set-cookie") ?? "").not.toContain("commerce_os_store_admin_session=store-session-token");
  });

  it("rejects extend without a CSRF token", async () => {
    const { POST } = await import("../app/api/auth/extend/route.js");
    const res = await POST(request("/api/auth/extend", jsonInit("POST", SESSION)));
    expect(res.status).toBe(403);
    expect(storeAuth.session).not.toHaveBeenCalled();
  });
});

describe("Faz E1 — store context is session-derived (no first/demo-store fallback)", () => {
  it("derives the active store from the session; never lists stores", async () => {
    const { GET } = await import("../app/api/store/context/route.js");
    const res = await GET(request("/api/store/context", { headers: { cookie: SESSION } }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ store: { id: "store-1", name: "Demo Store", slug: "demo-store", status: "ACTIVE" } });
    expect(storeAuth.session).toHaveBeenCalledWith("store-session-token");
    expect(adminStores.list).not.toHaveBeenCalled(); // demo/first-store fallback removed
  });
});
