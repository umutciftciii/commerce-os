import { describe, it, expect } from "vitest";
import {
  FONT_FAMILIES,
  FONT_PRESETS,
  FONT_CATEGORIES,
  FONT_PRESET_IDS,
  getFontPreset,
  getFontFamily,
  fontStack,
  isFontPresetId,
  listFontPresets,
  resolveFontPresetStacks,
  FONT_LIBRARY_STACKS,
} from "./font-library.js";
import { validateFontFamily } from "./validate.js";

describe("font-library — aileler", () => {
  it("her ailenin benzersiz id'si ve dolu stack'i var", () => {
    const ids = new Set(FONT_FAMILIES.map((f) => f.id));
    expect(ids.size).toBe(FONT_FAMILIES.length);
    for (const f of FONT_FAMILIES) {
      expect(f.stack.length).toBeGreaterThan(0);
      expect(f.stack).toMatch(/(sans-serif|serif|monospace)\s*$/);
    }
  });

  it("fontStack/getFontFamily bilinen id'yi çözer, bilinmeyeni çözmez", () => {
    expect(fontStack("georgia")).toContain("Georgia");
    expect(getFontFamily("georgia")?.generic).toBe("serif");
    expect(fontStack("does-not-exist")).toBeUndefined();
  });

  it("FONT_LIBRARY_STACKS her aileyi kapsar", () => {
    for (const f of FONT_FAMILIES) expect(FONT_LIBRARY_STACKS[f.id]).toBe(f.stack);
  });
});

describe("font-library — preset'ler", () => {
  it("en az 18 preset ve 8 kategori", () => {
    expect(FONT_PRESETS.length).toBeGreaterThanOrEqual(18);
    expect(FONT_CATEGORIES.length).toBe(8);
    const cats = new Set(FONT_PRESETS.map((p) => p.category));
    for (const c of FONT_CATEGORIES) expect(cats.has(c)).toBe(true);
  });

  it("preset id'leri benzersiz ve heading/body aileleri geçerli", () => {
    const ids = new Set(FONT_PRESET_IDS);
    expect(ids.size).toBe(FONT_PRESETS.length);
    for (const p of FONT_PRESETS) {
      expect(getFontFamily(p.headingFamily)).toBeDefined();
      expect(getFontFamily(p.bodyFamily)).toBeDefined();
      expect(p.recommendedWeights.length).toBeGreaterThan(0);
      expect(p.readabilityScore).toBeGreaterThanOrEqual(0);
      expect(p.readabilityScore).toBeLessThanOrEqual(100);
      expect(p.localeSupport).toContain("tr");
    }
  });

  it("getFontPreset / isFontPresetId / listFontPresets(kategori)", () => {
    expect(isFontPresetId("modern-sans")).toBe(true);
    expect(isFontPresetId("nope")).toBe(false);
    expect(getFontPreset("modern-sans")?.category).toBe("sans");
    const serifs = listFontPresets("serif");
    expect(serifs.length).toBeGreaterThan(0);
    expect(serifs.every((p) => p.category === "serif")).toBe(true);
  });

  it("resolveFontPresetStacks güvenli stack'ler döndürür", () => {
    const stacks = resolveFontPresetStacks("classic-serif");
    expect(stacks?.headingStack).toContain("Georgia");
    expect(resolveFontPresetStacks("nope")).toBeUndefined();
  });
});

describe("font-library — H-1 doğrulama entegrasyonu", () => {
  it("her familyId validateFontFamily'den GEÇER (id → güvenli stack)", () => {
    for (const f of FONT_FAMILIES) {
      const r = validateFontFamily(f.id);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(f.stack);
    }
  });

  it("çözülmüş stack de doğrudan geçerli (legacy allowlist)", () => {
    expect(validateFontFamily(fontStack("palatino")!).ok).toBe(true);
  });

  it("serbest/güvensiz font-family REDDEDİLİR", () => {
    expect(validateFontFamily("Comic Sans; }").ok).toBe(false);
    expect(validateFontFamily("url(evil)").ok).toBe(false);
  });
});
