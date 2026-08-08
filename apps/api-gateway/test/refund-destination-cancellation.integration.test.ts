/**
 * TODO-175 (ADR-285/286) — Cancellation refund destination · GERÇEK-DB entegrasyon.
 *
 * DATABASE_URL yoksa SKIP. Her test kendi store'unu seed'ler + store.delete cascade cleanup
 * (enterprise-demo'ya DOKUNMAZ). MOCK refund provider → PROVIDER_AUTOMATIC SUCCEEDED.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@commerce-os/db";
import { createRefundProviderPort } from "../src/refunds/mock-refund.js";
import { cancelCustomerOrder } from "../src/orders/cancellation/service.js";
import { issueCredit, spendCreditInTx } from "../src/customer-credit/service.js";

const hasDb = Boolean(process.env.DATABASE_URL);
const deps = { providerPort: createRefundProviderPort() };
const created: string[] = [];

interface Seed {
  storeId: string;
  customerId: string;
  orderId: string;
  orderNumber: string;
}

/** externalMinor = CARD attempt; creditMinor = issue+spend (ORDER_PAYMENT_DEBIT + STORE_CREDIT attempt). */
async function seedOrder(externalMinor: number, creditMinor: number): Promise<Seed> {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `rdc-store-${sfx}`;
  const customerId = `rdc-cust-${sfx}`;
  const orderId = `rdc-order-${sfx}`;
  const orderNumber = `RDC-${sfx.toUpperCase()}`;
  const currency = "TRY";
  const total = externalMinor + creditMinor;
  await prisma.store.create({ data: { id: storeId, name: `R ${sfx}`, slug: `rdc-${sfx}` } });
  await prisma.customer.create({ data: { id: customerId, storeId, email: `c-${sfx}@x.test`, firstName: "R", lastName: "C" } });
  await prisma.order.create({
    data: {
      id: orderId, storeId, customerId, orderNumber, customerEmail: `c-${sfx}@x.test`, currency,
      status: "PLACED", paymentStatus: "PAID", subtotalAmount: total, shippingAmount: 0, taxAmount: 0,
      totalAmount: total, placedAt: new Date(),
    },
  });
  if (externalMinor > 0) {
    await prisma.paymentAttempt.create({
      data: { id: `rdc-card-${sfx}`, storeId, orderId, type: "ONLINE", provider: "MOCK", method: "CARD", amount: externalMinor, currency, status: "PAID" },
    });
  }
  if (creditMinor > 0) {
    await issueCredit({
      storeId, customerId, currency, amountMinor: BigInt(creditMinor), expiryDays: 60,
      sourceType: "ADMIN_GOODWILL", ledgerType: "ADMIN_GOODWILL_CREDIT", description: "credit.goodwill",
      actor: { type: "PLATFORM_USER", id: "seed" }, idempotencyKey: `seed-credit:${orderId}`,
    });
    await prisma.$transaction((tx) =>
      spendCreditInTx(tx, { storeId, customerId, currency, requestedMinor: BigInt(creditMinor), orderId, actor: { type: "CUSTOMER", id: customerId }, description: "credit.orderPayment" }),
    );
    await prisma.paymentAttempt.create({
      data: { id: `rdc-sc-${sfx}`, storeId, orderId, type: "MANUAL", method: "STORE_CREDIT", amount: creditMinor, currency, status: "PAID", creditLedgerGroupKey: `credit-spend:${orderId}` },
    });
  }
  created.push(storeId);
  return { storeId, customerId, orderId, orderNumber };
}

const cancel = (s: Seed, refundDestination?: "ORIGINAL_PAYMENT" | "SHOPPING_BALANCE") =>
  cancelCustomerOrder({ storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "CHANGED_MIND", refundDestination }, deps);

const availableCredit = async (s: Seed) => {
  const lots = await prisma.customerCreditLot.findMany({ where: { storeId: s.storeId, status: "ACTIVE" }, select: { remainingAmountMinor: true, expiresAt: true } });
  const now = Date.now();
  return lots.filter((l) => l.expiresAt === null || l.expiresAt.getTime() > now).reduce((a, l) => a + l.remainingAmountMinor, 0n);
};

