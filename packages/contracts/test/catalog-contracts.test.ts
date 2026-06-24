import { describe, expect, it } from "vitest";
import {
  inventoryAdjustRequestSchema,
  productCreateRequestSchema,
  productVariantCreateRequestSchema,
} from "../src/index.js";

describe("catalog contracts", () => {
  it("parses product create input with category ids", () => {
    const parsed = productCreateRequestSchema.parse({
      title: "Demo Hoodie",
      slug: "demo-hoodie",
      status: "ACTIVE",
      categoryIds: ["cat_1"],
    });
    expect(parsed).toMatchObject({ type: "PHYSICAL", categoryIds: ["cat_1"] });
  });

  it("requires minor-unit integer prices and compare-at not below price", () => {
    expect(() =>
      productVariantCreateRequestSchema.parse({
        title: "Default",
        sku: "SKU-1",
        priceMinor: 1299.5,
      }),
    ).toThrow();
    expect(() =>
      productVariantCreateRequestSchema.parse({
        title: "Default",
        sku: "SKU-1",
        priceMinor: 129900,
        compareAtMinor: 99900,
      }),
    ).toThrow();
  });

  it("accepts positive and negative non-zero inventory adjustments", () => {
    expect(inventoryAdjustRequestSchema.parse({ quantityDelta: 5 }).quantityDelta).toBe(5);
    expect(inventoryAdjustRequestSchema.parse({ quantityDelta: -2 }).quantityDelta).toBe(-2);
    expect(() => inventoryAdjustRequestSchema.parse({ quantityDelta: 0 })).toThrow();
  });
});
