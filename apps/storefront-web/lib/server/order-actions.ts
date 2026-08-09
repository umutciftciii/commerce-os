"use server";

import { revalidatePath } from "next/cache";
import { getCustomerOrderDetail } from "./customer";
import { authAddLine, resolveCart } from "./cart";
import { readCartItems, writeCartItems } from "./cart-cookie";
import { readCustomerToken } from "./customer-cookie";
import { addItem } from "../cart-token";

/**
 * TODO-079 — "Tekrar satın al" Server Action.
 *
 * Güvenlik: yalnız KENDİ siparişi ({@link getCustomerOrderDetail} `x-customer-session`
 * ile own-scoped; başka müşteri/yok → null). Sepete EKLEME güncel katalogdan
 * doğrulanır: sipariş satırları gateway'de TEK BAŞINA çözülür ({@link resolveCart}),
 * yalnız hâlâ satılabilir + stokta olan varyantlar uygun adetle eklenir. Eski
 * sipariş satırı FİYATINA güvenilmez (fiyat/uygunluk güncel üründen gelir).
 *
 * TODO-176B (BUG-CART-006) — Hibrit cart otoritesi (TODO-167/ADR-266): reorder DAİMA
 * authenticated bağlamda çalışır (order detail `x-customer-session` ister) → sepet
 * KALICI DB cart'tır (`getAuthCartProjection`); nav rozeti + `/cart` + checkout hepsi
 * DB cart okur. Bu yüzden ekleme {@link authAddLine} ile DB cart'a yazılır. Önceki
 * uygulama koşulsuz cookie'ye (`writeCartItems`) yazıyordu → UI "eklendi" der ama DB
 * cart boş kalır (yanlış defter) → rozet artmaz, `/cart` boş. Anonim yol yalnız
 * savunma amaçlı korunur (token yoksa cookie'ye düşer — normalde erişilmez).
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

  // TODO-176B (BUG-CART-006) — Oturum açmış müşteride (reorder daima böyledir) sepet DB-otoriter:
  // satırları {@link authAddLine} ile KALICI DB cart'a yaz. Böylece nav rozeti + `/cart` + checkout
  // (hepsi DB cart okur) reorder ile TUTARLI olur. Ekleme başarısı gateway'de gerçekten persist
  // edildikten sonra sayılır (fail-closed stok kapısı 409 → o satır "mevcut değil" sayılır; sessiz
  // fallback YOK). Anonim yol (token yok) yalnızca savunma amaçlı cookie'ye düşer.
  if (await hasCustomerSession()) {
    let addedCount = 0;
    let unavailableCount = 0;
    for (const line of requested) {
      const available = availableByVariant.get(line.variantId) ?? 0;
      if (available <= 0) {
        unavailableCount += 1;
        continue;
      }
      const res = await authAddLine(line.variantId, Math.min(line.quantity, available));
      if (res.ok) {
        addedCount += 1;
      } else {
        // Persist edilemedi (stok değişti / stale / hata) → sessiz başarı YOK; "mevcut değil" say.
        unavailableCount += 1;
      }
    }
    if (addedCount === 0) {
      return { status: "error", reason: "none-available" };
    }
    revalidatePath("/", "layout"); // nav rozeti (sepet adedi)
    revalidatePath("/cart");
    return { status: "success", addedCount, unavailableCount };
  }

  // Anonim savunma yolu (token yok — reorder normalde erişilemez): cookie sepetine yaz.
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

/**
 * TODO-176B — Sepet kaynağı kimliğe göre (TODO-167/ADR-266). Oturum açmış müşteride KALICI DB cart
 * otoriter; token yoksa anonim cookie'ye düşülür. (cart-actions.ts'teki eşdeğerle aynı semantik.)
 */
async function hasCustomerSession(): Promise<boolean> {
  try {
    return Boolean(await readCustomerToken());
  } catch {
    return false;
  }
}
