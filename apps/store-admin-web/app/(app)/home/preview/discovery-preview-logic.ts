/**
 * TODO-162 (TD-152) — Keşif önizleme (eligibility) SALT-GÖRÜNÜM simülasyonu.
 *
 * Gateway `eligibility-core.ts` + Katman B çözümleyicisi GERÇEK doğruluk kaynağıdır (SECTION_BOUNDS, gerçek
 * ürün/indirim/sponsor durumu). Bu modül YALNIZ mağaza yöneticisine, yapılandırdığı keşif bölümlerinin farklı
 * ziyaretçi durumlarında NASIL davranacağını ÖRNEK sinyallerle açıklamak içindir — gerçek müşteri verisi
 * KULLANMAZ ve nihai kararı vermez. Bilinçli basitleştirmeler: DAILY_DEALS/SPONSORED_RAIL gibi katalog/sponsor
 * bağımlı tipler "duruma bağlı" olarak işaretlenir (sunucu karar verir).
 */

export interface PreviewSignals {
  isAuthenticated: boolean;
  recentlyViewedCount: number;
  cartItemCount: number;
  wishlistItemCount: number;
  completedOrderCount: number;
}

export type ScenarioKey =
  | "guestNoSignal"
  | "guestRecentlyViewed"
  | "guestCart"
  | "authNoHistory"
  | "authOrderHistory";

export const SCENARIO_ORDER: ScenarioKey[] = [
  "guestNoSignal",
  "guestRecentlyViewed",
  "guestCart",
  "authNoHistory",
  "authOrderHistory",
];

/** Örnek sinyal ön ayarları (gerçek veri DEĞİL — açıkça etiketli). */
export const SCENARIO_PRESETS: Record<ScenarioKey, PreviewSignals> = {
  guestNoSignal: { isAuthenticated: false, recentlyViewedCount: 0, cartItemCount: 0, wishlistItemCount: 0, completedOrderCount: 0 },
  guestRecentlyViewed: { isAuthenticated: false, recentlyViewedCount: 4, cartItemCount: 0, wishlistItemCount: 0, completedOrderCount: 0 },
  guestCart: { isAuthenticated: false, recentlyViewedCount: 2, cartItemCount: 3, wishlistItemCount: 0, completedOrderCount: 0 },
  authNoHistory: { isAuthenticated: true, recentlyViewedCount: 0, cartItemCount: 0, wishlistItemCount: 0, completedOrderCount: 0 },
  authOrderHistory: { isAuthenticated: true, recentlyViewedCount: 3, cartItemCount: 0, wishlistItemCount: 2, completedOrderCount: 5 },
};

export type PreviewReason =
  | "eligible"
  | "noSignal"
  | "requiresAuth"
  | "disabled"
  | "editorialIncomplete"
  | "gridInsufficient"
  | "dependsCatalog";

interface Bounds {
  requiresAuth: boolean;
  fallbackAllowed: boolean;
}

const BOUNDS: Record<string, Bounds> = {
  CONTINUE_BROWSING: { requiresAuth: false, fallbackAllowed: false },
  CART_RECOMMENDATIONS: { requiresAuth: false, fallbackAllowed: false },
  PERSONALIZED_DEALS: { requiresAuth: false, fallbackAllowed: false },
  REPURCHASE: { requiresAuth: true, fallbackAllowed: false },
  SIMILAR_TO_PURCHASED: { requiresAuth: true, fallbackAllowed: false },
  WISHLIST_DEALS: { requiresAuth: false, fallbackAllowed: false },
  DAILY_DEALS: { requiresAuth: false, fallbackAllowed: true },
  SPONSORED_RAIL: { requiresAuth: false, fallbackAllowed: true },
};

/** Bir rail tipinin bu senaryodaki sinyal eşiğini karşılayıp karşılamadığı (gerçek sinyal). */
function railHasSignal(type: string, s: PreviewSignals): boolean {
  switch (type) {
    case "CONTINUE_BROWSING":
      return s.recentlyViewedCount >= 2;
    case "CART_RECOMMENDATIONS":
      return s.cartItemCount >= 1;
    case "PERSONALIZED_DEALS":
      return s.recentlyViewedCount > 0 || s.cartItemCount > 0 || s.wishlistItemCount > 0;
    case "WISHLIST_DEALS":
      return s.wishlistItemCount >= 1;
    case "REPURCHASE":
    case "SIMILAR_TO_PURCHASED":
      return s.completedOrderCount >= 1;
    default:
      return false;
  }
}

