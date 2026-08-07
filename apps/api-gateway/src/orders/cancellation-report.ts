/**
 * TODO-174 (ADR-275) — İptal raporu aggregate'i. Store Admin YALNIZ görüntüler (taksonomi CRUD YOK).
 *
 * Kaynak doğrusu Order SNAPSHOT'ları + iptal provenance alanları (cancelSource/cancelReasonCode/Category).
 * İptal evreni: status=CANCELLED + cancelledAt ∈ [range] (+ filtreler). Oran paydası: aralıkta yerleştirilmiş
 * (COALESCE(placedAt,createdAt)) DRAFT-dışı siparişler. Refund edilen ciro: intent'siz/return'süz SUCCEEDED
 * OrderRefund toplamı. tz-aware trend (store timezone). storeId-first scoped; cross-store veri sızmaz.
 */
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { CancellationReportResponse } from "@commerce-os/contracts";
import type { ResolvedRange } from "../influencers/analytics-range.js";
import { zonedDayString } from "../influencers/analytics-range.js";

type Db = Prisma.TransactionClient | PrismaClient;

export interface CancellationReportFilters {
  currency?: string;
  reasonCategory?: string;
  reasonCode?: string;
  productId?: string;
  categoryId?: string;
  paymentMethod?: string;
  shippingProvider?: string;
}

type ReportData = CancellationReportResponse["data"];

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10; // 1 ondalık
}

