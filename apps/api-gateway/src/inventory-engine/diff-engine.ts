/**
 * TODO-152 (ADR-076) — Inventory Engine · DIFF (SAF, alan-bazlı).
 *
 * GÜNCEL vs HEDEF bakiyeyi kullanıcı-düzenlenebilir alanlar üzerinde karşılaştırır → değişen alanlar.
 * `reserved` diff'e GİRMEZ (sistem-kontrollü; kullanıcı yazmaz). Yalnız DEĞİŞEN alanlar persistence'a
 * gider (idempotent apply: aynı değer tekrar yazılmaz → updatedAt kaymaz). Nested varyant-varyant
 * karşılaştırması YOK; her satır O(f). Deterministik alan sırası. Prisma/DB/Date/random BİLMEZ.
 */

import { INVENTORY_FIELDS, type InventoryField, type InventoryState } from "./types.js";

function fieldValue(state: InventoryState, field: InventoryField): number {
  switch (field) {
    case "ON_HAND":
      return state.onHand;
    case "INCOMING":
      return state.incoming;
    case "SAFETY_STOCK":
      return state.safetyStock;
    case "REORDER_POINT":
      return state.reorderPoint;
    default:
      return 0;
  }
}

export interface FieldDiff {
  field: InventoryField;
  oldValue: number;
  newValue: number;
  delta: number;
}

export interface InventoryDiff {
  changedFields: InventoryField[];
  diffs: FieldDiff[];
  changed: boolean;
}

/** Alan-bazlı diff (deterministik alan sırası). Değişen alan yoksa changed=false. */
export function diffState(current: InventoryState, target: InventoryState): InventoryDiff {
  const diffs: FieldDiff[] = [];
  for (const field of INVENTORY_FIELDS) {
    const oldValue = fieldValue(current, field);
    const newValue = fieldValue(target, field);
    if (oldValue !== newValue) {
      diffs.push({ field, oldValue, newValue, delta: newValue - oldValue });
    }
  }
  return {
    changedFields: diffs.map((d) => d.field),
    diffs,
    changed: diffs.length > 0,
  };
}
