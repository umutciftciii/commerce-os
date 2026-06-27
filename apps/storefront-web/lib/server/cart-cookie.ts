import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  type CartItem,
  decodeCartToken,
  encodeCartToken,
} from "../cart-token";
import type { OrderConfirmationView } from "./cart";

/**
 * Vitrin sepet cookie'si (F3B.1) — sunucu-yalniz okuma/yazma.
 *
 * Cookie httpOnly + imzalidir ve yalnizca {variantId, quantity} referansi tutar.
 * Yazma yalnizca Server Action / Route Handler baglaminda yapilabilir (Next.js
 * kisiti); okuma server bilesenlerinde serbesttir.
 */
const CART_COOKIE = "commerce_os_cart";
const COUPON_COOKIE = "commerce_os_coupon";
// F3B.2: Order olusumu sonrasi /checkout/success'in sepetten BAGIMSIZ render
// edebilmesi icin kisa omurlu, imzali onay cookie'si. Yalniz GORUNUM verisi tutar
// (siparis no/tutar/satir basliklari); secret/credential ICERMEZ.
const CONFIRMATION_COOKIE = "commerce_os_checkout_confirmation";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 gun
const CONFIRMATION_MAX_AGE_SECONDS = 60 * 10; // 10 dk

/** Sepet imza anahtari (yalnizca sunucu; NEXT_PUBLIC degil). */
function cartSecret(): string {
  return process.env.STOREFRONT_CART_SECRET ?? "storefront-dev-cart-secret";
}

/** Cookie'deki sepet kalemlerini cozer (gecersiz/kurcalanmis -> bos). */
export async function readCartItems(): Promise<CartItem[]> {
  const store = await cookies();
  return decodeCartToken(store.get(CART_COOKIE)?.value, cartSecret());
}

/** Sepet kalemlerini imzalayip cookie'ye yazar (yalniz action/route handler). */
export async function writeCartItems(items: CartItem[]): Promise<void> {
  const store = await cookies();
  if (items.length === 0) {
    store.delete(CART_COOKIE);
    return;
  }
  store.set(CART_COOKIE, encodeCartToken(items, cartSecret()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Sepeti temizler (basarili checkout sonrasi). */
export async function clearCartCookie(): Promise<void> {
  const store = await cookies();
  store.delete(CART_COOKIE);
  store.delete(COUPON_COOKIE);
}

/**
 * Uygulanan kupon kodu (hassas degil; sunucu her istekte yeniden dogrular).
 * Bos/gecersiz format -> null. Sadece [A-Z0-9-] ve max 40.
 */
export async function readCoupon(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(COUPON_COOKIE)?.value;
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  return /^[A-Z0-9-]{1,40}$/.test(normalized) ? normalized : null;
}

/** Kupon kodunu yazar (bos -> siler). */
export async function writeCoupon(code: string | null): Promise<void> {
  const store = await cookies();
  const normalized = code?.trim().toUpperCase() ?? "";
  if (!normalized || !/^[A-Z0-9-]{1,40}$/.test(normalized)) {
    store.delete(COUPON_COOKIE);
    return;
  }
  store.set(COUPON_COOKIE, normalized, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Nav rozeti icin hizli adet sayaci (gateway cagrisi olmadan, cookie'den). */
export async function getCartCount(): Promise<number> {
  const items = await readCartItems();
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/** Onay cookie govdesi icin HMAC imza (cart ile ayni secret). */
function confirmationSignature(payload: string): string {
  return createHmac("sha256", cartSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Order olusumu sonrasi onay gorunumunu kisa omurlu, imzali bir cookie'ye yazar.
 * Yalniz action/route handler baglaminda cagrilabilir. Sepet bos olsa bile
 * /checkout/success siparis ozetini bundan render eder (empty-state'e dusmez).
 */
export async function writeCheckoutConfirmationCookie(
  confirmation: OrderConfirmationView,
): Promise<void> {
  const payload = Buffer.from(JSON.stringify(confirmation)).toString("base64url");
  const value = `${payload}.${confirmationSignature(payload)}`;
  const store = await cookies();
  store.set(CONFIRMATION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: CONFIRMATION_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Onay cookie'sini dogrular ve cozer (gecersiz/kurcalanmis/yok -> null). */
export async function readCheckoutConfirmationCookie(): Promise<OrderConfirmationView | null> {
  const store = await cookies();
  const raw = store.get(CONFIRMATION_COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!safeEqual(signature, confirmationSignature(payload))) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OrderConfirmationView;
  } catch {
    return null;
  }
}

/** Onay cookie'sini siler (yalniz action/route handler). */
export async function clearCheckoutConfirmationCookie(): Promise<void> {
  const store = await cookies();
  store.delete(CONFIRMATION_COOKIE);
}