export interface SectionConfigLike {
  guestSupported?: boolean;
  authSupported?: boolean;
  ctaHref?: string | null;
  titleTr?: string | null;
  titleEn?: string | null;
  cards?: Array<{ type?: unknown }>;
}

/** Audience toggle'ı: bu senaryonun kitlesi admin tarafından kapatıldıysa hidden. */
function audienceExcluded(cfg: SectionConfigLike, s: PreviewSignals): boolean {
  if (!s.isAuthenticated && cfg.guestSupported === false) return true;
  if (s.isAuthenticated && cfg.authSupported === false) return true;
  return false;
}

/** Tek bir rail (veya grid kartı) tipini değerlendir. */
function evaluateRail(type: string, cfg: SectionConfigLike, s: PreviewSignals): { rendered: boolean; reason: PreviewReason } {
  const b = BOUNDS[type];
  if (b?.requiresAuth && !s.isAuthenticated) return { rendered: false, reason: "requiresAuth" };
  if (audienceExcluded(cfg, s)) return { rendered: false, reason: s.isAuthenticated ? "noSignal" : "requiresAuth" };
  if (railHasSignal(type, s)) return { rendered: true, reason: "eligible" };
  // Sinyal yok → yalnız fallback-izinli tipler (katalog/sponsor duruma bağlı) render olabilir.
  if (b?.fallbackAllowed) return { rendered: true, reason: "dependsCatalog" };
  return { rendered: false, reason: "noSignal" };
}

export interface EvaluatedSection {
  id: string;
  type: string;
  title: string;
  rendered: boolean;
  reason: PreviewReason;
}

const DISCOVERY_TYPES = new Set([
  "CONTINUE_BROWSING",
  "CART_RECOMMENDATIONS",
  "PERSONALIZED_DEALS",
  "DAILY_DEALS",
  "REPURCHASE",
  "SIMILAR_TO_PURCHASED",
  "WISHLIST_DEALS",
  "SPONSORED_RAIL",
  "DISCOVERY_GRID",
  "EDITORIAL_CAMPAIGN",
]);

export function isDiscoveryType(type: string): boolean {
  return DISCOVERY_TYPES.has(type);
}

export interface SectionLike {
  id: string;
  type: string;
  enabled: boolean;
  title: string | null;
  config: unknown;
}

/** Bir keşif bölümünü verilen senaryo için değerlendir. */
export function evaluateSection(section: SectionLike, s: PreviewSignals): EvaluatedSection {
  const cfg = (section.config ?? {}) as SectionConfigLike;
  const title = section.title ?? "";
  if (!section.enabled) return { id: section.id, type: section.type, title, rendered: false, reason: "disabled" };

  if (section.type === "EDITORIAL_CAMPAIGN") {
    if (audienceExcluded(cfg, s)) return { id: section.id, type: section.type, title, rendered: false, reason: s.isAuthenticated ? "noSignal" : "requiresAuth" };
    const complete = Boolean((cfg.titleTr || cfg.titleEn) && cfg.ctaHref);
    return { id: section.id, type: section.type, title, rendered: complete, reason: complete ? "eligible" : "editorialIncomplete" };
  }

  if (section.type === "DISCOVERY_GRID") {
    if (audienceExcluded(cfg, s)) return { id: section.id, type: section.type, title, rendered: false, reason: s.isAuthenticated ? "noSignal" : "requiresAuth" };
    const cardTypes = Array.isArray(cfg.cards)
      ? cfg.cards.map((c) => c.type).filter((value): value is string => typeof value === "string")
      : [];
    // Grid içi EDITORIAL kart, grid config'i editoryal içerik taşıyamadığından (strict şema) uygun olamaz.
    const eligibleCards = cardTypes.filter((cardType) => cardType !== "EDITORIAL_CAMPAIGN" && evaluateRail(cardType, cfg, s).rendered).length;
    const rendered = eligibleCards >= 2;
    return { id: section.id, type: section.type, title, rendered, reason: rendered ? "eligible" : "gridInsufficient" };
  }

  const result = evaluateRail(section.type, cfg, s);
  return { id: section.id, type: section.type, title, rendered: result.rendered, reason: result.reason };
}
