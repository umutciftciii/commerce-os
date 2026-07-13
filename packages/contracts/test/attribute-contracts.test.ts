import { describe, expect, it } from "vitest";
import {
  attributeDefinitionCreateRequestSchema,
  attributeDefinitionUpdateRequestSchema,
  attributeGroupCreateRequestSchema,
  attributeOptionCreateRequestSchema,
  categoryAttributeCreateRequestSchema,
  categoryAttributeUpdateRequestSchema,
} from "../src/index.js";

// Faz 1B (ADR-067) — Attribute katalog cekirdegi kontratlari.
describe("attribute contracts", () => {
  it("parses an attribute create request with defaults (scope/storeId route-derived)", () => {
    const parsed = attributeDefinitionCreateRequestSchema.parse({
      code: "screen_size",
      name: "Screen Size",
      dataType: "DECIMAL",
      unit: "inch",
    });
    expect(parsed).toMatchObject({ code: "screen_size", dataType: "DECIMAL", status: "ACTIVE" });
    // scope + storeId govdede YOK (route turer).
    expect("scope" in parsed).toBe(false);
    expect("storeId" in parsed).toBe(false);
  });

  it("rejects an invalid code shape", () => {
    expect(() =>
      attributeDefinitionCreateRequestSchema.parse({ code: "Bad Code", name: "X", dataType: "TEXT" }),
    ).toThrow();
    expect(() =>
      attributeDefinitionCreateRequestSchema.parse({ code: "ok_code-2", name: "X", dataType: "TEXT" }),
    ).not.toThrow();
  });

  it("rejects an unknown data type", () => {
    expect(() =>
      attributeDefinitionCreateRequestSchema.parse({ code: "x", name: "X", dataType: "JSON" }),
    ).toThrow();
  });

  it("accepts code + dataType on update (route enforces immutability), but rejects empty patch", () => {
    const parsed = attributeDefinitionUpdateRequestSchema.parse({ code: "same", dataType: "TEXT" });
    expect(parsed).toMatchObject({ code: "same", dataType: "TEXT" });
    expect(() => attributeDefinitionUpdateRequestSchema.parse({})).toThrow();
  });

  it("validates option colorHex shape", () => {
    expect(() =>
      attributeOptionCreateRequestSchema.parse({ value: "red", label: "Red", colorHex: "#ff0000" }),
    ).not.toThrow();
    expect(() =>
      attributeOptionCreateRequestSchema.parse({ value: "red", label: "Red", colorHex: "red" }),
    ).toThrow();
  });

  it("applies category attribute behavior defaults", () => {
    const parsed = categoryAttributeCreateRequestSchema.parse({ attributeDefinitionId: "attr_1" });
    expect(parsed).toMatchObject({
      required: false,
      filterable: false,
      searchable: false,
      comparable: false,
      variantDefining: false,
      visibleOnProductPage: true,
      visibleOnListing: false,
      displayOrder: 0,
      validationRules: {},
    });
  });

  it("requires at least one field on category attribute update", () => {
    expect(() => categoryAttributeUpdateRequestSchema.parse({})).toThrow();
    expect(() => categoryAttributeUpdateRequestSchema.parse({ required: true })).not.toThrow();
  });

  it("parses an attribute group create request with default sortOrder", () => {
    const parsed = attributeGroupCreateRequestSchema.parse({ name: "Technical" });
    expect(parsed).toMatchObject({ name: "Technical", sortOrder: 0 });
  });
});
