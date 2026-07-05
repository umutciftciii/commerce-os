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
/** Aralikta en dusuk tutari bicimler (kart fiyati + "STARTING_FROM" gosterimi). */
export function formatLowest(prices: { priceMinor: number; currency: string }[]): string | null {
  if (prices.length === 0) return null;
  const currency = prices[0].currency;
  const min = Math.min(...prices.map((p) => p.priceMinor));
  return formatMinor(min, currency);
}
