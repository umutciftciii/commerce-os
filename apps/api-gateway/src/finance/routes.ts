/**
 * Financial Reporting Foundation (ADR-268) — Fastify rota katmanı (Finans > Raporlar).
 *
 * BFF yalnız store/session doğrular; finansal hesap SUNUCU-tarafıdır. Her uç
 * `requireStoreAdmin` (platform-admin + store 404 izolasyonu; §13) ile korunur ve
 * store-scoped'tır. Tarih aralığı bounded/tz-aware (date-range.ts); metrik türetimi
 * SAF (metrics.ts); CSV server-side + injection-korumalı + BOM'lu (csv.ts).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  financeBreakdownsResponseSchema,
  financeDiscountReportResponseSchema,
  financePaymentReportResponseSchema,
  financeReportQuerySchema,
  financeSummaryResponseSchema,
} from "@commerce-os/contracts";
import type { ResolvedRange } from "../influencers/analytics-range.js";
import { resolveFinanceRange, type FinancePeriodPreset } from "./date-range.js";
import {
  computeDelta,
  listCurrencies,
  primaryCurrency,
  summarizeDailyRows,
  type FinanceDailyRow,
} from "./metrics.js";
import { buildCsv } from "./csv.js";
import type { FinanceDataAccess, FinanceFilters } from "./data.js";

export interface FinanceRoutesDeps {
  data: FinanceDataAccess;
  /** Platform-admin + store izolasyonu; null → 401/403/404 zaten gönderildi. */
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  getStoreTimezone: (storeId: string) => Promise<string>;
  /** Test enjeksiyonu; default Date.now. */
  now?: () => number;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

function rangeMeta(range: ResolvedRange) {
  return {
    from: range.dayStrings[0] ?? "",
    to: range.dayStrings[range.dayStrings.length - 1] ?? "",
    timezone: range.timezone,
    days: range.dayStrings.length,
  };
}

function toFilters(query: ReturnType<typeof financeReportQuerySchema.parse>): FinanceFilters {
  return {
    currency: query.currency,
    status: query.status,
    paymentStatus: query.paymentStatus,
    productId: query.productId,
    variantId: query.variantId,
    categoryId: query.categoryId,
    brandId: query.brandId,
    campaignId: query.campaignId,
    paymentMethod: query.paymentMethod,
  };
}

/** İstenen/örtük currency'yi çözer; veri yoksa filters.currency ?? "TRY". */
function chooseCurrency(rows: FinanceDailyRow[], requested?: string): string {
  if (requested) return requested;
  return primaryCurrency(rows) ?? "TRY";
}

/** Günlük seriyi seçili currency için, aralık günleriyle zero-fill'leyerek üretir. */
function buildDailySeries(range: ResolvedRange, rows: FinanceDailyRow[], currency: string) {
  const byDate = new Map<string, FinanceDailyRow>();
  for (const row of rows) {
    if (row.currency === currency) byDate.set(row.date, row);
  }
  return range.dayStrings.map((date) => {
    const r = byDate.get(date);
    const gross = r?.grossSalesMinor ?? 0;
    const discount = r?.discountsMinor ?? 0;
    const shipping = r?.shippingRevenueMinor ?? 0;
    const net = gross - discount;
    return {
      date,
      grossSalesMinor: gross,
      discountsMinor: discount,
      netProductSalesMinor: net,
      shippingRevenueMinor: shipping,
      totalRevenueMinor: net + shipping,
      taxMinor: r?.taxMinor ?? 0,
      orderCount: r?.orderCount ?? 0,
      paidOrderCount: r?.paidOrderCount ?? 0,
      unitsSold: r?.unitsSold ?? 0,
      cancelledOrderCount: r?.cancelledOrderCount ?? 0,
      refundedOrderCount: r?.refundedOrderCount ?? 0,
    };
  });
}

