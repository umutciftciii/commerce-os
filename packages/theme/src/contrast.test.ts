import { describe, it, expect } from "vitest";
import {
  parseRgb,
  relativeLuminance,
  contrastRatio,
  checkContrast,
  contrastErrors,
} from "./contrast.js";
import { DEFAULT_THEME_DOCUMENT } from "./presets.js";
import { buildThemeDocument } from "./build.js";

describe("parseRgb", () => {
  it("hex 6 basamak", () => expect(parseRgb("#ffffff")).toEqual([255, 255, 255]));
  it("hex 3 basamak", () => expect(parseRgb("#000")).toEqual([0, 0, 0]));
  it("hex 8 basamak (alpha atılır)", () => expect(parseRgb("#112233ff")).toEqual([17, 34, 51]));
  it("rgb()", () => expect(parseRgb("rgb(10, 20, 30)")).toEqual([10, 20, 30]));
  it("parse edilemeyen → null", () => expect(parseRgb("var(--x)")).toBeNull());
  it("named renk → null (hesaplanamaz)", () => expect(parseRgb("red")).toBeNull());
});

describe("contrastRatio", () => {
  it("siyah/beyaz = 21", () => expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1));
  it("aynı renk = 1", () => expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5));
  it("parse edilemeyen → null", () => expect(contrastRatio("red", "#fff")).toBeNull());
  it("relativeLuminance beyaz = 1", () => expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5));
});

describe("checkContrast — publish gate", () => {
  it("varsayılan tema kritik kontrastı GEÇER (ok)", () => {
    const r = checkContrast(DEFAULT_THEME_DOCUMENT);
    expect(r.ok).toBe(true);
    expect(contrastErrors(r)).toHaveLength(0);
  });

  it("düşük kontrast tema ERROR üretir (publish reddi)", () => {
    const doc = buildThemeDocument({
      name: "Kötü",
      colorScheme: "light",
      brand: { primary: "#f2f2f2", secondary: "#eeeeee", accent: "#f2f2f2", tertiary: "#dddddd" },
      surface: {
        background: "#ffffff",
        surface: "#ffffff",
        surfaceMuted: "#fafafa",
        surfaceElevated: "#ffffff",
        overlay: "rgb(0 0 0 / 0.5)",
      },
      text: {
        primary: "#dddddd", // zemin beyaz üstünde okunmaz
        secondary: "#e5e5e5",
        muted: "#eeeeee",
        inverse: "#ffffff",
        link: "#e0e0e0",
      },
      border: { default: "#eee", subtle: "#f5f5f5", strong: "#ddd", focus: "#ccc" },
      feedback: { success: "#1f7a4d", warning: "#b7791f", error: "#c0392b", info: "#2b6cb0" },
    });
    const r = checkContrast(doc);
    expect(r.ok).toBe(false);
    expect(contrastErrors(r).length).toBeGreaterThan(0);
  });

  it("vivid marka linki (aksan) publish'i ENGELLEMEZ → WARNING (shipped preset yayınlanabilir)", () => {
    // fashion preset link'i #ff2d6f (~3.6:1) — okunur gövde metni yüksek kontrast.
    const doc = buildThemeDocument({
      name: "Fashion",
      colorScheme: "light",
      brand: { primary: "#111111", secondary: "#000000", accent: "#ff2d6f", tertiary: "#777777" },
      surface: {
        background: "#ffffff",
        surface: "#ffffff",
        surfaceMuted: "#f5f5f5",
        surfaceElevated: "#ffffff",
        overlay: "rgb(0 0 0 / 0.5)",
      },
      text: {
        primary: "#111111",
        secondary: "#555555",
        muted: "#999999",
        inverse: "#ffffff",
        link: "#ff2d6f",
      },
      border: { default: "#eaeaea", subtle: "#f5f5f5", strong: "#cccccc", focus: "#111111" },
      feedback: { success: "#1f7a4d", warning: "#b7791f", error: "#c0392b", info: "#2b6cb0" },
    });
    const r = checkContrast(doc);
    expect(r.ok).toBe(true); // publish edilebilir
    expect(contrastErrors(r)).toHaveLength(0);
    // link uyarı olarak raporlanır
    expect(r.issues.some((i) => i.label.includes("Bağlantı") && i.severity === "WARNING")).toBe(true);
  });
});
