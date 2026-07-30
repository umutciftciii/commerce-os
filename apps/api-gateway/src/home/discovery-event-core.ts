/**
 * TODO-162 (ADR-205) — Home Discovery section-analytics SAF çekirdeği (DB/HTTP YOK).
 *
 * Section/event/source allowlist doğrulaması + kayıt-uygunluğu (bot/prefetch/kimlik kapıları) + dedupe.
 * **Yalnızca RENDER EDİLEN section event üretir**; eligibility=false ise impression yazılmaz (kural
 * çağıran katmanda: hidden section için bu çekirdek hiç çağrılmaz). Sponsored kartları AYRICA mevcut
 * SponsoredProductEvent token ölçümünü kullanır (çift-ölçüm değil). RecommendationEvent/SponsoredProductEvent
 * çekirdeklerinden BAĞIMSIZ; yalnız ortak KVKK hash/bot yardımcıları paylaşılır.
 */

import { DISCOVERY_SECTION_TYPES, SECTION_BOUNDS } from "./eligibility-core.js";

export const HOME_DISCOVERY_EVENT_TYPES = [
  "SECTION_IMPRESSION",
  "CARD_IMPRESSION",
  "PRODUCT_CLICK",
  "CTA_CLICK",
  "ADD_TO_CART",
] as const;

export type HomeDiscoveryEventType = (typeof HOME_DISCOVERY_EVENT_TYPES)[number];

const TYPE_SET = new Set<string>(HOME_DISCOVERY_EVENT_TYPES);

export function isAllowedDiscoveryEventType(value: string): value is HomeDiscoveryEventType {
  return TYPE_SET.has(value);
}

/**
 * Analytics'e kabul edilen section tipleri: yönetilen discovery rail tipleri + DISCOVERY_GRID konteyneri.
 * Kaynak-doğrusu SECTION_BOUNDS (DISCOVERY_SECTION_TYPES); grid ayrıca eklenir (BOUNDS'ta değil, §6).
 */
const SECTION_TYPE_SET = new Set<string>([...DISCOVERY_SECTION_TYPES, "DISCOVERY_GRID"]);

export function isAllowedDiscoverySectionType(value: string): boolean {
  return SECTION_TYPE_SET.has(value);
}

/**
 * eligibilitySource allowlist'i SECTION_BOUNDS.source değerlerinden TÜRETİLİR (drift yok) + grid konteyneri
 * için "DISCOVERY". Uydurma/serbest source etiketiyle funnel kirliliğini engeller (analytics kırılım kapısı).
 */
const ELIGIBILITY_SOURCE_SET = new Set<string>([
  ...Object.values(SECTION_BOUNDS).map((b) => b.source),
  "DISCOVERY",
]);

export function isAllowedDiscoveryEligibilitySource(value: string): boolean {
  return ELIGIBILITY_SOURCE_SET.has(value);
}

/** clickThroughRate = productClicks / cardImpressions; payda 0 → 0. 4 ondalığa yuvarlanır (sunum tutarlılığı). */
export function computeDiscoveryCtr(cardImpressions: number, productClicks: number): number {
  if (cardImpressions <= 0) return 0;
  return Math.round((productClicks / cardImpressions) * 10000) / 10000;
}

export interface DiscoveryRecordEligibilityInput {
  isBot: boolean;
  isPrefetch: boolean;
  hasIdentity: boolean;
  /** Section bu render'da eligible + görünür müydü? Hidden section ASLA event üretmez (§22). */
  sectionRendered: boolean;
}

/**
 * Event yazılmalı mı? Bot/prefetch → ASLA. Kimlik yoksa → ASLA. Section render edilmediyse → ASLA
 * (eligibility=false → impression yok). PRODUCT_CLICK/CTA_CLICK/ADD_TO_CART productId taşıyabilir ama
 * SECTION_IMPRESSION productId'siz de geçerlidir (o yüzden hasProduct kapısı YOK).
 */
export function shouldRecordDiscoveryEvent(input: DiscoveryRecordEligibilityInput): boolean {
  if (input.isBot) return false;
  if (input.isPrefetch) return false;
  if (!input.hasIdentity) return false;
  if (!input.sectionRendered) return false;
  return true;
}

/**
 * Dedupe penceresi (saniye). Impression'lar geniş pencere (tekrar-gösterim gürültüsü); tıklama/sepet
 * kısa pencere (çift-tetik guard). ADD_TO_CART pencere-bazlı dedupe uygulamaz (dedupeKey idempotency).
 */
export function discoveryDedupeWindowSecondsFor(
  eventType: HomeDiscoveryEventType,
  windows: { impressionSeconds: number; interactionSeconds: number },
): number {
  if (eventType === "SECTION_IMPRESSION" || eventType === "CARD_IMPRESSION") {
    return Math.max(0, windows.impressionSeconds);
  }
  if (eventType === "ADD_TO_CART") return 0;
  return Math.max(0, windows.interactionSeconds);
}
