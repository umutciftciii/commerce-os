/**
 * TODO-150 (ADR-073) — Identity Management Engine · SERVİS (orkestrasyon).
 *
 * Pattern'ları derler (SAF parser), varyantları BATCH okur, dış-SKU sahiplerini tek sorguda getirir,
 * SAF preview'i (buildIdentityPreview) çalıştırır ve apply'da TEK transaction + advisory-lock ile
 * yalnız-değişen yazımı + append-only audit uygular. Server-authoritative: apply preview'i YENİDEN
 * hesaplar (istemciye güvenilmez). Combination Engine / generation DEĞİŞMEZ.
 *
 * Garantiler: deterministik (preview == apply) · idempotent (aynı pattern ikinci kez → updated=0) ·
 * fail-closed (blocked → hiçbir yazım) · tenant-safe · concurrency-safe (advisory lock + DB unique).
 */
import { randomUUID } from "node:crypto";
import { parsePattern, type CompiledPattern } from "./parser.js";
import { evaluatePattern, type EvaluationContext } from "./evaluator.js";
import {
  buildIdentityPreview,
  DEFAULT_IDENTITY_LIMITS,
  type IdentityField,
  type IdentityLimits,
  type PreviewInput,
  type PreviewOutput,
  type PreviewVariantInput,
} from "./preview.js";
import type {
  IdentityAuditRow,
  IdentityDataAccess,
  IdentityProductRef,
  IdentityTxContext,
  IdentityVariantRow,
  IdentityVariantWrite,
} from "./data.js";

// Preview'in ihtiyaç duyduğu salt-okuma bağlam yüzeyi (read + transaction ikisi de karşılar).
type IdentityReadContext = Pick<
  IdentityTxContext,
  "listVariants" | "findExternalSkuOwners" | "findExternalBarcodeOwners"
>;

export type IdentityErrorCode =
  | "PRODUCT_NOT_FOUND"
  | "IDENTITY_NO_PATTERN"
  | "IDENTITY_PATTERN_INVALID"
  | "IDENTITY_APPLY_BLOCKED"
  | "IDENTITY_SKU_CONFLICT";

export interface IdentityError {
  code: IdentityErrorCode;
  message: string;
  /** Pattern hatasında hangi alan (SKU/BARCODE/TITLE). */
  field?: IdentityField;
  /** Parser'ın stable alt-kodu (IDENTITY_UNKNOWN_TOKEN, ...). */
  patternCode?: string;
  index?: number;
}

export interface IdentityPatternsInput {
  sku?: string | null;
  barcode?: string | null;
  title?: string | null;
  seqStart?: number;
  regenerateCustomTitles?: boolean;
}

export interface IdentityPreviewResult extends PreviewOutput {
  patterns: { sku: string | null; barcode: string | null; title: string | null };
  variantCount: number;
}

export interface IdentityApplyResult {
  batchId: string;
  updated: number;
  skipped: number;
  preview: IdentityPreviewResult;
}

export type PreviewResult =
  | { ok: true; result: IdentityPreviewResult }
  | { ok: false; error: IdentityError };

export type ApplyResult =
  | { ok: true; result: IdentityApplyResult }
  | { ok: false; error: IdentityError };

export interface IdentityService {
  preview(input: { storeId: string; productId: string } & IdentityPatternsInput): Promise<PreviewResult>;
  apply(
    input: { storeId: string; productId: string; actorUserId: string | null } & IdentityPatternsInput,
  ): Promise<ApplyResult>;
}

export interface IdentityServiceConfig {
  limits?: IdentityLimits;
}

interface CompiledPatterns {
  sku: CompiledPattern | null;
  barcode: CompiledPattern | null;
  title: CompiledPattern | null;
}

// Boş/whitespace pattern → "alan yok". Aksi halde derle; hata alanla birlikte döndür.
function compileField(
  field: IdentityField,
  raw: string | null | undefined,
): { ok: true; pattern: CompiledPattern | null } | { ok: false; error: IdentityError } {
  if (raw == null || raw.trim().length === 0) return { ok: true, pattern: null };
  const parsed = parsePattern(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: "IDENTITY_PATTERN_INVALID",
        message: parsed.error.message,
        field,
        patternCode: parsed.error.code,
        index: parsed.error.index,
      },
    };
  }
  return { ok: true, pattern: parsed.pattern };
}

