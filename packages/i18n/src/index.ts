/**
 * commerce-os frontend i18n altyapisi.
 *
 * Basit, tipli sozluk sistemi. Varsayilan urun dili Turkce'dir. Tum gorunur UI
 * metni bu sozlukten okunur; bilesenlerde hardcoded gorunur metin yazilmaz.
 *
 * Kapsam disi (bilincli): runtime locale switcher, /tr veya /en route prefix,
 * tarayici dil tespiti, DB locale alani, Next middleware. Bunlar ileride ayri
 * islerde ele alinacak (bkz. docs/TODO.md).
 */
import { trCommon } from "./locales/tr/common";
import { trAdmin } from "./locales/tr/admin";
import { trStoreAdmin } from "./locales/tr/storeAdmin";
import { trStorefront } from "./locales/tr/storefront";
import { enCommon } from "./locales/en/common";
import { enAdmin } from "./locales/en/admin";
import { enStoreAdmin } from "./locales/en/storeAdmin";
import { enStorefront } from "./locales/en/storefront";

export type { CommonDictionary } from "./locales/tr/common";
export type { AdminDictionary } from "./locales/tr/admin";
export type { StoreAdminDictionary } from "./locales/tr/storeAdmin";
export type { StorefrontDictionary } from "./locales/tr/storefront";

/** Varsayilan urun dili: Turkce. */
export const defaultLocale = "tr" as const;

/** Desteklenen diller. Ilk eleman varsayilandir. */
export const supportedLocales = ["tr", "en"] as const;

export type Locale = (typeof supportedLocales)[number];

const dictionaries = {
  tr: {
    common: trCommon,
    admin: trAdmin,
    storeAdmin: trStoreAdmin,
    storefront: trStorefront,
  },
  en: {
    common: enCommon,
    admin: enAdmin,
    storeAdmin: enStoreAdmin,
    storefront: enStorefront,
  },
} as const;

/** Bir locale'in tam sozluk sekli (TR kaynak sekli). */
export type Dictionary = (typeof dictionaries)[typeof defaultLocale];

/** Verilen deger desteklenen bir locale mi? (tip daraltma ile.) */
export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (supportedLocales as readonly string[]).includes(value);
}

/**
 * Locale icin sozlugu dondurur. Desteklenmeyen/eksik locale guvenli sekilde
 * varsayilan dile (Turkce) duser.
 */
export function getDictionary(locale?: string | null): Dictionary {
  if (isSupportedLocale(locale)) {
    return dictionaries[locale];
  }
  return dictionaries[defaultLocale];
}

/** Varsayilan dil (Turkce) sozlugu. */
export function getDefaultDictionary(): Dictionary {
  return dictionaries[defaultLocale];
}

/** Test ve denetim amacli: ham sozluk haritasi. */
export const allDictionaries = dictionaries;

/**
 * Basit {placeholder} doldurucu. Ornek: format("{count} ürün", { count: 4 }).
 * i18n framework'u yerine kucuk bir yardimci; yeni bagimlilik gerektirmez.
 */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
