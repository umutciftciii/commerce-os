import type { BuildThemeInput } from "./build.js";
import { checkContrast, type ContrastResult } from "./contrast.js";
import type { DesignTokens, ThemeDocument } from "./schema.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Named Color Palette Library (TODO-164B · ADR-236)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kullanıcı-dostu, güvenli, hazır renk paletleri. Store Admin bir palet seçtiğinde
 * TİPLİ token seti draft'a uygulanır (`applyPaletteToDocument`) → preview anında
 * güncellenir; kullanıcı sonra tek tek override yapabilir. Palet `presets.ts`
 * REGISTRY'sini MUTATE ETMEZ — yalnız verilen belgeye uygular ve yeni belge döner.
 *
 * Her palet PUBLISH-güvenli olacak şekilde seçilmiştir (WCAG kritik çiftler; bkz.
 * `paletteContrast` + testler). Renkler yalnız primitive paletidir
 * (brand/surface/text/border/feedback); semantic + component katmanları `{ref}`
 * ile OTOMATİK takip eder — tek istisna `action.primaryContrast` (aksan üstü metin)
 * somut olduğu için palet uygulanırken güncellenir.
 *
 * SAF modül — DOM/IO yok.
 */

export interface ColorPalette {
  id: string;
  nameTr: string;
  nameEn: string;
  descriptionTr: string;
  colorScheme: "light" | "dark";
  brand: BuildThemeInput["brand"];
  surface: BuildThemeInput["surface"];
  text: BuildThemeInput["text"];
  border: BuildThemeInput["border"];
  feedback: BuildThemeInput["feedback"];
  /** Aksan (birincil buton) üstü metin rengi. */
  primaryContrast: string;
}

const LIGHT_FEEDBACK: BuildThemeInput["feedback"] = {
  success: "#1f7a4d",
  warning: "#b7791f",
  error: "#c0392b",
  info: "#2b6cb0",
};

const DARK_FEEDBACK: BuildThemeInput["feedback"] = {
  success: "#34d399",
  warning: "#fbbf24",
  error: "#f87171",
  info: "#60a5fa",
};

