import { getDictionary } from "@commerce-os/i18n";
import { UiError } from "./api";

/**
 * Bir API hata kodunu kullanici dostu (Turkce, varsayilan locale) mesaja cevirir.
 * Bilinmeyen kodlar guvenli sekilde genel UNKNOWN mesajina duser; ham kod UI'da
 * gosterilmez.
 */
export function messageForCode(code: string): string {
  const errors = getDictionary().storeAdmin.errors as Record<string, string>;
  return errors[code] ?? errors.UNKNOWN;
}

/** Yakalanan bir hatadan gosterilebilir Turkce mesaj uretir. */
export function messageForError(error: unknown): string {
  if (error instanceof UiError) {
    return messageForCode(error.code);
  }
  return messageForCode("UNKNOWN");
}
