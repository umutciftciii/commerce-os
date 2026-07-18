/**
 * TODO-152 (ADR-076) — Inventory Engine · VERİ ERİŞİMİ (DB-aware).
 *
 * Motor SAFtir (availability/calculator/validation/diff/fingerprint/preview); bu modül tüm IO'yu
 * yürütür. Preview salt-okumadır; apply TEK TRANSACTION içinde advisory-lock + stale-preview kontrolü
 * + yalnız-değişen yazım + append-only audit uygular. Okuma BATCH'lidir (N+1 YOK).
 *
 * InventoryItem KÖPRÜSÜ (ADR-076): DEFAULT depo için onHand/reserved'ın CANLI otoritesi InventoryItem'dır
 * (checkout/storefront/sipariş akışı orayı okur/yazar — sıfır regresyon). Bu katman default depo bakiyesini
 * okurken onHand/reserved'ı InventoryItem'dan OVERLAY eder (legacy adjust ile yazılsa bile stale okuma yok);
 * yazarken onHand değişimini InventoryItem.quantityOnHand'e aynı transaction'da SENKRON eder (compatibility
 * sync). `reserved` ASLA yazılmaz (sistem-kontrollü). Non-default depoda otorite tamamen InventoryBalance'tır.
 */

import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type { InventoryField, InventoryState, VariantStatus } from "./types.js";

type PrismaLike = Prisma.TransactionClient;

export interface InventoryProductRef {
  id: string;
}

export interface InventoryWarehouseRef {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  isDefault: boolean;
  priority: number;
}

/** Stok yönetimine giren tek varyant (kanonik sırada) + görünür eksen etiketleri + güncel bakiye. */
export interface InventoryVariantRow {
  variantId: string;
  sku: string;
  title: string;
  status: VariantStatus;
  attributes: { code: string; label: string }[];
  current: InventoryState;
  /** Seçili depoda bu varyantın InventoryBalance kaydı var mı (false → sanal 0 satır). */
  balanceExists: boolean;
}

/** Tek varyanta yazılacak hedef bakiye (yalnız değişen satırlar). reserved YAZILMAZ (mirror = current). */
export interface InventoryVariantWrite {
  variantId: string;
  target: InventoryState;
  changedFields: InventoryField[];
}

/** Audit satırı (append-only; batchId gruplu). */
export interface InventoryAuditRow {
  variantId: string;
  field: InventoryField;
  oldValue: number;
  newValue: number;
  delta: number;
}

export type InventoryAuditSource = "MANUAL_EDIT" | "BULK_OPERATION";

export interface InventoryTxContext {
  lockProductWarehouse(productId: string, warehouseId: string): Promise<void>;
  listVariants(
    storeId: string,
    productId: string,
    warehouse: InventoryWarehouseRef,
  ): Promise<InventoryVariantRow[]>;
  applyWrites(
    storeId: string,
    productId: string,
    warehouse: InventoryWarehouseRef,
    batchId: string,
    writes: InventoryVariantWrite[],
    audits: InventoryAuditRow[],
    source: InventoryAuditSource,
    reason: string | undefined,
    changedByPlatformUserId: string | null,
  ): Promise<void>;
}

export interface InventoryDataAccess {
  findProduct(storeId: string, productId: string): Promise<InventoryProductRef | null>;
  listWarehouses(storeId: string): Promise<InventoryWarehouseRef[]>;
  findWarehouse(storeId: string, warehouseId: string): Promise<InventoryWarehouseRef | null>;
  findDefaultWarehouse(storeId: string): Promise<InventoryWarehouseRef | null>;
  read<T>(fn: (ctx: Pick<InventoryTxContext, "listVariants">) => Promise<T>): Promise<T>;
  transaction<T>(fn: (ctx: InventoryTxContext) => Promise<T>): Promise<T>;
}

