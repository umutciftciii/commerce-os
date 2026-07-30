import { describe, it, expect } from "vitest";
import {
  CANONICAL_FIELD_PATHS,
  defaultOverridePolicy,
  isPolicyExplicit,
  missingPolicyFields,
  isFieldEditable,
  fieldPolicy,
  parseOverridePolicy,
  validateOverridePolicy,
  enforceOverridePolicy,
  projectFieldPolicy,
  resolveFieldValue,
  type StoreOverridePolicy,
  type PolicyThemeState,
} from "./override-policy.js";
import { DEFAULT_THEME_DOCUMENT } from "./presets.js";
import type { ThemeDocument } from "./schema.js";

function state(patch?: (doc: ThemeDocument) => ThemeDocument, config: PolicyThemeState["config"] = {}): PolicyThemeState {
  const clone = JSON.parse(JSON.stringify(DEFAULT_THEME_DOCUMENT)) as ThemeDocument;
  return { document: patch ? patch(clone) : clone, config };
}

describe("override-policy — varsayılan (geriye uyum)", () => {
  it("defaultOverridePolicy her canonical alanı editable yapar", () => {
    const p = defaultOverridePolicy();
    for (const path of CANONICAL_FIELD_PATHS) {
      expect(fieldPolicy(p, path)).toBe("editable");
      expect(isFieldEditable(p, path)).toBe(true);
    }
    expect(isPolicyExplicit(p)).toBe(true);
    expect(missingPolicyFields(p)).toEqual([]);
  });
});

describe("override-policy — explicit gerekliliği (platform template)", () => {
  it("boş/eksik policy explicit DEĞİL, eksik alanları listeler", () => {
    const partial: StoreOverridePolicy = {
      fields: { "brand.primaryColor": "editable" },
      allowedFonts: [],
      allowedPalettes: [],
      allowedLayoutPresets: [],
    };
    expect(isPolicyExplicit(partial)).toBe(false);
    expect(missingPolicyFields(partial).length).toBe(CANONICAL_FIELD_PATHS.length - 1);
  });
});

describe("override-policy — parse/validate", () => {
  it("parse: null → varsayılan (all editable)", () => {
    expect(isPolicyExplicit(parseOverridePolicy(null))).toBe(true);
  });
  it("validate: bilinmeyen alan yolu REDDEDİLİR (strict enum)", () => {
    const r = validateOverridePolicy({ fields: { "color.unknown": "locked" } });
    expect(r.ok).toBe(false);
  });
  it("validate: geçersiz policy değeri REDDEDİLİR", () => {
    const r = validateOverridePolicy({ fields: { "slot.header": "sometimes" } });
    expect(r.ok).toBe(false);
  });
  it("validate: geçerli policy KABUL", () => {
    const r = validateOverridePolicy({
      fields: { "slot.header": "locked", "brand.primaryColor": "editable" },
      allowedFonts: ["modern-sans"],
    });
    expect(r.ok).toBe(true);
  });
});

