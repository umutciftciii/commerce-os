import { describe, expect, it } from "vitest";
import type { CampaignCouponRecord, CampaignRecord } from "../src/campaigns/data.js";
import {
  evaluateCouponClaim,
  projectWalletCoupon,
  projectWalletCoupons,
  type WalletCandidate,
} from "../src/campaigns/wallet.js";

const NOW = new Date("2026-07-01T12:00:00Z");

function coupon(overrides: Partial<CampaignCouponRecord> = {}): CampaignCouponRecord {
  return {
    id: "coupon-1",
    code: "TEST250",
    normalizedCode: "TEST250",
    status: "ACTIVE",
    totalUsageLimit: null,
    perCustomerUsageLimit: null,
    usageCount: 0,
    startsAt: null,
    endsAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function campaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "camp-1",
    storeId: "store-1",
    name: "TEST250 Kupon",
    description: null,
    status: "ACTIVE",
    type: "COUPON_CODE",
    discountType: "FIXED_AMOUNT",
    discountValue: 25000,
    maxDiscountAmountMinor: null,
    minOrderAmountMinor: null,
    startsAt: null,
    endsAt: null,
    totalUsageLimit: null,
    perCustomerUsageLimit: null,
    usageCount: 0,
    stackable: false,
    priority: 0,
    isPublic: true,
    productIds: [],
    categoryIds: [],
    coupons: [coupon()],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function candidate(overrides: {
  campaign?: Partial<CampaignRecord>;
  coupon?: Partial<CampaignCouponRecord>;
  source?: WalletCandidate["source"];
} = {}): WalletCandidate {
  const c = campaign(overrides.campaign);
  return {
    campaign: c,
    coupon: coupon(overrides.coupon),
    source: overrides.source ?? "PUBLIC",
  };
}

describe("projectWalletCoupon", () => {
  it("uygun kupon AVAILABLE kart doner (allowlist alanlar)", () => {
    const card = projectWalletCoupon(candidate(), {
      subtotalMinor: 500000,
      appliedNormalizedCode: null,
      now: NOW,
    });
    expect(card).toEqual({
      code: "TEST250",
      discountType: "FIXED_AMOUNT",
      discountValue: 25000,
      minOrderAmountMinor: null,
      endsAt: null,
      state: "AVAILABLE",
      source: "PUBLIC",
    });
  });

  it("uygulanan kod APPLIED durumu verir", () => {
    const card = projectWalletCoupon(candidate(), {
      subtotalMinor: 500000,
      appliedNormalizedCode: "TEST250",
      now: NOW,
    });
    expect(card?.state).toBe("APPLIED");
  });

  it("alt limit karsilanmiyorsa MIN_ORDER_NOT_MET (kart gizlenmez)", () => {
    const card = projectWalletCoupon(
      candidate({ campaign: { minOrderAmountMinor: 100000 } }),
      { subtotalMinor: 50000, appliedNormalizedCode: null, now: NOW },
    );
    expect(card?.state).toBe("MIN_ORDER_NOT_MET");
  });

  it("suresi dolmus kupon EXPIRED", () => {
    const card = projectWalletCoupon(
      candidate({ campaign: { endsAt: new Date("2026-06-01T00:00:00Z") } }),
      { subtotalMinor: 500000, appliedNormalizedCode: null, now: NOW },
    );
    expect(card?.state).toBe("EXPIRED");
  });

  it("pasif/baslamamis/limit dolmus kupon kart uretmez (null)", () => {
    expect(
      projectWalletCoupon(candidate({ coupon: { status: "PAUSED" } }), {
        subtotalMinor: 500000,
        appliedNormalizedCode: null,
        now: NOW,
      }),
    ).toBeNull();
    expect(
      projectWalletCoupon(candidate({ campaign: { startsAt: new Date("2026-07-02T00:00:00Z") } }), {
        subtotalMinor: 500000,
        appliedNormalizedCode: null,
        now: NOW,
      }),
    ).toBeNull();
    expect(
      projectWalletCoupon(candidate({ coupon: { totalUsageLimit: 3, usageCount: 3 } }), {
        subtotalMinor: 500000,
        appliedNormalizedCode: null,
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe("projectWalletCoupons dedup", () => {
  it("ayni kod icin ASSIGNED kaynak PUBLIC'e tercih edilir", () => {
    const cards = projectWalletCoupons(
      [candidate({ source: "PUBLIC" }), candidate({ source: "ASSIGNED" })],
      { subtotalMinor: 500000, appliedNormalizedCode: null, now: NOW },
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.source).toBe("ASSIGNED");
  });

  it("APPLIED durumu digerlerine tercih edilir", () => {
    const cards = projectWalletCoupons(
      [candidate({ source: "PUBLIC" }), candidate({ source: "CLAIMED" })],
      { subtotalMinor: 500000, appliedNormalizedCode: "TEST250", now: NOW },
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.state).toBe("APPLIED");
  });
});

describe("evaluateCouponClaim", () => {
  it("uygun kupon null (hata yok) doner", () => {
    expect(evaluateCouponClaim(coupon(), campaign(), NOW)).toBeNull();
  });

  it("pasif kupon INACTIVE", () => {
    expect(evaluateCouponClaim(coupon({ status: "PAUSED" }), campaign(), NOW)).toBe("INACTIVE");
  });

  it("baslamamis kupon NOT_STARTED", () => {
    expect(
      evaluateCouponClaim(coupon(), campaign({ startsAt: new Date("2026-07-05T00:00:00Z") }), NOW),
    ).toBe("NOT_STARTED");
  });

  it("suresi gecmis kupon EXPIRED", () => {
    expect(
      evaluateCouponClaim(coupon({ endsAt: new Date("2026-06-01T00:00:00Z") }), campaign(), NOW),
    ).toBe("EXPIRED");
  });

  it("limiti dolmus kupon USAGE_LIMIT_REACHED", () => {
    expect(
      evaluateCouponClaim(coupon({ totalUsageLimit: 2, usageCount: 2 }), campaign(), NOW),
    ).toBe("USAGE_LIMIT_REACHED");
  });

  it("alt limit claim'de reddetmez (sepet-zamanli durum)", () => {
    expect(evaluateCouponClaim(coupon(), campaign({ minOrderAmountMinor: 100000 }), NOW)).toBeNull();
  });
});
