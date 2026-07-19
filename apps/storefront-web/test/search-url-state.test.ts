import { describe, expect, it } from "vitest";
import {
  buildSearchHref,
  clearedSearchState,
  emptySearchState,
  hasActiveNarrowing,
  parseSearchState,
  parseServerSearchParams,
  searchParamsToMap,
  serializeSearchState,
  urlSearchParamsToMap,
  withCategory,
  withPage,
  withQuery,
  withSort,
  type SearchState,
} from "../lib/search/url-state";

/** Test kısayolu: query string → SearchState. */
function parse(qs: string): SearchState {
  return parseSearchState(urlSearchParamsToMap(new URLSearchParams(qs)));
}

describe("search url-state · parse", () => {
  it("boş query → tüm varsayılanlar", () => {
    expect(parse("")).toEqual(emptySearchState());
  });

  it("q trim + boş q null", () => {
    expect(parse("q=%20mont%20").q).toBe("mont");
    expect(parse("q=%20%20").q).toBeNull();
  });

  it("q uzunluk sınırı (200)", () => {
    const long = "a".repeat(250);
    expect(parse(`q=${long}`).q?.length).toBe(200);
  });

  it("geçerli sort kabul; geçersiz sort varsayılana düşer", () => {
    expect(parse("sort=price_asc").sort).toBe("price_asc");
    expect(parse("sort=bogus").sort).toBe("relevance");
  });

  it("page/pageSize sınırları", () => {
    expect(parse("page=3").page).toBe(3);
    expect(parse("page=0").page).toBe(1); // geçersiz → varsayılan
    expect(parse("page=-2").page).toBe(1);
    expect(parse("pageSize=48").pageSize).toBe(48);
    expect(parse("pageSize=500").pageSize).toBe(24); // >max → varsayılan
    expect(parse("pageSize=abc").pageSize).toBe(24);
  });

  it("minPrice/maxPrice yalnız non-negatif tam sayı", () => {
    expect(parse("minPrice=1000&maxPrice=5000").minPrice).toBe(1000);
    expect(parse("minPrice=1000&maxPrice=5000").maxPrice).toBe(5000);
    expect(parse("minPrice=-5").minPrice).toBeNull();
    expect(parse("minPrice=12.5").minPrice).toBeNull();
  });

  it("inStock true/1 → true; diğerleri false", () => {
    expect(parse("inStock=1").inStock).toBe(true);
    expect(parse("inStock=true").inStock).toBe(true);
    expect(parse("inStock=0").inStock).toBe(false);
    expect(parse("inStock=nope").inStock).toBe(false);
  });

  it("dinamik filtre passthrough — çoklu değer (virgül + tekrar anahtar)", () => {
    const state = parse("filter[renk]=siyah,lacivert&filter[beden]=m");
    expect(state.filters.renk).toEqual({ kind: "values", values: ["siyah", "lacivert"] });
    expect(state.filters.beden).toEqual({ kind: "values", values: ["m"] });
  });

  it("dinamik filtre passthrough — aralık min/max", () => {
    const state = parse("filter[agirlik][min]=100&filter[agirlik][max]=500");
    expect(state.filters.agirlik).toEqual({ kind: "range", min: 100, max: 500 });
  });

  it("değer + aralık karışımı → değer tercih (gateway karışımı reddeder)", () => {
    const state = parse("filter[x]=a&filter[x][min]=1");
    expect(state.filters.x).toEqual({ kind: "values", values: ["a"] });
  });

  it("bilinmeyen query paramı korunmaz (kontrollü eleme)", () => {
    const state = parse("q=mont&utm_source=google&foo=bar");
    expect(state.q).toBe("mont");
    expect(serializeSearchState(state)).toBe("q=mont"); // stray param düşer
  });

  it("server searchParams (Record) — çoklu değer dizi olarak", () => {
    const state = parseServerSearchParams({ "filter[renk]": ["siyah", "lacivert"], q: "x" });
    expect(state.filters.renk).toEqual({ kind: "values", values: ["siyah", "lacivert"] });
    expect(state.q).toBe("x");
  });
});

