/**
 * TODO-161 (ADR-118/120) — Sponsorlu checkout attribution resolver (SUNUCU-otoriter).
 *
 * Checkout handler'ından çağrılır. GATEWAY-imzalı sponsorlu token'ları doğrular, tenant +
 * pencere + kampanya aktifliğini DB'den YENİDEN doğrular ve OrderSponsoredAttribution için
 * çözülmüş attribution listesi döner. İstemciden gelen campaign/product/revenue alanlarına
 * GÜVENMEZ — yalnız gateway imzasına (verifySponsoredToken). Gelir sipariş SATIRINDAN türetilir
 * (route). Influencer attribution'dan BAĞIMSIZ (ADR-120 coexistence). Geçersiz token → atlanır.
 */
import type { SponsoredData, ResolvedSponsoredAttribution } from "./data.js";
import { isWithinSponsoredWindow, verifySponsoredToken } from "./sponsored-core.js";

export async function resolveSponsoredForCheckout(
  data: SponsoredData,
  storeId: string,
  grantTokens: readonly string[] | null | undefined,
  secret: string,
  nowMs: number,
): Promise<ResolvedSponsoredAttribution[]> {
  if (!grantTokens || grantTokens.length === 0) return [];

  const out: ResolvedSponsoredAttribution[] = [];
  const seen = new Set<string>(); // (campaignId, productId) — aynı grant iki kez gelirse tek attribution

  for (const token of grantTokens) {
    const payload = verifySponsoredToken(token, secret);
    if (!payload) continue;
    // Cross-store guard: token başka mağazaya aitse KULLANILAMAZ.
    if (payload.storeId !== storeId) continue;
    // Attribution penceresi (token'daki expiresAt).
    if (!isWithinSponsoredWindow(nowMs, payload.expiresAt)) continue;

    const dedupeKey = `${payload.campaignId}:${payload.productId}`;
    if (seen.has(dedupeKey)) continue;

    // Durum kontrolü: kampanya hâlâ VAR + ACTIVE + aynı tenant (last-check server-otoriter).
    const campaign = await data.getCampaign(storeId, payload.campaignId);
    if (!campaign || campaign.status !== "ACTIVE") continue;

    seen.add(dedupeKey);
    out.push({
      campaignId: campaign.id,
      placementId: payload.placementId || null,
      productId: payload.productId,
      snapshot: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        placement: payload.placement,
        placementId: payload.placementId || null,
        productId: payload.productId,
        clickedAt: new Date(payload.issuedAt).toISOString(),
      },
    });
  }

  return out;
}
