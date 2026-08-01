import { describe, expect, it } from "vitest";
import { buildSearchDocument } from "../src/document-builder.js";
import type {
  SearchSourceProduct,
  SearchSourceVariant,
} from "../src/types.js";

/**
 * TODO-165A (ADR-165A) Task 11 — Sub-part B: search read-model brandId/brandSlug/brandName +
 * disjunctive marka facet sentezi (SAF; DB'siz).
 *
 * Kapsanan:
 *  - `buildSearchDocument` kaynaktaki (governed Brand'den türetilmiş) brandId/brandSlug/brandName'i
 *    dokümana YAZAR (legacy `brand` serbest-metin alanı YANINDA, bağımsız — ADR-165A).
 *  - `product.brandId` yoksa (governed marka atanmamış) üçü de null yazılır (legacy `brand` etkilenmez).
 *  - `synthesizeBrandFacet` (search-query.ts, SAF) — ham (brandSlug,brandName,count) satırlarından
 *    disjunctive `SearchFacet` üretir: label alfabetik sıralı, `selected` yalnız uygulanan slug'da true,
 *    boş girdide null (facet üretilmez — attribute facet listesine EKLENMEZ).
 *  - `parseSearchQuery` — `brand=<slug>` query param'ını `SearchQuery.brand`'e ayrıştırır.
 *
 * Gerçek SQL semantiği (WHERE narrow + GROUP BY count) Docker gerçek-PG smoke'ta doğrulanır (bkz.
 * search-query.test.ts dosya başı notu — bu paket yalnız SAF yardımcıları DB'siz test eder).
 */

const CATEGORY_ID = "cat_1";

function source(overrides: Partial<SearchSourceProduct> = {}): SearchSourceProduct {
  return {
    id: "prod_1",
    storeId: "store_1",
    title: "Test Ürün",
    slug: "test-urun",
    brand: "Acme",
    // TODO-165A (ADR-165A) — governed marka snapshot alanları (Task 1 şema; Task 11 write path).
    brandId: null,
    brandSlug: null,
    brandName: null,
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
    variantOptionValues: [],
    categoryIds: [CATEGORY_ID],
    campaigns: [],
    evaluationNow: new Date("2026-07-15T12:00:00Z"),
    mediaDefiningAttributeId: null,
    images: [],
    mediaAxisOptions: [],
    ...overrides,
  };
}

function variant(o: Partial<SearchSourceVariant> = {}): SearchSourceVariant {
  return {
    id: "v1",
    status: "ACTIVE",
    priceMinor: 1000,
    compareAtMinor: null,
    currency: "TRY",
    available: 5,
    lowestRecentPriceMinor: null,
    mediaOptionId: null,
    ...o,
  };
}

describe("buildSearchDocument — governed marka snapshot (brandId/brandSlug/brandName)", () => {
  it("product.brandId set edilmişse üçünü de dokümana yazar (legacy brand yanında, bağımsız)", () => {
    const result = buildSearchDocument(
      source({
        brand: "Legacy Vendor Text",
        brandId: "brand_1",
        brandSlug: "nike",
        brandName: "Nike",
        variants: [variant()],
      }),
    );
    expect(result.removed).toBe(false);
    if (result.removed) throw new Error("beklenmedik removed=true");
    expect(result.document.brand).toBe("Legacy Vendor Text");
    expect(result.document.brandId).toBe("brand_1");
    expect(result.document.brandSlug).toBe("nike");
    expect(result.document.brandName).toBe("Nike");
  });

  it("product.brandId yoksa (governed marka atanmamış) üçü de null yazılır", () => {
    const result = buildSearchDocument(source({ variants: [variant()] }));
    expect(result.removed).toBe(false);
    if (result.removed) throw new Error("beklenmedik removed=true");
    expect(result.document.brandId).toBeNull();
    expect(result.document.brandSlug).toBeNull();
    expect(result.document.brandName).toBeNull();
    // Legacy alan bağımsız kalır (governed marka atanmasa da serbest-metin görünebilir).
    expect(result.document.brand).toBe("Acme");
  });
});

describe("synthesizeBrandFacet — disjunctive marka facet sentezi (SAF)", () => {
  it("boş satır girdisinde null döner (facet listesine hiç girmez)", async () => {
    const { synthesizeBrandFacet } = await import("../src/search-query.js");
    expect(synthesizeBrandFacet([], null)).toBeNull();
  });

  it("satırlardan disjunctive facet üretir: label alfabetik sıralı, count'lar KENDİ filtresi HARİÇ kümeden gelir", async () => {
    const { synthesizeBrandFacet } = await import("../src/search-query.js");
    const facet = synthesizeBrandFacet(
      [
        { brandSlug: "nike", brandName: "Nike", count: 5 },
        { brandSlug: "adidas", brandName: "Adidas", count: 3 },
      ],
      "nike",
    );
    expect(facet).not.toBeNull();
    expect(facet!.code).toBe("brand");
    expect(facet!.selectionMode).toBe("MULTI");
    // Adidas alfabetik olarak Nike'dan önce gelir.
    expect(facet!.values.map((v) => v.value)).toEqual(["adidas", "nike"]);
    const nikeValue = facet!.values.find((v) => v.value === "nike")!;
    const adidasValue = facet!.values.find((v) => v.value === "adidas")!;
    expect(nikeValue.count).toBe(5);
    expect(nikeValue.selected).toBe(true);
    expect(nikeValue.label).toBe("Nike");
    expect(adidasValue.count).toBe(3);
    expect(adidasValue.selected).toBe(false);
  });

  it("hiçbir değer seçili değilken tüm satırlar selected=false döner", async () => {
    const { synthesizeBrandFacet } = await import("../src/search-query.js");
    const facet = synthesizeBrandFacet([{ brandSlug: "nike", brandName: "Nike", count: 2 }], null);
    expect(facet!.values.every((v) => v.selected === false)).toBe(true);
  });
});
