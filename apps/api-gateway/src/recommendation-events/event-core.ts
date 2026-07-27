/**
 * TD-130 (ADR-145…148) — Recommendation Measurement SAF çekirdeği (DB/HTTP YOK).
 *
 * source/placement/type ALLOWLIST doğrulaması, kayıt-uygunluğu (bot/prefetch/kimlik/ürün kapıları),
 * dedupe penceresi kararı ve CTR formülü. Tümü birim-testlidir. İnfluencer/sponsored çekirdekten
 * BAĞIMSIZ (ayrı davranış-event domaini); yalnız ortak KVKK hash/bot yardımcıları paylaşılır.
 */

export const RECOMMENDATION_SOURCES = ["RECENTLY_VIEWED", "SIMILAR_PRODUCTS"] as const;
export const RECOMMENDATION_PLACEMENTS = ["HOME", "PDP", "CART", "ACCOUNT"] as const;
export const RECOMMENDATION_EVENT_TYPES = ["IMPRESSION", "CLICK", "ADD_TO_CART"] as const;

export type RecommendationSource = (typeof RECOMMENDATION_SOURCES)[number];
export type RecommendationPlacement = (typeof RECOMMENDATION_PLACEMENTS)[number];
export type RecommendationEventTypeValue = (typeof RECOMMENDATION_EVENT_TYPES)[number];

const SOURCE_SET = new Set<string>(RECOMMENDATION_SOURCES);
const PLACEMENT_SET = new Set<string>(RECOMMENDATION_PLACEMENTS);
const TYPE_SET = new Set<string>(RECOMMENDATION_EVENT_TYPES);

export function isAllowedSource(value: string): value is RecommendationSource {
  return SOURCE_SET.has(value);
}
export function isAllowedPlacement(value: string): value is RecommendationPlacement {
  return PLACEMENT_SET.has(value);
}
export function isAllowedEventType(value: string): value is RecommendationEventTypeValue {
  return TYPE_SET.has(value);
}

export interface RecordEligibilityInput {
  isBot: boolean;
  isPrefetch: boolean;
  hasIdentity: boolean;
  hasProduct: boolean;
}

/**
 * Event yazılmalı mı? Bot/prefetch → ASLA (satır üretilmez). Kimlik yoksa (customer/visitor/session)
 * → yazılmaz (first-party kimlik zorunlu). Ürün yoksa → yazılmaz. Zaman/store/kimlik sunucu otoritesidir.
 */
export function shouldRecordEvent(input: RecordEligibilityInput): boolean {
  if (input.isBot) return false;
  if (input.isPrefetch) return false;
  if (!input.hasIdentity) return false;
  if (!input.hasProduct) return false;
  return true;
}

/**
 * Dedupe penceresi (saniye) — event tipine göre. IMPRESSION geniş (tekrar gösterim gürültüsünü bastır),
 * CLICK kısa (çift-tıklama guard), ADD_TO_CART pencere-bazlı DEĞİL (idempotency dedupeKey ile → 0 döner:
 * bu tip için zaman-pencere dedupe uygulanmaz, yalnız dedupeKey lookup'ı). ADR-147.
 */
export function dedupeWindowSecondsFor(
  eventType: RecommendationEventTypeValue,
  windows: { impressionSeconds: number; clickSeconds: number },
): number {
  if (eventType === "IMPRESSION") return Math.max(0, windows.impressionSeconds);
  if (eventType === "CLICK") return Math.max(0, windows.clickSeconds);
  return 0; // ADD_TO_CART → dedupeKey idempotency (zaman-pencere yok)
}

/** Son event `lastAtMs` verildiğinde `nowMs` dedupe penceresi içindeyse true (YENİ satır AÇMA). */
export function isWithinDedupeWindow(
  lastAtMs: number | null | undefined,
  nowMs: number,
  windowSeconds: number,
): boolean {
  if (lastAtMs == null) return false;
  if (windowSeconds <= 0) return false;
  return nowMs - lastAtMs < windowSeconds * 1000;
}

/** CTR = clicks / impressions; payda 0 → 0. 4 ondalığa yuvarlanır (sunum tutarlılığı). */
export function computeCtr(impressions: number, clicks: number): number {
  if (impressions <= 0) return 0;
  return Math.round((clicks / impressions) * 10000) / 10000;
}
