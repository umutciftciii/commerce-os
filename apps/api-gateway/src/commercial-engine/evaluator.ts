/**
 * TODO-151 (ADR-074) — Commercial Engine · RULE/EDIT DEĞERLENDİRİCİ (SAF).
 *
 * Bir varyantın GÜNCEL ticari durumundan HEDEF durumu üretir: ya yapısal bulk rule ile ya da
 * direct-edit ile. Yalnız hedef alanı değiştirir; diğer alanlar aynen taşınır. Değer-üreten
 * operasyonlarda opsiyonel son-yuvarlama uygulanır. Eksik kaynak (markup için cost yok) per-variant
 * RULE_SOURCE_MISSING issue'su verir (blocking; validation katmanı toplar). Negatif/overflow ÜRETİR
 * ama BURADA reddetmez — validation katmanı sınıflar (saf ayrım). Prisma/DB/Date/random BİLMEZ.
 */

import { applyFixed, applyPercent, applyPriceEnding, compareAtFromPrice, priceFromCostMarkup, roundToStep } from "./money.js";
import { PRICE_ENDING_SPECS, type CommercialDirectEdit, type CommercialIssueCode, type CommercialRule, type CommercialState } from "./types.js";

export interface EvalResult {
  target: CommercialState;
  /** Değerlendirme sırasında oluşan per-variant blocking issue (ör. eksik cost). */
  issue?: CommercialIssueCode;
}

// Hedef money alanının güncel değerini oku (COMPARE_AT/COST nullable).
function currentMoney(state: CommercialState, field: CommercialRule["targetField"]): number | null {
  if (field === "PRICE") return state.priceMinor;
  if (field === "COMPARE_AT_PRICE") return state.compareAtMinor;
  if (field === "COST") return state.costMinor;
  return null;
}

// Üretilen money değerini hedef alana yaz (yeni state).
function writeMoney(state: CommercialState, field: CommercialRule["targetField"], value: number): CommercialState {
  if (field === "PRICE") return { ...state, priceMinor: value };
  if (field === "COMPARE_AT_PRICE") return { ...state, compareAtMinor: value };
  if (field === "COST") return { ...state, costMinor: value };
  return state;
}

// Değer-üreten opsyonun opsiyonel son-yuvarlaması.
function postRound(value: number, rule: CommercialRule): number {
  if (!rule.rounding || rule.rounding.mode === "NONE") return value;
  return roundToStep(value, rule.rounding.mode, rule.rounding.step ?? 1);
}

/**
 * Rule'u state'e uygula. Rule'un DERLENMİŞ (compileRule ok) olduğu varsayılır — burada yalnız
 * matematik + per-variant kaynak kontrolü. Değişmeyen alanlar aynen taşınır (identity-safe).
 */
export function applyRuleToState(state: CommercialState, rule: CommercialRule): EvalResult {
  const { targetField, operation } = rule;

  switch (operation) {
    case "SET_FIXED": {
      if (targetField === "VAT_RATE") {
        return { target: { ...state, vatRateBps: rule.valueBps! } };
      }
      const rounded = postRound(rule.valueMinor!, rule);
      return { target: writeMoney(state, targetField, rounded) };
    }

    case "INCREASE_PERCENT":
    case "DECREASE_PERCENT": {
      const base = currentMoney(state, targetField);
      if (base == null) return { target: state }; // yok olan alanda yüzde → değişmez
      const dir = operation === "INCREASE_PERCENT" ? 1 : -1;
      const next = postRound(applyPercent(base, rule.percentBps!, dir), rule);
      return { target: writeMoney(state, targetField, next) };
    }

    case "INCREASE_FIXED":
    case "DECREASE_FIXED": {
      const base = currentMoney(state, targetField);
      if (base == null) return { target: state };
      const dir = operation === "INCREASE_FIXED" ? 1 : -1;
      const next = postRound(applyFixed(base, rule.valueMinor!, dir), rule);
      return { target: writeMoney(state, targetField, next) };
    }

    case "SET_FROM_COST_MARKUP": {
      if (state.costMinor == null) {
        // Kaynak (cost) yok → türetilemez; blocking issue (fail-closed).
        return { target: state, issue: "RULE_SOURCE_MISSING" };
      }
      const next = postRound(priceFromCostMarkup(state.costMinor, rule.percentBps!), rule);
      return { target: { ...state, priceMinor: next } };
    }

    case "SET_COMPARE_AT_FROM_PRICE": {
      const next = postRound(compareAtFromPrice(state.priceMinor, rule.percentBps!), rule);
      return { target: { ...state, compareAtMinor: next } };
    }

    case "ROUND": {
      const base = currentMoney(state, targetField);
      if (base == null) return { target: state };
      const next = roundToStep(base, rule.rounding!.mode, rule.rounding!.step ?? 1);
      return { target: writeMoney(state, targetField, next) };
    }

    case "SET_PRICE_ENDING": {
      const base = currentMoney(state, targetField);
      if (base == null) return { target: state };
      const next = applyPriceEnding(base, PRICE_ENDING_SPECS[rule.priceEnding!]);
      return { target: writeMoney(state, targetField, next) };
    }

    default:
      return { target: state };
  }
}

/**
 * Direct-edit'i state'e uygula. Verilmeyen alan = dokunma; explicit null (compareAt/cost) = temizle.
 * priceMinor/vatRateBps null olamaz (contract engeller); yalnız number verilirse yazılır.
 */
export function applyDirectEdit(state: CommercialState, edit: CommercialDirectEdit): CommercialState {
  const next: CommercialState = { ...state };
  if (edit.priceMinor !== undefined) next.priceMinor = edit.priceMinor;
  if (edit.compareAtMinor !== undefined) next.compareAtMinor = edit.compareAtMinor;
  if (edit.costMinor !== undefined) next.costMinor = edit.costMinor;
  if (edit.vatRateBps !== undefined) next.vatRateBps = edit.vatRateBps;
  return next;
}
