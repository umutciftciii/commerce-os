import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { optionalEnvString } from "@commerce-os/utils";
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
// F4A.3 (ADR-060) — Misafir cuzdani: kod ile "claim" edilmis kupon kodlari.
// Hassas degil; gateway her istekte yeniden dogrular ve kart durumunu hesaplar.
// Oturum acmis musteride cuzdan DB'de tutulur; bu cookie yine de zararsizdir.
const CLAIMED_COUPONS_COOKIE = "commerce_os_claimed_coupons";
const MAX_CLAIMED_CODES = 20;
// TODO-125: Musterinin sectigi kargo secenegi (= ShippingRatePlan.id). Hassas
// degil; gateway her istekte gecerlilik/ait-olma dogrulamasi yapar ve ucreti
// secilen plandan YENIDEN hesaplar (istemci fiyatina guvenilmez).
const SHIPPING_OPTION_COOKIE = "commerce_os_shipping_option";
// F3B.2: Order olusumu sonrasi /checkout/success'in sepetten BAGIMSIZ render
// edebilmesi icin kisa omurlu, imzali onay cookie'si. Yalniz GORUNUM verisi tutar
// (siparis no/tutar/satir basliklari); secret/credential ICERMEZ.
const CONFIRMATION_COOKIE = "commerce_os_checkout_confirmation";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 gun
const CONFIRMATION_MAX_AGE_SECONDS = 60 * 10; // 10 dk

/**
 * Sepet imza anahtari (yalnizca sunucu; NEXT_PUBLIC degil). TD-038: bos/whitespace
 * `STOREFRONT_CART_SECRET` "yok" sayilir ve dev fallback'e duser; boylece `KEY=`
 * bos degeri bos-string HMAC anahtari uretmez. Deger loglanmaz.
 */
function cartSecret(): string {
  return optionalEnvString(process.env.STOREFRONT_CART_SECRET) ?? "storefront-dev-cart-secret";
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
  store.delete(SHIPPING_OPTION_COOKIE);
  store.delete(CLAIMED_COUPONS_COOKIE);
}

/** Normalize kupon kodu (gateway ile ayni kural: trim + upper + [A-Z0-9-] max 40). */
function normalizeClaimedCode(raw: string): string | null {
  const normalized = raw.trim().toUpperCase();
  return /^[A-Z0-9-]{1,40}$/.test(normalized) ? normalized : null;
}

/**
 * F4A.3 — Misafir cuzdanindaki claim edilmis kupon kodlari. Gecersiz format
 * atilir; tekrarlar teklestirilir. Oturum acmis musteride cuzdan DB'dedir; bu
 * cookie yine gateway'e gonderilir (birlestirilir) ve zararsizdir.
 */
export async function readClaimedCoupons(): Promise<string[]> {
  const store = await cookies();
  const raw = store.get(CLAIMED_COUPONS_COOKIE)?.value;
  if (!raw) return [];
  try {
    const decoded = JSON.parse(raw);
    if (!Array.isArray(decoded)) return [];
    const codes = decoded
      .map((entry) => (typeof entry === "string" ? normalizeClaimedCode(entry) : null))
      .filter((code): code is string => code !== null);
    return [...new Set(codes)].slice(0, MAX_CLAIMED_CODES);
  } catch {
    return [];
  }
}

/** Bir kupon kodunu misafir cuzdanina ekler (dedup + sinir). */
export async function addClaimedCoupon(code: string): Promise<void> {
  const normalized = normalizeClaimedCode(code);
  if (!normalized) return;
  const current = await readClaimedCoupons();
  if (current.includes(normalized)) return;
  const next = [...current, normalized].slice(0, MAX_CLAIMED_CODES);
  const store = await cookies();
  store.set(CLAIMED_COUPONS_COOKIE, JSON.stringify(next), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Secilen kargo secenegi (= ratePlanId). Gecersiz format -> null. */
export async function readShippingOption(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(SHIPPING_OPTION_COOKIE)?.value;
  if (!raw) return null;
  return /^[A-Za-z0-9_-]{1,120}$/.test(raw) ? raw : null;
}

/** Secilen kargo secenegini yazar (bos/gecersiz -> siler). */
export async function writeShippingOption(optionId: string | null): Promise<void> {
  const store = await cookies();
  const value = optionId?.trim() ?? "";
  if (!value || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) {
    store.delete(SHIPPING_OPTION_COOKIE);
    return;
  }
  store.set(SHIPPING_OPTION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
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
