import { describe, expect, it } from "vitest";
import {
  parseAutocompleteQuery,
  autocompleteCacheKey,
  AUTOCOMPLETE_DEFAULT_PRODUCTS,
  AUTOCOMPLETE_MAX_PRODUCTS,
} from "../src/search/autocomplete-parser.js";

/** TODO-156E — Autocomplete parser SAF birim testleri. */

describe("parseAutocompleteQuery", () => {
  it("geçerli q → bounded SuggestQuery (sabit grup limitleri)", () => {
    const r = parseAutocompleteQuery({ q: "  iph " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.q).toBe("iph"); // trim
    expect(r.value.limitProducts).toBe(AUTOCOMPLETE_DEFAULT_PRODUCTS);
    expect(r.value.limitCategories).toBeGreaterThan(0);
    expect(r.value.limitBrands).toBeGreaterThan(0);
    expect(r.value.limitSuggestions).toBeGreaterThan(0);
  });

  it("q yok/boş → 400 INVALID_AUTOCOMPLETE_QUERY", () => {
    for (const raw of [{}, { q: "" }, { q: "   " }]) {
      const r = parseAutocompleteQuery(raw);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.code).toBe("INVALID_AUTOCOMPLETE_QUERY");
    }
  });

  it("çok uzun q → hata", () => {
    const r = parseAutocompleteQuery({ q: "a".repeat(101) });
    expect(r.ok).toBe(false);
  });

  it("limit override bounded (1..MAX)", () => {
    expect((parseAutocompleteQuery({ q: "a", limit: "3" }) as { value: { limitProducts: number } }).value.limitProducts).toBe(3);
    expect(parseAutocompleteQuery({ q: "a", limit: "0" }).ok).toBe(false);
    expect(parseAutocompleteQuery({ q: "a", limit: String(AUTOCOMPLETE_MAX_PRODUCTS + 1) }).ok).toBe(false);
    expect(parseAutocompleteQuery({ q: "a", limit: "abc" }).ok).toBe(false);
  });

  it("array query değerini ilk string olarak alır", () => {
    const r = parseAutocompleteQuery({ q: ["kalem", "x"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.q).toBe("kalem");
  });
});

describe("autocompleteCacheKey", () => {
  const base = { q: "iPhone", limitProducts: 6, limitCategories: 5, limitBrands: 5, limitSuggestions: 6 };

  it("case/space farkları AYNI anahtara düşer (hit oranı)", () => {
    const a = autocompleteCacheKey("s1", { ...base, q: "iPhone" });
    const b = autocompleteCacheKey("s1", { ...base, q: "  iphone  " });
    expect(a).toBe(b);
  });

  it("farklı store ve farklı ürün limiti farklı anahtar", () => {
    expect(autocompleteCacheKey("s1", base)).not.toBe(autocompleteCacheKey("s2", base));
    expect(autocompleteCacheKey("s1", base)).not.toBe(autocompleteCacheKey("s1", { ...base, limitProducts: 8 }));
  });
});