describe("override-policy — enforce (server-side)", () => {
  const lockHeader: StoreOverridePolicy = {
    ...defaultOverridePolicy(),
    fields: { ...defaultOverridePolicy().fields, "slot.header": "locked", "slot.productCard": "locked" },
  };

  it("editable alan değişimi BAŞARILI", () => {
    const prev = state();
    const next = state((d) => {
      d.tokens.brand.primary = "#123456";
      return d;
    });
    const r = enforceOverridePolicy({ policy: lockHeader, prev, next });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("locked slot değişimi THEME_FIELD_LOCKED ile REDDEDİLİR", () => {
    const prev = state(undefined, { slots: { header: "STANDARD" } });
    const next = state(undefined, { slots: { header: "EDITORIAL_SPLIT" } });
    const r = enforceOverridePolicy({ policy: lockHeader, prev, next });
    expect(r.ok).toBe(false);
    expect(r.violations).toContainEqual({ path: "slot.header", code: "THEME_FIELD_LOCKED" });
  });

  it("locked alan DEĞİŞMEDİYSE ihlal YOK", () => {
    const prev = state(undefined, { slots: { header: "STANDARD" } });
    const next = state(undefined, { slots: { header: "STANDARD" } });
    const r = enforceOverridePolicy({ policy: lockHeader, prev, next });
    expect(r.ok).toBe(true);
  });

  it("logo (StoreSettings) değişimi changedAssetFields ile locked ise reddedilir", () => {
    const policy: StoreOverridePolicy = {
      ...defaultOverridePolicy(),
      fields: { ...defaultOverridePolicy().fields, "brand.logo": "locked" },
    };
    const r = enforceOverridePolicy({
      policy,
      prev: state(),
      next: state(),
      changedAssetFields: ["brand.logo"],
    });
    expect(r.ok).toBe(false);
    expect(r.violations).toContainEqual({ path: "brand.logo", code: "THEME_FIELD_LOCKED" });
  });

  it("allowedLayoutPresets dışı → THEME_LAYOUT_NOT_ALLOWED", () => {
    const policy: StoreOverridePolicy = {
      ...defaultOverridePolicy(),
      allowedLayoutPresets: ["BASE_COMMERCE", "FASHION_MINIMAL"],
    };
    const prev = state(undefined, { layoutPreset: "BASE_COMMERCE" });
    const next = state(undefined, { layoutPreset: "MARKETPLACE_DENSE" });
    const r = enforceOverridePolicy({ policy, prev, next });
    expect(r.violations).toContainEqual({ path: "layoutPreset", code: "THEME_LAYOUT_NOT_ALLOWED" });
  });

  it("allowedFonts dışı familyId → THEME_FONT_NOT_ALLOWED", () => {
    const policy: StoreOverridePolicy = {
      ...defaultOverridePolicy(),
      allowedFonts: ["classic-serif"], // heading=georgia, body=georgia
    };
    const prev = state((d) => {
      d.tokens.typography.bodyFont = "georgia";
      return d;
    });
    const next = state((d) => {
      d.tokens.typography.bodyFont = "futura"; // izinli değil
      return d;
    });
    const r = enforceOverridePolicy({ policy, prev, next });
    expect(r.violations).toContainEqual({ path: "typography.bodyFont", code: "THEME_FONT_NOT_ALLOWED" });
  });

  it("allowedFonts kapsamında familyId → BAŞARILI", () => {
    const policy: StoreOverridePolicy = {
      ...defaultOverridePolicy(),
      allowedFonts: ["geometric-futura"], // heading=futura, body=avenir
    };
    const prev = state((d) => {
      d.tokens.typography.bodyFont = "avenir";
      return d;
    });
    const next = state((d) => {
      d.tokens.typography.bodyFont = "futura"; // izinli (heading family)
      return d;
    });
    const r = enforceOverridePolicy({ policy, prev, next });
    expect(r.ok).toBe(true);
  });
});

describe("override-policy — projeksiyon & resolver", () => {
  it("projectFieldPolicy editable/locked/hidden ayırır", () => {
    const policy: StoreOverridePolicy = {
      ...defaultOverridePolicy(),
      fields: {
        ...defaultOverridePolicy().fields,
        "slot.header": "locked",
        "slot.footer": "hidden",
        "brand.primaryColor": "editable",
      },
    };
    const proj = projectFieldPolicy(policy);
    expect(proj.locked).toContain("slot.header");
    expect(proj.hidden).toContain("slot.footer");
    expect(proj.editable).toContain("brand.primaryColor");
  });

  it("resolveFieldValue renk/slot/layout değerini doğru okur", () => {
    const s = state((d) => {
      d.tokens.brand.primary = "#abcdef";
      return d;
    }, { layoutPreset: "FASHION_MINIMAL", slots: { header: "CENTERED_BRAND" } });
    expect(resolveFieldValue(s, "brand.primaryColor")).toBe("#abcdef");
    expect(resolveFieldValue(s, "layoutPreset")).toBe("FASHION_MINIMAL");
    expect(resolveFieldValue(s, "slot.header")).toBe("CENTERED_BRAND");
    expect(resolveFieldValue(s, "brand.logo")).toBeUndefined();
  });
});
