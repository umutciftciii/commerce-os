/**
 * TODO-151 (ADR-074) — Commercial Engine · DIFF (SAF, alan-bazlı).
 *
 * GÜNCEL vs HEDEF ticari durumu alan-bazlı karşılaştırır → değişen alanlar. Yalnız DEĞİŞEN alanlar
 * persistence'a gider (idempotent apply: aynı değer tekrar yazılmaz → updatedAt kaymaz). Nested
 * varyant-varyant karşılaştırması YOK; her satır O(f) (f = ticari alan sayısı). Deterministik sıra
 * (PRICE, COMPARE_AT_PRICE, COST, VAT_RATE). Prisma/DB/Date/random BİLMEZ.
 */

import { COMMERCIAL_FIELDS, type CommercialField, type CommercialState } from "./types.js";

/** İki nullable minor değerin eşitliği. */
function eqNullable(a: number | null, b: number | null): boolean {
  return a === b;
}

function fieldValue(state: CommercialState, field: CommercialField): number | null {
  switch (field) {
    case "PRICE":
      return state.priceMinor;
    case "COMPARE_AT_PRICE":
      return state.compareAtMinor;
    case "COST":
      return state.costMinor;
    case "VAT_RATE":
      return state.vatRateBps;
    default:
      return null;
  }
}

export interface FieldDiff {
  field: CommercialField;
  oldValue: number | null;
  newValue: number | null;
}

export interface CommercialDiff {
  changedFields: CommercialField[];
  diffs: FieldDiff[];
  changed: boolean;
}

/** Alan-bazlı diff (deterministik alan sırası). Değişen alan yoksa changed=false. */
export function diffState(current: CommercialState, target: CommercialState): CommercialDiff {
  const diffs: FieldDiff[] = [];
  for (const field of COMMERCIAL_FIELDS) {
    const oldValue = fieldValue(current, field);
    const newValue = fieldValue(target, field);
    if (!eqNullable(oldValue, newValue)) {
      diffs.push({ field, oldValue, newValue });
    }
  }
  return {
    changedFields: diffs.map((d) => d.field),
    diffs,
    changed: diffs.length > 0,
  };
}
