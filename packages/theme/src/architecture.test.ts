import { describe, it, expect } from "vitest";
import {
  THEME_SLOT_REGISTRY,
  listThemeSlotKeys,
  isValidSlotVariant,
  resolveSlotVariant,
  normalizeSlotSelections,
  defaultSlotSelections,
} from "./slots.js";
import {
  LAYOUT_PRESETS,
  getLayoutPreset,
  resolveLayoutPresetSlots,
  isLayoutPresetKey,
  BASE_LAYOUT_PRESET_KEY,
} from "./layout-presets.js";
import {
  THEME_REGISTRY,
  getThemeEntry,
  isKnownThemeKey,
  listThemeKeys,
  BASE_THEME_KEY,
  THEME_API_VERSION,
  listThemeEntriesByKind,
} from "./theme-registry.js";
import {
  checkThemeKeyCompatibility,
  checkEntryCompatibility,
  compatibilityErrors,
  semverGte,
} from "./compatibility.js";
import {
  validateCustomThemePackage,
  BUNDLED_CUSTOM_PACKAGES,
  getBundledCustomPackage,
} from "./custom-package.js";
import { parseThemeConfig, resolveConfigSlots, DEFAULT_THEME_CONFIG } from "./config.js";

// ── Slot contract ──────────────────────────────────────────────────────────
describe("slot contract", () => {
  it("her slotun defaultVariant'ı variants[0] ile aynı (BASE görünüm)", () => {
    for (const s of THEME_SLOT_REGISTRY) {
      expect(s.variants[0]).toBe(s.defaultVariant);
      expect(s.variants.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("slot anahtarları benzersiz", () => {
    const keys = listThemeSlotKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("isValidSlotVariant bilinmeyen slot/variant için fail-closed", () => {
    expect(isValidSlotVariant("header", "solid")).toBe(true);
    expect(isValidSlotVariant("header", "nope")).toBe(false);
    expect(isValidSlotVariant("nosuchslot", "solid")).toBe(false);
  });

  it("resolveSlotVariant geçersizde defaultVariant'a düşer", () => {
    expect(resolveSlotVariant("productCard", "premium")).toBe("premium");
    expect(resolveSlotVariant("productCard", "bogus")).toBe("comfortable");
    expect(resolveSlotVariant("productCard", undefined)).toBe("comfortable");
  });

  it("normalizeSlotSelections bilinmeyen slot/variant'ı atar, tamı doldurur", () => {
    const out = normalizeSlotSelections({
      header: "minimal",
      productCard: "bogus",
      unknownSlot: "x",
    } as Record<string, string>);
    expect(out.header).toBe("minimal");
    expect(out.productCard).toBe("comfortable"); // bogus → default
    expect(Object.keys(out).sort()).toEqual(listThemeSlotKeys().sort());
    expect((out as Record<string, string>).unknownSlot).toBeUndefined();
  });

  it("defaultSlotSelections tüm slotları defaultVariant'ta verir", () => {
    const out = defaultSlotSelections();
    for (const s of THEME_SLOT_REGISTRY) expect(out[s.key]).toBe(s.defaultVariant);
  });
});

// ── Layout presets ─────────────────────────────────────────────────────────
describe("layout presets", () => {
  it("BASE_COMMERCE tüm slotları defaultVariant'ta bırakır (geriye uyumlu)", () => {
    const slots = resolveLayoutPresetSlots(BASE_LAYOUT_PRESET_KEY);
    expect(slots).toEqual(defaultSlotSelections());
  });

  it("her preset'in seçtiği variant izinli", () => {
    for (const p of LAYOUT_PRESETS) {
      for (const [slot, variant] of Object.entries(p.slots)) {
        expect(isValidSlotVariant(slot, variant as string)).toBe(true);
      }
    }
  });

  it("bilinmeyen preset → BASE_COMMERCE slotları", () => {
    expect(resolveLayoutPresetSlots("NOPE")).toEqual(defaultSlotSelections());
    expect(isLayoutPresetKey("NOPE")).toBe(false);
    expect(getLayoutPreset("NOPE")).toBeUndefined();
  });

  it("FASHION presetleri en az bir slotu default'tan farklı çözer", () => {
    const fm = resolveLayoutPresetSlots("FASHION_MINIMAL");
    expect(fm.productCard).toBe("compact");
    expect(fm.header).toBe("minimal");
  });
});

// ── Theme registry ─────────────────────────────────────────────────────────
describe("theme registry", () => {
  it("key'ler benzersiz", () => {
    const keys = listThemeKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("BASE_COMMERCE kaydı vardır ve kendi fallback'idir", () => {
    const base = getThemeEntry(BASE_THEME_KEY);
    expect(base).toBeDefined();
    expect(base!.kind).toBe("BASE");
    expect(base!.fallbackThemeKey).toBe(BASE_THEME_KEY);
  });

  it("her layout preset registry'de LAYOUT_PRESET olarak var (BASE hariç)", () => {
    for (const p of LAYOUT_PRESETS) {
      if (p.key === BASE_LAYOUT_PRESET_KEY) continue;
      const e = getThemeEntry(p.key);
      expect(e?.kind).toBe("LAYOUT_PRESET");
      expect(e?.fallbackThemeKey).toBe(BASE_THEME_KEY);
    }
  });

  it("demo custom package registry'de CUSTOM_PACKAGE olarak var", () => {
    const e = getThemeEntry("demo-aurora");
    expect(e?.kind).toBe("CUSTOM_PACKAGE");
    expect(listThemeEntriesByKind("CUSTOM_PACKAGE").length).toBeGreaterThanOrEqual(1);
  });

  it("unknown theme key reddedilir", () => {
    expect(isKnownThemeKey("demo-aurora")).toBe(true);
    expect(isKnownThemeKey("attacker-theme")).toBe(false);
    expect(isKnownThemeKey(42)).toBe(false);
  });

  it("tüm kayıtların themeApiVersion engine sürümünü aşmaz", () => {
    for (const e of THEME_REGISTRY) expect(e.themeApiVersion).toBeLessThanOrEqual(THEME_API_VERSION);
  });
});

// ── Compatibility ──────────────────────────────────────────────────────────
describe("compatibility", () => {
  it("semverGte doğru", () => {
    expect(semverGte("1.0.0", "1.0.0")).toBe(true);
    expect(semverGte("1.2.0", "1.0.5")).toBe(true);
    expect(semverGte("1.0.0", "1.1.0")).toBe(false);
    expect(semverGte("2.0.0", "1.9.9")).toBe(true);
  });

  it("bilinen ACTIVE tema uyumlu", () => {
    const r = checkThemeKeyCompatibility(BASE_THEME_KEY);
    expect(r.compatible).toBe(true);
    expect(compatibilityErrors(r)).toHaveLength(0);
  });

  it("unknown theme key hard incompatible", () => {
    const r = checkThemeKeyCompatibility("attacker-theme");
    expect(r.compatible).toBe(false);
    expect(r.issues[0].code).toBe("UNKNOWN_THEME_KEY");
  });

  it("ileri themeApiVersion reddedilir", () => {
    const r = checkEntryCompatibility({
      ...getThemeEntry(BASE_THEME_KEY)!,
      themeApiVersion: THEME_API_VERSION + 5,
    });
    expect(r.compatible).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("THEME_API_TOO_NEW");
  });

  it("çok yeni minimumCommerceVersion reddedilir", () => {
    const r = checkEntryCompatibility({
      ...getThemeEntry(BASE_THEME_KEY)!,
      minimumCommerceVersion: "99.0.0",
    });
    expect(r.compatible).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("COMMERCE_VERSION_TOO_OLD");
  });

  it("DISABLED status incompatible; DEPRECATED yalnız uyarı", () => {
    const disabled = checkEntryCompatibility({ ...getThemeEntry(BASE_THEME_KEY)!, status: "DISABLED" });
    expect(disabled.compatible).toBe(false);
    const deprecated = checkEntryCompatibility({ ...getThemeEntry(BASE_THEME_KEY)!, status: "DEPRECATED" });
    expect(deprecated.compatible).toBe(true);
    expect(deprecated.issues.map((i) => i.code)).toContain("THEME_DEPRECATED");
  });

  it("izinsiz slot variant / bilinmeyen slot incompatible", () => {
    const r = checkThemeKeyCompatibility(BASE_THEME_KEY, {
      slotSelections: { header: "nope", ghostSlot: "x" },
    });
    expect(r.compatible).toBe(false);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("INVALID_SLOT_VARIANT");
    expect(codes).toContain("UNKNOWN_SLOT");
  });
});

// ── Custom package ─────────────────────────────────────────────────────────
describe("custom theme package", () => {
  it("paketlenmiş demo paket doğrulamadan geçer", () => {
    for (const m of BUNDLED_CUSTOM_PACKAGES) {
      const r = validateCustomThemePackage(m);
      expect(r.ok).toBe(true);
    }
  });

  it("supportedSlots dışı slot reddedilir", () => {
    const r = validateCustomThemePackage({
      ...BUNDLED_CUSTOM_PACKAGES[0],
      slots: { footer: "minimal" },
    });
    expect(r.ok).toBe(false);
  });

  it("izinsiz variant reddedilir", () => {
    const r = validateCustomThemePackage({
      ...BUNDLED_CUSTOM_PACKAGES[0],
      slots: { header: "bogus" },
    });
    expect(r.ok).toBe(false);
  });

  it("geçersiz packageKey / semver reddedilir", () => {
    expect(validateCustomThemePackage({ ...BUNDLED_CUSTOM_PACKAGES[0], packageKey: "X" }).ok).toBe(false);
    expect(
      validateCustomThemePackage({ ...BUNDLED_CUSTOM_PACKAGES[0], minimumCommerceVersion: "1.0" }).ok,
    ).toBe(false);
  });

  it("bilinmeyen alan (strict) reddedilir — sızıntı yolu kapalı", () => {
    const r = validateCustomThemePackage({
      ...BUNDLED_CUSTOM_PACKAGES[0],
      evilScript: "<script>",
    });
    expect(r.ok).toBe(false);
  });

  it("getBundledCustomPackage lookup", () => {
    expect(getBundledCustomPackage("demo-aurora")?.packageKey).toBe("demo-aurora");
    expect(getBundledCustomPackage("nope")).toBeUndefined();
  });
});

// ── Theme config resolution ────────────────────────────────────────────────
describe("theme config", () => {
  it("boş/geçersiz config → BASE varsayılanı", () => {
    expect(parseThemeConfig(undefined)).toEqual(DEFAULT_THEME_CONFIG);
    expect(parseThemeConfig({ themeKey: "attacker" }).themeKey).toBe(BASE_THEME_KEY);
  });

  it("layout preset config'i tam slot haritasına çözer", () => {
    const cfg = parseThemeConfig({ themeKey: "FASHION_MINIMAL", layoutPreset: "FASHION_MINIMAL" });
    const slots = resolveConfigSlots(cfg);
    expect(slots.productCard).toBe("compact");
    expect(Object.keys(slots).sort()).toEqual(listThemeSlotKeys().sort());
  });

  it("custom package slot seçimleri layout preset'i ezer", () => {
    const cfg = parseThemeConfig({ themeKey: "demo-aurora", layoutPreset: "BASE_COMMERCE" });
    const slots = resolveConfigSlots(cfg);
    expect(slots.hero).toBe("split"); // paket override
    expect(slots.productCard).toBe("premium");
  });

  it("store admin config override en yüksek öncelik (allowlist)", () => {
    const cfg = parseThemeConfig({
      themeKey: "BASE_COMMERCE",
      layoutPreset: "FASHION_MINIMAL",
      slots: { productCard: "premium", header: "bogus" },
    });
    const slots = resolveConfigSlots(cfg);
    expect(slots.productCard).toBe("premium"); // override
    expect(slots.header).toBe("minimal"); // bogus atıldı → preset değeri korunur
  });
});
