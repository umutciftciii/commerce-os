/**
 * TODO-162 (ADR-205) — Home Discovery section-analytics istemci izleyicisi (client-only).
 *
 * Section/card impression + product/CTA click event'lerini vitrin BFF proxy'sine (`/api/discovery/event`)
 * gönderir — gateway'e DOĞRUDAN değil (gateway URL sunucu-yalnız; kimlik/bot/hash + section/ürün sahipliği
 * BFF+gateway'de doğrulanır). Best-effort: ölçüm hatası UX'i ETKİLEMEZ. Client store/kimlik/zaman OTORİTESİ
 * DEĞİL. Yalnız RENDER EDİLEN section emit eder (ineligible section zaten sunucudan gelmez → DOM'da yoktur).
 */
"use client";

export type HomeDiscoveryEventType =
  | "SECTION_IMPRESSION"
  | "CARD_IMPRESSION"
  | "PRODUCT_CLICK"
  | "CTA_CLICK"
  | "ADD_TO_CART";

export interface DiscoveryEventInput {
  type: HomeDiscoveryEventType;
  sectionId: string;
  sectionType: string;
  eligibilitySource: string;
  productId?: string | null;
  dedupeKey?: string | null;
}

const SESSION_KEY = "commerce_os_discovery_session";

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

// ─────────────────────── Discovery → PDP → add-to-cart attribution (first-party) ───────────────────────
// Kullanıcı bir discovery kartına tıkladığında (PRODUCT_CLICK) hedef ürün için kısa ömürlü bir first-party
// bağlam sessionStorage'a yazılır. Hedef PDP'de BAŞARILI sepete-ekleme olursa bu bağlam TÜKETİLİR ve
// ADD_TO_CART event'i (bağlamın section/kaynağıyla) yazılır — SAHTE aksiyon YOK; yalnız gerçek dönüşüm sayılır.
// Kurallar: kısa TTL, product-scoped (ürün başına tek kayıt), tek-kullanımlık (consume=sil), clickId nonce
// (ADD_TO_CART dedupe idempotency temeli). Ham customerId/visitorHash TAŞIMAZ (sunucu ingest'te türetir);
// query string'de veri yok; başka ürün için kullanılamaz (anahtar productId). Doğrudan PDP ziyareti → bağlam
// yok → sahte attribution üretmez. Recommendation attribution (`lib/recommendation/track.ts`) ile simetrik
// ama AYRI anahtar/domain — çift sayım yok.

const ATTR_KEY = "commerce_os_discovery_attr";
const ATTR_TTL_MS = 30 * 60 * 1000; // 30 dk — son-keşif-tıklama attribution penceresi
const ATTR_MAX_ENTRIES = 40;

/** Per-sayfa-görünüm opak id (analytics gruplama; kalıcı DEĞİL — modül yaşam döngüsü). */
const pageViewId = randomId();

export interface DiscoveryClickContext {
  sectionId: string;
  sectionType: string;
  eligibilitySource: string;
  sponsoredCampaignId?: string | null;
}

interface AttrEntry extends DiscoveryClickContext {
  clickId: string;
  pageViewId: string;
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
 * Keşif kartı tıklandığında hedef ürün için attribution bağlamı yazar (hedef PDP'de sepete eklenirse
 * ADD_TO_CART bu bağlama atfedilir). clickId nonce'u ADD_TO_CART dedupe idempotency'sinin temelidir.
 */
export function rememberDiscoveryClick(ctx: DiscoveryClickContext, productId: string): void {
  if (!productId || !ctx.sectionId) return;
  const map = readAttrMap();
  map[productId] = {
    sectionId: ctx.sectionId,
    sectionType: ctx.sectionType,
    eligibilitySource: ctx.eligibilitySource,
    sponsoredCampaignId: ctx.sponsoredCampaignId ?? null,
    clickId: randomId(),
    pageViewId,
    ts: Date.now(),
  };
  writeAttrMap(map);
}

/** Hedef ürün için taze attribution bağlamını TÜKETİR (okur + siler). Yoksa/eskiyse null. */
export function consumeDiscoveryAttribution(
  productId: string,
): (DiscoveryClickContext & { clickId: string; pageViewId: string }) | null {
  if (!productId) return null;
  const map = readAttrMap();
  const entry = map[productId];
  if (!entry) return null;
  const fresh = Date.now() - entry.ts < ATTR_TTL_MS;
  delete map[productId];
  writeAttrMap(map);
  if (!fresh) return null;
  return {
    sectionId: entry.sectionId,
    sectionType: entry.sectionType,
    eligibilitySource: entry.eligibilitySource,
    sponsoredCampaignId: entry.sponsoredCampaignId ?? null,
    clickId: entry.clickId,
    pageViewId: entry.pageViewId,
  };
}

/**
 * Başarılı PDP sepete-ekleme sonrası çağrılır: taze keşif bağlamı varsa ADD_TO_CART yazar (tek sefer).
 * dedupeKey = clickId nonce → aynı dönüşüm iki kez sayılmaz. Bağlam yoksa NO-OP (doğrudan PDP → event yok).
 */
export function trackDiscoveryAddToCart(productId: string): void {
  const attribution = consumeDiscoveryAttribution(productId);
  if (!attribution) return;
  emitDiscoveryEvent({
    type: "ADD_TO_CART",
    sectionId: attribution.sectionId,
    sectionType: attribution.sectionType,
    eligibilitySource: attribution.eligibilitySource,
    productId,
    dedupeKey: `atc:${attribution.clickId}`,
  });
}

/** Event'i best-effort gönderir (impression → sendBeacon; tıklama → keepalive fetch). */
export function emitDiscoveryEvent(input: DiscoveryEventInput): void {
  const payload = {
    type: input.type,
    sectionId: input.sectionId,
    sectionType: input.sectionType,
    eligibilitySource: input.eligibilitySource,
    productId: input.productId ?? null,
    placement: "HOME" as const,
    dedupeKey: input.dedupeKey ?? null,
  };
  const sid = sessionId();
  try {
    const isImpression = input.type === "SECTION_IMPRESSION" || input.type === "CARD_IMPRESSION";
    if (isImpression && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      // sendBeacon custom header taşıyamaz → session id body'de; BFF header'a çevirir.
      const blob = new Blob([JSON.stringify({ ...payload, sessionId: sid })], { type: "application/json" });
      navigator.sendBeacon("/api/discovery/event", blob);
      return;
    }
    void fetch("/api/discovery/event", {
      method: "POST",
      headers: { "content-type": "application/json", "x-discovery-session": sid },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // best-effort
  }
}
