import { describe, it, expect } from "vitest";
import { resolveRefundCapability } from "../src/refunds/capability.js";
import {
  computeRefundableRemainingMinor,
  isWithinRefundable,
  sumActiveRefundMinor,
  sumSucceededRefundMinor,
  type RefundLedgerRow,
} from "../src/refunds/cap-calc.js";
import { MockRefundPort } from "../src/refunds/mock-refund.js";
import { RefundProviderTimeoutError } from "../src/refunds/provider-port.js";
import { resolveRefundedPaymentStatus } from "../src/payments/payment-state.js";
import { resolveRefundSummaryStatus, isRefundInMotionOrDone } from "../src/refunds/summary-status.js";

describe("resolveRefundCapability (ADR-272 §6)", () => {
  it("MOCK + ONLINE → PROVIDER_AUTOMATIC", () => {
    const cap = resolveRefundCapability({ type: "ONLINE", provider: "MOCK", method: "CARD", manualMethod: null });
    expect(cap.mode).toBe("PROVIDER_AUTOMATIC");
    expect(cap.reason).toBe("PROVIDER_AUTOMATIC");
    expect(cap.supportsPartialRefund).toBe(true);
  });

  it("gerçek online provider (STRIPE) → MANUAL_OFFLINE (otomatik yok; sahte başarı üretilmez)", () => {
    const cap = resolveRefundCapability({ type: "ONLINE", provider: "STRIPE", method: "CARD", manualMethod: null });
    expect(cap.mode).toBe("MANUAL_OFFLINE");
    expect(cap.reason).toBe("PROVIDER_AUTOMATIC_UNSUPPORTED");
    expect(cap.supportsRefund).toBe(true);
  });

  it("MANUAL/offline tahsilat → MANUAL_OFFLINE (banka havalesi)", () => {
    const cap = resolveRefundCapability({ type: "MANUAL", provider: null, method: "BANK_TRANSFER", manualMethod: "BANK_TRANSFER" });
    expect(cap.mode).toBe("MANUAL_OFFLINE");
    expect(cap.reason).toBe("MANUAL_OFFLINE_PAYMENT");
    expect(cap.manualMethod).toBe("BANK_TRANSFER");
  });
});

describe("cap-calc (ADR-272 §4 — cap invariant)", () => {
  const rows = (specs: Array<[RefundLedgerRow["status"], number]>): RefundLedgerRow[] =>
    specs.map(([status, totalRefundMinor]) => ({ status, totalRefundMinor, currency: "TRY" }));

  it("reserved = SUCCEEDED + PENDING + PROCESSING; FAILED/CANCELLED serbest", () => {
    const ledger = rows([["SUCCEEDED", 100], ["PENDING", 50], ["PROCESSING", 30], ["FAILED", 999], ["CANCELLED", 999]]);
    expect(sumSucceededRefundMinor(ledger, "TRY")).toBe(100);
    expect(sumActiveRefundMinor(ledger, "TRY")).toBe(80);
    expect(computeRefundableRemainingMinor(1000, ledger, "TRY")).toBe(1000 - 180);
  });

  it("farklı currency toplanmaz (FX yok)", () => {
    const ledger: RefundLedgerRow[] = [
      { status: "SUCCEEDED", totalRefundMinor: 100, currency: "USD" },
      { status: "SUCCEEDED", totalRefundMinor: 40, currency: "TRY" },
    ];
    expect(sumSucceededRefundMinor(ledger, "TRY")).toBe(40);
  });

  it("isWithinRefundable: pozitif ve kalanı aşmayan", () => {
    expect(isWithinRefundable(50, 100)).toBe(true);
    expect(isWithinRefundable(100, 100)).toBe(true);
    expect(isWithinRefundable(101, 100)).toBe(false);
    expect(isWithinRefundable(0, 100)).toBe(false);
  });
});

describe("resolveRefundedPaymentStatus (ADR-272 §8 — projeksiyon)", () => {
  it("tam iade (>=captured) → REFUNDED", () => {
    expect(resolveRefundedPaymentStatus("PAID", 1000, 1000)).toBe("REFUNDED");
  });
  it("kısmi iade (0<..<captured) → PARTIALLY_REFUNDED", () => {
    expect(resolveRefundedPaymentStatus("PAID", 1000, 400)).toBe("PARTIALLY_REFUNDED");
  });
  it("zaten REFUNDED → değişmez (monotonic)", () => {
    expect(resolveRefundedPaymentStatus("REFUNDED", 1000, 1000)).toBeNull();
  });
  it("refund 0 → değişmez", () => {
    expect(resolveRefundedPaymentStatus("PAID", 1000, 0)).toBeNull();
  });
});

