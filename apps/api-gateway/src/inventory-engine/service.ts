/**
 * TODO-152 (ADR-076) — Inventory Engine · SERVİS (orkestrasyon).
 *
 * Depoyu çözer (yoksa default), varyantları BATCH okur, SAF preview'i çalıştırır ve apply'da TEK
 * transaction + advisory-lock ile: stale-preview fingerprint kontrolü → server-authoritative yeniden
 * hesap → yalnız-değişen yazım (+ DEFAULT depo InventoryItem senkronu) → append-only audit uygular.
 * İstemcinin gönderdiği hedeflere ASLA güvenilmez.
 *
 * Garantiler: deterministik (preview == apply) · idempotent (aynı apply ikinci kez → updated=0) ·
 * fail-closed (blocked/stale/inactive → hiçbir yazım) · tenant-safe · concurrency-safe (advisory lock).
 */

import { randomUUID } from "node:crypto";
import {
  buildInventoryPreview,
  type InventoryMode,
  type PreviewOutput,
} from "./preview.js";
import {
  DEFAULT_INVENTORY_LIMITS,
  INVENTORY_FIELDS,
  type InventoryField,
  type InventoryLimits,
  type InventoryRule,
  type InventoryState,
  type InventoryVariantInput,
} from "./types.js";
import type {
  InventoryAuditRow,
  InventoryDataAccess,
  InventoryTxContext,
  InventoryVariantRow,
  InventoryVariantWrite,
  InventoryWarehouseRef,
} from "./data.js";

export type InventoryErrorCode =
  | "PRODUCT_NOT_FOUND"
  | "WAREHOUSE_NOT_FOUND"
  | "INVENTORY_VARIANT_NOT_FOUND"
  | "INVENTORY_INVALID_RULE"
  | "INVENTORY_SELECTION_EMPTY"
  | "INVENTORY_PREVIEW_STALE"
  | "INVENTORY_APPLY_BLOCKED"
  | "INVENTORY_WAREHOUSE_INACTIVE"
  | "INVENTORY_CONFLICT"
  | "INVENTORY_LOCK_CONFLICT";

export interface InventoryError {
  code: InventoryErrorCode;
  message: string;
  detail?: string;
}

export interface DirectEditInput {
  variantId: string;
  onHand?: number;
  incoming?: number;
  safetyStock?: number;
  reorderPoint?: number;
}

export interface InventoryModeInput {
  rule?: InventoryRule;
  edits?: DirectEditInput[];
}

export interface InventoryScopeInput {
  warehouseId?: string;
  selectedVariantIds?: string[];
}

export interface InventoryMatrixInput {
  storeId: string;
  productId: string;
  warehouseId?: string;
  selectedVariantIds?: string[];
}

export interface InventoryPreviewInput extends InventoryModeInput, InventoryScopeInput {
  storeId: string;
  productId: string;
}

export interface InventoryApplyInput extends InventoryPreviewInput {
  actorUserId: string | null;
  reason?: string;
  /** Preview'in ürettiği fingerprint; apply bunu sunucu-güncel değerle karşılaştırır (stale-guard). */
  baseFingerprint: string;
}

export interface InventoryWarehouseView {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  isDefault: boolean;
  priority: number;
}

export interface InventoryPreviewResult extends PreviewOutput {
  source: "DIRECT_EDIT" | "BULK_RULE";
  warehouse: InventoryWarehouseView;
}

export interface InventoryApplyResult {
  batchId: string;
  updatedVariants: number;
  updatedFields: number;
  skippedVariants: number;
  auditCount: number;
  source: "DIRECT_EDIT" | "BULK_RULE";
  preview: InventoryPreviewResult;
}

export type PreviewResult =
  | { ok: true; result: InventoryPreviewResult }
  | { ok: false; error: InventoryError };
export type ApplyResult =
  | { ok: true; result: InventoryApplyResult }
  | { ok: false; error: InventoryError };
export type WarehouseListResult =
  | { ok: true; warehouses: InventoryWarehouseView[] }
  | { ok: false; error: InventoryError };

export interface InventoryService {
  listWarehouses(storeId: string): Promise<WarehouseListResult>;
  /** Matris okuma (kural/edit yok → current==target, changed=false). */
  matrix(input: InventoryMatrixInput): Promise<PreviewResult>;
  preview(input: InventoryPreviewInput): Promise<PreviewResult>;
  apply(input: InventoryApplyInput): Promise<ApplyResult>;
}

export interface InventoryServiceConfig {
  limits?: InventoryLimits;
}

function toWarehouseView(w: InventoryWarehouseRef): InventoryWarehouseView {
  return {
    id: w.id,
    code: w.code,
    name: w.name,
    status: w.status,
    isDefault: w.isDefault,
    priority: w.priority,
  };
}

function toVariantInput(row: InventoryVariantRow): InventoryVariantInput {
  return {
    variantId: row.variantId,
    sku: row.sku,
    title: row.title,
    status: row.status,
    attributes: row.attributes,
    current: row.current,
    balanceExists: row.balanceExists,
  };
}

