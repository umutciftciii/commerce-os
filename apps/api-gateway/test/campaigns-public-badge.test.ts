import { describe, expect, it } from "vitest";
import type { CampaignCouponRecord, CampaignRecord } from "../src/campaigns/data.js";
import {
  campaignAppliesToProduct,
  isBadgeEligible,
  selectPublicCampaignBadge,
  selectPublicCampaignDisplay,
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
    displayTitle: null,
    shortDescription: null,
    terms: null,
    badgeLabel: null,
    badgeVariant: null,
    cardStyle: "STANDARD",
    accessModel: "AUTO_VISIBLE",
    displayPriority: 0,
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

  it("allowlist projeksiyon doner; ic alanlar tasinmaz (F4A.3 taksonomi)", () => {
    const badge = selectPublicCampaignBadge(
      [campaign({ minOrderAmountMinor: 100000 })],
      PRODUCT,
      NOW,
    );
    // F4A.3 — Otomatik kampanya: AUTOMATIC_CART_DISCOUNT, kod gerekmez.
    expect(badge).toEqual({
      kind: "AUTOMATIC",
      displayKind: "AUTOMATIC_CART_DISCOUNT",
      requiresCouponCode: false,
      discountType: "PERCENT",
      discountValue: 10,
      minOrderAmountMinor: 100000,
      couponCode: null,
      couponAction: "MANUAL_ONLY",
      endsAt: null,
      // F4A.6 — Birim fiyat verilmedi (default null) => guvenli tahmin uretilmez.
      estimatedDiscountMinor: null,
      estimatedFinalUnitPriceMinor: null,
      // F4A.4 — Sunum alanlari (ADR-061); fixture varsayilanlariyla null/STANDARD.
      displayTitle: null,
      shortDescription: null,
      badgeLabel: null,
      badgeVariant: null,
      cardStyle: "STANDARD",
      terms: null,
    });
    // Ic alanlar (id/priority/usage) projeksiyona sizmaz.
    expect(badge && "id" in badge).toBe(false);
    expect(badge && "priority" in badge).toBe(false);
    expect(badge && "usageCount" in badge).toBe(false);
    expect(badge && "stackable" in badge).toBe(false);
  });

  it("F4A.4: admin sunum alanlarini rozet projeksiyonuna tasir (allowlist)", () => {
    const badge = selectPublicCampaignBadge(
      [
        campaign({
          displayTitle: "Hafta sonu 500 TL’ye 100 TL kupon",
          shortDescription: "Tüm indirimlere ek fırsat",
          badgeLabel: "Süper Kupon",
          badgeVariant: "SUPER",
          cardStyle: "FEATURED",
          terms: "Stoklarla sınırlıdır.",
        }),
      ],
      PRODUCT,
      NOW,
    );
    expect(badge?.displayTitle).toBe("Hafta sonu 500 TL’ye 100 TL kupon");
    expect(badge?.shortDescription).toBe("Tüm indirimlere ek fırsat");
    expect(badge?.badgeLabel).toBe("Süper Kupon");
    expect(badge?.badgeVariant).toBe("SUPER");
    expect(badge?.cardStyle).toBe("FEATURED");
    expect(badge?.terms).toBe("Stoklarla sınırlıdır.");
  });

  it("F4A.4: sunum alanlari yoksa null doner (UI fallback uretir)", () => {
    const badge = selectPublicCampaignBadge([campaign()], PRODUCT, NOW);
    expect(badge?.displayTitle).toBeNull();
    expect(badge?.badgeLabel).toBeNull();
    expect(badge?.cardStyle).toBe("STANDARD");
  });

  it("otomatik kampanya displayKind=AUTOMATIC_CART_DISCOUNT ve couponCode sizmaz", () => {
    const badge = selectPublicCampaignBadge([campaign()], PRODUCT, NOW);
    expect(badge?.displayKind).toBe("AUTOMATIC_CART_DISCOUNT");
    expect(badge?.requiresCouponCode).toBe(false);
    expect(badge?.couponCode).toBeNull();
  });

  it("public kupon kampanyasi PUBLIC_COUPON + guvenli kod + CLAIM aksiyonu doner", () => {
    const badge = selectPublicCampaignBadge(
      [
        campaign({
          id: "camp-c",
          type: "COUPON_CODE",
          discountType: "FIXED_AMOUNT",
          discountValue: 25000,
          endsAt: new Date("2026-08-01T00:00:00Z"),
          coupons: [coupon()],
        }),
      ],
      PRODUCT,
      NOW,
    );
    expect(badge?.kind).toBe("COUPON");
    expect(badge?.displayKind).toBe("PUBLIC_COUPON");
    expect(badge?.requiresCouponCode).toBe(true);
    expect(badge?.discountValue).toBe(25000);
    // Public + ACTIVE kupon + pencere gecerli => kod guvenle tasinir.
    expect(badge?.couponCode).toBe("TEST250");
    expect(badge?.couponAction).toBe("CLAIM");
    expect(badge?.endsAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("ACTIVE kuponu olmayan kupon kampanyasi rozet uretmez (kod ifsa edilmez)", () => {
    expect(
      selectPublicCampaignBadge(
        [campaign({ type: "COUPON_CODE", coupons: [coupon({ status: "PAUSED" })] })],
        PRODUCT,
        NOW,
      ),
    ).toBeNull();
  });

  it("private (isPublic=false) kupon public projeksiyona ASLA girmez", () => {
    expect(
      selectPublicCampaignBadge(
        [campaign({ type: "COUPON_CODE", isPublic: false, coupons: [coupon()] })],
        PRODUCT,
        NOW,
      ),
    ).toBeNull();
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

// F4A.6 (ADR-062) — Guvenli birim-basi nihai fiyat tahmini.
describe("selectPublicCampaignBadge · guvenli tahmini nihai fiyat", () => {
  it("otomatik PERCENT + birim fiyat + min-order yok => nihai fiyat hesaplanir", () => {
    // %10 x 129900 => round(12990)=12990 indirim; nihai 116910.
    const badge = selectPublicCampaignBadge([campaign({ discountValue: 10 })], PRODUCT, NOW, 129900);
    expect(badge?.estimatedDiscountMinor).toBe(12990);
    expect(badge?.estimatedFinalUnitPriceMinor).toBe(116910);
  });

  it("birim fiyat verilmezse (aralik/bilinmiyor) tahmin uretilmez", () => {
    const badge = selectPublicCampaignBadge([campaign({ discountValue: 10 })], PRODUCT, NOW, null);
    expect(badge?.estimatedDiscountMinor).toBeNull();
    expect(badge?.estimatedFinalUnitPriceMinor).toBeNull();
  });

  it("min-order birim fiyattan buyukse tek urun karsilamaz => tahmin uretilmez", () => {
    const badge = selectPublicCampaignBadge(
      [campaign({ discountValue: 10, minOrderAmountMinor: 200000 })],
      PRODUCT,
      NOW,
      129900,
    );
    expect(badge?.estimatedFinalUnitPriceMinor).toBeNull();
  });

  it("min-order karsilaniyorsa tahmin uretilir", () => {
    const badge = selectPublicCampaignBadge(
      [campaign({ discountValue: 10, minOrderAmountMinor: 100000 })],
      PRODUCT,
      NOW,
      129900,
    );
    expect(badge?.estimatedFinalUnitPriceMinor).toBe(116910);
  });

  it("FIXED_AMOUNT sepet indirimi tek birime guvenli degildir => tahmin uretilmez", () => {
    const badge = selectPublicCampaignBadge(
      [campaign({ discountType: "FIXED_AMOUNT", discountValue: 25000 })],
      PRODUCT,
      NOW,
      129900,
    );
    expect(badge?.estimatedFinalUnitPriceMinor).toBeNull();
  });

  it("maxDiscount cap tahmine motorla ayni sekilde uygulanir", () => {
    // %10 x 129900 = 12990 ama cap 5000 => indirim 5000; nihai 124900.
    const badge = selectPublicCampaignBadge(
      [campaign({ discountValue: 10, maxDiscountAmountMinor: 5000 })],
      PRODUCT,
      NOW,
      129900,
    );
    expect(badge?.estimatedDiscountMinor).toBe(5000);
    expect(badge?.estimatedFinalUnitPriceMinor).toBe(124900);
  });

  it("kupon rozetinde tahmin daima null (birim fiyat verilse bile)", () => {
    const badge = selectPublicCampaignBadge(
      [campaign({ type: "COUPON_CODE", coupons: [coupon()] })],
      PRODUCT,
      NOW,
      129900,
    );
    expect(badge?.displayKind).toBe("PUBLIC_COUPON");
    expect(badge?.estimatedFinalUnitPriceMinor).toBeNull();
  });
});

// F4A.6 (ADR-062) — Stackable-duyarli gosterim seti (birincil + ikincil kupon).
describe("selectPublicCampaignDisplay · stackable kurali", () => {
  const automatic = campaign({ id: "auto-1", type: "AUTOMATIC_CART", priority: 0 });
  const couponCamp = campaign({
    id: "coup-1",
    type: "COUPON_CODE",
    discountType: "FIXED_AMOUNT",
    discountValue: 25000,
    priority: 1,
    coupons: [coupon()],
  });

  it("hepsi stackable ise: otomatik birincil (Sepette) + kupon ikincil", () => {
    const display = selectPublicCampaignDisplay(
      [{ ...couponCamp, stackable: true }, { ...automatic, stackable: true }],
      PRODUCT,
      NOW,
      129900,
    );
    expect(display.primary?.displayKind).toBe("AUTOMATIC_CART_DISCOUNT");
    expect(display.primary?.estimatedFinalUnitPriceMinor).toBe(116910);
    expect(display.secondaryCoupon?.displayKind).toBe("PUBLIC_COUPON");
    expect(display.secondaryCoupon?.couponCode).toBe("TEST250");
  });

  it("en az biri non-stackable ise: yalniz oncelik kazanani (ikincil null)", () => {
    // couponCamp priority 1 > automatic 0; non-stackable => kupon birincil, ikincil yok.
    const display = selectPublicCampaignDisplay(
      [{ ...couponCamp, stackable: false }, { ...automatic, stackable: true }],
      PRODUCT,
      NOW,
      129900,
    );
    expect(display.primary?.displayKind).toBe("PUBLIC_COUPON");
    expect(display.secondaryCoupon).toBeNull();
  });

  it("stackable ama yalniz otomatik varsa ikincil kupon yok", () => {
    const display = selectPublicCampaignDisplay(
      [{ ...automatic, stackable: true }],
      PRODUCT,
      NOW,
      129900,
    );
    expect(display.primary?.displayKind).toBe("AUTOMATIC_CART_DISCOUNT");
    expect(display.secondaryCoupon).toBeNull();
  });

  it("accessModel=AUTO_VISIBLE olsa bile kupon kampanyasi PUBLIC_COUPON kalir (otomatik olmaz)", () => {
    const display = selectPublicCampaignDisplay(
      [{ ...couponCamp, stackable: false, accessModel: "AUTO_VISIBLE" }],
      PRODUCT,
      NOW,
      129900,
    );
    expect(display.primary?.displayKind).toBe("PUBLIC_COUPON");
    expect(display.primary?.requiresCouponCode).toBe(true);
    expect(display.primary?.estimatedFinalUnitPriceMinor).toBeNull();
  });
});
