import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * TODO-168 (ADR-267) — ANONIM cart-change meta token'i (SAF; next bağımlılığı yok, doğrudan test edilir).
 *
 * Birincil `commerce_os_cart` cookie'si DEĞİŞMEZ ({variantId, quantity}). Bu AYRI, imzalı,
 * SÜRÜMLÜ `commerce_os_cart_meta` cookie'si satır başına add-time REFERANS snapshot'ı + onaylanan
 * fingerprint kümesini taşır. Cookie OTORİTE DEĞİL — fiyat/stok her okumada gateway'de taze türetilir;
 * snapshot yalnız "neyin değiştiğini" açıklayan karşılaştırma referansıdır. Bozuk/eski cookie → null
 * (fail-safe: taze baseline; birincil sepeti ASLA bozmaz). Compact tek-harf anahtarlar + epoch-saniye
 * ile byte-bütçesi altında kalır; aşımda önce en eski INFO/senkron snapshot budanır (WARN/BLOCKING korunur).
 */
export interface CartMetaSnapshot {
  u: number; // addedUnitPriceMinor
  l: number | null; // addedListPriceMinor (compareAt)
  d: number | null; // addedDiscountedUnitPriceMinor
  c: string; // currency
  k: 0 | 1; // inStock
  o: 0 | 1; // orderable
  t: number; // addedAt (epoch seconds)
}

export interface CartMeta {
  v: number; // schema version (bilinmeyen/eski → discard + re-baseline)
  cid: string; // minted cart id (fingerprint bağlaması + orphan tespiti)
  s: Record<string, CartMetaSnapshot>; // variantId → snapshot
  a: string[]; // acknowledged fingerprints (bounded)
}

export const CART_META_VERSION = 1;
export const CART_META_MAX_ACKS = 100;
/** Confirmation cookie ile aynı güvenli sınır (imzalı değer 4 KB altında kalmalı). */
export const CART_META_BUDGET_BYTES = 3800;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}
function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Yeni bir cart id üretir (opak; PII değil). */
export function mintCartId(): string {
  return randomUUID();
}

/** Boş meta (verilen cid ile). */
export function emptyCartMeta(cid: string): CartMeta {
  return { v: CART_META_VERSION, cid, s: {}, a: [] };
}

/** Meta'yı imzalı, opak bir cookie değerine kodlar. */
export function encodeCartMeta(meta: CartMeta, secret: string): string {
  const payload = base64url(JSON.stringify(meta));
  return `${payload}.${sign(payload, secret)}`;
}

function isSnapshot(x: unknown): x is CartMetaSnapshot {
  if (typeof x !== "object" || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.u === "number" &&
    (s.l === null || typeof s.l === "number") &&
    (s.d === null || typeof s.d === "number") &&
    typeof s.c === "string" &&
    (s.k === 0 || s.k === 1) &&
    (s.o === 0 || s.o === 1) &&
    typeof s.t === "number"
  );
}

/**
 * Cookie değerini doğrular ve meta'ya çözer. Kurcalanmış/bozuk/eski-sürüm → null (fail-safe:
 * çağıran taze baseline kurar; birincil sepet ETKİLENMEZ).
 */
export function decodeCartMeta(token: string | undefined, secret: string): CartMeta | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(payload, secret))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof decoded !== "object" || decoded === null) return null;
    if (decoded.v !== CART_META_VERSION) return null; // sürüm uyuşmazlığı → discard (re-baseline)
    if (typeof decoded.cid !== "string" || !decoded.cid) return null;
    const rawS = (decoded.s ?? {}) as Record<string, unknown>;
    const s: Record<string, CartMetaSnapshot> = {};
    for (const [variantId, snap] of Object.entries(rawS)) {
      if (typeof variantId === "string" && variantId && isSnapshot(snap)) s[variantId] = snap;
    }
    const a = Array.isArray(decoded.a) ? decoded.a.filter((x): x is string => typeof x === "string") : [];
    return { v: CART_META_VERSION, cid: decoded.cid, s, a };
  } catch {
    return null;
  }
}

/** Meta'yı byte-bütçesi altında imzalı cookie değerine seri hale getirir (severity-farkında budama). */
export function serializeCartMetaWithinBudget(
  meta: CartMeta,
  secret: string,
  keepVariantIds: ReadonlySet<string> = new Set(),
): { token: string; pruned: boolean } {
  const working: CartMeta = { v: CART_META_VERSION, cid: meta.cid, s: { ...meta.s }, a: [...meta.a] };
  // Ack listesini önce kap (ucuz).
  if (working.a.length > CART_META_MAX_ACKS) working.a = working.a.slice(-CART_META_MAX_ACKS);

  const sizeOf = () => Buffer.byteLength(encodeCartMeta(working, secret), "utf8");
  if (sizeOf() <= CART_META_BUDGET_BYTES) return { token: encodeCartMeta(working, secret), pruned: false };

  let pruned = false;
  // Budama önceliği (en az önemliden): 1) keep-set DIŞI snapshot (en eski `t` önce) →
  // 2) en eski ack (baştan; en yeni tail korunur) → 3) keep snapshot (son çare; en yenisi korunur).
  // WARN/BLOCKING snapshot'lar (keep-set) ack'lerden ÖNCE değil, en son budanır → asla kayıp WARN.
  const droppable = Object.entries(working.s)
    .filter(([vid]) => !keepVariantIds.has(vid))
    .sort((a, b) => a[1].t - b[1].t)
    .map(([vid]) => vid);
  let di = 0;
  while (sizeOf() > CART_META_BUDGET_BYTES && di < droppable.length) {
    delete working.s[droppable[di++]];
    pruned = true;
  }
  while (sizeOf() > CART_META_BUDGET_BYTES && working.a.length > 0) {
    working.a.shift(); // en eski ack'i düşür (en yeni tail korunur)
    pruned = true;
  }
  if (sizeOf() > CART_META_BUDGET_BYTES) {
    const keepEntries = Object.entries(working.s)
      .sort((a, b) => a[1].t - b[1].t)
      .map(([vid]) => vid);
    for (let i = 0; i < keepEntries.length - 1; i++) {
      if (sizeOf() <= CART_META_BUDGET_BYTES) break;
      delete working.s[keepEntries[i]];
      pruned = true;
    }
  }
  return { token: encodeCartMeta(working, secret), pruned };
}
