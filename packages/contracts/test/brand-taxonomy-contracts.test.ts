// TODO-165A (ADR-165A) — Product Data Governance: Brand + ProductTaxonomyValue +
// size-chart selector contract tests. Mirrors the category selector / size-chart
// contract patterns already in `src/index.ts`.
import { describe, it, expect } from "vitest";
import {
  brandCreateRequestSchema,
  brandUpdateRequestSchema,
  adminBrandListQuerySchema,
  adminBrandSelectorQuerySchema,
  adminBrandSelectorOptionSchema,
  productTaxonomyCreateRequestSchema,
  productTaxonomyUpdateRequestSchema,
  productTaxonomyReorderRequestSchema,
  productTaxonomyQuerySchema,
  publicBrandSummarySchema,
  publicBrandDetailSchema,
  adminSizeChartSelectorQuerySchema,
  adminSizeChartSelectorOptionSchema,
  productCreateRequestSchema,
  productUpdateRequestSchema,
} from "../src/index";
import {
  isProductTaxonomyType,
  getTaxonomyTypeDef,
  PRODUCT_TAXONOMY_TYPES,
  TAXONOMY_TYPE_REGISTRY,
} from "../src/product-taxonomy";

describe("Brand contracts", () => {
  it("brand create requires name; slug optional", () => {
    expect(brandCreateRequestSchema.safeParse({ name: "Nike" }).success).toBe(true);
    expect(brandCreateRequestSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("brand update rejects empty object", () => {
    expect(brandUpdateRequestSchema.safeParse({}).success).toBe(false);
  });

  it("brand update accepts a single field", () => {
    expect(brandUpdateRequestSchema.safeParse({ status: "ARCHIVED" }).success).toBe(true);
  });

  it("admin brand list query allows the documented sortBy allowlist", () => {
    expect(adminBrandListQuerySchema.safeParse({ sortBy: "productCount" }).success).toBe(true);
    expect(adminBrandListQuerySchema.safeParse({ sortBy: "name" }).success).toBe(true);
    expect(adminBrandListQuerySchema.safeParse({ sortBy: "createdAt" }).success).toBe(true);
    expect(adminBrandListQuerySchema.safeParse({ sortBy: "bogus" }).success).toBe(false);
  });

  it("admin brand selector supports dual ?ids= mode", () => {
    expect(adminBrandSelectorQuerySchema.safeParse({ ids: "b1,b2,b3" }).success).toBe(true);
    expect(adminBrandSelectorQuerySchema.safeParse({ search: "nik" }).success).toBe(true);
  });

  it("admin brand selector option shape", () => {
    expect(
      adminBrandSelectorOptionSchema.safeParse({
        id: "b1",
        name: "Nike",
        slug: "nike",
        status: "ACTIVE",
        logoUrl: null,
      }).success,
    ).toBe(true);
  });

  it("public brand summary shape", () => {
    expect(
      publicBrandSummarySchema.safeParse({
        id: "b1",
        name: "Nike",
        slug: "nike",
        logoUrl: null,
        description: null,
      }).success,
    ).toBe(true);
  });

  it("public brand detail extends summary with cover/website/seo/productCount", () => {
    expect(
      publicBrandDetailSchema.safeParse({
        id: "b1",
        name: "Nike",
        slug: "nike",
        logoUrl: null,
        description: null,
        coverUrl: null,
        websiteUrl: null,
        seoTitle: null,
        seoDescription: null,
        productCount: 12,
      }).success,
    ).toBe(true);
  });
});

describe("ProductTaxonomyValue contracts", () => {
  it("taxonomy create requires a known type", () => {
    expect(productTaxonomyCreateRequestSchema.safeParse({ type: "SEASON", name: "SS25" }).success).toBe(true);
    expect(productTaxonomyCreateRequestSchema.safeParse({ type: "NOPE", name: "x" }).success).toBe(false);
  });

  it("taxonomy create requires a name", () => {
    expect(productTaxonomyCreateRequestSchema.safeParse({ type: "SEASON", name: "" }).success).toBe(false);
  });

  it("taxonomy update rejects empty object but accepts one field", () => {
    expect(productTaxonomyUpdateRequestSchema.safeParse({}).success).toBe(false);
    expect(productTaxonomyUpdateRequestSchema.safeParse({ status: "ARCHIVED" }).success).toBe(true);
  });

  it("reorder requires non-empty id list and a known type", () => {
    expect(productTaxonomyReorderRequestSchema.safeParse({ type: "SEASON", orderedIds: [] }).success).toBe(false);
    expect(
      productTaxonomyReorderRequestSchema.safeParse({ type: "SEASON", orderedIds: ["a", "b"] }).success,
    ).toBe(true);
    // Task 10 (ADR-165A): `type` artik zorunlu — route store+type icin ACTIVE tam kume
    // kontrolu yapabilsin diye.
    expect(productTaxonomyReorderRequestSchema.safeParse({ orderedIds: ["a", "b"] }).success).toBe(false);
    expect(
      productTaxonomyReorderRequestSchema.safeParse({ type: "NOPE", orderedIds: ["a", "b"] }).success,
    ).toBe(false);
  });

  it("taxonomy query filters by type and status", () => {
    expect(productTaxonomyQuerySchema.safeParse({ type: "MATERIAL", status: "ACTIVE" }).success).toBe(true);
    expect(productTaxonomyQuerySchema.safeParse({ type: "NOPE" }).success).toBe(false);
  });
});

describe("Size-chart selector contracts", () => {
  it("selector query supports dual ?ids= mode and base filters", () => {
    expect(adminSizeChartSelectorQuerySchema.safeParse({}).success).toBe(true);
    expect(adminSizeChartSelectorQuerySchema.safeParse({ ids: "sc1,sc2" }).success).toBe(true);
  });

  it("selector option carries the documented projection fields", () => {
    expect(
      adminSizeChartSelectorOptionSchema.safeParse({
        id: "sc1",
        name: "Üst Giyim EU",
        sizeSystemKey: "EU",
        gender: null,
        measurementUnit: "CM",
        status: "PUBLISHED",
        revision: 2,
        publishedRevisionId: "rev1",
        previewSummary: "3 sütun × 8 satır",
      }).success,
    ).toBe(true);
  });
});

describe("Product create/update brandId extension", () => {
  it("product create accepts optional nullable brandId", () => {
    const parsed = productCreateRequestSchema.parse({ title: "Tee", slug: "tee", brandId: "brand-1" });
    expect(parsed.brandId).toBe("brand-1");
    expect(productCreateRequestSchema.parse({ title: "Tee", slug: "tee" }).brandId).toBeUndefined();
  });

  it("product update accepts null brandId to clear it", () => {
    expect(productUpdateRequestSchema.parse({ brandId: null }).brandId).toBeNull();
  });
});

describe("product-taxonomy.ts registry (client-safe)", () => {
  it("isProductTaxonomyType guards correctly", () => {
    expect(isProductTaxonomyType("SEASON")).toBe(true);
    expect(isProductTaxonomyType("NOPE")).toBe(false);
  });

  it("getTaxonomyTypeDef returns the fashion.* definition code from canonical-attributes.ts", () => {
    expect(getTaxonomyTypeDef("SEASON").definitionCode).toBe("fashion.season");
    expect(getTaxonomyTypeDef("MATERIAL").definitionCode).toBe("fashion.material");
    expect(getTaxonomyTypeDef("MATERIAL").selectionMode).toBe("MULTI_SELECT");
    expect(getTaxonomyTypeDef("CARE_LABEL").selectionMode).toBe("MULTI_SELECT");
    expect(getTaxonomyTypeDef("SUSTAINABILITY_LABEL").selectionMode).toBe("MULTI_SELECT");
    expect(getTaxonomyTypeDef("FIT").selectionMode).toBe("SELECT");
  });

  it("every registry entry has at least one canonical default value", () => {
    for (const type of PRODUCT_TAXONOMY_TYPES) {
      expect(TAXONOMY_TYPE_REGISTRY[type].canonical.length).toBeGreaterThan(0);
    }
  });

  it("PRODUCT_TAXONOMY_TYPES has exactly the 11 documented types", () => {
    expect(PRODUCT_TAXONOMY_TYPES.sort()).toEqual(
      [
        "SEASON",
        "COLLECTION",
        "MATERIAL",
        "FIT",
        "PATTERN",
        "COLLAR",
        "SLEEVE",
        "LENGTH",
        "CARE_LABEL",
        "SUSTAINABILITY_LABEL",
        "COLOR_FAMILY",
      ].sort(),
    );
  });
});
