import { format, getDictionary, type Locale } from "@commerce-os/i18n";
import { UiError, type UiErrorDetails } from "./api";

/**
 * Bir API hata kodunu kullanici dostu mesaja cevirir. Aktif locale verilirse o
 * dilde, verilmezse varsayilan dilde (Turkce) dondurur. Bilinmeyen kodlar
 * guvenli sekilde genel UNKNOWN mesajina duser; ham kod UI'da gosterilmez.
 *
 * `details` verilirse yapilandirilmis mesaj uretilebilir: ADR-065 MEDIA_IN_USE'da
 * `usedIn` tablolari lokalize kullanim yerlerine cevrilip mesaja gomulur.
 */
export function messageForCode(code: string, locale?: Locale, details?: UiErrorDetails): string {
  const dict = getDictionary(locale).storeAdmin;
  const errors = dict.errors as Record<string, string>;

  if (code === "MEDIA_IN_USE" && details?.usedIn && details.usedIn.length > 0) {
    const labels = dict.media.usedInLabels as Record<string, string>;
    const places = details.usedIn.map((key) => labels[key] ?? key).join(", ");
    return format(dict.media.inUseWithList, { places });
  }

  // TD-FR-7 Faz 1 / Task 5 — "İadeyi yap" (inspect-decision) inceleme kararını kaydettikten
  // sonra refund orkestrasyonu başarısız olursa gateway REFUND_INITIATE_FAILED döner; ALTINDAKİ
  // gerçek refund hata kodu (ör. EXCEEDS_REFUNDABLE) `details.refundErrorCode`'da taşınır. Bilinen
  // bir kodsa okunabilir sebeple birleştirilir; değilse genel mesaja düşülür.
  if (code === "REFUND_INITIATE_FAILED") {
    const reasonCode = details?.refundErrorCode;
    const reason = reasonCode ? errors[reasonCode] : undefined;
    if (reason) {
      return format(errors.REFUND_INITIATE_FAILED_WITH_REASON, { reason });
    }
    return errors.REFUND_INITIATE_FAILED;
  }

  return errors[code] ?? errors.UNKNOWN;
}

/** Yakalanan bir hatadan gosterilebilir (lokalize) mesaj uretir. */
export function messageForError(error: unknown, locale?: Locale): string {
  if (error instanceof UiError) {
    return messageForCode(error.code, locale, error.details);
  }
  return messageForCode("UNKNOWN", locale);
}
