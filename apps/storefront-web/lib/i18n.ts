import { getDictionary } from "@commerce-os/i18n";

/**
 * Bu app icin aktif vitrin sozlugu. Varsayilan locale Turkce'dir; runtime locale
 * switcher / URL locale stratejisi sonraki bir fazda eklenecek (docs/TODO.md).
 * Cok kiracili mağaza locale tercihi de o asamada degerlendirilecek.
 */
export function getStorefrontDict() {
  return getDictionary().storefront;
}
