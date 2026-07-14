import { describe, expect, it } from "vitest";
import {
  productAttributeValueInputSchema,
  variantAttributeValueInputSchema,
  productAttributeValuesReplaceRequestSchema,
  variantAttributeValuesReplaceRequestSchema,
  productCreateRequestSchema,
  productUpdateRequestSchema,
  productVariantCreateRequestSchema,
  productVariantUpdateRequestSchema,
} from "../src/index.js";

describe("Faz 2A (ADR-068) — attribute value input schemas", () => {
  it("accepts a text value input", () => {
    const parsed = productAttributeValueInputSchema.parse({
      attributeDefinitionId: "attr_1",
      valueText: "hello",
    });
    expect(parsed.valueText).toBe("hello");
  });

  it("accepts a MULTI_SELECT optionIds input", () => {
    const parsed = productAttributeValueInputSchema.parse({
      attributeDefinitionId: "attr_1",
      optionIds: ["o1", "o2"],
    });
    expect(parsed.optionIds).toEqual(["o1", "o2"]);
  });

  it("rejects a non-ISO date string", () => {
    expect(() =>
      productAttributeValueInputSchema.parse({ attributeDefinitionId: "a", valueDate: "2026-07-14" }),
    ).toThrow();
  });

  it("requires attributeDefinitionId", () => {
    expect(() => productAttributeValueInputSchema.parse({ valueText: "x" })).toThrow();
  });

  it("variant input only exposes text/option fields", () => {
    const parsed = variantAttributeValueInputSchema.parse({
      attributeDefinitionId: "a",
      optionId: "o1",
    });
    expect(parsed).toMatchObject({ attributeDefinitionId: "a", optionId: "o1" });
    // valueInteger is not part of the variant input shape (stripped).
    const withExtra = variantAttributeValueInputSchema.parse({
      attributeDefinitionId: "a",
      valueText: "x",
      // @ts-expect-error — extra field is not in the schema
      valueInteger: 5,
    });
    expect("valueInteger" in withExtra).toBe(false);
  });

  it("replace request wraps values array", () => {
    const parsed = productAttributeValuesReplaceRequestSchema.parse({ values: [] });
    expect(parsed.values).toEqual([]);
    const variant = variantAttributeValuesReplaceRequestSchema.parse({
      values: [{ attributeDefinitionId: "a", valueText: "x" }],
    });
    expect(variant.values).toHaveLength(1);
  });
});

describe("Faz 2A (ADR-068) — backward compatibility of product/variant schemas", () => {
  it("product create still parses WITHOUT attributeValues (old clients unaffected)", () => {
    const parsed = productCreateRequestSchema.parse({ title: "Tee", slug: "tee" });
    expect(parsed.attributeValues).toBeUndefined();
  });

  it("product create accepts an attributeValues array", () => {
    const parsed = productCreateRequestSchema.parse({
      title: "Tee",
      slug: "tee",
      attributeValues: [{ attributeDefinitionId: "a", valueText: "x" }],
    });
    expect(parsed.attributeValues).toHaveLength(1);
  });

  it("product update accepts attributeValues alone (satisfies non-empty refine)", () => {
    const parsed = productUpdateRequestSchema.parse({
      attributeValues: [{ attributeDefinitionId: "a", valueText: "x" }],
    });
    expect(parsed.attributeValues).toHaveLength(1);
  });

  it("product update allows an empty attributeValues array (clear-all)", () => {
    const parsed = productUpdateRequestSchema.parse({ attributeValues: [] });
    expect(parsed.attributeValues).toEqual([]);
  });

  it("variant create still parses WITHOUT attributeValues", () => {
    const parsed = productVariantCreateRequestSchema.parse({
      title: "V",
      sku: "SKU-1",
      priceMinor: 1000,
    });
    expect(parsed.attributeValues).toBeUndefined();
  });

  it("variant create/update accept attributeValues", () => {
    const created = productVariantCreateRequestSchema.parse({
      title: "V",
      sku: "SKU-1",
      priceMinor: 1000,
      attributeValues: [{ attributeDefinitionId: "a", optionId: "o1" }],
    });
    expect(created.attributeValues).toHaveLength(1);
    const updated = productVariantUpdateRequestSchema.parse({
      attributeValues: [{ attributeDefinitionId: "a", valueText: "x" }],
    });
    expect(updated.attributeValues).toHaveLength(1);
  });
});
