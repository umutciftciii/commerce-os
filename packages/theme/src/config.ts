import { z } from "zod";
import {
  BASE_LAYOUT_PRESET_KEY,
  getLayoutPreset,
  layoutPresetKeySchema,
  resolveLayoutPresetSlots,
  type LayoutPresetKey,
} from "./layout-presets.js";
import {
  isValidSlotVariant,
  normalizeSlotSelections,
  slotSelectionSchema,
  type ThemeSlotKey,
} from "./slots.js";
import {
  BASE_THEME_KEY,
  getThemeEntry,
  isKnownThemeKey,
} from "./theme-registry.js";
import { getBundledCustomPackage } from "./custom-package.js";
import { DEFAULT_THEME_DOCUMENT, getPreset } from "./presets.js";
import type { ThemeDocument } from "./schema.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Theme Config — persist edilen layout/slot yapılandırması (TODO-164 · ADR-223)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `ThemeVersion.config` JSON'unda yaşar (draftConfig = DRAFT sürüm, publishedConfig
 * = PUBLISHED sürüm — token `document` ile AYNI versiyonlama). Typed schema ile
 * doğrulanır. Alanlar:
 *   - themeKey     : registry key (BASE / layout preset / custom package).
 *   - layoutPreset : etkin layout preset (custom pakette manifest'ten türetilebilir).
 *   - slots        : slot → variant OVERRIDE (kısmi; store admin ince ayarı).
 *
 * ÇÖZÜM SIRASI (slot variant): custom package slots → layout preset slots → config
 * override → slot defaultVariant. Sonuç render-safe TAM harita.
 */

export const themeConfigSchema = z
  .object({
    themeKey: z.string().min(1).default(BASE_THEME_KEY),
    layoutPreset: layoutPresetKeySchema.default(BASE_LAYOUT_PRESET_KEY),
    /** Store admin slot ince-ayarı (kısmi; allowlist resolve'ta uygulanır). */
    slots: slotSelectionSchema.default({}),
  })
  .strip();

export interface ThemeConfig {
  themeKey: string;
  layoutPreset: LayoutPresetKey;
  slots: Partial<Record<ThemeSlotKey, string>>;
}

/** Boş/geçersiz config → BASE_COMMERCE varsayılanı (render-safe, geriye uyumlu). */
export function parseThemeConfig(input: unknown): ThemeConfig {
  const parsed = themeConfigSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { themeKey: BASE_THEME_KEY, layoutPreset: BASE_LAYOUT_PRESET_KEY, slots: {} };
  }
  const data = parsed.data;
  // Bilinmeyen themeKey → BASE (fail-closed).
  const themeKey = isKnownThemeKey(data.themeKey) ? data.themeKey : BASE_THEME_KEY;
  return {
    themeKey,
    layoutPreset: data.layoutPreset,
    slots: data.slots as Partial<Record<ThemeSlotKey, string>>,
  };
}

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  themeKey: BASE_THEME_KEY,
  layoutPreset: BASE_LAYOUT_PRESET_KEY,
  slots: {},
};

/**
 * Bir config'i TAM, render-safe slot haritasına çözer. Katman önceliği (sonraki
 * öncekini ezer): layout preset → custom package slots → config override. Sonuç
 * daima tüm slotları içerir (defaultVariant fallback).
 */
export function resolveConfigSlots(config: ThemeConfig): Record<ThemeSlotKey, string> {
  // 1) Layout preset temeli.
  const base = resolveLayoutPresetSlots(config.layoutPreset);

  // 2) Custom package slot seçimleri (registry'de bilinen paketse).
  const entry = getThemeEntry(config.themeKey);
  if (entry?.kind === "CUSTOM_PACKAGE") {
    const pkg = getBundledCustomPackage(config.themeKey);
    if (pkg) {
      const pkgSlots = normalizeSlotSelections(pkg.slots);
      // Yalnız paketin supportedSlots'unda gerçekten override edilenleri uygula.
      for (const slot of pkg.supportedSlots) {
        if (pkg.slots[slot]) base[slot] = pkgSlots[slot];
      }
    }
  }

  // 3) Store admin config override (allowlist). GEÇERSİZ/bilinmeyen override slotu
  // ATLANIR — alttaki preset/paket değerini EZMEZ (aksi halde geçersiz değer slotu
  // default'a düşürüp preset seçimini bozardı).
  for (const [slot, variant] of Object.entries(config.slots)) {
    if (typeof variant === "string" && isValidSlotVariant(slot, variant)) {
      base[slot as ThemeSlotKey] = variant;
    }
  }

  return base;
}

/**
 * Bir theme-key için TOKEN belgesini (renk/tipografi paleti) çözer. Platform Admin
 * ataması bunu kullanır: bir tema atandığında YALNIZ düzen (slot) değil, temanın
 * PALETİ de uygulanır (aksi halde atama görsel olarak "değişmedi" gibi görünür —
 * en belirgin sinyal renk paletidir).
 *
 * Öncelik:
 *   - CUSTOM_PACKAGE: manifest.tokenPreset → yoksa layout preset'in tokenPreset'i.
 *   - LAYOUT_PRESET / BASE: layout preset'in tokenPreset'i.
 * tokenPreset yoksa/bilinmiyorsa → DEFAULT_THEME_DOCUMENT (base palet).
 */
export function resolveThemeDocumentForKey(themeKey: string): ThemeDocument {
  const entry = getThemeEntry(themeKey);
  if (!entry) return DEFAULT_THEME_DOCUMENT;
  let tokenPreset: string | null = null;
  if (entry.kind === "CUSTOM_PACKAGE") {
    tokenPreset = getBundledCustomPackage(themeKey)?.tokenPreset ?? null;
  }
  if (!tokenPreset) {
    tokenPreset = getLayoutPreset(entry.layoutPreset)?.tokenPreset ?? null;
  }
  if (tokenPreset) {
    const preset = getPreset(tokenPreset);
    if (preset) return preset.document;
  }
  return DEFAULT_THEME_DOCUMENT;
}
