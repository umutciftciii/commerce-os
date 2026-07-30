import { DEFAULT_TYPOGRAPHY } from "./build.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Safe Font Library (TODO-164B · ADR-235)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TODO-164A yalnız 3 font sunuyordu (system/serif/mono). Bu modül TİPLİ, güvenli
 * bir font kütüphanesi tanımlar: 8 kategoride 18 hazır font eşleşmesi. Kullanıcı
 * SERBEST `font-family` YAZAMAZ — yalnız buradaki hazır preset'lerden seçer.
 *
 * İki katman:
 *   1. `FONT_FAMILIES` — atomik, sunucu-tanımlı GÜVENLİ font-family stack'leri
 *      (familyId → stack). Bu id'ler `typography.headingFont`/`bodyFont` token'ında
 *      saklanır ve `validate.ts` (`FONT_FAMILY_PRESETS`) tarafından stack'e map
 *      edilerek doğrulanır (H-1: serbest string reddi korunur). Stack'ler yaygın
 *      SİSTEM fontlarına + generic fallback'e dayanır → @font-face yükleme
 *      GEREKMEZ (web-font barındırma ayrı bir TD, bkz. TECHNICAL_DEBT).
 *   2. `FONT_PRESETS` — heading+body eşleşmesi + önerilen ağırlıklar + fallback +
 *      locale + okunabilirlik skoru + kaynak/lisans metadata'sı. UI bu preset'leri
 *      listeler; seçince heading/body familyId'lerini token'a yazar.
 *
 * SAF modül — DOM/IO yok. `override-policy.ts` `allowedFonts` bu preset id'lerini
 * kısıtlar (mağaza yalnız Platform Admin'in izin verdiklerini görür).
 */

// ── Atomik güvenli font-family stack'leri (familyId → stack) ──────────────────
export interface FontFamilyDef {
  /** Token'da saklanan kimlik (typography.headingFont/bodyFont). */
  id: string;
  nameTr: string;
  nameEn: string;
  /** Sunucu-tanımlı GÜVENLİ CSS font-family stack'i. */
  stack: string;
  /** Baskın generic aile (fallback güvencesi). */
  generic: "sans-serif" | "serif" | "monospace";
}

// Yüklenmiş next/font yüzleri (Inter=sans, Playfair=serif) + sistem fallback.
const LOADED_SANS = DEFAULT_TYPOGRAPHY.bodyFont;
const LOADED_SERIF = DEFAULT_TYPOGRAPHY.headingFont;

export const FONT_FAMILIES: readonly FontFamilyDef[] = [
  // Sans aileleri
  { id: "system-sans", nameTr: "Sistem Sans", nameEn: "System Sans", stack: LOADED_SANS, generic: "sans-serif" },
  { id: "inter", nameTr: "Inter", nameEn: "Inter", stack: LOADED_SANS, generic: "sans-serif" },
  {
    id: "helvetica-neue",
    nameTr: "Helvetica Neue",
    nameEn: "Helvetica Neue",
    stack: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    generic: "sans-serif",
  },
  {
    id: "avenir",
    nameTr: "Avenir",
    nameEn: "Avenir",
    stack: '"Avenir Next", Avenir, "Segoe UI", Roboto, sans-serif',
    generic: "sans-serif",
  },
  {
    id: "futura",
    nameTr: "Futura",
    nameEn: "Futura",
    stack: 'Futura, "Century Gothic", "Trebuchet MS", sans-serif',
    generic: "sans-serif",
  },
  {
    id: "optima",
    nameTr: "Optima",
    nameEn: "Optima",
    stack: 'Optima, Candara, "Gill Sans", "Segoe UI", sans-serif',
    generic: "sans-serif",
  },
  {
    id: "gill-sans",
    nameTr: "Gill Sans",
    nameEn: "Gill Sans",
    stack: '"Gill Sans", "Gill Sans MT", Calibri, "Segoe UI", sans-serif',
    generic: "sans-serif",
  },
  {
    id: "trebuchet",
    nameTr: "Trebuchet",
    nameEn: "Trebuchet",
    stack: '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif',
    generic: "sans-serif",
  },
  // Serif aileleri
  { id: "system-serif", nameTr: "Sistem Serif", nameEn: "System Serif", stack: LOADED_SERIF, generic: "serif" },
  { id: "playfair", nameTr: "Playfair", nameEn: "Playfair", stack: LOADED_SERIF, generic: "serif" },
  {
    id: "georgia",
    nameTr: "Georgia",
    nameEn: "Georgia",
    stack: 'Georgia, Cambria, "Times New Roman", serif',
    generic: "serif",
  },
  {
    id: "palatino",
    nameTr: "Palatino",
    nameEn: "Palatino",
    stack: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
    generic: "serif",
  },
  {
    id: "baskerville",
    nameTr: "Baskerville",
    nameEn: "Baskerville",
    stack: 'Baskerville, "Baskerville Old Face", "Hoefler Text", Garamond, serif',
    generic: "serif",
  },
  {
    id: "garamond",
    nameTr: "Garamond",
    nameEn: "Garamond",
    stack: 'Garamond, "EB Garamond", "Apple Garamond", "Times New Roman", serif',
    generic: "serif",
  },
  {
    id: "didot",
    nameTr: "Didot",
    nameEn: "Didot",
    stack: 'Didot, "Bodoni MT", "Playfair Display", Georgia, serif',
    generic: "serif",
  },
  {
    id: "cochin",
    nameTr: "Cochin",
    nameEn: "Cochin",
    stack: 'Cochin, "Hoefler Text", "Big Caslon", Georgia, serif',
    generic: "serif",
  },
];

const FAMILY_BY_ID: ReadonlyMap<string, FontFamilyDef> = new Map(FONT_FAMILIES.map((f) => [f.id, f]));

export function getFontFamily(id: string): FontFamilyDef | undefined {
  return FAMILY_BY_ID.get(id);
}

/** familyId → güvenli stack (yoksa undefined). */
export function fontStack(id: string): string | undefined {
  return FAMILY_BY_ID.get(id)?.stack;
}

/**
 * validate.ts genişletmesi için familyId → stack haritası. `FONT_FAMILY_PRESETS`
 * bununla ADDITIVE birleşir; böylece token bir familyId sakladığında doğrulama
 * onu güvenli stack'e map eder (serbest font-family reddi korunur).
 */
export const FONT_LIBRARY_STACKS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(FONT_FAMILIES.map((f) => [f.id, f.stack])),
);

