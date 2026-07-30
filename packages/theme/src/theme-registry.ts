import {
  BASE_LAYOUT_PRESET_KEY,
  LAYOUT_PRESETS,
  type LayoutPresetKey,
} from "./layout-presets.js";
import { listThemeSlotKeys, type ThemeSlotKey } from "./slots.js";
import { BUNDLED_CUSTOM_PACKAGES } from "./custom-package.js";
import { THEME_SCHEMA_VERSION } from "./schema.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Theme Registry — theme-KEY otoritesi (TODO-164 · ADR-217)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hangi TEMALARIN var olduğu (base + layout presets + custom packages) TEK
 * otorite olarak burada tanımlıdır. `Theme.themeKey` serbest string DEĞİL — bu
 * registry'ye karşı doğrulanır (bilinmeyen key REDDEDİLİR / fail-closed).
 *
 * NOT: Bu, H-1 token `registry.ts`'inden FARKLIDIR — o token-tip otoritesidir; bu
 * ise theme-key otoritesidir. İki registry ayrı sorumluluklar taşır.
 *
 * Her kayıt: key, ad (TR/EN), kind, version, themeApiVersion, minimumCommerceVersion,
 * slots (desteklenen/gerekli slotlar), tokenSchemaVersion, layoutPreset, status,
 * fallbackThemeKey. Uyumluluk (compatibility.ts) bu alanları kullanır.
 */

/** Storefront engine'in DESTEKLEDİĞİ theme API sürümü. Kırıcı slot/contract değişimi bunu artırır. */
export const THEME_API_VERSION = 1 as const;

/** commerce-os ürün sürümü (product-split baseline v1.0.0). minimumCommerceVersion karşılaştırması için. */
export const CURRENT_COMMERCE_VERSION = "1.0.0" as const;

export type ThemeKind = "BASE" | "LAYOUT_PRESET" | "CUSTOM_PACKAGE";
export type ThemeLifecycle = "ACTIVE" | "DEPRECATED" | "DISABLED";

export interface ThemeRegistryEntry {
  key: string;
  nameTr: string;
  nameEn: string;
  kind: ThemeKind;
  version: number;
  themeApiVersion: number;
  minimumCommerceVersion: string;
  /** Bu temanın desteklediği/gerektirdiği slotlar. */
  slots: readonly ThemeSlotKey[];
  /** Hedeflediği token belge şeması sürümü (@commerce-os/theme). */
  tokenSchemaVersion: number;
  /** Bağlı layout preset (BASE ve her LAYOUT_PRESET için key ile aynı; custom paket manifest'ten). */
  layoutPreset: LayoutPresetKey;
  status: ThemeLifecycle;
  /** Uyumsuz/bozuk olursa düşülecek güvenli tema. Zincir daima BASE_COMMERCE'e iner. */
  fallbackThemeKey: string;
}

/** Base tema key'i. Nihai fallback ve backfill varsayılanı. */
export const BASE_THEME_KEY = "BASE_COMMERCE";

const ALL_SLOTS = listThemeSlotKeys();

function baseEntry(): ThemeRegistryEntry {
  return {
    key: BASE_THEME_KEY,
    nameTr: "Temel Ticaret",
    nameEn: "Base Commerce",
    kind: "BASE",
    version: 1,
    themeApiVersion: THEME_API_VERSION,
    minimumCommerceVersion: "1.0.0",
    slots: ALL_SLOTS,
    tokenSchemaVersion: THEME_SCHEMA_VERSION,
    layoutPreset: BASE_LAYOUT_PRESET_KEY,
    status: "ACTIVE",
    // Base kendi fallback'idir (döngü resolver'da kırılır).
    fallbackThemeKey: BASE_THEME_KEY,
  };
}

/** Layout preset (BASE hariç) → registry kaydı. */
function layoutPresetEntries(): ThemeRegistryEntry[] {
  return LAYOUT_PRESETS.filter((p) => p.key !== BASE_LAYOUT_PRESET_KEY).map((p) => ({
    key: p.key,
    nameTr: p.nameTr,
    nameEn: p.nameEn,
    kind: "LAYOUT_PRESET" as const,
    version: 1,
    themeApiVersion: THEME_API_VERSION,
    minimumCommerceVersion: "1.0.0",
    slots: ALL_SLOTS,
    tokenSchemaVersion: THEME_SCHEMA_VERSION,
    layoutPreset: p.key,
    status: "ACTIVE" as const,
    fallbackThemeKey: BASE_THEME_KEY,
  }));
}

/** Paketlenmiş custom package'lar → registry kaydı. */
function customPackageEntries(): ThemeRegistryEntry[] {
  return BUNDLED_CUSTOM_PACKAGES.map((m) => ({
    key: m.packageKey,
    nameTr: m.nameTr,
    nameEn: m.nameEn,
    kind: "CUSTOM_PACKAGE" as const,
    version: m.version,
    themeApiVersion: m.themeApiVersion,
    minimumCommerceVersion: m.minimumCommerceVersion,
    slots: m.supportedSlots,
    tokenSchemaVersion: m.tokenSchemaVersion,
    layoutPreset: m.layoutPreset,
    status: m.status,
    fallbackThemeKey: BASE_THEME_KEY,
  }));
}

export const THEME_REGISTRY: readonly ThemeRegistryEntry[] = [
  baseEntry(),
  ...layoutPresetEntries(),
  ...customPackageEntries(),
];

const REGISTRY_BY_KEY: ReadonlyMap<string, ThemeRegistryEntry> = new Map(
  THEME_REGISTRY.map((e) => [e.key, e]),
);

export function isKnownThemeKey(value: unknown): value is string {
  return typeof value === "string" && REGISTRY_BY_KEY.has(value);
}

export function getThemeEntry(key: string): ThemeRegistryEntry | undefined {
  return REGISTRY_BY_KEY.get(key);
}

export function listThemeKeys(): string[] {
  return THEME_REGISTRY.map((e) => e.key);
}

/** Kind'a göre kayıtlar (Platform Admin theme atama listesi için). */
export function listThemeEntriesByKind(kind: ThemeKind): ThemeRegistryEntry[] {
  return THEME_REGISTRY.filter((e) => e.kind === kind);
}
