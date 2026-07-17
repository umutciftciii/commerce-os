// Faz 2C-1 (ADR-070) — Varyant seçim dönüşümleri birim testleri.
import { describe, expect, it } from "vitest";
import {
  buildVariantSelectionMap,
  emptyVariantSelectionMap,
  isVariantSelectionServerError,
  validateVariantSelections,
  variantSelectionsToInputs,
} from "../app/(app)/products/variant-attributes/variant-selection-mapping";
import type { ResolvedVariantAttribute } from "../app/(app)/products/variant-attributes/types";

const ISO = "2026-07-17T00:00:00.000Z";

function attr(id: string, optionIds: string[]): ResolvedVariantAttribute {
  return {
    categoryAttributeId: `ca_${id}`,
    attributeDefinitionId: id,
    code: id,
    name: id,
    dataType: "SELECT",
    displayOrder: 0,
    options: optionIds.map((o) => ({ id: o, value: o, label: o, colorHex: null })),
  };
}

const colour = attr("colour", ["black", "white", "blue"]);
const size = attr("size", ["s", "m"]);

describe("emptyVariantSelectionMap", () => {
  it("creates a disabled entry for every axis", () => {
    const map = emptyVariantSelectionMap([colour, size]);
    expect(map).toEqual({
      colour: { enabled: false, optionIds: [] },
      size: { enabled: false, optionIds: [] },
    });
  });
});

describe("buildVariantSelectionMap (edit round-trip)", () => {
  it("enables axes present in the response and keeps only still-valid options", () => {
    const map = buildVariantSelectionMap(
      [colour, size],
      [
        {
          attributeDefinitionId: "colour",
          dataType: "SELECT",
          position: 0,
          optionIds: ["black", "gone"], // "gone" artık şemada yok → düşer
          createdAt: ISO,
          updatedAt: ISO,
        },
      ],
    );
    expect(map.colour).toEqual({ enabled: true, optionIds: ["black"] });
    expect(map.size).toEqual({ enabled: false, optionIds: [] });
  });
});

describe("variantSelectionsToInputs", () => {
  it("emits only enabled axes with valid, deduped options", () => {
    const inputs = variantSelectionsToInputs([colour, size], {
      colour: { enabled: true, optionIds: ["black", "black", "white", "gone"] },
      size: { enabled: false, optionIds: ["s"] },
    });
    expect(inputs).toEqual([{ attributeDefinitionId: "colour", optionIds: ["black", "white"] }]);
  });

  it("emits an enabled axis with empty options (server enforces ≥1)", () => {
    const inputs = variantSelectionsToInputs([colour], { colour: { enabled: true, optionIds: [] } });
    expect(inputs).toEqual([{ attributeDefinitionId: "colour", optionIds: [] }]);
  });
});

describe("validateVariantSelections", () => {
  it("flags an enabled axis with no valid options", () => {
    const errors = validateVariantSelections([colour], { colour: { enabled: true, optionIds: [] } }, "required");
    expect(errors).toEqual({ colour: "required" });
  });

  it("passes when every enabled axis has ≥1 option; ignores disabled axes", () => {
    const errors = validateVariantSelections(
      [colour, size],
      { colour: { enabled: true, optionIds: ["black"] }, size: { enabled: false, optionIds: [] } },
      "required",
    );
    expect(errors).toEqual({});
  });
});

describe("isVariantSelectionServerError", () => {
  it("recognizes variant selection codes but not product-level ones", () => {
    expect(isVariantSelectionServerError("VARIANT_OPTION_REQUIRED")).toBe(true);
    expect(isVariantSelectionServerError("VARIANT_ATTRIBUTE_NOT_OPTION_BASED")).toBe(true);
    expect(isVariantSelectionServerError("PRODUCT_NOT_FOUND")).toBe(false);
    expect(isVariantSelectionServerError("ATTRIBUTE_REQUIRED_MISSING")).toBe(false);
  });
});
