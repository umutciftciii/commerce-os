/**
 * F4A.1 — Paylasilan kampanya etiket yardimcilari.
 *
 * Vitrin rozetleri ve kampanya kopyalari icin TEK kaynak: ayni kampanya
 * projeksiyonu (tip + indirim tipi/degeri) her yuzeyde ayni metne cevrilir.
 * Girdi PUBLIC-SAFE projeksiyondur; ic kampanya alanlari (limit/oncelik/
 * istatistik) buraya TASINMAZ. Para tutarlari minor unit (kurus) tam sayidir;
 * para bicimi magaza para birimi icin tr-TR ile bicimlenir (UI dili EN olsa
 * bile tutar bicimi Turkiye magazasi icin dogru kalir — vitrin money.ts ile
 * ayni kural).
 */

export type CampaignLabelLocale = "tr" | "en";

export interface CampaignLabelInput {
  /** COUPON_CODE kupon gerektirir; diger tipler otomatik uygulanir. */
  type: string;
  discountType: "PERCENT" | "FIXED_AMOUNT";
  /** PERCENT: 1-100 tam sayi; FIXED_AMOUNT: minor unit tutar. */
  discountValue: number;
  /** FIXED_AMOUNT bicimlemesi icin para birimi (varsayilan TRY). */
  currency?: string;
}

/** Tam liralarda ondaliksiz ("₺250"), kurusta iki hane ("₺250,50"). */
export function formatCampaignAmount(minor: number, currency = "TRY"): string {
  const value = minor / 100;
  const isWhole = minor % 100 === 0;
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: isWhole ? 0 : 2,
    }).format(value);
  } catch {
    return `${isWhole ? String(value) : value.toFixed(2)} ${currency}`;
  }
}

function discountText(input: CampaignLabelInput): string {
  return input.discountType === "PERCENT"
    ? `%${input.discountValue}`
    : formatCampaignAmount(input.discountValue, input.currency ?? "TRY");
}

/**
 * F4A.3 — Ham indirim tutari metni ("%10" / "₺250"). Kupon kartlari ve otomatik
 * kampanya detayinda "Sepette" ekiyle veya tek basina kullanilir.
 */
export function getCampaignDiscountText(input: CampaignLabelInput): string {
  return discountText(input);
}

function isCouponCampaign(input: CampaignLabelInput): boolean {
  return input.type === "COUPON_CODE";
}

/**
 * Musteri-yuzu kampanya etiketi.
 *  - PERCENT 10 otomatik → "Sepette %10 indirim"
 *  - FIXED 250₺ kupon    → "₺250 kupon"
 *  - FIXED 250₺ otomatik → "Sepette ₺250 indirim"
 */
export function getCampaignPublicLabel(
  input: CampaignLabelInput,
  locale: CampaignLabelLocale,
): string {
  const amount = discountText(input);
  if (isCouponCampaign(input)) {
    return locale === "tr" ? `${amount} kupon` : `${amount} coupon`;
  }
  return locale === "tr" ? `Sepette ${amount} indirim` : `${amount} off in cart`;
}

/**
 * Urun karti rozet metni. Kupon kampanyasinda kod tesir etmeden kisa rozet
 * ("Kuponlu urun"); otomatik kampanyada acik indirim etiketi.
 */
export function getCampaignBadgeText(
  input: CampaignLabelInput,
  locale: CampaignLabelLocale,
): string {
  if (isCouponCampaign(input)) {
    return locale === "tr" ? "Kuponlu ürün" : "Coupon available";
  }
  return getCampaignPublicLabel(input, locale);
}
