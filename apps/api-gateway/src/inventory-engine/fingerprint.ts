/**
 * TODO-152 (ADR-076) — Inventory Engine · STALE-PREVIEW FINGERPRINT (SAF, deterministik).
 *
 * Preview, hedef varyantların GÜNCEL bakiyesinden (warehouseId + variantId + onHand + reserved +
 * incoming + safetyStock + reorderPoint, KANONİK sırada) deterministik bir FNV-1a hash üretir. Apply
 * request'i bu fingerprint'i taşır; sunucu advisory-lock altında değerleri yeniden okuyup fingerprint'i
 * yeniden hesaplar. Fark varsa → stale (hiçbir yazım yapılmaz). İstemcinin hesapladığı hedeflere
 * güvenilmez. `reserved` fingerprint'e DAHİLDİR: preview ile apply arasında bir sipariş rezerve/serbest
 * yaparsa fingerprint değişir → INVENTORY_PREVIEW_STALE (doğru davranış).
 *
 * Crypto/Date/Math.random KULLANILMAZ (saf integer aritmetiği; resume-güvenli, deterministik).
 */

import type { InventoryState } from "./types.js";

export interface FingerprintRow {
  warehouseId: string;
  variantId: string;
  state: InventoryState;
}

// FNV-1a 32-bit (deterministik, hızlı; yalnız değişim tespiti için).
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function serializeState(s: InventoryState): string {
  return `${s.onHand}|${s.reserved}|${s.incoming}|${s.safetyStock}|${s.reorderPoint}`;
}

/**
 * Kanonik inventory fingerprint. Girdi sırasından BAĞIMSIZ (warehouseId+variantId'ye göre sıralanır)
 * → preview satır sırası değişse bile fingerprint stabil; yalnız DEĞER değişimi fingerprint'i değiştirir.
 */
export function inventoryFingerprint(rows: FingerprintRow[]): string {
  const canonical = [...rows]
    .sort((a, b) => {
      const ka = `${a.warehouseId}:${a.variantId}`;
      const kb = `${b.warehouseId}:${b.variantId}`;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    })
    .map((r) => `${r.warehouseId}:${r.variantId}=${serializeState(r.state)}`)
    .join(";");
  return `if1:${fnv1a(canonical)}:${rows.length}`;
}
