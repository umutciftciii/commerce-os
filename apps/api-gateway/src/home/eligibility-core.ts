/**
 * TODO-162 (ADR-197…ADR-204) — Storefront Discovery & Merchandising eligibility SAF çekirdeği.
 *
 * DB/HTTP YOK. Bir Home section'ının render edilip edilmeyeceğine karar veren merkezi, sunucu-tarafı,
 * birim-testli resolver. Kural: **bir section yalnızca gerçek/doğrulanmış sinyal eşik değerini
 * karşılıyorsa eligible'dır**; aksi halde DOM'a hiç eklenmez (boş başlık/spacing/impression yok).
 *
 * Merkezi min/max invariant'ı (SECTION_BOUNDS) burada tanımlıdır. Admin yalnızca **max'ı düşürebilir**;
 * **min eligibility'yi düşüremez** (ADR-199). Kişiselleştirilmiş section'da **fallback yasak** (ADR-200):
 * kullanıcı sinyali yoksa gizlenir. Public yanıt `reason` ALANINI ASLA DÖNMEZ (yalnız server-log/debug).
 */

// ───────────────────────────── Section taksonomisi ─────────────────────────────

/** Fold-altı / grid kartı olabilen tüm section-benzeri tipler. HomeSection.type String allowlist'i. */
export const DISCOVERY_SECTION_TYPES = [
  "CONTINUE_BROWSING",
  "CART_RECOMMENDATIONS",
  "PERSONALIZED_DEALS",
  "REPURCHASE",
  "SIMILAR_TO_PURCHASED",
  "WISHLIST_DEALS",
  "DAILY_DEALS",
  "EDITORIAL_CAMPAIGN",
  "SPONSORED_RAIL",
  "GENERIC_PRODUCT_RAIL",
] as const;

export type DiscoverySectionType = (typeof DISCOVERY_SECTION_TYPES)[number];

/** DISCOVERY_GRID içinde bir kart olarak yer alabilen tipler (§6). */
export const DISCOVERY_GRID_CARD_TYPES = [
  "CONTINUE_BROWSING",
  "CART_RECOMMENDATIONS",
  "PERSONALIZED_DEALS",
  "EDITORIAL_CAMPAIGN",
  "DAILY_DEALS",
] as const;

export type DiscoveryGridCardType = (typeof DISCOVERY_GRID_CARD_TYPES)[number];

// ───────────────────────────── Merkezi min/max invariant (§17) ─────────────────────────────

export interface SectionBounds {
  /** İş-invariant'ı asgari eligible ürün. Admin BUNU DÜŞÜREMEZ. */
  min: number;
  /** İş-invariant'ı azami. Admin config.maxItems ile YALNIZ bunu düşürebilir. */
  max: number;
  /** Kişiselleştirilmiş sinyal olmadan render edilebilir mi (§18)? */
  fallbackAllowed: boolean;
  /** Yalnız authenticated kullanıcı için mi (§12/§13)? */
  requiresAuth: boolean;
  /** Analytics eligibilitySource etiketi. */
  source: string;
}

/**
 * ADR-199 — tek doğruluk kaynağı. Storefront/admin/analytics hepsi buradan okur.
 * min = fallback'siz sinyal eşiği; max = sunum tavanı; fallbackAllowed = §18 politikası.
 */
export const SECTION_BOUNDS: Record<DiscoverySectionType, SectionBounds> = {
  CONTINUE_BROWSING: { min: 2, max: 4, fallbackAllowed: false, requiresAuth: false, source: "RECENTLY_VIEWED" },
  CART_RECOMMENDATIONS: { min: 3, max: 8, fallbackAllowed: false, requiresAuth: false, source: "CART" },
  PERSONALIZED_DEALS: { min: 3, max: 8, fallbackAllowed: false, requiresAuth: false, source: "PERSONALIZED_SIGNAL" },
  REPURCHASE: { min: 2, max: 6, fallbackAllowed: false, requiresAuth: true, source: "ORDER_HISTORY" },
  SIMILAR_TO_PURCHASED: { min: 3, max: 8, fallbackAllowed: false, requiresAuth: true, source: "ORDER_HISTORY" },
  WISHLIST_DEALS: { min: 2, max: 6, fallbackAllowed: false, requiresAuth: false, source: "WISHLIST" },
  DAILY_DEALS: { min: 4, max: 12, fallbackAllowed: true, requiresAuth: false, source: "DISCOUNTED_CATALOG" },
  EDITORIAL_CAMPAIGN: { min: 1, max: 1, fallbackAllowed: true, requiresAuth: false, source: "EDITORIAL" },
  SPONSORED_RAIL: { min: 3, max: 8, fallbackAllowed: true, requiresAuth: false, source: "SPONSORED" },
  GENERIC_PRODUCT_RAIL: { min: 4, max: 12, fallbackAllowed: true, requiresAuth: false, source: "CATALOG" },
};