describe("resolveRefundSummaryStatus (ADR-272 — ortak ledger-otoriteli durum)", () => {
  const S = (status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELLED") => ({ status });

  it("intent PENDING, refund yok → INTENT_PENDING (beklemede)", () => {
    expect(
      resolveRefundSummaryStatus({ refunds: [], intentStatus: "PENDING", orderCapturedMinor: 10000, orderSucceededRefundMinor: 0 }),
    ).toBe("INTENT_PENDING");
  });
  it("OrderRefund PROCESSING → PROCESSING", () => {
    expect(
      resolveRefundSummaryStatus({ refunds: [S("PROCESSING")], intentStatus: "CONSUMED", orderCapturedMinor: 10000, orderSucceededRefundMinor: 0 }),
    ).toBe("PROCESSING");
  });
  it("SUCCEEDED + order tam iade → SUCCEEDED", () => {
    expect(
      resolveRefundSummaryStatus({ refunds: [S("SUCCEEDED")], intentStatus: "CONSUMED", orderCapturedMinor: 10000, orderSucceededRefundMinor: 10000 }),
    ).toBe("SUCCEEDED");
  });
  it("SUCCEEDED ama order kısmi iade → PARTIALLY_SUCCEEDED", () => {
    expect(
      resolveRefundSummaryStatus({ refunds: [S("SUCCEEDED")], intentStatus: "CONSUMED", orderCapturedMinor: 10000, orderSucceededRefundMinor: 6000 }),
    ).toBe("PARTIALLY_SUCCEEDED");
  });
  it("son deneme FAILED, aktif/başarılı yok → FAILED", () => {
    expect(
      resolveRefundSummaryStatus({ refunds: [S("FAILED")], intentStatus: "CONSUMED", orderCapturedMinor: 10000, orderSucceededRefundMinor: 0 }),
    ).toBe("FAILED");
  });
  it("intent CANCELLED, refund yok → CANCELLED", () => {
    expect(
      resolveRefundSummaryStatus({ refunds: [], intentStatus: "CANCELLED", orderCapturedMinor: 10000, orderSucceededRefundMinor: 0 }),
    ).toBe("CANCELLED");
  });
  it("ledger otoritesi: SUCCEEDED, intent PENDING olsa bile SUCCEEDED (beklemede DEĞİL)", () => {
    const st = resolveRefundSummaryStatus({ refunds: [S("SUCCEEDED")], intentStatus: "PENDING", orderCapturedMinor: 8000, orderSucceededRefundMinor: 8000 });
    expect(st).toBe("SUCCEEDED");
    expect(st).not.toBe("INTENT_PENDING");
    expect(isRefundInMotionOrDone(st)).toBe(true);
  });
  it("FAILED sonrası yeni SUCCEEDED (retry) → SUCCEEDED (FAILED ezilir)", () => {
    expect(
      resolveRefundSummaryStatus({ refunds: [S("FAILED"), S("SUCCEEDED")], intentStatus: "CONSUMED", orderCapturedMinor: 10000, orderSucceededRefundMinor: 10000 }),
    ).toBe("SUCCEEDED");
  });
});

describe("MockRefundPort (ADR-272 §6 — deterministik senaryolar)", () => {
  const port = new MockRefundPort();
  const base = { provider: "MOCK" as const, paymentAttemptId: "att1", providerReference: "ref", amountMinor: 100, currency: "TRY", idempotencyKey: "k1" };

  it("default → SUCCEEDED, deterministik providerRefundId", async () => {
    const r = await port.createRefund({ ...base });
    expect(r.outcome).toBe("SUCCEEDED");
    expect(r.providerRefundId).toBe("mockrf_k1");
  });
  it("refund_failure → FAILED", async () => {
    const r = await port.createRefund({ ...base, scenario: "refund_failure" });
    expect(r.outcome).toBe("FAILED");
    expect(r.failureCode).toBe("REFUND_DECLINED");
  });
  it("refund_async → PROCESSING, getRefundStatus → SUCCEEDED", async () => {
    const r = await port.createRefund({ ...base, scenario: "refund_async" });
    expect(r.outcome).toBe("PROCESSING");
    const s = await port.getRefundStatus({ provider: "MOCK", paymentAttemptId: "att1", providerRefundId: r.providerRefundId ?? null, idempotencyKey: "k1", scenario: "refund_async" });
    expect(s.outcome).toBe("SUCCEEDED");
  });
  it("refund_timeout → RefundProviderTimeoutError", async () => {
    await expect(port.createRefund({ ...base, scenario: "refund_timeout" })).rejects.toBeInstanceOf(RefundProviderTimeoutError);
  });
  it("refund_duplicate → sabit providerRefundId (unique guard testi)", async () => {
    const r = await port.createRefund({ ...base, scenario: "refund_duplicate" });
    expect(r.providerRefundId).toBe("mockrf_dup_att1");
  });
});
