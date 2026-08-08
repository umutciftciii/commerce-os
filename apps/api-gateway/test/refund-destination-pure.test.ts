import { describe, it, expect } from "vitest";
import {
  computeRefundSourceSplit,
  resolveDestinationEligibility,
  buildRefundDestinationPreview,
} from "../src/refunds/destination-calc.js";

describe("computeRefundSourceSplit (proportional, residual to credit)", () => {
  it("full refund mixed splits by pool ratio", () => {
    expect(
      computeRefundSourceSplit({ externalRefundableRemaining: 700, creditRestorableRemaining: 300, refundAmountMinor: 1000 }),
    ).toEqual({ externalPortionMinor: 700, creditPortionMinor: 300 });
  });

  it("partial 200 on 300 credit / 700 external -> 140 external + 60 credit", () => {
    expect(
      computeRefundSourceSplit({ externalRefundableRemaining: 700, creditRestorableRemaining: 300, refundAmountMinor: 200 }),
    ).toEqual({ externalPortionMinor: 140, creditPortionMinor: 60 });
  });

  it("card-only order -> all external", () => {
    expect(
      computeRefundSourceSplit({ externalRefundableRemaining: 500, creditRestorableRemaining: 0, refundAmountMinor: 500 }),
    ).toEqual({ externalPortionMinor: 500, creditPortionMinor: 0 });
  });

  it("credit-only order -> all credit", () => {
    expect(
      computeRefundSourceSplit({ externalRefundableRemaining: 0, creditRestorableRemaining: 500, refundAmountMinor: 500 }),
    ).toEqual({ externalPortionMinor: 0, creditPortionMinor: 500 });
  });

  it("rounding residual goes to credit; external floored; never exceeds pools", () => {
    const r = computeRefundSourceSplit({ externalRefundableRemaining: 100, creditRestorableRemaining: 200, refundAmountMinor: 100 });
    expect(r.externalPortionMinor + r.creditPortionMinor).toBe(100);
    expect(r.externalPortionMinor).toBe(33);
    expect(r.creditPortionMinor).toBe(67);
    expect(r.externalPortionMinor).toBeLessThanOrEqual(100);
    expect(r.creditPortionMinor).toBeLessThanOrEqual(200);
  });

  it("external portion capped by external pool, overflow to credit", () => {
    const r = computeRefundSourceSplit({ externalRefundableRemaining: 50, creditRestorableRemaining: 50, refundAmountMinor: 100 });
    expect(r).toEqual({ externalPortionMinor: 50, creditPortionMinor: 50 });
  });

  it("refund clamped to total pool", () => {
    const r = computeRefundSourceSplit({ externalRefundableRemaining: 30, creditRestorableRemaining: 20, refundAmountMinor: 999 });
    expect(r).toEqual({ externalPortionMinor: 30, creditPortionMinor: 20 });
  });

  it("large minor amounts stay exact (BigInt intermediate, no precision loss)", () => {
    const ext = 9_000_000_000,
      credit = 1_000_000_000,
      R = 10_000_000_000;
    const r = computeRefundSourceSplit({ externalRefundableRemaining: ext, creditRestorableRemaining: credit, refundAmountMinor: R });
    expect(r.externalPortionMinor + r.creditPortionMinor).toBe(R);
    expect(r.externalPortionMinor).toBe(9_000_000_000);
  });

  it("rejects non-safe-integer / negative input", () => {
    expect(() =>
      computeRefundSourceSplit({ externalRefundableRemaining: Number.MAX_SAFE_INTEGER + 1, creditRestorableRemaining: 0, refundAmountMinor: 1 }),
    ).toThrow();
    expect(() =>
      computeRefundSourceSplit({ externalRefundableRemaining: -1, creditRestorableRemaining: 0, refundAmountMinor: 1 }),
    ).toThrow();
  });
});

describe("resolveDestinationEligibility", () => {
  it("offers original payment only when external remaining > 0", () => {
    expect(resolveDestinationEligibility({ externalRefundableRemaining: 700, totalRefundableMinor: 1000 })).toEqual({
      offerOriginalPayment: true,
      offerShoppingBalance: true,
    });
    expect(resolveDestinationEligibility({ externalRefundableRemaining: 0, totalRefundableMinor: 300 })).toEqual({
      offerOriginalPayment: false,
      offerShoppingBalance: true,
    });
  });

  it("no refundable -> neither", () => {
    expect(resolveDestinationEligibility({ externalRefundableRemaining: 0, totalRefundableMinor: 0 })).toEqual({
      offerOriginalPayment: false,
      offerShoppingBalance: false,
    });
  });
});

describe("buildRefundDestinationPreview", () => {
  it("assembles split + eligibility for mixed order", () => {
    expect(
      buildRefundDestinationPreview({ externalRefundableRemaining: 700, creditRestorableRemaining: 300, refundAmountMinor: 1000 }),
    ).toEqual({
      totalRefundableMinor: 1000,
      externalComponentMinor: 700,
      creditComponentMinor: 300,
      offerOriginalPayment: true,
      offerShoppingBalance: true,
    });
  });

  it("credit-only order offers only shopping balance", () => {
    expect(
      buildRefundDestinationPreview({ externalRefundableRemaining: 0, creditRestorableRemaining: 500, refundAmountMinor: 500 }),
    ).toEqual({
      totalRefundableMinor: 500,
      externalComponentMinor: 0,
      creditComponentMinor: 500,
      offerOriginalPayment: false,
      offerShoppingBalance: true,
    });
  });
});
