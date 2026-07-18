/**
 * TODO-152 (ADR-076) — Inventory Engine · REZERVASYON TEMELİ (SAF; Alternatif A).
 *
 * KAPSAM KARARI: Bu faz sipariş yaşam döngüsünü YENİDEN YAZMAZ. Mevcut checkout/order akışı
 * (server.ts placeOrder/cancelOrder; InventoryItem + `SELECT ... FOR UPDATE`) DEĞİŞMEDEN kalır ve
 * overselling koruması korunur. `reserved` SİSTEM-kontrollü bir alandır: kullanıcı ne direct-edit ne
 * bulk ile yazamaz (bkz. types.ts — InventoryField'da reserved YOK). Warehouse-aware reservation/
 * allocation TD-047'de ele alınır; "overselling çözüldü" İDDİA EDİLMEZ.
 *
 * Bu modül yalnız SAF rezervasyon aritmetiğini sağlar (ileride order flow adopte edebilir; şu an
 * order flow'a BAĞLANMAZ). Prisma/DB/HTTP/Date/random BİLMEZ.
 */

import { computeAvailability } from "./availability.js";
import type { InventoryState } from "./types.js";

export type ReservationCheck =
  | { ok: true; nextReserved: number }
  | { ok: false; reason: "INSUFFICIENT_STOCK" | "INVALID_QUANTITY" };

/**
 * SAF: bir depoda `quantity` adet rezerve edilebilir mi. Mevcut checkout ile AYNI semantik:
 * satılabilir = onHand − reserved (safetyStock DAHİL EDİLMEZ — sıfır regresyon; ADR-076). Bu foundation
 * fonksiyonu şu an server.ts akışına bağlı DEĞİL; ileride warehouse-aware reservation için hazırdır.
 */
export function canReserve(state: InventoryState, quantity: number): ReservationCheck {
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, reason: "INVALID_QUANTITY" };
  const checkoutAvailable = state.onHand - state.reserved;
  if (checkoutAvailable < quantity) return { ok: false, reason: "INSUFFICIENT_STOCK" };
  return { ok: true, nextReserved: state.reserved + quantity };
}

/** SAF: rezervasyonu serbest bırak (release). reserved azalır (0'ın altına düşmez). */
export function releaseReservation(state: InventoryState, quantity: number): ReservationCheck {
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, reason: "INVALID_QUANTITY" };
  if (state.reserved < quantity) return { ok: false, reason: "INSUFFICIENT_STOCK" };
  return { ok: true, nextReserved: state.reserved - quantity };
}

/** SAF: sipariş-öncesi görünür satılabilir (admin/engine semantiği: safetyStock DÜŞER). */
export function sellableAfterReserve(state: InventoryState, quantity: number): number {
  const next: InventoryState = { ...state, reserved: state.reserved + quantity };
  return computeAvailability(next).sellableAvailable;
}
