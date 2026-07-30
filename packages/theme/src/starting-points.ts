import {
  BASE_LAYOUT_PRESET_KEY,
  getLayoutPreset,
  resolveLayoutPresetSlots,
  type LayoutPresetKey,
} from "./layout-presets.js";
import { BASE_THEME_KEY } from "./theme-registry.js";
import { DEFAULT_THEME_DOCUMENT, getPreset } from "./presets.js";
import type { ThemeDocument } from "./schema.js";
import type { ThemeBuilderConfig } from "./builder-config.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Theme Starting Points (TODO-164A · ADR-225)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Yeni tema oluştururken bir başlangıç noktası seçilir. Bu, preset'i KOPYALAYIP
 * mağazaya-scoped bir draft config + document snapshot üretir — registry preset'i
 * MUTATE ETMEZ (derin kopya döner). themeKey daima BASE_COMMERCE (builder teması
 * = ortak engine + özel config → daima uyumlu); `layoutPreset` başlangıç noktasını
 * kaydeder (slot defaultları + palet kaynağı).
 */

export const THEME_STARTING_POINTS = [
  "BASE_COMMERCE",
  "FASHION_MINIMAL",
  "FASHION_EDITORIAL",
  "PREMIUM_BOUTIQUE",
  "EMPTY",
] as const;

export type ThemeStartingPoint = (typeof THEME_STARTING_POINTS)[number];

export function isThemeStartingPoint(value: unknown): value is ThemeStartingPoint {
  return typeof value === "string" && (THEME_STARTING_POINTS as readonly string[]).includes(value);
}

export interface StartingPointMeta {
  key: ThemeStartingPoint;
  nameTr: string;
  nameEn: string;
  descriptionTr: string;
  /** Palet kaynağı (token preset id) — EMPTY/BASE için null (default palet). */
  tokenPreset: string | null;
  layoutPreset: LayoutPresetKey;
}

export const STARTING_POINT_META: readonly StartingPointMeta[] = [
  {
    key: "BASE_COMMERCE",
    nameTr: "Temel Ticaret",
    nameEn: "Base Commerce",
    descriptionTr: "Dengeli, evrensel varsayılan. Bugünkü görünüm.",
    tokenPreset: null,
    layoutPreset: "BASE_COMMERCE",
  },
  {
    key: "FASHION_MINIMAL",
    nameTr: "Moda — Sade",
    nameEn: "Fashion Minimal",
    descriptionTr: "Ferah, tipografi-öncelikli; kompakt kart, editoryal hero.",
    tokenPreset: "minimal",
    layoutPreset: "FASHION_MINIMAL",
  },
  {
    key: "FASHION_EDITORIAL",
    nameTr: "Moda — Editoryal",
    nameEn: "Fashion Editorial",
    descriptionTr: "Cesur, dergi hissi; premium kart, split hero.",
    tokenPreset: "fashion",
    layoutPreset: "FASHION_EDITORIAL",
  },
  {
    key: "PREMIUM_BOUTIQUE",
    nameTr: "Premium Butik",
    nameEn: "Premium Boutique",
    descriptionTr: "Lüks, sakin; premium kart, galeri-öncelikli PDP.",
    tokenPreset: "luxury",
    layoutPreset: "PREMIUM_BOUTIQUE",
  },
  {
    key: "EMPTY",
    nameTr: "Boş Güvenli Şablon",
    nameEn: "Empty Safe Template",
    descriptionTr: "Temel palet + varsayılan düzen; sıfırdan özelleştir.",
    tokenPreset: null,
    layoutPreset: "BASE_COMMERCE",
  },
];

const META_BY_KEY = new Map(STARTING_POINT_META.map((m) => [m.key, m]));

export function listStartingPoints(): readonly StartingPointMeta[] {
  return STARTING_POINT_META;
}

export interface StartingPointSnapshot {
  config: ThemeBuilderConfig;
  document: ThemeDocument;
}

/** Derin kopya (JSON) — registry belgesini paylaşmamak için. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Bir başlangıç noktasını YENİ bir draft snapshot'ına çözer (config + document).
 * Bilinmeyen key → BASE_COMMERCE. Registry preset'i DEĞİŞTİRMEZ (klon döner).
 */
export function resolveStartingPoint(key: string): StartingPointSnapshot {
  const meta = META_BY_KEY.get(key as ThemeStartingPoint) ?? META_BY_KEY.get("BASE_COMMERCE")!;
  const preset = meta.tokenPreset ? getPreset(meta.tokenPreset) : undefined;
  const document = clone(preset?.document ?? DEFAULT_THEME_DOCUMENT);
  const layoutPreset = getLayoutPreset(meta.layoutPreset) ? meta.layoutPreset : BASE_LAYOUT_PRESET_KEY;
  // EMPTY → boş slot (sıfırdan); diğerleri → preset slot düzeni.
  const slots =
    meta.key === "EMPTY" ? {} : resolveLayoutPresetSlots(layoutPreset);
  const config = {
    themeKey: BASE_THEME_KEY,
    layoutPreset,
    slots,
    colorScheme: document.meta.colorScheme,
  } as ThemeBuilderConfig;
  return { config, document };
}
