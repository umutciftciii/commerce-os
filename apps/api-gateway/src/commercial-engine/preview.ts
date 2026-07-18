/**
 * TODO-151 (ADR-074) — Commercial Engine · PREVIEW ORKESTRASYONU (SAF ÇEKİRDEK).
 *
 * Kapsamdaki varyantların GÜNCEL ticari durumundan HEDEF durumu üretir (rule veya direct-edit),
 * hesaplar (margin/markup/discount), doğrular (blocking/warning) ve alan-bazlı diff'ler. Deterministik:
 * Prisma/HTTP/Date/Math.random BİLMEZ; girdi sırasından bağımsız fingerprint üretir → preview == apply.
 * Karmaşıklık: O(n·(r+f)); nested varyant-varyant karşılaştırması YOK.
 *
 * blocked = herhangi bir kapsam-varyantında blocking issue (negatif/overflow/invalid VAT/currency/
 * eksik kaynak). Warning apply'ı ENGELLEMEZ.
 */

import { computeCalc } from "./calculator.js";
import { diffState } from "./diff-engine.js";
import { applyDirectEdit, applyRuleToState } from "./evaluator.js";
import { commercialFingerprint } from "./fingerprint.js";
import { validateTarget } from "./validation.js";
import {
  BLOCKING_ISSUE_CODES,
  DEFAULT_COMMERCIAL_LIMITS,
  type CommercialCalc,
  type CommercialDirectEdit,
  type CommercialField,
  type CommercialIssueCode,
  type CommercialLimits,
  type CommercialRule,
  type CommercialState,
  type CommercialVariantInput,
  type VariantStatus,
} from "./types.js";

export type CommercialMode =
  | { kind: "rule"; rule: CommercialRule }
  | { kind: "direct"; edits: CommercialDirectEdit[] };

export interface PreviewInput {
  /** Kapsamdaki varyantlar (servis sıralar/filtreler: non-archived + selection). */
  variants: CommercialVariantInput[];
  mode: CommercialMode;
  limits?: CommercialLimits;
}

export interface PreviewRow {
  variantId: string;
  sku: string;
  title: string;
  status: VariantStatus;
  currency: string;
  attributes: { code: string; label: string }[];
  current: CommercialState;
  currentCalc: CommercialCalc;
  target: CommercialState;
  targetCalc: CommercialCalc;
  changedFields: CommercialField[];
  changed: boolean;
  warnings: CommercialIssueCode[];
  errors: CommercialIssueCode[];
}

export interface PreviewSummary {
  totalVariants: number;
  changedVariants: number;
  unchangedVariants: number;
  changedFieldCount: number;
  warningCount: number;
  errorCount: number;
  /** Değişen satırların yeni fiyat aralığı (minor). Değişen yoksa null. */
  minNewPriceMinor: number | null;
  maxNewPriceMinor: number | null;
  /** Değişen satırlarda ortalama fiyat değişim yüzdesi (float, gösterim). */
  avgPriceChangePct: number | null;
  negativeMarginCount: number;
  compareAtBelowPriceCount: number;
}

export interface PreviewOutput {
  fingerprint: string;
  rows: PreviewRow[];
  blocked: boolean;
  summary: PreviewSummary;
}

function splitIssues(issues: CommercialIssueCode[]): { warnings: CommercialIssueCode[]; errors: CommercialIssueCode[] } {
  const warnings: CommercialIssueCode[] = [];
  const errors: CommercialIssueCode[] = [];
  for (const code of issues) {
    if (BLOCKING_ISSUE_CODES.has(code)) errors.push(code);
    else warnings.push(code);
  }
  return { warnings, errors };
}

export function buildCommercialPreview(input: PreviewInput): PreviewOutput {
  const limits = input.limits ?? DEFAULT_COMMERCIAL_LIMITS;
  const variants = input.variants;
  const expectedCurrency = variants.length > 0 ? variants[0].currency : "";

  // Direct-edit modunda hızlı erişim için variantId → edit haritası.
  const editMap =
    input.mode.kind === "direct"
      ? new Map(input.mode.edits.map((e) => [e.variantId, e]))
      : null;

  const rows: PreviewRow[] = [];
  let blocked = false;

  // Summary birikimcileri.
  let changedVariants = 0;
  let changedFieldCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  let minNewPrice: number | null = null;
  let maxNewPrice: number | null = null;
  let priceChangePctSum = 0;
  let priceChangeCount = 0;
  let negativeMarginCount = 0;
  let compareAtBelowCount = 0;

  for (const v of variants) {
    // Hedef durumu üret.
    let target: CommercialState;
    let carried: CommercialIssueCode | undefined;
    if (input.mode.kind === "rule") {
      const res = applyRuleToState(v.current, input.mode.rule);
      target = res.target;
      carried = res.issue;
    } else {
      const edit = editMap!.get(v.variantId);
      target = edit ? applyDirectEdit(v.current, edit) : v.current;
    }

    const diff = diffState(v.current, target);
    const issues = validateTarget(v.current, target, {
      expectedCurrency,
      actualCurrency: v.currency,
      status: v.status,
      changed: diff.changed,
      limits,
      carried,
    });
    const { warnings, errors } = splitIssues(issues);
    if (errors.length > 0) blocked = true;

    if (diff.changed) {
      changedVariants++;
      changedFieldCount += diff.changedFields.length;
      minNewPrice = minNewPrice == null ? target.priceMinor : Math.min(minNewPrice, target.priceMinor);
      maxNewPrice = maxNewPrice == null ? target.priceMinor : Math.max(maxNewPrice, target.priceMinor);
      if (v.current.priceMinor > 0) {
        priceChangePctSum += ((target.priceMinor - v.current.priceMinor) / v.current.priceMinor) * 100;
        priceChangeCount++;
      }
    }
    if (warnings.includes("NEGATIVE_MARGIN")) negativeMarginCount++;
    if (warnings.includes("COMPARE_AT_BELOW_PRICE")) compareAtBelowCount++;
    warningCount += warnings.length;
    errorCount += errors.length;

    rows.push({
      variantId: v.variantId,
      sku: v.sku,
      title: v.title,
      status: v.status,
      currency: v.currency,
      attributes: v.attributes,
      current: v.current,
      currentCalc: computeCalc(v.current),
      target,
      targetCalc: computeCalc(target),
      changedFields: diff.changedFields,
      changed: diff.changed,
      warnings,
      errors,
    });
  }

  const fingerprint = commercialFingerprint(
    variants.map((v) => ({ variantId: v.variantId, state: v.current })),
  );

  const summary: PreviewSummary = {
    totalVariants: variants.length,
    changedVariants,
    unchangedVariants: variants.length - changedVariants,
    changedFieldCount,
    warningCount,
    errorCount,
    minNewPriceMinor: minNewPrice,
    maxNewPriceMinor: maxNewPrice,
    avgPriceChangePct: priceChangeCount > 0 ? priceChangePctSum / priceChangeCount : null,
    negativeMarginCount,
    compareAtBelowPriceCount: compareAtBelowCount,
  };

  return { fingerprint, rows, blocked, summary };
}
