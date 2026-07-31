import { describe, it, expect } from "vitest";
import { summarizeThemeChanges, type ThemeDiffSide } from "./theme-diff.js";
import { DEFAULT_THEME_DOCUMENT } from "./presets.js";
import { defaultOverridePolicy, type PolicyThemeState, type StoreOverridePolicy } from "./override-policy.js";
import type { ThemeDocument } from "./schema.js";

function clone(): ThemeDocument {
  return JSON.parse(JSON.stringify(DEFAULT_THEME_DOCUMENT)) as ThemeDocument;
}
function side(
  patch?: (doc: ThemeDocument) => void,
  config: PolicyThemeState["config"] = {},
  extra?: Partial<Omit<ThemeDiffSide, "state">>,
): ThemeDiffSide {
  const doc = clone();
  if (patch) patch(doc);
  return { state: { document: doc, config }, ...extra };
}
function tok(doc: ThemeDocument, group: string, key: string, value: string) {
  (doc.tokens as unknown as Record<string, Record<string, unknown>>)[group][key] = value;
}

describe("theme-diff — özdeşlik", () => {
  it("aynı iki taraf → değişiklik yok", () => {
    const s = summarizeThemeChanges(side(), side());
    expect(s.hasChanges).toBe(false);
    expect(s.total).toBe(0);
  });
});

describe("theme-diff — token/renk", () => {
  it("ana buton rengi değişimi color kategorisinde tek değişiklik", () => {
    const prev = side((d) => tok(d, "brand", "primary", "#111111"));
    const next = side((d) => tok(d, "brand", "primary", "#ff0000"));
    const s = summarizeThemeChanges(prev, next);
    expect(s.counts.color).toBe(1);
    expect(s.total).toBe(1);
    const change = s.changes[0];
    expect(change.category).toBe("color");
    expect(change.before).toBe("#111111");
    expect(change.after).toBe("#ff0000");
    expect(change.labelTr).toContain("Ana buton");
  });
  it("tipografi değişimi typography kategorisinde", () => {
    const prev = side((d) => tok(d, "typography", "headingFont", "inter"));
    const next = side((d) => tok(d, "typography", "headingFont", "playfair"));
    const s = summarizeThemeChanges(prev, next);
    expect(s.counts.typography).toBe(1);
  });
});

describe("theme-diff — layout/slot", () => {
  it("layoutPreset değişimi layout kategorisinde", () => {
    const s = summarizeThemeChanges(
      side(undefined, { layoutPreset: "BASE_COMMERCE" }),
      side(undefined, { layoutPreset: "FASHION_MINIMAL" }),
    );
    expect(s.counts.layout).toBe(1);
    expect(s.changes[0].after).toBe("FASHION_MINIMAL");
  });
  it("slot değişimi slot kategorisinde", () => {
    const s = summarizeThemeChanges(
      side(undefined, { slots: { header: "classic" } }),
      side(undefined, { slots: { header: "centered" } }),
    );
    expect(s.counts.slot).toBe(1);
  });
});

describe("theme-diff — medya (logo/favicon otoritesi StoreSettings)", () => {
  it("logo değişimi media kategorisinde (assets ile)", () => {
    const prev = side(undefined, {}, { assets: { logoMediaId: "m1", faviconMediaId: null } });
    const next = side(undefined, {}, { assets: { logoMediaId: "m2", faviconMediaId: null } });
    const s = summarizeThemeChanges(prev, next);
    expect(s.counts.media).toBe(1);
    expect(s.changes[0].before).toBe("m1");
    expect(s.changes[0].after).toBe("m2");
  });
  it("assets verilmezse logo değişikliği ölçülmez (belge/config'te yok)", () => {
    const s = summarizeThemeChanges(side(), side());
    expect(s.counts.media).toBe(0);
  });
});

describe("theme-diff — policy", () => {
  it("alan yetkisi değişimi policy kategorisinde", () => {
    const prev: StoreOverridePolicy = defaultOverridePolicy();
    const next: StoreOverridePolicy = defaultOverridePolicy();
    next.fields["slot.header"] = "locked";
    const s = summarizeThemeChanges(
      { state: side().state, policy: prev },
      { state: side().state, policy: next },
    );
    expect(s.counts.policy).toBe(1);
    expect(s.changes[0].before).toBe("editable");
    expect(s.changes[0].after).toBe("locked");
  });
  it("allowlist değişimi policy kategorisinde", () => {
    const prev = defaultOverridePolicy();
    const next = defaultOverridePolicy();
    next.allowedFonts = ["modern-sans"];
    const s = summarizeThemeChanges(
      { state: side().state, policy: prev },
      { state: side().state, policy: next },
    );
    expect(s.counts.policy).toBe(1);
    expect(s.changes[0].path).toBe("policy:allowedFonts");
  });
  it("policy yalnız bir tarafta verilirse karşılaştırılmaz", () => {
    const s = summarizeThemeChanges({ state: side().state, policy: defaultOverridePolicy() }, side());
    expect(s.counts.policy).toBe(0);
  });
});
