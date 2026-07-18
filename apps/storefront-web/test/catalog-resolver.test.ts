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
    // ADR-065 (Faz 3/Dilim 1) — gateway her zaman images gonderir (schema default []).
    images: [],
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

  // F4C (ADR-063) — Cok varyantli urun kartinda yalniz EN UCUZ varyant fiyati.
  it("F4C: a multi-variant product shows ONLY the cheapest variant price (no range)", async () => {
    nextResponses = [
      jsonResponse({
        data: [
          publicProduct({
            variants: [
              publicVariant({ id: "v1", priceMinor: 149900, compareAtMinor: null }),
              publicVariant({
                id: "v2",
                sku: "DEMO-HOODIE-BLK-S",
                priceMinor: 145000,
                compareAtMinor: null,
                lowestPriceMinor: null,
              }),
            ],
          }),
        ],
        pagination: { limit: 50, offset: 0, total: 1 },
      }),
    ];
    const result = await getStorefrontListing();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [summary] = result.data;
    // Yalniz en ucuz fiyat; aralik ("–") ve pahali varyant tutari YOK.
    expect(summary.price.amountLabel).toContain("1.450");
    expect(summary.price.amountLabel).not.toContain("1.499");
    expect(summary.price.amountLabel).not.toContain("–");
  });

  it("F4C: compareAt/discount badge still derives from the cheapest variant", async () => {
    nextResponses = [
      jsonResponse({
        data: [
          publicProduct({
            variants: [
              publicVariant({ id: "v1", priceMinor: 149900, compareAtMinor: null, lowestPriceMinor: null }),
              publicVariant({
                id: "v2",
                sku: "DEMO-HOODIE-BLK-S",
                priceMinor: 129900,
                compareAtMinor: 149900,
                lowestPriceMinor: 129900,
              }),
            ],
          }),
        ],
        pagination: { limit: 50, offset: 0, total: 1 },
      }),
    ];
    const result = await getStorefrontListing();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [summary] = result.data;
    expect(summary.price.amountLabel).toContain("1.299");
    expect(summary.price.compareAtLabel).toContain("1.499");
    expect(summary.badgeKind).toBe("discount");
  });

  // ADR-065 (Faz 3/Dilim 1) — Kapak turetimi: images[0].url → coverUrl.
  it("derives coverUrl from the first image; null when there are none", async () => {
    nextResponses = [
      jsonResponse({
        data: [
          publicProduct({
            images: [
              { url: "/media/stores/s1/products/cover.webp", altText: "Kapak", position: 0 },
              { url: "/media/stores/s1/products/alt.webp", altText: null, position: 1 },
            ],
          }),
          publicProduct({ slug: "no-image", images: [] }),
        ],
        pagination: { limit: 50, offset: 0, total: 2 },
      }),
    ];
    const result = await getStorefrontListing();
    if (!result.ok) throw new Error("expected ok");
    expect(result.data[0].coverUrl).toBe("/media/stores/s1/products/cover.webp");
    expect(result.data[1].coverUrl).toBeNull();
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

  // ADR-065 (Faz 3/Dilim 1) — Detay tam galeriyi (images[]) tasir; coverUrl=images[0].
  it("resolves the full gallery on detail with coverUrl matching images[0]", async () => {
    nextResponses = [
      jsonResponse(
        publicDetail({
          images: [
            { url: "/media/stores/s1/products/a.webp", altText: "A", position: 0 },
            { url: "/media/stores/s1/products/b.webp", altText: null, position: 1 },
            { url: "/media/stores/s1/products/c.webp", altText: null, position: 2 },
          ],
        }),
      ),
    ];
    const result = await getStorefrontProductByHandle("demo-hoodie");
    if (!result.ok || result.data === null) throw new Error("expected detail");
    expect(result.data.images).toHaveLength(3);
    // Faz 2C-7 (ADR-078) — image DTO'sunda variantOptionId (null = paylasilan) da tasinir.
    expect(result.data.images[0]).toEqual({
      url: "/media/stores/s1/products/a.webp",
      altText: "A",
      variantOptionId: null,
    });
    expect(result.data.coverUrl).toBe("/media/stores/s1/products/a.webp");
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
