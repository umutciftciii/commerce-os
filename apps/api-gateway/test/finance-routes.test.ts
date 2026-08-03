/**
 * ADR-268 — Finance rota katmanı testleri: uç kablolaması, tenant izolasyonu,
 * yanıt şeması + CSV export (fake FinanceDataAccess ile; DB yok, app.inject).
 */
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { registerFinanceRoutes } from "../src/finance/routes.js";
import type { FinanceDataAccess } from "../src/finance/data.js";
import type { FinanceDailyRow } from "../src/finance/metrics.js";

const NOW = Date.UTC(2026, 7, 3, 9, 0, 0);

function dailyRow(date: string): FinanceDailyRow {
  return {
    date,
    currency: "TRY",
    grossSalesMinor: 10000,
    discountsMinor: 1500,
    shippingRevenueMinor: 2000,
    totalMinor: 10500,
    taxMinor: 1400,
    netExVatMinor: 7083,
    costMinor: 4000,
    orderCount: 2,
    paidOrderCount: 2,
    refundedOrderCount: 0,
    unitsSold: 3,
    cancelledOrderCount: 1,
    taxCoveredOrderCount: 2,
    costCoveredOrderCount: 2,
  };
}

const fakeData: FinanceDataAccess = {
  async getDailyRows() {
    return [dailyRow("2026-08-03")];
  },
  async getBreakdowns() {
    return {
      byProduct: [{ productId: "p1", title: "Ürün", sku: "SKU1", units: 3, grossMinor: 10000, listGrossMinor: 12000, discountMinor: 2000, netMinor: 7083, costMinor: 4000, orderCount: 2, coveredUnits: 3 }],
      byVariant: [],
      byCategory: [{ key: "c1", label: "Kategori", units: 3, grossMinor: 10000, orderCount: 2 }],
      byBrand: [{ key: "b1", label: "Marka", units: 3, grossMinor: 10000, orderCount: 2 }],
      byPaymentMethod: [{ provider: "IYZICO", method: "CARD", paidCount: 2, failedCount: 0, refundedCount: 0, collectedMinor: 21000, currency: "TRY" }],
      byCampaign: [{ campaignId: "cmp1", couponId: null, code: "YAZ10", label: "Yaz", usageCount: 1, discountMinor: 1500, ordersGrossMinor: 10000 }],
    };
  },
  async getPaymentReport() {
    return [{ provider: "IYZICO", method: "CARD", paidCount: 2, failedCount: 1, refundedCount: 0, collectedMinor: 21000, currency: "TRY" }];
  },
  async getDiscountReport() {
    return [{ campaignId: "cmp1", couponId: null, code: "YAZ10", label: "Yaz", usageCount: 1, discountMinor: 1500, ordersGrossMinor: 10000 }];
  },
  async getOrderFinancialLines() {
    return [{ orderNumber: "ORD-1", saleDate: new Date(NOW), currency: "TRY", status: "PLACED", paymentStatus: "PAID", grossSalesMinor: 10000, discountsMinor: 1500, shippingRevenueMinor: 2000, taxMinor: 1400, totalMinor: 10500, unitsSold: 3 }];
  },
};

function buildApp() {
  const app = Fastify();
  registerFinanceRoutes(app, {
    data: fakeData,
    requireStoreAdmin: async (_request: FastifyRequest, reply: FastifyReply, storeId: string) => {
      if (storeId !== "store-a") {
        await reply.code(403).send({ error: { code: "FORBIDDEN", message: "no" } });
        return null;
      }
      return { actorUserId: "admin-1" };
    },
    getStoreTimezone: async () => "Europe/Istanbul",
    now: () => NOW,
  });
  return app;
}

describe("finance routes", () => {
  it("summary: 200 + doğru türetilmiş metrikler + comparison + günlük seri", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/stores/store-a/finance/summary?period=last7" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.currency).toBe("TRY");
    expect(body.data.refundAmountsSupported).toBe(false);
    expect(body.data.summary.grossSalesMinor).toBe(10000);
    expect(body.data.summary.netProductSalesMinor).toBe(8500);
    expect(body.data.summary.totalRevenueMinor).toBe(10500);
    expect(body.data.summary.grossProfitMinor).toBe(3083); // netExVat - cost
    expect(body.data.availableCurrencies).toEqual(["TRY"]);
    // Günlük seri aralık günü kadar (7) — zero-fill.
    expect(body.data.daily).toHaveLength(7);
    await app.close();
  });

  it("tenant izolasyonu: başka mağaza → 403", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/stores/store-b/finance/summary" });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("breakdowns / payments / discounts 200 döner", async () => {
    const app = buildApp();
    for (const path of ["breakdowns", "payments", "discounts"]) {
      const res = await app.inject({ method: "GET", url: `/stores/store-a/finance/${path}?period=last30&currency=TRY` });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.currency).toBe("TRY");
    }
    await app.close();
  });

  it("CSV export: BOM + text/csv content-type", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/stores/store-a/finance/summary/export?period=last7&currency=TRY" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body.startsWith("﻿")).toBe(true);
    await app.close();
  });

  it("geçersiz query → 400", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/stores/store-a/finance/summary?period=bogus" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
