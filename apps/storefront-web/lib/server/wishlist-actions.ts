"use server";

/**
 * TODO-159D (ADR-093) — Wishlist mutasyon Server Action'ları.
 *
 * Oturum açmış müşteride gateway'in `x-customer-session` korumalı `/wishlist/*` uçlarına
 * iletir (ownership/store-scope gateway'de zorlanır). Misafirde imzalı cookie'yi günceller.
 * Favori HER ZAMAN ürün-seviyesidir (variantId yok) → PLP/PDP durum tutarlılığı.
 */
import {
  CUSTOMER_WISHLIST_MERGE_MAX_ITEMS,
  type CustomerWishlistToggleResponse,
} from "@commerce-os/api-client";
import { sendCustomer } from "./gateway";
import { customerBasePath } from "./customer";
import { readCustomerToken } from "./customer-cookie";
import {
  clearWishlistCookie,
  readWishlistRefs,
  writeWishlistRefs,
} from "./wishlist-cookie";
import { toggleWishlistRef } from "../wishlist-token";

export type WishlistToggleResult =
  | { ok: true; saved: boolean }
  | { ok: false; code: string };

/**
 * Bir ürünü favorilere ekler/çıkarır. `saved` verilirse idempotenttir (çift-tık güvenli);
 * verilmezse mevcut durumu ters çevirir. Oturum → gateway, misafir → cookie.
 */
export async function toggleWishlistAction(
  productId: string,
  saved?: boolean,
): Promise<WishlistToggleResult> {
  const trimmed = productId.trim();
  if (!trimmed) return { ok: false, code: "INVALID_PRODUCT" };
  const token = await readCustomerToken();
  if (token) {
    const result = await sendCustomer<CustomerWishlistToggleResponse>(
      "POST",
      `${customerBasePath()}/wishlist/toggle`,
      token,
      { productId: trimmed, saved },
    );
    if (!result.ok) return { ok: false, code: result.code ?? "WISHLIST_TOGGLE_FAILED" };
    return { ok: true, saved: result.data.data.saved };
  }
  // Misafir: cookie üzerinde toggle.
  const refs = await readWishlistRefs();
  const next = toggleWishlistRef(refs, trimmed, saved);
  await writeWishlistRefs(next.items);
  return { ok: true, saved: next.saved };
}

/**
 * Login sonrası misafir favorilerini müşterinin varsayılan wishlist'ine idempotent
 * merge eder ve başarılıysa misafir cookie'sini temizler. HTTP tamamen başarısızsa
 * cookie KORUNUR (sessiz veri kaybı yok — sonraki oturumda tekrar denenir).
 */
export async function mergeGuestWishlistAction(): Promise<void> {
  const token = await readCustomerToken();
  if (!token) return;
  const refs = await readWishlistRefs();
  if (refs.length === 0) return;
  const items = refs
    .slice(0, CUSTOMER_WISHLIST_MERGE_MAX_ITEMS)
    .map((ref) => ({ productId: ref.productId }));
  const result = await sendCustomer<unknown>(
    "POST",
    `${customerBasePath()}/wishlist/merge`,
    token,
    { items },
  );
  // Yalnız merge çağrısı BAŞARIYLA döndüyse cookie temizlenir (kısmi skip merge'i bozmaz).
  if (result.ok) {
    await clearWishlistCookie();
  }
}