describe("search url-state · serialize (kanonik)", () => {
  it("varsayılanlar atılır", () => {
    expect(serializeSearchState(emptySearchState())).toBe("");
  });

  it("deterministik anahtar sırası + alfabetik değerler", () => {
    const state: SearchState = {
      ...emptySearchState(),
      q: "mont",
      category: "erkek",
      sort: "price_asc",
      page: 2,
      minPrice: 5000,
      maxPrice: 25000,
      inStock: true,
      filters: { renk: { kind: "values", values: ["lacivert", "siyah"] } },
    };
    // q, category, filter[...], minPrice, maxPrice, inStock, sort, page
    expect(serializeSearchState(state)).toBe(
      "q=mont&category=erkek&filter[renk]=lacivert,siyah&minPrice=5000&maxPrice=25000&inStock=1&sort=price_asc&page=2",
    );
  });

  it("round-trip: parse(serialize(state)) === normalize(state)", () => {
    const state: SearchState = {
      ...emptySearchState(),
      q: "ayakkabı",
      category: "kadin",
      sort: "title_desc",
      page: 4,
      pageSize: 48,
      minPrice: 100,
      inStock: true,
      filters: {
        renk: { kind: "values", values: ["a", "b"] },
        agirlik: { kind: "range", min: 10, max: 90 },
      },
    };
    expect(parse(serializeSearchState(state))).toEqual(state);
  });

  it("aynı seçim → aynı URL (değer sırası fark etmez)", () => {
    const a = parse("filter[renk]=siyah,lacivert");
    const b = parse("filter[renk]=lacivert,siyah");
    expect(serializeSearchState(a)).toBe(serializeSearchState(b));
  });

  it("buildSearchHref boş state → /products; dolu → query", () => {
    expect(buildSearchHref(emptySearchState())).toBe("/products");
    expect(buildSearchHref(withQuery(emptySearchState(), "x"))).toBe("/products?q=x");
  });
});

describe("search url-state · mutasyonlar (page reset)", () => {
  const base: SearchState = { ...emptySearchState(), page: 5 };

  it("sort değişince page=1", () => {
    expect(withSort(base, "price_desc")).toMatchObject({ sort: "price_desc", page: 1 });
  });
  it("q değişince page=1", () => {
    expect(withQuery(base, "mont")).toMatchObject({ q: "mont", page: 1 });
  });
  it("kategori değişince page=1", () => {
    expect(withCategory(base, "erkek")).toMatchObject({ category: "erkek", page: 1 });
  });
  it("withPage yalnız sayfayı değiştirir (reset yok)", () => {
    expect(withPage(base, 3).page).toBe(3);
    expect(withPage(base, 0).page).toBe(1); // geçersiz → 1
  });

  it("clearedSearchState q/category/filtre/fiyat/stok temizler; sort/pageSize korur", () => {
    const dirty: SearchState = {
      ...emptySearchState(),
      q: "x",
      category: "c",
      sort: "newest",
      pageSize: 48,
      minPrice: 1,
      inStock: true,
      filters: { renk: { kind: "values", values: ["a"] } },
    };
    const cleared = clearedSearchState(dirty);
    expect(cleared.sort).toBe("newest");
    expect(cleared.pageSize).toBe(48);
    expect(hasActiveNarrowing(cleared)).toBe(false);
  });

  it("hasActiveNarrowing daraltmayı tespit eder", () => {
    expect(hasActiveNarrowing(emptySearchState())).toBe(false);
    expect(hasActiveNarrowing(withQuery(emptySearchState(), "x"))).toBe(true);
    expect(hasActiveNarrowing({ ...emptySearchState(), inStock: true })).toBe(true);
  });
});

describe("search url-state · girdi normalizasyonu", () => {
  it("searchParamsToMap undefined değerleri atar", () => {
    const map = searchParamsToMap({ q: "x", empty: undefined });
    expect(map.has("q")).toBe(true);
    expect(map.has("empty")).toBe(false);
  });
});
