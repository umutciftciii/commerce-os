/**
 * TODO-174B (ADR-282) — Store Credit checkout allocation + cancellation restore GERÇEK-DB testleri.
 * DATABASE_URL yoksa SKIP. store.delete cascade cleanup.
 */
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@commerce-os/db";
import { applyStoreCreditToOrderInTx } from "../src/customer-credit/checkout.js";
import { issueCredit, restoreCreditForOrderInTx, getAvailableBalanceMinor } from "../src/customer-credit/service.js";
import { prepareCancellationRefund } from "../src/refunds/service.js";

const hasTestDb = Boolean(process.env.DATABASE_URL);
const created: string[] = [];

async function seed(totalAmount: number) {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `cco-store-${sfx}`;
  const customerId = `cco-cust-${sfx}`;
  const orderId = `cco-ord-${sfx}`;
  await prisma.store.create({ data: { id: storeId, name: `Cco ${sfx}`, slug: `cco-${sfx}` } });
  await prisma.customer.create({ data: { id: customerId, storeId, email: `cco-${sfx}@e.test`, firstName: "C", lastName: "O" } });
  await prisma.order.create({
    data: {
      id: orderId, storeId, orderNumber: `OS-${sfx}`, customerId, customerEmail: `cco-${sfx}@e.test`,
      currency: "TRY", status: "PLACED", paymentStatus: "UNPAID", totalAmount,
    },
  });
  created.push(storeId);
  return { storeId, customerId, orderId };
}

async function grant(storeId: string, customerId: string, amount: bigint, key: string) {
  return issueCredit({
    storeId, customerId, currency: "TRY", amountMinor: amount, expiryDays: 60,
    sourceType: "ADMIN_GOODWILL", ledgerType: "ADMIN_GOODWILL_CREDIT", description: "credit.goodwill",
    actor: { type: "PLATFORM_USER", id: "a" }, idempotencyKey: key,
  });
}

async function apply(f: { storeId: string; customerId: string; orderId: string }) {
  return prisma.$transaction((tx) =>
    applyStoreCreditToOrderInTx(tx, { storeId: f.storeId, orderId: f.orderId, customerId: f.customerId }),
  );
}

