import { describe, expect, it } from "vitest";
import { buildSearchDocument } from "../src/document-builder.js";
import type {
  SearchSourceCategoryAttribute,
  SearchSourceProduct,
  SearchSourceProductAttributeValue,
  SearchSourceVariant,
  SearchSourceVariantAttributeValue,
} from "../src/types.js";

/**
 * TODO-154 (ADR-079) — Faz 2C-8A · Deterministik document builder testleri (SAF; DB'siz).
 * Section 9 senaryolarının çekirdeği: indeksleme, min/max fiyat, stok, filterable ürün/varyant
 * attribute, dedupe, typed değerler, archived davranışı, unpublished→removed.
 */

const CATEGORY_ID = "cat_1";

function source(overrides: Partial<SearchSourceProduct> = {}): SearchSourceProduct {
  return {
    id: "prod_1",
    storeId: "store_1",
    title: "Test Ürün",
    slug: "test-urun",
    brand: "Acme",
    description: "Açıklama",
    status: "ACTIVE",
    priceVisible: true,
    primaryCategoryId: CATEGORY_ID,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    variants: [],
    categoryAttributes: [],
    productAttributeValues: [],
    variantAttributeValues: [],
    ...overrides,
  };
}

function variant(o: Partial<SearchSourceVariant> = {}): SearchSourceVariant {
  return { id: "v1", status: "ACTIVE", priceMinor: 1000, currency: "TRY", available: 5, ...o };
}

function categoryAttr(o: Partial<SearchSourceCategoryAttribute>): SearchSourceCategoryAttribute {
  return {
    attributeDefinitionId: "def_1",
    filterable: true,
    searchable: false,
    variantDefining: false,
    code: "renk",
    name: "Renk",
    dataType: "SELECT",
    definitionStatus: "ACTIVE",
    ...o,
  };
}

function pav(o: Partial<SearchSourceProductAttributeValue>): SearchSourceProductAttributeValue {
  return {
    attributeDefinitionId: "def_1",
    valueText: null,
    valueInteger: null,
    valueDecimal: null,
    valueBoolean: null,
    valueDate: null,
    option: null,
    multiOptions: [],
    ...o,
  };
}

function expectDoc(result: ReturnType<typeof buildSearchDocument>) {
  if (result.removed) throw new Error("beklenmeyen removed sonucu");
  return result;
}

describe("buildSearchDocument · görünürlük", () => {
  it("ACTIVE ürünü indeksler", () => {
    const r = buildSearchDocument(source());
    expect(r.removed).toBe(false);
  });

  it("DRAFT ürünü read-model'den kaldırır (removed)", () => {
    expect(buildSearchDocument(source({ status: "DRAFT" }))).toEqual({ removed: true });
  });

  it("ARCHIVED ürünü read-model'den kaldırır (removed)", () => {
    expect(buildSearchDocument(source({ status: "ARCHIVED" }))).toEqual({ removed: true });
  });
});

describe("buildSearchDocument · fiyat projeksiyonu", () => {
  it("çoklu varyantta min/max fiyat türetir", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          variants: [
            variant({ id: "v1", priceMinor: 3000 }),
            variant({ id: "v2", priceMinor: 1500 }),
            variant({ id: "v3", priceMinor: 2200 }),
          ],
        }),
      ),
    );
    expect(r.document.minPriceMinor).toBe(1500);
    expect(r.document.maxPriceMinor).toBe(3000);
    expect(r.document.currency).toBe("TRY");
    expect(r.document.variantCount).toBe(3);
  });

  it("priceVisible=false ise fiyat null (sızmaz)", () => {
    const r = expectDoc(
      buildSearchDocument(source({ priceVisible: false, variants: [variant({ priceMinor: 999 })] })),
    );
    expect(r.document.minPriceMinor).toBeNull();
    expect(r.document.maxPriceMinor).toBeNull();
    expect(r.document.currency).toBeNull();
  });

  it("ACTIVE varyant yoksa fiyat null", () => {
    const r = expectDoc(buildSearchDocument(source({ variants: [] })));
    expect(r.document.minPriceMinor).toBeNull();
    expect(r.document.variantCount).toBe(0);
  });

  it("DRAFT varyant fiyata/stoğa katılmaz", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({ variants: [variant({ id: "v1", status: "DRAFT", priceMinor: 100, available: 9 })] }),
      ),
    );
    expect(r.document.minPriceMinor).toBeNull();
    expect(r.document.variantCount).toBe(0);
    expect(r.document.hasStock).toBe(false);
  });
});

