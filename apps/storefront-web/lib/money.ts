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
 * Bir fiyat listesinden (varyant fiyatlari) tek tutar ya da aralik etiketi
 * uretir. Bos liste icin null doner (cagiran taraf "fiyat yok" durumunu
 * sozlukten yonetir).
 */
export function formatPriceRange(
  prices: { priceMinor: number; currency: string }[],
): string | null {
  if (prices.length === 0) return null;
  const currency = prices[0].currency;
  const values = prices.map((p) => p.priceMinor);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? formatMinor(min, currency) : `${formatMinor(min, currency)} – ${formatMinor(max, currency)}`;
}

/** Aralikta en dusuk tutari bicimler ("STARTING_FROM" gosterimi icin). */
export function formatLowest(prices: { priceMinor: number; currency: string }[]): string | null {
  if (prices.length === 0) return null;
  const currency = prices[0].currency;
  const min = Math.min(...prices.map((p) => p.priceMinor));
  return formatMinor(min, currency);
}
