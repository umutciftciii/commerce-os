/**
 * TODO-170 (ADR-272) — Refund Ledger GERÇEK-DB entegrasyon + concurrency testleri.
 *
 * CALISTIRMA: DATABASE_URL=postgresql://commerce_os:commerce_os_password@localhost:5432/commerce_os_test?schema=public
 * verilmezse SKIP (CI-safe). returns-db.ts kalibi: paylasilan prisma singleton + store.delete cascade cleanup.
 */
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@commerce-os/db";
import { hasTestDb, seedDeliveredOrder, type SeededOrder } from "./helpers/returns-db.js";
import {
  cancelRefund,
  completeManualRefund,
  getOrderRefundContext,
  initiateRefund,
  refreshRefundStatus,
  retryRefund,
} from "../src/refunds/service.js";
import { createRefundProviderPort } from "../src/refunds/mock-refund.js";
import { createFinanceData } from "../src/finance/data.js";

const deps = { providerPort: createRefundProviderPort() };

interface RefundFixture extends SeededOrder {
  returnId: string;
  refundIntentId: string;
  paymentAttemptId: string;
  totalRefundMinor: number;
}

/**
 * REFUND_PENDING durumunda, PENDING RefundIntent'li, MOCK PAID attempt'li bir iade hazirlar.
 * scenario attempt.scenario'ya yazilir (MOCK refund senaryo kontrolu). provider default MOCK.
 */
async function seedRefundReady(opts: {
  scenario?: string | null;
  provider?: "MOCK" | null;
  totalRefundMinor?: number;
  capturedMinor?: number;
  currency?: string;
  attemptCurrency?: string;
} = {}): Promise<RefundFixture> {
  const totalRefundMinor = opts.totalRefundMinor ?? 10000;
  const captured = opts.capturedMinor ?? 10000;
  const currency = opts.currency ?? "TRY";
  const base = await seedDeliveredOrder({ withPaidPayment: false, unitPriceMinor: captured });
  const sfx = randomUUID().slice(0, 12);
  const attempt = await prisma.paymentAttempt.create({
    data: {
      id: `rf-pay-${sfx}`,
      storeId: base.storeId,
      orderId: base.orderId,
      type: opts.provider === null ? "MANUAL" : "ONLINE",
      provider: opts.provider === undefined ? "MOCK" : opts.provider,
      method: opts.provider === null ? "BANK_TRANSFER" : "CARD",
      manualMethod: opts.provider === null ? "BANK_TRANSFER" : null,
      amount: captured,
      currency: opts.attemptCurrency ?? currency,
      status: "PAID",
      scenario: opts.scenario ?? null,
      cardBrand: opts.provider === null ? null : "VISA",
      cardLast4: opts.provider === null ? null : "4242",
    },
  });
  const ret = await prisma.returnRequest.create({
    data: {
      storeId: base.storeId,
      orderId: base.orderId,
      customerId: base.customerId,
      returnNumber: `RRF-${sfx}`,
      status: "REFUND_PENDING",
      resolutionType: "REFUND_TO_ORIGINAL_PAYMENT",
      returnWindowEndsAt: new Date(Date.now() + 7 * 86400000),
      items: {
        create: { storeId: base.storeId, orderLineId: base.orderLineId, quantity: 1, reason: "DEFECTIVE_OR_NOT_WORKING" },
      },
    },
  });
  const intent = await prisma.refundIntent.create({
    data: {
      storeId: base.storeId,
      returnRequestId: ret.id,
      orderId: base.orderId,
      paymentAttemptId: attempt.id,
      currency,
      productRefundMinor: totalRefundMinor,
      shippingRefundMinor: 0,
      taxRefundMinor: Math.round(totalRefundMinor / 6),
      totalRefundMinor,
      status: "PENDING",
      idempotencyKey: `refund-intent:${ret.id}`,
    },
  });
  return { ...base, returnId: ret.id, refundIntentId: intent.id, paymentAttemptId: attempt.id, totalRefundMinor };
}

const fixtures: SeededOrder[] = [];
async function make(opts?: Parameters<typeof seedRefundReady>[0]): Promise<RefundFixture> {
  const f = await seedRefundReady(opts);
  fixtures.push(f);
  return f;
}
afterEach(async () => {
  while (fixtures.length) await fixtures.pop()!.cleanup();
});

