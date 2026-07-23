import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TODO-159E hotfix — Sipariş yüzeyi yorum oluşturma Server Action'ı sunucu-otoriter.
 *
 * Uygunluk + sahiplik + duplicate koruması GATEWAY'de zorlanır (POST /reviews →
 * resolveEligibleLineById). Bu test, aksiyonun yalnız istek ilettiğini ve gateway
 * hata kodlarını (başka müşterinin orderLineId'si → 403, duplicate → 409) sadık
 * şekilde yüzeye taşıdığını doğrular. `fetch` + oturum jetonu sahtelenir.
 */

const calls: Array<{ url: string; init?: RequestInit }> = [];
let nextResponses: Array<{ ok: boolean; status: number; body: unknown }> = [];

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  const next = nextResponses.shift() ?? { ok: true, status: 200, body: {} };
  return {
    ok: next.ok,
    status: next.status,
    json: async () => next.body,
  } as unknown as Response;
});
vi.stubGlobal("fetch", fetchMock);

// Oturum jetonu → sabit; cookie/next-headers'a bağımlı OLMADAN test edilir.
vi.mock("../lib/server/customer-cookie", () => ({
  readCustomerToken: vi.fn(async () => "session-token"),
}));

import { createReviewAction } from "../lib/server/reviews-actions";

beforeEach(() => {
  calls.length = 0;
  nextResponses = [];
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("createReviewAction", () => {
  it("başarılı gönderim → { ok: true, review } (x-customer-session header ile)", async () => {
    nextResponses = [
      {
        ok: true,
        status: 201,
        body: {
          data: {
            id: "rv-1",
            productId: "p1",
            productTitle: "Tablet",
            productSlug: "tablet",
            productImageUrl: null,
            variantLabel: null,
            rating: 5,
            title: null,
            body: "Harika",
            status: "PENDING",
            verifiedPurchase: true,
            helpfulCount: 0,
            createdAt: "2026-07-02T00:00:00.000Z",
            updatedAt: "2026-07-02T00:00:00.000Z",
            publishedAt: null,
            editable: true,
          },
        },
      },
    ];
    const result = await createReviewAction({ orderLineId: "ol-1", rating: 5, body: "Harika" });
    expect(result).toEqual({ ok: true, review: expect.objectContaining({ id: "rv-1", status: "PENDING" }) });
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers["x-customer-session"]).toBe("session-token");
  });

  it("başka müşterinin orderLineId'si → gateway 403 → { ok:false, code:REVIEW_NOT_ELIGIBLE }", async () => {
    nextResponses = [
      { ok: false, status: 403, body: { error: { code: "REVIEW_NOT_ELIGIBLE" } } },
    ];
    const result = await createReviewAction({ orderLineId: "foreign-line", rating: 5, body: "x" });
    expect(result).toEqual({ ok: false, code: "REVIEW_NOT_ELIGIBLE" });
  });

  it("aynı kalem için ikinci yorum → gateway 409 → { ok:false, code:REVIEW_ALREADY_EXISTS }", async () => {
    nextResponses = [
      { ok: false, status: 409, body: { error: { code: "REVIEW_ALREADY_EXISTS" } } },
    ];
    const result = await createReviewAction({ orderLineId: "ol-1", rating: 5, body: "x" });
    expect(result).toEqual({ ok: false, code: "REVIEW_ALREADY_EXISTS" });
  });
});