function compileAll(input: IdentityPatternsInput):
  | { ok: true; patterns: CompiledPatterns }
  | { ok: false; error: IdentityError } {
  const sku = compileField("SKU", input.sku);
  if (!sku.ok) return sku;
  const barcode = compileField("BARCODE", input.barcode);
  if (!barcode.ok) return barcode;
  const title = compileField("TITLE", input.title);
  if (!title.ok) return title;
  if (!sku.pattern && !barcode.pattern && !title.pattern) {
    return {
      ok: false,
      error: { code: "IDENTITY_NO_PATTERN", message: "At least one of sku/barcode/title pattern is required." },
    };
  }
  return { ok: true, patterns: { sku: sku.pattern, barcode: barcode.pattern, title: title.pattern } };
}

function toPreviewVariant(row: IdentityVariantRow): PreviewVariantInput {
  return {
    variantId: row.variantId,
    status: row.status,
    currentSku: row.currentSku,
    currentBarcode: row.currentBarcode,
    currentTitle: row.currentTitle,
    titleIsCustom: row.titleIsCustom,
    attributes: row.attributes,
  };
}

function makeCtx(
  product: IdentityProductRef,
  variant: IdentityVariantRow,
  seq: number,
  preferLabel: boolean,
): EvaluationContext {
  return {
    product: { slug: product.slug, name: product.name },
    category: product.category,
    attributes: variant.attributes,
    seq,
    preferLabel,
  };
}

// Dış-collision sorgusu için identifier-modu aday değerlerini (SKU/barcode) önceden üretir.
function collectCandidates(
  pattern: CompiledPattern | null,
  product: IdentityProductRef,
  variants: IdentityVariantRow[],
  seqStart: number,
): string[] {
  if (!pattern) return [];
  return variants.map((variant, i) =>
    evaluatePattern(pattern, makeCtx(product, variant, seqStart + i, false)).value,
  );
}

