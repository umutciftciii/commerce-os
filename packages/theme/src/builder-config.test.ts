import { describe, it, expect } from "vitest";
import {
  themeBuilderConfigSchema,
  validateThemeBuilderConfig,
  parseThemeBuilderConfig,
} from "./builder-config.js";
import { resolveConfigSlots } from "./config.js";

describe("themeBuilderConfig — valid", () => {
  it("boş config → base default", () => {
    const r = validateThemeBuilderConfig({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.themeKey).toBe("BASE_COMMERCE");
      expect(r.config.layoutPreset).toBe("BASE_COMMERCE");
    }
  });

  it("tam yapısal config kabul edilir", () => {
    const r = validateThemeBuilderConfig({
      themeKey: "BASE_COMMERCE",
      layoutPreset: "FASHION_EDITORIAL",
      slotVariants: { header: "CENTERED_BRAND", productCard: "EDITORIAL" },
      container: { width: "1440px", gutter: "wide" },
      listing: { columnsDesktop: 4, gap: "relaxed" },
      hero: { height: "tall", contentAlign: "center" },
      radius: { scale: "rounded" },
      shadow: { depth: "elevated" },
      buttonStyle: { shape: "pill", weight: "bold" },
      typography: { headingScale: 1.35, lineHeight: 1.6, baseSize: "16px" },
      responsiveOverrides: { mobile: { columns: 2, heroHeight: "compact" } },
      colorScheme: "light",
    });
    expect(r.ok).toBe(true);
  });
});

describe("themeBuilderConfig — reddedilenler", () => {
  it("bilinmeyen key (strict grup) reddedilir", () => {
    const r = validateThemeBuilderConfig({ container: { bogusKey: "x" } });
    expect(r.ok).toBe(false);
  });

  it("izinsiz slot variant reddedilir", () => {
    const r = validateThemeBuilderConfig({ slotVariants: { header: "NOT_A_VARIANT" } });
    expect(r.ok).toBe(false);
  });

  it("numeric bound aşımı reddedilir (listing columns > 6)", () => {
    const r = validateThemeBuilderConfig({ listing: { columnsDesktop: 9 } });
    expect(r.ok).toBe(false);
  });

  it("bounded typography aşımı reddedilir (headingScale > 2)", () => {
    const r = validateThemeBuilderConfig({ typography: { headingScale: 5 } });
    expect(r.ok).toBe(false);
  });

  it("unsafe length (url injection) reddedilir", () => {
    const r = validateThemeBuilderConfig({ container: { width: "url(x);}" } });
    expect(r.ok).toBe(false);
  });

  it("unsafe color reddedilir", () => {
    const r = validateThemeBuilderConfig({ tokenOverrides: { brandPrimary: "red;}<script>" } });
    expect(r.ok).toBe(false);
  });

  it("izinsiz enum reddedilir", () => {
    const r = validateThemeBuilderConfig({ buttonStyle: { shape: "hexagon" } });
    expect(r.ok).toBe(false);
  });

  it("responsive izinsiz nav variant reddedilir", () => {
    const r = validateThemeBuilderConfig({
      responsiveOverrides: { tablet: { navigationVariant: "BOGUS" } },
    });
    expect(r.ok).toBe(false);
  });
});

describe("parseThemeBuilderConfig — normalize", () => {
  it("slotVariants slots'a merge edilir (öncelikli)", () => {
    const cfg = parseThemeBuilderConfig({
      slots: { header: "solid" },
      slotVariants: { header: "CENTERED_BRAND", hero: "SPLIT_CONTENT" },
    });
    expect(cfg.slots.header).toBe("CENTERED_BRAND");
    expect(cfg.slots.hero).toBe("SPLIT_CONTENT");
  });

  it("bilinmeyen themeKey → BASE (fail-closed)", () => {
    const cfg = parseThemeBuilderConfig({ themeKey: "haxor-theme" });
    expect(cfg.themeKey).toBe("BASE_COMMERCE");
  });

  it("parse hatası → güvenli base default (throw etmez)", () => {
    const cfg = parseThemeBuilderConfig({ listing: { columnsDesktop: 99 } });
    expect(cfg.themeKey).toBe("BASE_COMMERCE");
    expect(cfg.slots).toEqual({});
  });

  it("resolveConfigSlots merge sonrası yeni variant'ı çözer", () => {
    const cfg = parseThemeBuilderConfig({
      slotVariants: { productCard: "EDITORIAL" },
    });
    const resolved = resolveConfigSlots(cfg);
    expect(resolved.productCard).toBe("EDITORIAL");
  });
});

describe("top-level strip (ileri-uyum)", () => {
  it("bilinmeyen üst anahtar DÜŞÜRÜLÜR, parse başarılı", () => {
    const r = themeBuilderConfigSchema.safeParse({ futureTopKey: 1, themeKey: "BASE_COMMERCE" });
    expect(r.success).toBe(true);
    if (r.success) expect("futureTopKey" in r.data).toBe(false);
  });
});