export async function buildCancellationReport(
  db: Db,
  storeId: string,
  range: ResolvedRange,
  filters: CancellationReportFilters,
): Promise<ReportData> {
  const cancelledWhere: Prisma.OrderWhereInput = {
    storeId,
    status: "CANCELLED",
    cancelledAt: { gte: range.fromUtc, lt: range.toUtcExclusive },
    ...(filters.reasonCategory ? { cancelReasonCategory: filters.reasonCategory as never } : {}),
    ...(filters.reasonCode ? { cancelReasonCode: filters.reasonCode as never } : {}),
    ...(filters.shippingProvider ? { shippingProvider: filters.shippingProvider as never } : {}),
    ...(filters.productId ? { lines: { some: { productId: filters.productId } } } : {}),
    ...(filters.categoryId
      ? { lines: { some: { product: { primaryCategoryId: filters.categoryId } } } }
      : {}),
    ...(filters.paymentMethod
      ? { paymentAttempts: { some: { method: filters.paymentMethod as never, status: { in: ["PAID", "AUTHORIZED"] } } } }
      : {}),
  };

  const orders = await db.order.findMany({
    where: cancelledWhere,
    select: {
      id: true,
      currency: true,
      totalAmount: true,
      cancelledAt: true,
      cancelSource: true,
      cancelReasonCode: true,
      cancelReasonCategory: true,
      shippingProvider: true,
      shippingProviderName: true,
      lines: { select: { productId: true, title: true, quantity: true } },
      paymentAttempts: { select: { method: true, status: true } },
    },
  });

  // Currency seçimi: istenen ya da en çok iptal cirosu olan.
  const currencyTotals = new Map<string, number>();
  for (const o of orders) currencyTotals.set(o.currency, (currencyTotals.get(o.currency) ?? 0) + o.totalAmount);
  const currency =
    filters.currency ??
    [...currencyTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "TRY";
  const scoped = orders.filter((o) => o.currency === currency);

  // Payda: aralıkta yerleştirilmiş DRAFT-dışı siparişler (aynı currency).
  const ordersInRangeCount = await db.order.count({
    where: {
      storeId,
      currency,
      status: { not: "DRAFT" },
      OR: [
        { placedAt: { gte: range.fromUtc, lt: range.toUtcExclusive } },
        { placedAt: null, createdAt: { gte: range.fromUtc, lt: range.toUtcExclusive } },
      ],
    },
  });

  // Refund edilen ciro (intent'siz/return'süz SUCCEEDED iptal refund'ları).
  const refundAgg = await db.orderRefund.aggregate({
    where: {
      storeId,
      currency,
      status: "SUCCEEDED",
      returnRequestId: null,
      refundIntentId: null,
      order: { status: "CANCELLED", cancelledAt: { gte: range.fromUtc, lt: range.toUtcExclusive } },
    },
    _sum: { totalRefundMinor: true },
  });

  const cancellationCount = scoped.length;
  const cancelledRevenueMinor = scoped.reduce((s, o) => s + o.totalAmount, 0);

  // Reason kategori dağılımı.
  const catMap = new Map<string | null, { count: number; revenue: number }>();
  const codeMap = new Map<string, { code: string | null; category: string | null; count: number; revenue: number }>();
  const payMap = new Map<string, { count: number; revenue: number }>();
  const shipMap = new Map<string, { label: string; count: number; revenue: number }>();
  const srcMap = new Map<string | null, number>();
  const trendMap = new Map<string, { count: number; revenue: number }>();
  const productMap = new Map<string, { title: string; count: number; quantity: number }>();
  let deliveryRelatedCount = 0;

  for (const o of scoped) {
    const cat = o.cancelReasonCategory as string | null;
    const catE = catMap.get(cat) ?? { count: 0, revenue: 0 };
    catE.count += 1;
    catE.revenue += o.totalAmount;
    catMap.set(cat, catE);
    if (cat === "DELIVERY") deliveryRelatedCount += 1;

    const codeKey = `${o.cancelReasonCode ?? "∅"}`;
    const codeE = codeMap.get(codeKey) ?? {
      code: (o.cancelReasonCode as string | null) ?? null,
      category: cat,
      count: 0,
      revenue: 0,
    };
    codeE.count += 1;
    codeE.revenue += o.totalAmount;
    codeMap.set(codeKey, codeE);

    const paid = o.paymentAttempts.find((a) => a.status === "PAID" || a.status === "AUTHORIZED");
    const payKey = paid ? paid.method : "UNPAID";
    const payE = payMap.get(payKey) ?? { count: 0, revenue: 0 };
    payE.count += 1;
    payE.revenue += o.totalAmount;
    payMap.set(payKey, payE);

    const shipKey = (o.shippingProvider as string | null) ?? "NONE";
    const shipE = shipMap.get(shipKey) ?? { label: o.shippingProviderName ?? shipKey, count: 0, revenue: 0 };
    shipE.count += 1;
    shipE.revenue += o.totalAmount;
    shipMap.set(shipKey, shipE);

    srcMap.set(o.cancelSource as string | null, (srcMap.get(o.cancelSource as string | null) ?? 0) + 1);

    const day = o.cancelledAt ? zonedDayString(o.cancelledAt.getTime(), range.timezone) : null;
    if (day) {
      const t = trendMap.get(day) ?? { count: 0, revenue: 0 };
      t.count += 1;
      t.revenue += o.totalAmount;
      trendMap.set(day, t);
    }

    const seenProducts = new Set<string>();
    for (const line of o.lines) {
      const p = productMap.get(line.productId) ?? { title: line.title, count: 0, quantity: 0 };
      p.quantity += line.quantity;
      if (!seenProducts.has(line.productId)) {
        p.count += 1;
        seenProducts.add(line.productId);
      }
      productMap.set(line.productId, p);
    }
  }

  const reasonCategoryDistribution = [...catMap.entries()]
    .map(([category, v]) => ({
      category: category as ReportData["reasonCategoryDistribution"][number]["category"],
      count: v.count,
      revenueMinor: v.revenue,
      sharePct: pct(v.count, cancellationCount),
    }))
    .sort((a, b) => b.count - a.count);

  const reasonDistribution = [...codeMap.values()]
    .map((v) => ({
      code: v.code as ReportData["reasonDistribution"][number]["code"],
      category: v.category as ReportData["reasonDistribution"][number]["category"],
      count: v.count,
      revenueMinor: v.revenue,
    }))
    .sort((a, b) => b.count - a.count);

  const trend = range.dayStrings.map((date) => ({
    date,
    count: trendMap.get(date)?.count ?? 0,
    revenueMinor: trendMap.get(date)?.revenue ?? 0,
  }));

  const paymentMethodBreakdown = [...payMap.entries()]
    .map(([key, v]) => ({ key, label: key, count: v.count, revenueMinor: v.revenue }))
    .sort((a, b) => b.count - a.count);

  const shippingMethodBreakdown = [...shipMap.entries()]
    .map(([key, v]) => ({ key, label: v.label, count: v.count, revenueMinor: v.revenue }))
    .sort((a, b) => b.count - a.count);

  const sourceBreakdown = [...srcMap.entries()]
    .map(([source, count]) => ({
      source: source as ReportData["sourceBreakdown"][number]["source"],
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const topProducts = [...productMap.entries()]
    .map(([productId, v]) => ({ productId, title: v.title, count: v.count, quantity: v.quantity }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    range: {
      from: range.dayStrings[0] ?? "",
      to: range.dayStrings[range.dayStrings.length - 1] ?? "",
      timezone: range.timezone,
      days: range.dayStrings.length,
    },
    currency,
    totals: {
      cancellationCount,
      cancelledRevenueMinor,
      refundedRevenueMinor: refundAgg._sum.totalRefundMinor ?? 0,
      ordersInRangeCount,
      cancellationRatePct: pct(cancellationCount, ordersInRangeCount),
      deliveryRelatedCount,
      deliveryRelatedRatePct: pct(deliveryRelatedCount, cancellationCount),
    },
    reasonCategoryDistribution,
    reasonDistribution,
    trend,
    paymentMethodBreakdown,
    shippingMethodBreakdown,
    sourceBreakdown,
    topProducts,
  };
}
