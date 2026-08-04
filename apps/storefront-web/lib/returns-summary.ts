import type { ReturnOrderSummary, ReturnStatusValue } from "@commerce-os/api-client";

/**
 * TODO-169 (blocker #1/#5/#7) — Sipariş kartı/detayı iade özeti SAF sunum yardımcıları.
 *
 * Tüm türetme SERVER'dan gelen `returnSummary` projeksiyonuna dayanır (React ayrı hesap YAPMAZ; metin
 * i18n'den gelir). Buradaki fonksiyonlar yalnız "hangi etiket + hangi sayı" kararını verir (deterministik,
 * yan etkisiz → birim test edilebilir). Teslimat rozetini DEĞİŞTİRMEZ; iade durumunu AYRI taşır.
 */

/** İade penceresi etiketi (sipariş kartı/detayı). null → gösterme (teslim edilmemiş). */
export type ReturnWindowLabel =
  | { kind: "eligible"; endsAt: string }
  | { kind: "endingSoon"; remainingDays: number }
  | { kind: "expired" }
  | null;

/** "Son iade tarihi yaklaşıyor" eşiği (gün). */
export const RETURN_WINDOW_ENDING_SOON_DAYS = 3;

export function resolveReturnWindowLabel(
  summary: ReturnOrderSummary | null | undefined,
): ReturnWindowLabel {
  if (!summary) return null;
  if (summary.windowState === "NOT_DELIVERED" || summary.returnWindowEndsAt === null) return null;
  if (summary.windowState === "EXPIRED") return { kind: "expired" };
  // ELIGIBLE
  if (summary.remainingDays !== null && summary.remainingDays <= RETURN_WINDOW_ENDING_SOON_DAYS) {
    return { kind: "endingSoon", remainingDays: Math.max(0, summary.remainingDays) };
  }
  return { kind: "eligible", endsAt: summary.returnWindowEndsAt };
}

/** İade aktivite rozeti: en son iade durumu + o aşamaya ait ürün adedi. null → iade yok. */
export type ReturnActivityLabel = {
  status: ReturnStatusValue;
  count: number;
} | null;

/** En son iade durumu "kapalı/tamamlanmış" mı (iade edilen adet baz alınır). */
const COMPLETED_LIKE: ReturnStatusValue[] = ["COMPLETED", "CLOSED"];

export function resolveReturnActivityLabel(
  summary: ReturnOrderSummary | null | undefined,
): ReturnActivityLabel {
  if (!summary || summary.latestStatus === null || summary.requestCount === 0) return null;
  const status = summary.latestStatus;
  const count = COMPLETED_LIKE.includes(status)
    ? summary.returnedItemQuantity || summary.pendingItemQuantity || summary.activeRequestCount || 1
    : summary.pendingItemQuantity || summary.returnedItemQuantity || summary.activeRequestCount || 1;
  return { status, count };
}

/** Sipariş kartında pending finansal etki var mı (beklenen iade tutarı henüz gerçekleşmedi). */
export function hasPendingReturnRefund(summary: ReturnOrderSummary | null | undefined): boolean {
  return Boolean(summary?.hasPendingFinancialImpact);
}
