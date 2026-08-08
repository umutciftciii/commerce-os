/**
 * TODO-175 (ADR-285/286) — Return refund destination execution · GERÇEK-DB entegrasyon.
 *
 * initiateRefund'ı REFUND_PENDING durumundaki bir ReturnRequest + RefundIntent üzerinde sürer.
 * Kaynak-bazlı split (Re/Rc), INTERNAL_CREDIT (SHOPPING_BALANCE), credit-origin restore, iki-ledger
 * completion ve STORE_CREDIT'in ASLA PSP'ye gitmemesi doğrulanır. DATABASE_URL yoksa SKIP.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@commerce-os/db";
import { createRefundProviderPort } from "../src/refunds/mock-refund.js";
import { initiateRefund } from "../src/refunds/service.js";
import { issueCredit, spendCreditInTx } from "../src/customer-credit/service.js";

const hasDb = Boolean(process.env.DATABASE_URL);
const deps = { providerPort: createRefundProviderPort() };
const created: string[] = [];

type Destination = "ORIGINAL_PAYMENT" | "SHOPPING_BALANCE";

interface Ctx {
  storeId: string;
  customerId: string;
  orderId: string;
  returnRequestId: string;
  refundIntentId: string;
}

/** Order (card externalMinor + spent creditMinor) + REFUND_PENDING ReturnRequest + PENDING RefundIntent. */
async function seedReturnPending(externalMinor: number, creditMinor: number, destination: Destination, refundTotal: number): Promise<Ctx> {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `rdr-store-${sfx}`;
  const customerId = `rdr-cust-${sfx}`;
  const orderId = `rdr-order-${sfx}`;
  const currency = "TRY";
  const total = externalMinor + creditMinor;
  await prisma.store.create({ data: { id: storeId, name: `R ${sfx}`, slug: `rdr-${sfx}` } });
  await prisma.customer.create({ data: { id: customerId, storeId, email: `c-${sfx}@x.test`, firstName: "R", lastName: "C" } });
  await prisma.order.create({
    data: { id: orderId, storeId, customerId, orderNumber: `RDR-${sfx.toUpperCase()}`, customerEmail: `c-${sfx}@x.test`, currency, status: "FULFILLED", paymentStatus: "PAID", subtotalAmount: total, shippingAmount: 0, taxAmount: 0, totalAmount: total },
  });
  let cardAttemptId: string | null = null;
  if (externalMinor > 0) {
    const a = await prisma.paymentAttempt.create({ data: { id: `rdr-card-${sfx}`, storeId, orderId, type: "ONLINE", provider: "MOCK", method: "CARD", amount: externalMinor, currency, status: "PAID" } });
    cardAttemptId = a.id;
  }
  let scAttemptId: string | null = null;
  if (creditMinor > 0) {
    await issueCredit({ storeId, customerId, currency, amountMinor: BigInt(creditMinor), expiryDays: 60, sourceType: "ADMIN_GOODWILL", ledgerType: "ADMIN_GOODWILL_CREDIT", description: "credit.goodwill", actor: { type: "PLATFORM_USER", id: "seed" }, idempotencyKey: `seed:${orderId}` });
    await prisma.$transaction((tx) => spendCreditInTx(tx, { storeId, customerId, currency, requestedMinor: BigInt(creditMinor), orderId, actor: { type: "CUSTOMER", id: customerId }, description: "credit.orderPayment" }));
    const a = await prisma.paymentAttempt.create({ data: { id: `rdr-sc-${sfx}`, storeId, orderId, type: "MANUAL", method: "STORE_CREDIT", amount: creditMinor, currency, status: "PAID", creditLedgerGroupKey: `credit-spend:${orderId}` } });
    scAttemptId = a.id;
  }
  const rr = await prisma.returnRequest.create({
    data: {
      storeId, orderId, customerId, returnNumber: `RN-${sfx.toUpperCase()}`, status: "REFUND_PENDING",
      resolutionType: "REFUND", refundDestination: destination, refundDestinationSelectedBy: "CUSTOMER", refundDestinationSelectedAt: new Date(),
      returnWindowEndsAt: new Date(Date.now() + 7 * 864e5),
    },
    select: { id: true },
  });
  const intent = await prisma.refundIntent.create({
    data: {
      storeId, orderId, returnRequestId: rr.id, currency, status: "PENDING",
      productRefundMinor: refundTotal, shippingRefundMinor: 0, taxRefundMinor: 0, totalRefundMinor: refundTotal,
      paymentAttemptId: cardAttemptId ?? scAttemptId, idempotencyKey: `refund-intent:${rr.id}`,
    },
    select: { id: true },
  });
  created.push(storeId);
  return { storeId, customerId, orderId, returnRequestId: rr.id, refundIntentId: intent.id };
}

const run = (c: Ctx) => initiateRefund({ storeId: c.storeId, refundIntentId: c.refundIntentId, actorUserId: "admin-1" }, deps);
const availableCredit = async (c: Ctx) => {
  const lots = await prisma.customerCreditLot.findMany({ where: { storeId: c.storeId, status: "ACTIVE" }, select: { remainingAmountMinor: true, expiresAt: true } });
  const now = Date.now();
  return lots.filter((l) => l.expiresAt === null || l.expiresAt.getTime() > now).reduce((a, l) => a + l.remainingAmountMinor, 0n);
};
const returnStatus = async (c: Ctx) => (await prisma.returnRequest.findUniqueOrThrow({ where: { id: c.returnRequestId }, select: { status: true } })).status;

