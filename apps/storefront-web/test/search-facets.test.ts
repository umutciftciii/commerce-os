import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import type { PublicSearchFacet } from "@commerce-os/api-client";
import {
  emptySearchState,
  clearedFiltersOnly,
  removeFilter,
  removeFilterValue,
  setFilterRange,
  toggleFilterValue,
  withInStock,
  withPrice,
  withQuery,
  type SearchState,
} from "../lib/search/url-state";
import {
  countActiveFilters,
  deriveActiveChips,
  facetActiveCount,
  isFacetActive,
  resolveFacetKind,
} from "../lib/search/facets";

const t = getDictionary("tr").storefront;

function state(overrides: Partial<SearchState> = {}): SearchState {
  return { ...emptySearchState(), ...overrides };
}

// ── URL mutasyonları ──────────────────────────────────────────────────────────

describe("facet URL mutations", () => {
  it("toggleFilterValue ekler + page 1'e döner", () => {
    const s = toggleFilterValue(state({ page: 3 }), "renk", "siyah");
    expect(s.filters.renk).toEqual({ kind: "values", values: ["siyah"] });
    expect(s.page).toBe(1);
  });

  it("toggleFilterValue ikinci değer ekler, tekrar tıklama kaldırır", () => {
    let s = toggleFilterValue(state(), "renk", "siyah");
    s = toggleFilterValue(s, "renk", "lacivert");
    expect((s.filters.renk as { values: string[] }).values.sort()).toEqual(["lacivert", "siyah"]);
    s = toggleFilterValue(s, "renk", "siyah");
    expect(s.filters.renk).toEqual({ kind: "values", values: ["lacivert"] });
  });

  it("son değer kaldırılınca filtre kodu tamamen silinir", () => {
    let s = toggleFilterValue(state(), "renk", "siyah");
    s = toggleFilterValue(s, "renk", "siyah");
    expect("renk" in s.filters).toBe(false);
  });

  it("removeFilterValue yalnızca kaldırır, yoksa değiştirmez", () => {
    const s0 = toggleFilterValue(state(), "renk", "siyah");
    expect(removeFilterValue(s0, "renk", "yok")).toBe(s0);
    const s1 = removeFilterValue(s0, "renk", "siyah");
    expect("renk" in s1.filters).toBe(false);
  });

  it("setFilterRange min/max yazar; ikisi null → siler", () => {
    const s = setFilterRange(state(), "agirlik", 100, 500);
    expect(s.filters.agirlik).toEqual({ kind: "range", min: 100, max: 500 });
    const cleared = setFilterRange(s, "agirlik", null, null);
    expect("agirlik" in cleared.filters).toBe(false);
  });

  it("setFilterRange negatif/geçersiz → null'a düşer", () => {
    const s = setFilterRange(state(), "agirlik", -5, 12.5 as unknown as number);
    // -5 ve 12.5 ikisi de geçersiz → filtre eklenmez.
    expect("agirlik" in s.filters).toBe(false);
  });

  it("removeFilter kodu tamamen kaldırır", () => {
    const s = setFilterRange(state(), "agirlik", 100, null);
    expect("agirlik" in removeFilter(s, "agirlik").filters).toBe(false);
  });

  it("withPrice minor değerleri yazar; withInStock stok", () => {
    expect(withPrice(state(), 10000, 50000)).toMatchObject({ minPrice: 10000, maxPrice: 50000, page: 1 });
    expect(withInStock(state(), true).inStock).toBe(true);
  });

  it("clearedFiltersOnly fiyat/stok/dinamik temizler ama q+category korur", () => {
    const s = clearedFiltersOnly(
      state({
        q: "mont",
        category: "erkek",
        minPrice: 100,
        inStock: true,
        filters: { renk: { kind: "values", values: ["siyah"] } },
      }),
    );
    expect(s.q).toBe("mont");
    expect(s.category).toBe("erkek");
    expect(s.minPrice).toBeNull();
    expect(s.inStock).toBe(false);
    expect(Object.keys(s.filters)).toHaveLength(0);
  });

  it("mutasyonlar girdi state'i mutate etmez (saf)", () => {
    const s0 = state();
    toggleFilterValue(s0, "renk", "siyah");
    expect(s0.filters).toEqual({});
  });
});

// ── resolveFacetKind (registry anahtarı) ──────────────────────────────────────

describe("resolveFacetKind", () => {
  const cases: Array<[PublicSearchFacet["selectionMode"], PublicSearchFacet["dataType"], string]> = [
    ["MULTI", "SELECT", "checkbox"],
    ["MULTI", "MULTI_SELECT", "checkbox"],
    ["MULTI", "TEXT", "checkbox"],
    ["MULTI", "COLOR", "color"],
    ["RANGE", "INTEGER", "range"],
    ["RANGE", "DECIMAL", "range"],
    ["RANGE", "DATE", "date"],
    ["BOOLEAN", "BOOLEAN", "boolean"],
  ];
  for (const [selectionMode, dataType, expected] of cases) {
    it(`${selectionMode}/${dataType} → ${expected}`, () => {
      expect(resolveFacetKind({ selectionMode, dataType })).toBe(expected);
    });
  }

  it("bilinmeyen selectionMode → checkbox fallback", () => {
    expect(resolveFacetKind({ selectionMode: "WAT" as never, dataType: "SELECT" })).toBe("checkbox");
  });
});

