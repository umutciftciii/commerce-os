"use server";

import { revalidatePath } from "next/cache";
import { getCustomerOrderDetail } from "./customer";
import { resolveCart } from "./cart";
import { readCartItems, writeCartItems } from "./cart-cookie";
import { addItem } from "../cart-token";

/**
 * TODO-079 — "Tekrar satın al" Server Action.
 *
 * Güvenlik: yalnız KENDİ siparişi ({@link getCustomerOrderDetail} `x-customer-session`
 * ile own-scoped; başka müşteri/yok → null). Sepete EKLEME güncel katalogdan
 * doğrulanır: sipariş satırları gateway'de TEK BAŞINA çözülür ({@link resolveCart}),
 * yalnız hâlâ satılabilir + stokta olan varyantlar uygun adetle eklenir. Eski
 * sipariş satırı FİYATINA güvenilmez (fiyat/uygunluk güncel üründen gelir).
 */
export type BuyAgainState =
  | { status: "idle" }
  | { status: "success"; addedCount: number; unavailableCount: number }
  | { status: "error"; reason: "not-found" | "none-available" | "error" };

export async function buyAgainAction(orderNumber: string): Promise<BuyAgainState> {
  const detail = await getCustomerOrderDetail(orderNumber);
  if (!detail) return { status: "error", reason: "not-found" };

  const requested = detail.lines.map((line) => ({
    variantId: line.variantId,
    quantity: line.quantity,
  }));
  if (requested.length === 0) return { status: "error", reason: "none-available" };

  // Güncel katalog/stok doğrulaması (gateway). Çözülemeyen/UNAVAILABLE/stoksuz
  // varyant uygun listede yer almaz → "mevcut değil" sayılır.
  const resolved = await resolveCart(requested);
  if (!resolved.ok) return { status: "error", reason: "error" };

  const availableByVariant = new Map<string, number>();
  for (const line of resolved.data.lines) {
    if (line.status !== "UNAVAILABLE" && line.inStock && line.availableQuantity > 0) {
      availableByVariant.set(line.variantId, line.availableQuantity);
    }
  }

  let items = await readCartItems();
  let addedCount = 0;
  let unavailableCount = 0;
  for (const line of requested) {
    const available = availableByVariant.get(line.variantId) ?? 0;
    if (available <= 0) {
      unavailableCount += 1;
      continue;
    }
    items = addItem(items, line.variantId, Math.min(line.quantity, available));
    addedCount += 1;
  }

  if (addedCount === 0) {
    // Hiçbir ürün artık satılmıyor/stokta değil.
    return { status: "error", reason: "none-available" };
  }

  await writeCartItems(items);
  revalidatePath("/", "layout"); // nav rozeti (sepet adedi)
  revalidatePath("/cart");
  return { status: "success", addedCount, unavailableCount };
}
