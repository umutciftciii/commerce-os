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
import { zonedDayString, type ResolvedRange } from "../influencers/analytics-range.js";

/** KPI ile hizalı "ulaşıldı" durum kümesi (reachedRatio ile aynı; çelişki yok). */
const REACHED_STATUSES: RecoveryCaseStatus[] = [
  "CUSTOMER_REACHED",
  "ACTION_REQUIRED",
  "RESOLVED",
  "NO_ACTION_REQUIRED",
];

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

export interface OrderExperienceSummary {
  reviewId: string;
  rating: number;
  comment: string | null;
  reviewCreatedAt: string;
  recovery: {
    caseId: string;
    status: RecoveryCaseStatus;
    priority: string;
    assigneePlatformUserId: string | null;
    dueAt: string;
    overdue: boolean;
    resolvedAt: string | null;
    resolutionType: string | null;
  } | null;
  goodwillCreditMinor: string;
}

/**
 * TD-174B-1 — Store-admin sipariş detayı "Sipariş Deneyimi" kartı için tek-sipariş
 * özeti (storeId-scoped). Review yoksa null. Goodwill = bu case'e bağlı RECOVERY_GOODWILL
 * ledger entry'lerinin toplamı (case yoksa 0). Internal note TAŞINMAZ.
 */
export async function getOrderExperienceForOrder(
  storeId: string,
  orderId: string,
): Promise<OrderExperienceSummary | null> {
  const review = await prisma.orderExperienceReview.findFirst({
    where: { storeId, orderId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      recoveryCase: {
        select: {
          id: true,
          status: true,
          priority: true,
          assigneePlatformUserId: true,
          dueAt: true,
          resolvedAt: true,
          resolutionType: true,
        },
      },
    },
  });
  if (!review) return null;

  let goodwillCreditMinor = 0n;
  if (review.recoveryCase) {
    const goodwill = await prisma.customerCreditLedgerEntry.aggregate({
      where: { storeId, sourceType: "RECOVERY_GOODWILL", sourceId: review.recoveryCase.id, direction: "CREDIT" },
      _sum: { amountMinor: true },
    });
    goodwillCreditMinor = goodwill._sum.amountMinor ?? 0n;
  }

  const now = new Date();
  return {
    reviewId: review.id,
    rating: review.rating,
    comment: review.comment,
    reviewCreatedAt: review.createdAt.toISOString(),
    recovery: review.recoveryCase
      ? {
          caseId: review.recoveryCase.id,
          status: review.recoveryCase.status,
          priority: review.recoveryCase.priority,
          assigneePlatformUserId: review.recoveryCase.assigneePlatformUserId,
          dueAt: review.recoveryCase.dueAt.toISOString(),
          overdue:
            (ACTIVE_RECOVERY_STATUSES as string[]).includes(review.recoveryCase.status) &&
            review.recoveryCase.dueAt.getTime() < now.getTime(),
          resolvedAt: review.recoveryCase.resolvedAt?.toISOString() ?? null,
          resolutionType: review.recoveryCase.resolutionType,
        }
      : null,
    goodwillCreditMinor: goodwillCreditMinor.toString(),
  };
}

export interface RecoveryReport {
  range: { dateFrom: string; dateTo: string; timezone: string };
  totals: {
    totalReviews: number;
    lowRatingCount: number;
    highRatingCount: number;
    averageRating: number;
    openCases: number;
    resolvedCases: number;
    closedCases: number;
  };
  ratingTrend: { date: string; count: number; averageRating: number; lowCount: number }[];
  avgFirstContactMinutes: number | null;
  avgResolutionMinutes: number | null;
  contactSuccessRatio: number;
  outcomeDistribution: { outcome: string; count: number }[];
  goodwill: { totalMinor: string; caseCount: number };
}

/**
 * TD-174B-2 — Recovery raporu (storeId-scoped, bounded aralık). Reviews createdAt'e,
 * case metrikleri openedAt'e göre pencerelenir. Trend gün dizisi zero-fill (mağaza tz).
 * Süreler dakika (int, null=veri yok). Goodwill = aralık içi RECOVERY/ADMIN_GOODWILL ledger.
 */
