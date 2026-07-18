// TODO-151A (ADR-075) — Yönlendirmeli senaryo → Commercial Engine kontratı eşlemesi.
// Motor DEĞİŞMEDİ; bu birim testleri yalnız kullanıcı senaryosunun (targetField, operation)
// karşılığına doğru çevrildiğini doğrular.
import { describe, expect, it } from "vitest";
import { GUIDED_OPS, guidedOpMeta, guidedRuleShape } from "../app/(app)/products/pricing/guided-operations.js";

describe("guided-operations mapping", () => {
  it("maps price increase/decrease to percent vs fixed operations", () => {
    expect(guidedRuleShape("INCREASE_PRICE", "percent")).toEqual({ targetField: "PRICE", operation: "INCREASE_PERCENT" });
    expect(guidedRuleShape("INCREASE_PRICE", "fixed")).toEqual({ targetField: "PRICE", operation: "INCREASE_FIXED" });
    expect(guidedRuleShape("DECREASE_PRICE", "percent")).toEqual({ targetField: "PRICE", operation: "DECREASE_PERCENT" });
    expect(guidedRuleShape("DECREASE_PRICE", "fixed")).toEqual({ targetField: "PRICE", operation: "DECREASE_FIXED" });
  });

  it("maps create-list-price to compare-at-from-price (markup over price)", () => {
    expect(guidedRuleShape("CREATE_LIST_PRICE", "percent")).toEqual({
      targetField: "COMPARE_AT_PRICE",
      operation: "SET_COMPARE_AT_FROM_PRICE",
    });
  });

  it("maps VAT / cost / set-price / round / ending to the correct field+operation", () => {
    expect(guidedRuleShape("CHANGE_VAT", "percent")).toEqual({ targetField: "VAT_RATE", operation: "SET_FIXED" });
    expect(guidedRuleShape("UPDATE_COST", "percent")).toEqual({ targetField: "COST", operation: "SET_FIXED" });
    expect(guidedRuleShape("SET_PRICE", "percent")).toEqual({ targetField: "PRICE", operation: "SET_FIXED" });
    expect(guidedRuleShape("ROUND_PRICES", "percent")).toEqual({ targetField: "PRICE", operation: "ROUND" });
    expect(guidedRuleShape("SET_PRICE_ENDING", "percent")).toEqual({ targetField: "PRICE", operation: "SET_PRICE_ENDING" });
  });

  it("exposes 8 guided operations with change-kind only for increase/decrease", () => {
    expect(GUIDED_OPS.map((o) => o.id)).toEqual([
      "INCREASE_PRICE",
      "DECREASE_PRICE",
      "SET_PRICE",
      "CREATE_LIST_PRICE",
      "UPDATE_COST",
      "CHANGE_VAT",
      "ROUND_PRICES",
      "SET_PRICE_ENDING",
    ]);
    expect(guidedOpMeta("INCREASE_PRICE").hasChangeKind).toBe(true);
    expect(guidedOpMeta("SET_PRICE").hasChangeKind).toBe(false);
  });
});
