// TODO-152 (ADR-076) — Toplu stok işlem yönlendirmesi ("Ne yapmak istiyorsunuz?").
//
// Kullanıcı önce alan (targetField) + operation enum'u seçmez; anlaşılır bir SENARYO seçer.
// Bu modül senaryoyu, DEĞİŞMEDEN kalan Inventory Engine kontratının (targetField + operation)
// karşılığına çevirir. Motor/kontrat aynı; yalnız kullanıcıya sunulan dil sadeleşir.

import type { InventoryField, InventoryOperation } from "@commerce-os/api-client";

/** Yönlendirmeli senaryo kimlikleri (i18n `inventory.bulk.ops` ile birebir). */
export type GuidedOp =
  | "ADD_ON_HAND"
  | "REMOVE_ON_HAND"
  | "SET_ON_HAND"
  | "ADD_INCOMING"
  | "SET_INCOMING"
  | "SET_SAFETY_STOCK"
  | "SET_REORDER_POINT"
  | "RESET_ON_HAND";

export interface GuidedOpMeta {
  id: GuidedOp;
  /** Kullanıcıdan adet girdisi ister mi (RESET_ON_HAND istemez → sabit 0). */
  needsAmount: boolean;
  /** Yüksek etkili işlem (açık uyarı gösterilir). */
  highImpact: boolean;
}

/** Görünüm sırası = kart sırası. */
export const GUIDED_OPS: GuidedOpMeta[] = [
  { id: "ADD_ON_HAND", needsAmount: true, highImpact: false },
  { id: "REMOVE_ON_HAND", needsAmount: true, highImpact: false },
  { id: "SET_ON_HAND", needsAmount: true, highImpact: false },
  { id: "ADD_INCOMING", needsAmount: true, highImpact: false },
  { id: "SET_INCOMING", needsAmount: true, highImpact: false },
  { id: "SET_SAFETY_STOCK", needsAmount: true, highImpact: false },
  { id: "SET_REORDER_POINT", needsAmount: true, highImpact: false },
  { id: "RESET_ON_HAND", needsAmount: false, highImpact: true },
];

export function guidedOpMeta(op: GuidedOp): GuidedOpMeta {
  return GUIDED_OPS.find((o) => o.id === op) ?? GUIDED_OPS[0];
}

/** Senaryo → (targetField, operation, amount override?). amount RESET_ON_HAND'de 0 sabittir. */
export function guidedRuleShape(op: GuidedOp): {
  targetField: InventoryField;
  operation: InventoryOperation;
  fixedAmount?: number;
} {
  switch (op) {
    case "ADD_ON_HAND":
      return { targetField: "ON_HAND", operation: "INCREASE" };
    case "REMOVE_ON_HAND":
      return { targetField: "ON_HAND", operation: "DECREASE" };
    case "SET_ON_HAND":
      return { targetField: "ON_HAND", operation: "SET_ABSOLUTE" };
    case "ADD_INCOMING":
      return { targetField: "INCOMING", operation: "INCREASE" };
    case "SET_INCOMING":
      return { targetField: "INCOMING", operation: "SET_ABSOLUTE" };
    case "SET_SAFETY_STOCK":
      return { targetField: "SAFETY_STOCK", operation: "SET_ABSOLUTE" };
    case "SET_REORDER_POINT":
      return { targetField: "REORDER_POINT", operation: "SET_ABSOLUTE" };
    case "RESET_ON_HAND":
      return { targetField: "ON_HAND", operation: "SET_ABSOLUTE", fixedAmount: 0 };
  }
}
