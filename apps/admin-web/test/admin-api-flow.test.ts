import { afterEach, describe, expect, it, vi } from "vitest";
import { adminApi, UiError } from "../lib/client/api.js";
import { messageForCode, messageForError } from "../lib/client/messages.js";

/** Ayni-origin BFF cagrilarini kaydeden global fetch sahtesi. */
function mockFetch(response: { ok: boolean; status: number; body: unknown }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.body,
    } as Response;
  });
  vi.stubGlobal("fetch", impl);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("adminApi auth flow", () => {
  it("logs in via the BFF and returns only the user (token stays server-side)", async () => {
    const calls = mockFetch({ ok: true, status: 200, body: { user: { id: "u1", email: "a@b.co", name: "A", role: "SUPER_ADMIN" } } });
    const result = await adminApi.login("a@b.co", "pw");

    expect(result.user.email).toBe("a@b.co");
    expect(calls[0]?.url).toBe("/api/auth/login");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ email: "a@b.co", password: "pw" }));
    // Token istemci yanit govdesinde yer almaz.
    expect(JSON.stringify(result)).not.toContain("token");
  });

  it("verifies the session via /api/auth/me and signs out via /api/auth/logout", async () => {
    const meCalls = mockFetch({
      ok: true,
      status: 200,
      body: { user: { id: "u1", email: "a@b.co", name: "A", role: "SUPER_ADMIN" }, session: { id: "s1", expiresAt: new Date().toISOString() } },
    });
    const me = await adminApi.me();
    expect(me.user.id).toBe("u1");
    expect(meCalls[0]?.url).toBe("/api/auth/me");

    const outCalls = mockFetch({ ok: true, status: 200, body: { ok: true } });
    await adminApi.logout();
    expect(outCalls[0]?.url).toBe("/api/auth/logout");
    expect(outCalls[0]?.init?.method).toBe("POST");
  });
});

describe("adminApi stores + plans flow", () => {
  it("lists and creates stores against the BFF endpoints", async () => {
    const listCalls = mockFetch({ ok: true, status: 200, body: { data: [], pagination: { limit: 50, offset: 0, total: 0 } } });
    const list = await adminApi.listStores();
    expect(list.pagination.total).toBe(0);
    expect(listCalls[0]?.url).toBe("/api/admin/stores");

    const createCalls = mockFetch({
      ok: true,
      status: 201,
      body: { id: "s1", name: "Demo", slug: "demo", status: "DRAFT", metadata: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    });
    const store = await adminApi.createStore({ name: "Demo", slug: "demo", status: "DRAFT" });
    expect(store.slug).toBe("demo");
    expect(createCalls[0]?.init?.method).toBe("POST");
    expect(createCalls[0]?.url).toBe("/api/admin/stores");
  });

  it("lists and creates plans against the BFF endpoints", async () => {
    const listCalls = mockFetch({ ok: true, status: 200, body: { data: [], pagination: { limit: 50, offset: 0, total: 0 } } });
    await adminApi.listPlans();
    expect(listCalls[0]?.url).toBe("/api/admin/plans");

    const createCalls = mockFetch({
      ok: true,
      status: 201,
      body: { id: "p1", code: "starter", name: "Starter", description: null, metadata: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    });
    const plan = await adminApi.createPlan({ code: "starter", name: "Starter" });
    expect(plan.code).toBe("starter");
    expect(createCalls[0]?.url).toBe("/api/admin/plans");
  });
});

describe("adminApi error handling", () => {
  it("throws a UiError carrying the gateway error code", async () => {
    mockFetch({ ok: false, status: 409, body: { error: { code: "STORE_SLUG_EXISTS" } } });
    const error = await adminApi.createStore({ name: "Demo", slug: "demo", status: "DRAFT" }).catch((caught) => caught);
    expect(error).toBeInstanceOf(UiError);
    expect((error as UiError).code).toBe("STORE_SLUG_EXISTS");
  });

  it("maps network failures to a NETWORK UiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    const error = await adminApi.me().catch((caught) => caught);
    expect(error).toBeInstanceOf(UiError);
    expect((error as UiError).code).toBe("NETWORK");
  });
});

describe("error message mapping (Turkish, default locale)", () => {
  it("maps known codes to user-friendly Turkish copy", () => {
    expect(messageForCode("INVALID_CREDENTIALS")).toBe("E-posta veya parola hatalı.");
    expect(messageForCode("STORE_SLUG_EXISTS")).toBe("Bu kısa ad (slug) zaten kullanılıyor.");
    expect(messageForCode("PLAN_CODE_EXISTS")).toBe("Bu paket kodu zaten kullanılıyor.");
  });

  it("falls back to the generic Turkish message for unknown codes", () => {
    expect(messageForCode("SOMETHING_NEW")).toBe("Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");
  });

  it("derives a Turkish message from a thrown UiError", () => {
    expect(messageForError(new UiError("FORBIDDEN"))).toBe("Bu işlem için yetkiniz yok.");
    expect(messageForError(new Error("boom"))).toBe("Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");
  });
});