describe("buildSearchDocument · stok projeksiyonu", () => {
  it("available>0 → IN_STOCK", () => {
    const r = expectDoc(buildSearchDocument(source({ variants: [variant({ available: 3 })] })));
    expect(r.document.hasStock).toBe(true);
    expect(r.document.availability).toBe("IN_STOCK");
  });

  it("tüm varyantlar available=0 → OUT_OF_STOCK", () => {
    const r = expectDoc(
      buildSearchDocument(source({ variants: [variant({ id: "v1", available: 0 })] })),
    );
    expect(r.document.hasStock).toBe(false);
    expect(r.document.availability).toBe("OUT_OF_STOCK");
  });

  it("available=null (envanter kaydı yok) stokta sayılır", () => {
    const r = expectDoc(
      buildSearchDocument(source({ variants: [variant({ id: "v1", available: null })] })),
    );
    expect(r.document.hasStock).toBe(true);
  });
});

describe("buildSearchDocument · facet (filterable) üretimi", () => {
  it("SELECT ürün attribute → optionId facet", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ dataType: "SELECT" })],
          productAttributeValues: [
            pav({ option: { id: "opt_red", value: "Kırmızı", label: "Kırmızı", status: "ACTIVE" } }),
          ],
        }),
      ),
    );
    expect(r.facets).toHaveLength(1);
    expect(r.facets[0]).toMatchObject({
      attributeDefinitionId: "def_1",
      optionId: "opt_red",
      categoryId: CATEGORY_ID,
      normalizedText: "kırmızı",
    });
  });

  it("INTEGER/DECIMAL/BOOLEAN/DATE/TEXT typed kolonlara yazar", () => {
    const date = new Date("2026-03-03T00:00:00Z");
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [
            categoryAttr({ attributeDefinitionId: "d_int", dataType: "INTEGER" }),
            categoryAttr({ attributeDefinitionId: "d_dec", dataType: "DECIMAL" }),
            categoryAttr({ attributeDefinitionId: "d_bool", dataType: "BOOLEAN" }),
            categoryAttr({ attributeDefinitionId: "d_date", dataType: "DATE" }),
            categoryAttr({ attributeDefinitionId: "d_txt", dataType: "TEXT" }),
          ],
          productAttributeValues: [
            pav({ attributeDefinitionId: "d_int", valueInteger: 16 }),
            pav({ attributeDefinitionId: "d_dec", valueDecimal: "12.5" }),
            pav({ attributeDefinitionId: "d_bool", valueBoolean: true }),
            pav({ attributeDefinitionId: "d_date", valueDate: date }),
            pav({ attributeDefinitionId: "d_txt", valueText: "Pamuk" }),
          ],
        }),
      ),
    );
    const byDef = Object.fromEntries(r.facets.map((f) => [f.attributeDefinitionId, f]));
    expect(byDef.d_int.valueNumber).toBe("16");
    expect(byDef.d_dec.valueNumber).toBe("12.5");
    expect(byDef.d_bool.valueBoolean).toBe(true);
    expect(byDef.d_date.valueDate).toEqual(date);
    expect(byDef.d_txt.valueText).toBe("Pamuk");
    expect(byDef.d_txt.normalizedText).toBe("pamuk");
  });

  it("MULTI_SELECT → seçenek başına ayrı satır", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ dataType: "MULTI_SELECT" })],
          productAttributeValues: [
            pav({
              multiOptions: [
                { id: "o1", value: "A", label: "A", status: "ACTIVE" },
                { id: "o2", value: "B", label: "B", status: "ACTIVE" },
              ],
            }),
          ],
        }),
      ),
    );
    expect(r.facets.map((f) => f.optionId).sort()).toEqual(["o1", "o2"]);
  });

  it("variantDefining attribute → varyant değerlerinden facet (çoklu varyantta aynı değer TEKİLLEŞİR)", () => {
    const vav = (o: Partial<SearchSourceVariantAttributeValue>): SearchSourceVariantAttributeValue => ({
      variantId: "v1",
      attributeDefinitionId: "def_1",
      valueText: null,
      option: null,
      ...o,
    });
    const opt = { id: "opt_s", value: "S", label: "S", status: "ACTIVE" as const };
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ variantDefining: true })],
          variantAttributeValues: [
            vav({ variantId: "v1", option: opt }),
            vav({ variantId: "v2", option: opt }), // aynı beden, farklı varyant → tek facet
          ],
        }),
      ),
    );
    expect(r.facets).toHaveLength(1);
    expect(r.facets[0].optionId).toBe("opt_s");
  });

  it("primaryCategory yoksa facet üretilmez", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          primaryCategoryId: null,
          categoryAttributes: [],
          productAttributeValues: [pav({ option: { id: "o", value: "x", label: "x", status: "ACTIVE" } })],
        }),
      ),
    );
    expect(r.facets).toHaveLength(0);
  });

  it("filterable=false attribute facet üretmez", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ filterable: false })],
          productAttributeValues: [pav({ option: { id: "o", value: "x", label: "x", status: "ACTIVE" } })],
        }),
      ),
    );
    expect(r.facets).toHaveLength(0);
  });

  it("IMAGE/FILE facet'lenmez", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ dataType: "IMAGE" })],
          productAttributeValues: [pav({ valueText: "x" })],
        }),
      ),
    );
    expect(r.facets).toHaveLength(0);
  });
});