// ── Font preset'leri (heading + body eşleşmesi) ────────────────────────────────
export type FontCategory =
  | "sans"
  | "serif"
  | "editorial"
  | "geometric"
  | "humanist"
  | "display"
  | "luxury"
  | "minimal";

export const FONT_CATEGORIES: readonly FontCategory[] = [
  "sans",
  "serif",
  "editorial",
  "geometric",
  "humanist",
  "display",
  "luxury",
  "minimal",
];

export interface FontPreset {
  id: string;
  nameTr: string;
  nameEn: string;
  category: FontCategory;
  /** Başlık ailesi (FONT_FAMILIES id). */
  headingFamily: string;
  /** Gövde ailesi (FONT_FAMILIES id). */
  bodyFamily: string;
  /** Önerilen font ağırlıkları (100–900). */
  recommendedWeights: readonly number[];
  /** İnsan-okur fallback açıklaması. */
  fallback: string;
  /** Desteklenen locale'ler (Latin-ext güvenli). */
  localeSupport: readonly string[];
  /** Okunabilirlik skoru (0–100; a11y font seçim rehberi). */
  readabilityScore: number;
  /** Font kaynağı. */
  source: "system" | "bundled";
  /** Lisans. */
  license: string;
}

const TR_EN = ["tr", "en"] as const;

