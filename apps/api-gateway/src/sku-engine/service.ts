/**
 * TODO-160A (ADR-109…113) — SKU Generation & Governance · SERVİS (orkestrasyon + SAF çekirdek).
 *
 * Deterministik varyant-seviyesi SKU üretimi/governance. Üretim algoritması SAF
 * `@commerce-os/utils` (buildBaseSku/resolveUniqueSku) motorundadır; bu servis yalnız:
 *   - varyantları BATCH okur (option kodları eksen sırasında çözülmüş),
 *   - store-genelindeki mevcut SKU kümesini tek sorguyla getirir (external collision),
 *   - SAF preview'i (buildSkuPreviewRows) çalıştırır,
 *   - regenerate'de TEK transaction + advisory-lock ile yalnız-değişen yazımı + AuditLog uygular.
 *
 * Server-authoritative: regenerate preview'i YENİDEN hesaplar (istemciye güvenilmez). Manuel/imported
 * SKU'lar `onlyAutoSource` (default) veya `force` olmadan KORUNUR ("manuel override sessizce değişmez").
 * Collision: in-batch + DB-wide çözülür (zero-pad sonek); DB `@@unique([storeId, sku])` nihai guard →
 * yarışta P2002 → 409. OrderLine snapshot'larına DOKUNULMAZ (immutable).
 */
import {
  SKU_MAX_LENGTH,
  buildBaseSku,
  normalizeSku,
  resolveUniqueSku,
} from "@commerce-os/utils";
import type { SkuSource } from "@commerce-os/contracts";
import type {
  SkuAuditVariantRow,
  SkuDataAccess,
  SkuVariantRow,
} from "./data.js";

export type VariantStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

// Mevcut bir SKU'nun tanı (problem) kodları. STABIL string'ler.
export type SkuIssueCode =
  | "SKU_EMPTY"
  | "SKU_INVALID_CHARS"
  | "SKU_TOO_LONG"
  | "SKU_OPAQUE"
  | "BARCODE_EQUALS_SKU";

// Kontrat skuSchema ile aynı gevşek biçim (lowercase/./_/- kabul eder — backward-compat).
const CONTRACT_SKU_CHARSET = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// Eski sistem/opak SKU deseni (V-<productId>-<hash>) — geçersiz DEĞİL ama backfill adayı.
const OPAQUE_SKU_PATTERN = /^V-[A-Za-z0-9]+-[a-z0-9]+$/;

export interface SkuPreviewRow {
  variantId: string;
  status: VariantStatus;
  currentSku: string;
  skuSource: SkuSource;
  suggestedSku: string;
  baseSku: string;
  changed: boolean;
  collision: boolean;
  protected: boolean;
  issues: SkuIssueCode[];
}

export interface SkuPreviewResult {
  rows: SkuPreviewRow[];
  counts: { total: number; changed: number; collisions: number; protectedCount: number };
}

/** Mevcut SKU'nun tanı kodlarını üretir (SAF). DUPLICATE store-seviyesi audit'te ayrı hesaplanır. */
export function classifySkuIssues(sku: string, barcode: string | null): SkuIssueCode[] {
  const issues: SkuIssueCode[] = [];
  const trimmed = sku.trim();
  if (trimmed.length === 0) {
    issues.push("SKU_EMPTY");
    return issues;
  }
  if (!CONTRACT_SKU_CHARSET.test(trimmed)) issues.push("SKU_INVALID_CHARS");
  if (trimmed.length > SKU_MAX_LENGTH) issues.push("SKU_TOO_LONG");
  if (OPAQUE_SKU_PATTERN.test(trimmed)) issues.push("SKU_OPAQUE");
  if (barcode !== null && barcode.length > 0 && barcode === sku) issues.push("BARCODE_EQUALS_SKU");
  return issues;
}

export interface BuildPreviewInput {
  productCode: string;
  /** KANONİK sırada varyantlar (data-access sıralar: createdAt/combinationKey). */
  variants: SkuVariantRow[];
  /** Store'daki TÜM varyant SKU'ları (bu varyantlarınki dahil) — external collision temeli. */
  existingStoreSkus: Set<string>;
  /** true → MANUAL/IMPORTED dahil yeniden üret (koruma kalkar). */
  force: boolean;
  /** true → yalnız AUTO kaynaklı SKU'lar regenerate edilir (default davranış). */
  onlyAutoSource: boolean;
}

/**
 * SAF preview: her varyant için deterministik base SKU + collision-çözülmüş öneri üretir. Koruma:
 * MANUAL/IMPORTED kaynak (force yoksa) ve onlyAutoSource → mevcut SKU KORUNUR (protected). Collision
 * çözümü in-batch (taken kümesi) + external (store SKU'ları) birleşimidir; deterministik sıra.
 */
