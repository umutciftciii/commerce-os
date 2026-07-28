/**
 * Granüler analytics serialize (ADR-176) — para birimi başına AYRI toplam; sessiz
 * cross-currency toplam YOK. conversionRate = orders/unique; AOV = gross/orders.
 */
import { describe, expect, it } from "vitest";
import { buildKpiSummary, buildMetricBody, serializeDaily, serializeUtm } from "../src/influencers/serialize.js";
import type { DailyPoint, ScopedTotals, UtmBreakdownRow } from "../src/influencers/analytics.js";

const singleCurrency: ScopedTotals = {
  clicks: 100,
  uniqueVisitors: 40,
  perCurrency: [{ currency: "TRY", orders: 10, grossMinor: 500_00, refundedMinor: 0, netMinor: 500_00 }],
};

const multiCurrency: ScopedTotals = {
  clicks: 200,
  uniqueVisitors: 80,
  perCurrency: [
    { currency: "TRY", orders: 8, grossMinor: 400_00, refundedMinor: 100_00, netMinor: 300_00 },
    { currency: "USD", orders: 2, grossMinor: 200_00, refundedMinor: 0, netMinor: 200_00 },
  ],
};

describe("buildKpiSummary — tek para birimi", () => {
  const s = buildKpiSummary(singleCurrency);
  it("temel metrikler", () => {
    expect(s.totalClicks).toBe(100);
    expect(s.uniqueVisitors).toBe(40);
    expect(s.attributedOrders).toBe(10);
    expect(s.currency).toBe("TRY");
    expect(s.grossRevenueMinor).toBe(500_00);
    expect(s.hasMultipleCurrencies).toBe(false);
    expect(s.revenues).toHaveLength(1);
  });
  it("conversionRate = orders/unique; AOV = gross/orders", () => {
    expect(s.conversionRate).toBeCloseTo(10 / 40);
    expect(s.averageOrderValueMinor).toBe(Math.round(500_00 / 10));
  });
});

describe("buildKpiSummary — çok para birimi (ADR-176)", () => {
  const s = buildKpiSummary(multiCurrency);
  it("hasMultipleCurrencies true, her currency ayrı", () => {
    expect(s.hasMultipleCurrencies).toBe(true);
    expect(s.revenues).toHaveLength(2);
    const byCur = Object.fromEntries(s.revenues.map((r) => [r.currency, r]));
    expect(byCur.TRY.netRevenueMinor).toBe(300_00);
    expect(byCur.USD.netRevenueMinor).toBe(200_00);
  });
  it("üst-seviye = BİRİNCİL (en yüksek net) currency; cross-currency toplanmaz", () => {
    // TRY net 300_00 > USD net 200_00 → birincil TRY.
    expect(s.currency).toBe("TRY");
    expect(s.netRevenueMinor).toBe(300_00);
    // grossRevenueMinor cross-currency (400_00+200_00) DEĞİL, yalnız birincil (400_00).
    expect(s.grossRevenueMinor).toBe(400_00);
  });
  it("attributedOrders sipariş sayısıdır → currency-bağımsız toplanır (safe)", () => {
    expect(s.attributedOrders).toBe(10);
  });
});

describe("buildMetricBody — boş scope", () => {
  it("sıfır güvenli varsayılanlar", () => {
    const b = buildMetricBody({ clicks: 0, uniqueVisitors: 0, perCurrency: [] });
    expect(b.attributedOrders).toBe(0);
    expect(b.conversionRate).toBe(0);
    expect(b.averageOrderValueMinor).toBe(0);
    expect(b.currency).toBe("TRY");
    expect(b.hasMultipleCurrencies).toBe(false);
    expect(b.revenues).toEqual([]);
  });
});

describe("serializeDaily — currency-aware + zero-fill uyumu (TD-146)", () => {
  const daily: DailyPoint[] = [
    { date: "2026-07-01", clicks: 10, uniqueVisitors: 8, orders: 2, perCurrency: [{ currency: "TRY", grossMinor: 200_00, netMinor: 200_00 }] },
    { date: "2026-07-02", clicks: 0, uniqueVisitors: 0, orders: 0, perCurrency: [] }, // zero-fill günü
    { date: "2026-07-03", clicks: 5, uniqueVisitors: 5, orders: 1, perCurrency: [
      { currency: "TRY", grossMinor: 100_00, netMinor: 100_00 },
      { currency: "USD", grossMinor: 50_00, netMinor: 50_00 },
    ] },
  ];
  const rows = serializeDaily(daily);

  it("conversionRate + birincil currency", () => {
    expect(rows[0].conversionRate).toBeCloseTo(2 / 8);
    expect(rows[0].netRevenueMinor).toBe(200_00);
    expect(rows[0].revenues).toHaveLength(1);
  });
  it("veri olmayan gün sıfır + boş revenues", () => {
    expect(rows[1].clicks).toBe(0);
    expect(rows[1].orders).toBe(0);
    expect(rows[1].revenues).toEqual([]);
  });
  it("çok currency günü ayrı revenues (cross-currency birleşmez)", () => {
    expect(rows[2].revenues).toHaveLength(2);
    const byCur = Object.fromEntries(rows[2].revenues.map((r) => [r.currency, r.netRevenueMinor]));
    expect(byCur.TRY).toBe(100_00);
    expect(byCur.USD).toBe(50_00);
  });
});

describe("serializeUtm — currency-aware kırılım (TD-144)", () => {
  const utm: UtmBreakdownRow[] = [
    {
      utmSource: "instagram", utmMedium: "influencer", utmCampaign: "yaz", utmContent: "reel-1", utmTerm: null,
      customLabel: "Instagram Reel", clicks: 20, uniqueVisitors: 15,
      perCurrency: [
        { currency: "TRY", orders: 3, grossMinor: 300_00, refundedMinor: 0, netMinor: 300_00 },
        { currency: "USD", orders: 1, grossMinor: 100_00, refundedMinor: 0, netMinor: 100_00 },
      ],
    },
  ];
  const rows = serializeUtm(utm);

  it("customLabel + unique + toplam sipariş", () => {
    expect(rows[0].customLabel).toBe("Instagram Reel");
    expect(rows[0].uniqueVisitors).toBe(15);
    expect(rows[0].attributedOrders).toBe(4); // 3 TRY + 1 USD
  });
  it("hasMultipleCurrencies + per-currency ayrı (sessiz toplam yok)", () => {
    expect(rows[0].hasMultipleCurrencies).toBe(true);
    expect(rows[0].revenues).toHaveLength(2);
  });
  it("conversionRate = toplam sipariş / unique", () => {
    expect(rows[0].conversionRate).toBeCloseTo(4 / 15);
  });
});
