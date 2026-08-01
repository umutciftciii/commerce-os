// TODO-165A (ADR-165A) Task 24 — "Ürün Sözlükleri" ekranına özgü hata kodu çevirisi.
//
// Governed Product Taxonomy uçlarının kendine özgü kodları (TAXONOMY_DUPLICATE/TAXONOMY_IN_USE/
// TAXONOMY_REORDER_INCOMPLETE) paylaşılan `@commerce-os/i18n` sözlüğüne EKLENMEDİ (bu ekran
// `size-charts/page.tsx` emsaliyle aynı şekilde düz Türkçe metin kullanır, paylaşılan pakete
// dokunmaz). Bilinmeyen kodlar `messageForError`e (genel `UNKNOWN` mesajı) düşer.

import type { Locale } from "@commerce-os/i18n";
import { UiError } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

const CODE_MESSAGES: Record<string, string> = {
  TAXONOMY_DUPLICATE: "Bu isim (veya kısa ad) bu sözlükte zaten kullanılıyor.",
  TAXONOMY_IN_USE: "Bu değer ürün/varyantlarda kullanımda, silinemez. Önce ürünlerden kaldırın.",
  TAXONOMY_REORDER_INCOMPLETE:
    "Sıralama isteği eksik/tutarsız geldi. Sayfayı yenileyip tekrar deneyin.",
  TAXONOMY_ARCHIVED: "Bu değer arşivde; önce geri yükleyin.",
  TAXONOMY_NOT_FOUND: "Bu değer artık mevcut değil. Liste yenileniyor.",
  TAXONOMY_CROSS_STORE: "Bu değere erişim yetkiniz yok.",
};

/** Governed taxonomy hatasını (yakalanmış `unknown`) kullanıcı-dostu Türkçe mesaja çevirir. */
export function taxonomyErrorMessage(error: unknown, locale?: Locale): string {
  if (error instanceof UiError && CODE_MESSAGES[error.code]) {
    return CODE_MESSAGES[error.code];
  }
  return messageForError(error, locale);
}
