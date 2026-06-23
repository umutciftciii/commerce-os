import { getDictionary } from "@commerce-os/i18n";

/**
 * Bu app icin aktif sozluk. Varsayilan locale Turkce'dir; runtime locale
 * switcher / URL locale stratejisi sonraki bir fazda eklenecek (docs/TODO.md).
 * Locale cozumleme tek noktada burada toplanir.
 */
export function getStoreAdminDict() {
  return getDictionary().storeAdmin;
}

/** Paylasilan ortak metinler icin kisayol. */
export function getCommonDict() {
  return getDictionary().common;
}