export const COLOR_PALETTES: readonly ColorPalette[] = [
  {
    id: "modern-minimal",
    nameTr: "Modern Minimal",
    nameEn: "Modern Minimal",
    descriptionTr: "Nötr griler, indigo aksan, ferah beyaz zemin.",
    colorScheme: "light",
    brand: { primary: "#3730a3", secondary: "#312e81", accent: "#4f46e5", tertiary: "#64748b" },
    surface: {
      background: "#ffffff",
      surface: "#ffffff",
      surfaceMuted: "#f5f6f8",
      surfaceElevated: "#ffffff",
      overlay: "rgb(15 23 42 / 0.5)",
    },
    text: { primary: "#111827", secondary: "#4b5563", muted: "#9ca3af", inverse: "#ffffff", link: "#3730a3" },
    border: { default: "#e5e7eb", subtle: "#f3f4f6", strong: "#d1d5db", focus: "#4f46e5" },
    feedback: LIGHT_FEEDBACK,
    primaryContrast: "#ffffff",
  },
  {
    id: "premium-dark",
    nameTr: "Premium Koyu",
    nameEn: "Premium Dark",
    descriptionTr: "Koyu zemin, altın aksan, lüks kontrast.",
    colorScheme: "dark",
    brand: { primary: "#c8a24a", secondary: "#a8863a", accent: "#d8b45e", tertiary: "#8a8578" },
    surface: {
      background: "#121212",
      surface: "#1c1c1c",
      surfaceMuted: "#242424",
      surfaceElevated: "#262626",
      overlay: "rgb(0 0 0 / 0.6)",
    },
    text: { primary: "#f5f3ee", secondary: "#c4c0b6", muted: "#8a877e", inverse: "#121212", link: "#d8b45e" },
    border: { default: "#333333", subtle: "#2a2a2a", strong: "#4a4a4a", focus: "#c8a24a" },
    feedback: DARK_FEEDBACK,
    primaryContrast: "#1a1508",
  },
  {
    id: "fashion-editorial",
    nameTr: "Moda Editoryal",
    nameEn: "Fashion Editorial",
    descriptionTr: "Yüksek kontrast siyah-beyaz, sıcak aksan.",
    colorScheme: "light",
    brand: { primary: "#1a1a1a", secondary: "#000000", accent: "#a86b4b", tertiary: "#8a8a8a" },
    surface: {
      background: "#fbfaf8",
      surface: "#ffffff",
      surfaceMuted: "#f2f0ec",
      surfaceElevated: "#ffffff",
      overlay: "rgb(0 0 0 / 0.55)",
    },
    text: { primary: "#141414", secondary: "#525252", muted: "#8f8f8f", inverse: "#fbfaf8", link: "#a86b4b" },
    border: { default: "#e6e3dd", subtle: "#f2f0ec", strong: "#cfcabf", focus: "#1a1a1a" },
    feedback: LIGHT_FEEDBACK,
    primaryContrast: "#ffffff",
  },
  {
    id: "soft-neutral",
    nameTr: "Yumuşak Nötr",
    nameEn: "Soft Neutral",
    descriptionTr: "Sıcak bej ve taupe, sakin ve zarif.",
    colorScheme: "light",
    brand: { primary: "#6f5b45", secondary: "#5a4838", accent: "#a98d6b", tertiary: "#a39684" },
    surface: {
      background: "#f8f5f0",
      surface: "#ffffff",
      surfaceMuted: "#efeae1",
      surfaceElevated: "#ffffff",
      overlay: "rgb(60 50 40 / 0.5)",
    },
    text: { primary: "#2e2820", secondary: "#5f584c", muted: "#9a917f", inverse: "#f8f5f0", link: "#6f5b45" },
    border: { default: "#e6ded1", subtle: "#efeae1", strong: "#d3c8b6", focus: "#6f5b45" },
    feedback: LIGHT_FEEDBACK,
    primaryContrast: "#ffffff",
  },
  {
    id: "vibrant-commerce",
    nameTr: "Canlı Ticaret",
    nameEn: "Vibrant Commerce",
    descriptionTr: "Güçlü mavi + turuncu aksan, enerjik.",
    colorScheme: "light",
    brand: { primary: "#1d4ed8", secondary: "#1e40af", accent: "#ea580c", tertiary: "#64748b" },
    surface: {
      background: "#ffffff",
      surface: "#ffffff",
      surfaceMuted: "#f1f5f9",
      surfaceElevated: "#ffffff",
      overlay: "rgb(15 23 42 / 0.5)",
    },
    text: { primary: "#0f172a", secondary: "#475569", muted: "#94a3b8", inverse: "#ffffff", link: "#1d4ed8" },
    border: { default: "#e2e8f0", subtle: "#f1f5f9", strong: "#cbd5e1", focus: "#1d4ed8" },
    feedback: LIGHT_FEEDBACK,
    primaryContrast: "#ffffff",
  },
  {
    id: "warm-boutique",
    nameTr: "Sıcak Butik",
    nameEn: "Warm Boutique",
    descriptionTr: "Terracotta ve krem, samimi butik hava.",
    colorScheme: "light",
    brand: { primary: "#9c3d2e", secondary: "#7d3025", accent: "#c56a4b", tertiary: "#a08476" },
    surface: {
      background: "#fbf6f0",
      surface: "#ffffff",
      surfaceMuted: "#f3e9dd",
      surfaceElevated: "#ffffff",
      overlay: "rgb(50 25 15 / 0.5)",
    },
    text: { primary: "#2c1a12", secondary: "#5e463a", muted: "#9c8474", inverse: "#fbf6f0", link: "#9c3d2e" },
    border: { default: "#ecdccb", subtle: "#f3e9dd", strong: "#d8bfa6", focus: "#9c3d2e" },
    feedback: LIGHT_FEEDBACK,
    primaryContrast: "#ffffff",
  },
  {
    id: "monochrome",
    nameTr: "Monokrom",
    nameEn: "Monochrome",
    descriptionTr: "Saf gri tonlar, tarafsız ve modern.",
    colorScheme: "light",
    brand: { primary: "#171717", secondary: "#000000", accent: "#404040", tertiary: "#737373" },
    surface: {
      background: "#ffffff",
      surface: "#ffffff",
      surfaceMuted: "#f4f4f5",
      surfaceElevated: "#ffffff",
      overlay: "rgb(0 0 0 / 0.5)",
    },
    text: { primary: "#171717", secondary: "#525252", muted: "#a3a3a3", inverse: "#ffffff", link: "#171717" },
    border: { default: "#e4e4e7", subtle: "#f4f4f5", strong: "#d4d4d8", focus: "#171717" },
    feedback: LIGHT_FEEDBACK,
    primaryContrast: "#ffffff",
  },
  {
    id: "corporate-clean",
    nameTr: "Kurumsal Temiz",
    nameEn: "Corporate Clean",
    descriptionTr: "Kurumsal mavi, temiz ve güven veren.",
    colorScheme: "light",
    brand: { primary: "#075985", secondary: "#0c4a6e", accent: "#0891b2", tertiary: "#64748b" },
    surface: {
      background: "#f8fafc",
      surface: "#ffffff",
      surfaceMuted: "#eef2f6",
      surfaceElevated: "#ffffff",
      overlay: "rgb(15 23 42 / 0.5)",
    },
    text: { primary: "#0f2233", secondary: "#41556b", muted: "#8ba0b3", inverse: "#f8fafc", link: "#075985" },
    border: { default: "#dce4ec", subtle: "#eef2f6", strong: "#c3d0dd", focus: "#075985" },
    feedback: LIGHT_FEEDBACK,
    primaryContrast: "#ffffff",
  },
];

