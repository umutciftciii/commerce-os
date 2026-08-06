/**
 * TODO-170 (ADR-272) — Refund CAP hesabı (SAF; finansal invariant otoritesi).
 *
 * Invariant (order + currency): Σ SUCCEEDED + Σ active(PENDING/PROCESSING) ≤ capturedMinor.
 * "reserved" = SUCCEEDED + PENDING + PROCESSING (aktif rezervasyon + gerçekleşen). FAILED/CANCELLED
 * rezervasyonu serbest bırakır. capturedMinor = payment-state.sumCapturedMinor (PAID/AUTHORIZED attempt
 * toplamı). Currency birebir eşleşir (FX yok). Tümü minor-unit integer.
 */
import type { OrderRefundStatus } from "@prisma/client";

export interface RefundLedgerRow {
  status: OrderRefundStatus;
  totalRefundMinor: number;
  currency: string;
}

/** Rezerve (aktif + gerçekleşen) refund toplamı — cap invariant için. */
export function sumReservedRefundMinor(refunds: readonly RefundLedgerRow[], currency: string): number {
  return refunds
    .filter((r) => r.currency === currency && (r.status === "PENDING" || r.status === "PROCESSING" || r.status === "SUCCEEDED"))
    .reduce((s, r) => s + r.totalRefundMinor, 0);
}

/** Yalnız gerçekleşen (SUCCEEDED) refund toplamı — finans/projeksiyon otoritesi. */
export function sumSucceededRefundMinor(refunds: readonly RefundLedgerRow[], currency: string): number {
  return refunds
    .filter((r) => r.currency === currency && r.status === "SUCCEEDED")
    .reduce((s, r) => s + r.totalRefundMinor, 0);
}

/** Yalnız PENDING refund toplamı — pending/processing AYRI gösterim için (TD-FR-7). */
export function sumPendingRefundMinor(refunds: readonly RefundLedgerRow[], currency: string): number {
  return refunds
    .filter((r) => r.currency === currency && r.status === "PENDING")
    .reduce((s, r) => s + r.totalRefundMinor, 0);
}

/** Yalnız PROCESSING refund toplamı — pending/processing AYRI gösterim için (TD-FR-7). */
export function sumProcessingRefundMinor(refunds: readonly RefundLedgerRow[], currency: string): number {
  return refunds
    .filter((r) => r.currency === currency && r.status === "PROCESSING")
    .reduce((s, r) => s + r.totalRefundMinor, 0);
}

/** Aktif (henüz sonuçlanmamış: PENDING/PROCESSING) refund toplamı. sumPending + sumProcessing (TEK otorite). */
export function sumActiveRefundMinor(refunds: readonly RefundLedgerRow[], currency: string): number {
  return sumPendingRefundMinor(refunds, currency) + sumProcessingRefundMinor(refunds, currency);
}

/**
 * İade edilebilir kalan (minor): captured − reserved. Negatif olmaz. Yeni bir refund'un tutarı bunu aşamaz.
 */
export function computeRefundableRemainingMinor(
  capturedMinor: number,
  refunds: readonly RefundLedgerRow[],
  currency: string,
): number {
  return Math.max(0, capturedMinor - sumReservedRefundMinor(refunds, currency));
}

/** Talep edilen tutar iade edilebilir kalanı aşmıyor mu (ve pozitif mi)? */
export function isWithinRefundable(requestedMinor: number, remainingMinor: number): boolean {
  return requestedMinor > 0 && requestedMinor <= remainingMinor;
}