describe.skipIf(!hasTestDb)("Store Credit checkout allocation (integration)", () => {
  afterEach(async () => {
    for (const storeId of created.splice(0)) await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
  });

  it("bakiye yok → applied:false, sipariş UNPAID", async () => {
    const f = await seed(30000);
    const r = await apply(f);
    expect(r.applied).toBe(false);
    const ord = await prisma.order.findUniqueOrThrow({ where: { id: f.orderId }, select: { paymentStatus: true, shoppingCreditUsedMinor: true } });
    expect(ord.paymentStatus).toBe("UNPAID");
    expect(ord.shoppingCreditUsedMinor).toBe(0n);
  });

  it("tam-credit (bakiye ≥ toplam) → PAID + snapshot + STORE_CREDIT attempt + external 0", async () => {
    const f = await seed(30000);
    await grant(f.storeId, f.customerId, 50000n, "g1"); // 500 > 300
    const r = await apply(f);
    expect(r.applied).toBe(true);
    if (r.applied) {
      expect(r.creditUsedMinor).toBe(30000n);
      expect(r.fullyPaid).toBe(true);
      expect(r.externalPayableMinor).toBe(0n);
    }
    const ord = await prisma.order.findUniqueOrThrow({
      where: { id: f.orderId },
      select: { paymentStatus: true, shoppingCreditUsedMinor: true, externalPaymentAmountMinor: true },
    });
    expect(ord.paymentStatus).toBe("PAID");
    expect(ord.shoppingCreditUsedMinor).toBe(30000n);
    expect(ord.externalPaymentAmountMinor).toBe(0n);
    const attempt = await prisma.paymentAttempt.findFirst({ where: { orderId: f.orderId, method: "STORE_CREDIT" } });
    expect(attempt?.status).toBe("PAID");
    expect(attempt?.amount).toBe(30000);
    // Kalan bakiye 500-300 = 200.
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(20000n);
  });

  it("kısmi credit (bakiye < toplam) → UNPAID + external = kalan", async () => {
    const f = await seed(50000);
    await grant(f.storeId, f.customerId, 30000n, "g2"); // 300 < 500
    const r = await apply(f);
    expect(r.applied).toBe(true);
    if (r.applied) {
      expect(r.creditUsedMinor).toBe(30000n);
      expect(r.fullyPaid).toBe(false);
      expect(r.externalPayableMinor).toBe(20000n);
    }
    const ord = await prisma.order.findUniqueOrThrow({
      where: { id: f.orderId },
      select: { paymentStatus: true, shoppingCreditUsedMinor: true, externalPaymentAmountMinor: true },
    });
    expect(ord.paymentStatus).toBe("UNPAID"); // kalan PSP'ye
    expect(ord.shoppingCreditUsedMinor).toBe(30000n);
    expect(ord.externalPaymentAmountMinor).toBe(20000n);
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(0n);
  });

  it("cancellation restore: tam-credit ödemesi bakiyeye geri (mixed değil)", async () => {
    const f = await seed(30000);
    await grant(f.storeId, f.customerId, 30000n, "g3");
    await apply(f);
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(0n);
    // İptal restore (F6 çekirdeği).
    const restore = await prisma.$transaction((tx) =>
      restoreCreditForOrderInTx(tx, {
        storeId: f.storeId, customerId: f.customerId, currency: "TRY", orderId: f.orderId,
        ledgerType: "ORDER_CANCELLATION_RESTORE", sourceType: "ORDER_CANCELLATION",
        actor: { type: "SYSTEM", id: null }, description: "credit.cancellationRestore",
      }),
    );
    expect(restore.restoredMinor).toBe(30000n);
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(30000n);
  });

  it("mixed (credit+kart) iptal: prepareCancellationRefund yalnız KART kısmını iade eder (credit hariç)", async () => {
    const f = await seed(100000); // ₺1000
    await grant(f.storeId, f.customerId, 25000n, "gm"); // ₺250 credit
    await apply(f); // credit 250 harcanır → STORE_CREDIT attempt PAID 25000; external 75000
    // Kart ödemesi (external ₺750) PAID attempt olarak eklenir.
    await prisma.paymentAttempt.create({
      data: { storeId: f.storeId, orderId: f.orderId, type: "ONLINE", provider: "MOCK", method: "CARD", amount: 75000, currency: "TRY", status: "PAID", paidAt: new Date() },
    });
    // İptal refund hazırlığı: STORE_CREDIT HÂRİÇ external captured = 75000 → refund yalnız kart.
    const prep = await prisma.$transaction((tx) => prepareCancellationRefund(tx, { storeId: f.storeId, orderId: f.orderId, actorUserId: null }));
    expect(prep.status).toBe("CREATED");
    expect(prep.refundId).toBeTruthy();
    const refund = await prisma.orderRefund.findFirstOrThrow({ where: { orderId: f.orderId }, select: { totalRefundMinor: true, paymentAttemptId: true } });
    expect(refund.totalRefundMinor).toBe(75000); // yalnız kart; credit 250 dahil DEĞİL
    // Referanslanan attempt STORE_CREDIT DEĞİL (kart).
    const refAttempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: refund.paymentAttemptId }, select: { method: true } });
    expect(refAttempt.method).toBe("CARD");
    // Credit kısmı restore ile bakiyeye geri.
    const restore = await prisma.$transaction((tx) =>
      restoreCreditForOrderInTx(tx, {
        storeId: f.storeId, customerId: f.customerId, currency: "TRY", orderId: f.orderId,
        ledgerType: "ORDER_CANCELLATION_RESTORE", sourceType: "ORDER_CANCELLATION",
        actor: { type: "SYSTEM", id: null }, description: "credit.cancellationRestore",
      }),
    );
    expect(restore.restoredMinor).toBe(25000n);
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(25000n);
  });
});
