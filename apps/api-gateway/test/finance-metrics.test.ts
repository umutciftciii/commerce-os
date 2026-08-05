/**
 * ADR-268 — Financial Reporting metrik sözlüğü SAF birim testleri.
 * Sözlük formülleri + reconciliation (özet = Σ günlük) + kapsam-kapılı kârlılık +
 * para ayrımı + sıfır-payda güvenliği (§15, §19).
 */
import { describe, expect, it } from "vitest";
import {
  averageOrderValue,
  computeDelta,
  listCurrencies,
  primaryCurrency,
  summarizeDailyRows,
  type FinanceDailyRow,
} from "../src/finance/metrics.js";

function row(partial: Partial<FinanceDailyRow> & { date: string; currency: string }): FinanceDailyRow {
  return {
    grossSalesMinor: 0,
    discountsMinor: 0,
    shippingRevenueMinor: 0,
    totalMinor: 0,
    taxMinor: 0,
    netExVatMinor: 0,
    costMinor: 0,
    orderCount: 0,
    paidOrderCount: 0,
    refundedOrderCount: 0,
    productRefundsMinor: 0,
    shippingRefundsMinor: 0,
    unitsSold: 0,
    cancelledOrderCount: 0,
    taxCoveredOrderCount: 0,
    costCoveredOrderCount: 0,
    ...partial,
  };
}

describe("summarizeDailyRows — sözlük formülleri", () => {
  it("gross/discount/shipping/net/total doğru türetir (KDV inclusive; revenue'ya 2. kez eklenmez)", () => {
    const rows = [
      row({ date: "2026-08-01", currency: "TRY", grossSalesMinor: 10000, discountsMinor: 1500, shippingRevenueMinor: 2000, taxMinor: 1400, orderCount: 2, unitsSold: 3, totalMinor: 10500 }),
      row({ date: "2026-08-02", currency: "TRY", grossSalesMinor: 5000, discountsMinor: 0, shippingRevenueMinor: 1000, taxMinor: 700, orderCount: 1, unitsSold: 1, totalMinor: 6000 }),
    ];
    const s = summarizeDailyRows("TRY", rows);
    expect(s.grossSalesMinor).toBe(15000);
    expect(s.discountsMinor).toBe(1500);
    expect(s.shippingRevenueMinor).toBe(3000);
    // Net = gross - discount - productRefund(0)
    expect(s.netProductSalesMinor).toBe(13500);
    // Total = net + shipping - shippingRefund(0). KDV ayrı; toplamı şişirmez.
    expect(s.totalRevenueMinor).toBe(16500);
    expect(s.taxMinor).toBe(2100);
    expect(s.unitsSold).toBe(4);
    expect(s.orderCount).toBe(3);
  });

  it("ADR-272: SUCCEEDED refund'lar Net/Total'den TEK KEZ düşülür (inclusive KDV üstüne eklenmez)", () => {
    const rows = [
      row({
        date: "2026-08-01",
        currency: "TRY",
        grossSalesMinor: 10000,
        discountsMinor: 1000,
        shippingRevenueMinor: 2000,
        productRefundsMinor: 3000, // inclusive KDV içerir → yalnız bir kez düşülür
        shippingRefundsMinor: 500,
        taxMinor: 1400,
        orderCount: 2,
        totalMinor: 11000,
      }),
    ];
    const s = summarizeDailyRows("TRY", rows);
    expect(s.productRefundsMinor).toBe(3000);
    expect(s.shippingRefundsMinor).toBe(500);
    // Net = gross - discount - productRefund = 10000 - 1000 - 3000
    expect(s.netProductSalesMinor).toBe(6000);
    // Total = net + shipping - shippingRefund = 6000 + 2000 - 500
    expect(s.totalRevenueMinor).toBe(7500);
    // KDV ayrı taşınır; refund'un tax kısmı ürün refund'un İÇİNDE (ayrıca düşülmez).
    expect(s.taxMinor).toBe(1400);
  });

  it("reconciliation: özet toplamları günlük satırların alan-toplamına birebir eşittir", () => {
    const rows = [
      row({ date: "2026-08-01", currency: "TRY", grossSalesMinor: 3333, discountsMinor: 111, shippingRevenueMinor: 999, orderCount: 1, unitsSold: 2 }),
      row({ date: "2026-08-02", currency: "TRY", grossSalesMinor: 7777, discountsMinor: 222, shippingRevenueMinor: 1, orderCount: 3, unitsSold: 5 }),
      row({ date: "2026-08-03", currency: "TRY", grossSalesMinor: 1, discountsMinor: 0, shippingRevenueMinor: 0, orderCount: 1, unitsSold: 1 }),
    ];
    const s = summarizeDailyRows("TRY", rows);
    expect(s.grossSalesMinor).toBe(rows.reduce((a, r) => a + r.grossSalesMinor, 0));
    expect(s.discountsMinor).toBe(rows.reduce((a, r) => a + r.discountsMinor, 0));
    expect(s.shippingRevenueMinor).toBe(rows.reduce((a, r) => a + r.shippingRevenueMinor, 0));
    expect(s.orderCount).toBe(rows.reduce((a, r) => a + r.orderCount, 0));
    expect(s.unitsSold).toBe(rows.reduce((a, r) => a + r.unitsSold, 0));
    expect(s.netProductSalesMinor).toBe(s.grossSalesMinor - s.discountsMinor);
    expect(s.totalRevenueMinor).toBe(s.netProductSalesMinor + s.shippingRevenueMinor);
  });

  it("para ayrımı: yalnız hedef currency satırları katlanır; diğer currency yok sayılır", () => {
    const rows = [
      row({ date: "2026-08-01", currency: "TRY", grossSalesMinor: 10000, orderCount: 1 }),
      row({ date: "2026-08-01", currency: "USD", grossSalesMinor: 500, orderCount: 1 }),
    ];
    expect(summarizeDailyRows("TRY", rows).grossSalesMinor).toBe(10000);
    expect(summarizeDailyRows("USD", rows).grossSalesMinor).toBe(500);
    // Cross-currency asla toplanmaz.
    expect(summarizeDailyRows("TRY", rows).grossSalesMinor + summarizeDailyRows("USD", rows).grossSalesMinor).toBe(10500);
  });

  it("iptal siparişleri satışa DAHİL DEĞİL, ayrı sayılır; unpaid tahsilata girmez", () => {
    const rows = [
      row({ date: "2026-08-01", currency: "TRY", grossSalesMinor: 8000, orderCount: 2, paidOrderCount: 1, cancelledOrderCount: 3, refundedOrderCount: 1 }),
    ];
    const s = summarizeDailyRows("TRY", rows);
    expect(s.grossSalesMinor).toBe(8000); // iptaller tutara girmedi
    expect(s.orderCount).toBe(2);
    expect(s.cancelledOrderCount).toBe(3);
    expect(s.paidOrderCount).toBe(1); // yalnız ödenen
    expect(s.refundedOrderCount).toBe(1);
    expect(s.productRefundsMinor).toBe(0); // iade tutarı bu fazda yok (uydurulmaz)
  });

  it("kârlılık: dönem TAM kapsamlıysa gross/net profit türetilir", () => {
    const rows = [
      row({ date: "2026-08-01", currency: "TRY", grossSalesMinor: 12000, discountsMinor: 1000, netExVatMinor: 10000, costMinor: 6000, orderCount: 2, taxCoveredOrderCount: 2, costCoveredOrderCount: 2 }),
    ];
    const s = summarizeDailyRows("TRY", rows);
    expect(s.costMinor).toBe(6000);
    expect(s.grossProfitMinor).toBe(4000); // netExVat - cost
    expect(s.netProfitMinor).toBe(3000); // grossProfit - discounts
  });

  it("kârlılık: kapsam eksikse null (kısmi maliyetle yanıltıcı kâr yok)", () => {
    const rows = [
      row({ date: "2026-08-01", currency: "TRY", grossSalesMinor: 12000, netExVatMinor: 5000, costMinor: 3000, orderCount: 2, taxCoveredOrderCount: 2, costCoveredOrderCount: 1 }),
    ];
    const s = summarizeDailyRows("TRY", rows);
    expect(s.costMinor).toBeNull();
    expect(s.grossProfitMinor).toBeNull();
    expect(s.netProfitMinor).toBeNull();
  });

  it("boş girdi → tüm metrikler 0, AOV 0, kâr null", () => {
    const s = summarizeDailyRows("TRY", []);
    expect(s.grossSalesMinor).toBe(0);
    expect(s.totalRevenueMinor).toBe(0);
    expect(s.averageOrderValueMinor).toBe(0);
    expect(s.grossProfitMinor).toBeNull();
  });
});

