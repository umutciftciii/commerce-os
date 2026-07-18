/**
 * TODO-150 (ADR-073) — Identity Management Engine · PREVIEW ORKESTRASYONU (SAF ÇEKİRDEK).
 *
 * Derlenmiş pattern'ları (parser) tüm varyantlara karşı değerlendirir (evaluator), değerleri doğrular
 * ve çakışmaları tespit eder (collision). SAF: Prisma / HTTP / Date / Math.random BİLMEZ. DB okuma ve
 * dış-SKU sahiplik haritaları çağıran servisten (data-access) enjekte edilir → preview == apply
 * (deterministik). SEQ değerleri kanonik satır sırasında (servis sıralar) 1-tabanlı atanır.
 *
 * Blocking (apply reddedilir) = herhangi bir uygulanacak alanda SKU collision veya sert validation
 * hatası. Barcode duplicate = uyarı (non-blocking). Korumalı (custom) title = skipped (non-blocking).
 * Karmaşıklık: O(n·L) değerlendirme + O(n) collision (nested YOK).
 */

import type { CompiledPattern } from "./parser.js";
import { evaluatePattern, type ContextAttributeValue, type EvaluationContext } from "./evaluator.js";
import { buildValueFrequency, detectCollision } from "./collision.js";

export type IdentityField = "SKU" | "BARCODE" | "TITLE";
export type VariantStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

// Alan validation + collision tanı kodları (stable). Blocking olanlar apply'ı reddeder.
export type IdentityIssueCode =
  | "SKU_EMPTY"
  | "SKU_TOO_LONG"
  | "SKU_INVALID_CHARS"
  | "SKU_COLLISION"
  | "BARCODE_TOO_LONG"
  | "BARCODE_DUPLICATE"
  | "TITLE_EMPTY"
  | "TITLE_TOO_LONG"
  | "TITLE_PROTECTED";

export interface IdentityLimits {
  skuMax: number;
  barcodeMax: number;
  titleMax: number;
}

export const DEFAULT_IDENTITY_LIMITS: IdentityLimits = {
  skuMax: 64,
  barcodeMax: 64,
  titleMax: 200,
};

const SKU_CHARSET = /^[A-Za-z0-9._\-/]+$/;

// Blocking (apply'ı toptan reddeden) kodlar. BARCODE_DUPLICATE ve TITLE_PROTECTED bloklamaz.
const BLOCKING_CODES = new Set<IdentityIssueCode>([
  "SKU_EMPTY",
  "SKU_TOO_LONG",
  "SKU_INVALID_CHARS",
  "SKU_COLLISION",
  "BARCODE_TOO_LONG",
  "TITLE_EMPTY",
  "TITLE_TOO_LONG",
]);

export interface PreviewVariantInput {
  variantId: string;
  status: VariantStatus;
  currentSku: string;
  currentBarcode: string | null;
  currentTitle: string;
  /** true → title kullanıcı-yazımı (korumalı); regenerateCustomTitles false ise title atlanır. */
  titleIsCustom: boolean;
  /** attribute code → çözülmüş option değeri (yalnız bu varyantta seçili eksenler). */
  attributes: Map<string, ContextAttributeValue>;
}

export interface PreviewFieldResult {
  next: string;
  changed: boolean;
  applied: boolean;
  missing: string[];
  issues: IdentityIssueCode[];
}

export interface PreviewRow {
  variantId: string;
  status: VariantStatus;
  seq: number;
  current: { sku: string; barcode: string | null; title: string };
  sku: PreviewFieldResult | null;
  barcode: PreviewFieldResult | null;
  title: PreviewFieldResult | null;
}

export interface CollisionEntry {
  variantId: string;
  field: IdentityField;
  value: string;
  code: IdentityIssueCode;
}

