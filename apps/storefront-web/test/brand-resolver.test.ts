import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TODO-165A (ADR-165A) Task 18 — Vitrin marka (Brand) BFF. `fetch` sahtelenir; gercek ag cagrisi yapilmaz.
 * Dogrulananlar: (1) public uc token'siz cagirilir, (2) public DTO dogru vitrin gorunumune cevirilir
 * (allowlist; iç alan sizmaz), (3) 404 → grasyoz "no-store"/`data: null` (catalog.ts ile ayni desen),
 * (4) 5xx/schema-parse hatasi → kontrollu "error".
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

import { getStorefrontBrand, getStorefrontBrands } from "../lib/server/brands";

function publicBrandSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1",
    name: "Aurora",
    slug: "aurora",
    logoUrl: "/media/stores/s1/brands/aurora-logo.webp",
    description: "Aurora koleksiyonu",
    ...overrides,
  };
}

function publicBrandDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...publicBrandSummary(),
    coverUrl: "/media/stores/s1/brands/aurora-cover.webp",
    websiteUrl: "https://aurora.example",
    seoTitle: null,
    seoDescription: null,
    productCount: 12,
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

describe("brand resolver · list", () => {
  it("returns live brand summaries without sending any auth token", async () => {
    nextResponses = [jsonResponse({ data: [publicBrandSummary()] })];
    const result = await getStorefrontBrands();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toEqual([
      { id: "b1", name: "Aurora", slug: "aurora", logoUrl: "/media/stores/s1/brands/aurora-logo.webp", description: "Aurora koleksiyonu" },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/public/stores/demo-store/brands");
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
    expect(JSON.stringify(headers).toLowerCase()).not.toContain("authorization");
    expect(JSON.stringify(headers).toLowerCase()).not.toContain("bearer");
  });

  it("returns no-store on a 404 store response", async () => {
    nextResponses = [jsonResponse({ error: { code: "STORE_NOT_FOUND" } }, 404)];
    const result = await getStorefrontBrands();
    expect(result).toEqual({ ok: false, reason: "no-store" });
  });

  it("surfaces a generic error on a 5xx gateway failure", async () => {
    nextResponses = [jsonResponse({ error: { code: "INTERNAL_SERVER_ERROR" } }, 500)];
    const result = await getStorefrontBrands();
    expect(result).toEqual({ ok: false, reason: "error" });
  });

  it("surfaces a generic error when the response fails schema validation (allowlist)", async () => {
    // 'data' eksik → publicBrandListResponseSchema.safeParse basarisiz.
    nextResponses = [jsonResponse({ items: [] })];
    const result = await getStorefrontBrands();
    expect(result).toEqual({ ok: false, reason: "error" });
  });
});

describe("brand resolver · detail", () => {
  it("resolves a brand by slug with cover/website/seo/productCount", async () => {
    nextResponses = [jsonResponse({ data: publicBrandDetail() })];
    const result = await getStorefrontBrand("aurora");
    expect(result.ok).toBe(true);
    if (!result.ok || result.data === null) throw new Error("expected detail");
    expect(result.data.name).toBe("Aurora");
    expect(result.data.coverUrl).toBe("/media/stores/s1/brands/aurora-cover.webp");
    expect(result.data.websiteUrl).toBe("https://aurora.example");
    expect(result.data.productCount).toBe(12);
    expect(calls[0].url).toContain("/public/stores/demo-store/brands/aurora");
  });

  it("returns null data for an unknown slug (graceful 404 → notFound() upstream)", async () => {
    nextResponses = [jsonResponse({ error: { code: "BRAND_NOT_FOUND" } }, 404)];
    const result = await getStorefrontBrand("does-not-exist");
    expect(result).toEqual({ ok: true, data: null });
  });

  it("surfaces a generic error on a 5xx gateway failure", async () => {
    nextResponses = [jsonResponse({ error: { code: "INTERNAL_SERVER_ERROR" } }, 500)];
    const result = await getStorefrontBrand("aurora");
    expect(result).toEqual({ ok: false, reason: "error" });
  });

  it("does not leak internal fields (allowlist parse strips unknowns)", async () => {
    nextResponses = [jsonResponse({ data: publicBrandDetail({ internalNotes: "secret" }) })];
    const result = await getStorefrontBrand("aurora");
    if (!result.ok || result.data === null) throw new Error("expected detail");
    expect(JSON.stringify(result.data)).not.toContain("secret");
  });
});
