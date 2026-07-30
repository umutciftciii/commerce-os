/**
 * TODO-162 (ADR-197/202/204) — Katman B Discovery orchestration SAF çekirdeği (DB/HTTP YOK).
 *
 * Eligibility motorunu (eligibility-core) ürün id listeleri üzerinde uygular: ucuz sinyal-kapısı
 * (heavy query'den önce), page-level dedupe (seen-set) ve eşik-tekrar-kontrolü. Tümü birim-testli.
 * Projeksiyon/sponsored token/editorial endpoint'e aittir (bu çekirdek yalnız KARAR + SIRA + DEDUPE).
 */

import {
  SECTION_BOUNDS,
  isDiscoverySectionType,
  resolveEffectiveMax,
  resolveHomeSectionEligibility,
  type DiscoverySectionType,
  type HomeEligibilityContext,
  type HomeSectionEligibilityConfig,
} from "./eligibility-core.js";

export interface SectionSignalGate {
  /** Heavy query denemeye değer mi (ucuz context sinyali min'e ulaşabilir mi)? */
  attempt: boolean;
  /** Gerçek kullanıcı sinyali var mı (§9/§18 no-fallback kararı için)? */
  signalPresent: boolean;
}

/**
 * Ucuz ön-kapı (§4 adım 3): SADECE context sayaçlarına bakar; heavy query'yi gereksiz yere çalıştırmamak
 * için. attempt=false → section için ürün sorgusu YAPILMAZ. signalPresent → no-fallback kararında kullanılır.
 * Auth-only tipler guest'te attempt=false (eligibility-core zaten AUTH_REQUIRED verir; burada erken çıkış).
 */
export function sectionSignalGate(
  context: HomeEligibilityContext,
  type: DiscoverySectionType,
): SectionSignalGate {
  const min = SECTION_BOUNDS[type].min;
  switch (type) {
    case "CONTINUE_BROWSING":
      return { attempt: context.recentlyViewedCount >= min, signalPresent: context.recentlyViewedCount >= 1 };
    case "CART_RECOMMENDATIONS":
      return { attempt: context.cartItemCount >= 1, signalPresent: context.cartItemCount >= 1 };
    case "PERSONALIZED_DEALS": {
      const hasSignal =
        context.wishlistItemCount >= 1 ||
        context.recentlyViewedCount >= 1 ||
        context.cartItemCount >= 1 ||
        (context.isAuthenticated && context.completedOrderCount >= 1);
      return { attempt: hasSignal, signalPresent: hasSignal };
    }
    case "REPURCHASE":
    case "SIMILAR_TO_PURCHASED":
      return {
        attempt: context.isAuthenticated && context.completedOrderCount >= 1,
        signalPresent: context.completedOrderCount >= 1,
      };
    case "WISHLIST_DEALS":
      return { attempt: context.wishlistItemCount >= min, signalPresent: context.wishlistItemCount >= min };
    case "DAILY_DEALS":
    case "EDITORIAL_CAMPAIGN":
    case "SPONSORED_RAIL":
    case "GENERIC_PRODUCT_RAIL":
      // Generic/fallback-izinli: kullanıcı sinyali zorunlu değil → her zaman dene.
      return { attempt: true, signalPresent: true };
    default:
      return { attempt: false, signalPresent: false };
  }
}

/**
 * Page-level dedupe (§19/ADR-204): candidate id'lerini `seen`'e ve section-içi tekrara karşı süz (SIRA korunur).
 * Yalnız daha önce görülmemiş id'ler kalır. Mutasyon YOK — süzülmüş listeyi döner.
 */
export function dedupeProductIds(
  candidateIds: readonly string[],
  seen: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  const local = new Set<string>();
  for (const id of candidateIds) {
    if (seen.has(id) || local.has(id)) continue;
    local.add(id);
    out.push(id);
  }
  return out;
}

export interface FinalizeInput {
  type: DiscoverySectionType;
  /** Aktif+stokta+SIRALI aday ürün id'leri (çağıran katman projekte+filtrele yapar). */
  candidateIds: readonly string[];
  signalPresent: boolean;
  adminMaxItems?: number | null;
  guestSupported?: boolean;
  authSupported?: boolean;
  fallbackDisabledByAdmin?: boolean;
}

export interface FinalizeResult {
  eligible: boolean;
  reason: string;
  source: string;
  /** Seçilen (dedupe + eşik + cap sonrası) ürün id'leri, sırayla. */
  productIds: string[];
}

/**
 * Bir rail'i sonlandır (§4 adım 6-8): dedupe → eşik-tekrar-kontrolü (eligibility-core) → cap.
 * Eligible ise seçilen id'ler `seen`'e EKLENİR (sonraki section'lar için dedupe). Değilse `seen` değişmez.
 * Dedupe sonrası min bozulursa gizlenir; ilgisiz ürün EKLENMEZ (ADR-204).
 */
export function finalizeRail(
  context: HomeEligibilityContext,
  input: FinalizeInput,
  seen: Set<string>,
): FinalizeResult {
  if (!isDiscoverySectionType(input.type)) {
    return { eligible: false, reason: "UNKNOWN_TYPE", source: "UNKNOWN", productIds: [] };
  }
  const deduped = dedupeProductIds(input.candidateIds, seen);
  const config: HomeSectionEligibilityConfig = {
    type: input.type,
    candidateCount: deduped.length,
    signalPresent: input.signalPresent,
    adminMaxItems: input.adminMaxItems,
    guestSupported: input.guestSupported,
    authSupported: input.authSupported,
    fallbackDisabledByAdmin: input.fallbackDisabledByAdmin,
  };
  const decision = resolveHomeSectionEligibility(context, config);
  if (!decision.eligible) {
    return { eligible: false, reason: decision.reason, source: decision.source, productIds: [] };
  }
  const selected = deduped.slice(0, decision.itemCount);
  for (const id of selected) seen.add(id);
  return { eligible: true, reason: "OK", source: decision.source, productIds: selected };
}

/** Admin config'inden effective max (bounds.max ile kelepçeli). Endpoint bounded query limit'i için kullanır. */
export function candidateFetchLimit(type: DiscoverySectionType, adminMaxItems: number | null | undefined): number {
  return resolveEffectiveMax(SECTION_BOUNDS[type], adminMaxItems);
}