export interface PreviewInput {
  /** KANONİK sırada varyantlar (servis sıralar; SEQ bu sıraya göre atanır). */
  variants: PreviewVariantInput[];
  patterns: {
    sku: CompiledPattern | null;
    barcode: CompiledPattern | null;
    title: CompiledPattern | null;
  };
  seqStart: number;
  regenerateCustomTitles: boolean;
  product: { slug: string; name: string };
  category: { code: string; name: string } | null;
  /** value → variantId (kümede OLMAYAN mevcut varyant sahibi) — dış SKU çakışması kanıtı. */
  externalSkuOwners: Map<string, string>;
  externalBarcodeOwners: Map<string, string>;
  limits?: IdentityLimits;
}

export interface PreviewOutput {
  rows: PreviewRow[];
  collisions: CollisionEntry[];
  /** true → apply reddedilmeli (blocking issue var). */
  blocked: boolean;
  counts: {
    changed: number; // uygulanacak (applied=true) alan-değişimi sayısı
    skipped: number; // değişmeyen veya korumalı/atlanmış alanlar (uygulanacak alanlar arasında)
    collisions: number;
  };
}

function makeContext(
  input: PreviewInput,
  variant: PreviewVariantInput,
  seq: number,
  preferLabel: boolean,
): EvaluationContext {
  return {
    product: input.product,
    category: input.category,
    attributes: variant.attributes,
    seq,
    preferLabel,
  };
}

function validateSku(value: string, limits: IdentityLimits): IdentityIssueCode[] {
  const issues: IdentityIssueCode[] = [];
  if (value.length === 0) issues.push("SKU_EMPTY");
  else {
    if (value.length > limits.skuMax) issues.push("SKU_TOO_LONG");
    if (!SKU_CHARSET.test(value)) issues.push("SKU_INVALID_CHARS");
  }
  return issues;
}

function validateBarcode(value: string, limits: IdentityLimits): IdentityIssueCode[] {
  // Boş barcode geçerli (temizleme değil — yalnız pattern varsa yazılır; boş = uygulanmaz).
  return value.length > limits.barcodeMax ? ["BARCODE_TOO_LONG"] : [];
}

function validateTitle(value: string, limits: IdentityLimits): IdentityIssueCode[] {
  const issues: IdentityIssueCode[] = [];
  if (value.length === 0) issues.push("TITLE_EMPTY");
  else if (value.length > limits.titleMax) issues.push("TITLE_TOO_LONG");
  return issues;
}

/**
 * Tüm varyantları değerlendirir → preview satırları + collision listesi + blocking bayrağı.
 * İki geçiş: (1) tüm SKU/barcode değerlerini üret + frekans; (2) collision + validation + applied.
 */
