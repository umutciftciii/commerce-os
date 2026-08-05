/**
 * TODO-170 (ADR-272) — ORTAK refund durum çözümü (SAF; tek server-side otorite). Store-Admin ve müşteri
 * yüzeyleri AYNI semantiği kullanır (UI'da lokal tahmin YOK). Otorite sırası: (1) OrderRefund ledger,
 * (2) RefundIntent lifecycle, (3) ReturnRequest status. Tamamlanmış refund sonrası ASLA "beklemede" göstermez.
 */
import type { OrderRefundStatus, RefundIntentStatus } from "@prisma/client";

export type RefundSummaryStatus =
  | "INTENT_PENDING" // niyet var, henüz refund başlatılmadı → "İade Niyeti · Beklemede"
  | "PROCESSING" // OrderRefund PENDING/PROCESSING → "Para İadesi · İşleniyor"
  | "SUCCEEDED" // SUCCEEDED + order tam iade → "Para İadesi · Tamamlandı"
  | "PARTIALLY_SUCCEEDED" // SUCCEEDED ama order kısmi iade → "Kısmi Para İadesi · Tamamlandı"
  | "FAILED" // son deneme FAILED, aktif/başarılı yok → "Para İadesi · Başarısız"
  | "CANCELLED"; // niyet iptal (refund'suz terminal) → "İade Niyeti · İptal Edildi"

export interface RefundSummaryStatusInput {
  /** BU iade talebinin OrderRefund satırları (yalnız status yeterli). */
  refunds: ReadonlyArray<{ status: OrderRefundStatus }>;
  /** İlişkili RefundIntent lifecycle (yoksa null). */
  intentStatus: RefundIntentStatus | null;
  /** SİPARİŞ düzeyi tahsil edilmiş toplam (partial vs full ayrımı için). */
  orderCapturedMinor: number;
  /** SİPARİŞ düzeyi Σ SUCCEEDED refund (tüm talepler; partial vs full ayrımı için). */
  orderSucceededRefundMinor: number;
}

export function resolveRefundSummaryStatus(input: RefundSummaryStatusInput): RefundSummaryStatus {
  const hasSucceeded = input.refunds.some((r) => r.status === "SUCCEEDED");
  const hasActive = input.refunds.some((r) => r.status === "PENDING" || r.status === "PROCESSING");
  // (1) Ledger otoritesi: gerçekleşen refund varsa her şeyi ezer.
  if (hasSucceeded) {
    const orderFullyRefunded =
      input.orderCapturedMinor > 0 && input.orderSucceededRefundMinor >= input.orderCapturedMinor;
    return orderFullyRefunded ? "SUCCEEDED" : "PARTIALLY_SUCCEEDED";
  }
  if (hasActive) return "PROCESSING";
  // (2) Intent lifecycle: refund'suz iptal.
  if (input.intentStatus === "CANCELLED") return "CANCELLED";
  if (input.refunds.some((r) => r.status === "FAILED")) return "FAILED";
  // (3) Varsayılan: niyet var, henüz refund yok.
  return "INTENT_PENDING";
}

/** Tamamlanmış/işlenen bir refund var mı (UI'ın "beklemede/tahsil edilmedi" metnini gizlemesi için). */
export function isRefundInMotionOrDone(status: RefundSummaryStatus): boolean {
  return status === "PROCESSING" || status === "SUCCEEDED" || status === "PARTIALLY_SUCCEEDED";
}
