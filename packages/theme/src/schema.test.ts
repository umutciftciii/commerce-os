import { describe, expect, it } from "vitest";
import {
  isTokenRef,
  parseThemeDocument,
  tokenRefPath,
  validateThemeDocument,
} from "./schema.js";
import { DEFAULT_THEME_DOCUMENT } from "./presets.js";

describe("token ref helpers", () => {
  it("recognises {ref} form", () => {
    expect(isTokenRef("{brand.primary}")).toBe(true);
    expect(isTokenRef("{page.background}")).toBe(true);
    expect(isTokenRef("#ffffff")).toBe(false);
    expect(isTokenRef("16px")).toBe(false);
    expect(isTokenRef(42)).toBe(false);
  });

  it("strips braces", () => {
    expect(tokenRefPath("{brand.primary}")).toBe("brand.primary");
  });
});

describe("themeDocumentSchema", () => {
  it("accepts the default document", () => {
    const result = validateThemeDocument(DEFAULT_THEME_DOCUMENT);
    expect(result.ok).toBe(true);
  });

  it("round-trips through parse", () => {
    const parsed = parseThemeDocument(DEFAULT_THEME_DOCUMENT);
    expect(parsed.meta.name).toBe("Varsayılan");
    expect(parsed.tokens.brand.primary).toBe("#735389");
  });

  it("rejects a primitive token that is a reference (layer isolation)", () => {
    const bad = structuredClone(DEFAULT_THEME_DOCUMENT);
    (bad.tokens.brand as Record<string, string>).primary = "{brand.secondary}";
    const result = validateThemeDocument(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/brand.primary/);
    }
  });

  it("rejects a document missing a required token group", () => {
    const bad = structuredClone(DEFAULT_THEME_DOCUMENT) as Record<string, unknown>;
    delete (bad.tokens as Record<string, unknown>).surface;
    expect(validateThemeDocument(bad).ok).toBe(false);
  });

  it("preserves unknown token keys (migration-free growth)", () => {
    const grown = structuredClone(DEFAULT_THEME_DOCUMENT);
    (grown.tokens.brand as Record<string, string>).quaternary = "#123456";
    const result = validateThemeDocument(grown);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.document.tokens.brand as Record<string, string>).quaternary).toBe(
        "#123456",
      );
    }
  });
});
