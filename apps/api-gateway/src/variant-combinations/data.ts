/**
 * Faz 2C-2 (ADR-071) — Combination Engine ÖNİZLEME veri erişimi (yalnız OKUMA).
 *
 * Motor SAFTIR (engine.ts); bu modül yalnız IO'dur: bir ürünün kalıcı varyant EKSEN reçetesini
 * (`ProductVariantAttribute` × `ProductVariantOptionSelection`) + seçili option'ların güncel
 * metadata'sını (label/status) okur. HİÇBİR YAZIM YOK (preview write endpoint DEĞİLDİR).
 *
 * `ProductVariantSelectionRecord` tipi Faz 2C-1 data-access'inden yeniden kullanılır (tek kaynak).
 * Bu faz KOMBINASYON YAZMAZ: ProductVariant / combinationKey / SKU OLUŞTURULMAZ.
 */
import { prisma } from "@commerce-os/db";
import type { ProductVariantSelectionRecord } from "../variant-selections/data.js";

// Seçili option'ın önizleme için gereken güncel metadata'sı (etiket + arşiv durumu).
export interface CombinationOptionMeta {
  id: string;
  label: string;
  status: "ACTIVE" | "ARCHIVED";
}

export interface ProductOwnershipRef {
  id: string;
  primaryCategoryId: string | null;
}

export interface VariantCombinationDataAccess {
  // Sahiplik doğrulaması (ürün yoksa 404).
  findProductForStore(storeId: string, productId: string): Promise<ProductOwnershipRef | null>;
  // Ürünün kalıcı eksen reçetesi (position ASC; her eksende optionIds position ASC).
  listProductVariantSelections(
    storeId: string,
    productId: string,
  ): Promise<ProductVariantSelectionRecord[]>;
  // Seçili option'ların güncel metadata'sı (batch; N+1 yok).
  findAttributeOptionsMeta(optionIds: string[]): Promise<CombinationOptionMeta[]>;
}

export function createPrismaVariantCombinationDataAccess(): VariantCombinationDataAccess {
  return {
    findProductForStore: (storeId, productId) =>
      prisma.product.findFirst({
        where: { id: productId, storeId },
        select: { id: true, primaryCategoryId: true },
      }),

    listProductVariantSelections: async (storeId, productId) => {
      const rows = await prisma.productVariantAttribute.findMany({
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
    },

    findAttributeOptionsMeta: (optionIds) =>
      optionIds.length === 0
        ? Promise.resolve([])
        : prisma.attributeOption.findMany({
            where: { id: { in: optionIds } },
            select: { id: true, label: true, status: true },
          }),
  };
}
