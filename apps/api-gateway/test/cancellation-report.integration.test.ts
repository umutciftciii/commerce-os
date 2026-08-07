/**
 * TODO-174 (ADR-275) — İptal raporu aggregate GERÇEK-DB entegrasyon. DATABASE_URL yoksa SKIP.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@commerce-os/db";
import { resolveRange } from "../src/influencers/analytics-range.js";
import { buildCancellationReport } from "../src/orders/cancellation-report.js";

const hasDb = Boolean(process.env.DATABASE_URL);

async function seedCancelledOrder(
  storeId: string,
  opts: { category?: string; code?: string; total: number; paymentMethod?: string; shippingProvider?: string; cancelledAt: Date },
) {
  const sfx = randomUUID().slice(0, 10);
  const productId = `rp-prod-${sfx}`;
  const variantId = `rp-var-${sfx}`;
  await prisma.product.create({ data: { id: productId, storeId, title: `RP ${sfx}`, slug: `rp-${sfx}` } });
  await prisma.productVariant.create({
    data: { id: variantId, productId, storeId, title: "D", sku: `RS-${sfx}`, priceMinor: opts.total, currency: "TRY" },
  });
  const order = await prisma.order.create({
    data: {
      id: `rp-order-${sfx}`,
      storeId,
      orderNumber: `RP-${sfx.toUpperCase()}`,
      customerEmail: `rp-${sfx}@x.test`,
      currency: "TRY",
      status: "CANCELLED",
      totalAmount: opts.total,
      placedAt: opts.cancelledAt,
      cancelledAt: opts.cancelledAt,
      cancelSource: "CUSTOMER",
      cancelReasonCode: (opts.code ?? "CHANGED_MIND") as never,
      cancelReasonCategory: (opts.category ?? "PRODUCT_DECISION") as never,
      ...(opts.shippingProvider ? { shippingProvider: opts.shippingProvider as never, shippingProviderName: "MockCarrier" } : {}),
    },
  });
  await prisma.orderLine.create({
    data: {
      storeId,
      orderId: order.id,
      productId,
      variantId,
      sku: `RS-${sfx}`,
      title: `RP ${sfx}`,
      variantTitle: "D",
      quantity: 1,
      unitPriceAmount: opts.total,
      totalAmount: opts.total,
      currency: "TRY",
    },
  });
  await prisma.paymentAttempt.create({
    data: {
      storeId,
      orderId: order.id,
      type: "ONLINE",
      provider: "MOCK",
      method: (opts.paymentMethod ?? "CARD") as never,
      amount: opts.total,
      currency: "TRY",
      status: "PAID",
    },
  });
  return order.id;
}

describe.skipIf(!hasDb)("buildCancellationReport (ADR-275) — real DB", () => {
  const stores: string[] = [];
  afterEach(async () => {
    while (stores.length) {
      const id = stores.pop()!;
      await prisma.store.delete({ where: { id } }).catch(() => {});
    }
  });

  it("aggregates totals, distributions, trend, breakdowns", async () => {
    const sfx = randomUUID().slice(0, 10);
    const storeId = `rp-store-${sfx}`;
    await prisma.store.create({ data: { id: storeId, name: `RP ${sfx}`, slug: `rp-${sfx}` } });
    stores.push(storeId);

    const day = new Date("2026-08-05T09:00:00Z");
    await seedCancelledOrder(storeId, { category: "DELIVERY", code: "SHIPPING_FEE_TOO_HIGH", total: 10000, paymentMethod: "CARD", shippingProvider: "MOCK", cancelledAt: day });
    await seedCancelledOrder(storeId, { category: "PRODUCT_DECISION", code: "CHANGED_MIND", total: 5000, paymentMethod: "BANK_TRANSFER", cancelledAt: day });
    await seedCancelledOrder(storeId, { category: "DELIVERY", code: "DELIVERY_ESTIMATE_TOO_LONG", total: 3000, paymentMethod: "CARD", cancelledAt: day });

    const range = resolveRange({ dateFrom: "2026-08-01", dateTo: "2026-08-31", timezone: "Europe/Istanbul", nowMs: Date.parse("2026-08-31T00:00:00Z"), maxDays: 366, defaultDays: 30 });
    const report = await buildCancellationReport(prisma, storeId, range, {});

    expect(report.currency).toBe("TRY");
    expect(report.totals.cancellationCount).toBe(3);
    expect(report.totals.cancelledRevenueMinor).toBe(18000);
    expect(report.totals.ordersInRangeCount).toBeGreaterThanOrEqual(3);
    expect(report.totals.deliveryRelatedCount).toBe(2);
    expect(report.totals.deliveryRelatedRatePct).toBeCloseTo(66.7, 0);

    const delivery = report.reasonCategoryDistribution.find((r) => r.category === "DELIVERY");
    expect(delivery?.count).toBe(2);
    expect(delivery?.revenueMinor).toBe(13000);

    const card = report.paymentMethodBreakdown.find((r) => r.key === "CARD");
    expect(card?.count).toBe(2);

    const trendTotal = report.trend.reduce((s, p) => s + p.count, 0);
    expect(trendTotal).toBe(3);

    expect(report.topProducts.length).toBe(3);
    expect(report.sourceBreakdown.find((r) => r.source === "CUSTOMER")?.count).toBe(3);
  });

  it("reasonCategory filter narrows the universe", async () => {
    const sfx = randomUUID().slice(0, 10);
    const storeId = `rp-store-${sfx}`;
    await prisma.store.create({ data: { id: storeId, name: `RP ${sfx}`, slug: `rp-${sfx}` } });
    stores.push(storeId);
    const day = new Date("2026-08-05T09:00:00Z");
    await seedCancelledOrder(storeId, { category: "DELIVERY", code: "SHIPPING_FEE_TOO_HIGH", total: 10000, cancelledAt: day });
    await seedCancelledOrder(storeId, { category: "PRODUCT_DECISION", code: "CHANGED_MIND", total: 5000, cancelledAt: day });

    const range = resolveRange({ dateFrom: "2026-08-01", dateTo: "2026-08-31", timezone: "Europe/Istanbul", nowMs: Date.parse("2026-08-31T00:00:00Z"), maxDays: 366, defaultDays: 30 });
    const report = await buildCancellationReport(prisma, storeId, range, { reasonCategory: "DELIVERY" });
    expect(report.totals.cancellationCount).toBe(1);
    expect(report.totals.cancelledRevenueMinor).toBe(10000);
  });
});
