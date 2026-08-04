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
const INSPECTION_STATUSES: ReturnStatus[] = ["RECEIVED", "INSPECTION_REQUIRED"];
const FINANCIAL_ACTION_STATUSES: ReturnStatus[] = ["REFUND_PENDING", "REPLACEMENT_PENDING"];

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
  const actionableStatuses = returnRows
    .map((r) => r.status)
    .filter((s) => !RETURN_SETTLED_STATUSES.includes(s));
  return {
    reviews: bucketFor(reviewRows, ["PENDING"]),
    returns: {
      actionable: bucketFor(returnRows, actionableStatuses),
      newRequests: bucketFor(returnRows, NEW_REQUEST_STATUSES),
      inspection: bucketFor(returnRows, INSPECTION_STATUSES),
      financialAction: bucketFor(returnRows, FINANCIAL_ACTION_STATUSES),
    },
  };
}
