/**
 * commerce-os frontend i18n altyapisi.
 *
 * Basit, tipli sozluk sistemi. Varsayilan urun dili Turkce'dir. Tum gorunur UI
 * metni bu sozlukten okunur; bilesenlerde hardcoded gorunur metin yazilmaz.
 *
 * Runtime dil secimi (F2E): kullanici arayuz dilini TR/EN arasinda degistirebilir.
 * Secim `commerce_os_locale` cookie'sinde tutulur ve server-side sozluk secimini
 * belirler (bkz. resolveLocaleFromCookieValue, localeCookieName). URL prefix
 * (/tr, /en), tarayici dil tespiti ve DB/kullanici locale tercihi bilincli olarak
 * kapsam disidir (bkz. docs/TODO.md, docs/DECISIONS.md).
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

/** Runtime locale cookie adi. Auth token degildir; httpOnly olmasi gerekmez. */
export const localeCookieName = "commerce_os_locale";

/** Locale cookie omru: ~1 yil (saniye). Tercih kalici hissettirilir. */
export const localeCookieMaxAge = 60 * 60 * 24 * 365;

/**
 * Cookie degerinden (ya da herhangi bir ham girdiden) desteklenen bir locale
 * cozer. Bos, gecersiz veya desteklenmeyen deger guvenli sekilde varsayilana
 * (Turkce) duser. Hem server (cookie okuma) hem client tarafinda kullanilir.
 */
export function resolveLocaleFromCookieValue(value?: string | null): Locale {
  return isSupportedLocale(value) ? value : defaultLocale;
}

/**
 * Client tarafinda `document.cookie`'ye yazilabilir bir locale cookie dizesi
 * uretir. sameSite=lax, path=/, uzun omur. HTTPS uzerinde Secure eklenir
 * (mevcut prod cookie davranisiyla uyumlu). httpOnly DEGILDIR; bu bir tercih
 * sinyalidir, gizli bir token degildir.
 */
export function localeCookieString(locale: Locale): string {
  // DOM tipine bagimli olmamak icin globalThis uzerinden okunur (i18n paketi
  // DOM lib'i icermez; helper hem server hem client'ta cagrilabilir).
  const loc = (globalThis as { location?: { protocol?: string } }).location;
  const secure = loc?.protocol === "https:" ? "; Secure" : "";
  return `${localeCookieName}=${locale}; Path=/; Max-Age=${localeCookieMaxAge}; SameSite=Lax${secure}`;
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

/** Locale → Intl tarih/saat bicimlendirme icin BCP-47 etiketi. */
const dateTimeLocaleTag: Record<Locale, string> = {
  tr: "tr-TR",
  en: "en-GB",
};

/**
 * Locale-duyarli tarih+saat bicimi (24 saat, saniyesiz). Turkce icin
 * `04.07.2026 18:00`; Ingilizce icin `04/07/2026, 18:00` (AM/PM YOK). Gecersiz
 * veya bos deger guvenli sekilde "—" doner. Musteri vitrin ve yonetim arayuzu
 * ORTAK kullanir; Intl ayarlari her bilesende kopyalanmaz (tek kaynak).
 *
 * Zaman dilimi bilincli olarak ayarlanmaz: mevcut davranis gibi calisma
 * ortaminin yerel saat dilimi kullanilir (bu duzeltme yalniz BICIM sorununu
 * cozer, gosterilen saati kaydirmaz).
 */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  locale: Locale = defaultLocale,
): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(dateTimeLocaleTag[locale] ?? dateTimeLocaleTag[defaultLocale], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
