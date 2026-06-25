import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Vitrin katalog resolver (TD-032 / F3A.1). Gateway'in AUTH GEREKTIRMEYEN
 * public-read katalog uclarini token'siz cagirir. `fetch` sahtelenir; gercek
 * ag cagrisi yapilmaz. Dogrulananlar: (1) hicbir Authorization/Bearer header
 * gonderilmez (platform-admin token resolver kaldirildi), (2) public DTO dogru
 * vitrin gorunumune cevrilir, (3) gateway'de gizlenmis numerik fiyat (null)
 * istemci tarafinda da sizmaz, (4) bilinmeyen handle/no-store graceful durum.
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
  return {
    ok: next.ok,
    status: next.status,
    json: async () => next.body,
  } as unknown as Response;
});

vi.stubGlobal("fetch", fetchMock);

import { getStorefrontListing, getStorefrontProductByHandle } from "../lib/server/catalog";

function publicVariant(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    title: "Black / M",
    sku: "DEMO-HOODIE-BLK-M",
    priceMinor: 129900,
    compareAtMinor: 149900,
    currency: "TRY",
    available: 15,
    inStock: true,
    ...overrides,
  };
}

function publicProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    slug: "demo-hoodie",
    title: "Demo Hoodie",
    brand: "Commerce OS",
    categoryLabel: "Apparel",
    salesMode: "ONLINE",
    priceVisibility: "VISIBLE",
    primaryAction: "ADD_TO_CART",
    purchasable: true,
    whatsappEnabled: false,
    inquiryEnabled: false,
    appointmentRequired: false,
    minOrderQuantity: 1,
    maxOrderQuantity: null,
    variants: [publicVariant()],
    ...overrides,
  };
}

function publicDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...publicProduct(),
    description: "Cozy hoodie",
    callToActionLabel: null,
    whatsappMessageTemplate: null,
    inquiryFormTitle: null,
    appointmentNote: null,
    related: [],
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

describe("storefront resolver · public listing", () => {
  it("returns live product summaries without sending any auth token", async () => {
    nextResponses = [
      jsonResponse({ data: [publicProduct()], pagination: { limit: 50, offset: 0, total: 1 } }),
    ];
    const result = await getStorefrontListing();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [summary] = result.data;
    expect(summary.handle).toBe("demo-hoodie");
    expect(summary.title).toBe("Demo Hoodie");
    expect(summary.categoryLabel).toBe("Apparel");
    expect(summary.commerce.primaryCta).toBe("ADD_TO_CART");
    expect(summary.price.amountLabel).toContain("1.299");
    expect(summary.badgeKind).toBe("discount"); // compareAt > price

    // Public uc çağrildi ve HİÇBİR Authorization header gonderilmedi.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/public/stores/demo-store/products");
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
    expect(JSON.stringify(headers).toLowerCase()).not.toContain("authorization");
    expect(JSON.stringify(headers).toLowerCase()).not.toContain("bearer");
  });

  it("returns no-store on a 404 store response", async () => {
    nextResponses = [jsonResponse({ error: { code: "STORE_NOT_FOUND" } }, 404)];
    const result = await getStorefrontListing();
    expect(result).toEqual({ ok: false, reason: "no-store" });
  });

  it("does not leak a numeric price for an on-request product (gateway nulls it)", async () => {
    nextResponses = [
      jsonResponse({
        data: [
          publicProduct({
            salesMode: "INQUIRY",
            priceVisibility: "ON_REQUEST",
            primaryAction: "REQUEST_PRICE",
            purchasable: false,
            inquiryEnabled: true,
            // Gateway gizli/talep fiyatta numerik fiyati null yapar.
            variants: [publicVariant({ priceMinor: null, compareAtMinor: null })],
          }),
        ],
        pagination: { limit: 50, offset: 0, total: 1 },
      }),
    ];
    const result = await getStorefrontListing();
    if (!result.ok) throw new Error("expected ok");
    expect(result.data[0].price.mode).toBe("onRequest");
    expect(result.data[0].price.amountLabel).toBeNull();
    expect(result.data[0].commerce.primaryCta).toBe("REQUEST_PRICE");
    // Hicbir numerik fiyat (129900 / 149900) donen veride bulunmamali.
    expect(JSON.stringify(result)).not.toContain("129900");
    expect(JSON.stringify(result)).not.toContain("149900");
  });
});

describe("storefront resolver · product detail", () => {
  it("resolves a product by handle with variants, stock and description", async () => {
    nextResponses = [jsonResponse(publicDetail())];
    const result = await getStorefrontProductByHandle("demo-hoodie");
    expect(result.ok).toBe(true);
    if (!result.ok || result.data === null) throw new Error("expected detail");
    expect(result.data.sku).toBe("DEMO-HOODIE-BLK-M");
    expect(result.data.variants[0].inStock).toBe(true);
    expect(result.data.variants[0].available).toBe(15);
    expect(result.data.description).toBe("Cozy hoodie");
    expect(calls[0].url).toContain("/public/stores/demo-store/products/demo-hoodie");
  });

  it("returns null data for an unknown handle (graceful 404 empty state)", async () => {
    nextResponses = [jsonResponse({ error: { code: "PRODUCT_NOT_FOUND" } }, 404)];
    const result = await getStorefrontProductByHandle("does-not-exist");
    expect(result).toEqual({ ok: true, data: null });
  });

  it("surfaces a generic error on a 5xx gateway failure", async () => {
    nextResponses = [jsonResponse({ error: { code: "INTERNAL_SERVER_ERROR" } }, 500)];
    const result = await getStorefrontProductByHandle("demo-hoodie");
    expect(result).toEqual({ ok: false, reason: "error" });
  });
});
