import { describe, expect, it } from "vitest";
import {
  computeDiscounts,
  eligibleSubtotalFor,
  isValidCouponCodeFormat,
  normalizeCouponCode,
  type DiscountCartLine,
  type DiscountContext,
  type DiscountEngineInput,
  type EngineCampaign,
  type EngineCoupon,
} from "../src/campaigns/discount-engine.js";

const NOW = new Date("2026-07-05T12:00:00.000Z");

function campaign(overrides: Partial<EngineCampaign> = {}): EngineCampaign {
  return {
    id: "camp_1",
    name: "Test Kampanya",
    status: "ACTIVE",
    type: "COUPON_CODE",
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
    productIds: [],
    categoryIds: [],
    ...overrides,
  };
}

function coupon(overrides: Partial<EngineCoupon> = {}): EngineCoupon {
  return {
    id: "coup_1",
    campaignId: "camp_1",
    code: "TEST10",
    normalizedCode: "TEST10",
    status: "ACTIVE",
    totalUsageLimit: null,
    perCustomerUsageLimit: null,
    usageCount: 0,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

function line(overrides: Partial<DiscountCartLine> = {}): DiscountCartLine {
  return {
    variantId: "var_1",
    productId: "prod_1",
    categoryIds: [],
    quantity: 1,
    lineTotalMinor: 100_000,
    ...overrides,
  };
}

function context(overrides: Partial<DiscountContext> = {}): DiscountContext {
  return {
    automaticCampaigns: [],
    coupon: null,
    couponCampaign: null,
    customerUsageByCampaign: new Map(),
    customerUsageByCoupon: new Map(),
    ...overrides,
  };
}

function input(overrides: Partial<DiscountEngineInput> = {}): DiscountEngineInput {
  const lines = overrides.lines ?? [line()];
  return {
    lines,
    subtotalMinor: lines.reduce((sum, l) => sum + l.lineTotalMinor, 0),
    couponCode: null,
    context: context(),
    now: NOW,
    ...overrides,
  };
}

describe("normalizeCouponCode", () => {
  it("trims and uppercases locale-independently (TR-I safe)", () => {
    expect(normalizeCouponCode("  test10 ")).toBe("TEST10");
    expect(normalizeCouponCode("indirim")).toBe("INDIRIM");
    expect(normalizeCouponCode("")).toBeNull();
    expect(normalizeCouponCode("   ")).toBeNull();
    expect(normalizeCouponCode(null)).toBeNull();
  });

  it("validates allowed format", () => {
    expect(isValidCouponCodeFormat("TEST-250_A")).toBe(true);
    expect(isValidCouponCodeFormat("T")).toBe(false);
    expect(isValidCouponCodeFormat("BAD CODE")).toBe(false);
    expect(isValidCouponCodeFormat("KÜPON")).toBe(false);
  });
});

describe("computeDiscounts — coupon", () => {
  function couponInput(campaignOverrides: Partial<EngineCampaign> = {}, couponOverrides: Partial<EngineCoupon> = {}, rest: Partial<DiscountEngineInput> = {}) {
    return input({
      couponCode: "test10",
      context: context({
        coupon: coupon(couponOverrides),
        couponCampaign: campaign(campaignOverrides),
      }),
      ...rest,
    });
  }

  it("applies percent discount deterministically", () => {
    const result = computeDiscounts(couponInput({ discountValue: 10 }));
    expect(result.couponStatus).toBe("APPLIED");
    expect(result.discountMinor).toBe(10_000);
    expect(result.discountLines).toHaveLength(1);
    expect(result.discountLines[0]).toMatchObject({
      campaignId: "camp_1",
      couponId: "coup_1",
      code: "TEST10",
      discountType: "PERCENT",
      discountAmountMinor: 10_000,
    });
    // Deterministik yuvarlama: 33333 * %10 = 3333.3 -> 3333.
    const odd = computeDiscounts(
      couponInput({ discountValue: 10 }, {}, { lines: [line({ lineTotalMinor: 33_333 })] }),
    );
    expect(odd.discountMinor).toBe(3_333);
  });

  it("applies fixed amount discount and never exceeds subtotal", () => {
    const result = computeDiscounts(
      couponInput({ discountType: "FIXED_AMOUNT", discountValue: 25_000 }),
    );
    expect(result.discountMinor).toBe(25_000);

    const overflow = computeDiscounts(
      couponInput(
        { discountType: "FIXED_AMOUNT", discountValue: 250_000 },
        {},
        { lines: [line({ lineTotalMinor: 40_000 })] },
      ),
    );
    expect(overflow.couponStatus).toBe("APPLIED");
    expect(overflow.discountMinor).toBe(40_000);
  });

  it("caps discount at maxDiscountAmountMinor", () => {
    const result = computeDiscounts(
      couponInput({ discountValue: 50, maxDiscountAmountMinor: 20_000 }),
    );
    expect(result.discountMinor).toBe(20_000);
  });

  it("rejects when min order amount is not met", () => {
    const result = computeDiscounts(
      couponInput({ minOrderAmountMinor: 200_000 }),
    );
    expect(result.couponStatus).toBe("INVALID");
    expect(result.couponReason).toBe("MIN_ORDER_NOT_MET");
    expect(result.discountMinor).toBe(0);
  });

  it("rejects expired and future campaigns", () => {
    const expired = computeDiscounts(
      couponInput({ endsAt: new Date("2026-07-01T00:00:00Z") }),
    );
    expect(expired.couponStatus).toBe("INVALID");
    expect(expired.couponReason).toBe("EXPIRED");

    const future = computeDiscounts(
      couponInput({ startsAt: new Date("2026-08-01T00:00:00Z") }),
    );
    expect(future.couponStatus).toBe("INVALID");
    expect(future.couponReason).toBe("NOT_STARTED");
  });

  it("respects coupon-level window override", () => {
    const result = computeDiscounts(
      couponInput({}, { endsAt: new Date("2026-07-04T00:00:00Z") }),
    );
    expect(result.couponReason).toBe("EXPIRED");
  });

  it("rejects unknown coupon and inactive coupon/campaign", () => {
    const notFound = computeDiscounts(input({ couponCode: "YOKBOYLEKOD" }));
    expect(notFound.couponStatus).toBe("INVALID");
    expect(notFound.couponReason).toBe("NOT_FOUND");

    const paused = computeDiscounts(couponInput({ status: "PAUSED" }));
    expect(paused.couponReason).toBe("INACTIVE");

    const archivedCoupon = computeDiscounts(couponInput({}, { status: "ARCHIVED" }));
    expect(archivedCoupon.couponReason).toBe("INACTIVE");
  });

  it("enforces total usage limits (campaign and coupon)", () => {
    const campaignLimit = computeDiscounts(
      couponInput({ totalUsageLimit: 5, usageCount: 5 }),
    );
    expect(campaignLimit.couponReason).toBe("USAGE_LIMIT_REACHED");

    const couponLimit = computeDiscounts(
      couponInput({}, { totalUsageLimit: 3, usageCount: 3 }),
    );
    expect(couponLimit.couponReason).toBe("USAGE_LIMIT_REACHED");
  });

  it("enforces per-customer usage limits", () => {
    const perCustomer = computeDiscounts(
      input({
        couponCode: "TEST10",
        context: context({
          coupon: coupon({ perCustomerUsageLimit: 1 }),
          couponCampaign: campaign(),
          customerUsageByCoupon: new Map([["coup_1", 1]]),
        }),
      }),
    );
    expect(perCustomer.couponReason).toBe("USAGE_LIMIT_REACHED");

    const perCustomerCampaign = computeDiscounts(
      input({
        couponCode: "TEST10",
        context: context({
          coupon: coupon(),
          couponCampaign: campaign({ perCustomerUsageLimit: 2 }),
          customerUsageByCampaign: new Map([["camp_1", 2]]),
        }),
      }),
    );
    expect(perCustomerCampaign.couponReason).toBe("USAGE_LIMIT_REACHED");
  });

  it("scopes discount to matching products/categories", () => {
    const lines = [
      line({ variantId: "v1", productId: "p1", lineTotalMinor: 60_000 }),
      line({ variantId: "v2", productId: "p2", categoryIds: ["c9"], lineTotalMinor: 40_000 }),
    ];
    const scoped = computeDiscounts(
      couponInput({ productIds: ["p1"], discountValue: 10 }, {}, { lines }),
    );
    // Yalniz p1 satiri (60000) uygun -> %10 = 6000.
    expect(scoped.couponStatus).toBe("APPLIED");
    expect(scoped.discountMinor).toBe(6_000);
    expect(scoped.discountLines[0]!.eligibleSubtotalMinor).toBe(60_000);

    const categoryScoped = computeDiscounts(
      couponInput({ categoryIds: ["c9"], discountValue: 50 }, {}, { lines }),
    );
    expect(categoryScoped.discountMinor).toBe(20_000);

    const noMatch = computeDiscounts(
      couponInput({ productIds: ["baska-urun"] }, {}, { lines }),
    );
    expect(noMatch.couponStatus).toBe("INVALID");
    expect(noMatch.couponReason).toBe("NOT_APPLICABLE");
  });
});

describe("computeDiscounts — automatic campaigns and stacking", () => {
  it("selects the best automatic discount when non-stackable", () => {
    const result = computeDiscounts(
      input({
        context: context({
          automaticCampaigns: [
            campaign({ id: "a", type: "AUTOMATIC_CART", discountValue: 5, name: "A" }),
            campaign({ id: "b", type: "AUTOMATIC_CART", discountValue: 15, name: "B" }),
            campaign({ id: "c", type: "AUTOMATIC_CART", discountValue: 10, name: "C" }),
          ],
        }),
      }),
    );
    expect(result.discountLines).toHaveLength(1);
    expect(result.discountLines[0]!.campaignId).toBe("b");
    expect(result.discountMinor).toBe(15_000);
    expect(result.couponStatus).toBe("NONE");
  });

  it("stacks only stackable campaigns and caps at remaining subtotal", () => {
    const result = computeDiscounts(
      input({
        lines: [line({ lineTotalMinor: 100_000 })],
        subtotalMinor: 100_000,
        context: context({
          automaticCampaigns: [
            campaign({ id: "s1", type: "AUTOMATIC_CART", stackable: true, discountType: "FIXED_AMOUNT", discountValue: 70_000 }),
            campaign({ id: "s2", type: "AUTOMATIC_CART", stackable: true, discountType: "FIXED_AMOUNT", discountValue: 50_000 }),
            campaign({ id: "n1", type: "AUTOMATIC_CART", stackable: false, discountType: "FIXED_AMOUNT", discountValue: 10_000 }),
          ],
        }),
      }),
    );
    // s1 (70k) + s2 kalanla cap'lenir (30k); non-stackable n1 uygulanmaz.
    expect(result.discountLines.map((l) => l.campaignId)).toEqual(["s1", "s2"]);
    expect(result.discountMinor).toBe(100_000);
  });

  it("coupon takes precedence over automatic campaigns", () => {
    const result = computeDiscounts(
      input({
        couponCode: "TEST10",
        context: context({
          coupon: coupon(),
          couponCampaign: campaign({ id: "camp_1", discountValue: 5 }),
          automaticCampaigns: [
            campaign({ id: "auto", type: "AUTOMATIC_CART", discountValue: 50, priority: 99 }),
          ],
        }),
      }),
    );
    // Kupon non-stackable -> yalniz kupon uygulanir (otomatik %50 daha buyuk olsa da).
    expect(result.discountLines).toHaveLength(1);
    expect(result.discountLines[0]!.campaignId).toBe("camp_1");
    expect(result.couponStatus).toBe("APPLIED");
  });

  it("stackable coupon combines with stackable automatic campaign", () => {
    const result = computeDiscounts(
      input({
        couponCode: "TEST10",
        context: context({
          coupon: coupon(),
          couponCampaign: campaign({ id: "camp_1", discountValue: 10, stackable: true }),
          automaticCampaigns: [
            campaign({ id: "auto", type: "AUTOMATIC_CART", discountValue: 5, stackable: true }),
          ],
        }),
      }),
    );
    expect(result.discountLines.map((l) => l.campaignId)).toEqual(["camp_1", "auto"]);
    expect(result.discountMinor).toBe(15_000);
  });

  it("skips automatic campaigns outside window/limits/scope", () => {
    const result = computeDiscounts(
      input({
        context: context({
          automaticCampaigns: [
            campaign({ id: "expired", type: "AUTOMATIC_CART", endsAt: new Date("2026-01-01T00:00:00Z") }),
            campaign({ id: "future", type: "AUTOMATIC_CART", startsAt: new Date("2027-01-01T00:00:00Z") }),
            campaign({ id: "limit", type: "AUTOMATIC_CART", totalUsageLimit: 1, usageCount: 1 }),
            campaign({ id: "min", type: "AUTOMATIC_CART", minOrderAmountMinor: 900_000 }),
            campaign({ id: "scope", type: "PRODUCT_DISCOUNT", productIds: ["baska"] }),
            campaign({ id: "draft", type: "AUTOMATIC_CART", status: "DRAFT" }),
            campaign({ id: "reserved", type: "BUY_X_GET_Y" }),
          ],
        }),
      }),
    );
    expect(result.discountLines).toHaveLength(0);
    expect(result.discountMinor).toBe(0);
  });

  it("returns empty result for empty cart", () => {
    const result = computeDiscounts(input({ lines: [], subtotalMinor: 0, couponCode: "TEST10" }));
    expect(result.discountMinor).toBe(0);
    expect(result.couponStatus).toBe("INVALID");
  });
});

describe("eligibleSubtotalFor", () => {
  it("treats empty scope as whole cart and unions product/category scope", () => {
    const lines = [
      line({ variantId: "v1", productId: "p1", lineTotalMinor: 10_000 }),
      line({ variantId: "v2", productId: "p2", categoryIds: ["c1"], lineTotalMinor: 20_000 }),
      line({ variantId: "v3", productId: "p3", lineTotalMinor: 30_000 }),
    ];
    expect(eligibleSubtotalFor(campaign(), lines)).toBe(60_000);
    expect(eligibleSubtotalFor(campaign({ productIds: ["p1"], categoryIds: ["c1"] }), lines)).toBe(30_000);
  });
});

// Dilim 6a-refine — Sepet satirina KAMPANYA indirim dagitimi (pro-rata). sum(lineDiscounts)
// = discountMinor (kurus kurusuna); kapsamli kampanya yalniz eslesen satirlara.
describe("computeDiscounts — lineDiscounts (pro-rata dağıtım)", () => {
  it("distributes an automatic cart % discount pro-rata across lines; sum equals discountMinor", () => {
    const lines = [
      line({ variantId: "a", lineTotalMinor: 100_000 }),
      line({ variantId: "b", productId: "prod_2", lineTotalMinor: 50_000 }),
    ];
    const result = computeDiscounts(
      input({
        lines,
        context: context({ automaticCampaigns: [campaign({ type: "AUTOMATIC_CART", discountValue: 10 })] }),
      }),
    );
    // %10 sepet: toplam 15.000; a=10.000, b=5.000 (oranli).
    expect(result.discountMinor).toBe(15_000);
    const byVariant = new Map(result.lineDiscounts.map((d) => [d.variantId, d.discountMinor]));
    expect(byVariant.get("a")).toBe(10_000);
    expect(byVariant.get("b")).toBe(5_000);
    expect(result.lineDiscounts.reduce((s, d) => s + d.discountMinor, 0)).toBe(result.discountMinor);
  });

  it("keeps sum exact with rounding residual (largest-remainder), no kuruş lost", () => {
    // Tuhaf tutarlar → floor sonrasi artik kurus largest-remainder ile dagitilir.
    const lines = [
      line({ variantId: "a", lineTotalMinor: 33_333 }),
      line({ variantId: "b", productId: "prod_2", lineTotalMinor: 33_333 }),
      line({ variantId: "c", productId: "prod_3", lineTotalMinor: 33_334 }),
    ];
    const result = computeDiscounts(
      input({
        lines,
        context: context({ automaticCampaigns: [campaign({ type: "AUTOMATIC_CART", discountValue: 10 })] }),
      }),
    );
    // Satir indirimleri toplami = motor toplam indirimi (kurus kaybi/fazlasi yok).
    expect(result.lineDiscounts.reduce((s, d) => s + d.discountMinor, 0)).toBe(result.discountMinor);
    // Her satir indirimi satir tutarini asmaz.
    for (const d of result.lineDiscounts) {
      const l = lines.find((x) => x.variantId === d.variantId)!;
      expect(d.discountMinor).toBeLessThanOrEqual(l.lineTotalMinor);
    }
  });

  it("scoped campaign allocates only to matching lines", () => {
    const lines = [
      line({ variantId: "a", productId: "prod_1", lineTotalMinor: 100_000 }),
      line({ variantId: "b", productId: "prod_2", lineTotalMinor: 100_000 }),
    ];
    const result = computeDiscounts(
      input({
        lines,
        context: context({
          automaticCampaigns: [
            campaign({ type: "PRODUCT_DISCOUNT", discountValue: 20, productIds: ["prod_1"] }),
          ],
        }),
      }),
    );
    const byVariant = new Map(result.lineDiscounts.map((d) => [d.variantId, d.discountMinor]));
    expect(byVariant.get("a")).toBe(20_000); // yalniz kapsamdaki urun
    expect(byVariant.has("b")).toBe(false); // kapsam disi satir indirim almaz
  });

  it("returns empty lineDiscounts when no campaign applies", () => {
    const result = computeDiscounts(input());
    expect(result.lineDiscounts).toEqual([]);
  });
});
