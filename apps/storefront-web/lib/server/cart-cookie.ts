import { cookies } from "next/headers";
import {
  type CartItem,
  decodeCartToken,
  encodeCartToken,
} from "../cart-token";

/**
 * Vitrin sepet cookie'si (F3B.1) — sunucu-yalniz okuma/yazma.
 *
 * Cookie httpOnly + imzalidir ve yalnizca {variantId, quantity} referansi tutar.
 * Yazma yalnizca Server Action / Route Handler baglaminda yapilabilir (Next.js
 * kisiti); okuma server bilesenlerinde serbesttir.
 */
const CART_COOKIE = "commerce_os_cart";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 gun

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
}

/** Nav rozeti icin hizli adet sayaci (gateway cagrisi olmadan, cookie'den). */
export async function getCartCount(): Promise<number> {
  const items = await readCartItems();
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