// Kanonik sıra: combinationKey ASC (NULLS LAST → manuel sonda) → createdAt ASC → id ASC (commercial ile aynı).
const variantOrderBy: Prisma.ProductVariantOrderByWithRelationInput[] = [
  { combinationKey: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
];

// Kapsam: non-archived (DRAFT+ACTIVE). ARCHIVED bulk apply'a girmez (varsayılan gizli).
const scopeWhere = (storeId: string, productId: string): Prisma.ProductVariantWhereInput => ({
  storeId,
  productId,
  status: { not: "ARCHIVED" },
});

function toWarehouseRef(w: {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  isDefault: boolean;
  priority: number;
}): InventoryWarehouseRef {
  return {
    id: w.id,
    code: w.code,
    name: w.name,
    status: w.status,
    isDefault: w.isDefault,
    priority: w.priority,
  };
}

async function readVariants(
  tx: PrismaLike,
  storeId: string,
  productId: string,
  warehouse: InventoryWarehouseRef,
): Promise<InventoryVariantRow[]> {
  const variants = await tx.productVariant.findMany({
    where: scopeWhere(storeId, productId),
    orderBy: variantOrderBy,
    select: {
      id: true,
      sku: true,
      title: true,
      status: true,
      optionValueSelections: {
        select: {
          definition: { select: { code: true } },
          option: { select: { label: true } },
        },
      },
    },
  });
  const variantIds = variants.map((v) => v.id);

  // Batch: seçili depodaki balance'lar (N+1 YOK).
  const balances = await tx.inventoryBalance.findMany({
    where: { warehouseId: warehouse.id, variantId: { in: variantIds } },
    select: {
      variantId: true,
      onHand: true,
      reserved: true,
      incoming: true,
      safetyStock: true,
      reorderPoint: true,
    },
  });
  const balanceByVariant = new Map(balances.map((b) => [b.variantId, b]));

  // DEFAULT depo → onHand/reserved CANLI InventoryItem'dan overlay (tek otorite).
  const itemByVariant = new Map<string, { quantityOnHand: number; quantityReserved: number }>();
  if (warehouse.isDefault) {
    const items = await tx.inventoryItem.findMany({
      where: { storeId, variantId: { in: variantIds } },
      select: { variantId: true, quantityOnHand: true, quantityReserved: true },
    });
    for (const it of items) {
      itemByVariant.set(it.variantId, {
        quantityOnHand: it.quantityOnHand,
        quantityReserved: it.quantityReserved,
      });
    }
  }

  return variants.map((v) => {
    const balance = balanceByVariant.get(v.id);
    const item = itemByVariant.get(v.id);
    const current: InventoryState = {
      // DEFAULT depoda onHand/reserved InventoryItem otoritedir; yoksa balance; o da yoksa 0.
      onHand: item ? item.quantityOnHand : (balance?.onHand ?? 0),
      reserved: item ? item.quantityReserved : (balance?.reserved ?? 0),
      incoming: balance?.incoming ?? 0,
      safetyStock: balance?.safetyStock ?? 0,
      reorderPoint: balance?.reorderPoint ?? 0,
    };
    return {
      variantId: v.id,
      sku: v.sku,
      title: v.title,
      status: v.status as VariantStatus,
      attributes: v.optionValueSelections.map((ov) => ({
        code: ov.definition.code,
        label: ov.option.label,
      })),
      current,
      balanceExists: balance !== undefined,
    };
  });
}

function makeTxContext(tx: PrismaLike): InventoryTxContext {
  return {
    lockProductWarehouse: async (productId, warehouseId) => {
      // 2C-3 dersi: pg_advisory_xact_lock `void` döner → $executeRaw ŞART ($queryRaw 500 verir).
      // Aynı product+warehouse apply'ları serileşir (deterministik anahtar).
      const key = `inv:${productId}:${warehouseId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    },
    listVariants: (storeId, productId, warehouse) => readVariants(tx, storeId, productId, warehouse),
    applyWrites: async (storeId, productId, warehouse, batchId, writes, audits, source, reason, actorId) => {
      for (const w of writes) {
        // InventoryBalance upsert (varyant × depo tek satır). reserved = current mirror (target.reserved
        // = okunan canlı reserved; DEFAULT depoda InventoryItem'dan gelir, non-default'ta balance'tan).
        await tx.inventoryBalance.upsert({
          where: { warehouseId_variantId: { warehouseId: warehouse.id, variantId: w.variantId } },
          update: {
            onHand: w.target.onHand,
            reserved: w.target.reserved,
            incoming: w.target.incoming,
            safetyStock: w.target.safetyStock,
            reorderPoint: w.target.reorderPoint,
          },
          create: {
            storeId,
            warehouseId: warehouse.id,
            variantId: w.variantId,
            onHand: w.target.onHand,
            reserved: w.target.reserved,
            incoming: w.target.incoming,
            safetyStock: w.target.safetyStock,
            reorderPoint: w.target.reorderPoint,
          },
        });

        // DEFAULT depo + onHand değiştiyse InventoryItem.quantityOnHand'e SENKRON (compatibility sync).
        // checkout/storefront InventoryItem'ı okur → admin onHand düzenlemesi anında yansır. reserved'a
        // ASLA dokunulmaz (sipariş akışı sahibi). InventoryItem yoksa oluşturulur (quantityReserved korunur).
        const onHandAudit = audits.find((a) => a.variantId === w.variantId && a.field === "ON_HAND");
        if (warehouse.isDefault && onHandAudit) {
          await tx.inventoryItem.upsert({
            where: { variantId: w.variantId },
            update: { quantityOnHand: w.target.onHand },
            create: {
              storeId,
              variantId: w.variantId,
              quantityOnHand: w.target.onHand,
              quantityReserved: w.target.reserved,
            },
          });
          // Legacy hareket defteri ile tutarlılık: onHand delta'sını InventoryMovement'e de düş (ADJUSTMENT).
          await tx.inventoryMovement.create({
            data: {
              storeId,
              variantId: w.variantId,
              type: "ADJUSTMENT",
              quantityDelta: onHandAudit.delta,
              reason: reason ?? "Inventory Engine apply",
              referenceType: "InventoryAdjustment",
              referenceId: batchId,
              actorUserId: actorId,
            },
          });
        }
      }

      if (audits.length > 0) {
        await tx.inventoryAdjustment.createMany({
          data: audits.map((a) => ({
            storeId,
            warehouseId: warehouse.id,
            productId,
            variantId: a.variantId,
            field: a.field,
            oldValue: a.oldValue,
            newValue: a.newValue,
            delta: a.delta,
            reason: reason ?? null,
            source,
            batchId,
            changedByPlatformUserId: actorId,
          })),
        });
      }
    },
  };
}

export function createPrismaInventoryDataAccess(): InventoryDataAccess {
  return {
    findProduct: async (storeId, productId) => {
      const product = await prisma.product.findFirst({
        where: { id: productId, storeId },
        select: { id: true },
      });
      return product ? { id: product.id } : null;
    },
    listWarehouses: async (storeId) => {
      const rows = await prisma.warehouse.findMany({
        where: { storeId },
        orderBy: [{ isDefault: "desc" }, { priority: "asc" }, { createdAt: "asc" }],
        select: { id: true, code: true, name: true, status: true, isDefault: true, priority: true },
      });
      return rows.map(toWarehouseRef);
    },
    findWarehouse: async (storeId, warehouseId) => {
      const w = await prisma.warehouse.findFirst({
        where: { id: warehouseId, storeId },
        select: { id: true, code: true, name: true, status: true, isDefault: true, priority: true },
      });
      return w ? toWarehouseRef(w) : null;
    },
    findDefaultWarehouse: async (storeId) => {
      const w = await prisma.warehouse.findFirst({
        where: { storeId, isDefault: true },
        select: { id: true, code: true, name: true, status: true, isDefault: true, priority: true },
      });
      return w ? toWarehouseRef(w) : null;
    },
    read: (fn) => prisma.$transaction((tx) => fn(makeTxContext(tx))),
    transaction: (fn) => prisma.$transaction((tx) => fn(makeTxContext(tx))),
  };
}
