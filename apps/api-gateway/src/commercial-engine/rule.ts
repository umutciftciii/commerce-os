/**
 * TODO-151 (ADR-074) — Commercial Engine · RULE NORMALİZE + VALIDATE (SAF).
 *
 * Yapısal bulk rule'u (contract'tan gelen) doğrular: operation ↔ targetField uyumu, zorunlu
 * value/percentBps/rounding/priceEnding varlığı, aralık kontrolleri. Serbest metin/eval YOK — yalnız
 * enum + integer. Geçersiz kombinasyon `COMMERCIAL_INVALID_RULE` (request-seviyesi, tek hata) döner;
 * per-variant eksik kaynak (ör. markup için cost yok) evaluator/validation katmanında ele alınır.
 * Prisma/DB/Date/Math.random BİLMEZ.
 */

import {
  MONEY_FIELDS,
  PRICE_ENDING_SPECS,
  type CommercialRule,
  type CommercialField,
  type CommercialOperation,
} from "./types.js";

export interface RuleError {
  code: "COMMERCIAL_INVALID_RULE";
  message: string;
  detail?: string;
}

export type CompileRuleResult =
  | { ok: true; rule: CommercialRule }
  | { ok: false; error: RuleError };

const MONEY_FIELD_SET = new Set<CommercialField>(MONEY_FIELDS);

function invalid(message: string, detail?: string): CompileRuleResult {
  return { ok: false, error: { code: "COMMERCIAL_INVALID_RULE", message, detail } };
}

function requiresMoneyField(op: CommercialOperation, field: CommercialField): boolean {
  if (MONEY_FIELD_SET.has(field)) return true;
  return false;
}

// percentBps makul aralık: −%100 … +%1000 (−10000 … 100000 bps). Azalış operasyonu −'yi yönetir;
// burada mutlak büyüklük guard'ı: 0 < percentBps ≤ 100000 (yani ≤ %1000 artış).
const MAX_PERCENT_BPS = 100000;
const MAX_MARKUP_BPS = 1_000_000; // markup çok yüksek olabilir (ör. %10000) — geniş tavan.

/**
 * Rule'u doğrula ve normalize et. Değerler zaten minor/bps integer (contract Zod ile parse etti);
 * burada SEMANTİK uyum (operation ↔ field ↔ gerekli alan) denetlenir.
 */
export function compileRule(rule: CommercialRule): CompileRuleResult {
  const { targetField, operation } = rule;

  switch (operation) {
    case "SET_FIXED": {
      if (targetField === "VAT_RATE") {
        if (rule.valueBps == null) return invalid("SET_FIXED on VAT_RATE requires valueBps.");
        if (!Number.isInteger(rule.valueBps) || rule.valueBps < 0 || rule.valueBps > 10000) {
          return invalid("valueBps must be an integer within [0, 10000].");
        }
        return { ok: true, rule };
      }
      if (rule.valueMinor == null) return invalid("SET_FIXED requires valueMinor.");
      if (!Number.isInteger(rule.valueMinor) || rule.valueMinor < 0) {
        return invalid("valueMinor must be a non-negative integer (minor units).");
      }
      return { ok: true, rule: normalizeRounding(rule) };
    }

    case "INCREASE_PERCENT":
    case "DECREASE_PERCENT": {
      if (!requiresMoneyField(operation, targetField)) {
        return invalid(`${operation} is only valid on money fields (PRICE/COMPARE_AT_PRICE/COST).`);
      }
      if (rule.percentBps == null) return invalid(`${operation} requires percentBps.`);
      if (!Number.isInteger(rule.percentBps) || rule.percentBps <= 0 || rule.percentBps > MAX_PERCENT_BPS) {
        return invalid(`percentBps must be an integer within (0, ${MAX_PERCENT_BPS}].`);
      }
      return { ok: true, rule: normalizeRounding(rule) };
    }

    case "INCREASE_FIXED":
    case "DECREASE_FIXED": {
      if (!requiresMoneyField(operation, targetField)) {
        return invalid(`${operation} is only valid on money fields.`);
      }
      if (rule.valueMinor == null) return invalid(`${operation} requires valueMinor.`);
      if (!Number.isInteger(rule.valueMinor) || rule.valueMinor <= 0) {
        return invalid("valueMinor must be a positive integer (minor units).");
      }
      return { ok: true, rule: normalizeRounding(rule) };
    }

    case "SET_FROM_COST_MARKUP": {
      if (targetField !== "PRICE") {
        return invalid("SET_FROM_COST_MARKUP can only target PRICE.");
      }
      if (rule.percentBps == null) return invalid("SET_FROM_COST_MARKUP requires percentBps (markup).");
      if (!Number.isInteger(rule.percentBps) || rule.percentBps < 0 || rule.percentBps > MAX_MARKUP_BPS) {
        return invalid(`markup percentBps must be an integer within [0, ${MAX_MARKUP_BPS}].`);
      }
      return { ok: true, rule: normalizeRounding(rule) };
    }

    case "SET_COMPARE_AT_FROM_PRICE": {
      if (targetField !== "COMPARE_AT_PRICE") {
        return invalid("SET_COMPARE_AT_FROM_PRICE can only target COMPARE_AT_PRICE.");
      }
      if (rule.percentBps == null) return invalid("SET_COMPARE_AT_FROM_PRICE requires percentBps.");
      if (!Number.isInteger(rule.percentBps) || rule.percentBps < 0 || rule.percentBps > MAX_PERCENT_BPS) {
        return invalid(`percentBps must be an integer within [0, ${MAX_PERCENT_BPS}].`);
      }
      return { ok: true, rule: normalizeRounding(rule) };
    }

    case "ROUND": {
      if (!requiresMoneyField(operation, targetField)) {
        return invalid("ROUND is only valid on money fields.");
      }
      if (!rule.rounding || rule.rounding.mode === "NONE") {
        return invalid("ROUND requires rounding.mode ∈ {NEAREST, UP, DOWN}.");
      }
      const step = rule.rounding.step ?? 1;
      if (![1, 10, 100, 1000].includes(step)) {
        return invalid("rounding.step must be one of 1, 10, 100, 1000.");
      }
      return { ok: true, rule };
    }

    case "SET_PRICE_ENDING": {
      if (!requiresMoneyField(operation, targetField)) {
        return invalid("SET_PRICE_ENDING is only valid on money fields.");
      }
      if (!rule.priceEnding || !(rule.priceEnding in PRICE_ENDING_SPECS)) {
        return invalid("SET_PRICE_ENDING requires a valid priceEnding rule.");
      }
      return { ok: true, rule };
    }

    default:
      return invalid(`Unknown operation: ${String(operation)}.`);
  }
}

// Değer-üreten opsyonların opsiyonel son-yuvarlaması: NONE veya geçersiz step'i temizle (no-op yap).
function normalizeRounding(rule: CommercialRule): CommercialRule {
  if (!rule.rounding) return rule;
  if (rule.rounding.mode === "NONE") {
    const rest = { ...rule };
    delete rest.rounding;
    return rest;
  }
  return rule;
}
