/**
 * TODO-160A (ADR-109…113) — SKU Generation & Governance · VERİ ERİŞİMİ (Prisma).
 *
 * Tüm IO burada; SAF üretim/collision `@commerce-os/utils` + service.ts'tedir. Option kodları eksen
 * sırasında (ProductVariantAttribute.position) çözülür; hem üretilmiş (ProductVariantOptionValue) hem
 * manuel (VariantAttributeValue) eksen değerleri desteklenir (üretilmiş öncelikli). regenerate TEK
 * transaction + advisory-lock içinde yalnız-değişen SKU'ları yazar (skuSource=AUTO) ve generic AuditLog
 * ekler (append-only gözlemlenebilirlik). OrderLine snapshot'larına ASLA dokunulmaz.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type { SkuSource } from "@commerce-os/contracts";

type PrismaLike = Prisma.TransactionClient;

export interface SkuProductRef {
  id: string;
  slug: string;
  title: string;
}

export interface SkuVariantRow {
  variantId: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  currentSku: string;
  barcode: string | null;
  skuSource: SkuSource;
  /** Eksen sırasında çözülmüş option kodları (AttributeOption.value). Manuel/eksensiz varyantta []. */
  optionCodes: string[];
}

export interface SkuAuditVariantRow extends SkuVariantRow {
  productId: string;
  productSlug: string;
}

import type { StoreAuditActor } from "../store-auth/guard.js";

export interface SkuWriteInput {
  variantId: string;
  newSku: string;
  oldSku: string;
  actorUserId: string | null;
  audit: StoreAuditActor;
  batchId: string;
}

export interface SkuTxContext {
  lockProduct(productId: string): Promise<void>;
  newBatchId(): string;
  listVariantsForSku(storeId: string, productId: string): Promise<SkuVariantRow[]>;
  listStoreSkuValues(storeId: string): Promise<string[]>;
  writeVariantSku(storeId: string, productId: string, input: SkuWriteInput): Promise<void>;
}

export interface SkuDataAccess {
  findProduct(storeId: string, productId: string): Promise<SkuProductRef | null>;
  listVariantsForSku(storeId: string, productId: string): Promise<SkuVariantRow[]>;
  listStoreSkuValues(storeId: string): Promise<string[]>;
  findVariantIdBySku(storeId: string, sku: string): Promise<string | null>;
  listVariantsForAudit(storeId: string): Promise<SkuAuditVariantRow[]>;
  /** Yeni (henüz kaydedilmemiş) bir varyant için option kodlarını eksen sırasında çözer. */
  resolveOptionCodes(storeId: string, productId: string, optionIds: string[]): Promise<string[]>;
  transaction<T>(fn: (ctx: SkuTxContext) => Promise<T>): Promise<T>;
}

// ─────────────────────────── option kodu çözümü (SAF, IO dışı) ───────────────────────────

interface RawSelection {
  attributeDefinitionId: string;
  value: string | null;
}

/** Eksen sırasına (axisPos) göre option kodlarını sıralar; kod boşsa atar. Deterministik. */
function orderOptionCodes(selections: RawSelection[], axisPos: Map<string, number>): string[] {
  return selections
    .filter((s) => s.value !== null && s.value.length > 0)
    .slice()
    .sort((a, b) => {
      const pa = axisPos.get(a.attributeDefinitionId) ?? Number.MAX_SAFE_INTEGER;
      const pb = axisPos.get(b.attributeDefinitionId) ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return a.attributeDefinitionId < b.attributeDefinitionId ? -1 : a.attributeDefinitionId > b.attributeDefinitionId ? 1 : 0;
    })
    .map((s) => s.value as string);
}

const variantForSkuSelect = {
  id: true,
  status: true,
  sku: true,
  barcode: true,
  skuSource: true,
  optionValueSelections: {
    select: { attributeDefinitionId: true, option: { select: { value: true } } },
  },
  attributeValues: {
    select: { attributeDefinitionId: true, optionId: true, option: { select: { value: true } } },
  },
} satisfies Prisma.ProductVariantSelect;

type VariantForSkuRow = Prisma.ProductVariantGetPayload<{ select: typeof variantForSkuSelect }>;

// Bir varyantın eksen değerlerini birleştirir: üretilmiş (optionValueSelections) öncelikli, eksik
// eksenler manuel (attributeValues, yalnız optionId'li) ile tamamlanır.
function mergeSelections(row: VariantForSkuRow): RawSelection[] {
  const byDef = new Map<string, string | null>();
  for (const s of row.optionValueSelections) {
    byDef.set(s.attributeDefinitionId, s.option?.value ?? null);
  }
  for (const a of row.attributeValues) {
    if (a.optionId && !byDef.has(a.attributeDefinitionId)) {
      byDef.set(a.attributeDefinitionId, a.option?.value ?? null);
    }
  }
  return [...byDef.entries()].map(([attributeDefinitionId, value]) => ({ attributeDefinitionId, value }));
}

