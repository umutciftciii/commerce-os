/**
 * F4A.1 — Public urun kampanya rozeti projeksiyonu.
 *
 * Vitrin urun listesi/detayi icin urun basina TEK kampanya rozeti secer.
 * KAYNAK DOGRUSU yine sunucudur: istemciye yalnizca ALLOWLIST'lenmis reklam
 * alanlari (kind/discountType/discountValue/minOrderAmountMinor) doner;
 * kampanya IC kimligi, kullanim istatistigi, priority/stackable ve kapsam
 * listeleri SIZMAZ. isPublic=false kampanyalar (ozel kuponlar dahil) public
 * projeksiyona ASLA girmez.
 *
 * Modul SAF'tir (I/O yok); `now` parametredir. Secim deterministiktir:
 * priority DESC, sonra id ASC (indirim tutari sepete bagli oldugundan burada
 * karsilastirilmaz).
 */
import type { PublicCampaignBadge } from "@commerce-os/contracts";
import type { CampaignCouponRecord, CampaignRecord } from "./data.js";
import { toCouponDisplayFields } from "./data.js";

/** Rozet uretebilen kampanya tipleri (motorla ayni MVP kumesi). */
const BADGE_TYPES: ReadonlySet<CampaignRecord["type"]> = new Set([
  "COUPON_CODE",
  "AUTOMATIC_CART",
  "PRODUCT_DISCOUNT",
  "CATEGORY_DISCOUNT",
]);

function isWithinWindow(campaign: CampaignRecord, now: Date): boolean {
  if (campaign.startsAt && now.getTime() < campaign.startsAt.getTime()) return false;
  if (campaign.endsAt && now.getTime() > campaign.endsAt.getTime()) return false;
  return true;
}

/** Rozet adayi mi? ACTIVE + public + pencere icinde + limiti dolmamis. */
export function isBadgeEligible(campaign: CampaignRecord, now: Date): boolean {
  if (campaign.status !== "ACTIVE") return false;
  if (!campaign.isPublic) return false;
  if (!BADGE_TYPES.has(campaign.type)) return false;
  if (!isWithinWindow(campaign, now)) return false;
  if (campaign.totalUsageLimit !== null && campaign.usageCount >= campaign.totalUsageLimit) {
    return false;
  }
  // Kupon kampanyasinda en az bir ACTIVE kupon olmali (kod olmadan reklam yapilmaz).
  if (campaign.type === "COUPON_CODE") {
    const hasActiveCoupon = campaign.coupons.some((coupon) => coupon.status === "ACTIVE");
    if (!hasActiveCoupon) return false;
  }
  return true;
}

/** Kampanya kapsami bu urunu iceriyor mu? Bos kapsam = tum urunler. */
export function campaignAppliesToProduct(
  campaign: CampaignRecord,
  product: { id: string; categoryIds: string[] },
): boolean {
  const hasScope = campaign.productIds.length > 0 || campaign.categoryIds.length > 0;
  if (!hasScope) return true;
  if (campaign.productIds.includes(product.id)) return true;
  return product.categoryIds.some((categoryId) => campaign.categoryIds.includes(categoryId));
}

function compareCampaigns(a: CampaignRecord, b: CampaignRecord): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * F4A.3 — Public'e gosterilmesi GUVENLI kupon kodunu secer: ACTIVE + kendi
 * penceresi gecerli + (varsa) limiti dolmamis ILK kupon. Yoksa null (kod
 * gosterilmez; kart yine "CLAIM" aksiyonuyla manuel kalabilir). Kampanyanin
 * isPublic olmasi cagiran tarafta (isBadgeEligible) zaten dogrulanmistir —
 * PRIVATE kupon buraya asla ulasmaz.
 */
function selectPublicCouponCode(campaign: CampaignRecord, now: Date): string | null {
  const coupon = campaign.coupons.find((item) => {
    if (item.status !== "ACTIVE") return false;
    if (item.startsAt && now.getTime() < item.startsAt.getTime()) return false;
    if (item.endsAt && now.getTime() > item.endsAt.getTime()) return false;
    if (item.totalUsageLimit !== null && item.usageCount >= item.totalUsageLimit) return false;
    return true;
  });
  return coupon?.code ?? null;
}