export function buildIdentityPreview(input: PreviewInput): PreviewOutput {
  const limits = input.limits ?? DEFAULT_IDENTITY_LIMITS;
  const { sku: skuPattern, barcode: barcodePattern, title: titlePattern } = input.patterns;

  // ── Geçiş 1: değerlendirme ──
  interface Evaluated {
    variant: PreviewVariantInput;
    seq: number;
    skuValue: string | null;
    skuMissing: string[];
    barcodeValue: string | null;
    barcodeMissing: string[];
    titleValue: string | null;
    titleMissing: string[];
  }
  const evaluated: Evaluated[] = input.variants.map((variant, index) => {
    const seq = input.seqStart + index;
    const skuEval = skuPattern ? evaluatePattern(skuPattern, makeContext(input, variant, seq, false)) : null;
    const barcodeEval = barcodePattern
      ? evaluatePattern(barcodePattern, makeContext(input, variant, seq, false))
      : null;
    const titleEval = titlePattern ? evaluatePattern(titlePattern, makeContext(input, variant, seq, true)) : null;
    return {
      variant,
      seq,
      skuValue: skuEval ? skuEval.value : null,
      skuMissing: skuEval ? skuEval.missing : [],
      barcodeValue: barcodeEval ? barcodeEval.value : null,
      barcodeMissing: barcodeEval ? barcodeEval.missing : [],
      titleValue: titleEval ? titleEval.value : null,
      titleMissing: titleEval ? titleEval.missing : [],
    };
  });

  const skuFreq = buildValueFrequency(evaluated.map((e) => e.skuValue));
  const barcodeFreq = buildValueFrequency(evaluated.map((e) => e.barcodeValue));

  // ── Geçiş 2: validation + collision + applied ──
  const rows: PreviewRow[] = [];
  const collisions: CollisionEntry[] = [];
  let changed = 0;
  let skipped = 0;
  let blocked = false;

  for (const e of evaluated) {
    const v = e.variant;

    let skuField: PreviewFieldResult | null = null;
    if (e.skuValue !== null) {
      const issues = validateSku(e.skuValue, limits);
      const col = detectCollision(e.skuValue, skuFreq, input.externalSkuOwners, v.variantId);
      if (col.internalCount > 1 || col.external) {
        issues.push("SKU_COLLISION");
        collisions.push({ variantId: v.variantId, field: "SKU", value: e.skuValue, code: "SKU_COLLISION" });
      }
      const hasBlocking = issues.some((c) => BLOCKING_CODES.has(c));
      const isChanged = e.skuValue !== v.currentSku;
      const applied = isChanged && !hasBlocking;
      if (hasBlocking) blocked = true;
      if (applied) changed++;
      else if (issues.length === 0) skipped++;
      skuField = { next: e.skuValue, changed: isChanged, applied, missing: e.skuMissing, issues };
    }

    let barcodeField: PreviewFieldResult | null = null;
    if (e.barcodeValue !== null) {
      const issues = validateBarcode(e.barcodeValue, limits);
      // Boş barcode değerlendirmesi → uygulanmaz (barcode temizleme bu motorun işi değil).
      const nonEmpty = e.barcodeValue.length > 0;
      if (nonEmpty) {
        const col = detectCollision(e.barcodeValue, barcodeFreq, input.externalBarcodeOwners, v.variantId);
        if (col.internalCount > 1 || col.external) {
          issues.push("BARCODE_DUPLICATE"); // uyarı (non-blocking)
          collisions.push({
            variantId: v.variantId,
            field: "BARCODE",
            value: e.barcodeValue,
            code: "BARCODE_DUPLICATE",
          });
        }
      }
      const hasBlocking = issues.some((c) => BLOCKING_CODES.has(c));
      const isChanged = nonEmpty && e.barcodeValue !== (v.currentBarcode ?? "");
      const applied = isChanged && !hasBlocking;
      if (hasBlocking) blocked = true;
      if (applied) changed++;
      else if (nonEmpty && !isChanged) skipped++;
      barcodeField = { next: e.barcodeValue, changed: isChanged, applied, missing: e.barcodeMissing, issues };
    }

    let titleField: PreviewFieldResult | null = null;
    if (e.titleValue !== null) {
      const issues = validateTitle(e.titleValue, limits);
      const isProtected = v.titleIsCustom && !input.regenerateCustomTitles;
      if (isProtected) issues.push("TITLE_PROTECTED");
      const hasBlocking = issues.some((c) => BLOCKING_CODES.has(c));
      const isChanged = e.titleValue !== v.currentTitle;
      const applied = isChanged && !hasBlocking && !isProtected;
      if (hasBlocking) blocked = true;
      if (applied) changed++;
      else if (isProtected || !isChanged) skipped++;
      titleField = { next: e.titleValue, changed: isChanged, applied, missing: e.titleMissing, issues };
    }

    rows.push({
      variantId: v.variantId,
      status: v.status,
      seq: e.seq,
      current: { sku: v.currentSku, barcode: v.currentBarcode, title: v.currentTitle },
      sku: skuField,
      barcode: barcodeField,
      title: titleField,
    });
  }

  return {
    rows,
    collisions,
    blocked,
    counts: { changed, skipped, collisions: collisions.length },
  };
}
