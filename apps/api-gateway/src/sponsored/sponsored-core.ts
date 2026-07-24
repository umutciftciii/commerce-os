import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * TODO-161 (ADR-114…120) — Sponsored Product Management SAF çekirdeği.
 *
 * DB/HTTP YOK, birim-testli. TODO-160 attribution çekirdeğinin (tracking-core)
 * event-layer desenini yeniden kullanır (ADR-091 karar 1): gateway-imzalı token
 * sign/verify (HMAC-SHA256, SESSION_SECRET), KVKK hash, bot tespiti, rapid-repeat
 * dedupe, net-gelir/refund defteri, rate-limit. Ek olarak sponsorlu yerleşime özgü
 * SAF kararlar: query normalize + relevancy kapısı (ADR-116), deterministik öncelik
 * sırası (ADR-119), kampanyalar-arası + organik dedupe (ADR-117), slot enjeksiyonu
 * (ADR-115).
 *
 * Güvenlik ilkesi (ADR-118): public event/checkout ucu authsızdır; gateway istemciden
 * gelen düz campaign/product/revenue alanlarına GÜVENMEZ. Yalnız GATEWAY'in kendi
 * SESSION_SECRET'i ile imzaladığı token'a güvenilir. Storefront token yalnız bu opak
 * imzalı payload'un taşıyıcısıdır.
 */

// Ortak KVKK-hash + bot + dedupe + net-gelir primitive'leri TODO-160 çekirdeğinden
// (kopyalanmaz — tek kaynak; ADR-091 karar 8).
export {
  hashIdentifier,
  isBotUserAgent,
  isRapidRepeatClick,
  computeNetRevenueMinor,
  reduceAttributionRevenue,
  createSlidingWindowLimiter,
  type RateLimiter,
  type RefundLedgerEntry,
  type AttributionRevenueState,
} from "../influencers/tracking-core.js";

// ── Sabitler (yeni env YOK; influencer deseni: pure-core sabitleri) ─────────────
export const SPONSORED_TOKEN_VERSION = 1;
/** Search: yalnız 1. sayfada, sayfa başına azami sponsorlu slot (ADR-115). */
export const SPONSORED_SEARCH_MAX_SLOTS = 2;
/**
 * İlk sponsorlu slot bu kadar organik kayıttan SONRA gelir. Self-merchandising'de mağaza sahibi
 * sponsorlu ürünü EN ÜSTTE bekler (standart sponsorlu yerleşim) → 0 (ilk sıra). cap=2 üst sıraları
 * sınırlar; organik sonuçlar hemen altında görünür (ADR-115 revizyonu).
 */
export const SPONSORED_SEARCH_LEAD_ORGANIC = 0;
/** Home sponsorlu vitrin azami ürün (config.maxItems tavanı). */
export const SPONSORED_HOME_MAX_SLOTS = 12;
/** Tıklama → sipariş attribution penceresi (gün). */
export const DEFAULT_SPONSORED_ATTRIBUTION_WINDOW_DAYS = 7;
/** Aynı (ziyaretçi, placement, tip) için bu pencere içinde tekrar event yeni satır AÇMAZ. */
export const SPONSORED_EVENT_DEDUPE_WINDOW_SECONDS = 1800; // 30 dk
/** Token cookie/taşıma üst-ömrü (gün). */
export const SPONSORED_TOKEN_TTL_DAYS = 7;

// ── Query / keyword normalize (locale-bağımsız; TR-I tuzağına karşı) ────────────
/**
 * Aranabilir metni normalize eder: lowercase (locale-bağımsız), Türkçe aksan sadeleştirme,
 * alfanumerik-olmayan → boşluk, tekilleştirilmiş boşluk. Hedef anahtar kelime saklama +
 * arama query token'ları AYNI zeminde olur (deterministik eşleşme).
 */
