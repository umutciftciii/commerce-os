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
 * Urun icin gosterilecek rozeti secer (yoksa null). `campaigns` onceden
 * store-scoped yuklenmis olmalidir; burada store filtresi YAPILMAZ.
 */
export function selectPublicCampaignBadge(
  campaigns: CampaignRecord[],
  product: { id: string; categoryIds: string[] },
  now: Date,
): PublicCampaignBadge | null {
  const eligible = campaigns
    .filter((campaign) => isBadgeEligible(campaign, now))
    .filter((campaign) => campaignAppliesToProduct(campaign, product))
    .sort(compareCampaigns);
  const winner = eligible[0];
  if (!winner) return null;
  const isCoupon = winner.type === "COUPON_CODE";
  // Public kupon kodu yalnizca guvenli oldugunda tasinir; otomatik kampanyada null.
  const couponCode = isCoupon ? selectPublicCouponCode(winner, now) : null;
  const activeCoupon = isCoupon
    ? (winner.coupons.find((c) => c.code === couponCode) ?? null)
    : null;
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
    // F4A.4 — Admin-kontrollu sunum alanlari (allowlist). winner zaten isPublic
    // dogrulanmis kampanyadir; PRIVATE veri buraya ulasmaz.
    ...toCouponDisplayFields(winner),
  };
}