/** Kampanya + (varsa) kupon penceresinin ERKEN biten bitis tarihi (ISO). */
function effectiveEndsAt(campaign: CampaignRecord, coupon: CampaignCouponRecord | null): string | null {
  const ends = [campaign.endsAt, coupon?.endsAt ?? null].filter((d): d is Date => d instanceof Date);
  if (ends.length === 0) return null;
  return ends.reduce((min, d) => (d.getTime() < min.getTime() ? d : min)).toISOString();
}

/**
 * F4A.6 (ADR-062) — Otomatik sepet indiriminin GUVENLI birim-basi tahmini.
 * Yalniz PERCENT + tek-fiyatli urun (unitPriceMinor biliniyor) + (minOrder yok
 * ya da tek urun esigi karsiliyor) durumunda hesaplanir; aksi halde null (sahte
 * nihai fiyat URETILMEZ). Motorla AYNI formul kullanilir: round(unit*yuzde),
 * maxDiscount cap ve birim fiyatla sinirlama. Sabit tutarli (FIXED_AMOUNT)
 * sepet indirimi tek birime guvenli boluinemedigi icin tahmin uretilmez.
 */
function computeAutomaticEstimate(
  campaign: CampaignRecord,
  unitPriceMinor: number | null,
): { estimatedDiscountMinor: number | null; estimatedFinalUnitPriceMinor: number | null } {
  const none = { estimatedDiscountMinor: null, estimatedFinalUnitPriceMinor: null };
  if (unitPriceMinor === null || unitPriceMinor <= 0) return none;
  if (campaign.discountType !== "PERCENT") return none;
  if (campaign.minOrderAmountMinor !== null && unitPriceMinor < campaign.minOrderAmountMinor) {
    return none;
  }
  let discount = Math.round((unitPriceMinor * campaign.discountValue) / 100);
  if (campaign.maxDiscountAmountMinor !== null) {
    discount = Math.min(discount, campaign.maxDiscountAmountMinor);
  }
  discount = Math.max(0, Math.min(discount, unitPriceMinor));
  if (discount <= 0) return none;
  return {
    estimatedDiscountMinor: discount,
    estimatedFinalUnitPriceMinor: unitPriceMinor - discount,
  };
}

/**
 * Tek kampanya kaydini public rozet projeksiyonuna cevirir. `unitPriceMinor`
 * yalnizca OTOMATIK kampanyanin guvenli nihai fiyat tahmini icindir (kupon
 * rozetinde daima null gecilir). isPublic/uygunluk cagiran tarafta dogrulanmis
 * olmalidir; ic kimlik/limit/priority/stackable BURADA SIZMAZ.
 */
function buildBadge(
  winner: CampaignRecord,
  now: Date,
  unitPriceMinor: number | null,
): PublicCampaignBadge {
  const isCoupon = winner.type === "COUPON_CODE";
  // Public kupon kodu yalnizca guvenli oldugunda tasinir; otomatik kampanyada null.
  const couponCode = isCoupon ? selectPublicCouponCode(winner, now) : null;
  const activeCoupon = isCoupon
    ? (winner.coupons.find((c) => c.code === couponCode) ?? null)
    : null;
  const estimate = isCoupon
    ? { estimatedDiscountMinor: null, estimatedFinalUnitPriceMinor: null }
    : computeAutomaticEstimate(winner, unitPriceMinor);
  return {
    kind: isCoupon ? "COUPON" : "AUTOMATIC",
    displayKind: isCoupon ? "PUBLIC_COUPON" : "AUTOMATIC_CART_DISCOUNT",
    requiresCouponCode: isCoupon,
    discountType: winner.discountType,
    discountValue: winner.discountValue,
    minOrderAmountMinor: winner.minOrderAmountMinor,
    couponCode,
    // Kod varsa CLAIM (sepete kupon olarak ekle); yoksa MANUAL_ONLY.
    couponAction: isCoupon ? (couponCode ? "CLAIM" : "MANUAL_ONLY") : "MANUAL_ONLY",
    endsAt: effectiveEndsAt(winner, activeCoupon),
    ...estimate,
    // F4A.4 — Admin-kontrollu sunum alanlari (allowlist). winner zaten isPublic
    // dogrulanmis kampanyadir; PRIVATE veri buraya ulasmaz.
    ...toCouponDisplayFields(winner),
  };
}

