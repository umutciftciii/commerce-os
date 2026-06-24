import { getDictionary, type Locale } from "@commerce-os/i18n";
import { UiError } from "./api";

/**
 * Bir API hata kodunu kullanici dostu mesaja cevirir. Aktif locale verilirse o
 * dilde, verilmezse varsayilan dilde (Turkce) dondurur. Bilinmeyen kodlar
 * guvenli sekilde genel UNKNOWN mesajina duser; ham kod UI'da gosterilmez.
 */
export function messageForCode(code: string, locale?: Locale): string {
  const errors = getDictionary(locale).storeAdmin.errors as Record<string, string>;
  return errors[code] ?? errors.UNKNOWN;
}

/** Yakalanan bir hatadan gosterilebilir (lokalize) mesaj uretir. */
export function messageForError(error: unknown, locale?: Locale): string {
  if (error instanceof UiError) {
    return messageForCode(error.code, locale);
  }
  return messageForCode("UNKNOWN", locale);
}