const BOUNDS_SET = new Set<string>(DISCOVERY_SECTION_TYPES);

export function isDiscoverySectionType(value: string): value is DiscoverySectionType {
  return BOUNDS_SET.has(value);
}

const GRID_CARD_SET = new Set<string>(DISCOVERY_GRID_CARD_TYPES);

export function isDiscoveryGridCardType(value: string): value is DiscoveryGridCardType {
  return GRID_CARD_SET.has(value);
}

// ───────────────────────────── Context + girdi + sonuç ─────────────────────────────

/**
 * §4 — kanonik sinyal anlık görüntüsü (bir render için bir kez hesaplanır). Kimlik alanları
 * sunucu-otoritesidir (customerId client'tan alınmaz). `visitorHash` store-scoped'tur.
 */
export interface HomeEligibilityContext {
  storeId: string;
  visitorHash: string | null;
  customerId: string | null;
  isAuthenticated: boolean;
  recentlyViewedCount: number;
  cartItemCount: number;
  wishlistItemCount: number;
  completedOrderCount: number;
  recommendationCount: number;
  activeCampaignProductCount: number;
  eligibleSponsoredProductCount: number;
  locale: "tr" | "en";
  currency: string;
}

/**
 * Section-özel eligibility girdisi (= sectionConfig + o section için ÇÖZÜLMÜŞ aday sayısı).
 * Pahalı çözümü çağıran katman yapar (filtreli, deduplike, active+in-stock); engine yalnız
 * invariant/fallback/auth kapılarını uygular.
 */
export interface HomeSectionEligibilityConfig {
  type: string;
  /** O section için gerçek, filtrelenmiş, deduplike aday ürün/öğe sayısı. */
  candidateCount: number;
  /** Kişiselleştirilmiş section'lar için: en az bir gerçek kullanıcı sinyali var mı (§9/§18)? */
  signalPresent?: boolean;
  /** Admin tavanı — YALNIZ bounds.max'ı düşürebilir (min'i düşüremez). */
  adminMaxItems?: number | null;
  /** Admin: guest kullanıcıya gösterilsin mi (varsayılan true). */
  guestSupported?: boolean;
  /** Admin: authenticated kullanıcıya gösterilsin mi (varsayılan true). */
  authSupported?: boolean;
  /** Admin fallback'i KAPATABİLİR (yalnızca fallback zaten izinliyken; asla açamaz). */
  fallbackDisabledByAdmin?: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  /** Public yanıta ASLA konmaz — yalnız server-log/debug (§4). */
  reason: string;
  /** Render edilecek nihai öğe sayısı (eligible değilse 0). */
  itemCount: number;
  source: string;
  fallbackAllowed: boolean;
}

function ineligible(reason: string, source: string, fallbackAllowed: boolean): EligibilityResult {
  return { eligible: false, reason, itemCount: 0, source, fallbackAllowed };
}

/**
 * Merkezi eligibility resolver (§4). Sırayla: bilinen tip → auth kapısı → viewer-desteği →
 * no-signal (fallback yasağı) → admin-max-invariant → eşik. Hepsi geçerse eligible + itemCount.
 */