export function registerFinanceRoutes(app: FastifyInstance, deps: FinanceRoutesDeps): void {
  const { data, requireStoreAdmin, getStoreTimezone } = deps;
  const nowMs = () => (deps.now ? deps.now() : Date.now());

  function parseQuery(request: FastifyRequest, reply: FastifyReply) {
    const parsed = financeReportQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      void reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
      return null;
    }
    return parsed.data;
  }

  async function resolveRangeFor(storeId: string, query: ReturnType<typeof financeReportQuerySchema.parse>) {
    const timezone = await getStoreTimezone(storeId);
    const preset: FinancePeriodPreset = query.period ?? (query.dateFrom || query.dateTo ? "custom" : "last30");
    return resolveFinanceRange({
      preset,
      timezone,
      nowMs: nowMs(),
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  // ── Özet + günlük seri + karşılaştırma ─────────────────────────────────────
  app.get("/stores/:storeId/finance/summary", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const query = parseQuery(request, reply);
    if (!query) return;

    const range = await resolveRangeFor(storeId, query);
    const filters = toFilters(query);
    // Günlük fetch currency-FİLTRESİZ: availableCurrencies TÜM para birimlerini listeler
    // (seçim yapılınca dropdown çökmesin). Seçili currency `summarizeDailyRows`/seri ile izole edilir.
    const dailyFilters: FinanceFilters = { ...filters, currency: undefined };
    const [currentRows, previousRows] = await Promise.all([
      data.getDailyRows(storeId, { fromUtc: range.current.fromUtc, toUtcExclusive: range.current.toUtcExclusive, timezone: range.timezone }, dailyFilters),
      data.getDailyRows(storeId, { fromUtc: range.previous.fromUtc, toUtcExclusive: range.previous.toUtcExclusive, timezone: range.timezone }, dailyFilters),
    ]);

    const currency = chooseCurrency(currentRows, filters.currency);
    const summary = summarizeDailyRows(currency, currentRows);
    const prev = summarizeDailyRows(currency, previousRows);

    return reply.send(
      financeSummaryResponseSchema.parse({
        data: {
          range: rangeMeta(range.current),
          currency,
          availableCurrencies: listCurrencies(currentRows),
          refundAmountsSupported: false,
          summary,
          comparison: {
            totalRevenue: computeDelta(summary.totalRevenueMinor, prev.totalRevenueMinor),
            netProductSales: computeDelta(summary.netProductSalesMinor, prev.netProductSalesMinor),
            grossSales: computeDelta(summary.grossSalesMinor, prev.grossSalesMinor),
            discounts: computeDelta(summary.discountsMinor, prev.discountsMinor),
            orders: computeDelta(summary.orderCount, prev.orderCount),
            averageOrderValue: computeDelta(summary.averageOrderValueMinor, prev.averageOrderValueMinor),
            unitsSold: computeDelta(summary.unitsSold, prev.unitsSold),
          },
          daily: buildDailySeries(range.current, currentRows, currency),
        },
      }),
    );
  });

  // ── Kırılımlar (ürün/varyant/kategori/marka/ödeme/kampanya) ────────────────
  app.get("/stores/:storeId/finance/breakdowns", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const query = parseQuery(request, reply);
    if (!query) return;

    const range = await resolveRangeFor(storeId, query);
    const filters = toFilters(query);
    const rangeArg = { fromUtc: range.current.fromUtc, toUtcExclusive: range.current.toUtcExclusive, timezone: range.timezone };
    let currency = filters.currency;
    if (!currency) {
      const rows = await data.getDailyRows(storeId, rangeArg, filters);
      currency = chooseCurrency(rows, undefined);
    }
    const breakdowns = await data.getBreakdowns(storeId, rangeArg, currency, filters, 50);

    return reply.send(
      financeBreakdownsResponseSchema.parse({
        data: { range: rangeMeta(range.current), currency, ...breakdowns },
      }),
    );
  });

  // ── Ödeme raporu ───────────────────────────────────────────────────────────
  app.get("/stores/:storeId/finance/payments", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const query = parseQuery(request, reply);
    if (!query) return;

    const range = await resolveRangeFor(storeId, query);
    const filters = toFilters(query);
    const rangeArg = { fromUtc: range.current.fromUtc, toUtcExclusive: range.current.toUtcExclusive, timezone: range.timezone };
    let currency = filters.currency;
    if (!currency) currency = chooseCurrency(await data.getDailyRows(storeId, rangeArg, filters), undefined);
    const rows = await data.getPaymentReport(storeId, rangeArg, currency, filters);
    return reply.send(
      financePaymentReportResponseSchema.parse({ data: { range: rangeMeta(range.current), currency, rows } }),
    );
  });

  // ── İndirim raporu ─────────────────────────────────────────────────────────
  app.get("/stores/:storeId/finance/discounts", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const query = parseQuery(request, reply);
    if (!query) return;

    const range = await resolveRangeFor(storeId, query);
    const filters = toFilters(query);
    const rangeArg = { fromUtc: range.current.fromUtc, toUtcExclusive: range.current.toUtcExclusive, timezone: range.timezone };
    let currency = filters.currency;
    if (!currency) currency = chooseCurrency(await data.getDailyRows(storeId, rangeArg, filters), undefined);
    const rows = await data.getDiscountReport(storeId, rangeArg, currency, filters);
    return reply.send(
      financeDiscountReportResponseSchema.parse({ data: { range: rangeMeta(range.current), currency, rows } }),
    );
  });

  // ── CSV export'ları (aktif filtreler; server-side; BOM'lu) ──────────────────
  function sendCsv(reply: FastifyReply, filename: string, csv: string) {
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(csv);
  }

  app.get("/stores/:storeId/finance/summary/export", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const query = parseQuery(request, reply);
    if (!query) return;
    const range = await resolveRangeFor(storeId, query);
    const filters = toFilters(query);
    const dailyFilters: FinanceFilters = { ...filters, currency: undefined };
    const rows = await data.getDailyRows(storeId, { fromUtc: range.current.fromUtc, toUtcExclusive: range.current.toUtcExclusive, timezone: range.timezone }, dailyFilters);
    const currency = chooseCurrency(rows, filters.currency);
    const series = buildDailySeries(range.current, rows, currency);
    const csv = buildCsv(
      ["date", "currency", "grossSalesMinor", "discountsMinor", "netProductSalesMinor", "shippingRevenueMinor", "taxMinor", "totalRevenueMinor", "orderCount", "paidOrderCount", "unitsSold", "cancelledOrderCount", "refundedOrderCount"],
      series.map((p) => [p.date, currency, p.grossSalesMinor, p.discountsMinor, p.netProductSalesMinor, p.shippingRevenueMinor, p.taxMinor, p.totalRevenueMinor, p.orderCount, p.paidOrderCount, p.unitsSold, p.cancelledOrderCount, p.refundedOrderCount]),
    );
    return sendCsv(reply, "finance-sales-summary.csv", csv);
  });

  app.get("/stores/:storeId/finance/products/export", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const query = parseQuery(request, reply);
    if (!query) return;
    const range = await resolveRangeFor(storeId, query);
    const filters = toFilters(query);
    const rangeArg = { fromUtc: range.current.fromUtc, toUtcExclusive: range.current.toUtcExclusive, timezone: range.timezone };
    const currency = filters.currency ?? chooseCurrency(await data.getDailyRows(storeId, rangeArg, filters), undefined);
    const breakdowns = await data.getBreakdowns(storeId, rangeArg, currency, filters, 200);
    const csv = buildCsv(
      ["productId", "title", "sku", "currency", "units", "grossMinor", "listGrossMinor", "discountMinor", "netMinor", "costMinor", "orderCount", "coveredUnits"],
      breakdowns.byProduct.map((r) => [r.productId, r.title, r.sku, currency, r.units, r.grossMinor, r.listGrossMinor, r.discountMinor, r.netMinor, r.costMinor, r.orderCount, r.coveredUnits]),
    );
    return sendCsv(reply, "finance-product-performance.csv", csv);
  });

  app.get("/stores/:storeId/finance/orders/export", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const query = parseQuery(request, reply);
    if (!query) return;
    const range = await resolveRangeFor(storeId, query);
    const filters = toFilters(query);
    const rangeArg = { fromUtc: range.current.fromUtc, toUtcExclusive: range.current.toUtcExclusive, timezone: range.timezone };
    const currency = filters.currency ?? chooseCurrency(await data.getDailyRows(storeId, rangeArg, filters), undefined);
    const rows = await data.getOrderFinancialLines(storeId, rangeArg, currency, filters, 50000);
    const csv = buildCsv(
      ["orderNumber", "saleDate", "currency", "status", "paymentStatus", "grossSalesMinor", "discountsMinor", "shippingRevenueMinor", "taxMinor", "totalMinor", "unitsSold"],
      rows.map((r) => [r.orderNumber, r.saleDate ? r.saleDate.toISOString() : "", r.currency, r.status, r.paymentStatus, r.grossSalesMinor, r.discountsMinor, r.shippingRevenueMinor, r.taxMinor ?? "", r.totalMinor, r.unitsSold]),
    );
    return sendCsv(reply, "finance-order-lines.csv", csv);
  });

  app.get("/stores/:storeId/finance/payments/export", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const query = parseQuery(request, reply);
    if (!query) return;
    const range = await resolveRangeFor(storeId, query);
    const filters = toFilters(query);
    const rangeArg = { fromUtc: range.current.fromUtc, toUtcExclusive: range.current.toUtcExclusive, timezone: range.timezone };
    const currency = filters.currency ?? chooseCurrency(await data.getDailyRows(storeId, rangeArg, filters), undefined);
    const rows = await data.getPaymentReport(storeId, rangeArg, currency, filters);
    const csv = buildCsv(
      ["provider", "method", "currency", "paidCount", "failedCount", "refundedCount", "collectedMinor"],
      rows.map((r) => [r.provider, r.method, r.currency, r.paidCount, r.failedCount, r.refundedCount, r.collectedMinor]),
    );
    return sendCsv(reply, "finance-payment-report.csv", csv);
  });

  app.get("/stores/:storeId/finance/discounts/export", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const query = parseQuery(request, reply);
    if (!query) return;
    const range = await resolveRangeFor(storeId, query);
    const filters = toFilters(query);
    const rangeArg = { fromUtc: range.current.fromUtc, toUtcExclusive: range.current.toUtcExclusive, timezone: range.timezone };
    const currency = filters.currency ?? chooseCurrency(await data.getDailyRows(storeId, rangeArg, filters), undefined);
    const rows = await data.getDiscountReport(storeId, rangeArg, currency, filters);
    const csv = buildCsv(
      ["label", "code", "campaignId", "couponId", "currency", "usageCount", "discountMinor", "ordersGrossMinor"],
      rows.map((r) => [r.label, r.code ?? "", r.campaignId ?? "", r.couponId ?? "", currency, r.usageCount, r.discountMinor, r.ordersGrossMinor]),
    );
    return sendCsv(reply, "finance-discount-report.csv", csv);
  });
}
