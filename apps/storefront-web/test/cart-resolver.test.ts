import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Vitrin sepet/checkout cozumleyici (F3B.1). Gateway'in AUTH GEREKTIRMEYEN
 * public cart/checkout uclarini token'siz cagirir. `fetch` sahtelenir; gercek ag
 * cagrisi yapilmaz. Dogrulananlar: (1) hicbir Authorization/Bearer header
 * gonderilmez, (2) sunucu-otoriter DTO dogru gorunum modeline cevrilir, (3) hata
 * statuleri anlamli sebeplere eslenir.
 */
type FetchCall = { url: string; init?: RequestInit };

const calls: FetchCall[] = [];
let nextResponses: Array<{ ok: boolean; status: number; body: unknown }> = [];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, body };
}

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  const next = nextResponses.shift() ?? jsonResponse({}, 200);
  return { ok: next.ok, status: next.status, json: async () => next.body } as unknown as Response;
});

vi.stubGlobal("fetch", fetchMock);

import { resolveCart, submitCheckout } from "../lib/server/cart";

function publicCart(overrides: Record<string, unknown> = {}) {
  return {
    storeSlug: "demo-store",
    currency: "TRY",
    subtotalMinor: 259800,
    itemCount: 2,
    checkoutReady: true,
    summary: {
      itemsSubtotalMinor: 259800,
      shippingMinor: 0,
      discountMinor: 0,
      taxIncludedMinor: 43300,
      grandTotalMinor: 259800,
      currency: "TRY",
      freeShippingThresholdMinor: 75000,
      taxRatePercent: 20,
      couponCode: null,
      couponStatus: "NONE",
    },
    lines: [
      {
        variantId: "v1",
        productSlug: "demo-hoodie",
        title: "Demo Hoodie",
        variantTitle: "Black / M",
        sku: "DEMO-HOODIE-BLK-M",
        quantity: 2,
        availableQuantity: 2,
        unitPriceMinor: 129900,
        lineTotalMinor: 259800,
        currency: "TRY",
        minOrderQuantity: 1,
        maxOrderQuantity: null,
        inStock: true,
        status: "OK",
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  calls.length = 0;
  nextResponses = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("storefront-web · cart resolver", () => {
  it("maps the public cart DTO into a formatted view without sending auth headers", async () => {
    nextResponses = [jsonResponse(publicCart())];
    const result = await resolveCart([{ variantId: "v1", quantity: 2 }]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.isEmpty).toBe(false);
    expect(result.data.checkoutReady).toBe(true);
    expect(result.data.itemCount).toBe(2);
    expect(result.data.lines[0]).toMatchObject({ title: "Demo Hoodie", quantity: 2, status: "OK" });
    // Bicimli etiketler turetilmis (tr-TR para bicimi).
    expect(result.data.lines[0].lineTotalLabel).toContain("2.598");
    // Ozet (server-otoriter) gorunum modeline cevrildi.
    expect(result.data.summary.shippingIsFree).toBe(true);
    expect(result.data.summary.grandTotalLabel).toContain("2.598");
    expect(result.data.summary.couponStatus).toBe("NONE");

    // Auth header gonderilmemeli (public-write).
    const headers = (calls[0]?.init?.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("authorization");
    expect(JSON.stringify(calls[0]?.init)).not.toMatch(/Bearer/i);
    expect(calls[0]?.url).toContain("/public/stores/demo-store/cart");
  });

  it("maps a 404 to no-store and other failures to error", async () => {
    nextResponses = [jsonResponse({}, 404)];
    expect(await resolveCart([])).toEqual({ ok: false, reason: "no-store" });

    nextResponses = [jsonResponse({}, 500)];
    expect(await resolveCart([])).toEqual({ ok: false, reason: "error" });
  });

  it("maps a successful checkout into a confirmation view", async () => {
    nextResponses = [
      jsonResponse({
        orderNumber: "OS-000123",
        status: "PLACED",
        paymentStatus: "UNPAID",
        currency: "TRY",
        subtotalMinor: 259800,
        shippingMinor: 0,
        discountMinor: 0,
        taxIncludedMinor: 43300,
        totalMinor: 259800,
        couponCode: null,
        couponStatus: "NONE",
        contactEmail: "ada@example.com",
        lines: [
          {
            title: "Demo Hoodie",
            variantTitle: "Black / M",
            quantity: 2,
            unitPriceMinor: 129900,
            lineTotalMinor: 259800,
            currency: "TRY",
          },
        ],
        createdAt: "2026-06-25T00:00:00.000Z",
      }),
    ];

    const result = await submitCheckout(
      [{ variantId: "v1", quantity: 2 }],
      { fullName: "Ada", email: "ada@example.com", phone: "+90" },
      { country: "TR", city: "Istanbul", addressLine1: "Line 1" },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.confirmation.orderNumber).toBe("OS-000123");
    expect(result.confirmation.paymentPending).toBe(true);
    expect(result.confirmation.totalLabel).toContain("2.598");
  });

  it("maps checkout failure statuses to actionable reasons", async () => {
    nextResponses = [jsonResponse({}, 409)];
    expect(await submitCheckout([], { fullName: "a", email: "a@a.co", phone: "1" }, { country: "TR", city: "c", addressLine1: "l" })).toEqual({
      ok: false,
      reason: "cart-not-ready",
    });

    nextResponses = [jsonResponse({}, 400)];
    expect(await submitCheckout([], { fullName: "a", email: "a@a.co", phone: "1" }, { country: "TR", city: "c", addressLine1: "l" })).toEqual({
      ok: false,
      reason: "rejected",
    });
  });
});
