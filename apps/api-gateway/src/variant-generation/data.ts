/**
 * Faz 2C-3 (ADR-072) — Varyant üretimi (persistence) veri erişimi.
 *
 * Diff motoru SAFTIR (diff-engine.ts) ve Combination Engine SAFTIR (variant-combinations/engine.ts);
 * bu modül tüm IO'yu tek TRANSACTION içinde yürütür. Concurrency güvenliği iki katmanlıdır:
 *  1) transaction başında PostgreSQL advisory xact lock (ürün bazlı serileştirme),
 *  2) DB unique `(productId, combinationKey)` (duplicate insert P2002 ile reddedilir).
 *
 * Manuel/legacy varyantlara DOKUNULMAZ (yalnız ATTRIBUTE_COMBINATION create/restore/archive edilir).
 * Restore YALNIZ status+archivedAt günceller (SKU/price/inventory korunur). Bu faz InventoryItem
 * OLUŞTURMAZ (görev kuralı) ve optionValues JSON'a YAZMAZ (normalize ProductVariantOptionValue authoritative).
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";

type PrismaLike = Prisma.TransactionClient;

// Yeni üretilen varyantın KDV başlangıcı (server.ts DEFAULT_VAT_RATE_BPS ile aynı anlam; %20).
const DEFAULT_VAT_RATE_BPS = 2000;

export interface GenerationProductRef {
  id: string;
  primaryCategoryId: string | null;
}

/** Ürünün kalıcı eksen reçetesi (position ASC; her eksende optionIds position ASC). */
export interface GenerationRecipeAxis {
  attributeDefinitionId: string;
  position: number;
  optionIds: string[];
}

/** Seçili option'ın güncel metadata'sı (label + arşiv durumu). */
export interface GenerationOptionMeta {
  id: string;
  label: string;
  status: "ACTIVE" | "ARCHIVED";
}

/** Diff + response için gereken mevcut varyant projeksiyonu. */
export interface GenerationExistingVariant {
  id: string;
  combinationKey: string | null;
  generationSource: "MANUAL" | "ATTRIBUTE_COMBINATION";
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  title: string;
  sku: string;
  currency: string;
}

/** Yeni üretilecek varyantın çözülmüş verisi (service hesaplar; deterministik). */
export interface NewGeneratedVariantInput {
  combinationKey: string;
  title: string;
  sku: string;
  currency: string;
  /** Kanonik sırada eksen→option çiftleri (ProductVariantOptionValue kayıtları). */
  optionValues: Array<{ attributeDefinitionId: string; optionId: string }>;
}

/** create/restore sonucu response özeti için minimum kayıt. */
export interface AppliedVariant {
  id: string;
  combinationKey: string | null;
  title: string;
  sku: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
}

/** Transaction (+advisory lock) içinde çağrılan işlemler. */
export interface GenerationTxContext {
  /** Ürün bazlı advisory xact lock — aynı ürün için generation'ları serileştirir. */
  lockProduct(productId: string): Promise<void>;
  listRecipe(storeId: string, productId: string): Promise<GenerationRecipeAxis[]>;
  findOptionMeta(optionIds: string[]): Promise<GenerationOptionMeta[]>;
  listExistingVariants(storeId: string, productId: string): Promise<GenerationExistingVariant[]>;
  createVariant(
    storeId: string,
    productId: string,
    input: NewGeneratedVariantInput,
  ): Promise<AppliedVariant>;
  /** Arşivli generated varyantı geri yükler (status=DRAFT, archivedAt=null). SKU/price DOKUNULMAZ. */
  restoreVariant(storeId: string, productId: string, variantId: string): Promise<AppliedVariant>;
  /** Generated varyantı arşivler (status=ARCHIVED, archivedAt=now). Hard-delete YOK. */
  archiveVariant(storeId: string, productId: string, variantId: string): Promise<void>;
}

