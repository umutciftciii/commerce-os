import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_DOCUMENT } from "./presets.js";
import {
  collectThemeTokenIssues,
  primitiveSpec,
  REASON_TO_ERROR_CODE,
} from "./registry.js";
import { generateStorefrontThemeCss, generateCssVariables } from "./css.js";
import type { ThemeDocument } from "./schema.js";

function clone(): ThemeDocument {
  return structuredClone(DEFAULT_THEME_DOCUMENT);
}

describe("collectThemeTokenIssues", () => {
  it("varsayılan tema temiz (sıfır sorun)", () => {
    expect(collectThemeTokenIssues(DEFAULT_THEME_DOCUMENT)).toEqual([]);
  });

  it("kötücül primitive renk → UNSAFE_VALUE", () => {
    const doc = clone();
    doc.tokens.brand.primary = "red;}</style><script>alert(1)</script>";
    const issues = collectThemeTokenIssues(doc);
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe("tokens.brand.primary");
    expect(issues[0].reason).toBe("UNSAFE_VALUE");
    expect(REASON_TO_ERROR_CODE[issues[0].reason]).toBe("THEME_TOKEN_UNSAFE_VALUE");
  });

  it("bilinmeyen primitive anahtar → UNKNOWN", () => {
    const doc = clone();
    (doc.tokens.brand as Record<string, string>).evil = "#fff";
    const issues = collectThemeTokenIssues(doc);
    const unknown = issues.find((i) => i.path === "tokens.brand.evil");
    expect(unknown?.reason).toBe("UNKNOWN");
    expect(REASON_TO_ERROR_CODE.UNKNOWN).toBe("THEME_TOKEN_UNKNOWN");
  });

  it("tip uyumsuzluğu → TYPE_MISMATCH (renk alanına metin)", () => {
    const doc = clone();
    doc.tokens.brand.primary = "notacolor";
    const issues = collectThemeTokenIssues(doc);
    expect(issues[0].reason).toBe("TYPE_MISMATCH");
  });

  it("geçersiz uzunluk → INVALID_VALUE (radius'a vh)", () => {
    const doc = clone();
    doc.tokens.radius.md = "10vh";
    const issues = collectThemeTokenIssues(doc);
    expect(issues.find((i) => i.path === "tokens.radius.md")?.reason).toBe("INVALID_VALUE");
  });

  it("somut semantic kötücül değer → yakalanır; {ref} atlanır", () => {
    const doc = clone();
    doc.semantic["action.primaryContrast"] = "#fff;}x{y:z";
    doc.semantic["custom.evil"] = "</style>";
    const issues = collectThemeTokenIssues(doc);
    expect(issues.some((i) => i.path === "semantic.action.primaryContrast")).toBe(true);
    expect(issues.some((i) => i.path === "semantic.custom.evil")).toBe(true);
    // {ref} değerleri (ör. action.primary = {brand.primary}) sorun üretmez.
    expect(issues.some((i) => i.path === "semantic.action.primary")).toBe(false);
  });

  it("kötücül component somut değeri → yakalanır", () => {
    const doc = clone();
    doc.components.button.tokens.bg = "url(javascript:alert(1))";
    const issues = collectThemeTokenIssues(doc);
    expect(issues.some((i) => i.path === "components.button.bg")).toBe(true);
  });
});

describe("primitiveSpec", () => {
  it("bilinen anahtar → spec", () => {
    expect((primitiveSpec("brand", "primary") as { type: string }).type).toBe("COLOR");
    expect((primitiveSpec("radius", "md") as { type: string }).type).toBe("LENGTH");
    expect((primitiveSpec("shadow", "md") as { type: string }).type).toBe("SHADOW_PRESET");
  });
  it("bilinmeyen anahtar → {unknown}", () => {
    expect(primitiveSpec("brand", "evil")).toEqual({ unknown: true });
  });
  it("bilinmeyen grup → null", () => {
    expect(primitiveSpec("evilGroup", "x")).toBeNull();
  });
});

describe("serializer render-time defense", () => {
  it("kötücül token render'dan ATLANIR; payload çıktıda yok", () => {
    const doc = clone();
    doc.tokens.brand.primary = "red;}</style><script>alert(1)</script>";
    const css = generateStorefrontThemeCss(doc);
    expect(css).not.toContain("<script");
    expect(css).not.toContain("</style>");
    expect(css).not.toContain("alert(1)");
    // --accent (brand.primary'ye çözülür) atlanır → globals.css fallback.
    const map = new Map(generateCssVariables(doc));
    expect(map.has("--accent")).toBe(false);
    expect(map.has("--ds-brand-primary")).toBe(false);
    // Diğer geçerli tokenlar çalışmaya devam eder.
    expect(map.get("--paper")).toBe("#f7f6f3");
    expect(map.get("--ink")).toBe("#17140f");
  });

  it("bilinmeyen anahtar hiç yayınlanmaz", () => {
    const doc = clone();
    (doc.tokens.brand as Record<string, string>).evil = "</style><script>x</script>";
    const map = new Map(generateCssVariables(doc));
    expect(map.has("--ds-brand-evil")).toBe(false);
  });

  it("bozuk semantic ref render'ı kırmaz (throw yok)", () => {
    const doc = clone();
    doc.semantic["action.primary"] = "{nonexistent.token}";
    expect(() => generateStorefrontThemeCss(doc)).not.toThrow();
    const map = new Map(generateCssVariables(doc));
    // Çözülemeyen --accent atlanır; diğerleri sağlam.
    expect(map.get("--paper")).toBe("#f7f6f3");
  });

  it("onDrop payload'suz callback (değer loglanmaz)", () => {
    const doc = clone();
    doc.tokens.brand.primary = "red;}evil";
    const drops: Array<{ name: string; reason: string }> = [];
    generateCssVariables(doc, (info) => drops.push(info));
    expect(drops.length).toBeGreaterThan(0);
    // Yalnız name + reason taşınır — ham değer YOK.
    for (const d of drops) {
      expect(Object.keys(d).sort()).toEqual(["name", "reason"]);
      expect(JSON.stringify(d)).not.toContain("evil");
    }
  });
});
