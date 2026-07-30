import { describe, it, expect } from "vitest";
import {
  COLOR_PALETTES,
  COLOR_PALETTE_IDS,
  getColorPalette,
  isColorPaletteId,
  listColorPalettes,
  applyPaletteToDocument,
  paletteContrast,
} from "./color-palettes.js";
import { DEFAULT_THEME_DOCUMENT } from "./presets.js";
import { collectResolutionErrors } from "./resolve.js";
import { validateThemeDocument } from "./schema.js";

describe("color-palettes — kütüphane", () => {
  it("en az 8 palet, benzersiz id", () => {
    expect(COLOR_PALETTES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(COLOR_PALETTE_IDS).size).toBe(COLOR_PALETTES.length);
  });

  it("beklenen adlandırılmış paletler mevcut", () => {
    for (const id of [
      "modern-minimal",
      "premium-dark",
      "fashion-editorial",
      "soft-neutral",
      "vibrant-commerce",
      "warm-boutique",
      "monochrome",
      "corporate-clean",
    ]) {
      expect(isColorPaletteId(id)).toBe(true);
    }
  });

  it("getColorPalette / listColorPalettes", () => {
    expect(getColorPalette("premium-dark")?.colorScheme).toBe("dark");
    expect(listColorPalettes().length).toBe(COLOR_PALETTES.length);
    expect(getColorPalette("nope")).toBeUndefined();
  });
});

describe("color-palettes — uygulama (immutable + geçerli)", () => {
  it("applyPaletteToDocument girdiyi MUTATE etmez, yeni belge döner", () => {
    const before = JSON.stringify(DEFAULT_THEME_DOCUMENT.tokens.brand);
    const next = applyPaletteToDocument(DEFAULT_THEME_DOCUMENT, "modern-minimal");
    expect(JSON.stringify(DEFAULT_THEME_DOCUMENT.tokens.brand)).toBe(before);
    expect(next.tokens.brand.primary).toBe("#3730a3");
    expect(next).not.toBe(DEFAULT_THEME_DOCUMENT);
  });

  it("tipografi/slot/asset katmanları KORUNUR (yalnız renk değişir)", () => {
    const next = applyPaletteToDocument(DEFAULT_THEME_DOCUMENT, "fashion-editorial");
    expect(next.tokens.typography).toEqual(DEFAULT_THEME_DOCUMENT.tokens.typography);
    expect(next.assets).toEqual(DEFAULT_THEME_DOCUMENT.assets);
  });

  it("colorScheme + action.primaryContrast güncellenir", () => {
    const next = applyPaletteToDocument(DEFAULT_THEME_DOCUMENT, "premium-dark");
    expect(next.meta.colorScheme).toBe("dark");
    expect(next.semantic["action.primaryContrast"]).toBe("#1a1508");
  });

  it("uygulanmış belge geçerli + ref bütünlüğü korunur", () => {
    for (const p of COLOR_PALETTES) {
      const doc = applyPaletteToDocument(DEFAULT_THEME_DOCUMENT, p.id);
      expect(validateThemeDocument(doc).ok).toBe(true);
      expect(collectResolutionErrors(doc)).toEqual([]);
    }
  });

  it("bilinmeyen palet → belge değişmez", () => {
    expect(applyPaletteToDocument(DEFAULT_THEME_DOCUMENT, "nope")).toBe(DEFAULT_THEME_DOCUMENT);
  });
});

describe("color-palettes — WCAG publish güvenliği", () => {
  it("TÜM paletler kritik kontrastı GEÇER (publish-safe)", () => {
    for (const p of COLOR_PALETTES) {
      const result = paletteContrast(p.id, DEFAULT_THEME_DOCUMENT);
      const errors = result.issues.filter((i) => i.severity === "ERROR");
      expect(errors, `${p.id} kontrast ihlali: ${JSON.stringify(errors)}`).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });
});
