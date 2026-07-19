import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "../src/search/query-parser.js";

/**
 * TODO-155 (ADR-079) — Faz 2C-8B · Public arama query PARSER testleri (SAF, DB'siz).
 * Varsayılanlar, doğrulama hataları (tipli kod), dinamik filtre ayrıştırma (filter[code] + range),
 * güvenlik (SQL payload string olarak taşınır — parse hatası değil; provider parametreli).
 */

function ok(raw: unknown) {
  const r = parseSearchQuery(raw);
  if (!r.ok) throw new Error(`expected ok, got ${r.code}`);
  return r.value;
}

describe("parseSearchQuery — varsayılanlar", () => {
  it("boş query → sayfa 1, pageSize 24, sort relevance, filtre yok", () => {
    expect(ok({})).toEqual({
      q: undefined,
      categorySlug: undefined,
      page: 1,
      pageSize: 24,
      sort: "relevance",
      minPrice: undefined,
      maxPrice: undefined,
      inStock: undefined,
      filters: [],
    });
  });

  it("q trim + boş q undefined", () => {
    expect(ok({ q: "  laptop  " }).q).toBe("laptop");
    expect(ok({ q: "   " }).q).toBeUndefined();
  });

  it("category slug taşınır", () => {
    expect(ok({ category: "laptoplar" }).categorySlug).toBe("laptoplar");
  });
});

describe("parseSearchQuery — pagination", () => {
  it("geçerli page/pageSize", () => {
    const v = ok({ page: "3", pageSize: "50" });
    expect(v.page).toBe(3);
    expect(v.pageSize).toBe(50);
  });
  it("page 0 / negatif → INVALID_PAGINATION", () => {
    expect(parseSearchQuery({ page: "0" })).toMatchObject({ ok: false, code: "INVALID_PAGINATION" });
    expect(parseSearchQuery({ page: "-1" })).toMatchObject({ ok: false, code: "INVALID_PAGINATION" });
  });
  it("page ondalık/harf → INVALID_PAGINATION", () => {
    expect(parseSearchQuery({ page: "1.5" })).toMatchObject({ ok: false, code: "INVALID_PAGINATION" });
    expect(parseSearchQuery({ page: "abc" })).toMatchObject({ ok: false, code: "INVALID_PAGINATION" });
  });
  it("pageSize max aşımı → INVALID_PAGINATION", () => {
    expect(parseSearchQuery({ pageSize: "500" })).toMatchObject({ ok: false, code: "INVALID_PAGINATION" });
  });
  it("page overflow guard (>100000) → INVALID_PAGINATION", () => {
    expect(parseSearchQuery({ page: "100001" })).toMatchObject({ ok: false, code: "INVALID_PAGINATION" });
  });
});

describe("parseSearchQuery — sort", () => {
  it("geçerli sort", () => {
    expect(ok({ sort: "price_asc" }).sort).toBe("price_asc");
  });
  it("geçersiz sort → INVALID_SORT", () => {
    expect(parseSearchQuery({ sort: "best_selling" })).toMatchObject({ ok: false, code: "INVALID_SORT" });
  });
});

describe("parseSearchQuery — price", () => {
  it("min/max int", () => {
    const v = ok({ minPrice: "1000", maxPrice: "5000" });
    expect(v.minPrice).toBe(1000);
    expect(v.maxPrice).toBe(5000);
  });
  it("negatif/ondalık fiyat → INVALID_FILTER_VALUE", () => {
    expect(parseSearchQuery({ minPrice: "-5" })).toMatchObject({ ok: false, code: "INVALID_FILTER_VALUE" });
    expect(parseSearchQuery({ maxPrice: "10.5" })).toMatchObject({ ok: false, code: "INVALID_FILTER_VALUE" });
  });
});

describe("parseSearchQuery — inStock", () => {
  it("true/1 → true, false/0 → false", () => {
    expect(ok({ inStock: "true" }).inStock).toBe(true);
    expect(ok({ inStock: "1" }).inStock).toBe(true);
    expect(ok({ inStock: "false" }).inStock).toBe(false);
  });
  it("geçersiz inStock → INVALID_FILTER", () => {
    expect(parseSearchQuery({ inStock: "maybe" })).toMatchObject({ ok: false, code: "INVALID_FILTER" });
  });
});

describe("parseSearchQuery — dinamik filtreler", () => {
  it("filter[renk]=siyah,beyaz → values (virgül böl + dedupe)", () => {
    const v = ok({ "filter[renk]": "siyah,beyaz,siyah" });
    expect(v.filters).toEqual([{ code: "renk", values: ["siyah", "beyaz"] }]);
  });
  it("tekrarlı filter[renk] anahtarı (array) düzleştirilir", () => {
    const v = ok({ "filter[renk]": ["siyah", "beyaz"] });
    expect(v.filters[0].values).toEqual(["siyah", "beyaz"]);
  });
  it("filter[ekran][min]/[max] → numeric range", () => {
    const v = ok({ "filter[ekran][min]": "13", "filter[ekran][max]": "16" });
    expect(v.filters).toEqual([{ code: "ekran", min: 13, max: 16 }]);
  });
  it("range + values karışımı → INVALID_FILTER", () => {
    const r = parseSearchQuery({ "filter[ekran]": "abc", "filter[ekran][min]": "13" });
    expect(r).toMatchObject({ ok: false, code: "INVALID_FILTER" });
  });
  it("range değeri sayı değil → INVALID_FILTER_VALUE", () => {
    expect(parseSearchQuery({ "filter[ekran][min]": "big" })).toMatchObject({
      ok: false,
      code: "INVALID_FILTER_VALUE",
    });
  });
  it("boş değerli filter[x]= → INVALID_FILTER_VALUE", () => {
    expect(parseSearchQuery({ "filter[renk]": "" })).toMatchObject({
      ok: false,
      code: "INVALID_FILTER_VALUE",
    });
  });
});

describe("parseSearchQuery — güvenlik", () => {
  it("SQL injection payload q içinde SADECE string olarak taşınır (parse hatası değil)", () => {
    const v = ok({ q: "'; DROP TABLE products; --" });
    expect(v.q).toBe("'; DROP TABLE products; --");
  });
  it("SQL payload filter değeri olarak taşınır (parametreli sorguya gider)", () => {
    const v = ok({ "filter[renk]": "black' OR '1'='1" });
    expect(v.filters[0].values).toEqual(["black' OR '1'='1"]);
  });
  it("q max uzunluk aşımı → INVALID_SEARCH_QUERY", () => {
    const long = "a".repeat(201);
    expect(parseSearchQuery({ q: long })).toMatchObject({ ok: false, code: "INVALID_SEARCH_QUERY" });
  });
});