const PALETTE_BY_ID: ReadonlyMap<string, ColorPalette> = new Map(COLOR_PALETTES.map((p) => [p.id, p]));

/** Tüm palet id'leri (allowlist doğrulaması için). */
export const COLOR_PALETTE_IDS: readonly string[] = COLOR_PALETTES.map((p) => p.id);

export function getColorPalette(id: string): ColorPalette | undefined {
  return PALETTE_BY_ID.get(id);
}

export function isColorPaletteId(id: string): boolean {
  return PALETTE_BY_ID.has(id);
}

export function listColorPalettes(): ColorPalette[] {
  return [...COLOR_PALETTES];
}

/**
 * Bir paleti verilen belgeye uygular → YENİ belge döner (girdi mutate EDİLMEZ).
 * Yalnız primitive renk grupları + colorScheme + `action.primaryContrast` değişir;
 * tipografi/şekil/slot/asset/component katmanları KORUNUR. Renk tokenları semantic
 * `{ref}` üzerinden otomatik takip eder.
 */
export function applyPaletteToDocument(doc: ThemeDocument, paletteId: string): ThemeDocument {
  const palette = PALETTE_BY_ID.get(paletteId);
  if (!palette) return doc;
  const tokens = doc.tokens as DesignTokens;
  return {
    ...doc,
    meta: { ...doc.meta, colorScheme: palette.colorScheme },
    tokens: {
      ...tokens,
      brand: { ...palette.brand },
      surface: { ...palette.surface },
      text: { ...palette.text },
      border: { ...palette.border },
      feedback: { ...palette.feedback },
    },
    semantic: {
      ...doc.semantic,
      "action.primaryContrast": palette.primaryContrast,
    },
  };
}

/**
 * Bir paletin WCAG kritik kontrastını (uygulanmış belge üzerinden) denetler.
 * Publish gate ile aynı `checkContrast` kullanılır → palet publish-güvenliği
 * test edilebilir.
 */
export function paletteContrast(paletteId: string, base: ThemeDocument): ContrastResult {
  return checkContrast(applyPaletteToDocument(base, paletteId));
}