describe.skipIf(!hasDb)("TODO-175 cancellation refund destination (integration)", () => {
  afterEach(async () => {
    for (const storeId of created.splice(0)) await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
  });

  it("card-only ORIGINAL_PAYMENT → PSP refund (PROVIDER_AUTOMATIC), no credit issued", async () => {
    const s = await seedOrder(70000, 0);
    const res = await cancel(s, "ORIGINAL_PAYMENT");
    expect(res.ok).toBe(true);
    const refund = await prisma.orderRefund.findFirstOrThrow({ where: { orderId: s.orderId } });
    expect(refund.executionMode).toBe("PROVIDER_AUTOMATIC");
    expect(refund.refundDestination).toBe("ORIGINAL_PAYMENT");
    expect(refund.totalRefundMinor).toBe(70000);
    expect(refund.status).toBe("SUCCEEDED"); // mock provider settles post-commit
    expect(await availableCredit(s)).toBe(0n);
  });

  it("card-only SHOPPING_BALANCE → INTERNAL_CREDIT SUCCEEDED + non-expiring credit, no PSP", async () => {
    const s = await seedOrder(70000, 0);
    const res = await cancel(s, "SHOPPING_BALANCE");
    expect(res.ok).toBe(true);
    const refund = await prisma.orderRefund.findFirstOrThrow({ where: { orderId: s.orderId } });
    expect(refund.executionMode).toBe("INTERNAL_CREDIT");
    expect(refund.refundDestination).toBe("SHOPPING_BALANCE");
    expect(refund.status).toBe("SUCCEEDED");
    const lot = await prisma.customerCreditLot.findFirstOrThrow({ where: { storeId: s.storeId, sourceType: "ORDER_CANCELLATION", expiresAt: null } });
    expect(lot.remainingAmountMinor).toBe(70000n);
    expect(await availableCredit(s)).toBe(70000n);
  });

  it("mixed ORIGINAL_PAYMENT → external PSP refund + credit-origin restored to balance", async () => {
    const s = await seedOrder(70000, 30000);
    expect(await availableCredit(s)).toBe(0n); // credit spent
    const res = await cancel(s, "ORIGINAL_PAYMENT");
    expect(res.ok).toBe(true);
    const refund = await prisma.orderRefund.findFirstOrThrow({ where: { orderId: s.orderId } });
    expect(refund.executionMode).toBe("PROVIDER_AUTOMATIC");
    expect(refund.totalRefundMinor).toBe(70000); // only external portion
    // credit-origin restored (cancellation restore → original lot revived)
    expect(await availableCredit(s)).toBe(30000n);
  });

  it("mixed SHOPPING_BALANCE → external→balance + credit restore = full balance", async () => {
    const s = await seedOrder(70000, 30000);
    const res = await cancel(s, "SHOPPING_BALANCE");
    expect(res.ok).toBe(true);
    const refund = await prisma.orderRefund.findFirstOrThrow({ where: { orderId: s.orderId } });
    expect(refund.executionMode).toBe("INTERNAL_CREDIT");
    expect(refund.totalRefundMinor).toBe(70000);
    // external 70000 → non-expiring credit; credit 30000 → original lot restore ⇒ 100000 balance
    expect(await availableCredit(s)).toBe(100000n);
  });

  it("credit-only ORIGINAL_PAYMENT → INVALID_DESTINATION (no silent fallback)", async () => {
    const s = await seedOrder(0, 30000);
    const res = await cancel(s, "ORIGINAL_PAYMENT");
    expect(res).toMatchObject({ ok: false, code: "INVALID_DESTINATION" });
  });

  it("credit-only SHOPPING_BALANCE → credit restored, no external refund", async () => {
    const s = await seedOrder(0, 30000);
    const res = await cancel(s, "SHOPPING_BALANCE");
    expect(res.ok).toBe(true);
    // No external → no OrderRefund; credit-origin restored to original lot
    const refundCount = await prisma.orderRefund.count({ where: { orderId: s.orderId } });
    expect(refundCount).toBe(0);
    expect(await availableCredit(s)).toBe(30000n);
  });

  it("duplicate cancellation is idempotent (no double refund/credit)", async () => {
    const s = await seedOrder(70000, 0);
    await cancel(s, "SHOPPING_BALANCE");
    const second = await cancel(s, "SHOPPING_BALANCE");
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.alreadyCancelled).toBe(true);
    expect(await prisma.orderRefund.count({ where: { orderId: s.orderId } })).toBe(1);
    expect(await availableCredit(s)).toBe(70000n);
  });
});