// ── Facet fixtures ────────────────────────────────────────────────────────────

function optionFacet(overrides: Partial<PublicSearchFacet> = {}): PublicSearchFacet {
  return {
    attributeDefinitionId: "def-renk",
    code: "renk",
    name: "Renk",
    dataType: "COLOR",
    unit: null,
    displayOrder: 1,
    selectionMode: "MULTI",
    values: [
      { optionId: "o1", value: "siyah", label: "Siyah", colorHex: "#000000", count: 12, selected: false },
      { optionId: "o2", value: "beyaz", label: "Beyaz", colorHex: "#ffffff", count: 5, selected: false },
    ],
    range: null,
    ...overrides,
  };
}

function rangeFacet(overrides: Partial<PublicSearchFacet> = {}): PublicSearchFacet {
  return {
    attributeDefinitionId: "def-agirlik",
    code: "agirlik",
    name: "Ağırlık",
    dataType: "INTEGER",
    unit: "g",
    displayOrder: 2,
    selectionMode: "RANGE",
    values: [],
    range: { availableMin: 50, availableMax: 900, selectedMin: null, selectedMax: null },
    ...overrides,
  };
}

// ── Aktif sayaçlar ────────────────────────────────────────────────────────────

describe("active counters", () => {
  it("facetActiveCount = seçili değer sayısı", () => {
    const s = toggleFilterValue(toggleFilterValue(state(), "renk", "siyah"), "renk", "beyaz");
    expect(facetActiveCount(optionFacet(), s)).toBe(2);
    expect(isFacetActive(optionFacet(), s)).toBe(true);
  });

  it("range facet aktif = 1 (min veya max)", () => {
    const s = setFilterRange(state(), "agirlik", 100, null);
    expect(facetActiveCount(rangeFacet(), s)).toBe(1);
  });

  it("countActiveFilters q+category+price+stock+dinamik toplar", () => {
    const s = state({
      q: "mont",
      category: "erkek",
      minPrice: 100,
      inStock: true,
      filters: { renk: { kind: "values", values: ["siyah", "beyaz"] } },
    });
    // q(1) + category(1) + price(1) + stock(1) + renk(2) = 6
    expect(countActiveFilters(s)).toBe(6);
  });
});

// ── Çip türetimi ──────────────────────────────────────────────────────────────

describe("deriveActiveChips", () => {
  it("boş state → çip yok", () => {
    expect(deriveActiveChips(state(), [], { t, currency: "TRY" })).toHaveLength(0);
  });

  it("değer çipleri facet etiketini kullanır; her değer ayrı çip", () => {
    const s = toggleFilterValue(toggleFilterValue(state(), "renk", "siyah"), "renk", "beyaz");
    const chips = deriveActiveChips(s, [optionFacet()], { t, currency: "TRY" });
    const labels = chips.map((c) => c.valueLabel).sort();
    expect(labels).toEqual(["Beyaz", "Siyah"]);
    expect(chips[0].groupLabel).toBe("Renk");
  });

  it("stale değer (facet'te yok) → ham value gösterir", () => {
    const s = toggleFilterValue(state(), "renk", "mor");
    const chips = deriveActiveChips(s, [optionFacet()], { t, currency: "TRY" });
    expect(chips[0].valueLabel).toBe("mor");
  });

  it("fiyat çipi currency formatlı + removeHref fiyatı temizler", () => {
    const s = withPrice(state(), 10000, 50000);
    const chips = deriveActiveChips(s, [], { t, currency: "TRY" });
    expect(chips[0].groupLabel).toBe(t.search.priceFacetLabel);
    expect(chips[0].valueLabel).toContain("–");
    // removeHref fiyat paramlarını içermez.
    expect(chips[0].removeHref).not.toContain("minPrice");
  });

  it("range çipi min–max + unit; removeHref filtreyi kaldırır", () => {
    const s = setFilterRange(state(), "agirlik", 100, 500);
    const chips = deriveActiveChips(s, [rangeFacet()], { t, currency: "TRY" });
    expect(chips[0].valueLabel).toBe("100 g – 500 g");
    expect(chips[0].removeHref).not.toContain("agirlik");
  });

  it("arama çipi removeHref q'yu düşürür", () => {
    const s = withQuery(state(), "mont");
    const chips = deriveActiveChips(s, [], { t, currency: "TRY" });
    expect(chips[0].groupLabel).toBe(t.search.chipSearchLabel);
    expect(chips[0].removeHref).not.toContain("q=");
  });

  it("çip sırası: arama → fiyat → dinamik", () => {
    const s = withPrice(withQuery(toggleFilterValue(state(), "renk", "siyah"), "mont"), 10000, null);
    const chips = deriveActiveChips(s, [optionFacet()], { t, currency: "TRY" });
    expect(chips.map((c) => c.id)).toEqual(["q", "price", "renk:siyah"]);
  });
});
