import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TODO-160 (ADR-102…107) — Influencer Tracking & Attribution SAF çekirdeği.
 *
 * DB/HTTP YOK. Token üretimi, gateway-imzalı attribution grant sign/verify, KVKK
 * uyumlu hash'leme (ham IP/UA saklamadan), bot tespiti, rapid-repeat dedupe kararı,
 * güvenli hedef yol çözümü, attribution penceresi, net-gelir (append-only iade
 * defterinden türetilmiş) ve rapor metrik formülleri. Tümü birim-testlidir.
 *
 * Güvenlik ilkesi (ADR-102): public checkout ucu authsızdır; gateway istemciden
 * gelen düz influencer/campaign alanlarına GÜVENMEZ. Yalnız GATEWAY'in kendi
 * SESSION_SECRET'i ile imzaladığı grant'e güvenilir. Storefront cookie yalnız bu
 * opak imzalı token'ın taşıyıcısıdır.
 */

// ── Sabitler / varsayılanlar ────────────────────────────────────────────────
export const ATTRIBUTION_GRANT_VERSION = 1;
export const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 30;
export const MIN_ATTRIBUTION_WINDOW_DAYS = 1;
export const MAX_ATTRIBUTION_WINDOW_DAYS = 365;
export const DEFAULT_ATTRIBUTION_COOKIE_TTL_DAYS = 30;
/** Aynı ziyaretçi+link için bu pencere içindeki tekrar tıklama yeni satır AÇMAZ. */
export const DEFAULT_CLICK_DEDUPE_WINDOW_SECONDS = 1800; // 30 dk
/** KVKK: AttributionClick ham verisi bu süreden sonra budanabilir (ADR-106). */
export const DEFAULT_CLICK_RETENTION_DAYS = 180;
export const TRACKING_TOKEN_BYTES = 18; // 144-bit opak, base64url ~24 karakter

// ── Opak token üretimi ──────────────────────────────────────────────────────
/**
 * Anlamlı-id-TAŞIMAYAN, tahmin-edilemez opak token. base64url (URL-safe, padding
 * yok). Enumeration'a dayanıklı (144-bit rastgele).
 */
export function generateTrackingToken(): string {
  return randomBytes(TRACKING_TOKEN_BYTES).toString("base64url");
}

const TRACKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** Public route param'ının kaba biçim kontrolü (DB'ye gitmeden reddetme). */
export function isValidTrackingTokenFormat(token: string | undefined | null): boolean {
  return typeof token === "string" && TRACKING_TOKEN_PATTERN.test(token);
}

/**
 * Tracking token'ının DB LOOKUP hash'i (ADR-102). Plain token DB'de SAKLANMAZ;
 * yalnız bu HMAC-SHA256(secret, token) hex saklanır. Public route gelen token'ı
 * aynı fonksiyonla hash'leyip `tokenHash` üzerinden arar. DB sızıntısında plain
 * URL'ler geri elde edilemez (defense-in-depth). Deterministik + tuzlanmış.
 */
export function hashTrackingToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

// ── KVKK uyumlu hash (ham PII saklamadan) ───────────────────────────────────
/**
 * Tuzlu HMAC-SHA256 (hex). visitorId/ip/ua ham DEĞİL bu hash saklanır. Boş/undefined
 * girdi → null (opsiyonel alanlar saklanmaz).
 */
export function hashIdentifier(value: string | undefined | null, secret: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return createHmac("sha256", secret).update(trimmed).digest("hex");
}

/** Referrer'dan yalnız HOST (path/query atılır — veri minimizasyonu). */
export function resolveReferrerHost(referrer: string | undefined | null): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    return url.host || null;
  } catch {
    return null;
  }
}

// ── Bot tespiti ─────────────────────────────────────────────────────────────
const BOT_UA_PATTERN =
  /(bot|crawler|spider|crawl|slurp|mediapartners|facebookexternalhit|embedly|quora link preview|whatsapp|telegrambot|discordbot|slackbot|preview|scan|curl|wget|python-requests|httpclient|headless|phantomjs|puppeteer|playwright|lighthouse|pingdom|uptime|monitor)/i;

/** Bilinen bot/crawler/preview UA'ları. Boş UA da bot sayılır (tarayıcı değil). */
export function isBotUserAgent(userAgent: string | undefined | null): boolean {
  if (!userAgent || !userAgent.trim()) return true;
  return BOT_UA_PATTERN.test(userAgent);
}

