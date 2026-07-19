import { describe, expect, it, vi } from "vitest";

// search-query → @commerce-os/db (prisma) transitively? No — search-query imports only @prisma/client
// (Prisma.sql) + types + normalize. Ama postgres-provider/index zinciri prisma init edebilir; SAF
// yardımcıları test etmek için doğrudan modülden import ediyoruz (DB YOK).
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const {
  assembleFacets,
  computePagination,
  deriveSelectionMode,
  escapeLike,
} = await import("../src/search-query.js");
import type {
  FacetCountRow,
  FacetMetaRow,
  FacetRangeRow,
  OptionMetaRow,
} from "../src/search-query.js";
import type { SearchFilter } from "../src/types.js";

/**
 * TODO-155 (ADR-079) — Faz 2C-8B · Public search SAF yardımcı testleri (DB'siz).
 * Facet birleştirme (assembleFacets) + pagination matematiği + selectionMode + LIKE kaçış.
 * Gerçek SQL semantiği (OR/AND/count/tenant) Docker gerçek-PG smoke'ta doğrulanır.
 */

describe("deriveSelectionMode", () => {
  it("numeric/date → RANGE, boolean → BOOLEAN, diğer → MULTI", () => {
    expect(deriveSelectionMode("INTEGER")).toBe("RANGE");
    expect(deriveSelectionMode("DECIMAL")).toBe("RANGE");
    expect(deriveSelectionMode("DATE")).toBe("RANGE");
    expect(deriveSelectionMode("BOOLEAN")).toBe("BOOLEAN");
    expect(deriveSelectionMode("SELECT")).toBe("MULTI");
    expect(deriveSelectionMode("MULTI_SELECT")).toBe("MULTI");
    expect(deriveSelectionMode("COLOR")).toBe("MULTI");
    expect(deriveSelectionMode("TEXT")).toBe("MULTI");
  });
});

