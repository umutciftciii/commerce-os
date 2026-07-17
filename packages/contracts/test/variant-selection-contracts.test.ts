import { describe, expect, it } from "vitest";
import {
  productVariantSelectionInputSchema,
  productVariantSelectionSchema,
  productVariantSelectionsReplaceRequestSchema,
  productCreateRequestSchema,
  productUpdateRequestSchema,
} from "../src/index.js";

describe("Faz 2C-1 (ADR-070) — variant selection input schemas", () => {
  it("accepts an attribute with option ids", () => {
    const parsed = productVariantSelectionInputSchema.parse({
      attributeDefinitionId: "attr_color",
      optionIds: ["black", "white"],
    });
    expect(parsed).toEqual({ attributeDefinitionId: "attr_color", optionIds: ["black", "white"] });
  });

  it("accepts an empty optionIds array (≥1 rule lives in the service, not zod)", () => {
    const parsed = productVariantSelectionInputSchema.parse({
      attributeDefinitionId: "attr_color",
      optionIds: [],
    });
    expect(parsed.optionIds).toEqual([]);
  });

  it("requires attributeDefinitionId", () => {
    expect(() => productVariantSelectionInputSchema.parse({ optionIds: ["x"] })).toThrow();
  });

  it("read projection echoes dataType + position + optionIds", () => {
    const parsed = productVariantSelectionSchema.parse({
      attributeDefinitionId: "attr_color",
      dataType: "SELECT",
      position: 0,
      optionIds: ["black"],
      createdAt: "2026-07-17T00:00:00.000Z",
      updatedAt: "2026-07-17T00:00:00.000Z",
    });
    expect(parsed).toMatchObject({ dataType: "SELECT", position: 0, optionIds: ["black"] });
  });

  it("replace request wraps a selections array", () => {
    const parsed = productVariantSelectionsReplaceRequestSchema.parse({
      selections: [{ attributeDefinitionId: "a", optionIds: ["o1"] }],
    });
    expect(parsed.selections).toHaveLength(1);
  });
});

describe("Faz 2C-1 (ADR-070) — embedded variantSelections is optional (legacy compatibility)", () => {
  it("product create omits variantSelections by default (undefined)", () => {
    const parsed = productCreateRequestSchema.parse({ title: "T", slug: "t-shirt" });
    expect(parsed.variantSelections).toBeUndefined();
  });

  it("product create accepts embedded variantSelections", () => {
    const parsed = productCreateRequestSchema.parse({
      title: "T",
      slug: "t-shirt",
      variantSelections: [{ attributeDefinitionId: "attr_color", optionIds: ["black"] }],
    });
    expect(parsed.variantSelections).toEqual([{ attributeDefinitionId: "attr_color", optionIds: ["black"] }]);
  });

  it("product update accepts an empty variantSelections array (clear-all)", () => {
    const parsed = productUpdateRequestSchema.parse({ variantSelections: [] });
    expect(parsed.variantSelections).toEqual([]);
  });
});
