/**
 * TD-130 (ADR-145…148) — Recommendation Measurement istemci izleyicisi (client-only).
 *
 * Impression/click/add-to-cart event'lerini vitrin BFF proxy'sine (`/api/recommendation/event`) gönderir —
 * gateway'e DOĞRUDAN değil (gateway URL sunucu-yalnız; kimlik/bot/hash BFF+gateway'de). Best-effort:
 * ölçüm hatası UX'i ETKİLEMEZ. Client store/kimlik/gelir OTORİTESİ DEĞİL (sunucu doğrular).
 *
 * Add-to-cart attribution: öneri kartına TIKLAMA anında bir "son-öneri-tıklama" bağlamı sessionStorage'a
 * yazılır (kısa TTL). Kullanıcı hedef PDP'de başarıyla sepete eklerse (buy-box), o bağlam TÜKETİLİR ve
 * ADD_TO_CART event'i (kaynağıyla) yazılır — SAHTE aksiyon YOK; yalnız gerçek başarılı sepete-ekleme sayılır.
 */
"use client";

export type RecommendationSource = "RECENTLY_VIEWED" | "SIMILAR_PRODUCTS";
export type RecommendationPlacement = "HOME" | "PDP" | "CART" | "ACCOUNT";
export type RecommendationEventType = "IMPRESSION" | "CLICK" | "ADD_TO_CART";

export interface RecommendationContext {
  source: RecommendationSource;
  placement: RecommendationPlacement;
  anchorProductId?: string | null;
}

const SESSION_KEY = "commerce_os_rec_session";
const ATTR_KEY = "commerce_os_rec_attr";
const ATTR_TTL_MS = 30 * 60 * 1000; // 30 dk — son-öneri-tıklama attribution penceresi
const ATTR_MAX_ENTRIES = 40;

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // fallthrough
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Per-oturum opak id (dedupe granülerliği; gateway HMAC'ler → sessionHash). */
function sessionId(): string {
  try {
    if (typeof sessionStorage === "undefined") return "";
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = randomId();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/** Event'i best-effort gönderir (IMPRESSION → sendBeacon; diğerleri → keepalive fetch). */
export function trackRecommendationEvent(
  type: RecommendationEventType,
  ctx: RecommendationContext,
  productId: string,
  dedupeKey?: string | null,
): void {
  if (!productId) return;
  const payload = JSON.stringify({
    type,
    source: ctx.source,
    placement: ctx.placement,
    productId,
    anchorProductId: ctx.anchorProductId ?? null,
    dedupeKey: dedupeKey ?? null,
  });
  const sid = sessionId();
  try {
    if (type === "IMPRESSION" && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      // sendBeacon custom header taşıyamaz → session id body'de; BFF header'a çevirir.
      const blob = new Blob([JSON.stringify({ ...JSON.parse(payload), sessionId: sid })], { type: "application/json" });
      navigator.sendBeacon("/api/recommendation/event", blob);
      return;
    }
    void fetch("/api/recommendation/event", {
      method: "POST",
      headers: { "content-type": "application/json", "x-recommendation-session": sid },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // best-effort
  }
}

interface AttrEntry {
  source: RecommendationSource;
  placement: RecommendationPlacement;
  anchorProductId: string | null;
  clickId: string;
  ts: number;
}

function readAttrMap(): Record<string, AttrEntry> {
  try {
    if (typeof sessionStorage === "undefined") return {};
    const raw = sessionStorage.getItem(ATTR_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, AttrEntry>) : {};
  } catch {
    return {};
  }
}

function writeAttrMap(map: Record<string, AttrEntry>): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    // Süresi geçenleri temizle + bounded (en yeni ATTR_MAX_ENTRIES).
    const now = Date.now();
    const entries = Object.entries(map).filter(([, v]) => now - v.ts < ATTR_TTL_MS);
    entries.sort((a, b) => b[1].ts - a[1].ts);
    const bounded = Object.fromEntries(entries.slice(0, ATTR_MAX_ENTRIES));
    sessionStorage.setItem(ATTR_KEY, JSON.stringify(bounded));
  } catch {
    // best-effort
  }
}

/**
 * Öneri kartı tıklandığında hedef ürün için attribution bağlamı yazar (hedef PDP'de sepete eklenirse
 * ADD_TO_CART bu kaynağa atfedilir). clickId nonce'u ADD_TO_CART dedupe idempotency'sinin temelidir.
 */
export function rememberRecommendationClick(ctx: RecommendationContext, productId: string): void {
  if (!productId) return;
  const map = readAttrMap();
  map[productId] = {
    source: ctx.source,
    placement: ctx.placement,
    anchorProductId: ctx.anchorProductId ?? null,
    clickId: randomId(),
    ts: Date.now(),
  };
  writeAttrMap(map);
}

/** Hedef ürün için taze attribution bağlamını TÜKETİR (okur + siler). Yoksa/eskiyse null. */
export function consumeRecommendationAttribution(productId: string): (RecommendationContext & { clickId: string }) | null {
  if (!productId) return null;
  const map = readAttrMap();
  const entry = map[productId];
  if (!entry) return null;
  const fresh = Date.now() - entry.ts < ATTR_TTL_MS;
  delete map[productId];
  writeAttrMap(map);
  if (!fresh) return null;
  return { source: entry.source, placement: entry.placement, anchorProductId: entry.anchorProductId, clickId: entry.clickId };
}