export function buildSkuPreviewRows(input: BuildPreviewInput): SkuPreviewResult {
  const isProtected = (v: SkuVariantRow): boolean => {
    if (input.force) return false;
    if (input.onlyAutoSource) return v.skuSource !== "AUTO";
    return false;
  };

  const taken = new Set(input.existingStoreSkus);
  // Korunmayan varyantların mevcut SKU'sunu kümeden çıkar (değişebilir); korunanlar rezerve kalır.
  for (const v of input.variants) {
    if (!isProtected(v) && v.currentSku) taken.delete(v.currentSku);
  }

  const rows: SkuPreviewRow[] = [];
  let changed = 0;
  let collisions = 0;
  let protectedCount = 0;

  for (const v of input.variants) {
    const base = buildBaseSku({ productCode: input.productCode, optionCodes: v.optionCodes }).base;
    const prot = isProtected(v);
    let suggested: string;
    let collision = false;
    if (prot) {
      suggested = v.currentSku;
      protectedCount += 1;
    } else {
      const resolved = resolveUniqueSku(base, (c) => taken.has(c), { maxLength: SKU_MAX_LENGTH });
      suggested = resolved.sku;
      collision = resolved.attempts > 1;
      taken.add(suggested);
      if (collision) collisions += 1;
    }
    const isChanged = !prot && suggested !== v.currentSku;
    if (isChanged) changed += 1;
    rows.push({
      variantId: v.variantId,
      status: v.status,
      currentSku: v.currentSku,
      skuSource: v.skuSource,
      suggestedSku: suggested,
      baseSku: base,
      changed: isChanged,
      collision,
      protected: prot,
      issues: classifySkuIssues(v.currentSku, v.barcode),
    });
  }

  return { rows, counts: { total: input.variants.length, changed, collisions, protectedCount } };
}

// ─────────────────────────── servis ───────────────────────────

export type SkuErrorCode = "PRODUCT_NOT_FOUND" | "SKU_CONFLICT";

export interface SkuError {
  code: SkuErrorCode;
  message: string;
}

export interface SkuValidateResult {
  ok: boolean;
  normalized: string;
  errors: string[];
  available: boolean;
}

export interface SkuRegenerateResult {
  batchId: string;
  updated: number;
  skipped: number;
  rows: SkuPreviewRow[];
}

export type Result<T> = { ok: true; result: T } | { ok: false; error: SkuError };

export interface SkuService {
  preview(input: {
    storeId: string;
    productId: string;
    force?: boolean;
    onlyAutoSource?: boolean;
    variantIds?: string[];
  }): Promise<Result<SkuPreviewResult>>;
  regenerate(input: {
    storeId: string;
    productId: string;
    actorUserId: string | null;
    force?: boolean;
    onlyAutoSource?: boolean;
    variantIds?: string[];
  }): Promise<Result<SkuRegenerateResult>>;
  validate(input: {
    storeId: string;
    sku: string;
    variantId?: string;
  }): Promise<SkuValidateResult>;
  audit(input: { storeId: string; limit: number }): Promise<SkuAuditResult>;
  /**
   * Yeni (henüz kaydedilmemiş) bir varyant için deterministik AUTO SKU üretir (manuel create'te SKU
   * boşsa çağrılır). Option kodlarını eksen sırasında çözer + store-wide collision çözer. DB'ye YAZMAZ;
   * çağıran (create route) sonucu variant create'e geçirir → DB unique nihai guard + P2002→409.
   */
  generateForNewVariant(input: {
    storeId: string;
    productId: string;
    optionIds: string[];
  }): Promise<{ sku: string } | null>;
}

export interface SkuAuditResultRow {
  variantId: string;
  productId: string;
  currentSku: string;
  skuSource: SkuSource;
  status: VariantStatus;
  problems: string[];
  suggestedSku: string | null;
}

