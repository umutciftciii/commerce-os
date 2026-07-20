import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_DOCUMENT } from "./presets.js";
import {
  ThemeResolutionError,
  collectResolutionErrors,
  resolveTheme,
  resolveValue,
} from "./resolve.js";

describe("resolveValue", () => {
  it("returns concrete values unchanged", () => {
    expect(resolveValue("#abcdef", DEFAULT_THEME_DOCUMENT)).toBe("#abcdef");
  });

  it("resolves a primitive reference", () => {
    expect(resolveValue("{brand.primary}", DEFAULT_THEME_DOCUMENT)).toBe("#735389");
  });

  it("resolves a semantic reference through to a primitive", () => {
    // action.primary -> {brand.primary} -> #735389
    expect(resolveValue("{action.primary}", DEFAULT_THEME_DOCUMENT)).toBe("#735389");
  });

  it("stringifies numeric primitives (zIndex)", () => {
    expect(resolveValue("{zIndex.modal}", DEFAULT_THEME_DOCUMENT)).toBe("60");
  });

  it("throws on a dangling reference", () => {
    expect(() => resolveValue("{does.notExist}", DEFAULT_THEME_DOCUMENT)).toThrow(
      ThemeResolutionError,
    );
  });

  it("detects cycles", () => {
    const doc = structuredClone(DEFAULT_THEME_DOCUMENT);
    doc.semantic["a.one"] = "{a.two}";
    doc.semantic["a.two"] = "{a.one}";
    expect(() => resolveValue("{a.one}", doc)).toThrow(/döngü/);
  });
});

describe("resolveTheme", () => {
  it("fully resolves the default document", () => {
    const resolved = resolveTheme(DEFAULT_THEME_DOCUMENT);
    expect(resolved.primitives["brand.primary"]).toBe("#735389");
    expect(resolved.semantic["action.primary"]).toBe("#735389");
    expect(resolved.semantic["page.background"]).toBe("#f7f6f3");
    expect(resolved.components.button.bg).toBe("#735389");
    expect(resolved.components.button.fg).toBe("#ffffff");
    expect(resolved.components.card.shadow).toBe(
      "0 20px 48px -28px rgb(23 20 15 / 0.28)",
    );
  });

  it("has no resolution errors for the default document", () => {
    expect(collectResolutionErrors(DEFAULT_THEME_DOCUMENT)).toEqual([]);
  });

  it("reports resolution errors without throwing", () => {
    const doc = structuredClone(DEFAULT_THEME_DOCUMENT);
    doc.components.button.tokens.bg = "{missing.token}";
    const errors = collectResolutionErrors(doc);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/components.button.bg/);
  });
});