export function createIdentityService(
  dataAccess: IdentityDataAccess,
  config: IdentityServiceConfig = {},
): IdentityService {
  const limits = config.limits ?? DEFAULT_IDENTITY_LIMITS;

  async function computePreview(
    ctx: IdentityReadContext,
    product: IdentityProductRef,
    storeId: string,
    patterns: CompiledPatterns,
    seqStart: number,
    regenerateCustomTitles: boolean,
  ): Promise<IdentityPreviewResult> {
    const variants = await ctx.listVariants(storeId, product.id);
    const targetIds = variants.map((v) => v.variantId);

    const skuCandidates = collectCandidates(patterns.sku, product, variants, seqStart);
    const barcodeCandidates = collectCandidates(patterns.barcode, product, variants, seqStart);

    const [externalSkuOwners, externalBarcodeOwners] = await Promise.all([
      patterns.sku ? ctx.findExternalSkuOwners(storeId, skuCandidates, targetIds) : Promise.resolve(new Map<string, string>()),
      patterns.barcode
        ? ctx.findExternalBarcodeOwners(storeId, barcodeCandidates, targetIds)
        : Promise.resolve(new Map<string, string>()),
    ]);

    const previewInput: PreviewInput = {
      variants: variants.map(toPreviewVariant),
      patterns,
      seqStart,
      regenerateCustomTitles,
      product: { slug: product.slug, name: product.name },
      category: product.category,
      externalSkuOwners,
      externalBarcodeOwners,
      limits,
    };
    const output = buildIdentityPreview(previewInput);
    return {
      ...output,
      patterns: {
        sku: patterns.sku?.source ?? null,
        barcode: patterns.barcode?.source ?? null,
        title: patterns.title?.source ?? null,
      },
      variantCount: variants.length,
    };
  }

  return {
    preview: async ({ storeId, productId, seqStart, regenerateCustomTitles, ...raw }) => {
      const compiled = compileAll(raw);
      if (!compiled.ok) return { ok: false, error: compiled.error };
      const product = await dataAccess.findProduct(storeId, productId);
      if (!product) return { ok: false, error: { code: "PRODUCT_NOT_FOUND", message: "Product not found." } };
      const result = await dataAccess.read((ctx) =>
        computePreview(ctx, product, storeId, compiled.patterns, seqStart ?? 1, regenerateCustomTitles ?? false),
      );
      return { ok: true, result };
    },

    apply: async ({ storeId, productId, actorUserId, seqStart, regenerateCustomTitles, ...raw }) => {
      const compiled = compileAll(raw);
      if (!compiled.ok) return { ok: false, error: compiled.error };
      const product = await dataAccess.findProduct(storeId, productId);
      if (!product) return { ok: false, error: { code: "PRODUCT_NOT_FOUND", message: "Product not found." } };

      try {
        return await dataAccess.transaction(async (ctx): Promise<ApplyResult> => {
          await ctx.lockProduct(product.id);
          const preview = await computePreview(
            ctx,
            product,
            storeId,
            compiled.patterns,
            seqStart ?? 1,
            regenerateCustomTitles ?? false,
          );
          if (preview.blocked) {
            return {
              ok: false,
              error: {
                code: "IDENTITY_APPLY_BLOCKED",
                message: "Apply is blocked by collisions or validation errors. Resolve them and retry.",
              },
            };
          }

          // Yalnız uygulanacak (applied) alanları yazıma + audit'e çevir.
          const writes: IdentityVariantWrite[] = [];
          const audits: IdentityAuditRow[] = [];
          let updatedVariants = 0;
          for (const row of preview.rows) {
            const write: IdentityVariantWrite = { variantId: row.variantId, writeTitle: false };
            let touched = false;
            if (row.sku?.applied) {
              write.sku = row.sku.next;
              audits.push({
                variantId: row.variantId,
                field: "SKU",
                oldValue: row.current.sku,
                newValue: row.sku.next,
                pattern: preview.patterns.sku,
              });
              touched = true;
            }
            if (row.barcode?.applied) {
              write.barcode = row.barcode.next;
              audits.push({
                variantId: row.variantId,
                field: "BARCODE",
                oldValue: row.current.barcode,
                newValue: row.barcode.next,
                pattern: preview.patterns.barcode,
              });
              touched = true;
            }
            if (row.title?.applied) {
              write.title = row.title.next;
              write.writeTitle = true;
              audits.push({
                variantId: row.variantId,
                field: "TITLE",
                oldValue: row.current.title,
                newValue: row.title.next,
                pattern: preview.patterns.title,
              });
              touched = true;
            }
            if (touched) {
              writes.push(write);
              updatedVariants++;
            }
          }

          const batchId = randomUUID();
          if (writes.length > 0) {
            await ctx.applyWrites(storeId, product.id, batchId, writes, audits, actorUserId);
          }

          const skipped = preview.variantCount - updatedVariants;
          return {
            ok: true,
            result: { batchId, updated: updatedVariants, skipped, preview },
          };
        });
      } catch (error) {
        if (isUniqueConflict(error)) {
          return {
            ok: false,
            error: {
              code: "IDENTITY_SKU_CONFLICT",
              message: "A concurrent change produced a SKU conflict. Please re-preview and retry.",
            },
          };
        }
        throw error;
      }
    },
  };
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

// ─────────────────────────── route katmanı yardımcıları ───────────────────────────

export function serializeIdentityPreview(result: IdentityPreviewResult) {
  return {
    rows: result.rows.map((r) => ({
      variantId: r.variantId,
      status: r.status,
      seq: r.seq,
      current: r.current,
      sku: r.sku,
      barcode: r.barcode,
      title: r.title,
    })),
    collisions: result.collisions,
    blocked: result.blocked,
    counts: result.counts,
    patterns: result.patterns,
    variantCount: result.variantCount,
  };
}

export function serializeIdentityApply(result: IdentityApplyResult) {
  return {
    batchId: result.batchId,
    updated: result.updated,
    skipped: result.skipped,
    collisions: result.preview.collisions,
    preview: serializeIdentityPreview(result.preview),
  };
}

export function identityErrorStatus(code: IdentityErrorCode): number {
  if (code === "PRODUCT_NOT_FOUND") return 404;
  if (code === "IDENTITY_SKU_CONFLICT") return 409;
  return 422; // NO_PATTERN / PATTERN_INVALID / APPLY_BLOCKED
}
