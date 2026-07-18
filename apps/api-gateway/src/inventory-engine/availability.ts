/**
 * TODO-152 (ADR-076) — Inventory Engine · AVAILABILITY RESOLVER (SAF, deterministik).
 *
 * Tek doğruluk kaynağı: available = onHand − reserved − safetyStock. `incoming` DAHİL DEĞİL.
 * `rawAvailable` negatif olabilir (gösterim/uyarı); `sellableAvailable` en az 0'a clamp'lenir
 * (satışa açık miktar). Girdiyi MUTASYONA UĞRATMAZ. Prisma/DB/Date/Math.random BİLMEZ.
 *
 * NOT: Bu faz checkout hâlâ (onHand − reserved) kullanır (sıfır regresyon); safetyStock admin
 * görünürlüğüdür (ADR-076). safetyStock varsayılan 0 → mevcut davranış birebir korunur.
 */

import type { InventoryState } from "./types.js";

export interface Availability {
  /** onHand − reserved − safetyStock (negatif olabilir). */
  rawAvailable: number;
  /** max(0, rawAvailable) — satışa açık. */
  sellableAvailable: number;
}

/** SAF availability. Girdi salt-okunur; hiçbir alan mutasyona uğramaz. */
export function computeAvailability(state: InventoryState): Availability {
  const rawAvailable = state.onHand - state.reserved - state.safetyStock;
  return {
    rawAvailable,
    sellableAvailable: rawAvailable > 0 ? rawAvailable : 0,
  };
}
