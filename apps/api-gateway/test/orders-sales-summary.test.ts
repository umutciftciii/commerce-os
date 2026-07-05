import { describe, expect, it } from "vitest";
import {
  buildOrderSalesSummary,
  type SalesSummaryLineInput,
  type SalesSummaryOrderInput,
} from "../src/orders/sales-summary.js";

/**
 * F4C (ADR-064) — Satış özeti türetiminin deterministik birim testleri.
 * Referans senaryo kullanıcı tablosundan uyarlanmıştır (brüt 1.499, %10 sepet
 * indirimi 149,90, kargo 169,99, maliyet 900). KDV ayrıştırması ADR-063 standart
 * formülüyledir: net = round(brüt·10000/12000) = 1.249,17; KDV = 249,83 —
 * tablodaki "KDV = brütün %20'si" yaklaşımı bilinçli olarak KULLANILMAZ.
 */

function line(overrides: Partial<SalesSummaryLineInput> = {}): SalesSummaryLineInput {
  return {
    quantity: 1,
    totalAmount: 149900,
    unitPriceAmount: 149900,
    unitNetPriceMinor: 124917,
    unitVatRateBps: 2000,
    unitVatAmountMinor: 24983,
    unitGrossPriceMinor: 149900,
    unitListPriceMinor: 149900,
    unitCostMinor: 90000,
    lineNetAmountMinor: 124917,
    lineVatAmountMinor: 24983,
    lineGrossAmountMinor: 149900,
    lineCostMinor: 90000,
    ...overrides,
  };
}

function order(overrides: Partial<SalesSummaryOrderInput> = {}): SalesSummaryOrderInput {
  return {
    currency: "TRY",
    subtotalAmount: 149900,
    discountAmount: 14990,
    shippingAmount: 16999,
    totalAmount: 151909,
    paymentStatus: "PAID",
    lines: [line()],
    discounts: [{ label: "%10 Sepet İndirimi", discountAmountMinor: 14990 }],
    paymentAttempts: [{ status: "PAID", amount: 151909 }],
    ...overrides,
  };
}

describe("buildOrderSalesSummary — Bölüm A (ödeme/tutar)", () => {
  it("kullanıcı senaryosu: ara toplam/indirim/kargo/ödenmesi gereken/ödenen/kalan", () => {
    const summary = buildOrderSalesSummary(order());
    expect(summary.currency).toBe("TRY");
    expect(summary.subtotalGrossMinor).toBe(149900);
    expect(summary.discountGrossMinor).toBe(14990);
    expect(summary.discountLabel).toBe("%10 Sepet İndirimi");
    expect(summary.shippingGrossMinor).toBe(16999);
    expect(summary.payableGrossMinor).toBe(151909);
    expect(summary.paidGrossMinor).toBe(151909);
    expect(summary.remainingGrossMinor).toBe(0);
  });

  it("ödeme denemesi yoksa ve sipariş UNPAID ise ödenen 0, kalan = ödenmesi gereken", () => {
    const summary = buildOrderSalesSummary(order({ paymentStatus: "UNPAID", paymentAttempts: [] }));
    expect(summary.paidGrossMinor).toBe(0);
    expect(summary.remainingGrossMinor).toBe(151909);
  });

  it("deneme yok ama sipariş PAID ise genel toplam ödenen sayılır (mevcut UI kuralı)", () => {
    const summary = buildOrderSalesSummary(order({ paymentAttempts: [] }));
    expect(summary.paidGrossMinor).toBe(151909);
    expect(summary.remainingGrossMinor).toBe(0);
  });

  it("birden çok indirim etiketi ' + ' ile birleşir", () => {
    const summary = buildOrderSalesSummary(
      order({
        discounts: [
          { label: "%10 Sepet İndirimi", discountAmountMinor: 14990 },
          { label: "TEST250", discountAmountMinor: 25000 },
        ],
      }),
    );
    expect(summary.discountLabel).toBe("%10 Sepet İndirimi + TEST250");
  });

  it("indirim yoksa etiket null", () => {
    expect(buildOrderSalesSummary(order({ discounts: [] })).discountLabel).toBeNull();
  });
});

