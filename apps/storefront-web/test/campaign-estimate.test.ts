import { describe, expect, it } from "vitest";
import {
  cheapestVariantId,
  estimateAutomaticUnitFinalMinor,
  type StorefrontCampaignView,
  type StorefrontVariantView,
} from "../lib/catalog-types";

/**
 * F4A.6 — Per-varyant "Sepette" tahmini (saf helper). Gateway'in
 * `computeAutomaticEstimate` fonksiyonuyla AYNI formulu tasir; buy box burada
 * SECILI varyantin fiyatindan hesaplar (donuk urun-seviyesi tahmin degil).
 * Kritik regresyon: cok-varyantli urunde ust-varyant artik dogru/reaktif.
 */
function campaign(overrides: Partial<StorefrontCampaignView> = {}): StorefrontCampaignView {
  return {
    displayKind: "AUTOMATIC_CART_DISCOUNT",
    badgeText: "Sepette %10 indirim",
    label: "Sepette %10 indirim",
    discountText: "%10",
    discountType: "PERCENT",
    discountValue: 10,
    maxDiscountAmountMinor: null,
    minOrderAmountMinor: null,
    requiresCoupon: false,
    couponCode: null,
    couponAction: "MANUAL_ONLY",
    minOrderLabel: null,
    endsAt: null,
    estimatedFinalLabel: null,
    displayTitle: null,
    shortDescription: null,
    badgeLabel: null,
    terms: null,
    ...overrides,
  };
}

describe("estimateAutomaticUnitFinalMinor (F4A.6 per-varyant)", () => {
  it("her varyant kendi fiyatindan hesaplanir (ust-varyant donuk/yanlis kalmaz)", () => {
    // En ucuz varyant (₺1.450) ve ust varyant (₺1.499) AYNI %10 kampanyada
    // FARKLI nihai fiyat verir — donuk tek-deger bug'inin regresyonu.
    expect(estimateAutomaticUnitFinalMinor(145000, campaign())).toEqual({
      discountMinor: 14500,
      finalMinor: 130500,
    });
    expect(estimateAutomaticUnitFinalMinor(149900, campaign())).toEqual({
      discountMinor: 14990,
      finalMinor: 134910,
    });
  });

  it("yuzde indirimi kurusa yuvarlar (motorla ayni)", () => {
    expect(estimateAutomaticUnitFinalMinor(129900, campaign())).toEqual({
      discountMinor: 12990,
      finalMinor: 116910,
    });
  });

  it("maxDiscount cap'i uygular", () => {
    expect(
      estimateAutomaticUnitFinalMinor(149900, campaign({ maxDiscountAmountMinor: 5000 })),
    ).toEqual({ discountMinor: 5000, finalMinor: 144900 });
  });

  it("birim fiyat alt-limitin altindaysa tahmin uretmez (sahte fiyat yok)", () => {
    expect(
      estimateAutomaticUnitFinalMinor(129900, campaign({ minOrderAmountMinor: 200000 })),
    ).toBeNull();
    // Esik karsilaniyorsa hesaplar.
    expect(
      estimateAutomaticUnitFinalMinor(250000, campaign({ minOrderAmountMinor: 200000 })),
    ).toEqual({ discountMinor: 25000, finalMinor: 225000 });
  });

  it("cheapestVariantId: PDP varsayilani en-ucuz gorunur varyant (kartla tutarli)", () => {
    const v = (id: string, priceMinor: number | null): StorefrontVariantView => ({
      id,
      title: id,
      sku: id,
      priceLabel: null,
      compareAtLabel: null,
      priceMinor,
      compareAtMinor: null,
      currency: "TRY",
      available: 5,
      inStock: true,
    });
    // M ilk sirada (₺1.499) ama en ucuz L (₺1.450) secilmeli → kart 1305 ile hizali.
    expect(cheapestVariantId([v("m", 149900), v("l", 145000)])).toBe("l");
    // Numerik fiyatli varyant yoksa (gizli fiyat) ilk varyanta duser.
    expect(cheapestVariantId([v("a", null), v("b", null)])).toBe("a");
    expect(cheapestVariantId([])).toBeNull();
  });

  it("FIXED_AMOUNT / kupon / gizli fiyat durumlarinda null (tahmin uretilmez)", () => {
    expect(
      estimateAutomaticUnitFinalMinor(
        149900,
        campaign({ discountType: "FIXED_AMOUNT", discountValue: 25000 }),
      ),
    ).toBeNull();
    expect(
      estimateAutomaticUnitFinalMinor(149900, campaign({ displayKind: "PUBLIC_COUPON" })),
    ).toBeNull();
    expect(estimateAutomaticUnitFinalMinor(null, campaign())).toBeNull();
    expect(estimateAutomaticUnitFinalMinor(0, campaign())).toBeNull();
  });
});
