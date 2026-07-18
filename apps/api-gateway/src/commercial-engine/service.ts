/**
 * TODO-151 (ADR-074) — Commercial Engine · SERVİS (orkestrasyon).
 *
 * Rule'u derler (SAF compileRule), varyantları BATCH okur, SAF preview'i çalıştırır ve apply'da TEK
 * transaction + advisory-lock ile: stale-preview fingerprint kontrolü → server-authoritative yeniden
 * hesap → yalnız-değişen yazım (net/KDV üçlüsü F4C ile türetilir) → append-only audit uygular.
 * İstemcinin gönderdiği hedef değerlere ASLA güvenilmez.
 *
 * Garantiler: deterministik (preview == apply) · idempotent (aynı apply ikinci kez → updated=0) ·
 * fail-closed (blocked/stale → hiçbir yazım) · tenant-safe · concurrency-safe (advisory lock).
 */

import { randomUUID } from "node:crypto";
import { splitGrossByVat } from "@commerce-os/utils";
import { Prisma } from "@prisma/client";
import { compileRule, type RuleError } from "./rule.js";
import {
  buildCommercialPreview,
  type CommercialMode,
  type PreviewOutput,
} from "./preview.js";
import { DEFAULT_COMMERCIAL_LIMITS, type CommercialLimits, type CommercialRule, type CommercialVariantInput } from "./types.js";
import type {
  CommercialAuditRow,
  CommercialDataAccess,
  CommercialTxContext,
  CommercialVariantRow,
  CommercialVariantWrite,
} from "./data.js";

export type CommercialErrorCode =
  | "PRODUCT_NOT_FOUND"
  | "COMMERCIAL_VARIANT_NOT_FOUND"
  | "COMMERCIAL_INVALID_RULE"
  | "COMMERCIAL_SELECTION_EMPTY"
  | "COMMERCIAL_PREVIEW_STALE"
  | "COMMERCIAL_APPLY_BLOCKED"
  | "COMMERCIAL_CONFLICT"
  | "COMMERCIAL_LOCK_CONFLICT";

export interface CommercialError {
  code: CommercialErrorCode;
  message: string;
  detail?: string;
}

/** İstemciden gelen ham direct-edit (Zod parse edilmiş). */
export interface DirectEditInput {
  variantId: string;
  priceMinor?: number;
  compareAtMinor?: number | null;
  costMinor?: number | null;
  vatRateBps?: number;
}

export interface CommercialModeInput {
  rule?: CommercialRule;
  edits?: DirectEditInput[];
}

export interface CommercialScopeInput {
  selectedVariantIds?: string[];
}

export interface CommercialPreviewInput extends CommercialModeInput, CommercialScopeInput {
  storeId: string;
  productId: string;
}

export interface CommercialApplyInput extends CommercialPreviewInput {
  actorUserId: string | null;
  /** Preview'in ürettiği fingerprint; apply bunu sunucu-güncel değerle karşılaştırır (stale-guard). */
  baseFingerprint: string;
}

export interface CommercialPreviewResult extends PreviewOutput {
  source: "DIRECT_EDIT" | "BULK_RULE";
}

export interface CommercialApplyResult {
  batchId: string;
  updatedVariants: number;
  updatedFields: number;
  skippedVariants: number;
  auditCount: number;
  source: "DIRECT_EDIT" | "BULK_RULE";
  preview: CommercialPreviewResult;
}

export type PreviewResult = { ok: true; result: CommercialPreviewResult } | { ok: false; error: CommercialError };
export type ApplyResult = { ok: true; result: CommercialApplyResult } | { ok: false; error: CommercialError };

export interface CommercialService {
  /** Matris okuma (kural/edit yok → current==target, changed=false). */
  matrix(input: { storeId: string; productId: string; selectedVariantIds?: string[] }): Promise<PreviewResult>;
  preview(input: CommercialPreviewInput): Promise<PreviewResult>;
  apply(input: CommercialApplyInput): Promise<ApplyResult>;
}

export interface CommercialServiceConfig {
  limits?: CommercialLimits;
}

function ruleErrorToServiceError(e: RuleError): CommercialError {
  return { code: "COMMERCIAL_INVALID_RULE", message: e.message, detail: e.detail };
}

