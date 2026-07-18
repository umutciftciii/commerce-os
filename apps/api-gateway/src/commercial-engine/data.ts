/**
 * TODO-151 (ADR-074) — Commercial Engine · VERİ ERİŞİMİ (DB-aware).
 *
 * Motor SAFtir (money/calculator/rule/evaluator/validation/diff/preview); bu modül tüm IO'yu yürütür.
 * Preview salt-okumadır; apply TEK TRANSACTION içinde advisory-lock + stale-preview kontrolü +
 * yalnız-değişen yazım + append-only audit uygular. Okuma BATCH'lidir (N+1 YOK): varyantlar +
 * normalize option değerleri tek sorguda. Yazımda net/KDV üçlüsü (F4C) diff'e göre yeniden türetilir.
 */

import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type { CommercialField, CommercialState, VariantStatus } from "./types.js";

type PrismaLike = Prisma.TransactionClient;

/** Ürün referansı (yetki + audit için). */
export interface CommercialProductRef {
  id: string;
}

/** Ticari yönetime giren tek varyant (kanonik sırada) + görünür eksen etiketleri. */
export interface CommercialVariantRow {
  variantId: string;
  sku: string;
  title: string;
  status: VariantStatus;
  currency: string;
  attributes: { code: string; label: string }[];
  current: CommercialState;
}

/** Tek varyanta yazılacak ticari değişiklik (yalnız değişen alanlar dolu; net/KDV serviste türetilir). */
export interface CommercialVariantWrite {
  variantId: string;
  priceMinor?: number;
  compareAtMinor?: number | null;
  costMinor?: number | null;
  vatRateBps?: number;
  /** PRICE veya VAT_RATE değiştiyse serviste türetilen net/KDV (üçlü tutarlılık). */
  netPriceMinor?: number;
  vatAmountMinor?: number;
}

/** Audit satırı (append-only; batchId gruplu). oldValue/newValue money alanlarında minor, VAT'ta bps. */
export interface CommercialAuditRow {
  variantId: string;
  field: CommercialField;
  oldValue: number | null;
  newValue: number | null;
  currency: string;
}

export interface CommercialTxContext {
  lockProduct(productId: string): Promise<void>;
  listVariants(storeId: string, productId: string): Promise<CommercialVariantRow[]>;
  applyWrites(
    storeId: string,
    productId: string,
    batchId: string,
    writes: CommercialVariantWrite[],
    audits: CommercialAuditRow[],
    source: "DIRECT_EDIT" | "BULK_RULE",
    ruleSnapshot: Prisma.InputJsonValue | undefined,
    changedByPlatformUserId: string | null,
  ): Promise<void>;
}

export interface CommercialDataAccess {
  findProduct(storeId: string, productId: string): Promise<CommercialProductRef | null>;
  /** Preview: salt-okuma bağlamı (tek çağrı; tutarlı okuma). */
  read<T>(fn: (ctx: Pick<CommercialTxContext, "listVariants">) => Promise<T>): Promise<T>;
  /** Apply: advisory-lock + yalnız-değişen yazım + audit'in TEK transaction'ı. */
  transaction<T>(fn: (ctx: CommercialTxContext) => Promise<T>): Promise<T>;
}

// Kanonik sıra: combinationKey ASC (NULLS LAST → manuel sonda) → createdAt ASC → id ASC.
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

async function readVariants(
  tx: PrismaLike,
  storeId: string,
  productId: string,
): Promise<CommercialVariantRow[]> {
  const rows = await tx.productVariant.findMany({
    where: scopeWhere(storeId, productId),
    orderBy: variantOrderBy,
    select: {
      id: true,
      sku: true,
      title: true,
      status: true,
      currency: true,
      priceMinor: true,
      compareAtMinor: true,
      costMinor: true,
      vatRateBps: true,
      optionValueSelections: {
        select: {
          definition: { select: { code: true } },
          option: { select: { label: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    variantId: r.id,
    sku: r.sku,
    title: r.title,
    status: r.status as VariantStatus,
    currency: r.currency,
    attributes: r.optionValueSelections.map((ov) => ({
      code: ov.definition.code,
      label: ov.option.label,
    })),
    current: {
      priceMinor: r.priceMinor,
      compareAtMinor: r.compareAtMinor,
      costMinor: r.costMinor,
      vatRateBps: r.vatRateBps,
    },
  }));
}

function makeTxContext(tx: PrismaLike): CommercialTxContext {
  return {
    lockProduct: async (productId) => {
      // 2C-3/2C-4 dersi: pg_advisory_xact_lock `void` döner → $executeRaw ŞART ($queryRaw 500 verir).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
    },
    listVariants: (storeId, productId) => readVariants(tx, storeId, productId),
    applyWrites: async (storeId, productId, batchId, writes, audits, source, ruleSnapshot, actorId) => {
      for (const w of writes) {
        const data: Prisma.ProductVariantUpdateInput = {};
        if (w.priceMinor !== undefined) data.priceMinor = w.priceMinor;
        if (w.compareAtMinor !== undefined) data.compareAtMinor = w.compareAtMinor;
        if (w.costMinor !== undefined) data.costMinor = w.costMinor;
        if (w.vatRateBps !== undefined) data.vatRateBps = w.vatRateBps;
        if (w.netPriceMinor !== undefined) data.netPriceMinor = w.netPriceMinor;
        if (w.vatAmountMinor !== undefined) data.vatAmountMinor = w.vatAmountMinor;
        await tx.productVariant.update({
          where: { id: w.variantId, storeId, productId },
          data,
          select: { id: true },
        });
      }
      if (audits.length > 0) {
        await tx.variantCommercialChange.createMany({
          data: audits.map((a) => ({
            storeId,
            productId,
            variantId: a.variantId,
            batchId,
            field: a.field,
            oldValue: a.oldValue,
            newValue: a.newValue,
            currency: a.currency,
            source,
            ruleSnapshot,
            changedByPlatformUserId: actorId,
          })),
        });
      }
    },
  };
}

export function createPrismaCommercialDataAccess(): CommercialDataAccess {
  return {
    findProduct: async (storeId, productId) => {
      const product = await prisma.product.findFirst({
        where: { id: productId, storeId },
        select: { id: true },
      });
      return product ? { id: product.id } : null;
    },
    read: (fn) => prisma.$transaction((tx) => fn(makeTxContext(tx))),
    transaction: (fn) => prisma.$transaction((tx) => fn(makeTxContext(tx))),
  };
}
