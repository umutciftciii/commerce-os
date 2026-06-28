import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TODO-089 — Storefront RSC cookie serialization sentinel.
 *
 * Raw müşteri oturum jetonu (httpOnly `commerce_os_customer_session`) YALNIZCA
 * sunucuda okunur ve gateway'e `x-customer-session` header'ı ile iletilir. Bu
 * test sınır ihlalini (boundary regression) yakalar: jeton hiçbir zaman
 *  - server-rendered HTML / RSC payload'a,
 *  - Server Action dönüş değerine (action result RSC ile client'a serialize olur),
 *  - customer view model'ine
 * girmemeli. Aşağıda jeton bilerek SENTINEL değeri ile cookie'ye konur; render
 * ve action sonuçlarında bu değer ASLA görünmemeli, ama gateway fetch header'ında
 * görünmeli (jeton'un gerçekten sunucu-yanlı kullanıldığının kanıtı).
 */

const SESSION_SENTINEL = "SENTINEL_RAW_SESSION_TOKEN_dad9f1c4e7b24";

// httpOnly oturum cookie'si + locale (varsayılan TR). set/delete no-op.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "commerce_os_customer_session" ? { value: SESSION_SENTINEL } : undefined,
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const redirectError = new Error("NEXT_REDIRECT");
const notFoundError = new Error("NEXT_NOT_FOUND");
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(redirectError, { url });
  },
  notFound: () => {
    throw notFoundError;
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

type FetchCall = { url: string; sessionHeader: string | null };
const fetchCalls: FetchCall[] = [];

// Gateway server-to-server fetch'i: yanıt gövdeleri path'e göre. Her çağrıda
// x-customer-session header'ı kaydedilir (jeton'un server-side kullanım kanıtı).
function installFetchMock(): void {
  fetchCalls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);
      fetchCalls.push({ url, sessionHeader: headers.get("x-customer-session") });

      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });

      if (url.endsWith("/customer/me")) {
        return json({
          customer: {
            id: "cus_1",
            email: "ada@example.com",
            phone: "+905551112233",
            firstName: "Ada",
            lastName: "Yılmaz",
            birthDate: null,
            gender: null,
            emailVerified: true,
            phoneVerified: true,
            status: "ACTIVE",
          },
          session: { expiresAt: "2099-01-01T00:00:00.000Z" },
        });
      }
      if (url.endsWith("/customer/orders")) return json({ data: [] });
      if (url.endsWith("/customer/addresses")) return json({ data: [] });
      if (url.endsWith("/customer/ibans")) return json({ data: [] });
      if (url.endsWith("/customer/communication-preferences")) {
        return json({ smsEnabled: false, emailEnabled: true, phoneEnabled: false });
      }
      if (url.endsWith("/customer/login")) {
        return json({ token: SESSION_SENTINEL, customer: { id: "cus_1" } });
      }
      return json({});
    }),
  );
}

beforeEach(() => {
  installFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TODO-089 storefront customer session boundary", () => {
  it("does not serialize the raw session token into any rendered account section", async () => {
    const { default: AccountPage } = await import("../app/account/page.js");

    for (const section of ["orders", "profile", "addresses", "iban", "communication"]) {
      const element = await AccountPage({
        searchParams: Promise.resolve({ section }),
      });
      const html = renderToStaticMarkup(element);
      expect(html, `section=${section} HTML leaked session token`).not.toContain(
        SESSION_SENTINEL,
      );
    }
  });

  it("reads the session token only server-side (sent as x-customer-session, never rendered)", async () => {
    const { default: AccountPage } = await import("../app/account/page.js");
    await AccountPage({ searchParams: Promise.resolve({ section: "orders" }) });

    // Jeton gerçekten sunucu-yanlı kullanıldı: gateway çağrısı header taşıdı.
    const authedCalls = fetchCalls.filter((c) => c.sessionHeader !== null);
    expect(authedCalls.length).toBeGreaterThan(0);
    for (const call of authedCalls) {
      expect(call.sessionHeader).toBe(SESSION_SENTINEL);
    }
  });

  it("keeps the raw token out of the customer view model returned to callers", async () => {
    const { getCurrentCustomer } = await import("../lib/server/customer.js");
    const customer = await getCurrentCustomer();
    expect(customer).not.toBeNull();
    expect(JSON.stringify(customer)).not.toContain(SESSION_SENTINEL);
  });

  it("keeps the session token out of the loginAction result (RSC payload boundary)", async () => {
    const { loginAction } = await import("../lib/server/auth-actions.js");
    const result = await loginAction("ada@example.com", "correct horse");
    expect(result).toEqual({ ok: true });
    // Gateway giriş yanıtı raw token taşır; action sonucu ASLA taşımamalı.
    expect(JSON.stringify(result)).not.toContain(SESSION_SENTINEL);
    // Ancak jeton gateway'e gerçekten gönderilmeli (cookie'ye yazılmak üzere alındı).
    const loginCall = fetchCalls.find((c) => c.url.endsWith("/customer/login"));
    expect(loginCall).toBeDefined();
  });
});
