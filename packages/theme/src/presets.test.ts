import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_DOCUMENT,
  THEME_PRESETS,
  THEME_PRESET_IDS,
  getPreset,
} from "./presets.js";
import { validateThemeDocument } from "./schema.js";
import { collectResolutionErrors } from "./resolve.js";
import { generateCssVariables } from "./css.js";

describe("theme presets", () => {
  it("ships exactly 10 presets", () => {
    expect(THEME_PRESETS).toHaveLength(10);
  });

  it("covers the brief's preset catalog", () => {
    expect(THEME_PRESET_IDS).toEqual([
      "classic",
      "modern",
      "luxury",
      "fashion",
      "electronics",
      "minimal",
      "dark-luxury",
      "natural",
      "beauty",
      "sports",
    ]);
  });

  it("has unique ids", () => {
    expect(new Set(THEME_PRESET_IDS).size).toBe(THEME_PRESET_IDS.length);
  });

  it("getPreset resolves by id", () => {
    expect(getPreset("dark-luxury")?.name).toBe("Dark Luxury");
    expect(getPreset("nope")).toBeUndefined();
  });

  for (const preset of THEME_PRESETS) {
    describe(`preset: ${preset.id}`, () => {
      it("validates against the schema", () => {
        expect(validateThemeDocument(preset.document).ok).toBe(true);
      });

      it("has no dangling/cyclic references", () => {
        expect(collectResolutionErrors(preset.document)).toEqual([]);
      });

      it("generates a full css variable set", () => {
        const vars = generateCssVariables(preset.document);
        const map = new Map(vars);
        expect(map.get("--accent")).toBe(preset.document.tokens.brand.primary);
        expect(map.has("--paper")).toBe(true);
        expect(map.has("--ds-button-bg")).toBe(true);
      });

      it("records its basePreset", () => {
        expect(preset.document.meta.basePreset).toBe(preset.id);
      });
    });
  }
});

describe("dark-luxury preset", () => {
  it("uses a dark scheme with dark text on the gold accent", () => {
    const dl = getPreset("dark-luxury")!;
    expect(dl.document.meta.colorScheme).toBe("dark");
    const map = new Map(generateCssVariables(dl.document));
    expect(map.get("--paper")).toBe("#0c0c0e");
    expect(map.get("--accent")).toBe("#d4af37");
    expect(map.get("--accent-contrast")).toBe("#0c0c0e");
  });
});

describe("default document", () => {
  it("has no basePreset (it is the baseline)", () => {
    expect(DEFAULT_THEME_DOCUMENT.meta.basePreset).toBeUndefined();
  });
});
