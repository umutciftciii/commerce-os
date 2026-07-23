/**
 * TODO-159D (ADR-093) — Vitrin wishlist okuma katmanı (sunucu-yalnız).
 *
 * Favori durumu CANLI backend'den gelir: oturum açmış müşteride gateway'in batched
 * `/wishlist/status` ucundan, misafirde imzalı cookie'den. Tüm katalog istemciye
 * ÇEKİLMEZ — yalnız sayfadaki ürün id'leri için tek batched çağrı (N+1 yok).
 */
import {
  CUSTOMER_WISHLIST_STATUS_MAX_IDS,
  type CustomerWishlistStatusResponse,
} from "@commerce-os/api-client";
import { customerBasePath } from "./customer";
import { sendCustomer } from "./gateway";
import { readCustomerToken } from "./customer-cookie";
import { readWishlistRefs } from "./wishlist-cookie";

/**
 * Verilen ürün id'lerinden favoride olanların kümesi (batched). Oturum → gateway,
 * misafir → cookie. Hata halinde boş küme (favori işareti kaybolur ama sayfa çalışır).
 */
export async function getWishlistStatus(productIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(productIds.filter((id) => id.length > 0))].slice(
    0,
    CUSTOMER_WISHLIST_STATUS_MAX_IDS,
  );
  if (unique.length === 0) return new Set();
  const token = await readCustomerToken();
  if (token) {
    const result = await sendCustomer<CustomerWishlistStatusResponse>(
      "POST",
      `${customerBasePath()}/wishlist/status`,
      token,
      { productIds: unique },
    );
    if (result.ok) return new Set(result.data.data.savedProductIds);
    return new Set();
  }
  // Misafir: cookie referanslarından kesişim.
  const refs = await readWishlistRefs();
  const saved = new Set(refs.map((ref) => ref.productId));
  return new Set(unique.filter((id) => saved.has(id)));
}
