/**
 * TODO-174B (ADR-283) — Order Experience Recovery read model (admin liste + KPI + case detay).
 *
 * Liste OrderExperienceReview üzerinden (recovery case OPSİYONEL — 3-5★ review'ler case'siz görünür).
 * storeId-first scoped. ProductReview/aggregate'e SIFIR dokunuş. Internal note yalnız case DETAYINDA
 * (admin); listede/KPI'da taşınmaz.
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type { RecoveryCaseStatus } from "@prisma/client";
import { ACTIVE_RECOVERY_STATUSES } from "./recovery-service.js";

export interface ExperienceListFilters {
  dateFrom?: Date;
  dateTo?: Date;
  ratingBucket?: "ONE_TWO" | "THREE" | "FOUR_FIVE";
  orderStatus?: string;
  cancelReasonCode?: string;
  recoveryStatus?: RecoveryCaseStatus;
  assigneePlatformUserId?: string;
  overdueOnly?: boolean;
}

export interface ExperienceListRow {
  reviewId: string;
  rating: number;
  comment: string | null;
  customerId: string;
  customerName: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  cancelReasonCode: string | null;
  reviewCreatedAt: string;
  recovery: {
    caseId: string;
    status: RecoveryCaseStatus;
    priority: string;
    assigneePlatformUserId: string | null;
    dueAt: string;
    overdue: boolean;
  } | null;
}

function ratingBucketWhere(bucket?: string): Prisma.OrderExperienceReviewWhereInput {
  if (bucket === "ONE_TWO") return { rating: { lte: 2 } };
  if (bucket === "THREE") return { rating: 3 };
  if (bucket === "FOUR_FIVE") return { rating: { gte: 4 } };
  return {};
}

export async function listExperienceReviews(
  storeId: string,
  filters: ExperienceListFilters,
  page: { skip: number; take: number },
): Promise<{ rows: ExperienceListRow[]; total: number }> {
  const now = new Date();
  const where: Prisma.OrderExperienceReviewWhereInput = {
    storeId,
    ...ratingBucketWhere(filters.ratingBucket),
    ...(filters.dateFrom || filters.dateTo
      ? { createdAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
      : {}),
    ...(filters.orderStatus ? { order: { is: { status: filters.orderStatus as never } } } : {}),
    ...(filters.cancelReasonCode ? { order: { is: { cancelReasonCode: filters.cancelReasonCode as never } } } : {}),
    ...(filters.recoveryStatus ? { recoveryCase: { is: { status: filters.recoveryStatus } } } : {}),
    ...(filters.assigneePlatformUserId ? { recoveryCase: { is: { assigneePlatformUserId: filters.assigneePlatformUserId } } } : {}),
    ...(filters.overdueOnly
      ? { recoveryCase: { is: { status: { in: ACTIVE_RECOVERY_STATUSES }, dueAt: { lt: now } } } }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.orderExperienceReview.count({ where }),
    prisma.orderExperienceReview.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.take,
      select: {
        id: true,
        rating: true,
        comment: true,
        customerId: true,
        createdAt: true,
        customer: { select: { firstName: true, lastName: true, email: true } },
        order: { select: { id: true, orderNumber: true, status: true, cancelReasonCode: true } },
        recoveryCase: {
          select: { id: true, status: true, priority: true, assigneePlatformUserId: true, dueAt: true },
        },
      },
    }),
  ]);

  return {
    total,
    rows: rows.map((r) => ({
      reviewId: r.id,
      rating: r.rating,
      comment: r.comment,
      customerId: r.customerId,
      customerName:
        [r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ").trim() || r.customer.email || "",
      orderId: r.order.id,
      orderNumber: r.order.orderNumber,
      orderStatus: r.order.status,
      cancelReasonCode: r.order.cancelReasonCode,
      reviewCreatedAt: r.createdAt.toISOString(),
      recovery: r.recoveryCase
        ? {
            caseId: r.recoveryCase.id,
            status: r.recoveryCase.status,
            priority: r.recoveryCase.priority,
            assigneePlatformUserId: r.recoveryCase.assigneePlatformUserId,
            dueAt: r.recoveryCase.dueAt.toISOString(),
            overdue:
              (ACTIVE_RECOVERY_STATUSES as string[]).includes(r.recoveryCase.status) &&
              r.recoveryCase.dueAt.getTime() < now.getTime(),
          }
        : null,
    })),
  };
}

export interface ExperienceKpi {
  averageRating: number;
  totalReviews: number;
  lowRatingRatio: number; // 1-2★
  highRatingRatio: number; // 4-5★
  openRecoveryCount: number;
  slaOverdueCount: number;
  reachedRatio: number;
  resolutionRatio: number;
  totalGoodwillCreditMinor: string;
}

export async function experienceKpi(
  storeId: string,
  filters: { dateFrom?: Date; dateTo?: Date },
): Promise<ExperienceKpi> {
  const now = new Date();
  const reviewWhere: Prisma.OrderExperienceReviewWhereInput = {
    storeId,
    ...(filters.dateFrom || filters.dateTo
      ? { createdAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
      : {}),
  };
  const [agg, total, low, high, caseTotal, reached, resolved, openCount, overdueCount, goodwill] = await Promise.all([
    prisma.orderExperienceReview.aggregate({ where: reviewWhere, _avg: { rating: true } }),
    prisma.orderExperienceReview.count({ where: reviewWhere }),
    prisma.orderExperienceReview.count({ where: { ...reviewWhere, rating: { lte: 2 } } }),
    prisma.orderExperienceReview.count({ where: { ...reviewWhere, rating: { gte: 4 } } }),
    prisma.orderRecoveryCase.count({ where: { storeId } }),
    prisma.orderRecoveryCase.count({ where: { storeId, status: { in: ["CUSTOMER_REACHED", "ACTION_REQUIRED", "RESOLVED", "NO_ACTION_REQUIRED"] } } }),
    prisma.orderRecoveryCase.count({ where: { storeId, resolvedAt: { not: null } } }),
    prisma.orderRecoveryCase.count({ where: { storeId, status: { in: ACTIVE_RECOVERY_STATUSES } } }),
    prisma.orderRecoveryCase.count({ where: { storeId, status: { in: ACTIVE_RECOVERY_STATUSES }, dueAt: { lt: now } } }),
    prisma.customerCreditLedgerEntry.aggregate({
      where: { storeId, type: { in: ["ADMIN_GOODWILL_CREDIT", "RECOVERY_GOODWILL_CREDIT"] } },
      _sum: { amountMinor: true },
    }),
  ]);
  const ratio = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 1000 : 0);
  return {
    averageRating: agg._avg.rating ? Math.round(agg._avg.rating * 100) / 100 : 0,
    totalReviews: total,
    lowRatingRatio: ratio(low, total),
    highRatingRatio: ratio(high, total),
    openRecoveryCount: openCount,
    slaOverdueCount: overdueCount,
    reachedRatio: ratio(reached, caseTotal),
    resolutionRatio: ratio(resolved, caseTotal),
    totalGoodwillCreditMinor: (goodwill._sum.amountMinor ?? 0n).toString(),
  };
}

export interface RecoveryCaseDetail {
  caseId: string;
  status: RecoveryCaseStatus;
  priority: string;
  version: number;
  assigneePlatformUserId: string | null;
  openedAt: string;
  firstContactAt: string | null;
  dueAt: string;
  overdue: boolean;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionType: string | null;
  resolutionNote: string | null;
  review: { id: string; rating: number; comment: string | null; createdAt: string };
  order: { id: string; orderNumber: string; status: string; cancelReasonCode: string | null };
  customer: { id: string; name: string; email: string };
  activities: {
    id: string;
    type: string;
    actorId: string | null;
    outcome: string | null;
    note: string | null;
    creditLedgerEntryId: string | null;
    createdAt: string;
  }[];
}

export async function getRecoveryCaseDetail(storeId: string, caseId: string): Promise<RecoveryCaseDetail | null> {
  const kase = await prisma.orderRecoveryCase.findFirst({
    where: { id: caseId, storeId },
    select: {
      id: true, status: true, priority: true, version: true, assigneePlatformUserId: true,
      openedAt: true, firstContactAt: true, dueAt: true, resolvedAt: true, closedAt: true,
      resolutionType: true, resolutionNote: true,
      review: { select: { id: true, rating: true, comment: true, createdAt: true } },
      order: { select: { id: true, orderNumber: true, status: true, cancelReasonCode: true } },
      customer: { select: { id: true, firstName: true, lastName: true, email: true } },
      activities: {
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, actorId: true, outcome: true, note: true, creditLedgerEntryId: true, createdAt: true },
      },
    },
  });
  if (!kase) return null;
  const now = new Date();
  return {
    caseId: kase.id,
    status: kase.status,
    priority: kase.priority,
    version: kase.version,
    assigneePlatformUserId: kase.assigneePlatformUserId,
    openedAt: kase.openedAt.toISOString(),
    firstContactAt: kase.firstContactAt?.toISOString() ?? null,
    dueAt: kase.dueAt.toISOString(),
    overdue: (ACTIVE_RECOVERY_STATUSES as string[]).includes(kase.status) && kase.dueAt.getTime() < now.getTime(),
    resolvedAt: kase.resolvedAt?.toISOString() ?? null,
    closedAt: kase.closedAt?.toISOString() ?? null,
    resolutionType: kase.resolutionType,
    resolutionNote: kase.resolutionNote,
    review: { id: kase.review.id, rating: kase.review.rating, comment: kase.review.comment, createdAt: kase.review.createdAt.toISOString() },
    order: { id: kase.order.id, orderNumber: kase.order.orderNumber, status: kase.order.status, cancelReasonCode: kase.order.cancelReasonCode },
    customer: {
      id: kase.customer.id,
      name: [kase.customer.firstName, kase.customer.lastName].filter(Boolean).join(" ").trim() || kase.customer.email || "",
      email: kase.customer.email ?? "",
    },
    activities: kase.activities.map((a) => ({
      id: a.id,
      type: a.type,
      actorId: a.actorId,
      outcome: a.outcome,
      note: a.note,
      creditLedgerEntryId: a.creditLedgerEntryId,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

/** Manuel case açma (3★). Review'ı doğrular (storeId + rating===3 + case yok). */
export async function resolveReviewForManualCase(
  storeId: string,
  reviewId: string,
): Promise<{ ok: true; customerId: string; orderId: string; rating: number } | { ok: false; code: "REVIEW_NOT_FOUND" | "NOT_THREE_STAR" | "CASE_EXISTS" }> {
  const review = await prisma.orderExperienceReview.findFirst({
    where: { id: reviewId, storeId },
    select: { customerId: true, orderId: true, rating: true, recoveryCase: { select: { id: true } } },
  });
  if (!review) return { ok: false, code: "REVIEW_NOT_FOUND" };
  if (review.recoveryCase) return { ok: false, code: "CASE_EXISTS" };
  if (review.rating !== 3) return { ok: false, code: "NOT_THREE_STAR" };
  return { ok: true, customerId: review.customerId, orderId: review.orderId, rating: review.rating };
}