// ── Güvenli hedef yol (open-redirect yok) ───────────────────────────────────
export interface TrackingTargetInput {
  targetType: "HOME" | "PRODUCT" | "CATEGORY" | "PATH";
  targetPath: string | null | undefined;
}

/**
 * Store-içi güvenli yola çevirir. YALNIZ tek-slash iç yol ("/..") kabul edilir;
 * "//", şema (":"), backslash, boşluk reddedilir → güvenli fallback "/". Bu, açık
 * yönlendirmeyi (open redirect) kökten engeller.
 */
export function resolveSafeTargetPath(input: TrackingTargetInput): string {
  const raw = (input.targetPath ?? "").trim();
  return sanitizeInternalPath(raw);
}

export function sanitizeInternalPath(raw: string, fallback = "/"): string {
  if (!raw) return fallback;
  // Sadece "/" ile başlayan, "//" ile başlamayan, şema/backslash/whitespace/geri-
  // yönü olmayan yollar. Query/hash korunur ama host'a kaçış engellenir.
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\s\\]/.test(raw)) return fallback;
  if (raw.includes("://")) return fallback;
  if (raw.includes("..")) return fallback;
  return raw;
}

// ── Attribution grant (gateway-imzalı, HMAC) ────────────────────────────────
export interface AttributionGrantPayload {
  v: number;
  storeId: string;
  influencerId: string;
  campaignId: string;
  trackingLinkId: string;
  clickId: string;
  /** epoch ms */
  clickedAt: number;
  /** epoch ms — click anındaki kampanya penceresinden türetilir. */
  expiresAt: number;
}

function base64urlJson(payload: AttributionGrantPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function signPart(part: string, secret: string): string {
  return createHmac("sha256", secret).update(part).digest("base64url");
}

/** `base64url(payload).base64url(hmac)` — gateway SESSION_SECRET ile imzalar. */
export function signAttributionGrant(payload: AttributionGrantPayload, secret: string): string {
  const body = base64urlJson(payload);
  return `${body}.${signPart(body, secret)}`;
}

/**
 * Grant'i doğrular. İmza bozuk/eksik → null (sessiz tolerans). Süre kontrolü
 * BURADA yapılmaz (checkout katmanı `now`'a göre karar verir) — yalnız yapısal +
 * imza bütünlüğü. timingSafeEqual ile sabit-zamanlı karşılaştırma.
 */
export function verifyAttributionGrant(
  token: string | undefined | null,
  secret: string,
): AttributionGrantPayload | null {
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
  if (!isGrantPayload(parsed)) return null;
  return parsed;
}

function isGrantPayload(value: unknown): value is AttributionGrantPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.v === ATTRIBUTION_GRANT_VERSION &&
    typeof v.storeId === "string" &&
    typeof v.influencerId === "string" &&
    typeof v.campaignId === "string" &&
    typeof v.trackingLinkId === "string" &&
    typeof v.clickId === "string" &&
    typeof v.clickedAt === "number" &&
    typeof v.expiresAt === "number"
  );
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// ── Attribution penceresi ───────────────────────────────────────────────────
export function clampAttributionWindowDays(days: number | undefined | null): number {
  const n = typeof days === "number" && Number.isFinite(days) ? Math.floor(days) : DEFAULT_ATTRIBUTION_WINDOW_DAYS;
  if (n < MIN_ATTRIBUTION_WINDOW_DAYS) return MIN_ATTRIBUTION_WINDOW_DAYS;
  if (n > MAX_ATTRIBUTION_WINDOW_DAYS) return MAX_ATTRIBUTION_WINDOW_DAYS;
  return n;
}

/** Click anındaki pencereden bitiş anı (epoch ms). */
export function computeAttributionExpiry(clickedAtMs: number, windowDays: number): number {
  return clickedAtMs + clampAttributionWindowDays(windowDays) * 24 * 60 * 60 * 1000;
}

/** Sipariş anı penceredeyse true. Sınır dahil değil (now <= expiresAt). */
export function isWithinAttributionWindow(nowMs: number, expiresAtMs: number): boolean {
  return nowMs <= expiresAtMs;
}

// ── Rapid-repeat dedupe ─────────────────────────────────────────────────────
/**
 * Aynı ziyaretçi+link için son tıklama `lastClickAtMs` verildiğinde, `nowMs` dedupe
 * penceresi içindeyse YENİ SATIR açılmamalıdır (true = dedupe/atlama). Son tıklama
 * yoksa (null) her zaman kaydedilir.
 */
