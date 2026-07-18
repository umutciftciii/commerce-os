/**
 * TODO-151 (ADR-074) — Commercial Engine · VALIDATION (SAF, blocking/warning ayrımı).
 *
 * HEDEF ticari durumu doğrular. Blocking (apply'ı toptan reddeder): negatif tutar, overflow, geçersiz
 * VAT, currency mismatch, eksik kural kaynağı. Warning (apply'ı ENGELLEMEZ; UI'da görünür): negatif/
 * sıfır/aşırı-yüksek marj, cost>liste, compare-at<price, eksik cost/compare-at, ciddi fiyat değişimi,
 * archived/draft. Preview ve apply AYNI pipeline'ı kullanır. Prisma/DB/Date/random BİLMEZ.
 */

import { isValidVatRateBps } from "@commerce-os/utils";
import { marginPct } from "./calculator.js";
import { pctChange } from "./money.js";
import type { CommercialIssueCode, CommercialLimits, CommercialState, VariantStatus } from "./types.js";

export interface ValidationContext {
  /** Batch'in beklenen currency'si (ilk varyanttan alınır). */
  expectedCurrency: string;
  /** Bu varyantın gerçek currency'si. */
  actualCurrency: string;
  status: VariantStatus;
  /** Bu satırda gerçek bir değişim var mı (bağlamsal MISSING/LARGE uyarılarını yalnız değişimde ver). */
  changed: boolean;
  limits: CommercialLimits;
  /** Evaluator'dan taşınan per-variant blocking issue (ör. RULE_SOURCE_MISSING). */
  carried?: CommercialIssueCode;
}

/**
 * Hedef durumu doğrula → tüm issue kodları (blocking + warning karışık; sınıflandırma
 * BLOCKING_ISSUE_CODES ile üst katmanda). Deterministik sıra.
 */
export function validateTarget(
  current: CommercialState,
  target: CommercialState,
  ctx: ValidationContext,
): CommercialIssueCode[] {
  const issues: CommercialIssueCode[] = [];
  const { limits } = ctx;

  if (ctx.carried) issues.push(ctx.carried);

  // ── Blocking ──
  if (ctx.actualCurrency !== ctx.expectedCurrency) issues.push("CURRENCY_MISMATCH");

  if (target.priceMinor < 0) issues.push("NEGATIVE_PRICE");
  if (target.compareAtMinor != null && target.compareAtMinor < 0) issues.push("NEGATIVE_COMPARE_AT");
  if (target.costMinor != null && target.costMinor < 0) issues.push("NEGATIVE_COST");

  if (!isValidVatRateBps(target.vatRateBps)) issues.push("INVALID_VAT");

  const overflow =
    target.priceMinor > limits.maxMoneyMinor ||
    (target.compareAtMinor != null && target.compareAtMinor > limits.maxMoneyMinor) ||
    (target.costMinor != null && target.costMinor > limits.maxMoneyMinor);
  if (overflow) issues.push("OVERFLOW");

  // ── Warning ── (marj/liste ilişkileri — negatif fiyat yoksa anlamlı)
  if (target.priceMinor >= 0 && target.costMinor != null) {
    const profit = target.priceMinor - target.costMinor;
    if (profit < 0) issues.push("NEGATIVE_MARGIN");
    else if (profit === 0) issues.push("ZERO_MARGIN");
    const m = marginPct(target);
    if (m != null && m > limits.highMarginPct) issues.push("HIGH_MARGIN");
    const listCeiling = target.compareAtMinor ?? target.priceMinor;
    if (target.costMinor > listCeiling) issues.push("COST_EXCEEDS_LIST");
  }
  if (target.compareAtMinor != null && target.compareAtMinor < target.priceMinor) {
    issues.push("COMPARE_AT_BELOW_PRICE");
  }

  // Değişen satırlarda bağlamsal uyarılar (gürültüyü azalt).
  if (ctx.changed) {
    if (target.costMinor == null) issues.push("MISSING_COST");
    if (target.compareAtMinor == null) issues.push("MISSING_COMPARE_AT");
    const delta = pctChange(current.priceMinor, target.priceMinor);
    if (delta != null) {
      if (delta >= limits.largePriceChangePct) issues.push("LARGE_PRICE_INCREASE");
      else if (delta <= -limits.largePriceChangePct) issues.push("LARGE_PRICE_DECREASE");
    }
  }

  // Status uyarıları (archived apply'a girmez ama defansif; draft bilgilendirir).
  if (ctx.status === "ARCHIVED") issues.push("ARCHIVED_VARIANT");
  else if (ctx.status === "DRAFT") issues.push("DRAFT_VARIANT");

  return issues;
}
