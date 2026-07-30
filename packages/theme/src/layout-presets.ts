import { z } from "zod";
import {
  normalizeSlotSelections,
  type ThemeSlotKey,
} from "./slots.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Layout Presets (TODO-164 · ADR-219)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bir layout preset, her slot için bir VARIANT seçer + bir varsayılan TOKEN preseti
 * (bkz. presets.ts) bağlar. Böylece "preset seçilince hem token paleti hem slot
 * düzeni belirlenir". Storefront slot resolver bu haritayı okur (variant → component
 * davranışı); tokenlar mevcut CSS motorundan gelir.
 *
 * Bu fazda her preset için tamamen farklı tasarım üretilmez; CONTRACT + en az iki
 * gerçek çalışan varyant yeterli (ProductCard/Header/Hero gerçek uygulanır).
 *
 * BASE_COMMERCE tüm slotları defaultVariant'ta bırakır → BUGÜNKÜ görünüm (geriye
 * uyumlu). Diğer presetler yalnız FARKLI olan slotları belirtir; kalan slotlar
 * `normalizeSlotSelections` ile defaultVariant'a düşer.
 */

export const LAYOUT_PRESET_KEYS = [
  "BASE_COMMERCE",
  "FASHION_MINIMAL",
  "FASHION_EDITORIAL",
  "MARKETPLACE_DENSE",
  "PREMIUM_BOUTIQUE",
] as const;

export type LayoutPresetKey = (typeof LAYOUT_PRESET_KEYS)[number];

export const layoutPresetKeySchema = z.enum(LAYOUT_PRESET_KEYS);

export interface LayoutPreset {
  key: LayoutPresetKey;
  nameTr: string;
  nameEn: string;
  descriptionTr: string;
  /** Slot → seçili variant (kısmi; belirtilmeyen slot defaultVariant'a düşer). */
  slots: Partial<Record<ThemeSlotKey, string>>;
  /** Bu preset'ten tema oluşturulurken kullanılacak varsayılan token preset id'si (presets.ts). */
  tokenPreset: string | null;
}

export const LAYOUT_PRESETS: readonly LayoutPreset[] = [
  {
    key: "BASE_COMMERCE",
    nameTr: "Temel Ticaret",
    nameEn: "Base Commerce",
    descriptionTr: "Dengeli, evrensel varsayılan düzen. Bugünkü görünüm.",
    slots: {},
    tokenPreset: null,
  },
  {
    key: "FASHION_MINIMAL",
    nameTr: "Moda — Sade",
    nameEn: "Fashion Minimal",
    descriptionTr: "Ferah, tipografi-öncelikli; sıkı başlık, kompakt kart, editoryal hero.",
    slots: {
      header: "minimal",
      footer: "minimal",
      productCard: "compact",
      hero: "editorial",
      productListingLayout: "dense",
    },
    tokenPreset: "minimal",
  },
  {
    key: "FASHION_EDITORIAL",
    nameTr: "Moda — Editoryal",
    nameEn: "Fashion Editorial",
    descriptionTr: "Cesur, dergi hissi; yüzen başlık, premium kart, split hero, editoryal PDP.",
    slots: {
      header: "floating",
      hero: "split",
      productCard: "premium",
      productDetailLayout: "editorial",
      homeSectionFrame: "boxed",
    },
    tokenPreset: "fashion",
  },
  {
    key: "MARKETPLACE_DENSE",
    nameTr: "Pazaryeri — Yoğun",
    nameEn: "Marketplace Dense",
    descriptionTr: "Bilgi-yoğun; kompakt kart, yoğun liste, kutulu bölümler.",
    slots: {
      header: "solid",
      productCard: "compact",
      productListingLayout: "dense",
      homeSectionFrame: "boxed",
      mobileNavigation: "fullscreen",
    },
    tokenPreset: "electronics",
  },
  {
    key: "PREMIUM_BOUTIQUE",
    nameTr: "Premium Butik",
    nameEn: "Premium Boutique",
    descriptionTr: "Lüks, sakin; sade başlık, premium kart, split hero, galeri-sol PDP.",
    slots: {
      header: "minimal",
      productCard: "premium",
      hero: "split",
      productDetailLayout: "gallery-left",
    },
    tokenPreset: "luxury",
  },
];

const PRESET_BY_KEY: ReadonlyMap<LayoutPresetKey, LayoutPreset> = new Map(
  LAYOUT_PRESETS.map((p) => [p.key, p]),
);

export const BASE_LAYOUT_PRESET_KEY: LayoutPresetKey = "BASE_COMMERCE";

export function isLayoutPresetKey(value: unknown): value is LayoutPresetKey {
  return typeof value === "string" && PRESET_BY_KEY.has(value as LayoutPresetKey);
}

export function getLayoutPreset(key: string): LayoutPreset | undefined {
  return isLayoutPresetKey(key) ? PRESET_BY_KEY.get(key) : undefined;
}

/**
 * Bir layout preset'in TAM slot seçimini döndürür (belirtilmeyen slotlar
 * defaultVariant). Bilinmeyen preset → BASE_COMMERCE (tüm defaultlar).
 */
export function resolveLayoutPresetSlots(key: string): Record<ThemeSlotKey, string> {
  const preset = getLayoutPreset(key) ?? PRESET_BY_KEY.get(BASE_LAYOUT_PRESET_KEY)!;
  return normalizeSlotSelections(preset.slots);
}

export function listLayoutPresetKeys(): LayoutPresetKey[] {
  return LAYOUT_PRESETS.map((p) => p.key);
}