export function resolveHomeSectionEligibility(
  context: HomeEligibilityContext,
  section: HomeSectionEligibilityConfig,
): EligibilityResult {
  if (!isDiscoverySectionType(section.type)) {
    return ineligible("UNKNOWN_TYPE", "UNKNOWN", false);
  }
  const bounds = SECTION_BOUNDS[section.type];
  const fallbackAllowed = bounds.fallbackAllowed && section.fallbackDisabledByAdmin !== true;

  // Auth kapısı (§12/§13) — yalnız-auth section guest'te ASLA render edilmez.
  if (bounds.requiresAuth && !context.isAuthenticated) {
    return ineligible("AUTH_REQUIRED", bounds.source, fallbackAllowed);
  }

  // Viewer-desteği (admin §23). Varsayılan: her ikisi de destekli.
  if (context.isAuthenticated && section.authSupported === false) {
    return ineligible("AUTH_DISABLED", bounds.source, fallbackAllowed);
  }
  if (!context.isAuthenticated && section.guestSupported === false) {
    return ineligible("GUEST_DISABLED", bounds.source, fallbackAllowed);
  }

  // No-signal fallback yasağı (§18). fallback izinli değilse ve sinyal yoksa → gizle.
  if (!fallbackAllowed && section.signalPresent === false) {
    return ineligible("NO_SIGNAL", bounds.source, fallbackAllowed);
  }

  // Admin-max invariant (§17). Admin min'i düşüremez; max'ı min'in altına indirirse section
  // etkin biçimde eligible OLAMAZ (gizlenir) — sahte "yetersiz ürün" gösterilmez.
  const effectiveMax = resolveEffectiveMax(bounds, section.adminMaxItems);
  if (effectiveMax < bounds.min) {
    return ineligible("ADMIN_MAX_BELOW_MIN", bounds.source, fallbackAllowed);
  }

  // Eşik (§17). candidateCount çözülmüş (filtreli/deduplike) sayıdır.
  const candidateCount = Math.max(0, Math.floor(section.candidateCount));
  if (candidateCount < bounds.min) {
    return ineligible("BELOW_THRESHOLD", bounds.source, fallbackAllowed);
  }

  const itemCount = Math.min(candidateCount, effectiveMax);
  return { eligible: true, reason: "OK", itemCount, source: bounds.source, fallbackAllowed };
}

/** Admin max'ı [1, bounds.max] aralığına kelepçele; sağlanmazsa bounds.max. Min asla değişmez. */
export function resolveEffectiveMax(bounds: SectionBounds, adminMaxItems: number | null | undefined): number {
  if (adminMaxItems == null || !Number.isFinite(adminMaxItems)) return bounds.max;
  const clamped = Math.floor(adminMaxItems);
  if (clamped < 1) return 1;
  if (clamped > bounds.max) return bounds.max;
  return clamped;
}

// ───────────────────────────── DISCOVERY_GRID grid kuralı (§6) ─────────────────────────────

export const DISCOVERY_GRID_MIN_CARDS = 2;
export const DISCOVERY_GRID_MAX_CARDS = 4;

export interface DiscoveryGridCardInput {
  type: DiscoveryGridCardType;
  eligible: boolean;
  /** Admin sırası (küçük önce). Eligibility'yi ETKİLEMEZ — yalnız sıralar (§6). */
  order: number;
}

export interface DiscoveryGridResult {
  eligible: boolean;
  reason: string;
  /** Admin sırasında, eligible ve max 4 ile kelepçelenmiş kart tipleri. */
  cards: DiscoveryGridCardType[];
  /** Kolon sayısı = kart sayısı (2→2, 3→3, 4→4). 1 kart → grid render edilmez. */
  columns: number;
}

/**
 * Grid kuralı (§6): yalnız eligible kartlar; min 2 / max 4; 1 kart → grid render EDİLMEZ.
 * Kartlar admin sırasında sıralanır (eligibility admin tarafından değiştirilemez).
 */
export function resolveDiscoveryGrid(cards: readonly DiscoveryGridCardInput[]): DiscoveryGridResult {
  const eligible = cards
    .filter((c) => c.eligible)
    .slice()
    .sort((a, b) => a.order - b.order || a.type.localeCompare(b.type))
    .slice(0, DISCOVERY_GRID_MAX_CARDS)
    .map((c) => c.type);

  if (eligible.length < DISCOVERY_GRID_MIN_CARDS) {
    return { eligible: false, reason: "INSUFFICIENT_CARDS", cards: [], columns: 0 };
  }
  return { eligible: true, reason: "OK", cards: eligible, columns: eligible.length };
}