describe("buildOrderSalesSummary — Bölüm B (satış/vergi/kâr)", () => {
  it("kullanıcı senaryosu: liste/KDV/net/maliyet/brüt kâr/kampanya indirimi/net kâr", () => {
    const summary = buildOrderSalesSummary(order());
    expect(summary.sales).not.toBeNull();
    const sales = summary.sales!;
    expect(sales.listGrossMinor).toBe(149900);
    expect(sales.totalVatMinor).toBe(24983);
    expect(sales.vatBreakdown).toEqual([{ rateBps: 2000, amountMinor: 24983 }]);
    expect(sales.subtotalNetMinor).toBe(124917);
    expect(sales.totalCostMinor).toBe(90000);
    expect(sales.grossProfitMinor).toBe(34917); // 1.249,17 − 900,00 = 349,17 TL
    expect(sales.campaignDiscountMinor).toBe(14990);
    expect(sales.netProfitMinor).toBe(19927); // 349,17 − 149,90 = 199,27 TL
  });

  it("çok satır + adet: toplamlar satır snapshot'larının toplamıdır", () => {
    const summary = buildOrderSalesSummary(
      order({
        subtotalAmount: 149900 * 2 + 12000,
        lines: [
          line({ quantity: 2, totalAmount: 299800, lineNetAmountMinor: 249834, lineVatAmountMinor: 49966, lineGrossAmountMinor: 299800, lineCostMinor: 180000 }),
          line({
            quantity: 1,
            totalAmount: 12000,
            unitPriceAmount: 12000,
            unitNetPriceMinor: 10000,
            unitVatRateBps: 2000,
            unitVatAmountMinor: 2000,
            unitGrossPriceMinor: 12000,
            unitListPriceMinor: 15000,
            unitCostMinor: 4000,
            lineNetAmountMinor: 10000,
            lineVatAmountMinor: 2000,
            lineGrossAmountMinor: 12000,
            lineCostMinor: 4000,
          }),
        ],
      }),
    );
    const sales = summary.sales!;
    expect(sales.listGrossMinor).toBe(149900 * 2 + 15000);
    expect(sales.subtotalNetMinor).toBe(249834 + 10000);
    expect(sales.totalVatMinor).toBe(49966 + 2000);
    expect(sales.totalCostMinor).toBe(180000 + 4000);
  });

  it("karma KDV oranları: toplam KDV + oran bazlı dağılım (artan oran sırası)", () => {
    const summary = buildOrderSalesSummary(
      order({
        lines: [
          line(),
          line({
            totalAmount: 11000,
            unitPriceAmount: 11000,
            unitNetPriceMinor: 10000,
            unitVatRateBps: 1000,
            unitVatAmountMinor: 1000,
            unitGrossPriceMinor: 11000,
            unitListPriceMinor: 11000,
            lineNetAmountMinor: 10000,
            lineVatAmountMinor: 1000,
            lineGrossAmountMinor: 11000,
          }),
        ],
      }),
    );
    const sales = summary.sales!;
    expect(sales.totalVatMinor).toBe(24983 + 1000);
    expect(sales.vatBreakdown).toEqual([
      { rateBps: 1000, amountMinor: 1000 },
      { rateBps: 2000, amountMinor: 24983 },
    ]);
  });

  it("maliyet snapshot'ı eksik satır varsa maliyet/kâr null (yanıltıcı sıfır YOK), KDV yine dolu", () => {
    const summary = buildOrderSalesSummary(
      order({ lines: [line(), line({ unitCostMinor: null, lineCostMinor: null })] }),
    );
    const sales = summary.sales!;
    expect(sales.totalCostMinor).toBeNull();
    expect(sales.grossProfitMinor).toBeNull();
    expect(sales.netProfitMinor).toBeNull();
    expect(sales.totalVatMinor).toBeGreaterThan(0);
  });

  it("legacy sipariş (KDV snapshot'sız satır) → sales bölümü null", () => {
    const legacyLine = line({
      unitNetPriceMinor: null,
      unitVatRateBps: null,
      unitVatAmountMinor: null,
      unitGrossPriceMinor: null,
      unitListPriceMinor: null,
      lineNetAmountMinor: null,
      lineVatAmountMinor: null,
      lineGrossAmountMinor: null,
    });
    const summary = buildOrderSalesSummary(order({ lines: [legacyLine] }));
    expect(summary.sales).toBeNull();
    // Bölüm A yine doludur (mevcut sipariş alanlarından türetilir).
    expect(summary.payableGrossMinor).toBe(151909);
  });

  it("TEK satırı bile legacy olan sipariş sales üretmez (kısmi/yanıltıcı özet YOK)", () => {
    const summary = buildOrderSalesSummary(
      order({ lines: [line(), line({ unitNetPriceMinor: null })] }),
    );
    expect(summary.sales).toBeNull();
  });

  it("satırı olmayan sipariş sales üretmez", () => {
    expect(buildOrderSalesSummary(order({ lines: [] })).sales).toBeNull();
  });

  it("zararına satış: negatif brüt/net kâr deterministik hesaplanır", () => {
    const summary = buildOrderSalesSummary(
      order({ lines: [line({ unitCostMinor: 130000, lineCostMinor: 130000 })] }),
    );
    const sales = summary.sales!;
    expect(sales.grossProfitMinor).toBe(124917 - 130000);
    expect(sales.netProfitMinor).toBe(124917 - 130000 - 14990);
  });
});
