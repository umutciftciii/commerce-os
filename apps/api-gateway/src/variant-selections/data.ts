/**
 * Faz 2C-1 (ADR-070) — Varyant motoru TEMELI veri erisimi (eksen secimi).
 *
 * Bir urunun hangi variant-defining attribute'lari EKSEN olarak kullanacagini + her eksende hangi
 * AttributeOption'lari kapsayacagini NORMALIZE saklar (JSON YOK). TUM yazimlar tek nokta olan
 * `variantSelectionService` (service.ts) uzerinden gelir; bu modul yalniz IO'dur (dogrulama YOK —
 * o servistedir). attribute-values/ modul deseni: ayri prisma-backed data-access + DI → dev
 * in-memory AppDataAccess'e (health.test.ts) dokunmadan izole test.
 *
 * KOMBINASYON URETMEZ: ProductVariant / combinationKey / Cartesian / SKU matris OLUSTURULMAZ. Bu
 * tablolar gelecekteki Combination Engine icin "eksenler × secilen option'lar" recetesidir.
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type { AttributeDataType } from "@commerce-os/contracts";

// Prisma client VEYA transaction client (readSelections ikisiyle de calisir).
type PrismaLike = typeof prisma | Prisma.TransactionClient;

// ─────────────────────────── Kayit tipleri ───────────────────────────
export interface ProductVariantSelectionRecord {
  id: string;
  storeId: string;
  productId: string;
  attributeDefinitionId: string;
  dataType: AttributeDataType;
  position: number;
  // Bu eksende kapsanan option id'leri, position ASC sirasinda.
  optionIds: string[];
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

// ─────────── Normalize edilmis (dogrulanmis) yazilacak girdi tipi ───────────
export interface ProductVariantSelectionEntry {
  attributeDefinitionId: string;
  // position: girdi sirasi (dizi index'i) — service atar.
  optionIds: string[];
}

export interface VariantSelectionDataAccess {
  // — dogrulama lookuplari (batch; N+1 yok) —
  findAttributeDefinitionsByIds(ids: string[]): Promise<AttributeDefinitionRef[]>;
  findAttributeOptionsByIds(ids: string[]): Promise<AttributeOptionRef[]>;
  listCategoryAttributeLinks(storeId: string, categoryId: string): Promise<CategoryAttributeRef[]>;
  findProductForStore(storeId: string, productId: string): Promise<ProductOwnershipRef | null>;

  // — okuma —
  listProductVariantSelections(storeId: string, productId: string): Promise<ProductVariantSelectionRecord[]>;

  // — yazma (replace-set, transactional) —
  replaceProductVariantSelections(
    storeId: string,
    productId: string,
    entries: ProductVariantSelectionEntry[],
  ): Promise<ProductVariantSelectionRecord[]>;
}

// ─────────────────────────── Prisma implementasyonu ───────────────────────────
export function createPrismaVariantSelectionDataAccess(): VariantSelectionDataAccess {
  const readSelections = async (
    client: PrismaLike,
    storeId: string,
    productId: string,
  ): Promise<ProductVariantSelectionRecord[]> => {
    const rows = await client.productVariantAttribute.findMany({
      where: { storeId, productId },
      orderBy: { position: "asc" },
      select: {
        id: true,
        storeId: true,
        productId: true,
        attributeDefinitionId: true,
        position: true,
        createdAt: true,
        updatedAt: true,
        definition: { select: { dataType: true } },
        options: { select: { optionId: true }, orderBy: { position: "asc" } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      storeId: row.storeId,
      productId: row.productId,
      attributeDefinitionId: row.attributeDefinitionId,
      dataType: row.definition.dataType,
      position: row.position,
      optionIds: row.options.map((o) => o.optionId),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  };

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
    listCategoryAttributeLinks: (storeId, categoryId) =>
      prisma.categoryAttribute.findMany({
        where: { storeId, categoryId },
        select: { attributeDefinitionId: true, variantDefining: true },
      }),
    findProductForStore: (storeId, productId) =>
      prisma.product.findFirst({
        where: { id: productId, storeId },
        select: { id: true, primaryCategoryId: true },
      }),

    listProductVariantSelections: (storeId, productId) => readSelections(prisma, storeId, productId),

    // Replace-set: mevcut eksenler silinir (option'lar parent Cascade ile temizlenir),
    // dogrulanmis girdiler position sirasinda yeniden yazilir. Tek transaction → yarim yazim olmaz.
    replaceProductVariantSelections: (storeId, productId, entries) =>
      prisma.$transaction(async (tx) => {
        await tx.productVariantAttribute.deleteMany({ where: { storeId, productId } });
        for (const [index, entry] of entries.entries()) {
          const axis = await tx.productVariantAttribute.create({
            data: {
              storeId,
              productId,
              attributeDefinitionId: entry.attributeDefinitionId,
              position: index,
            },
            select: { id: true },
          });
          if (entry.optionIds.length > 0) {
            await tx.productVariantOptionSelection.createMany({
              data: entry.optionIds.map((optionId, optionIndex) => ({
                storeId,
                productVariantAttributeId: axis.id,
                optionId,
                position: optionIndex,
              })),
            });
          }
        }
        return readSelections(tx, storeId, productId);
      }),
  };
}
