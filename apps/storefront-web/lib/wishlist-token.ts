import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * TODO-159D (ADR-093) — Misafir wishlist token'ı — SAF encode/decode + HMAC imza.
 *
 * Misafir favorileri kullanıcı cihazında yalnızca `{productId}` REFERANSI olarak bir
 * httpOnly cookie'de tutulur. Fiyat/başlık/stok GİBİ hiçbir alan ve HİÇBİR kişisel
 * veri tutulmaz. Favori ürün-seviyesidir (variantId yok) → PLP/PDP durum tutarlılığı.
 * İmza, cookie gövdesinin biçimsel bütünlüğü içindir; güvenlik nihai olarak sunucu-tarafı
 * yeniden doğrulamaya dayanır (login'de merge sırasında geçersiz id'ler elenir).
 *
 * Bu modül SAF'tır (next bağımlılığı yok) ve doğrudan test edilir.
 */
export interface WishlistRef {
  productId: string;
}

const MAX_ITEMS = 100;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Referansları normalize eder: geçersiz/boş id atılır, tekrarlar birleştirilir,
 * kayıt sayısı MAX_ITEMS ile sınırlanır (en son eklenenler korunur — FIFO taşma).
 */
export function sanitizeWishlist(items: WishlistRef[]): WishlistRef[] {
  const seen = new Set<string>();
  const result: WishlistRef[] = [];
  for (const item of items) {
    const productId = typeof item?.productId === "string" ? item.productId.trim() : "";
    if (!productId || seen.has(productId)) continue;
    seen.add(productId);
    result.push({ productId });
  }
  // Taşma: en yeni girişleri koru (kuyruğun sonu).
  return result.slice(Math.max(0, result.length - MAX_ITEMS));
}

/** Referansları imzalı, opak bir cookie değerine kodlar. */
export function encodeWishlistToken(items: WishlistRef[], secret: string): string {
  const payload = Buffer.from(JSON.stringify(sanitizeWishlist(items))).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** Cookie değerini doğrular ve referanslara çözer; geçersiz/kurcalanmış → boş. */
export function decodeWishlistToken(token: string | undefined, secret: string): WishlistRef[] {
  if (!token) return [];
  const dot = token.indexOf(".");
  if (dot <= 0) return [];
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(payload, secret))) return [];
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Array.isArray(decoded)) return [];
    return sanitizeWishlist(
      decoded.map((entry) => ({
        productId: typeof entry?.productId === "string" ? entry.productId : "",
      })),
    );
  } catch {
    return [];
  }
}

/** Bir ürünü favorilere ekler (idempotent). */
export function addWishlistRef(items: WishlistRef[], productId: string): WishlistRef[] {
  return sanitizeWishlist([...items, { productId }]);
}

/** Bir ürünü favorilerden çıkarır. */
export function removeWishlistRef(items: WishlistRef[], productId: string): WishlistRef[] {
  return sanitizeWishlist(items.filter((item) => item.productId !== productId));
}

/** Favoriye ekle/çıkar (saved verilmezse ters çevirir); yeni liste + son durumu döner. */
export function toggleWishlistRef(
  items: WishlistRef[],
  productId: string,
  saved?: boolean,
): { items: WishlistRef[]; saved: boolean } {
  const has = items.some((item) => item.productId === productId);
  const next = saved ?? !has;
  return {
    items: next ? addWishlistRef(items, productId) : removeWishlistRef(items, productId),
    saved: next,
  };
}

export const wishlistTokenLimits = { MAX_ITEMS };
