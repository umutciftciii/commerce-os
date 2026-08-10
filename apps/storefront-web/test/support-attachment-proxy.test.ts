import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TODO-177 (ADR-289) Faz D — Destek eki BFF proxy'si. Ek PRIVATE + auth-gate'lidir: gateway serve
 * ucu `x-customer-session` HEADER'ı ister, ama bu jeton storefront httpOnly cookie'sindedir. Proxy
 * jetonu server-side header'a çevirir; oturum yoksa 401. Gateway 404'ü (başka müşteri/yok) sadık
 * yansıtılır (varlık sızıntısı yok). İç storageKey/mimeType asla client'a taşınmaz.
 */

const calls: Array<{ url: string; init?: RequestInit }> = [];
let nextResponse: { ok: boolean; status: number; contentType?: string; body?: Uint8Array } = {
  ok: true,
  status: 200,
};

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  return {
    ok: nextResponse.ok,
    status: nextResponse.status,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? nextResponse.contentType ?? null : null) },
    arrayBuffer: async () => (nextResponse.body ?? new Uint8Array()).buffer,
  } as unknown as Response;
});
vi.stubGlobal("fetch", fetchMock);

let token: string | null = "session-token";
vi.mock("../lib/server/customer-cookie", () => ({
  readCustomerToken: vi.fn(async () => token),
}));

import { GET } from "../app/account/support/[ticketNumber]/attachments/[attachmentId]/route";

function call(ticketNumber = "S000001", attachmentId = "att-1") {
  return GET(new Request("http://localhost/x"), {
    params: Promise.resolve({ ticketNumber, attachmentId }),
  });
}

beforeEach(() => {
  calls.length = 0;
  token = "session-token";
  nextResponse = { ok: true, status: 200, contentType: "image/webp", body: new Uint8Array([1, 2, 3]) };
});
afterEach(() => vi.clearAllMocks());

describe("support attachment proxy GET", () => {
  it("oturum jetonunu x-customer-session HEADER'ına çevirir; içeriği 200 döner", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toContain("no-store");
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers["x-customer-session"]).toBe("session-token");
    expect(calls[0]?.url).toContain("/support/tickets/S000001/attachments/att-1");
  });

  it("oturum yoksa gateway'e gitmeden 401", async () => {
    token = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect(calls.length).toBe(0);
  });

  it("gateway 404 (başka müşteri/yok) → 404", async () => {
    nextResponse = { ok: false, status: 404 };
    const res = await call();
    expect(res.status).toBe(404);
  });
});
