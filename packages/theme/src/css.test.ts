import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_DOCUMENT } from "./presets.js";
import { DEFAULT_TYPOGRAPHY } from "./build.js";
import {
  generateCssVariables,
  generateStorefrontThemeCss,
  generateThemeStylesheet,
  kebab,
} from "./css.js";

function varMap(): Map<string, string> {
  return new Map(generateCssVariables(DEFAULT_THEME_DOCUMENT));
}

describe("kebab", () => {
  it("converts camelCase and dotted paths", () => {
    expect(kebab("surfaceMuted")).toBe("surface-muted");
    expect(kebab("brand.primary")).toBe("brand-primary");
    expect(kebab("primaryContrast")).toBe("primary-contrast");
    expect(kebab("2xl")).toBe("2xl");
  });
});

/**
 * KRİTİK: Varsayılan tema, storefront globals.css `[data-theme="default"]`
 * bloğunu BİREBİR üretmelidir → temasız mağaza görsel olarak değişmez.
 */
describe("storefront compatibility vars (globals.css parity)", () => {
  const expected: Record<string, string> = {
    "--font-sans": DEFAULT_TYPOGRAPHY.bodyFont,
    "--font-serif": DEFAULT_TYPOGRAPHY.headingFont,
    "--paper": "#f7f6f3",
    "--surface": "#ffffff",
    "--surface-muted": "#f1efea",
    "--ink": "#17140f",
    "--ink-muted": "#6d685f",
    "--ink-subtle": "#9a948a",
    "--line": "#e6e2da",
    "--line-strong": "#d0cbc1",
    "--accent": "#735389",
    "--accent-ink": "#5a4570",
    "--accent-contrast": "#ffffff",
    "--radius-none": "0px",
    "--radius-sm": "2px",
    "--radius-md": "4px",
    "--shadow-sm": "0 1px 2px 0 rgb(23 20 15 / 0.05)",
    "--shadow-md": "0 20px 48px -28px rgb(23 20 15 / 0.28)",
  };

  const map = varMap();
  for (const [name, value] of Object.entries(expected)) {
    it(`${name} == ${value.slice(0, 24)}`, () => {
      expect(map.get(name)).toBe(value);
    });
  }
});

describe("design-system vars", () => {
  it("emits rich --ds-* layer", () => {
    const map = varMap();
    expect(map.get("--ds-brand-primary")).toBe("#735389");
    expect(map.get("--ds-surface-surface-muted")).toBe("#f1efea");
    expect(map.get("--ds-action-primary")).toBe("#735389");
    expect(map.get("--ds-page-background")).toBe("#f7f6f3");
    expect(map.get("--ds-radius-md")).toBe("4px");
    expect(map.get("--ds-z-index-modal")).toBe("60");
    // component tokens
    expect(map.get("--ds-button-bg")).toBe("#735389");
    expect(map.get("--ds-card-shadow")).toBe("0 20px 48px -28px rgb(23 20 15 / 0.28)");
  });

  it("is deterministic (stable ordering)", () => {
    const a = generateCssVariables(DEFAULT_THEME_DOCUMENT);
    const b = generateCssVariables(DEFAULT_THEME_DOCUMENT);
    expect(a).toEqual(b);
  });
});

describe("generateThemeStylesheet", () => {
  it("wraps vars in the given selector", () => {
    const css = generateThemeStylesheet(DEFAULT_THEME_DOCUMENT, { selector: ":root" });
    expect(css.startsWith(":root {")).toBe(true);
    expect(css).toContain("--accent: #735389;");
    expect(css.trimEnd().endsWith("}")).toBe(true);
  });

  it("storefront helper uses a high-specificity selector", () => {
    const css = generateStorefrontThemeCss(DEFAULT_THEME_DOCUMENT);
    expect(css.startsWith(":root[data-theme] {")).toBe(true);
  });

  it("appends sanitized custom css when present", () => {
    const doc = structuredClone(DEFAULT_THEME_DOCUMENT);
    doc.customCss = ".promo { color: red; }";
    const css = generateThemeStylesheet(doc, { includeCustomCss: true });
    expect(css).toContain(".promo { color: red; }");
  });
});
