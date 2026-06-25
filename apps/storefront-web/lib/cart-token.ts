import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Vitrin sepet token'i (F3B.1) — saf encode/decode + HMAC imza.
 *
 * Sepet, kullanici cihazinda yalnizca {variantId, quantity} REFERANSI olarak bir
 * httpOnly cookie'de tutulur. Fiyat/baslik/salesMode/stok GIBI hicbir otoriter
 * alan cookie'de TUTULMAZ; bunlar her istekte gateway'den yeniden cozulur. Imza,
 * cookie govdesinin bicimsel butunlugu icindir (kurcalanmis/bozuk cookie reddedilir);
 * guvenlik nihai olarak imzaya degil, siparis aninda sunucu-tarafi yeniden
 * dogrulamaya dayanir.
 *
 * Bu modul SAFtir (next bagimligi yok) ve dogrudan test edilir.
 */
export interface CartItem {
  variantId: string;
  quantity: number;
}

const MAX_ITEMS = 100;
const MAX_QUANTITY = 999;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Sepet kalemlerini imzali, opak bir cookie degerine kodlar. */
export function encodeCartToken(items: CartItem[], secret: string): string {
  const payload = base64url(JSON.stringify(sanitizeItems(items)));
  return `${payload}.${sign(payload, secret)}`;
}

/** Cookie degerini dogrular ve kalemlere cozer; gecersiz/kurcalanmis -> bos sepet. */
export function decodeCartToken(token: string | undefined, secret: string): CartItem[] {
  if (!token) return [];
  const dot = token.indexOf(".");
  if (dot <= 0) return [];
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payload, secret);
  if (!safeEqual(signature, expected)) return [];
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Array.isArray(decoded)) return [];
    return sanitizeItems(
      decoded.map((entry) => ({
        variantId: typeof entry?.variantId === "string" ? entry.variantId : "",
        quantity: typeof entry?.quantity === "number" ? entry.quantity : 0,
      })),
    );
  } catch {
    return [];
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Kalemleri normalize eder: gecersiz id/adet atilir, ayni varyant birlestirilir,
 * adet [1, MAX_QUANTITY] araligina kirpilir, kalem sayisi MAX_ITEMS ile sinirlanir.
 */
export function sanitizeItems(items: CartItem[]): CartItem[] {
  const merged = new Map<string, number>();
  for (const item of items) {
    const variantId = typeof item.variantId === "string" ? item.variantId.trim() : "";
    const quantity = Number.isFinite(item.quantity) ? Math.floor(item.quantity) : 0;
    if (!variantId || quantity <= 0) continue;
    const next = Math.min((merged.get(variantId) ?? 0) + quantity, MAX_QUANTITY);
    merged.set(variantId, next);
  }
  return [...merged.entries()].slice(0, MAX_ITEMS).map(([variantId, quantity]) => ({ variantId, quantity }));
}

/** Tek bir varyantin adedini ekler/gunceller (quantity<=0 ise kaldirir). */
export function upsertItem(items: CartItem[], variantId: string, quantity: number): CartItem[] {
  const others = items.filter((item) => item.variantId !== variantId);
  if (quantity <= 0) return sanitizeItems(others);
  return sanitizeItems([...others, { variantId, quantity }]);
}

/** Bir varyanti tamamen sepetten cikarir. */
export function removeItem(items: CartItem[], variantId: string): CartItem[] {
  return sanitizeItems(items.filter((item) => item.variantId !== variantId));
}

/** Mevcut adede ekleme yapar (add-to-cart). */
export function addItem(items: CartItem[], variantId: string, quantity: number): CartItem[] {
  const current = items.find((item) => item.variantId === variantId)?.quantity ?? 0;
  return upsertItem(items, variantId, current + quantity);
}

export const cartTokenLimits = { MAX_ITEMS, MAX_QUANTITY };
