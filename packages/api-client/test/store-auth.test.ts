import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/index.js";

/** Tek cagriyi kaydeden, verilen yaniti donduren basit fetch sahtesi (bkz. api-client.test.ts). */
function stubFetch(response: { ok: boolean; status: number; json: () => Promise<unknown> }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return response;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("storeAuth namespace (Task B4)", () => {
  it("is a distinct namespace from `auth`", () => {
    const client = createApiClient({ baseUrl: "http://localhost:4000" });
    expect(typeof client.storeAuth.login).toBe("function");
    expect(typeof client.storeAuth.logout).toBe("function");
    expect(typeof client.storeAuth.session).toBe("function");
    expect((client.auth as Record<string, unknown>).login).toBeUndefined();
    expect((client.auth as Record<string, unknown>).session).toBeUndefined();
    expect((client.auth as Record<string, unknown>).storeAuth).toBeUndefined();
  });

  it("login() posts to /auth/store/login with the tenant header and a body free of storeSlug/storeId", async () => {
    const loginResponse = {
      token: "raw-store-token",
      expiresAt: new Date(Date.now() + 1000).toISOString(),
      user: {
        id: "u1",
        storeId: "store_1",
        email: "owner@acme.test",
        name: "Owner",
        role: "OWNER",
      },
    };
    const { calls, fetchImpl } = stubFetch({ ok: true, status: 200, json: async () => loginResponse });
    const client = createApiClient({ baseUrl: "http://localhost:4000", fetch: fetchImpl });

    const input = { email: "owner@acme.test", password: "secret", rememberMe: false };
    const result = await client.storeAuth.login(input, "acme");

    expect(calls[0]?.url).toBe("http://localhost:4000/auth/store/login");
    expect(calls[0]?.init?.method).toBe("POST");

    const headers = calls[0]?.init?.headers as Headers;
    expect(headers.get("x-store-admin-tenant")).toBe("acme");
    expect(headers.get("content-type")).toBe("application/json");

    const sentBody = JSON.parse(calls[0]?.init?.body as string);
    expect(sentBody).toEqual(input);
    expect(sentBody.storeSlug).toBeUndefined();
    expect(sentBody.storeId).toBeUndefined();

    expect(result).toEqual(loginResponse);
  });

  it("session() sends a bearer token to GET /auth/store/session", async () => {
    const sessionResponse = {
      user: {
        id: "u1",
        storeId: "store_1",
        email: "owner@acme.test",
        name: "Owner",
        role: "OWNER",
      },
      session: { timing: { idleTimeoutSeconds: 900, absoluteTimeoutSeconds: 28800 } },
    };
    const { calls, fetchImpl } = stubFetch({ ok: true, status: 200, json: async () => sessionResponse });
    const client = createApiClient({ baseUrl: "http://localhost:4000", fetch: fetchImpl });

    const result = await client.storeAuth.session("tok");

    expect(calls[0]?.url).toBe("http://localhost:4000/auth/store/session");
    expect(calls[0]?.init?.method).toBeUndefined();
    expect((calls[0]?.init?.headers as Headers).get("authorization")).toBe("Bearer tok");
    expect(result).toEqual(sessionResponse);
  });

  it("logout() sends a bearer token to POST /auth/store/logout", async () => {
    const logoutResponse = { revoked: true };
    const { calls, fetchImpl } = stubFetch({ ok: true, status: 200, json: async () => logoutResponse });
    const client = createApiClient({ baseUrl: "http://localhost:4000", fetch: fetchImpl });

    const result = await client.storeAuth.logout("tok");

    expect(calls[0]?.url).toBe("http://localhost:4000/auth/store/logout");
    expect(calls[0]?.init?.method).toBe("POST");
    expect((calls[0]?.init?.headers as Headers).get("authorization")).toBe("Bearer tok");
    expect(result).toEqual(logoutResponse);
  });
});