async function loadAxisPositions(
  tx: PrismaLike,
  storeId: string,
  productId: string,
): Promise<Map<string, number>> {
  const axes = await tx.productVariantAttribute.findMany({
    where: { storeId, productId },
    select: { attributeDefinitionId: true, position: true },
  });
  return new Map(axes.map((a) => [a.attributeDefinitionId, a.position]));
}

async function readVariantsForSku(
  tx: PrismaLike,
  storeId: string,
  productId: string,
): Promise<SkuVariantRow[]> {
  const [axisPos, rows] = await Promise.all([
    loadAxisPositions(tx, storeId, productId),
    tx.productVariant.findMany({
      where: { storeId, productId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: variantForSkuSelect,
    }),
  ]);
  return rows.map((row) => ({
    variantId: row.id,
    status: row.status,
    currentSku: row.sku,
    barcode: row.barcode,
    skuSource: row.skuSource,
    optionCodes: orderOptionCodes(mergeSelections(row), axisPos),
  }));
}

async function readStoreSkuValues(tx: PrismaLike, storeId: string): Promise<string[]> {
  const rows = await tx.productVariant.findMany({ where: { storeId }, select: { sku: true } });
  return rows.map((r) => r.sku);
}

async function writeSku(
  tx: PrismaLike,
  storeId: string,
  productId: string,
  input: SkuWriteInput,
): Promise<void> {
  await tx.productVariant.update({
    where: { id: input.variantId, storeId, productId },
    data: { sku: input.newSku, skuSource: "AUTO" },
    select: { id: true },
  });
  // Generic AuditLog (append-only gözlemlenebilirlik) — field-level eski/yeni + batch.
  await tx.auditLog.create({
    data: {
      action: "UPDATE",
      storeId,
      ...input.audit,
      entityType: "ProductVariant",
      entityId: input.variantId,
      metadata: {
        field: "sku",
        oldValue: input.oldSku,
        newValue: input.newSku,
        source: "AUTO",
        reason: "sku-regenerate",
        batchId: input.batchId,
      } satisfies Prisma.InputJsonObject,
    },
  });
}

function makeTxContext(tx: PrismaLike): SkuTxContext {
  return {
    lockProduct: async (productId) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
    },
    newBatchId: () => randomUUID(),
    listVariantsForSku: (storeId, productId) => readVariantsForSku(tx, storeId, productId),
    listStoreSkuValues: (storeId) => readStoreSkuValues(tx, storeId),
    writeVariantSku: (storeId, productId, input) => writeSku(tx, storeId, productId, input),
  };
}

export function createPrismaSkuDataAccess(): SkuDataAccess {
  return {
    findProduct: (storeId, productId) =>
      prisma.product.findFirst({
        where: { id: productId, storeId },
        select: { id: true, slug: true, title: true },
      }),
    listVariantsForSku: (storeId, productId) => readVariantsForSku(prisma, storeId, productId),
    listStoreSkuValues: (storeId) => readStoreSkuValues(prisma, storeId),
    findVariantIdBySku: async (storeId, sku) => {
      const row = await prisma.productVariant.findUnique({
        where: { storeId_sku: { storeId, sku } },
        select: { id: true },
      });
      return row?.id ?? null;
    },
    listVariantsForAudit: async (storeId) => {
      const axesByProduct = new Map<string, Map<string, number>>();
      const axes = await prisma.productVariantAttribute.findMany({
        where: { storeId },
        select: { productId: true, attributeDefinitionId: true, position: true },
      });
      for (const a of axes) {
        let m = axesByProduct.get(a.productId);
        if (!m) {
          m = new Map();
          axesByProduct.set(a.productId, m);
        }
        m.set(a.attributeDefinitionId, a.position);
      }
      const rows = await prisma.productVariant.findMany({
        where: { storeId },
        orderBy: [{ productId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { ...variantForSkuSelect, productId: true, product: { select: { slug: true } } },
      });
      return rows.map((row) => ({
        variantId: row.id,
        productId: row.productId,
        productSlug: row.product.slug,
        status: row.status,
        currentSku: row.sku,
        barcode: row.barcode,
        skuSource: row.skuSource,
        optionCodes: orderOptionCodes(
          mergeSelections(row),
          axesByProduct.get(row.productId) ?? new Map(),
        ),
      }));
    },
    resolveOptionCodes: async (storeId, productId, optionIds) => {
      if (optionIds.length === 0) return [];
      const [axisPos, options] = await Promise.all([
        loadAxisPositions(prisma, storeId, productId),
        prisma.attributeOption.findMany({
          where: { id: { in: optionIds } },
          select: { id: true, value: true, attributeDefinitionId: true },
        }),
      ]);
      const selections: RawSelection[] = options.map((o) => ({
        attributeDefinitionId: o.attributeDefinitionId,
        value: o.value,
      }));
      return orderOptionCodes(selections, axisPos);
    },
    transaction: (fn) => prisma.$transaction((tx) => fn(makeTxContext(tx))),
  };
}
