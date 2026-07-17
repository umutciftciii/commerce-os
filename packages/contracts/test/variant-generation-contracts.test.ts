import { describe, expect, it } from "vitest";
import { variantGenerationResponseSchema } from "../src/index.js";

describe("Faz 2C-3 (ADR-072) — variant generation response schema", () => {
  it("accepts a full generation summary with variants", () => {
    const parsed = variantGenerationResponseSchema.parse({
      totalTarget: 4,
      created: 2,
      kept: 1,
      restored: 1,
      archived: 0,
      manualVariantsUntouched: 3,
      variants: [
        {
          id: "gen_1",
          combinationKey: "v1|color:red|size:m",
          title: "RED / M",
          sku: "V-prod_1-abc",
          status: "DRAFT",
          attributes: [
            { attributeDefinitionId: "color", optionId: "red", optionLabel: "RED" },
            { attributeDefinitionId: "size", optionId: "m", optionLabel: null },
          ],
        },
      ],
    });
    expect(parsed.created).toBe(2);
    expect(parsed.variants[0]!.attributes).toHaveLength(2);
  });

  it("accepts an empty variants array (e.g. all-archived summary)", () => {
    const parsed = variantGenerationResponseSchema.parse({
      totalTarget: 0,
      created: 0,
      kept: 0,
      restored: 0,
      archived: 2,
      manualVariantsUntouched: 0,
      variants: [],
    });
    expect(parsed.variants).toHaveLength(0);
  });

  it("rejects negative counters", () => {
    expect(() =>
      variantGenerationResponseSchema.parse({
        totalTarget: -1,
        created: 0,
        kept: 0,
        restored: 0,
        archived: 0,
        manualVariantsUntouched: 0,
        variants: [],
      }),
    ).toThrow();
  });
});
