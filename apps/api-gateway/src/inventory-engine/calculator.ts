/**
 * TODO-152 (ADR-076) — Inventory Engine · RİSK GÖSTERGELERİ (SAF).
 *
 * available (availability.ts) üzerine stok durumu + rezerve oranı türetir. Renk taşımaz — durum
 * enum'u (InventoryStockStatus) tek kaynaktır; UI renklendirir. Deterministik; girdi salt-okunur.
 *
 * Durum kararı (öncelik sırası):
 *   balanceExists=false            → NO_BALANCE (henüz kaydı yok; sanal 0 satır)
 *   rawAvailable < 0               → NEGATIVE
 *   sellable == 0 && incoming > 0  → INCOMING (tükendi ama yolda mal var)
 *   sellable == 0                  → OUT_OF_STOCK
 *   sellable <= reorderPoint (>0)  → LOW_STOCK
 *   aksi                           → IN_STOCK
 */

import { computeAvailability } from "./availability.js";
import type { InventoryCalc, InventoryState, InventoryStockStatus } from "./types.js";

/** onHand ≤ 0 → null (oran anlamsız). Aksi halde round(reserved/onHand × 100). */
export function reservedRatioPct(state: InventoryState): number | null {
  if (state.onHand <= 0) return null;
  return Math.round((state.reserved / state.onHand) * 100);
}

export function stockStatus(state: InventoryState, balanceExists: boolean): InventoryStockStatus {
  if (!balanceExists) return "NO_BALANCE";
  const { rawAvailable, sellableAvailable } = computeAvailability(state);
  if (rawAvailable < 0) return "NEGATIVE";
  if (sellableAvailable === 0) return state.incoming > 0 ? "INCOMING" : "OUT_OF_STOCK";
  if (state.reorderPoint > 0 && sellableAvailable <= state.reorderPoint) return "LOW_STOCK";
  return "IN_STOCK";
}

/** Tam gösterge seti (availability + oran + durum). */
export function computeCalc(state: InventoryState, balanceExists: boolean): InventoryCalc {
  const { rawAvailable, sellableAvailable } = computeAvailability(state);
  return {
    rawAvailable,
    sellableAvailable,
    reservedRatioPct: reservedRatioPct(state),
    status: stockStatus(state, balanceExists),
  };
}
