/**
 * TODO-170-recovery — Bekleyen İş Özeti SAF birleştirici (DB'siz, birim-testlenebilir).
 *
 * Store-scoped groupBy satırlarından (durum → adet + en eski ankor) tek özet üretir. Sidebar
 * sayaçları + Dashboard "Bekleyen İşler" kartı aynı çıktıyı kullanır (React'te ayrı hesap YOK).
 * Kategoriler ADR-269 iade yaşam döngüsüyle hizalı; ham enum ASLA kullanıcıya sızmaz (çağıran
 * taraf i18n etiketine çevirir).
 */
import type { ReturnStatus, ProductReviewStatus } from "@prisma/client";

export interface StatusCountRow<S extends string> {
  status: S;
  count: number;
  /** O durumdaki en eski bekleyen kaydın ankoru (bekleme süresi türetimi); yoksa null. */
  oldest: Date | null;
}

export interface PendingBucket {
  count: number;
  oldestAt: string | null;
}

export interface PendingWorkSummaryResult {
  reviews: PendingBucket;
  returns: {
    actionable: PendingBucket;
    newRequests: PendingBucket;
    inspection: PendingBucket;
    financialAction: PendingBucket;
  };
}

/** Havuza adet geri veren + arşiv/tamamlanmış — artık "ilerlemeyen" (settled) iade durumları. */
export const RETURN_SETTLED_STATUSES: ReturnStatus[] = [
  "COMPLETED",
  "REJECTED",
  "CANCELLED_BY_CUSTOMER",
  "EXPIRED",
  "CLOSED",
];

const NEW_REQUEST_STATUSES: ReturnStatus[] = ["REQUESTED", "UNDER_REVIEW"];
// P1/P2 — INSPECTED de admin-actionable (inceleme sonrası refund/replacement/reject kararı bekler);
// eski gruplama onu KAYIP bırakıyordu. Inspection bucket'ına dahil edilir.
const INSPECTION_STATUSES: ReturnStatus[] = ["RECEIVED", "INSPECTION_REQUIRED", "INSPECTED"];
const FINANCIAL_ACTION_STATUSES: ReturnStatus[] = ["REFUND_PENDING", "REPLACEMENT_PENDING"];

/**
 * P1/P2 — Admin'in GERÇEKTEN aksiyon alabileceği durumların AÇIK allowlist'i (= üç dashboard
 * bucket'ının birleşimi). "actionable = settled olmayan HER durum" YANLIŞTI: APPROVED /
 * PARTIALLY_APPROVED / AWAITING_SHIPMENT / RETURN_SHIPPED müşteriyi/kargoyu bekler, admin'i DEĞİL —
 * bunlar sayılmaz. Invariant: actionable.count === newRequests + inspection + financialAction
 * (üç bucket ayrık; sidebar sayacı == dashboard admin-actionable toplamı).
 */
export const RETURN_ADMIN_ACTIONABLE_STATUSES: ReturnStatus[] = [
  ...NEW_REQUEST_STATUSES,
  ...INSPECTION_STATUSES,
  ...FINANCIAL_ACTION_STATUSES,
];

function bucketFor<S extends string>(rows: StatusCountRow<S>[], statuses: S[]): PendingBucket {
  let count = 0;
  let oldest: Date | null = null;
  const set = new Set<string>(statuses);
  for (const row of rows) {
    if (!set.has(row.status)) continue;
    count += row.count;
    if (row.oldest && (oldest === null || row.oldest.getTime() < oldest.getTime())) {
      oldest = row.oldest;
    }
  }
  return { count, oldestAt: oldest ? oldest.toISOString() : null };
}

export function buildPendingWorkSummary(
  reviewRows: StatusCountRow<ProductReviewStatus>[],
  returnRows: StatusCountRow<ReturnStatus>[],
): PendingWorkSummaryResult {
  return {
    reviews: bucketFor(reviewRows, ["PENDING"]),
    returns: {
      // P1/P2 — açık admin-actionable allowlist (müşteri/kargo-bekleyen + terminal HARİÇ).
      actionable: bucketFor(returnRows, RETURN_ADMIN_ACTIONABLE_STATUSES),
      newRequests: bucketFor(returnRows, NEW_REQUEST_STATUSES),
      inspection: bucketFor(returnRows, INSPECTION_STATUSES),
      financialAction: bucketFor(returnRows, FINANCIAL_ACTION_STATUSES),
    },
  };
}