describe("buildSearchDocument · archived/inactive davranışı", () => {
  it("ARCHIVED definition facet üretmez", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ definitionStatus: "ARCHIVED" })],
          productAttributeValues: [pav({ option: { id: "o", value: "x", label: "x", status: "ACTIVE" } })],
        }),
      ),
    );
    expect(r.facets).toHaveLength(0);
  });

  it("ARCHIVED option facet dışı bırakılır", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ dataType: "SELECT" })],
          productAttributeValues: [
            pav({ option: { id: "o_old", value: "eski", label: "Eski", status: "ARCHIVED" } }),
          ],
        }),
      ),
    );
    expect(r.facets).toHaveLength(0);
  });
});

describe("buildSearchDocument · searchText", () => {
  it("title + brand + searchable attribute + açıklama içerir (normalize)", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          title: "Kışlık MONT",
          brand: "NORTH",
          description: "Sıcak tutar",
          categoryAttributes: [categoryAttr({ searchable: true, filterable: false, dataType: "SELECT" })],
          productAttributeValues: [
            pav({ option: { id: "o", value: "kirmizi", label: "Kırmızı", status: "ACTIVE" } }),
          ],
        }),
      ),
    );
    expect(r.document.searchText).toContain("kışlık mont");
    expect(r.document.searchText).toContain("north");
    expect(r.document.searchText).toContain("kırmızı");
    expect(r.document.searchText).toContain("sıcak tutar");
  });

  it("searchable=false attribute searchText'e girmez", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          title: "Ürün",
          brand: null,
          description: null,
          categoryAttributes: [categoryAttr({ searchable: false, filterable: true, dataType: "TEXT" })],
          productAttributeValues: [pav({ valueText: "GizliDeğer" })],
        }),
      ),
    );
    expect(r.document.searchText).not.toContain("gizlideğer");
  });
});
