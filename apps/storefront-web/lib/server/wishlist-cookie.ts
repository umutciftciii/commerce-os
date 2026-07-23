import { cookies } from "next/headers";
import { optionalEnvString } from "@commerce-os/utils";
import {
  type WishlistRef,
  decodeWishlistToken,
  encodeWishlistToken,
} from "../wishlist-token";

/**
 * TODO-159D (ADR-093) — Misafir wishlist cookie'si — sunucu-yalnız okuma/yazma.
 *
 * Cookie httpOnly + imzalıdır ve yalnızca `{productId}` referansı tutar (kişisel veri
 * veya fiyat snapshot'ı YOK). Yazma yalnızca Server Action / Route Handler bağlamında
 * yapılabilir (Next.js kısıtı); okuma server bileşenlerinde serbesttir. İmza anahtarı
 * sepetle aynı gizli anahtarı paylaşır (STOREFRONT_CART_SECRET; boş/whitespace → dev
 * fallback, bkz. cart-cookie.ts TD-038 deseni).
 */
const WISHLIST_COOKIE = "commerce_os_wishlist";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 gün

function wishlistSecret(): string {
  return optionalEnvString(process.env.STOREFRONT_CART_SECRET) ?? "storefront-dev-cart-secret";
}

/** Cookie'deki misafir favori referanslarını çözer (geçersiz/kurcalanmış → boş). */
export async function readWishlistRefs(): Promise<WishlistRef[]> {
  const store = await cookies();
  return decodeWishlistToken(store.get(WISHLIST_COOKIE)?.value, wishlistSecret());
}

/** Referansları imzalayıp cookie'ye yazar (yalnız action/route handler). */
export async function writeWishlistRefs(items: WishlistRef[]): Promise<void> {
  const store = await cookies();
  if (items.length === 0) {
    store.delete(WISHLIST_COOKIE);
    return;
  }
  store.set(WISHLIST_COOKIE, encodeWishlistToken(items, wishlistSecret()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Misafir favori cookie'sini temizler (login sonrası merge tamamlanınca). */
export async function clearWishlistCookie(): Promise<void> {
  const store = await cookies();
  store.delete(WISHLIST_COOKIE);
}
