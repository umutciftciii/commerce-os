/**
 * Vitrin para bicimlendirme yardimcilari. Mağaza para birimi TRY oldugundan
 * tutarlar tr-TR locale'iyle bicimlenir (UI dili EN olsa bile para bicimi
 * Turkiye mağazasi icin dogru kalir). Tum tutarlar minor unit (kurus) tam
 * sayisidir.
 */
const FALLBACK_LOCALE = "tr-TR";

export function formatMinor(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(FALLBACK_LOCALE, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * F4C (ADR-063) — Urun karti fiyat ARALIGI gostermez: cok varyantli urunde
 * yalnizca EN UCUZ aktif varyantin (brut, KDV dahil) fiyati gosterilir; eski
 * `formatPriceRange` ("min – max") bilincli KALDIRILDI (kampanya blogu ile
 * cakisan kalabalik gorunum). Detay sayfasi varyant fiyatlarini ayri gosterir.
 */
/** Aralikta en dusuk minor tutari (kurus) doner; gorunur fiyat yoksa null. */
export function lowestMinor(prices: { priceMinor: number; currency: string }[]): number | null {
  if (prices.length === 0) return null;
  return Math.min(...prices.map((p) => p.priceMinor));
}

/** Aralikta en dusuk tutari bicimler (kart fiyati + "STARTING_FROM" gosterimi). */
export function formatLowest(prices: { priceMinor: number; currency: string }[]): string | null {
  const min = lowestMinor(prices);
  if (min === null) return null;
  return formatMinor(min, prices[0].currency);
}

/**
 * BUG-PDP-001 — PDP birim fiyat gösterimi (SAF). Ürün detayında (buy box)
 * gösterilen tutar DAİMA seçili varyantın TEK ADET birim fiyatıdır; adet
 * (quantity) bu hesaba GİRMEZ. Bu fonksiyon bilinçli olarak quantity parametresi
 * ALMAZ — böylece adet değişimi satış/indirimli/liste (compareAt) fiyatını
 * biçim seviyesinde matematiksel olarak ETKİLEYEMEZ. `quantity × unitPrice`
 * yalnızca sunucu-otoriter sepet satır toplamı / checkout özeti / sipariş
 * toplamı / ödeme tutarında uygulanır (PDP salt sunum katmanıdır).
 *
 * Ham minor tutar varsa istemcide biçimlenir; yoksa sunucudan gelen tekil
 * etikete geri düşülür (gizli/talep modunda numeric zaten false).
 */
export function resolveUnitPriceLabels(opts: {
  numeric: boolean;
  unitMinor: number | null;
  compareMinor: number | null;
  currency: string;
  fallbackUnitLabel: string | null;
  fallbackCompareLabel: string | null;
}): { unitLabel: string | null; compareLabel: string | null } {
  const { numeric, unitMinor, compareMinor, currency, fallbackUnitLabel, fallbackCompareLabel } = opts;
  return {
    unitLabel: numeric && unitMinor !== null ? formatMinor(unitMinor, currency) : fallbackUnitLabel,
    compareLabel:
      numeric && compareMinor !== null ? formatMinor(compareMinor, currency) : fallbackCompareLabel,
  };
}