describe.skipIf(!hasTestDb)("Refund Ledger (live DB, ADR-272)", () => {
  it("full refund (MOCK success) → SUCCEEDED + intent CONSUMED + return COMPLETED + order projeksiyon", async () => {
    const f = await make();
    const res = await initiateRefund(
      { storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "admin" },
      deps,
    );
    expect(res.ok).toBe(true);
    const refund = await prisma.orderRefund.findFirst({ where: { returnRequestId: f.returnId } });
    expect(refund?.status).toBe("SUCCEEDED");
    expect(refund?.providerRefundId).toBeTruthy();
    const intent = await prisma.refundIntent.findUnique({ where: { id: f.refundIntentId } });
    expect(intent?.status).toBe("CONSUMED");
    const ret = await prisma.returnRequest.findUnique({ where: { id: f.returnId } });
    expect(ret?.status).toBe("COMPLETED");
    const order = await prisma.order.findUnique({ where: { id: f.orderId } });
    expect(order?.paymentStatus).toBe("REFUNDED"); // captured == refund → tam iade
  });

  it("partial refund → order PARTIALLY_REFUNDED, return COMPLETED", async () => {
    const f = await make({ totalRefundMinor: 4000, capturedMinor: 10000 });
    await initiateRefund({ storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "a" }, deps);
    const order = await prisma.order.findUnique({ where: { id: f.orderId } });
    expect(order?.paymentStatus).toBe("PARTIALLY_REFUNDED");
  });

  it("provider failure → FAILED, return REFUND_PENDING kalır, intent CONSUMED", async () => {
    const f = await make({ scenario: "refund_failure" });
    await initiateRefund({ storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "a" }, deps);
    const refund = await prisma.orderRefund.findFirst({ where: { returnRequestId: f.returnId } });
    expect(refund?.status).toBe("FAILED");
    expect(refund?.failureCode).toBe("REFUND_DECLINED");
    const ret = await prisma.returnRequest.findUnique({ where: { id: f.returnId } });
    expect(ret?.status).toBe("REFUND_PENDING");
    const intent = await prisma.refundIntent.findUnique({ where: { id: f.refundIntentId } });
    expect(intent?.status).toBe("CONSUMED");
  });

  it("retry after FAILED → yeni attempt SUCCEEDED, return COMPLETED", async () => {
    const f = await make({ scenario: "refund_failure" });
    await initiateRefund({ storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "a" }, deps);
    const failed = await prisma.orderRefund.findFirst({ where: { returnRequestId: f.returnId } });
    // Senaryoyu başarıya çevir (retry gerçek başarı denesin).
    await prisma.paymentAttempt.update({ where: { id: f.paymentAttemptId }, data: { scenario: null } });
    const res = await retryRefund({ storeId: f.storeId, refundId: failed!.id, expectedVersion: failed!.version, actorUserId: "a" }, deps);
    expect(res.ok).toBe(true);
    const refunds = await prisma.orderRefund.findMany({ where: { returnRequestId: f.returnId }, orderBy: { createdAt: "asc" } });
    expect(refunds.length).toBe(2);
    expect(refunds[0].status).toBe("FAILED");
    expect(refunds[1].status).toBe("SUCCEEDED");
    const ret = await prisma.returnRequest.findUnique({ where: { id: f.returnId } });
    expect(ret?.status).toBe("COMPLETED");
  });

  it("async accept → PROCESSING; refresh reconciliation → SUCCEEDED", async () => {
    const f = await make({ scenario: "refund_async" });
    await initiateRefund({ storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "a" }, deps);
    let refund = await prisma.orderRefund.findFirst({ where: { returnRequestId: f.returnId } });
    expect(refund?.status).toBe("PROCESSING");
    await refreshRefundStatus({ storeId: f.storeId, refundId: refund!.id, actorUserId: "a" }, deps);
    refund = await prisma.orderRefund.findFirst({ where: { returnRequestId: f.returnId } });
    expect(refund?.status).toBe("SUCCEEDED");
  });

  it("timeout → PROCESSING (unknown, kör retry yok); refresh → SUCCEEDED", async () => {
    const f = await make({ scenario: "refund_timeout" });
    await initiateRefund({ storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "a" }, deps);
    let refund = await prisma.orderRefund.findFirst({ where: { returnRequestId: f.returnId } });
    expect(refund?.status).toBe("PROCESSING"); // unknown → PROCESSING (FAILED değil)
    // reconcile: senaryoyu netleştir (gerçek başarı)
    await prisma.paymentAttempt.update({ where: { id: f.paymentAttemptId }, data: { scenario: null } });
    await refreshRefundStatus({ storeId: f.storeId, refundId: refund!.id, actorUserId: "a" }, deps);
    refund = await prisma.orderRefund.findFirst({ where: { returnRequestId: f.returnId } });
    expect(refund?.status).toBe("SUCCEEDED");
  });

  it("concurrent initiate → tam olarak BİR SUCCEEDED refund + intent tek kez consume", async () => {
    const f = await make();
    const [a, b] = await Promise.all([
      initiateRefund({ storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "a" }, deps),
      initiateRefund({ storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "a" }, deps),
    ]);
    const oks = [a, b].filter((r) => r.ok).length;
    expect(oks).toBeGreaterThanOrEqual(1);
    const refunds = await prisma.orderRefund.findMany({ where: { returnRequestId: f.returnId } });
    // Idempotent: aynı intent'ten yalnız BİR refund satırı (dedupe P2002 veya REFUND_ALREADY_ACTIVE).
    expect(refunds.length).toBe(1);
    expect(refunds[0].status).toBe("SUCCEEDED");
  });

  it("cap invariant: kalan aşılırsa EXCEEDS_REFUNDABLE", async () => {
    const f = await make({ totalRefundMinor: 10000, capturedMinor: 10000 });
    await initiateRefund({ storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "a" }, deps);
    // İkinci bir iade (aynı order) — kalan 0 → EXCEEDS_REFUNDABLE.
    const ret2 = await prisma.returnRequest.create({
      data: {
        storeId: f.storeId, orderId: f.orderId, customerId: f.customerId,
        returnNumber: `RRF2-${randomUUID().slice(0, 8)}`, status: "REFUND_PENDING",
        resolutionType: "REFUND_TO_ORIGINAL_PAYMENT", returnWindowEndsAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    const intent2 = await prisma.refundIntent.create({
      data: {
        storeId: f.storeId, returnRequestId: ret2.id, orderId: f.orderId, paymentAttemptId: f.paymentAttemptId,
        currency: "TRY", productRefundMinor: 5000, shippingRefundMinor: 0, taxRefundMinor: 0, totalRefundMinor: 5000,
        status: "PENDING", idempotencyKey: `refund-intent:${ret2.id}`,
      },
    });
    const res = await initiateRefund({ storeId: f.storeId, refundIntentId: intent2.id, expectedReturnVersion: 0, actorUserId: "a" }, deps);
    expect(res).toEqual({ ok: false, code: "EXCEEDS_REFUNDABLE" });
  });

  it("duplicate provider callback (aynı providerRefundId) → ikinci FAILED DUPLICATE (çift para yok)", async () => {
    // İki iade, aynı order, aynı attempt, refund_duplicate → sabit providerRefundId çakışır.
    const f = await make({ scenario: "refund_duplicate", totalRefundMinor: 4000, capturedMinor: 10000 });
    await initiateRefund({ storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "a" }, deps);
    const first = await prisma.orderRefund.findFirst({ where: { returnRequestId: f.returnId } });
    expect(first?.status).toBe("SUCCEEDED");
    const ret2 = await prisma.returnRequest.create({
      data: {
        storeId: f.storeId, orderId: f.orderId, customerId: f.customerId,
        returnNumber: `RRD2-${randomUUID().slice(0, 8)}`, status: "REFUND_PENDING",
        resolutionType: "REFUND_TO_ORIGINAL_PAYMENT", returnWindowEndsAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    const intent2 = await prisma.refundIntent.create({
      data: {
        storeId: f.storeId, returnRequestId: ret2.id, orderId: f.orderId, paymentAttemptId: f.paymentAttemptId,
        currency: "TRY", productRefundMinor: 4000, shippingRefundMinor: 0, taxRefundMinor: 0, totalRefundMinor: 4000,
        status: "PENDING", idempotencyKey: `refund-intent:${ret2.id}`,
      },
    });
    await initiateRefund({ storeId: f.storeId, refundIntentId: intent2.id, expectedReturnVersion: 0, actorUserId: "a" }, deps);
    const second = await prisma.orderRefund.findFirst({ where: { returnRequestId: ret2.id } });
    expect(second?.status).toBe("FAILED");
    expect(second?.failureCode).toBe("DUPLICATE_REFUND");
  });

  it("manual bank transfer (MANUAL_OFFLINE) → initiate PENDING, manual-complete → SUCCEEDED + COMPLETED", async () => {
    const f = await make({ provider: null }); // provider null → MANUAL_OFFLINE
    await initiateRefund({ storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "a" }, deps);
    let refund = await prisma.orderRefund.findFirst({ where: { returnRequestId: f.returnId } });
    expect(refund?.status).toBe("PENDING");
    expect(refund?.executionMode).toBe("MANUAL_OFFLINE");
    // Eksik detay → MISSING_MANUAL_DETAILS
    const bad = await completeManualRefund({ storeId: f.storeId, refundId: refund!.id, expectedVersion: refund!.version, manualReference: "", manualNote: "", actorUserId: "a" });
    expect(bad).toEqual({ ok: false, code: "MISSING_MANUAL_DETAILS" });
    const ok = await completeManualRefund({ storeId: f.storeId, refundId: refund!.id, expectedVersion: refund!.version, manualReference: "TR12-DEKONT", manualNote: "Havale yapıldı", actorUserId: "a" });
    expect(ok.ok).toBe(true);
    refund = await prisma.orderRefund.findFirst({ where: { returnRequestId: f.returnId } });
    expect(refund?.status).toBe("SUCCEEDED");
    expect(refund?.manualReference).toBe("TR12-DEKONT");
    const ret = await prisma.returnRequest.findUnique({ where: { id: f.returnId } });
    expect(ret?.status).toBe("COMPLETED");
  });

  it("stale (CANCELLED) intent → STALE_INTENT", async () => {
    const f = await make();
    await prisma.refundIntent.update({ where: { id: f.refundIntentId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    const res = await initiateRefund({ storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "a" }, deps);
    expect(res).toEqual({ ok: false, code: "STALE_INTENT" });
  });

  it("currency mismatch → CURRENCY_MISMATCH", async () => {
    const f = await make({ currency: "TRY", attemptCurrency: "USD" });
    const res = await initiateRefund({ storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "a" }, deps);
    expect(res).toEqual({ ok: false, code: "CURRENCY_MISMATCH" });
  });

  it("stale expectedReturnVersion → VERSION_CONFLICT", async () => {
    const f = await make();
    const res = await initiateRefund({ storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 99, actorUserId: "a" }, deps);
    expect(res).toEqual({ ok: false, code: "VERSION_CONFLICT" });
  });

  it("cancel PENDING manual refund → CANCELLED, rezervasyon serbest (kalan geri döner)", async () => {
    const f = await make({ provider: null, totalRefundMinor: 6000, capturedMinor: 10000 });
    await initiateRefund({ storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "a" }, deps);
    const refund = await prisma.orderRefund.findFirst({ where: { returnRequestId: f.returnId } });
    const before = await getOrderRefundContext(f.storeId, f.orderId);
    expect(before?.refundableRemainingMinor).toBe(4000); // 10000 - 6000 reserved
    await cancelRefund({ storeId: f.storeId, refundId: refund!.id, expectedVersion: refund!.version, reason: "iptal", actorUserId: "a" });
    const after = await getOrderRefundContext(f.storeId, f.orderId);
    expect(after?.refundableRemainingMinor).toBe(10000); // rezervasyon serbest
  });

  it("Financial Reporting: SUCCEEDED refund productRefundsMinor'a düşer; getDailyRows tutar döner", async () => {
    const f = await make({ totalRefundMinor: 4000, capturedMinor: 10000 });
    // Order'ı satış evrenine sok (PLACED) ki finans sorgusu saysın.
    await prisma.order.update({ where: { id: f.orderId }, data: { status: "PLACED", placedAt: new Date() } });
    await initiateRefund({ storeId: f.storeId, refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "a" }, deps);
    const financeData = createFinanceData(prisma);
    const now = new Date();
    const from = new Date(now.getTime() - 2 * 86400000);
    const to = new Date(now.getTime() + 2 * 86400000);
    const rows = await financeData.getDailyRows(
      f.storeId,
      { fromUtc: from, toUtcExclusive: to, timezone: "Europe/Istanbul" } as never,
      {} as never,
    );
    const totalProductRefund = rows.reduce((s, r) => s + r.productRefundsMinor, 0);
    expect(totalProductRefund).toBe(4000);
  });

  it("cross-store initiate → INTENT_NOT_FOUND (tenant izolasyonu)", async () => {
    const f = await make();
    const res = await initiateRefund({ storeId: "other-store", refundIntentId: f.refundIntentId, expectedReturnVersion: 0, actorUserId: "a" }, deps);
    expect(res).toEqual({ ok: false, code: "INTENT_NOT_FOUND" });
  });
});
