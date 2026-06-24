import { cookies } from "next/headers";
import {
  getDictionary,
  localeCookieName,
  resolveLocaleFromCookieValue,
  type Locale,
} from "@commerce-os/i18n";

/**
 * Sunucu tarafi locale cozumlemesi (server components / layout / metadata).
 *
 * Aktif arayuz dili `commerce_os_locale` cookie'sinden okunur; gecersiz/bos deger
 * guvenli sekilde varsayilan dile (Turkce) duser. Istemci bilesenleri locale'i
 * `LocaleProvider` baglamindan (`useLocale`) alir; bu modul YALNIZCA sunucuda
 * (next/headers) kullanilir.
 */
export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return resolveLocaleFromCookieValue(cookieStore.get(localeCookieName)?.value);
}

/** store-admin namespace'i icin kisayol (sunucu). */
export async function getStoreAdminDict() {
  return getDictionary(await getRequestLocale()).storeAdmin;
}

/** Paylasilan ortak metinler icin kisayol (sunucu). */
export async function getCommonDict() {
  return getDictionary(await getRequestLocale()).common;
}
