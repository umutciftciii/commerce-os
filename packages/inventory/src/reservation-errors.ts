/**
 * H-3 (ADR-190) — Rezervasyon domain hata kodları + TR/EN mesajları. Tek doğruluk kaynağı; API
 * yanıtları, worker raporu ve testler buradan tüketir. Mesajlar PII taşımaz.
 */
export const RESERVATION_ERROR_CODES = [
  "RESERVATION_EXPIRED",
  "RESERVATION_ALREADY_CONSUMED",
  "RESERVATION_ALREADY_RELEASED",
  "INSUFFICIENT_AVAILABLE_STOCK",
  "RESERVATION_CONFLICT",
  "LATE_PAYMENT_AFTER_EXPIRY",
  "ORPHAN_DRAFT_DETECTED",
] as const;

export type ReservationErrorCode = (typeof RESERVATION_ERROR_CODES)[number];

export const RESERVATION_ERROR_MESSAGES: Record<ReservationErrorCode, { tr: string; en: string }> = {
  RESERVATION_EXPIRED: {
    tr: "Rezervasyonun süresi doldu.",
    en: "The reservation has expired.",
  },
  RESERVATION_ALREADY_CONSUMED: {
    tr: "Rezervasyon zaten satışa işlendi.",
    en: "The reservation has already been consumed.",
  },
  RESERVATION_ALREADY_RELEASED: {
    tr: "Rezervasyon zaten serbest bırakıldı.",
    en: "The reservation has already been released.",
  },
  INSUFFICIENT_AVAILABLE_STOCK: {
    tr: "Yeterli kullanılabilir stok yok.",
    en: "Insufficient available stock.",
  },
  RESERVATION_CONFLICT: {
    tr: "Rezervasyon çakışması; lütfen tekrar deneyin.",
    en: "Reservation conflict; please try again.",
  },
  LATE_PAYMENT_AFTER_EXPIRY: {
    tr: "Ödeme, rezervasyon süresi dolduktan sonra tamamlandı; stok elle incelenmeli.",
    en: "Payment settled after the reservation expired; stock requires manual review.",
  },
  ORPHAN_DRAFT_DETECTED: {
    tr: "Terk edilmiş taslak sipariş tespit edildi.",
    en: "An abandoned draft order was detected.",
  },
};

export function reservationErrorMessage(code: ReservationErrorCode, locale: "tr" | "en" = "en"): string {
  return RESERVATION_ERROR_MESSAGES[code][locale];
}
