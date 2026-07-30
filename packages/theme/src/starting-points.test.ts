import { describe, it, expect } from "vitest";
import {
  THEME_STARTING_POINTS,
  isThemeStartingPoint,
  listStartingPoints,
  resolveStartingPoint,
} from "./starting-points.js";
import { getPreset } from "./presets.js";
import { validateThemeDocument } from "./schema.js";

describe("starting points", () => {
  it("5 başlangıç noktası tanımlı", () => {
    expect(THEME_STARTING_POINTS).toHaveLength(5);
    expect(listStartingPoints().map((m) => m.key)).toEqual([...THEME_STARTING_POINTS]);
  });

  it("isThemeStartingPoint allowlist", () => {
    expect(isThemeStartingPoint("FASHION_EDITORIAL")).toBe(true);
    expect(isThemeStartingPoint("NOPE")).toBe(false);
  });

  it("her başlangıç noktası geçerli document + config üretir", () => {
    for (const sp of THEME_STARTING_POINTS) {
      const snap = resolveStartingPoint(sp);
      expect(validateThemeDocument(snap.document).ok).toBe(true);
      expect(snap.config.themeKey).toBe("BASE_COMMERCE");
    }
  });

  it("FASHION_EDITORIAL fashion paletini kullanır ve preset'i MUTATE ETMEZ", () => {
    const before = JSON.stringify(getPreset("fashion")!.document);
    const snap = resolveStartingPoint("FASHION_EDITORIAL");
    snap.document.tokens.brand.primary = "#000000-mutated";
    const after = JSON.stringify(getPreset("fashion")!.document);
    expect(after).toBe(before); // registry belgesi değişmedi (derin kopya)
  });

  it("EMPTY → boş slot", () => {
    expect(resolveStartingPoint("EMPTY").config.slots).toEqual({});
  });

  it("FASHION_MINIMAL → preset slot düzeni dolu", () => {
    const snap = resolveStartingPoint("FASHION_MINIMAL");
    expect(Object.keys(snap.config.slots ?? {}).length).toBeGreaterThan(0);
  });

  it("bilinmeyen key → BASE_COMMERCE fallback", () => {
    const snap = resolveStartingPoint("WHATEVER");
    expect(snap.config.layoutPreset).toBe("BASE_COMMERCE");
  });
});