export interface VariantGenerationDataAccess {
  findProductForStore(storeId: string, productId: string): Promise<GenerationProductRef | null>;
  /** Tüm üretim adımlarını TEK transaction içinde çalıştırır (advisory lock ctx.lockProduct ile). */
  transaction<T>(fn: (ctx: GenerationTxContext) => Promise<T>): Promise<T>;
}

// ─────────────────────────── tx context (Prisma-backed) ───────────────────────────

function makeTxContext(tx: PrismaLike): GenerationTxContext {
  const readRecipe = async (storeId: string, productId: string): Promise<GenerationRecipeAxis[]> => {
    const rows = await tx.productVariantAttribute.findMany({
      where: { storeId, productId },
      orderBy: { position: "asc" },
      select: {
        attributeDefinitionId: true,
        position: true,
        options: { select: { optionId: true }, orderBy: { position: "asc" } },
      },
    });
    return rows.map((row) => ({
      attributeDefinitionId: row.attributeDefinitionId,
      position: row.position,
      optionIds: row.options.map((o) => o.optionId),
    }));
  };

  return {
    lockProduct: async (productId) => {
      // hashtext(text) → int4; pg_advisory_xact_lock(bigint) implicit cast. Lock tx sonunda otomatik bırakılır.
      // `$executeRaw` kullanılır ($queryRaw DEĞİL): pg_advisory_xact_lock `void` döner ve Prisma $queryRaw
      // void kolonu deserialize edemez → $executeRaw sonucu deserialize etmez (etkilenen satır sayısı döner).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
    },
    listRecipe: readRecipe,
    findOptionMeta: (optionIds) =>
      optionIds.length === 0
        ? Promise.resolve([])
        : tx.attributeOption.findMany({
            where: { id: { in: optionIds } },
            select: { id: true, label: true, status: true },
          }),
    listExistingVariants: (storeId, productId) =>
      tx.productVariant.findMany({
        where: { storeId, productId },
        select: {
          id: true,
          combinationKey: true,
          generationSource: true,
          status: true,
          title: true,
          sku: true,
          currency: true,
        },
      }),
    createVariant: (storeId, productId, input) =>
      tx.productVariant.create({
        data: {
          storeId,
          productId,
          title: input.title,
          sku: input.sku,
          priceMinor: 0,
          netPriceMinor: 0,
          vatRateBps: DEFAULT_VAT_RATE_BPS,
          vatAmountMinor: 0,
          currency: input.currency,
          status: "DRAFT",
          generationSource: "ATTRIBUTE_COMBINATION",
          combinationKey: input.combinationKey,
          // optionValues JSON'a YAZILMAZ (normalize kayıt authoritative).
          optionValueSelections: {
            create: input.optionValues.map((ov) => ({
              storeId,
              attributeDefinitionId: ov.attributeDefinitionId,
              optionId: ov.optionId,
            })),
          },
        },
        select: { id: true, combinationKey: true, title: true, sku: true, status: true },
      }),
    restoreVariant: (storeId, productId, variantId) =>
      tx.productVariant.update({
        where: { id: variantId, storeId, productId },
        data: { status: "DRAFT", archivedAt: null },
        select: { id: true, combinationKey: true, title: true, sku: true, status: true },
      }),
    archiveVariant: async (storeId, productId, variantId) => {
      await tx.productVariant.update({
        where: { id: variantId, storeId, productId },
        data: { status: "ARCHIVED", archivedAt: new Date() },
        select: { id: true },
      });
    },
  };
}

export function createPrismaVariantGenerationDataAccess(): VariantGenerationDataAccess {
  return {
    findProductForStore: (storeId, productId) =>
      prisma.product.findFirst({
        where: { id: productId, storeId },
        select: { id: true, primaryCategoryId: true },
      }),
    transaction: (fn) => prisma.$transaction((tx) => fn(makeTxContext(tx))),
  };
}