describe("averageOrderValue — sıfır-payda güvenli", () => {
  it("orderCount 0 → 0", () => {
    expect(averageOrderValue(50000, 0)).toBe(0);
  });
  it("tam-sayı yuvarlama", () => {
    expect(averageOrderValue(10000, 3)).toBe(3333);
  });
});

describe("computeDelta — karşılaştırma (§10)", () => {
  it("previous 0 → deltaPct null (renk-tek-başına değil)", () => {
    const d = computeDelta(1000, 0);
    expect(d.deltaMinor).toBe(1000);
    expect(d.deltaPct).toBeNull();
  });
  it("yüzde değişim doğru", () => {
    const d = computeDelta(1500, 1000);
    expect(d.deltaMinor).toBe(500);
    expect(d.deltaPct).toBe(50);
  });
  it("negatif değişim", () => {
    const d = computeDelta(800, 1000);
    expect(d.deltaMinor).toBe(-200);
    expect(d.deltaPct).toBeCloseTo(-20);
  });
});

describe("listCurrencies / primaryCurrency", () => {
  it("satış hacmine göre azalan; birincil = en yüksek", () => {
    const rows = [
      row({ date: "d1", currency: "USD", grossSalesMinor: 100 }),
      row({ date: "d2", currency: "TRY", grossSalesMinor: 10000, shippingRevenueMinor: 500 }),
      row({ date: "d3", currency: "EUR", grossSalesMinor: 2000 }),
    ];
    expect(listCurrencies(rows)).toEqual(["TRY", "EUR", "USD"]);
    expect(primaryCurrency(rows)).toBe("TRY");
  });
  it("boş → null", () => {
    expect(primaryCurrency([])).toBeNull();
  });
});