describe("computePagination", () => {
  it("sayfa 1 / boş sonuç", () => {
    expect(computePagination(1, 24, 0)).toEqual({
      page: 1,
      pageSize: 24,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });
  it("sayfa 1 / çok sayfa → hasNext true, hasPrev false", () => {
    const p = computePagination(1, 10, 25);
    expect(p.totalPages).toBe(3);
    expect(p.hasNextPage).toBe(true);
    expect(p.hasPreviousPage).toBe(false);
  });
  it("sayfa 2 ( orta) → her iki yön true", () => {
    const p = computePagination(2, 10, 25);
    expect(p.hasNextPage).toBe(true);
    expect(p.hasPreviousPage).toBe(true);
  });
  it("son sayfa → hasNext false", () => {
    const p = computePagination(3, 10, 25);
    expect(p.hasNextPage).toBe(false);
    expect(p.hasPreviousPage).toBe(true);
  });
  it("tam bölünen toplam → totalPages doğru", () => {
    expect(computePagination(1, 10, 20).totalPages).toBe(2);
  });
});

describe("escapeLike", () => {
  it("% _ \\ kaçışlanır (kullanıcı wildcard'ı tüm satırı eşleştiremez)", () => {
    expect(escapeLike("50%")).toBe("50\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("x\\y")).toBe("x\\\\y");
  });
});

// ── assembleFacets ──

const colorMeta: FacetMetaRow = {
  attributeDefinitionId: "def_color",
  code: "renk",
  name: "Renk",
  dataType: "COLOR",
  unit: null,
  displayOrder: 1,
};
const sizeMeta: FacetMetaRow = {
  attributeDefinitionId: "def_size",
  code: "beden",
  name: "Beden",
  dataType: "SELECT",
  unit: null,
  displayOrder: 2,
};
const ramMeta: FacetMetaRow = {
  attributeDefinitionId: "def_ram",
  code: "ram",
  name: "RAM",
  dataType: "INTEGER",
  unit: "GB",
  displayOrder: 3,
};
const waterproofMeta: FacetMetaRow = {
  attributeDefinitionId: "def_wp",
  code: "su-gecirmez",
  name: "Su Geçirmez",
  dataType: "BOOLEAN",
  unit: null,
  displayOrder: 4,
};

const colorOptions: OptionMetaRow[] = [
  { id: "opt_black", attributeDefinitionId: "def_color", value: "siyah", label: "Siyah", colorHex: "#000000", sortOrder: 0 },
  { id: "opt_white", attributeDefinitionId: "def_color", value: "beyaz", label: "Beyaz", colorHex: "#FFFFFF", sortOrder: 1 },
];

describe("assembleFacets", () => {
  it("COLOR facet: option değerleri + colorHex + count + seçili durumu + sortOrder sırası", () => {
    const counts: FacetCountRow[] = [
      { attributeDefinitionId: "def_color", optionId: "opt_white", normalizedText: null, valueBoolean: null, count: 3 },
      { attributeDefinitionId: "def_color", optionId: "opt_black", normalizedText: null, valueBoolean: null, count: 5 },
    ];
    const filters: SearchFilter[] = [{ code: "renk", values: ["siyah"] }];
    const facets = assembleFacets({ meta: [colorMeta], counts, ranges: [], options: colorOptions, filters });

    expect(facets).toHaveLength(1);
    const f = facets[0];
    expect(f.code).toBe("renk");
    expect(f.selectionMode).toBe("MULTI");
    // sortOrder ASC → Siyah(0) önce, Beyaz(1) sonra (count sırası değil).
    expect(f.values.map((v) => v.value)).toEqual(["siyah", "beyaz"]);
    expect(f.values[0]).toMatchObject({ label: "Siyah", colorHex: "#000000", count: 5, selected: true });
    expect(f.values[1]).toMatchObject({ label: "Beyaz", colorHex: "#FFFFFF", count: 3, selected: false });
  });

  it("archived/bilinmeyen option (meta yok) facet değerine çıkmaz", () => {
    const counts: FacetCountRow[] = [
      { attributeDefinitionId: "def_color", optionId: "opt_black", normalizedText: null, valueBoolean: null, count: 5 },
      { attributeDefinitionId: "def_color", optionId: "opt_archived", normalizedText: null, valueBoolean: null, count: 2 },
    ];
    const facets = assembleFacets({ meta: [colorMeta], counts, ranges: [], options: colorOptions, filters: [] });
    expect(facets[0].values.map((v) => v.optionId)).toEqual(["opt_black"]);
  });

  it("BOOLEAN facet: true/false değerleri + count + seçili", () => {
    const counts: FacetCountRow[] = [
      { attributeDefinitionId: "def_wp", optionId: null, normalizedText: null, valueBoolean: true, count: 4 },
      { attributeDefinitionId: "def_wp", optionId: null, normalizedText: null, valueBoolean: false, count: 1 },
    ];
    const filters: SearchFilter[] = [{ code: "su-gecirmez", values: ["true"] }];
    const facets = assembleFacets({ meta: [waterproofMeta], counts, ranges: [], options: [], filters });
    const f = facets[0];
    expect(f.selectionMode).toBe("BOOLEAN");
    const trueVal = f.values.find((v) => v.value === "true");
    expect(trueVal).toMatchObject({ label: "Evet", count: 4, selected: true });
    expect(f.values.find((v) => v.value === "false")).toMatchObject({ selected: false });
  });

  it("INTEGER facet: range (availableMin/Max + selectedMin/Max), values boş", () => {
    const ranges: FacetRangeRow[] = [{ attributeDefinitionId: "def_ram", availableMin: 8, availableMax: 64 }];
    const filters: SearchFilter[] = [{ code: "ram", min: 16, max: 32 }];
    const facets = assembleFacets({ meta: [ramMeta], counts: [], ranges, options: [], filters });
    const f = facets[0];
    expect(f.selectionMode).toBe("RANGE");
    expect(f.values).toEqual([]);
    expect(f.range).toEqual({ availableMin: 8, availableMax: 64, selectedMin: 16, selectedMax: 32 });
    expect(f.unit).toBe("GB");
  });

  it("facet sırası displayOrder ASC (renk<beden<ram<boolean)", () => {
    const facets = assembleFacets({
      meta: [ramMeta, colorMeta, waterproofMeta, sizeMeta],
      counts: [],
      ranges: [],
      options: [],
      filters: [],
    });
    expect(facets.map((f) => f.code)).toEqual(["renk", "beden", "ram", "su-gecirmez"]);
  });

  it("count satırı doğrudan yansır (bu katman şişirmez — COUNT DISTINCT SQL'de)", () => {
    const counts: FacetCountRow[] = [
      { attributeDefinitionId: "def_color", optionId: "opt_black", normalizedText: null, valueBoolean: null, count: 7 },
    ];
    const facets = assembleFacets({ meta: [colorMeta], counts, ranges: [], options: colorOptions, filters: [] });
    expect(facets[0].values[0].count).toBe(7);
  });

  it("IMAGE/FILE dataType facet üretmez (savunma)", () => {
    const imgMeta: FacetMetaRow = {
      attributeDefinitionId: "def_img",
      code: "gorsel",
      name: "Görsel",
      dataType: "IMAGE",
      unit: null,
      displayOrder: 1,
    };
    expect(assembleFacets({ meta: [imgMeta], counts: [], ranges: [], options: [], filters: [] })).toEqual([]);
  });
});
