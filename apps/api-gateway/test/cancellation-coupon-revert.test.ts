import { describe, it, expect } from "vitest";
import {
  resolveCouponRevertStatus,
  type CouponRevertEligibilityInput,
} from "../src/campaigns/cancellation-rollback";

const NOW = new Date("2026-08-07T12:00:00Z");
const base: CouponRevertEligibilityInput = {
  campaignStatus: "ACTIVE",
  campaignStartsAt: null,
  campaignEndsAt: null,
  campaignUsageCount: 0,
  campaignTotalUsageLimit: null,
  couponStatus: null,
  couponStartsAt: null,
  couponEndsAt: null,
  couponUsageCount: null,
  couponTotalUsageLimit: null,
  now: NOW,
};

describe("resolveCouponRevertStatus (ADR-277) — no artificial revival", () => {
  it("active campaign, no coupon, no limits → AVAILABLE", () => {
    expect(resolveCouponRevertStatus(base)).toBe("AVAILABLE");
  });

  it("inactive campaign → REVOKED", () => {
    expect(resolveCouponRevertStatus({ ...base, campaignStatus: "PAUSED" })).toBe("REVOKED");
  });

  it("expired campaign (endsAt in past) → REVOKED (not revived)", () => {
    expect(
      resolveCouponRevertStatus({ ...base, campaignEndsAt: new Date("2026-08-01T00:00:00Z") }),
    ).toBe("REVOKED");
  });

  it("not-yet-started campaign (startsAt in future) → REVOKED", () => {
    expect(
      resolveCouponRevertStatus({ ...base, campaignStartsAt: new Date("2026-09-01T00:00:00Z") }),
    ).toBe("REVOKED");
  });

  it("campaign usage limit full (after release still >= limit) → REVOKED (not force-opened)", () => {
    expect(
      resolveCouponRevertStatus({ ...base, campaignUsageCount: 100, campaignTotalUsageLimit: 100 }),
    ).toBe("REVOKED");
  });

  it("campaign under limit after release → AVAILABLE", () => {
    expect(
      resolveCouponRevertStatus({ ...base, campaignUsageCount: 99, campaignTotalUsageLimit: 100 }),
    ).toBe("AVAILABLE");
  });

  it("active campaign + active coupon within window → AVAILABLE", () => {
    expect(
      resolveCouponRevertStatus({
        ...base,
        couponStatus: "ACTIVE",
        couponUsageCount: 5,
        couponTotalUsageLimit: 10,
      }),
    ).toBe("AVAILABLE");
  });

  it("active campaign but inactive coupon → REVOKED", () => {
    expect(resolveCouponRevertStatus({ ...base, couponStatus: "DISABLED" })).toBe("REVOKED");
  });

  it("active campaign but coupon window expired → REVOKED", () => {
    expect(
      resolveCouponRevertStatus({
        ...base,
        couponStatus: "ACTIVE",
        couponEndsAt: new Date("2026-08-01T00:00:00Z"),
      }),
    ).toBe("REVOKED");
  });

  it("active campaign but coupon limit full → REVOKED", () => {
    expect(
      resolveCouponRevertStatus({
        ...base,
        couponStatus: "ACTIVE",
        couponUsageCount: 10,
        couponTotalUsageLimit: 10,
      }),
    ).toBe("REVOKED");
  });

  it("window edge: now exactly at endsAt → REVOKED (endsAt exclusive)", () => {
    expect(resolveCouponRevertStatus({ ...base, campaignEndsAt: NOW })).toBe("REVOKED");
  });

  it("window edge: now exactly at startsAt → AVAILABLE (startsAt inclusive)", () => {
    expect(resolveCouponRevertStatus({ ...base, campaignStartsAt: NOW })).toBe("AVAILABLE");
  });
});