describe.skipIf(!hasDb)("TODO-175 return refund destination (integration)", () => {
  afterEach(async () => {
    for (const storeId of created.splice(0)) await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
  });

  it("card-only full return ORIGINAL_PAYMENT → PSP refund, COMPLETED", async () => {
    const c = await seedReturnPending(50000, 0, "ORIGINAL_PAYMENT", 50000);
    const res = await run(c);
    expect(res.ok).toBe(true);
    const refund = await prisma.orderRefund.findFirstOrThrow({ where: { returnRequestId: c.returnRequestId } });
    expect(refund.executionMode).toBe("PROVIDER_AUTOMATIC");
    expect(refund.totalRefundMinor).toBe(50000);
    expect(refund.status).toBe("SUCCEEDED");
    expect(await returnStatus(c)).toBe("COMPLETED");
    expect(await availableCredit(c)).toBe(0n);
  });

  it("card-only full return SHOPPING_BALANCE → INTERNAL_CREDIT + non-expiring credit, COMPLETED, no PSP", async () => {
    const c = await seedReturnPending(50000, 0, "SHOPPING_BALANCE", 50000);
    const res = await run(c);
    expect(res.ok).toBe(true);
    const refund = await prisma.orderRefund.findFirstOrThrow({ where: { returnRequestId: c.returnRequestId } });
    expect(refund.executionMode).toBe("INTERNAL_CREDIT");
    expect(refund.status).toBe("SUCCEEDED");
    const lot = await prisma.customerCreditLot.findFirstOrThrow({ where: { storeId: c.storeId, sourceType: "ORDER_RETURN", expiresAt: null } });
    expect(lot.remainingAmountMinor).toBe(50000n);
    expect(await returnStatus(c)).toBe("COMPLETED");
  });

  it("mixed full return ORIGINAL_PAYMENT → external PSP (Re) + credit-origin restore (Rc)", async () => {
    const c = await seedReturnPending(70000, 30000, "ORIGINAL_PAYMENT", 100000);
    const res = await run(c);
    expect(res.ok).toBe(true);
    const refund = await prisma.orderRefund.findFirstOrThrow({ where: { returnRequestId: c.returnRequestId } });
    expect(refund.totalRefundMinor).toBe(70000); // Re only
    expect(refund.status).toBe("SUCCEEDED");
    // Rc=30000 restored to balance (original lot revived)
    expect(await availableCredit(c)).toBe(30000n);
    expect(await returnStatus(c)).toBe("COMPLETED");
  });

  it("mixed full return SHOPPING_BALANCE → all value to balance (Re non-expiring + Rc restore)", async () => {
    const c = await seedReturnPending(70000, 30000, "SHOPPING_BALANCE", 100000);
    const res = await run(c);
    expect(res.ok).toBe(true);
    const refund = await prisma.orderRefund.findFirstOrThrow({ where: { returnRequestId: c.returnRequestId } });
    expect(refund.executionMode).toBe("INTERNAL_CREDIT");
    expect(refund.totalRefundMinor).toBe(70000);
    expect(await availableCredit(c)).toBe(100000n); // 70000 non-expiring + 30000 restored
    expect(await returnStatus(c)).toBe("COMPLETED");
  });

  it("partial mixed return ORIGINAL_PAYMENT → proportional split", async () => {
    // 70000 card + 30000 credit; partial refund 20000 → Re=14000 card, Rc=6000 credit
    const c = await seedReturnPending(70000, 30000, "ORIGINAL_PAYMENT", 20000);
    const res = await run(c);
    expect(res.ok).toBe(true);
    const refund = await prisma.orderRefund.findFirstOrThrow({ where: { returnRequestId: c.returnRequestId } });
    expect(refund.totalRefundMinor).toBe(14000);
    expect(await availableCredit(c)).toBe(6000n);
  });

  it("partial mixed return SHOPPING_BALANCE → full partial amount to balance", async () => {
    const c = await seedReturnPending(70000, 30000, "SHOPPING_BALANCE", 20000);
    const res = await run(c);
    expect(res.ok).toBe(true);
    // Re=14000 non-expiring + Rc=6000 restore = 20000 to balance
    expect(await availableCredit(c)).toBe(20000n);
  });

  it("credit-only return: store-credit-origin NEVER cashes out (no PSP, no external refund)", async () => {
    const c = await seedReturnPending(0, 40000, "SHOPPING_BALANCE", 40000);
    const res = await run(c);
    expect(res.ok).toBe(true);
    // No external attempt → no OrderRefund; credit restored to balance
    expect(await prisma.orderRefund.count({ where: { returnRequestId: c.returnRequestId } })).toBe(0);
    expect(await availableCredit(c)).toBe(40000n);
    expect(await returnStatus(c)).toBe("COMPLETED");
  });

  it("repeated execution is safe (no double refund)", async () => {
    const c = await seedReturnPending(50000, 0, "SHOPPING_BALANCE", 50000);
    await run(c);
    const second = await run(c);
    // Second call: refund already active/succeeded → rejected or deduped; no second money movement.
    expect(await prisma.orderRefund.count({ where: { returnRequestId: c.returnRequestId } })).toBe(1);
    void second;
  });
});