// Ham row → preview girdisi.
function toVariantInput(row: CommercialVariantRow): CommercialVariantInput {
  return {
    variantId: row.variantId,
    sku: row.sku,
    title: row.title,
    status: row.status,
    currency: row.currency,
    attributes: row.attributes,
    current: row.current,
  };
}

export function createCommercialService(
  dataAccess: CommercialDataAccess,
  config: CommercialServiceConfig = {},
): CommercialService {
  const limits = config.limits ?? DEFAULT_COMMERCIAL_LIMITS;

  // Ortak: kapsam çöz (selection doğrula) + mode kur (rule derle / edit süz). Saf; DB'siz.
  function resolveScopeAndMode(
    rows: CommercialVariantRow[],
    input: CommercialModeInput & CommercialScopeInput,
  ):
    | { ok: true; scope: CommercialVariantRow[]; mode: CommercialMode; source: "DIRECT_EDIT" | "BULK_RULE" }
    | { ok: false; error: CommercialError } {
    const byId = new Map(rows.map((r) => [r.variantId, r]));

    // Selection: verilmişse boş olamaz; her ID kapsamda (non-archived + bu ürün) olmalı.
    let scope: CommercialVariantRow[] = rows;
    if (input.selectedVariantIds !== undefined) {
      if (input.selectedVariantIds.length === 0) {
        return { ok: false, error: { code: "COMMERCIAL_SELECTION_EMPTY", message: "Selection is empty." } };
      }
      const selected: CommercialVariantRow[] = [];
      for (const id of input.selectedVariantIds) {
        const row = byId.get(id);
        if (!row) {
          return {
            ok: false,
            error: { code: "COMMERCIAL_VARIANT_NOT_FOUND", message: `Variant not in scope: ${id}`, detail: id },
          };
        }
        selected.push(row);
      }
      scope = selected;
    }

    // Mode: rule öncelikli; yoksa direct edits; ikisi de yoksa no-op direct (matris okuma).
    if (input.rule) {
      const compiled = compileRule(input.rule);
      if (!compiled.ok) return { ok: false, error: ruleErrorToServiceError(compiled.error) };
      return { ok: true, scope, mode: { kind: "rule", rule: compiled.rule }, source: "BULK_RULE" };
    }

    const edits = input.edits ?? [];
    // Direct-edit hedef ID'leri kapsamda olmalı (tenant/scope guard).
    for (const e of edits) {
      if (!byId.has(e.variantId)) {
        return {
          ok: false,
          error: { code: "COMMERCIAL_VARIANT_NOT_FOUND", message: `Edit targets unknown variant: ${e.variantId}`, detail: e.variantId },
        };
      }
    }
    return {
      ok: true,
      scope,
      mode: { kind: "direct", edits },
      source: "DIRECT_EDIT",
    };
  }

  async function computePreview(
    ctx: Pick<CommercialTxContext, "listVariants">,
    storeId: string,
    productId: string,
    input: CommercialModeInput & CommercialScopeInput,
  ): Promise<PreviewResult> {
    const rows = await ctx.listVariants(storeId, productId);
    const resolved = resolveScopeAndMode(rows, input);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const output = buildCommercialPreview({
      variants: resolved.scope.map(toVariantInput),
      mode: resolved.mode,
      limits,
    });
    return { ok: true, result: { ...output, source: resolved.source } };
  }

  return {
    matrix: async ({ storeId, productId, selectedVariantIds }) => {
      const product = await dataAccess.findProduct(storeId, productId);
      if (!product) return { ok: false, error: { code: "PRODUCT_NOT_FOUND", message: "Product not found." } };
      return dataAccess.read((ctx) => computePreview(ctx, storeId, productId, { selectedVariantIds }));
    },

    preview: async ({ storeId, productId, ...rest }) => {
      const product = await dataAccess.findProduct(storeId, productId);
      if (!product) return { ok: false, error: { code: "PRODUCT_NOT_FOUND", message: "Product not found." } };
      return dataAccess.read((ctx) => computePreview(ctx, storeId, productId, rest));
    },

    apply: async ({ storeId, productId, actorUserId, baseFingerprint, ...rest }) => {
      const product = await dataAccess.findProduct(storeId, productId);
      if (!product) return { ok: false, error: { code: "PRODUCT_NOT_FOUND", message: "Product not found." } };

      try {
        return await dataAccess.transaction(async (ctx): Promise<ApplyResult> => {
          await ctx.lockProduct(product.id);

          const rows = await ctx.listVariants(storeId, product.id);
          const resolved = resolveScopeAndMode(rows, rest);
          if (!resolved.ok) return { ok: false, error: resolved.error };

          const preview = buildCommercialPreview({
            variants: resolved.scope.map(toVariantInput),
            mode: resolved.mode,
            limits,
          });

          // Stale-preview guard: sunucu-güncel fingerprint istemcininkiyle uyuşmalı.
          if (preview.fingerprint !== baseFingerprint) {
            return {
              ok: false,
              error: {
                code: "COMMERCIAL_PREVIEW_STALE",
                message: "Commercial values changed since preview. Re-preview and retry.",
              },
            };
          }

          if (preview.blocked) {
            return {
              ok: false,
              error: {
                code: "COMMERCIAL_APPLY_BLOCKED",
                message: "Apply is blocked by validation errors. Resolve them and retry.",
              },
            };
          }

          // Yalnız değişen satırları yazıma + audit'e çevir (net/KDV üçlüsü türetilir).
          const writes: CommercialVariantWrite[] = [];
          const audits: CommercialAuditRow[] = [];
          let updatedFields = 0;
          for (const row of preview.rows) {
            if (!row.changed) continue;
            const write: CommercialVariantWrite = { variantId: row.variantId };
            let pricingTouched = false;
            for (const field of row.changedFields) {
              if (field === "PRICE") {
                write.priceMinor = row.target.priceMinor;
                pricingTouched = true;
                audits.push({ variantId: row.variantId, field, oldValue: row.current.priceMinor, newValue: row.target.priceMinor, currency: row.currency });
              } else if (field === "COMPARE_AT_PRICE") {
                write.compareAtMinor = row.target.compareAtMinor;
                audits.push({ variantId: row.variantId, field, oldValue: row.current.compareAtMinor, newValue: row.target.compareAtMinor, currency: row.currency });
              } else if (field === "COST") {
                write.costMinor = row.target.costMinor;
                audits.push({ variantId: row.variantId, field, oldValue: row.current.costMinor, newValue: row.target.costMinor, currency: row.currency });
              } else if (field === "VAT_RATE") {
                write.vatRateBps = row.target.vatRateBps;
                pricingTouched = true;
                audits.push({ variantId: row.variantId, field, oldValue: row.current.vatRateBps, newValue: row.target.vatRateBps, currency: row.currency });
              }
              updatedFields++;
            }
            // F4C — PRICE veya VAT değiştiyse net/KDV brütten yeniden türet (brüt SABİT; üçlü tutarlı).
            if (pricingTouched) {
              const split = splitGrossByVat(row.target.priceMinor, row.target.vatRateBps);
              write.netPriceMinor = split.netMinor;
              write.vatAmountMinor = split.vatMinor;
            }
            writes.push(write);
          }

          const batchId = randomUUID();
          const source = resolved.source;
          const ruleSnapshot: Prisma.InputJsonValue | undefined =
            resolved.mode.kind === "rule" ? (resolved.mode.rule as unknown as Prisma.InputJsonValue) : undefined;

          if (writes.length > 0) {
            await ctx.applyWrites(storeId, product.id, batchId, writes, audits, source, ruleSnapshot, actorUserId);
          }

          return {
            ok: true,
            result: {
              batchId,
              updatedVariants: writes.length,
              updatedFields,
              skippedVariants: preview.summary.totalVariants - writes.length,
              auditCount: audits.length,
              source,
              preview: { ...preview, source },
            },
          };
        });
      } catch (error) {
        if (isUniqueConflict(error)) {
          return {
            ok: false,
            error: { code: "COMMERCIAL_CONFLICT", message: "A concurrent change caused a conflict. Re-preview and retry." },
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

export function commercialErrorStatus(code: CommercialErrorCode): number {
  switch (code) {
    case "PRODUCT_NOT_FOUND":
    case "COMMERCIAL_VARIANT_NOT_FOUND":
      return 404;
    case "COMMERCIAL_PREVIEW_STALE":
    case "COMMERCIAL_CONFLICT":
    case "COMMERCIAL_LOCK_CONFLICT":
      return 409;
    case "COMMERCIAL_INVALID_RULE":
    case "COMMERCIAL_SELECTION_EMPTY":
    case "COMMERCIAL_APPLY_BLOCKED":
      return 422;
    default:
      return 422;
  }
}