export async function recoveryReport(storeId: string, range: ResolvedRange): Promise<RecoveryReport> {
  const inRange = { gte: range.fromUtc, lt: range.toUtcExclusive };
  const [reviews, cases, outcomeGroups, goodwillAgg, goodwillCount] = await Promise.all([
    prisma.orderExperienceReview.findMany({
      where: { storeId, createdAt: inRange },
      select: { rating: true, createdAt: true },
    }),
    prisma.orderRecoveryCase.findMany({
      where: { storeId, openedAt: inRange },
      select: { status: true, openedAt: true, firstContactAt: true, resolvedAt: true, closedAt: true },
    }),
    prisma.orderRecoveryActivity.groupBy({
      by: ["outcome"],
      where: { storeId, outcome: { not: null }, createdAt: inRange },
      _count: { _all: true },
    }),
    prisma.customerCreditLedgerEntry.aggregate({
      where: { storeId, type: { in: ["ADMIN_GOODWILL_CREDIT", "RECOVERY_GOODWILL_CREDIT"] }, createdAt: inRange },
      _sum: { amountMinor: true },
    }),
    prisma.customerCreditLedgerEntry.count({
      where: { storeId, type: { in: ["ADMIN_GOODWILL_CREDIT", "RECOVERY_GOODWILL_CREDIT"] }, createdAt: inRange },
    }),
  ]);

  // Rating trend — tz-yerel güne bucket + zero-fill.
  const byDay = new Map<string, { count: number; sum: number; low: number }>();
  for (const day of range.dayStrings) byDay.set(day, { count: 0, sum: 0, low: 0 });
  let ratingSum = 0;
  let lowCount = 0;
  let highCount = 0;
  for (const r of reviews) {
    ratingSum += r.rating;
    if (r.rating <= 2) lowCount += 1;
    if (r.rating >= 4) highCount += 1;
    const day = zonedDayString(r.createdAt.getTime(), range.timezone);
    const bucket = byDay.get(day);
    if (bucket) {
      bucket.count += 1;
      bucket.sum += r.rating;
      if (r.rating <= 2) bucket.low += 1;
    }
  }
  const ratingTrend = range.dayStrings.map((day) => {
    const b = byDay.get(day)!;
    return {
      date: day,
      count: b.count,
      averageRating: b.count > 0 ? Math.round((b.sum / b.count) * 100) / 100 : 0,
      lowCount: b.low,
    };
  });

  // Case zamanlama metrikleri.
  let firstContactSum = 0;
  let firstContactN = 0;
  let resolutionSum = 0;
  let resolutionN = 0;
  let reached = 0;
  let openCases = 0;
  let resolvedCases = 0;
  let closedCases = 0;
  for (const c of cases) {
    if (c.firstContactAt) {
      firstContactSum += c.firstContactAt.getTime() - c.openedAt.getTime();
      firstContactN += 1;
    }
    if (c.resolvedAt) {
      resolutionSum += c.resolvedAt.getTime() - c.openedAt.getTime();
      resolutionN += 1;
      resolvedCases += 1;
    }
    if (c.closedAt) closedCases += 1;
    if ((ACTIVE_RECOVERY_STATUSES as string[]).includes(c.status)) openCases += 1;
    if ((REACHED_STATUSES as string[]).includes(c.status)) reached += 1;
  }
  const toMinutes = (sum: number, n: number) => (n > 0 ? Math.round(sum / n / 60000) : null);
  const ratio = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 1000 : 0);

  return {
    range: { dateFrom: range.dayStrings[0] ?? "", dateTo: range.dayStrings[range.dayStrings.length - 1] ?? "", timezone: range.timezone },
    totals: {
      totalReviews: reviews.length,
      lowRatingCount: lowCount,
      highRatingCount: highCount,
      averageRating: reviews.length > 0 ? Math.round((ratingSum / reviews.length) * 100) / 100 : 0,
      openCases,
      resolvedCases,
      closedCases,
    },
    ratingTrend,
    avgFirstContactMinutes: toMinutes(firstContactSum, firstContactN),
    avgResolutionMinutes: toMinutes(resolutionSum, resolutionN),
    contactSuccessRatio: ratio(reached, cases.length),
    outcomeDistribution: outcomeGroups
      .map((g) => ({ outcome: (g.outcome ?? "OTHER") as string, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    goodwill: { totalMinor: (goodwillAgg._sum.amountMinor ?? 0n).toString(), caseCount: goodwillCount },
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
