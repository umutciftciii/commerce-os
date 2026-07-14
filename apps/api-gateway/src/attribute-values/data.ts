/**
 * Faz 2A (ADR-068) — Urun/varyant attribute DEGER veri erisimi.
 *
 * Faz 1B katalog TANIMINI (AttributeDefinition + CategoryAttribute davranisi) tuketip
 * urun ve varyantlarin gercek attribute DEGERLERINI saklar. TUM yazimlar tek nokta olan
 * `attributeValueService` (service.ts) uzerinden gelir; bu modul yalniz IO'dur (dogrulama
 * YOK — o servistedir). attributes/ modul deseni: ayri prisma-backed data-access + DI →
 * dev in-memory AppDataAccess'e (health.test.ts) dokunmadan izole test edilir.
 *
 * Tip guvenli saklama: her dataType icin AYRI kolon (JSON yok). Bir satirda EN FAZLA bir
 * deger kolonu dolu (DB CHECK + servis). MULTI_SELECT degeri junction'da (deger kolonlari bos).
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type { AttributeDataType } from "@commerce-os/contracts";

// ─────────────────────────── Kayit tipleri ───────────────────────────
export interface ProductAttributeValueRecord {
  id: string;
  storeId: string;
  productId: string;
  attributeDefinitionId: string;
  dataType: AttributeDataType;
  valueText: string | null;
  valueInteger: number | null;
  valueDecimal: number | null;
  valueBoolean: boolean | null;
  valueDate: Date | null;
  optionId: string | null;
  mediaId: string | null;
  optionIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface VariantAttributeValueRecord {
  id: string;
  storeId: string;
  variantId: string;
  attributeDefinitionId: string;
  dataType: AttributeDataType;
  valueText: string | null;
  optionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────── Dogrulama icin sade projeksiyonlar ───────────────────
export interface AttributeDefinitionRef {
  id: string;
  scope: "PLATFORM" | "STORE";
  storeId: string | null;
  dataType: AttributeDataType;
  status: "ACTIVE" | "ARCHIVED";
}

export interface CategoryAttributeRef {
  attributeDefinitionId: string;
  required: boolean;
  variantDefining: boolean;
}

export interface AttributeOptionRef {
  id: string;
  attributeDefinitionId: string;
  storeId: string | null;
  status: "ACTIVE" | "ARCHIVED";
}

export interface ProductOwnershipRef {
  id: string;
  primaryCategoryId: string | null;
}

export interface VariantOwnershipRef {
  id: string;
  productId: string;
  primaryCategoryId: string | null;
}

// ─────────── Normalize edilmis (dogrulanmis) yazilacak girdi tipleri ───────────
export interface ProductAttributeValueEntry {
  attributeDefinitionId: string;
  valueText?: string | null;
  valueInteger?: number | null;
  valueDecimal?: number | null;
  valueBoolean?: boolean | null;
  valueDate?: Date | null;
  optionId?: string | null;
  mediaId?: string | null;
  optionIds?: string[];
}

export interface VariantAttributeValueEntry {
  attributeDefinitionId: string;
  valueText?: string | null;
  optionId?: string | null;
}

export interface AttributeValueDataAccess {
  // — dogrulama lookuplari (batch; N+1 yok) —
  findAttributeDefinitionsByIds(ids: string[]): Promise<AttributeDefinitionRef[]>;
  findAttributeOptionsByIds(ids: string[]): Promise<AttributeOptionRef[]>;
  findMediaAssetIdsForStore(storeId: string, ids: string[]): Promise<string[]>;
  listCategoryAttributeLinks(storeId: string, categoryId: string): Promise<CategoryAttributeRef[]>;
  findProductForStore(storeId: string, productId: string): Promise<ProductOwnershipRef | null>;
  findVariantForStore(storeId: string, variantId: string): Promise<VariantOwnershipRef | null>;

  // — okuma —
  listProductAttributeValues(storeId: string, productId: string): Promise<ProductAttributeValueRecord[]>;
  listVariantAttributeValues(storeId: string, variantId: string): Promise<VariantAttributeValueRecord[]>;

  // — yazma (replace-set, transactional) —
  replaceProductAttributeValues(
    storeId: string,
    productId: string,
    entries: ProductAttributeValueEntry[],
  ): Promise<ProductAttributeValueRecord[]>;
  replaceVariantAttributeValues(
    storeId: string,
    variantId: string,
    entries: VariantAttributeValueEntry[],
  ): Promise<VariantAttributeValueRecord[]>;
}

// ─────────────────────────── select'ler ───────────────────────────
const productValueSelect = {
  id: true,
  storeId: true,
  productId: true,
  attributeDefinitionId: true,
  valueText: true,
  valueInteger: true,
  valueDecimal: true,
  valueBoolean: true,
  valueDate: true,
  optionId: true,
  mediaId: true,
  createdAt: true,
  updatedAt: true,
  definition: { select: { dataType: true } },
  optionLinks: { select: { optionId: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.ProductAttributeValueSelect;

const variantValueSelect = {
  id: true,
  storeId: true,
  variantId: true,
  attributeDefinitionId: true,
  valueText: true,
  optionId: true,
  createdAt: true,
  updatedAt: true,
  definition: { select: { dataType: true } },
} satisfies Prisma.VariantAttributeValueSelect;

type ProductValueRow = Prisma.ProductAttributeValueGetPayload<{ select: typeof productValueSelect }>;
type VariantValueRow = Prisma.VariantAttributeValueGetPayload<{ select: typeof variantValueSelect }>;

function mapProductRow(row: ProductValueRow): ProductAttributeValueRecord {
  return {
    id: row.id,
    storeId: row.storeId,
    productId: row.productId,
    attributeDefinitionId: row.attributeDefinitionId,
    dataType: row.definition.dataType,
    valueText: row.valueText,
    valueInteger: row.valueInteger,
    valueDecimal: row.valueDecimal === null ? null : Number(row.valueDecimal),
    valueBoolean: row.valueBoolean,
    valueDate: row.valueDate,
    optionId: row.optionId,
    mediaId: row.mediaId,
    optionIds: row.optionLinks.map((link) => link.optionId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapVariantRow(row: VariantValueRow): VariantAttributeValueRecord {
  return {
    id: row.id,
    storeId: row.storeId,
    variantId: row.variantId,
    attributeDefinitionId: row.attributeDefinitionId,
    dataType: row.definition.dataType,
    valueText: row.valueText,
    optionId: row.optionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createPrismaAttributeValueDataAccess(): AttributeValueDataAccess {
  return {
    findAttributeDefinitionsByIds: (ids) =>
      ids.length === 0
        ? Promise.resolve([])
        : prisma.attributeDefinition.findMany({
            where: { id: { in: ids } },
            select: { id: true, scope: true, storeId: true, dataType: true, status: true },
          }),
    findAttributeOptionsByIds: (ids) =>
      ids.length === 0
        ? Promise.resolve([])
        : prisma.attributeOption.findMany({
            where: { id: { in: ids } },
            select: { id: true, attributeDefinitionId: true, storeId: true, status: true },
          }),
    findMediaAssetIdsForStore: async (storeId, ids) => {
      if (ids.length === 0) return [];
      const rows = await prisma.mediaAsset.findMany({
        where: { id: { in: ids }, storeId },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    },
    listCategoryAttributeLinks: (storeId, categoryId) =>
      prisma.categoryAttribute.findMany({
        where: { storeId, categoryId },
        select: { attributeDefinitionId: true, required: true, variantDefining: true },
      }),
    findProductForStore: (storeId, productId) =>
      prisma.product.findFirst({
        where: { id: productId, storeId },
        select: { id: true, primaryCategoryId: true },
      }),
    findVariantForStore: async (storeId, variantId) => {
      const row = await prisma.productVariant.findFirst({
        where: { id: variantId, storeId },
        select: { id: true, productId: true, product: { select: { primaryCategoryId: true } } },
      });
      return row
        ? { id: row.id, productId: row.productId, primaryCategoryId: row.product.primaryCategoryId }
        : null;
    },

    listProductAttributeValues: async (storeId, productId) => {
      const rows = await prisma.productAttributeValue.findMany({
        where: { storeId, productId },
        orderBy: { createdAt: "asc" },
        select: productValueSelect,
      });
      return rows.map(mapProductRow);
    },
    listVariantAttributeValues: async (storeId, variantId) => {
      const rows = await prisma.variantAttributeValue.findMany({
        where: { storeId, variantId },
        orderBy: { createdAt: "asc" },
        select: variantValueSelect,
      });
      return rows.map(mapVariantRow);
    },

    // Replace-set: mevcut degerler silinir (junction parent Cascade ile temizlenir),
    // dogrulanmis girdiler yeniden yazilir. Tek transaction → yarim yazim olmaz.
    replaceProductAttributeValues: (storeId, productId, entries) =>
      prisma.$transaction(async (tx) => {
        await tx.productAttributeValue.deleteMany({ where: { storeId, productId } });
        for (const entry of entries) {
          const created = await tx.productAttributeValue.create({
            data: {
              storeId,
              productId,
              attributeDefinitionId: entry.attributeDefinitionId,
              valueText: entry.valueText ?? null,
              valueInteger: entry.valueInteger ?? null,
              valueDecimal:
                entry.valueDecimal === undefined || entry.valueDecimal === null
                  ? null
                  : new Prisma.Decimal(entry.valueDecimal),
              valueBoolean: entry.valueBoolean ?? null,
              valueDate: entry.valueDate ?? null,
              optionId: entry.optionId ?? null,
              mediaId: entry.mediaId ?? null,
            },
            select: { id: true },
          });
          if (entry.optionIds && entry.optionIds.length > 0) {
            await tx.productAttributeValueOption.createMany({
              data: entry.optionIds.map((optionId) => ({
                storeId,
                productAttributeValueId: created.id,
                optionId,
              })),
              skipDuplicates: true,
            });
          }
        }
        const rows = await tx.productAttributeValue.findMany({
          where: { storeId, productId },
          orderBy: { createdAt: "asc" },
          select: productValueSelect,
        });
        return rows.map(mapProductRow);
      }),

    replaceVariantAttributeValues: (storeId, variantId, entries) =>
      prisma.$transaction(async (tx) => {
        await tx.variantAttributeValue.deleteMany({ where: { storeId, variantId } });
        if (entries.length > 0) {
          await tx.variantAttributeValue.createMany({
            data: entries.map((entry) => ({
              storeId,
              variantId,
              attributeDefinitionId: entry.attributeDefinitionId,
              valueText: entry.valueText ?? null,
              optionId: entry.optionId ?? null,
            })),
          });
        }
        const rows = await tx.variantAttributeValue.findMany({
          where: { storeId, variantId },
          orderBy: { createdAt: "asc" },
          select: variantValueSelect,
        });
        return rows.map(mapVariantRow);
      }),
  };
}
