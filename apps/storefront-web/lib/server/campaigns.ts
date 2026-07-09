import type { PublicCampaignBadge, PublicCampaignSlidesResponse } from "@commerce-os/api-client";
import {
  getCampaignPublicLabel,
  formatCampaignAmount,
  type CampaignLabelLocale,
} from "@commerce-os/utils";
import type { StorefrontCampaignSlide } from "../catalog-types";
import { demoStoreSlug } from "./env";
import { getPublic } from "./gateway";

/**
 * Vitrin ust band kampanya slider'i veri cozumleyici. Gateway'in AUTH
 * GEREKTIRMEYEN store-seviyesi public kampanya ucunu (`/public/stores/:slug/campaigns`)
 * cagirir ve public-safe rozet projeksiyonunu (GERCEK F4A verisi) hazir slide
 * gorunumune cevirir. Bir hata/bos durumda bos dizi doner (band fallback metne
 * duser); vitrin asla kirilmaz.
 */

function toSlide(badge: PublicCampaignBadge, locale: CampaignLabelLocale): StorefrontCampaignSlide {
  const input = {
    type: badge.kind === "COUPON" ? ("COUPON_CODE" as const) : ("AUTOMATIC_CART" as const),
    discountType: badge.discountType,
    discountValue: badge.discountValue,
  };
  // Admin sunum basligi oncelikli; yoksa indirim/kampanya turetilmis etiketi.
  const headline = badge.displayTitle ?? getCampaignPublicLabel(input, locale);
  // Ikincil metin: admin kisa aciklama ya da (varsa) alt-limit esigi.
  const detail =
    badge.shortDescription ??
    (badge.minOrderAmountMinor !== null
      ? `${formatCampaignAmount(badge.minOrderAmountMinor)} ${locale === "en" ? "and above" : "ve üzeri"}`
      : null);
  return {
    key: badge.couponCode ?? `${badge.displayKind}:${headline}`,
    headline,
    detail,
    couponCode: badge.couponCode,
  };
}

/** Aktif public kampanya slide listesi (band slider'i icin). Hata → bos dizi. */
export async function getCampaignSlides(
  locale: CampaignLabelLocale = "tr",
): Promise<StorefrontCampaignSlide[]> {
  try {
    const result = await getPublic<PublicCampaignSlidesResponse>(
      `/public/stores/${encodeURIComponent(demoStoreSlug())}/campaigns`,
    );
    if (!result.ok) return [];
    return result.data.data.map((badge) => toSlide(badge, locale));
  } catch {
    return [];
  }
}