export const FONT_PRESETS: readonly FontPreset[] = [
  // Sans
  {
    id: "modern-sans",
    nameTr: "Modern Sans",
    nameEn: "Modern Sans",
    category: "sans",
    headingFamily: "inter",
    bodyFamily: "inter",
    recommendedWeights: [400, 500, 600, 700],
    fallback: "ui-sans-serif / system-ui",
    localeSupport: TR_EN,
    readabilityScore: 96,
    source: "bundled",
    license: "OFL-1.1",
  },
  {
    id: "neue-grotesk",
    nameTr: "Neue Grotesk",
    nameEn: "Neue Grotesk",
    category: "sans",
    headingFamily: "helvetica-neue",
    bodyFamily: "helvetica-neue",
    recommendedWeights: [400, 500, 700],
    fallback: "Helvetica / Arial",
    localeSupport: TR_EN,
    readabilityScore: 93,
    source: "system",
    license: "system-font",
  },
  {
    id: "system-native",
    nameTr: "Sistem Yerel",
    nameEn: "System Native",
    category: "sans",
    headingFamily: "system-sans",
    bodyFamily: "system-sans",
    recommendedWeights: [400, 600, 700],
    fallback: "system-ui / -apple-system",
    localeSupport: TR_EN,
    readabilityScore: 95,
    source: "system",
    license: "system-font",
  },
  // Serif
  {
    id: "classic-serif",
    nameTr: "Klasik Serif",
    nameEn: "Classic Serif",
    category: "serif",
    headingFamily: "georgia",
    bodyFamily: "georgia",
    recommendedWeights: [400, 600, 700],
    fallback: "Cambria / Times New Roman",
    localeSupport: TR_EN,
    readabilityScore: 90,
    source: "system",
    license: "system-font",
  },
  {
    id: "playfair-serif",
    nameTr: "Playfair Serif",
    nameEn: "Playfair Serif",
    category: "serif",
    headingFamily: "playfair",
    bodyFamily: "georgia",
    recommendedWeights: [400, 600, 700],
    fallback: "Georgia / serif",
    localeSupport: TR_EN,
    readabilityScore: 84,
    source: "bundled",
    license: "OFL-1.1",
  },
  // Editorial
  {
    id: "editorial-contrast",
    nameTr: "Editoryal Kontrast",
    nameEn: "Editorial Contrast",
    category: "editorial",
    headingFamily: "playfair",
    bodyFamily: "inter",
    recommendedWeights: [400, 500, 700],
    fallback: "Georgia / Inter",
    localeSupport: TR_EN,
    readabilityScore: 88,
    source: "bundled",
    license: "OFL-1.1",
  },
  {
    id: "baskerville-editorial",
    nameTr: "Baskerville Editoryal",
    nameEn: "Baskerville Editorial",
    category: "editorial",
    headingFamily: "baskerville",
    bodyFamily: "georgia",
    recommendedWeights: [400, 600, 700],
    fallback: "Hoefler Text / Garamond",
    localeSupport: TR_EN,
    readabilityScore: 86,
    source: "system",
    license: "system-font",
  },
  {
    id: "garamond-editorial",
    nameTr: "Garamond Editoryal",
    nameEn: "Garamond Editorial",
    category: "editorial",
    headingFamily: "garamond",
    bodyFamily: "garamond",
    recommendedWeights: [400, 600, 700],
    fallback: "EB Garamond / Times New Roman",
    localeSupport: TR_EN,
    readabilityScore: 85,
    source: "system",
    license: "system-font",
  },
  // Geometric
  {
    id: "geometric-futura",
    nameTr: "Geometrik Futura",
    nameEn: "Geometric Futura",
    category: "geometric",
    headingFamily: "futura",
    bodyFamily: "avenir",
    recommendedWeights: [400, 500, 700],
    fallback: "Century Gothic / Avenir Next",
    localeSupport: TR_EN,
    readabilityScore: 87,
    source: "system",
    license: "system-font",
  },
  {
    id: "avenir-geometric",
    nameTr: "Avenir Geometrik",
    nameEn: "Avenir Geometric",
    category: "geometric",
    headingFamily: "avenir",
    bodyFamily: "avenir",
    recommendedWeights: [400, 500, 600],
    fallback: "Segoe UI / Roboto",
    localeSupport: TR_EN,
    readabilityScore: 91,
    source: "system",
    license: "system-font",
  },
  // Humanist
  {
    id: "optima-humanist",
    nameTr: "Optima Hümanist",
    nameEn: "Optima Humanist",
    category: "humanist",
    headingFamily: "optima",
    bodyFamily: "optima",
    recommendedWeights: [400, 600, 700],
    fallback: "Candara / Gill Sans",
    localeSupport: TR_EN,
    readabilityScore: 89,
    source: "system",
    license: "system-font",
  },
  {
    id: "gill-humanist",
    nameTr: "Gill Hümanist",
    nameEn: "Gill Humanist",
    category: "humanist",
    headingFamily: "gill-sans",
    bodyFamily: "gill-sans",
    recommendedWeights: [400, 600, 700],
    fallback: "Calibri / Segoe UI",
    localeSupport: TR_EN,
    readabilityScore: 88,
    source: "system",
    license: "system-font",
  },
  // Display
  {
    id: "didot-display",
    nameTr: "Didot Display",
    nameEn: "Didot Display",
    category: "display",
    headingFamily: "didot",
    bodyFamily: "georgia",
    recommendedWeights: [400, 700],
    fallback: "Bodoni MT / Georgia",
    localeSupport: TR_EN,
    readabilityScore: 78,
    source: "system",
    license: "system-font",
  },
  {
    id: "cochin-display",
    nameTr: "Cochin Display",
    nameEn: "Cochin Display",
    category: "display",
    headingFamily: "cochin",
    bodyFamily: "inter",
    recommendedWeights: [400, 700],
    fallback: "Hoefler Text / Inter",
    localeSupport: TR_EN,
    readabilityScore: 80,
    source: "system",
    license: "system-font",
  },
  // Luxury
  {
    id: "palatino-luxe",
    nameTr: "Palatino Lüks",
    nameEn: "Palatino Luxe",
    category: "luxury",
    headingFamily: "palatino",
    bodyFamily: "palatino",
    recommendedWeights: [400, 600, 700],
    fallback: "Book Antiqua / Georgia",
    localeSupport: TR_EN,
    readabilityScore: 87,
    source: "system",
    license: "system-font",
  },
  {
    id: "didot-luxe",
    nameTr: "Didot Lüks",
    nameEn: "Didot Luxe",
    category: "luxury",
    headingFamily: "didot",
    bodyFamily: "palatino",
    recommendedWeights: [400, 700],
    fallback: "Bodoni MT / Palatino",
    localeSupport: TR_EN,
    readabilityScore: 79,
    source: "system",
    license: "system-font",
  },
  // Minimal
  {
    id: "minimal-sans",
    nameTr: "Minimal Sans",
    nameEn: "Minimal Sans",
    category: "minimal",
    headingFamily: "helvetica-neue",
    bodyFamily: "inter",
    recommendedWeights: [400, 500, 600],
    fallback: "Helvetica / Inter",
    localeSupport: TR_EN,
    readabilityScore: 94,
    source: "bundled",
    license: "OFL-1.1",
  },
  {
    id: "trebuchet-minimal",
    nameTr: "Trebuchet Minimal",
    nameEn: "Trebuchet Minimal",
    category: "minimal",
    headingFamily: "trebuchet",
    bodyFamily: "trebuchet",
    recommendedWeights: [400, 700],
    fallback: "Segoe UI / Tahoma",
    localeSupport: TR_EN,
    readabilityScore: 90,
    source: "system",
    license: "system-font",
  },
];

const PRESET_BY_ID: ReadonlyMap<string, FontPreset> = new Map(FONT_PRESETS.map((p) => [p.id, p]));

/** Tüm font id'leri (allowlist doğrulaması için). */
export const FONT_PRESET_IDS: readonly string[] = FONT_PRESETS.map((p) => p.id);

export function getFontPreset(id: string): FontPreset | undefined {
  return PRESET_BY_ID.get(id);
}

export function isFontPresetId(id: string): boolean {
  return PRESET_BY_ID.has(id);
}

/** Font preset'lerini (isteğe bağlı kategori filtresiyle) listeler. */
export function listFontPresets(category?: FontCategory): FontPreset[] {
  return category ? FONT_PRESETS.filter((p) => p.category === category) : [...FONT_PRESETS];
}

/** Bir font preset'inin çözülmüş heading/body güvenli stack'lerini döndürür. */
export function resolveFontPresetStacks(id: string): { headingStack: string; bodyStack: string } | undefined {
  const preset = PRESET_BY_ID.get(id);
  if (!preset) return undefined;
  const headingStack = fontStack(preset.headingFamily);
  const bodyStack = fontStack(preset.bodyFamily);
  if (!headingStack || !bodyStack) return undefined;
  return { headingStack, bodyStack };
}
