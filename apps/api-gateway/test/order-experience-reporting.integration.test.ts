/**
 * TD-174B-1/2 — Order-detail deneyim özeti + recovery/credit raporlama GERÇEK-DB testleri.
 * DATABASE_URL yoksa SKIP. store.delete cascade cleanup.
 */
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@commerce-os/db";
import { createOrderExperienceReview } from "../src/order-experience/service.js";
import {
  creditReport,
} from "../src/customer-credit/report.js";
import { issueCredit } from "../src/customer-credit/service.js";
import {
  getOrderExperienceForOrder,
  recoveryReport,
} from "../src/order-experience/recovery-read.js";
import { resolveFinanceRange } from "../src/finance/date-range.js";

const hasTestDb = Boolean(process.env.DATABASE_URL);
const created: string[] = [];

function range() {
  return resolveFinanceRange({ preset: "last30", timezone: "Europe/Istanbul", nowMs: Date.now() }).current;
}

async function seed(): Promise<{ storeId: string; customerId: string; orderId: string }> {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `rep-store-${sfx}`;
  const customerId = `rep-cust-${sfx}`;
  const orderId = `rep-ord-${sfx}`;
  await prisma.store.create({ data: { id: storeId, name: `Rep ${sfx}`, slug: `rep-${sfx}` } });
  await prisma.customer.create({ data: { id: customerId, storeId, email: `rep-${sfx}@e.test`, firstName: "Rep", lastName: "User" } });
  await prisma.order.create({
    data: { id: orderId, storeId, orderNumber: `RP-${sfx}`, customerId, customerEmail: `rep-${sfx}@e.test`, currency: "TRY", status: "CANCELLED" },
  });
  created.push(storeId);
  return { storeId, customerId, orderId };
}

describe.skipIf(!hasTestDb)("TD-174B-1/2 order-experience summary + reporting (integration)", () => {
  afterEach(async () => {
    for (const storeId of created.splice(0)) await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
  });

  it("getOrderExperienceForOrder: review yoksa null", async () => {
    const f = await seed();
    expect(await getOrderExperienceForOrder(f.storeId, f.orderId)).toBeNull();
  });

  it("getOrderExperienceForOrder: 1★ review → recovery case + goodwill toplamı", async () => {
    const f = await seed();
    const r = await createOrderExperienceReview({ storeId: f.storeId, orderId: f.orderId, customerId: f.customerId, rating: 1, comment: "Kötü" });
    const kase = await prisma.orderRecoveryCase.findUniqueOrThrow({ where: { orderExperienceReviewId: r.id }, select: { id: true } });
    // Recovery goodwill kredisi (case'e bağlı).
    const issued = await issueCredit({
      storeId: f.storeId,
      customerId: f.customerId,
      currency: "TRY",
      amountMinor: 15000n,
      expiryDays: 120,
      sourceType: "RECOVERY_GOODWILL",
      sourceId: kase.id,
      ledgerType: "RECOVERY_GOODWILL_CREDIT",
      description: "goodwill.recovery",
      actor: { type: "PLATFORM_USER", id: "admin-1" },
      idempotencyKey: `recovery-credit:${kase.id}`,
      policyMaxMinor: undefined,
    });
    expect(issued.ok).toBe(true);

    const summary = await getOrderExperienceForOrder(f.storeId, f.orderId);
    expect(summary).not.toBeNull();
    expect(summary!.rating).toBe(1);
    expect(summary!.comment).toBe("Kötü");
    expect(summary!.recovery).not.toBeNull();
    expect(summary!.recovery!.caseId).toBe(kase.id);
    expect(summary!.recovery!.status).toBe("OPEN");
    expect(summary!.recovery!.priority).toBe("HIGH");
    expect(summary!.goodwillCreditMinor).toBe("15000");
  });

  it("getOrderExperienceForOrder: store izolasyonu (yanlış store null)", async () => {
    const f = await seed();
    await createOrderExperienceReview({ storeId: f.storeId, orderId: f.orderId, customerId: f.customerId, rating: 2, comment: null });
    const other = await seed();
    expect(await getOrderExperienceForOrder(other.storeId, f.orderId)).toBeNull();
  });

  it("recoveryReport: totals + trend + goodwill", async () => {
    const f = await seed();
    await createOrderExperienceReview({ storeId: f.storeId, orderId: f.orderId, customerId: f.customerId, rating: 1, comment: null });
    const report = await recoveryReport(f.storeId, range());
    expect(report.totals.totalReviews).toBe(1);
    expect(report.totals.lowRatingCount).toBe(1);
    expect(report.totals.highRatingCount).toBe(0);
    expect(report.totals.openCases).toBe(1);
    // Trend gün dizisi zero-fill: bugünkü bucket 1 review içerir.
    const totalInTrend = report.ratingTrend.reduce((s, p) => s + p.count, 0);
    expect(totalInTrend).toBe(1);
    expect(report.ratingTrend.length).toBeGreaterThan(0);
  });

  it("creditReport: issued/spent/restored/expired + outstanding liability", async () => {
    const f = await seed();
    await issueCredit({
      storeId: f.storeId,
      customerId: f.customerId,
      currency: "TRY",
      amountMinor: 50000n,
      expiryDays: 120,
      sourceType: "ADMIN_GOODWILL",
      sourceId: null,
      ledgerType: "ADMIN_GOODWILL_CREDIT",
      description: "goodwill.admin",
      actor: { type: "PLATFORM_USER", id: "admin-1" },
      idempotencyKey: `admin-credit:${randomUUID()}`,
      policyMaxMinor: undefined,
    });
    const report = await creditReport(f.storeId, range(), "TRY");
    expect(report.currency).toBe("TRY");
    expect(report.issuedMinor).toBe("50000");
    expect(report.outstandingLiabilityMinor).toBe("50000");
    expect(report.activeLotCount).toBe(1);
    expect(report.customersWithBalance).toBe(1);
    expect(report.spentMinor).toBe("0");
    expect(report.expiredMinor).toBe("0");
  });

  it("creditReport: store izolasyonu (başka store 0)", async () => {
    const f = await seed();
    await issueCredit({
      storeId: f.storeId,
      customerId: f.customerId,
      currency: "TRY",
      amountMinor: 12000n,
      expiryDays: 60,
      sourceType: "ADMIN_GOODWILL",
      sourceId: null,
      ledgerType: "ADMIN_GOODWILL_CREDIT",
      description: "goodwill.admin",
      actor: { type: "PLATFORM_USER", id: "admin-1" },
      idempotencyKey: `admin-credit:${randomUUID()}`,
      policyMaxMinor: undefined,
    });
    const other = await seed();
    const report = await creditReport(other.storeId, range(), "TRY");
    expect(report.issuedMinor).toBe("0");
    expect(report.outstandingLiabilityMinor).toBe("0");
  });
});