export interface SkuAuditResult {
  storeId: string;
  scanned: number;
  flagged: number;
  summary: Record<string, number>;
  rows: SkuAuditResultRow[];
  truncated: boolean;
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function filterVariants(variants: SkuVariantRow[], variantIds?: string[]): SkuVariantRow[] {
  if (!variantIds || variantIds.length === 0) return variants;
  const wanted = new Set(variantIds);
  return variants.filter((v) => wanted.has(v.variantId));
}

export function createSkuService(dataAccess: SkuDataAccess): SkuService {
  async function computePreview(
    read: Pick<SkuDataAccess, "listVariantsForSku" | "listStoreSkuValues">,
    storeId: string,
    productCode: string,
    productId: string,
    opts: { force: boolean; onlyAutoSource: boolean; variantIds?: string[] },
  ): Promise<SkuPreviewResult> {
    const [variants, existing] = await Promise.all([
      read.listVariantsForSku(storeId, productId),
      read.listStoreSkuValues(storeId),
    ]);
    return buildSkuPreviewRows({
      productCode,
      variants: filterVariants(variants, opts.variantIds),
      existingStoreSkus: new Set(existing),
      force: opts.force,
      onlyAutoSource: opts.onlyAutoSource,
    });
  }

  return {
    preview: async ({ storeId, productId, force, onlyAutoSource, variantIds }) => {
      const product = await dataAccess.findProduct(storeId, productId);
      if (!product) return { ok: false, error: { code: "PRODUCT_NOT_FOUND", message: "Product not found." } };
      const result = await computePreview(dataAccess, storeId, product.slug, productId, {
        force: force ?? false,
        onlyAutoSource: onlyAutoSource ?? true,
        variantIds,
      });
      return { ok: true, result };
    },

    regenerate: async ({ storeId, productId, actorUserId, force, onlyAutoSource, variantIds }) => {
      const product = await dataAccess.findProduct(storeId, productId);
      if (!product) return { ok: false, error: { code: "PRODUCT_NOT_FOUND", message: "Product not found." } };
      try {
        return await dataAccess.transaction(async (ctx): Promise<Result<SkuRegenerateResult>> => {
          await ctx.lockProduct(productId);
          // Server-authoritative: preview'i tx içinde YENİDEN hesapla.
          const preview = await computePreview(ctx, storeId, product.slug, productId, {
            force: force ?? false,
            onlyAutoSource: onlyAutoSource ?? true,
            variantIds,
          });
          const toWrite = preview.rows.filter((r) => r.changed && !r.protected);
          const batchId = ctx.newBatchId();
          for (const row of toWrite) {
            await ctx.writeVariantSku(storeId, productId, {
              variantId: row.variantId,
              newSku: row.suggestedSku,
              oldSku: row.currentSku,
              actorUserId,
              batchId,
            });
          }
          return {
            ok: true,
            result: {
              batchId,
              updated: toWrite.length,
              skipped: preview.rows.length - toWrite.length,
              rows: preview.rows,
            },
          };
        });
      } catch (error) {
        if (isUniqueConflict(error)) {
          return {
            ok: false,
            error: {
              code: "SKU_CONFLICT",
              message: "A concurrent change produced a SKU conflict. Please re-preview and retry.",
            },
          };
        }
        throw error;
      }
    },

    validate: async ({ storeId, sku, variantId }) => {
      const trimmed = sku.trim();
      const errors: string[] = [];
      if (trimmed.length === 0) errors.push("empty");
      else {
        if (trimmed.length > 80) errors.push("too-long");
        if (!CONTRACT_SKU_CHARSET.test(trimmed)) errors.push("invalid-characters");
      }
      let available = true;
      if (errors.length === 0) {
        const owner = await dataAccess.findVariantIdBySku(storeId, trimmed);
        available = owner === null || owner === variantId;
      }
      return {
        ok: errors.length === 0 && available,
        normalized: normalizeSku(sku, { maxLength: SKU_MAX_LENGTH }),
        errors,
        available,
      };
    },

    audit: async ({ storeId, limit }) => {
      const variants = await dataAccess.listVariantsForAudit(storeId);
      // Store-wide duplicate frekansı (case-sensitive; SKU'lar normalize edilmiş sayılır).
      const freq = new Map<string, number>();
      for (const v of variants) {
        if (v.currentSku) freq.set(v.currentSku, (freq.get(v.currentSku) ?? 0) + 1);
      }
      const summary: Record<string, number> = {};
      const flaggedRows: SkuAuditResultRow[] = [];
      for (const v of variants) {
        const problems: string[] = classifySkuIssues(v.currentSku, v.barcode);
        if (v.currentSku && (freq.get(v.currentSku) ?? 0) > 1) problems.push("DUPLICATE");
        if (problems.length === 0) continue;
        for (const p of problems) summary[p] = (summary[p] ?? 0) + 1;
        const base = buildBaseSku({ productCode: v.productSlug, optionCodes: v.optionCodes }).base;
        flaggedRows.push({
          variantId: v.variantId,
          productId: v.productId,
          currentSku: v.currentSku,
          skuSource: v.skuSource,
          status: v.status,
          problems,
          suggestedSku: base,
        });
      }
      const truncated = flaggedRows.length > limit;
      return {
        storeId,
        scanned: variants.length,
        flagged: flaggedRows.length,
        summary,
        rows: flaggedRows.slice(0, limit),
        truncated,
      };
    },

    generateForNewVariant: async ({ storeId, productId, optionIds }) => {
      const product = await dataAccess.findProduct(storeId, productId);
      if (!product) return null;
      const [optionCodes, existing] = await Promise.all([
        dataAccess.resolveOptionCodes(storeId, productId, optionIds),
        dataAccess.listStoreSkuValues(storeId),
      ]);
      const taken = new Set(existing);
      const base = buildBaseSku({ productCode: product.slug, optionCodes }).base;
      const resolved = resolveUniqueSku(base, (c) => taken.has(c), { maxLength: SKU_MAX_LENGTH });
      return { sku: resolved.sku };
    },
  };
}

// ─────────────────────────── route yardımcıları ───────────────────────────

export function skuErrorStatus(code: SkuErrorCode): number {
  if (code === "PRODUCT_NOT_FOUND") return 404;
  if (code === "SKU_CONFLICT") return 409;
  return 422;
}

// Tip yeniden ihraç (routes serialize ederken kullanır).
export type { SkuAuditVariantRow };