/**
 * F4A.6 (ADR-062) — Urun karti/detayi icin gosterim seti.
 *  - primary: birincil rozet (otomatik "Sepette" bloku ya da kupon karti).
 *  - secondaryCoupon: birincil OTOMATIK iken, tum uygun kampanyalar stackable
 *    ise EK gosterilecek public kupon; aksi halde null.
 */
export interface PublicCampaignDisplay {
  primary: PublicCampaignBadge | null;
  secondaryCoupon: PublicCampaignBadge | null;
}

/**
 * Urun icin gosterim setini secer. `campaigns` onceden store-scoped yuklenmis
 * olmalidir; burada store filtresi YAPILMAZ. `unitPriceMinor` yalnizca otomatik
 * indirimin guvenli nihai fiyat tahmini icin verilir (tek-fiyatli urunlerde;
 * fiyat araligi/bilinmiyorsa null gecilmelidir).
 *
 * Stackable kurali (checkout stacking semantigiyle tutarli): uygun kampanyalarin
 * HEPSI stackable ise otomatik "Sepette" birincil + public kupon ikincil olarak
 * BIRLIKTE gosterilir (checkout'ta da birlikte uygulanabilirler). En az biri
 * non-stackable ise (checkout'ta digerlerini bloklar) yalnizca oncelik kazanani
 * (priority DESC, id ASC) gosterilir.
 */
export function selectPublicCampaignDisplay(
  campaigns: CampaignRecord[],
  product: { id: string; categoryIds: string[] },
  now: Date,
  unitPriceMinor: number | null = null,
): PublicCampaignDisplay {
  const eligible = campaigns
    .filter((campaign) => isBadgeEligible(campaign, now))
    .filter((campaign) => campaignAppliesToProduct(campaign, product))
    .sort(compareCampaigns);
  if (eligible.length === 0) return { primary: null, secondaryCoupon: null };

  const allStackable = eligible.every((campaign) => campaign.stackable);
  if (allStackable) {
    const automatic = eligible.find((campaign) => campaign.type !== "COUPON_CODE") ?? null;
    const coupon = eligible.find((campaign) => campaign.type === "COUPON_CODE") ?? null;
    // Otomatik varsa "Sepette" fiyat blogu birincil (kod gerektirmeden uygulanir).
    const primaryRec = automatic ?? coupon!;
    const secondaryRec = automatic && coupon ? coupon : null;
    return {
      primary: buildBadge(primaryRec, now, primaryRec.type !== "COUPON_CODE" ? unitPriceMinor : null),
      secondaryCoupon: secondaryRec ? buildBadge(secondaryRec, now, null) : null,
    };
  }

  const primaryRec = eligible[0];
  return {
    primary: buildBadge(primaryRec, now, primaryRec.type !== "COUPON_CODE" ? unitPriceMinor : null),
    secondaryCoupon: null,
  };
}

/**
 * Urun icin gosterilecek BIRINCIL rozeti secer (yoksa null). Geriye-uyumlu ince
 * sarmalayici; ayrintili gosterim seti icin {@link selectPublicCampaignDisplay}.
 */
export function selectPublicCampaignBadge(
  campaigns: CampaignRecord[],
  product: { id: string; categoryIds: string[] },
  now: Date,
  unitPriceMinor: number | null = null,
): PublicCampaignBadge | null {
  return selectPublicCampaignDisplay(campaigns, product, now, unitPriceMinor).primary;
}
