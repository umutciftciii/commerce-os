import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_DOCUMENT, getPreset } from "./presets.js";
import {
  THEME_EXPORT_FORMAT,
  exportThemeEnvelope,
  exportThemeJson,
  importTheme,
  importThemeJson,
  migrateThemeDocument,
} from "./serialize.js";
import { sanitizeCustomCss } from "./custom-css.js";
import { COMPONENT_VARIANTS, isValidVariant } from "./variants.js";

describe("export / import round-trip", () => {
  it("exports an envelope with format + version", () => {
    const env = exportThemeEnvelope(DEFAULT_THEME_DOCUMENT, "2026-07-20T00:00:00Z");
    expect(env.format).toBe(THEME_EXPORT_FORMAT);
    expect(env.schemaVersion).toBe(DEFAULT_THEME_DOCUMENT.schemaVersion);
    expect(env.exportedAt).toBe("2026-07-20T00:00:00Z");
  });

  it("round-trips a preset through json", () => {
    const preset = getPreset("luxury")!;
    const json = exportThemeJson(preset.document);
    const result = importThemeJson(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.meta.name).toBe("Luxury");
      expect(result.document.tokens.brand.accent).toBe("#c8a04a");
    }
  });

  it("imports a bare document (no envelope)", () => {
    const result = importTheme(DEFAULT_THEME_DOCUMENT);
    expect(result.ok).toBe(true);
  });
});

describe("import validation", () => {
  it("rejects invalid json", () => {
    const result = importThemeJson("{not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/geçersiz JSON/);
  });

  it("rejects a future schema version", () => {
    const bad = { ...DEFAULT_THEME_DOCUMENT, schemaVersion: 999 };
    const result = importTheme(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/ileri şema sürümü/);
  });

  it("rejects a document with a dangling reference", () => {
    const bad = structuredClone(DEFAULT_THEME_DOCUMENT);
    bad.semantic["action.primary"] = "{brand.missing}";
    const result = importTheme(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/action.primary/);
  });

  it("rejects a non-object", () => {
    expect(migrateThemeDocument(42).ok).toBe(false);
    expect(migrateThemeDocument(null).ok).toBe(false);
  });
});

describe("custom css sandbox", () => {
  it("passes through benign css", () => {
    const r = sanitizeCustomCss(".x { color: red; }");
    expect(r.css).toBe(".x { color: red; }");
    expect(r.removed).toEqual([]);
  });

  it("strips style-tag escape and imports", () => {
    const r = sanitizeCustomCss("</style><script>alert(1)</script>@import url(evil);");
    expect(r.css).not.toContain("<");
    expect(r.css).not.toContain("@import");
    expect(r.removed.length).toBeGreaterThan(0);
  });

  it("strips javascript/expression vectors", () => {
    const r = sanitizeCustomCss(".x { width: expression(alert(1)); background: javascript:x; }");
    expect(r.css).not.toMatch(/expression\s*\(/);
    expect(r.css).not.toContain("javascript:");
  });

  it("caps length", () => {
    const r = sanitizeCustomCss("a".repeat(50000));
    expect(r.css.length).toBeLessThanOrEqual(20000);
  });
});

describe("component variant catalog", () => {
  it("lists button variants", () => {
    expect(COMPONENT_VARIANTS.button).toEqual(["filled", "outline", "soft", "ghost"]);
  });

  it("validates variant membership", () => {
    expect(isValidVariant("card", "glass")).toBe(true);
    expect(isValidVariant("card", "nope")).toBe(false);
    expect(isValidVariant("unknown", "x")).toBe(false);
  });
});
