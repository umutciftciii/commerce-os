import { cookies } from "next/headers";
import {
  getDictionary,
  localeCookieName,
  resolveLocaleFromCookieValue,
  type Locale,
} from "@commerce-os/i18n";

/**
 * Sunucu tarafi locale cozumlemesi. Aktif vitrin dili `commerce_os_locale`
 * cookie'sinden okunur; gecersiz/bos deger guvenli sekilde varsayilana (Turkce)
 * duser. Vitrin sayfalari sunucu bilesenleridir; locale her istekte cookie'den
 * cozulur. Cok kiracili mağaza locale tercihi sonraki bir fazda degerlendirilecek.
 */
export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return resolveLocaleFromCookieValue(cookieStore.get(localeCookieName)?.value);
}

/** Aktif locale icin vitrin sozlugu (sunucu). */
export async function getStorefrontDict() {
  return getDictionary(await getRequestLocale()).storefront;
}
