/**
 * Bicimlendirme yardimcilari. Varsayilan urun dili Turkce oldugundan tr-TR
 * locale kullanilir (runtime locale switcher sonraki faza birakildi).
 */
const dateFormatter = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" });

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

/**
 * Minor unit (kurus) tam sayisini para birimiyle bicimlendirir. Ornek:
 * formatMinor(19990, "TRY") => "₺199,90".
 */
export function formatMinor(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(minor / 100);
  } catch {
    // Bilinmeyen para birimi: sade sayi bicimi.
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** Bir varyantin fiyat araligini (tek/aralik) bicimlendirir. */
export function formatPriceRange(
  minors: { priceMinor: number; currency: string }[],
): string {
  if (minors.length === 0) return "—";
  const currency = minors[0].currency;
  const prices = minors.map((m) => m.priceMinor);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max
    ? formatMinor(min, currency)
    : `${formatMinor(min, currency)} – ${formatMinor(max, currency)}`;
}

/**
 * Minor unit'i form input degerine cevirir (nokta ondalik). Ornek:
 * minorToInput(19990) => "199.90". Bos/null icin "" doner.
 */
export function minorToInput(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  return (minor / 100).toFixed(2);
}

/**
 * Kullanicinin girdigi TL tutarini (virgul veya nokta ondalik) minor unit
 * (kurus) tam sayisina cevirir. Gecersiz girdi icin null doner; bu durumda
 * cagiran taraf Turkce "gecerli fiyat girin" mesaji gosterir.
 */
export function inputToMinor(value: string): number | null {
  const trimmed = value.trim().replace(/\s/g, "");
  if (trimmed.length === 0) return null;
  // Ondalik ayraci cozumleme: hem '.' hem ',' varsa '.' binlik / ',' ondalik
  // kabul edilir (TR yazimi). Yalnizca biri varsa o ondalik kabul edilir.
  let normalized: string;
  if (trimmed.includes(".") && trimmed.includes(",")) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = trimmed.replace(",", ".");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const asFloat = Number.parseFloat(normalized);
  if (Number.isNaN(asFloat) || asFloat < 0) return null;
  return Math.round(asFloat * 100);
}