function fieldValue(state: InventoryState, field: InventoryField): number {
  switch (field) {
    case "ON_HAND":
      return state.onHand;
    case "INCOMING":
      return state.incoming;
    case "SAFETY_STOCK":
      return state.safetyStock;
    case "REORDER_POINT":
      return state.reorderPoint;
  }
}

// Basit rule doğrulaması (SAF): amount integer + non-negative; targetField/operation enum route'ta parse edilir.
function validateRule(rule: InventoryRule): InventoryError | null {
  if (!Number.isInteger(rule.amount) || rule.amount < 0) {
    return { code: "INVENTORY_INVALID_RULE", message: "Rule amount must be a non-negative integer." };
  }
  if (!INVENTORY_FIELDS.includes(rule.targetField)) {
    return { code: "INVENTORY_INVALID_RULE", message: `Unknown target field: ${rule.targetField}` };
  }
  return null;
}

export function createInventoryService(
  dataAccess: InventoryDataAccess,
  config: InventoryServiceConfig = {},
): InventoryService {
  const limits = config.limits ?? DEFAULT_INVENTORY_LIMITS;

  // Depoyu çöz: warehouseId verilmişse doğrula; yoksa store default'u. Tenant guard: warehouse store'a ait olmalı.
  async function resolveWarehouse(
    storeId: string,
    warehouseId?: string,
  ): Promise<{ ok: true; warehouse: InventoryWarehouseRef } | { ok: false; error: InventoryError }> {
    if (warehouseId !== undefined) {
      const w = await dataAccess.findWarehouse(storeId, warehouseId);
      if (!w) {
        return { ok: false, error: { code: "WAREHOUSE_NOT_FOUND", message: "Warehouse not found.", detail: warehouseId } };
      }
      return { ok: true, warehouse: w };
    }
    const def = await dataAccess.findDefaultWarehouse(storeId);
    if (!def) {
      return { ok: false, error: { code: "WAREHOUSE_NOT_FOUND", message: "Store has no default warehouse." } };
    }
    return { ok: true, warehouse: def };
  }

  // Kapsam + mode çöz (SAF; DB'siz). Selection doğrula + rule derle / edit süz.
  function resolveScopeAndMode(
    rows: InventoryVariantRow[],
    input: InventoryModeInput & { selectedVariantIds?: string[] },
  ):
    | { ok: true; scope: InventoryVariantRow[]; mode: InventoryMode; source: "DIRECT_EDIT" | "BULK_RULE" }
    | { ok: false; error: InventoryError } {
    const byId = new Map(rows.map((r) => [r.variantId, r]));

    let scope: InventoryVariantRow[] = rows;
    if (input.selectedVariantIds !== undefined) {
      if (input.selectedVariantIds.length === 0) {
        return { ok: false, error: { code: "INVENTORY_SELECTION_EMPTY", message: "Selection is empty." } };
      }
      const selected: InventoryVariantRow[] = [];
      for (const id of input.selectedVariantIds) {
        const row = byId.get(id);
        if (!row) {
          return {
            ok: false,
            error: { code: "INVENTORY_VARIANT_NOT_FOUND", message: `Variant not in scope: ${id}`, detail: id },
          };
        }
        selected.push(row);
      }
      scope = selected;
    }

    if (input.rule) {
      const ruleError = validateRule(input.rule);
      if (ruleError) return { ok: false, error: ruleError };
      return { ok: true, scope, mode: { kind: "rule", rule: input.rule }, source: "BULK_RULE" };
    }

    const edits = input.edits ?? [];
    for (const e of edits) {
      if (!byId.has(e.variantId)) {
        return {
          ok: false,
          error: { code: "INVENTORY_VARIANT_NOT_FOUND", message: `Edit targets unknown variant: ${e.variantId}`, detail: e.variantId },
        };
      }
    }
    return { ok: true, scope, mode: { kind: "direct", edits }, source: "DIRECT_EDIT" };
  }

  async function computePreview(
    ctx: Pick<InventoryTxContext, "listVariants">,
    storeId: string,
    productId: string,
    warehouse: InventoryWarehouseRef,
    input: InventoryModeInput & { selectedVariantIds?: string[] },
  ): Promise<PreviewResult> {
    const rows = await ctx.listVariants(storeId, productId, warehouse);
    const resolved = resolveScopeAndMode(rows, input);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const output = buildInventoryPreview({
      warehouseId: warehouse.id,
      variants: resolved.scope.map(toVariantInput),
      mode: resolved.mode,
      limits,
    });
    return {
      ok: true,
      result: { ...output, source: resolved.source, warehouse: toWarehouseView(warehouse) },
    };
  }

  return {
    listWarehouses: async (storeId) => {
      const warehouses = await dataAccess.listWarehouses(storeId);
      return { ok: true, warehouses: warehouses.map(toWarehouseView) };
    },

    matrix: async ({ storeId, productId, warehouseId, selectedVariantIds }) => {
      const product = await dataAccess.findProduct(storeId, productId);
      if (!product) return { ok: false, error: { code: "PRODUCT_NOT_FOUND", message: "Product not found." } };
      const wh = await resolveWarehouse(storeId, warehouseId);
      if (!wh.ok) return { ok: false, error: wh.error };
      return dataAccess.read((ctx) => computePreview(ctx, storeId, productId, wh.warehouse, { selectedVariantIds }));
    },

    preview: async ({ storeId, productId, warehouseId, ...rest }) => {
      const product = await dataAccess.findProduct(storeId, productId);
      if (!product) return { ok: false, error: { code: "PRODUCT_NOT_FOUND", message: "Product not found." } };
      const wh = await resolveWarehouse(storeId, warehouseId);
      if (!wh.ok) return { ok: false, error: wh.error };
      return dataAccess.read((ctx) => computePreview(ctx, storeId, productId, wh.warehouse, rest));
    },

    apply: async ({ storeId, productId, warehouseId, actorUserId, reason, baseFingerprint, ...rest }) => {
      const product = await dataAccess.findProduct(storeId, productId);
      if (!product) return { ok: false, error: { code: "PRODUCT_NOT_FOUND", message: "Product not found." } };
      const whResolved = await resolveWarehouse(storeId, warehouseId);
      if (!whResolved.ok) return { ok: false, error: whResolved.error };
      const warehouse = whResolved.warehouse;

      // INACTIVE depo yeni stok işlemine kapalı (fail-closed; hiçbir yazım).
      if (warehouse.status !== "ACTIVE") {
        return {
          ok: false,
          error: { code: "INVENTORY_WAREHOUSE_INACTIVE", message: "Warehouse is inactive; stock operations are closed." },
        };
      }

      try {
        return await dataAccess.transaction(async (ctx): Promise<ApplyResult> => {
          await ctx.lockProductWarehouse(product.id, warehouse.id);

          const rows = await ctx.listVariants(storeId, product.id, warehouse);
          const resolved = resolveScopeAndMode(rows, rest);
          if (!resolved.ok) return { ok: false, error: resolved.error };

          const preview = buildInventoryPreview({
            warehouseId: warehouse.id,
            variants: resolved.scope.map(toVariantInput),
            mode: resolved.mode,
            limits,
          });

          // Stale-preview guard: sunucu-güncel fingerprint istemcininkiyle uyuşmalı.
          if (preview.fingerprint !== baseFingerprint) {
            return {
              ok: false,
              error: {
                code: "INVENTORY_PREVIEW_STALE",
                message: "Stock values changed since preview. Re-preview and retry.",
              },
            };
          }

          if (preview.blocked) {
            return {
              ok: false,
              error: {
                code: "INVENTORY_APPLY_BLOCKED",
                message: "Apply is blocked by validation errors. Resolve them and retry.",
              },
            };
          }

          // Yalnız değişen satırları yazıma + audit'e çevir.
          const writes: InventoryVariantWrite[] = [];
          const audits: InventoryAuditRow[] = [];
          let updatedFields = 0;
          for (const row of preview.rows) {
            if (!row.changed) continue;
            writes.push({ variantId: row.variantId, target: row.target, changedFields: row.changedFields });
            for (const field of row.changedFields) {
              const oldValue = fieldValue(row.current, field);
              const newValue = fieldValue(row.target, field);
              audits.push({ variantId: row.variantId, field, oldValue, newValue, delta: newValue - oldValue });
              updatedFields++;
            }
          }

          const batchId = randomUUID();
          const source = resolved.source;
          if (writes.length > 0) {
            await ctx.applyWrites(
              storeId,
              product.id,
              warehouse,
              batchId,
              writes,
              audits,
              source === "BULK_RULE" ? "BULK_OPERATION" : "MANUAL_EDIT",
              reason,
              actorUserId,
            );
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
              preview: { ...preview, source, warehouse: toWarehouseView(warehouse) },
            },
          };
        });
      } catch (error) {
        if (isUniqueConflict(error)) {
          return {
            ok: false,
            error: { code: "INVENTORY_CONFLICT", message: "A concurrent change caused a conflict. Re-preview and retry." },
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

export function inventoryErrorStatus(code: InventoryErrorCode): number {
  switch (code) {
    case "PRODUCT_NOT_FOUND":
    case "WAREHOUSE_NOT_FOUND":
    case "INVENTORY_VARIANT_NOT_FOUND":
      return 404;
    case "INVENTORY_PREVIEW_STALE":
    case "INVENTORY_CONFLICT":
    case "INVENTORY_LOCK_CONFLICT":
    case "INVENTORY_WAREHOUSE_INACTIVE":
      return 409;
    case "INVENTORY_INVALID_RULE":
    case "INVENTORY_SELECTION_EMPTY":
    case "INVENTORY_APPLY_BLOCKED":
      return 422;
    default:
      return 422;
  }
}
