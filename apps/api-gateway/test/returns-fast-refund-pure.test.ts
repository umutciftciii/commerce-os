import { describe, it, expect } from "vitest";
import {
  FAST_REFUND_SOURCE_STATUSES,
  deriveSkippedSteps,
  evaluateFastRefundEligibility,
  type FastRefundEligibilityInput,
} from "../src/returns/fast-refund";

/**
 * TODO-172 (ADR-273) — Fast Refund Controls SAF uygunluk kuralı. DB/provider çağrısı YOK.
 * Limit semantiği (null=kapalı, sınırsız DEĞİL), kaynak durum allowlist, currency eşleşme,
 * intent PENDING, resolution refund — hepsi burada fail-closed doğrulanır.
 */

const base: FastRefundEligibilityInput = {
  status: "AWAITING_SHIPMENT",
  resolutionType: "REFUND_TO_ORIGINAL_PAYMENT",
  intentStatus: "PENDING",
  settings: { enabled: true, maxAmountMinor: 100000n, currency: null },
  orderCurrency: "TRY",
  refundTotalMinor: 50000,
};

describe("evaluateFastRefundEligibility (ADR-273)", () => {
  it("allows AWAITING_SHIPMENT source within limit (approved, not yet received)", () => {
    expect(evaluateFastRefundEligibility(base)).toEqual({ ok: true });
  });

  it("allows RECEIVED source within limit", () => {
    expect(evaluateFastRefundEligibility({ ...base, status: "RECEIVED" })).toEqual({ ok: true });
  });

  it("rejects when feature disabled (fail-closed)", () => {
    const r = evaluateFastRefundEligibility({
      ...base,
      settings: { ...base.settings, enabled: false },
    });
    expect(r).toEqual({ ok: false, code: "FAST_REFUND_DISABLED" });
  });

  it("rejects when limit is null — disabled, NOT unlimited", () => {
    const r = evaluateFastRefundEligibility({
      ...base,
      settings: { enabled: true, maxAmountMinor: null, currency: null },
    });
    expect(r).toEqual({ ok: false, code: "FAST_REFUND_LIMIT_NOT_SET" });
  });

  it("rejects a source status outside AWAITING_SHIPMENT/RECEIVED (e.g. REQUESTED)", () => {
    const r = evaluateFastRefundEligibility({ ...base, status: "REQUESTED" });
    expect(r).toEqual({ ok: false, code: "FAST_REFUND_INVALID_STATE" });
  });

  it("rejects APPROVED (transient/unreachable) + RETURN_SHIPPED (in transit) + INSPECTION_REQUIRED", () => {
    for (const status of ["APPROVED", "RETURN_SHIPPED", "INSPECTION_REQUIRED"] as const) {
      const r = evaluateFastRefundEligibility({ ...base, status });
      expect(r).toEqual({ ok: false, code: "FAST_REFUND_INVALID_STATE" });
    }
  });

  it("rejects REFUND_PENDING/COMPLETED source (idempotency at eligibility layer)", () => {
    for (const status of ["REFUND_PENDING", "COMPLETED"] as const) {
      const r = evaluateFastRefundEligibility({ ...base, status });
      expect(r).toEqual({ ok: false, code: "FAST_REFUND_INVALID_STATE" });
    }
  });

  it("rejects non-refund resolution (REPLACEMENT)", () => {
    const r = evaluateFastRefundEligibility({ ...base, resolutionType: "REPLACEMENT" });
    expect(r).toEqual({ ok: false, code: "NOT_REFUND_RESOLUTION" });
  });

  it("rejects when intent is not PENDING (CONSUMED/CANCELLED/null)", () => {
    for (const intentStatus of ["CONSUMED", "CANCELLED", "PROCESSED", null] as const) {
      const r = evaluateFastRefundEligibility({ ...base, intentStatus });
      expect(r).toEqual({ ok: false, code: "FAST_REFUND_INTENT_NOT_PENDING" });
    }
  });

  it("accepts amount exactly equal to limit (boundary inclusive)", () => {
    expect(
      evaluateFastRefundEligibility({ ...base, refundTotalMinor: 100000 }),
    ).toEqual({ ok: true });
  });

  it("rejects amount above limit → FAST_REFUND_LIMIT_EXCEEDED (force normal flow)", () => {
    const r = evaluateFastRefundEligibility({ ...base, refundTotalMinor: 100001 });
    expect(r).toEqual({ ok: false, code: "FAST_REFUND_LIMIT_EXCEEDED" });
  });

  it("rejects when explicit limit currency mismatches order currency", () => {
    const r = evaluateFastRefundEligibility({
      ...base,
      settings: { enabled: true, maxAmountMinor: 100000n, currency: "USD" },
      orderCurrency: "TRY",
    });
    expect(r).toEqual({ ok: false, code: "FAST_REFUND_CURRENCY_MISMATCH" });
  });

  it("allows when explicit limit currency matches order currency", () => {
    expect(
      evaluateFastRefundEligibility({
        ...base,
        settings: { enabled: true, maxAmountMinor: 100000n, currency: "TRY" },
        orderCurrency: "TRY",
      }),
    ).toEqual({ ok: true });
  });

  it("check order is deterministic: disabled beats every other failure", () => {
    // enabled=false + invalid state + over limit → still reports DISABLED first (config gate first).
    const r = evaluateFastRefundEligibility({
      ...base,
      status: "REQUESTED",
      refundTotalMinor: 999999,
      settings: { enabled: false, maxAmountMinor: null, currency: null },
    });
    expect(r).toEqual({ ok: false, code: "FAST_REFUND_DISABLED" });
  });
});

describe("deriveSkippedSteps (ADR-273)", () => {
  it("AWAITING_SHIPMENT skips customer shipment + store receipt + inspection", () => {
    expect(deriveSkippedSteps("AWAITING_SHIPMENT")).toEqual([
      "CUSTOMER_RETURN_SHIPMENT",
      "STORE_RECEIPT",
      "INSPECTION",
    ]);
  });

  it("RECEIVED skips only inspection", () => {
    expect(deriveSkippedSteps("RECEIVED")).toEqual(["INSPECTION"]);
  });
});

describe("FAST_REFUND_SOURCE_STATUSES", () => {
  it("is exactly AWAITING_SHIPMENT + RECEIVED (no APPROVED/in-transit states)", () => {
    expect([...FAST_REFUND_SOURCE_STATUSES].sort()).toEqual(["AWAITING_SHIPMENT", "RECEIVED"]);
  });
});