export function normalizeSearchText(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // birleşik aksan işaretleri
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Normalize edip tekrarsız token kümesi döner (boşsa boş dizi). */
export function tokenizeQuery(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const norm = normalizeSearchText(raw);
  if (!norm) return [];
  return [...new Set(norm.split(" ").filter(Boolean))];
}

/** Tek anahtar kelime normalize (saklama). Boş → null. */
export function normalizeKeyword(raw: string): string | null {
  const norm = normalizeSearchText(raw);
  return norm || null;
}

// ── Relevancy kapısı (ADR-116) ──────────────────────────────────────────────────
export interface SponsoredRelevancyDoc {
  /** ProductSearchDocument.searchText (zaten normalize; yine güvenlik için normalize edilir). */
  searchText: string;
  primaryCategoryId: string | null;
}

export interface SponsoredRelevancyCampaign {
  /** Kampanyanın normalize hedef anahtar kelimeleri (SEARCH_RESULTS). */
  keywords: readonly string[];
  /** Kategori hedefleme alt-ağaç id kümesi (targetCategoryId + descendants) ya da null. */
  targetCategoryIds: ReadonlySet<string> | null;
}

/**
 * Sponsorlu aday, KEYWORD aramasına girmeye HAK KAZANIR mı? (ADR-116)
 *
 * Bağlamlar AYRIDIR (yanlış-pozitif önleme; "ilgisiz keyword'de gösterme"):
 * - KEYWORD araması: kampanyanın hedef bir anahtar kelimesi aranan token'larla eşleşmeli VE aday
 *   ürünün metni o token'ı içermeli. Kategori hedefi keyword aramasında FALLBACK DEĞİLDİR (bir
 *   telefon-kategori kampanyası "kılıf" aramasında yalnız kategoride olduğu için gösterilmez).
 * - KATEGORİ gezinme (keyword yok): kampanya-seviyesi hedef-kategori eşleşmesi `loadActiveCandidates`
 *   içinde ayrı ele alınır (bu fonksiyon çağrılmaz); yine de query boşsa yalnız kategori hedefi geçer.
 */
export function matchesSponsoredRelevancy(
  queryTokens: readonly string[],
  doc: SponsoredRelevancyDoc,
  campaign: SponsoredRelevancyCampaign,
): boolean {
  if (queryTokens.length === 0) {
    // Query yok → yalnız kategori hedefi geçerli (aday ürün hedef kategori alt-ağacında).
    return (
      campaign.targetCategoryIds !== null &&
      doc.primaryCategoryId !== null &&
      campaign.targetCategoryIds.has(doc.primaryCategoryId)
    );
  }

  // Query var → YALNIZ kampanya kelimesi VE ürün metni token'ı eşleşmesi (kategori fallback YOK).
  const docText = ` ${normalizeSearchText(doc.searchText)} `;
  const keywordSet = new Set(campaign.keywords.filter(Boolean));
  for (const token of queryTokens) {
    if (!keywordSet.has(token)) continue;
    if (docText.includes(` ${token} `)) return true;
  }
  return false;
}

// ── Deterministik öncelik sırası (ADR-119) ──────────────────────────────────────
export interface SponsoredOrderable {
  campaignPriority: number;
  campaignCreatedAt: number; // epoch ms
  campaignId: string;
  placementPriority: number;
  /** Kampanya içi istenen slot (küçük = önce); null en sona. */
  position: number | null;
}

/** priority DESC → createdAt ASC → id ASC → placementPriority DESC → position ASC (stabil). */
export function compareSponsored(a: SponsoredOrderable, b: SponsoredOrderable): number {
  if (a.campaignPriority !== b.campaignPriority) return b.campaignPriority - a.campaignPriority;
  if (a.campaignCreatedAt !== b.campaignCreatedAt) return a.campaignCreatedAt - b.campaignCreatedAt;
  if (a.campaignId !== b.campaignId) return a.campaignId < b.campaignId ? -1 : 1;
  if (a.placementPriority !== b.placementPriority) return b.placementPriority - a.placementPriority;
  const pa = a.position ?? Number.MAX_SAFE_INTEGER;
  const pb = b.position ?? Number.MAX_SAFE_INTEGER;
  return pa - pb;
}

// ── Kampanyalar-arası dedupe (ADR-117) ──────────────────────────────────────────
/**
 * Ürün başına EN YÜKSEK öncelikli kampanya kazanır (deterministik sıra). Girdi zaten
 * `compareSponsored` ile sıralı gelmelidir; ilk görülen productId tutulur.
 */
export function dedupeSponsoredByProduct<T extends { productId: string }>(sortedCandidates: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of sortedCandidates) {
    if (seen.has(c.productId)) continue;
    seen.add(c.productId);
    out.push(c);
  }
  return out;
}

// ── Slot enjeksiyonu (ADR-115) ──────────────────────────────────────────────────
export interface SlotInjectionOptions {
  /** İlk sponsorlu slot bu kadar organik kayıttan SONRA. */
  leadOrganic: number;
  /** Sayfa başına azami sponsorlu slot. */
  maxSlots: number;
}

