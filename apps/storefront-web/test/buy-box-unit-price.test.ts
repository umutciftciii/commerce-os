import { describe, expect, it } from "vitest";
import { estimateAutomaticUnitFinalMinor, type StorefrontCampaignView } from "../lib/catalog-types";
import { formatMinor, resolveUnitPriceLabels } from "../lib/money";

/**
 * BUG-PDP-001 — PDP'de gösterilen fiyat DAİMA seçili varyantın TEK ADET birim
 * fiyatıdır; adet (quantity) fiyat GÖSTERİMİNİ ETKİLEMEZ.
 *
 * Kök neden (kanıt): `resolveUnitPriceLabels` bilinçli olarak quantity parametresi
 * ALMAZ. Buy box'ta gösterilen tutar bu SAF yardımcıdan gelir; böylece adet
 * değişimi satış/indirimli/liste (compareAt) fiyatını matematiksel olarak
 * ETKİLEYEMEZ. `quantity × unitPrice` yalnızca sunucu-otoriter sepet satır
 * toplamı / checkout özeti / sipariş toplamı / ödeme tutarında uygulanır.
 */
describe("BUG-PDP-001 · resolveUnitPriceLabels (PDP birim fiyat gösterimi)", () => {
  const currency = "TRY";

  it("ham minor tutarı biçimler ve compareAt'ı üzeri çizili birim olarak döner", () => {
    const { unitLabel, compareLabel } = resolveUnitPriceLabels({
      numeric: true,
      unitMinor: 629110,
      compareMinor: 799000,
      currency,
      fallbackUnitLabel: null,
      fallbackCompareLabel: null,
    });
    expect(unitLabel).toBe(formatMinor(629110, currency));
    expect(compareLabel).toBe(formatMinor(799000, currency));
  });

  it("adetten BAĞIMSIZDIR — fonksiyon quantity almaz, birim fiyat sabit kalır (Artesan regresyonu)", () => {
    // Artesan Bel Çantası: ₺6.291,10. quantity 1→2→5 arasında gösterilen fiyat
    // birim fiyatta SABİT kalmalıdır (eskiden ×adet ile ₺12.582,20 / ₺31.455,50 oluyordu).
    const unitMinor = 629110;
    const label = () =>
      resolveUnitPriceLabels({
        numeric: true,
        unitMinor,
        compareMinor: null,
        currency,
        fallbackUnitLabel: null,
        fallbackCompareLabel: null,
      }).unitLabel;
    // Aynı varyant için her çağrı aynı birim fiyatı döner; adet girdi değildir.
    expect(label()).toBe(formatMinor(629110, currency));
    expect(label()).not.toBe(formatMinor(629110 * 2, currency));
    expect(label()).not.toBe(formatMinor(629110 * 5, currency));
  });

  it("indirimli üründe compareAt üzeri çizili birim fiyatı adete bağlı büyümez", () => {
    const { unitLabel, compareLabel } = resolveUnitPriceLabels({
      numeric: true,
      unitMinor: 129900,
      compareMinor: 159900,
      currency,
      fallbackUnitLabel: null,
      fallbackCompareLabel: null,
    });
    expect(unitLabel).toBe(formatMinor(129900, currency));
    expect(compareLabel).toBe(formatMinor(159900, currency));
  });

  it("numeric=false ise (gizli/talep modu) sunucudan gelen tekil etikete geri düşer", () => {
    const { unitLabel, compareLabel } = resolveUnitPriceLabels({
      numeric: false,
      unitMinor: 629110,
      compareMinor: 799000,
      currency,
      fallbackUnitLabel: "Fiyat için iletişime geçin",
      fallbackCompareLabel: null,
    });
    expect(unitLabel).toBe("Fiyat için iletişime geçin");
    expect(compareLabel).toBeNull();
  });

  it("ham minor yoksa (null) fallback etikete geri düşer", () => {
    const { unitLabel, compareLabel } = resolveUnitPriceLabels({
      numeric: true,
      unitMinor: null,
      compareMinor: null,
      currency,
      fallbackUnitLabel: "₺6.291,10",
      fallbackCompareLabel: "₺7.990,00",
    });
    expect(unitLabel).toBe("₺6.291,10");
    expect(compareLabel).toBe("₺7.990,00");
  });

  it("varyant değişince (farklı unitMinor) birim fiyat değişir — adet değil", () => {
    const a = resolveUnitPriceLabels({
      numeric: true,
      unitMinor: 629110,
      compareMinor: null,
      currency,
      fallbackUnitLabel: null,
      fallbackCompareLabel: null,
    }).unitLabel;
    const b = resolveUnitPriceLabels({
      numeric: true,
      unitMinor: 899900,
      compareMinor: null,
      currency,
      fallbackUnitLabel: null,
      fallbackCompareLabel: null,
    }).unitLabel;
    expect(a).not.toBe(b);
    expect(b).toBe(formatMinor(899900, currency));
  });
});

/**
 * BUG-PDP-001 · render-yolu ayrımı (Artesan vs Xiaomi).
 * Xiaomi Edge 50 gibi AKTİF otomatik kampanyalı (AUTOMATIC_CART_DISCOUNT + PERCENT)
 * ürünler otomatik fiyat bloğuna girer ve nihai/liste birim fiyatını ADETTEN
 * BAĞIMSIZ gösterir (zaten doğruydu). Artesan gibi kampanyasız ürünler standart
 * bloğa düşer; bu blok artık `resolveUnitPriceLabels` ile birim fiyat gösterir
 * (eskiden ×adet çarpıyordu → hata). İki yol da adetten bağımsız birim fiyat verir.
 */
describe("BUG-PDP-001 · otomatik kampanya tahmini (Xiaomi doğru davranış) adetten bağımsız", () => {
  const currency = "TRY";
  const autoCampaign: Pick<
    StorefrontCampaignView,
    "displayKind" | "discountType" | "discountValue" | "minOrderAmountMinor" | "maxDiscountAmountMinor"
  > = {
    displayKind: "AUTOMATIC_CART_DISCOUNT",
    discountType: "PERCENT",
    discountValue: 10,
    minOrderAmountMinor: null,
    maxDiscountAmountMinor: null,
  };

  it("nihai birim fiyat tahmini unitMinor'dan türetilir; quantity girdisi yoktur", () => {
    const unitMinor = 899900; // Xiaomi Edge 50 varyant birim fiyatı
    const est = estimateAutomaticUnitFinalMinor(unitMinor, autoCampaign);
    expect(est).not.toBeNull();
    // %10 indirim → nihai birim 809910; adete bağlı değil.
    expect(est!.finalMinor).toBe(unitMinor - Math.round(unitMinor * 0.1));
    expect(formatMinor(est!.finalMinor, currency)).toBe(formatMinor(809910, currency));
    // Üzeri çizili "liste" birim fiyatı da adetten bağımsız birim fiyattır.
    expect(formatMinor(unitMinor, currency)).toBe(formatMinor(899900, currency));
  });
});
