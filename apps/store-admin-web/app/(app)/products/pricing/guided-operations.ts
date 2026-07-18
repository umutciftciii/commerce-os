// TODO-151A (ADR-075) — Toplu işlem yönlendirmesi ("Ne yapmak istiyorsunuz?").
//
// Kullanıcı önce alan (targetField) + operation enum'u seçmez; anlaşılır bir SENARYO seçer.
// Bu modül senaryoyu, DEĞİŞMEDEN kalan Commercial Engine kontratının (targetField + operation)
// karşılığına çevirir. Motor/kontrat aynı; yalnız kullanıcıya sunulan dil sadeleşir.

import type { CommercialField, CommercialOperation } from "@commerce-os/api-client";

/** Yönlendirmeli senaryo kimlikleri (i18n `pricing.bulk.ops` ile birebir). */
export type GuidedOp =
  | "INCREASE_PRICE"
  | "DECREASE_PRICE"
  | "SET_PRICE"
  | "CREATE_LIST_PRICE"
  | "UPDATE_COST"
  | "CHANGE_VAT"
  | "ROUND_PRICES"
  | "SET_PRICE_ENDING";

/** Artış/azalışta yüzde mi sabit tutar mı. */
export type ChangeKind = "percent" | "fixed";

/** Senaryonun hangi değer girdisini gösterdiği. */
export type GuidedValueKind = "byChangeKind" | "money" | "vat" | "priceEnding" | "rounding";

export interface GuidedOpMeta {
  id: GuidedOp;
  /** Yüzde / sabit tutar seçimi göster. */
  hasChangeKind: boolean;
  valueKind: GuidedValueKind;
}

/** Görünüm sırası = kart sırası. */
export const GUIDED_OPS: GuidedOpMeta[] = [
  { id: "INCREASE_PRICE", hasChangeKind: true, valueKind: "byChangeKind" },
  { id: "DECREASE_PRICE", hasChangeKind: true, valueKind: "byChangeKind" },
  { id: "SET_PRICE", hasChangeKind: false, valueKind: "money" },
  { id: "CREATE_LIST_PRICE", hasChangeKind: false, valueKind: "byChangeKind" },
  { id: "UPDATE_COST", hasChangeKind: false, valueKind: "money" },
  { id: "CHANGE_VAT", hasChangeKind: false, valueKind: "vat" },
  { id: "ROUND_PRICES", hasChangeKind: false, valueKind: "rounding" },
  { id: "SET_PRICE_ENDING", hasChangeKind: false, valueKind: "priceEnding" },
];

export function guidedOpMeta(op: GuidedOp): GuidedOpMeta {
  return GUIDED_OPS.find((o) => o.id === op) ?? GUIDED_OPS[0];
}

/**
 * Senaryo (+ artış/azalış için changeKind) → (targetField, operation).
 * CREATE_LIST_PRICE her zaman fiyattan-yüzde markup ile karşılaştırma fiyatı üretir.
 */
export function guidedRuleShape(
  op: GuidedOp,
  changeKind: ChangeKind,
): { targetField: CommercialField; operation: CommercialOperation } {
  switch (op) {
    case "INCREASE_PRICE":
      return {
        targetField: "PRICE",
        operation: changeKind === "percent" ? "INCREASE_PERCENT" : "INCREASE_FIXED",
      };
    case "DECREASE_PRICE":
      return {
        targetField: "PRICE",
        operation: changeKind === "percent" ? "DECREASE_PERCENT" : "DECREASE_FIXED",
      };
    case "SET_PRICE":
      return { targetField: "PRICE", operation: "SET_FIXED" };
    case "CREATE_LIST_PRICE":
      return { targetField: "COMPARE_AT_PRICE", operation: "SET_COMPARE_AT_FROM_PRICE" };
    case "UPDATE_COST":
      return { targetField: "COST", operation: "SET_FIXED" };
    case "CHANGE_VAT":
      return { targetField: "VAT_RATE", operation: "SET_FIXED" };
    case "ROUND_PRICES":
      return { targetField: "PRICE", operation: "ROUND" };
    case "SET_PRICE_ENDING":
      return { targetField: "PRICE", operation: "SET_PRICE_ENDING" };
  }
}
