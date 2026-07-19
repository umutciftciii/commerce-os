import { describe, expect, it } from "vitest";
import { canonicalPath, isIndexable, robotsFor } from "../lib/search/seo";
import { emptySearchState, withCategory, withPage, withQuery, type SearchState } from "../lib/search/url-state";

describe("search seo", () => {
  it("düz PLP indexable", () => {
    expect(isIndexable(emptySearchState())).toBe(true);
    expect(robotsFor(emptySearchState())).toEqual({ index: true, follow: true });
  });

  it("kategori-yalnız indexable", () => {
    const state = withCategory(emptySearchState(), "erkek");
    expect(isIndexable(state)).toBe(true);
  });

  it("arama (q) noindex,follow", () => {
    const state = withQuery(emptySearchState(), "mont");
    expect(isIndexable(state)).toBe(false);
    expect(robotsFor(state)).toEqual({ index: false, follow: true });
  });

  it("fiyat/stok/dinamik filtre noindex", () => {
    expect(isIndexable({ ...emptySearchState(), minPrice: 100 })).toBe(false);
    expect(isIndexable({ ...emptySearchState(), inStock: true })).toBe(false);
    expect(
      isIndexable({ ...emptySearchState(), filters: { renk: { kind: "values", values: ["a"] } } }),
    ).toBe(false);
  });

  it("canonical indexable: kategori + page korunur, sort düşer", () => {
    const state: SearchState = { ...withCategory(emptySearchState(), "erkek"), sort: "price_asc", page: 2 };
    expect(canonicalPath(state)).toBe("/products?category=erkek&page=2");
  });

  it("canonical indexable page 1: temiz path", () => {
    expect(canonicalPath(emptySearchState())).toBe("/products");
    expect(canonicalPath(withCategory(emptySearchState(), "erkek"))).toBe("/products?category=erkek");
  });

  it("canonical noindex (filtreli): self, ana kategoriye EZİLMEZ", () => {
    const state = withQuery(emptySearchState(), "mont");
    // q korunur (base'e ezilmez); sort/pageSize normalize.
    expect(canonicalPath(state)).toBe("/products?q=mont");
  });

  it("page>1 aramada self-canonical q + page taşır", () => {
    const state = withPage(withQuery(emptySearchState(), "mont"), 3);
    expect(canonicalPath(state)).toBe("/products?q=mont&page=3");
  });
});
