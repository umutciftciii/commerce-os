import { describe, expect, it } from "vitest";
import type { CampaignCouponRecord, CampaignRecord } from "../src/campaigns/data.js";
import {
  campaignAppliesToProduct,
  isBadgeEligible,
  selectPublicCampaignBadge,
} from "../src/campaigns/public-badge.js";

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
    name: "Sepette %10 İndirim",
    description: null,
    status: "ACTIVE",
    type: "AUTOMATIC_CART",
    discountType: "PERCENT",
    discountValue: 10,
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
    coupons: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const PRODUCT = { id: "prod-1", categoryIds: ["cat-1"] };

describe("isBadgeEligible", () => {
  it("ACTIVE + public + penceresiz otomatik kampanya uygundur", () => {
    expect(isBadgeEligible(campaign(), NOW)).toBe(true);
  });

  it("PAUSED/DRAFT/ARCHIVED kampanya rozet uretmez", () => {
    for (const status of ["PAUSED", "DRAFT", "ARCHIVED"] as const) {
      expect(isBadgeEligible(campaign({ status }), NOW)).toBe(false);
    }
  });

  it("isPublic=false kampanya public projeksiyona girmez", () => {
    expect(isBadgeEligible(campaign({ isPublic: false }), NOW)).toBe(false);
    expect(
      isBadgeEligible(
        campaign({ type: "COUPON_CODE", isPublic: false, coupons: [coupon()] }),
        NOW,
      ),
    ).toBe(false);
  });

  it("startsAt/endsAt penceresine uyulur", () => {
    expect(
      isBadgeEligible(campaign({ startsAt: new Date("2026-07-02T00:00:00Z") }), NOW),
    ).toBe(false);
    expect(
      isBadgeEligible(campaign({ endsAt: new Date("2026-06-30T00:00:00Z") }), NOW),
    ).toBe(false);
    expect(
      isBadgeEligible(
        campaign({
          startsAt: new Date("2026-06-01T00:00:00Z"),
          endsAt: new Date("2026-08-01T00:00:00Z"),
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it("toplam kullanim limiti dolan kampanya rozet uretmez", () => {
    expect(isBadgeEligible(campaign({ totalUsageLimit: 5, usageCount: 5 }), NOW)).toBe(false);
  });

  it("kupon kampanyasinda ACTIVE kupon yoksa rozet uretilmez", () => {
    expect(isBadgeEligible(campaign({ type: "COUPON_CODE", coupons: [] }), NOW)).toBe(false);
    expect(
      isBadgeEligible(
        campaign({ type: "COUPON_CODE", coupons: [coupon({ status: "PAUSED" })] }),
        NOW,
      ),
    ).toBe(false);
    expect(
      isBadgeEligible(campaign({ type: "COUPON_CODE", coupons: [coupon()] }), NOW),
    ).toBe(true);
  });

  it("desteklenmeyen tipler (BUY_X_GET_Y vb.) rozet uretmez", () => {
    expect(isBadgeEligible(campaign({ type: "BUY_X_GET_Y" }), NOW)).toBe(false);
    expect(isBadgeEligible(campaign({ type: "FREE_SHIPPING" }), NOW)).toBe(false);
  });
});

describe("campaignAppliesToProduct", () => {
  it("bos kapsam tum urunlere uygulanir", () => {
    expect(campaignAppliesToProduct(campaign(), PRODUCT)).toBe(true);
  });

  it("urun kapsami eslesmesi", () => {
    expect(campaignAppliesToProduct(campaign({ productIds: ["prod-1"] }), PRODUCT)).toBe(true);
    expect(campaignAppliesToProduct(campaign({ productIds: ["prod-2"] }), PRODUCT)).toBe(false);
  });

  it("kategori kapsami eslesmesi", () => {
    expect(campaignAppliesToProduct(campaign({ categoryIds: ["cat-1"] }), PRODUCT)).toBe(true);
    expect(campaignAppliesToProduct(campaign({ categoryIds: ["cat-9"] }), PRODUCT)).toBe(false);
  });
});

describe("selectPublicCampaignBadge", () => {
  it("uygun kampanya yoksa null doner", () => {
    expect(selectPublicCampaignBadge([campaign({ status: "PAUSED" })], PRODUCT, NOW)).toBeNull();
  });

  it("allowlist projeksiyon doner; ic alanlar tasinmaz", () => {
    const badge = selectPublicCampaignBadge(
      [campaign({ minOrderAmountMinor: 100000 })],
      PRODUCT,
      NOW,
    );
    expect(badge).toEqual({
      kind: "AUTOMATIC",
      discountType: "PERCENT",
      discountValue: 10,
      minOrderAmountMinor: 100000,
    });
    // Ic alanlar (id/priority/usage) projeksiyona sizmaz.
    expect(badge && "id" in badge).toBe(false);
    expect(badge && "priority" in badge).toBe(false);
    expect(badge && "usageCount" in badge).toBe(false);
  });

  it("kupon kampanyasi COUPON kind doner", () => {
    const badge = selectPublicCampaignBadge(
      [
        campaign({
          id: "camp-c",
          type: "COUPON_CODE",
          discountType: "FIXED_AMOUNT",
          discountValue: 25000,
          coupons: [coupon()],
        }),
      ],
      PRODUCT,
      NOW,
    );
    expect(badge?.kind).toBe("COUPON");
    expect(badge?.discountValue).toBe(25000);
  });

  it("secim deterministik: once priority DESC, sonra id ASC", () => {
    const low = campaign({ id: "a-camp", priority: 0, discountValue: 5 });
    const high = campaign({ id: "z-camp", priority: 10, discountValue: 20 });
    expect(selectPublicCampaignBadge([low, high], PRODUCT, NOW)?.discountValue).toBe(20);

    const tieA = campaign({ id: "a-camp", discountValue: 5 });
    const tieB = campaign({ id: "b-camp", discountValue: 15 });
    expect(selectPublicCampaignBadge([tieB, tieA], PRODUCT, NOW)?.discountValue).toBe(5);
  });

  it("kapsam disi kampanya secilmez", () => {
    const scoped = campaign({ id: "scoped", type: "PRODUCT_DISCOUNT", productIds: ["prod-9"] });
    expect(selectPublicCampaignBadge([scoped], PRODUCT, NOW)).toBeNull();
  });
});
