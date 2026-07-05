/**
 * F4A.5 — Vitrin "Kuponlarım / Tüm Kuponlar" kupon merkezi okuma katmani
 * (sunucu-yalniz). Gateway'in musteri-scoped kupon merkezi ucunu
 * (`GET /public/stores/:slug/customer/coupons`) `x-customer-session` ile cagirir
 * ve donen SUNUCU-OTORITER, ALLOWLIST'li kartlari vitrin gorunumune cevirir.
 * Indirim tutari istemcide hesaplanmaz; hazir metinler @commerce-os/utils'ten gelir.
 */
import type { PublicCouponCenterResponse, PublicCouponCenterCoupon } from "@commerce-os/api-client";
import { formatCampaignAmount, getCampaignDiscountText } from "@commerce-os/utils";
import type { StorefrontCouponCenterView } from "../catalog-types";
import { customerBasePath } from "./customer";
import { getCustomer } from "./gateway";
import { readCustomerToken } from "./customer-cookie";
import { readCoupon } from "./cart-cookie";

/** Public kupon merkezi DTO'sunu vitrin gorunumune cevirir (hazir metinler). */
function toCenterView(coupon: PublicCouponCenterCoupon): StorefrontCouponCenterView {
  return {
    code: coupon.code,
    discountText: getCampaignDiscountText({
      type: "COUPON_CODE",
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
    }),
    minOrderLabel:
      coupon.minOrderAmountMinor !== null ? formatCampaignAmount(coupon.minOrderAmountMinor) : null,
    endsAt: coupon.endsAt,
    state: coupon.state,
    source: coupon.source,
    usedAt: coupon.usedAt,
    orderNumber: coupon.orderNumber,
  };
}

export interface CouponCenterData {
  coupons: StorefrontCouponCenterView[];
  /**
   * Su an sepete uygulanmis kupon kodu (cookie). Kart bu koda esitse "Uygulandı"
   * gosterilir — KAYNAK DOGRUSU sepet couponCode cookie'sidir (server-otoriter).
   */
  appliedCode: string | null;
}

/**
 * Oturum acmis musterinin kupon merkezini dondurur. Oturum yok/gecersizse bos
 * liste (cagiran /account sayfasi zaten oturum zorunlu tutar). USED kartlar zaten
 * ayri gelir; uygulama durumu (APPLIED) sepet cookie'sinden isaretlenir.
 */
export async function getCouponCenter(): Promise<CouponCenterData> {
  const token = await readCustomerToken();
  if (!token) return { coupons: [], appliedCode: null };
  const [result, appliedCode] = await Promise.all([
    getCustomer<PublicCouponCenterResponse>(`${customerBasePath()}/coupons`, token),
    readCoupon(),
  ]);
  if (!result.ok) return { coupons: [], appliedCode };
  const coupons = result.data.coupons.map(toCenterView).map((view) =>
    // AVAILABLE kart su an sepete uygulanmissa (cookie) APPLIED'a yukseltilir.
    appliedCode && view.state === "AVAILABLE" && view.code === appliedCode
      ? { ...view, state: "APPLIED" as const }
      : view,
  );
  return { coupons, appliedCode };
}
