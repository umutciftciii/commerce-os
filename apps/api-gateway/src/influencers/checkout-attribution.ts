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
import {
  evaluateConversionEligibility,
  isWithinAttributionWindow,
  normalizeCampaignStatus,
  normalizeLinkStatus,
  verifyAttributionGrant,
} from "./tracking-core.js";

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

  // Durum kontrolü: influencer + campaign hâlâ VAR + tutarlı (tenant).
  const influencer = await data.getInfluencer(storeId, payload.influencerId);
  if (!influencer) return null;
  const campaign = await data.getCampaign(storeId, payload.campaignId);
  if (!campaign || campaign.influencerId !== influencer.id) return null;

  // Link opsiyonel (silinmişse trackingLinkId null; kampanya/influencer yeter).
  const link = payload.trackingLinkId ? await data.getTrackingLink(storeId, payload.trackingLinkId) : null;
  // Link kampanyaya ait olmalı (aksi halde snapshot tutarsız → attribution yazma).
  if (link && link.campaignId !== campaign.id) return null;

  // Attribution kapanış politikası (ADR-173): PAUSED/ENDED pencere-içi eski session
  // conversion üretir; CANCELLED/DRAFT ve REVOKED link üretmez; pencere dışı üretmez.
  const eligible = evaluateConversionEligibility({
    campaignStatus: normalizeCampaignStatus(campaign.status),
    linkStatus: link ? normalizeLinkStatus(link.status) : null,
    influencerActive: influencer.status === "ACTIVE",
    withinWindow: isWithinAttributionWindow(nowMs, payload.expiresAt),
  });
  if (!eligible) return null;

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