export function isRapidRepeatClick(
  lastClickAtMs: number | null | undefined,
  nowMs: number,
  windowSeconds: number = DEFAULT_CLICK_DEDUPE_WINDOW_SECONDS,
): boolean {
  if (lastClickAtMs == null) return false;
  return nowMs - lastClickAtMs < windowSeconds * 1000;
}

// ── Net gelir (append-only iade defterinden) ────────────────────────────────
/** İade toplamı gross'u aşamaz; net = max(0, gross - refunded). */
export function computeNetRevenueMinor(grossMinor: number, refundedMinor: number): number {
  const refunded = Math.max(0, Math.min(refundedMinor, grossMinor));
  return Math.max(0, grossMinor - refunded);
}

export interface RefundLedgerEntry {
  refundKey: string;
  amountMinor: number;
}

export interface AttributionRevenueState {
  grossRevenueMinor: number;
  refundedRevenueMinor: number;
  netRevenueMinor: number;
}

/**
 * Append-only iade defterinden gelir durumunu türetir. Aynı refundKey birden çok
 * kez verilse bile (idempotency) BİR KEZ sayılır. Toplam iade gross'a clamp edilir.
 */
export function reduceAttributionRevenue(
  grossMinor: number,
  entries: readonly RefundLedgerEntry[],
): AttributionRevenueState {
  const seen = new Set<string>();
  let refunded = 0;
  for (const entry of entries) {
    if (seen.has(entry.refundKey)) continue;
    seen.add(entry.refundKey);
    refunded += Math.max(0, entry.amountMinor);
  }
  refunded = Math.min(refunded, grossMinor);
  return {
    grossRevenueMinor: grossMinor,
    refundedRevenueMinor: refunded,
    netRevenueMinor: computeNetRevenueMinor(grossMinor, refunded),
  };
}

// ── Rapor metrik formülleri ─────────────────────────────────────────────────
export interface AttributionMetricsInput {
  totalClicks: number;
  uniqueVisitors: number;
  attributedOrders: number;
  grossRevenueMinor: number;
  refundedRevenueMinor: number;
  netRevenueMinor: number;
}

export interface AttributionMetrics extends AttributionMetricsInput {
  conversionRate: number; // 0..1
  averageOrderValueMinor: number;
}

/**
 * Metrikleri türetir (ADR-105). conversionRate = attributedOrders / uniqueVisitors;
 * AOV = grossRevenue / attributedOrders. Payda 0 → 0. Bot click paydaya GİRMEMİŞ
 * olmalıdır (çağıran taraf `isBot=false` filtreler).
 */
export function computeAttributionMetrics(input: AttributionMetricsInput): AttributionMetrics {
  const conversionRate = input.uniqueVisitors > 0 ? input.attributedOrders / input.uniqueVisitors : 0;
  const averageOrderValueMinor =
    input.attributedOrders > 0 ? Math.round(input.grossRevenueMinor / input.attributedOrders) : 0;
  return { ...input, conversionRate, averageOrderValueMinor };
}

// ── Basit sliding-window rate limiter (SAF, injectable) ─────────────────────
export interface RateLimiter {
  /** true = izin verildi, false = limit aşıldı. */
  hit(key: string, nowMs: number): boolean;
  /** Test/bakım için: eski pencereleri temizle. */
  prune(nowMs: number): void;
}

/**
 * Anahtar başına kayan pencere sayacı (in-memory). Public tracking route + invalid
 * token yanıtları için (enumeration/DoS yavaşlatma). I/O YOK — tamamen deterministik.
 */
export function createSlidingWindowLimiter(maxHits: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key, nowMs) {
      const cutoff = nowMs - windowMs;
      const arr = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (arr.length >= maxHits) {
        hits.set(key, arr);
        return false;
      }
      arr.push(nowMs);
      hits.set(key, arr);
      return true;
    },
    prune(nowMs) {
      const cutoff = nowMs - windowMs;
      for (const [key, arr] of hits) {
        const kept = arr.filter((t) => t > cutoff);
        if (kept.length === 0) hits.delete(key);
        else hits.set(key, kept);
      }
    },
  };
}

// ── code normalize (influencer human-readable kimlik) ───────────────────────
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,47}$/;

/** Influencer code: locale-BAĞIMSIZ uppercase + trim (TR-I tuzağına karşı A-Z0-9_-). */
export function normalizeInfluencerCode(raw: string): string {
  return raw
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "")
    .toUpperCase();
}

export function isValidInfluencerCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}
