import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import type { PublicSearchFacet } from "@commerce-os/api-client";
import { FacetControl } from "../components/search/facets/registry";
import { FacetList } from "../components/search/facets/facet-list";
import { ActiveFilterChips } from "../components/search/active-filter-chips";
import { FilterRail } from "../components/search/filter-rail";
import { FilterDrawer } from "../components/search/filter-drawer";
import {
  emptySearchState,
  setFilterRange,
  toggleFilterValue,
  withInStock,
  withPrice,
  type SearchState,
} from "../lib/search/url-state";

const t = getDictionary("tr").storefront;

function state(overrides: Partial<SearchState> = {}): SearchState {
  return { ...emptySearchState(), ...overrides };
}

function colorFacet(): PublicSearchFacet {
  return {
    attributeDefinitionId: "def-renk",
    code: "renk",
    name: "Renk",
    dataType: "COLOR",
    unit: null,
    displayOrder: 1,
    selectionMode: "MULTI",
    values: [
      { optionId: "o1", value: "siyah", label: "Siyah", colorHex: "#000000", count: 12, selected: true },
      { optionId: "o2", value: "beyaz", label: "Beyaz", colorHex: "#ffffff", count: 0, selected: false },
    ],
    range: null,
  };
}

function selectFacet(): PublicSearchFacet {
  return {
    attributeDefinitionId: "def-beden",
    code: "beden",
    name: "Beden",
    dataType: "SELECT",
    unit: null,
    displayOrder: 2,
    selectionMode: "MULTI",
    values: [
      { optionId: "s1", value: "m", label: "M", colorHex: null, count: 8, selected: false },
      { optionId: "s2", value: "l", label: "L", colorHex: null, count: 3, selected: false },
    ],
    range: null,
  };
}

function rangeFacet(): PublicSearchFacet {
  return {
    attributeDefinitionId: "def-agirlik",
    code: "agirlik",
    name: "Ağırlık",
    dataType: "INTEGER",
    unit: "g",
    displayOrder: 3,
    selectionMode: "RANGE",
    values: [],
    range: { availableMin: 50, availableMax: 900, selectedMin: null, selectedMax: null },
  };
}

function booleanFacet(): PublicSearchFacet {
  return {
    attributeDefinitionId: "def-organik",
    code: "organik",
    name: "Organik",
    dataType: "BOOLEAN",
    unit: null,
    displayOrder: 4,
    selectionMode: "BOOLEAN",
    values: [
      { optionId: null, value: "true", label: "Evet", colorHex: null, count: 4, selected: false },
      { optionId: null, value: "false", label: "Hayır", colorHex: null, count: 9, selected: false },
    ],
    range: null,
  };
}

describe("FacetControl · registry render", () => {
  it("SELECT/MULTI → checkbox listesi + label + count", () => {
    const out = renderToStaticMarkup(<FacetControl facet={selectFacet()} state={state()} t={t} />);
    expect(out).toContain('type="checkbox"');
    expect(out).toContain("M");
    expect(out).toContain("L");
    expect(out).toContain("8");
  });

  it("COLOR → renk swatch'ı (backgroundColor) + count=0 & seçili değil → disabled", () => {
    const out = renderToStaticMarkup(<FacetControl facet={colorFacet()} state={state()} t={t} />);
    expect(out).toContain("background-color:#000000");
    // Beyaz count=0 & seçili değil → checkbox disabled.
    expect(out).toContain("disabled");
    // Seçili siyah → onay işareti svg (path) render edilir.
    expect(out).toContain("<svg");
  });

  it("RANGE/INTEGER → min/max number input + unit + apply", () => {
    const out = renderToStaticMarkup(<FacetControl facet={rangeFacet()} state={state()} t={t} />);
    expect(out).toContain('type="number"');
    expect(out).toContain(t.search.rangeApply);
    // available sınırları placeholder olarak.
    expect(out).toContain('placeholder="50"');
  });

  it("BOOLEAN → checkbox (switch değil) Evet/Hayır", () => {
    const out = renderToStaticMarkup(<FacetControl facet={booleanFacet()} state={state()} t={t} />);
    expect(out).toContain('type="checkbox"');
    expect(out).toContain("Evet");
    expect(out).toContain("Hayır");
  });
});

describe("FacetList · shared renderer", () => {
  it("fiyat + stok + dinamik facet'leri render eder", () => {
    const out = renderToStaticMarkup(
      <FacetList facets={[selectFacet(), rangeFacet()]} state={state()} currency="TRY" t={t} />,
    );
    expect(out).toContain(t.search.priceFacetLabel);
    expect(out).toContain(t.search.stockFacetLabel);
    expect(out).toContain("Beden");
    expect(out).toContain("Ağırlık (g)");
  });

  it("aktif seçimli facet başlığında sayı rozeti", () => {
    const s = toggleFilterValue(state(), "beden", "m");
    const out = renderToStaticMarkup(<FacetList facets={[selectFacet()]} state={s} currency="TRY" t={t} />);
    // Rozet "1" içermeli (aktif seçim).
    expect(out).toContain("Beden");
  });
});

describe("ActiveFilterChips", () => {
  it("aktif çip yoksa hiçbir şey render etmez", () => {
    const out = renderToStaticMarkup(<ActiveFilterChips facets={[]} state={state()} currency="TRY" t={t} />);
    expect(out).toBe("");
  });

  it("fiyat + değer çipi + Tümünü temizle", () => {
    const s = withPrice(toggleFilterValue(state(), "renk", "siyah"), 10000, 50000);
    const out = renderToStaticMarkup(
      <ActiveFilterChips facets={[colorFacet()]} state={s} currency="TRY" t={t} />,
    );
    expect(out).toContain("Siyah");
    expect(out).toContain(t.search.clearAll);
    // Her çip gerçek link (href) taşır.
    expect(out).toContain("href=");
  });
});

describe("FilterRail (desktop)", () => {
  it("panel başlığı + aktifken Temizle", () => {
    const s = withInStock(state(), true);
    const out = renderToStaticMarkup(<FilterRail facets={[selectFacet()]} state={s} currency="TRY" t={t} />);
    expect(out).toContain(t.search.filterPanelTitle);
    expect(out).toContain(t.search.clearFilters);
    // lg altında gizli.
    expect(out).toContain("hidden lg:block");
  });
});

describe("FilterDrawer (mobile trigger)", () => {
  it("tetikleyici buton + aktif sayaç rozeti", () => {
    const s = setFilterRange(withInStock(state(), true), "agirlik", 100, 500);
    const out = renderToStaticMarkup(
      <FilterDrawer facets={[rangeFacet()]} state={s} currency="TRY" totalItems={42} t={t} />,
    );
    expect(out).toContain(t.search.filterButton);
    expect(out).toContain('aria-haspopup="dialog"');
    // stok(1)+range(1)=2 aktif → rozet.
    expect(out).toContain("2");
    // Kapalıyken dialog DOM'da yok.
    expect(out).not.toContain('role="dialog"');
  });
});
