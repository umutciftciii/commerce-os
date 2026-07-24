/**
 * TODO-160 (ADR-102/103) — Checkout attribution resolver (SUNUCU-otoriter).
 *
 * Checkout handler'ından çağrılır. GATEWAY-imzalı grant'i doğrular, tenant + pencere
 * + influencer/campaign aktifliğini DB'den YENİDEN doğrular ve OrderAttribution
 * snapshot'ı için çözülmüş attribution döner. İstemciden gelen influencer/campaign
 * alanlarına GÜVENMEZ — yalnız gateway imzasına (verifyAttributionGrant). Geçersiz
 * (imza/pencere/pasif/cross-store) → null (attribution yazılmaz; checkout etkilenmez).
 */
import type { InfluencerData, ResolvedAttribution } from "./data.js";
import { isWithinAttributionWindow, verifyAttributionGrant } from "./tracking-core.js";

export async function resolveAttributionForCheckout(
  data: InfluencerData,
  storeId: string,
  grantToken: string | null | undefined,
  secret: string,
  nowMs: number,
): Promise<ResolvedAttribution | null> {
  const payload = verifyAttributionGrant(grantToken, secret);
  if (!payload) return null;
  // Cross-store guard: grant başka mağazaya aitse KULLANILAMAZ.
  if (payload.storeId !== storeId) return null;
  // Attribution penceresi (click anındaki pencereden türetilen expiresAt).
  if (!isWithinAttributionWindow(nowMs, payload.expiresAt)) return null;

  // Durum kontrolü: influencer + campaign hâlâ VAR + ACTIVE + tutarlı (tenant).
  const influencer = await data.getInfluencer(storeId, payload.influencerId);
  if (!influencer || influencer.status !== "ACTIVE") return null;
  const campaign = await data.getCampaign(storeId, payload.campaignId);
  if (!campaign || campaign.status !== "ACTIVE" || campaign.influencerId !== influencer.id) return null;

  // Link opsiyonel (silinmişse trackingLinkId null; kampanya/influencer yeter).
  const link = payload.trackingLinkId ? await data.getTrackingLink(storeId, payload.trackingLinkId) : null;

  const snapshot: Record<string, unknown> = {
    model: "LAST_CLICK",
    influencerId: influencer.id,
    influencerName: influencer.name,
    influencerCode: influencer.code,
    campaignId: campaign.id,
    campaignName: campaign.name,
    attributionWindowDays: campaign.attributionWindowDays,
    trackingLinkId: link?.id ?? null,
    // Plain token snapshot'a YAZILMAZ (ADR-102): DB'de plain token yok; link hedef
    // yolu (targetPath) tarihsel bağlam için yeterli.
    targetType: link?.targetType ?? null,
    targetPath: link?.targetPath ?? null,
    utmSource: link?.utmSource ?? null,
    utmMedium: link?.utmMedium ?? null,
    utmCampaign: link?.utmCampaign ?? null,
    productId: link?.productId ?? null,
    productTitle: link?.productTitle ?? null,
    categoryId: link?.categoryId ?? null,
    categoryTitle: link?.categoryTitle ?? null,
    clickId: payload.clickId || null,
    clickedAt: new Date(payload.clickedAt).toISOString(),
  };

  return {
    influencerId: influencer.id,
    campaignId: campaign.id,
    trackingLinkId: link?.id ?? null,
    clickedAt: new Date(payload.clickedAt),
    snapshot,
  };
}