/**
 * Organik listeyi BOZMADAN sponsorlu ürünleri üst slotlara enjekte eder. Organik sıralama
 * DEĞİŞMEZ (ADR-091 karar 5). Sponsorlu ürünler `leadOrganic` kadar organik kayıttan sonra
 * başlar; en fazla `maxSlots` adet. Dönüş: birleşik liste (sponsorlu önce, işaretli).
 *
 * NOT: organik-tekrar dedupe'i çağıran tarafça (organikten düşürme) ÖNCEDEN yapılır; bu SAF
 * fonksiyon yalnız pozisyon yerleştirmesini yapar.
 */
export function injectSponsoredSlots<T>(
  organic: readonly T[],
  sponsored: readonly T[],
  options: SlotInjectionOptions,
): T[] {
  const capped = sponsored.slice(0, Math.max(0, options.maxSlots));
  if (capped.length === 0) return [...organic];
  const lead = Math.max(0, Math.min(options.leadOrganic, organic.length));
  return [...organic.slice(0, lead), ...capped, ...organic.slice(lead)];
}

// ── Attribution penceresi ────────────────────────────────────────────────────────
export function computeSponsoredExpiry(issuedAtMs: number, windowDays: number): number {
  const days = Number.isFinite(windowDays) && windowDays > 0 ? Math.floor(windowDays) : DEFAULT_SPONSORED_ATTRIBUTION_WINDOW_DAYS;
  return issuedAtMs + days * 24 * 60 * 60 * 1000;
}

export function isWithinSponsoredWindow(nowMs: number, expiresAtMs: number): boolean {
  return nowMs <= expiresAtMs;
}

// ── Sponsorlu token (gateway-imzalı, HMAC) ──────────────────────────────────────
export type SponsoredPlacementKind = "HOME_SHOWCASE" | "SEARCH_RESULTS";

export interface SponsoredTokenPayload {
  v: number;
  storeId: string;
  campaignId: string;
  placementId: string;
  productId: string;
  placement: SponsoredPlacementKind;
  /** epoch ms */
  issuedAt: number;
  /** epoch ms — attribution penceresi (issuedAt + window). */
  expiresAt: number;
}

function base64urlJson(payload: SponsoredTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function signPart(part: string, secret: string): string {
  return createHmac("sha256", secret).update(part).digest("base64url");
}

/** `base64url(payload).base64url(hmac)` — gateway SESSION_SECRET ile imzalar. */
export function signSponsoredToken(payload: SponsoredTokenPayload, secret: string): string {
  const body = base64urlJson(payload);
  return `${body}.${signPart(body, secret)}`;
}

/**
 * Token'ı doğrular. İmza bozuk/eksik → null. Süre kontrolü BURADA yapılmaz (çağıran `now`'a
 * göre karar verir); yalnız yapısal + imza bütünlüğü. timingSafeEqual ile sabit-zamanlı.
 */
export function verifySponsoredToken(token: string | undefined | null, secret: string): SponsoredTokenPayload | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = signPart(body, secret);
  if (!constantTimeEqual(sig, expected)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isSponsoredTokenPayload(parsed)) return null;
  return parsed;
}

function isSponsoredTokenPayload(value: unknown): value is SponsoredTokenPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.v === SPONSORED_TOKEN_VERSION &&
    typeof v.storeId === "string" &&
    typeof v.campaignId === "string" &&
    typeof v.placementId === "string" &&
    typeof v.productId === "string" &&
    (v.placement === "HOME_SHOWCASE" || v.placement === "SEARCH_RESULTS") &&
    typeof v.issuedAt === "number" &&
    typeof v.expiresAt === "number"
  );
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// ── Rapor metrik formülleri (ADR-118) ────────────────────────────────────────────
export interface SponsoredMetricsInput {
  impressions: number;
  uniqueImpressions: number;
  clicks: number;
  carts: number;
  orders: number;
  grossRevenueMinor: number;
  refundedRevenueMinor: number;
  netRevenueMinor: number;
}

export interface SponsoredMetrics extends SponsoredMetricsInput {
  clickThroughRate: number; // clicks / impressions (0..1)
  conversionRate: number; // orders / clicks (0..1)
}

/**
 * Metrikleri türetir. CTR = clicks / impressions; conversion = orders / clicks. Payda 0 → 0.
 * Bot event'ler paydaya GİRMEMİŞ olmalıdır (çağıran `isBot=false` filtreler).
 */
export function computeSponsoredMetrics(input: SponsoredMetricsInput): SponsoredMetrics {
  const clickThroughRate = input.impressions > 0 ? input.clicks / input.impressions : 0;
  const conversionRate = input.clicks > 0 ? input.orders / input.clicks : 0;
  return { ...input, clickThroughRate, conversionRate };
}
