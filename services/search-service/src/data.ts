/**
 * TODO-154 (ADR-079) — Faz 2C-8A · Search Read-Model · VERİ ERİŞİMİ (DB-aware).
 *
 * Builder SAFtir; bu katman tüm IO'yu yürütür. Okuma BOUNDED BATCH'tir (chunk başına SABİT sayıda
 * sorgu — N+1 YOK, chunk büyüklüğünden bağımsız). Yazım TEK ÜRÜN = TEK TRANSACTION: doküman upsert
 * (revision monotonik artar) + facet delete-and-replace (kategori/attribute değişince eski satır KALMAZ).
 *
 * Tenant güvenliği: HER sorgu storeId ile scope'lanır (cross-tenant imkânsız). Değer tabloları
 * (ProductAttributeValue/VariantAttributeValue) storeId ile filtrelendiği için PLATFORM attribute
 * tanımı okunsa bile yalnız DOĞRU mağazanın değerleri döner.
 *
 * `searchVector` DB-generated (tsvector) → create/update input'una GİRMEZ (Prisma Unsupported; DB üretir).
 */

import type { PrismaClient } from "@prisma/client";
import type { TransactionClient } from "@commerce-os/db";
import type {
  IndexAction,
  IndexStatus,
  SearchBuildResult,
  SearchOptionRef,
  SearchSourceCategoryAttribute,
  SearchSourceProduct,
  SearchSourceProductAttributeValue,
  SearchSourceVariant,
  SearchSourceVariantAttributeValue,
} from "./types.js";

/** api-gateway/worker/backfill tarafından tüketilen IO portu (fake ile birim-test edilebilir). */
export interface SearchDataAccess {
  /** Bounded batch: verilen productId kümesinin kaynak projeksiyonu (yalnız store'a ait olanlar). */
  loadSources(storeId: string, productIds: string[]): Promise<Map<string, SearchSourceProduct>>;
  /** Builder sonucunu tek transaction'da uygula (removed → sil; aksi → upsert doküman + replace facet). */
  applyBuild(
    storeId: string,
    productId: string,
    result: SearchBuildResult,
  ): Promise<{ action: IndexAction; facetCount: number }>;
  /** Ürünü read-model'den kaldır (idempotent). */
  removeProduct(storeId: string, productId: string): Promise<void>;
  /** Backfill imleci: id ASC, afterId'den sonra en fazla batchSize productId (resumable). */
  scanProductIds(storeId: string, afterId: string | null, batchSize: number): Promise<string[]>;
  /** Sağlık/durum sayaçları. */
  getIndexStatus(storeId: string): Promise<IndexStatus>;
}

/** Prisma Client VEYA transaction client — okuma sorgularının kabul ettiği asgari yüzey. */
type PrismaLike = PrismaClient | TransactionClient;

const PRICE_VISIBLE = new Set(["VISIBLE", "STARTING_FROM"]);

export function createPrismaSearchDataAccess(client: PrismaClient): SearchDataAccess {
  return {
    async loadSources(storeId, productIds) {
      const result = new Map<string, SearchSourceProduct>();
      if (productIds.length === 0) return result;

      // (1) Ürünler (yalnız bu store).
      const products = await client.product.findMany({
        where: { storeId, id: { in: productIds } },
        select: {
          id: true,
          storeId: true,
          title: true,
          slug: true,
          brand: true,
          vendor: true,
          description: true,
          status: true,
          priceVisibility: true,
          primaryCategoryId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (products.length === 0) return result;

      const foundIds = products.map((p) => p.id);

      // (2) ACTIVE varyantlar.
      const variants = await client.productVariant.findMany({
        where: { storeId, productId: { in: foundIds }, status: "ACTIVE" },
        select: { id: true, productId: true, status: true, priceMinor: true, currency: true },
      });
      const variantIds = variants.map((v) => v.id);
      const variantToProduct = new Map(variants.map((v) => [v.id, v.productId]));

      // (3) Stok (InventoryItem default-depo otoritesi; available = onHand − reserved).
      const inventory =
        variantIds.length > 0
          ? await client.inventoryItem.findMany({
              where: { storeId, variantId: { in: variantIds } },
              select: { variantId: true, quantityOnHand: true, quantityReserved: true },
            })
          : [];
      const availableByVariant = new Map(
        inventory.map((i) => [i.variantId, i.quantityOnHand - i.quantityReserved]),
      );

      // (4) Ana kategori CategoryAttribute davranışları (filterable VEYA searchable).
      const categoryIds = [
        ...new Set(products.map((p) => p.primaryCategoryId).filter((v): v is string => v !== null)),
      ];
      const categoryAttributes =
        categoryIds.length > 0
          ? await client.categoryAttribute.findMany({
              where: {
                storeId,
                categoryId: { in: categoryIds },
                OR: [{ filterable: true }, { searchable: true }],
              },
              select: {
                categoryId: true,
                attributeDefinitionId: true,
                filterable: true,
                searchable: true,
                variantDefining: true,
                definition: { select: { code: true, name: true, dataType: true, status: true } },
              },
            })
          : [];
      const relevantDefIds = [...new Set(categoryAttributes.map((ca) => ca.attributeDefinitionId))];
      const caByCategory = groupBy(categoryAttributes, (ca) => ca.categoryId);

      // (5) Ürün-seviyesi değerler (yalnız ilgili tanımlar).
      const productAttributeValues =
        relevantDefIds.length > 0
          ? await client.productAttributeValue.findMany({
              where: { storeId, productId: { in: foundIds }, attributeDefinitionId: { in: relevantDefIds } },
              select: {
                productId: true,
                attributeDefinitionId: true,
                valueText: true,
                valueInteger: true,
                valueDecimal: true,
                valueBoolean: true,
                valueDate: true,
                option: { select: { id: true, value: true, label: true, status: true } },
                optionLinks: {
                  select: { option: { select: { id: true, value: true, label: true, status: true } } },
                },
              },
            })
          : [];
      const pavByProduct = groupBy(productAttributeValues, (pav) => pav.productId);

      // (6) Varyant-seviyesi değerler (yalnız ilgili tanımlar; variantId → productId eşlemesiyle).
      const variantAttributeValues =
        relevantDefIds.length > 0 && variantIds.length > 0
          ? await client.variantAttributeValue.findMany({
              where: { storeId, variantId: { in: variantIds }, attributeDefinitionId: { in: relevantDefIds } },
              select: {
                variantId: true,
                attributeDefinitionId: true,
                valueText: true,
                option: { select: { id: true, value: true, label: true, status: true } },
              },
            })
          : [];

      const variantsByProduct = groupBy(variants, (v) => v.productId);
      const vavByProduct = new Map<string, SearchSourceVariantAttributeValue[]>();
      for (const vav of variantAttributeValues) {
        const productId = variantToProduct.get(vav.variantId);
        if (!productId) continue;
        const arr = vavByProduct.get(productId) ?? [];
        arr.push({
          variantId: vav.variantId,
          attributeDefinitionId: vav.attributeDefinitionId,
          valueText: vav.valueText,
          option: toOptionRef(vav.option),
        });
        vavByProduct.set(productId, arr);
      }

      // Assemble per product.
      for (const p of products) {
        const productVariants: SearchSourceVariant[] = (variantsByProduct.get(p.id) ?? []).map((v) => ({
          id: v.id,
          status: v.status,
          priceMinor: v.priceMinor,
          currency: v.currency,
          available: availableByVariant.has(v.id) ? (availableByVariant.get(v.id) as number) : null,
        }));
        const cats = p.primaryCategoryId ? caByCategory.get(p.primaryCategoryId) ?? [] : [];
        result.set(p.id, {
          id: p.id,
          storeId: p.storeId,
          title: p.title,
          slug: p.slug,
          brand: p.brand ?? p.vendor ?? null,
          description: p.description,
          status: p.status,
          priceVisible: PRICE_VISIBLE.has(p.priceVisibility),
          primaryCategoryId: p.primaryCategoryId,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          variants: productVariants,
          categoryAttributes: cats.map(toCategoryAttribute),
          productAttributeValues: (pavByProduct.get(p.id) ?? []).map(toProductAttributeValue),
          variantAttributeValues: vavByProduct.get(p.id) ?? [],
        });
      }
      return result;
    },

    async applyBuild(storeId, productId, result) {
      if (result.removed) {
        await removeProductRows(client, storeId, productId);
        return { action: "removed", facetCount: 0 };
      }
      const { document, facets } = result;
      await client.$transaction(async (tx) => {
        // Facet delete-and-replace (eski satırlar kalmaz).
        await tx.productFacetValue.deleteMany({ where: { storeId, productId } });
        // Doküman upsert (revision monotonik; searchVector DB-generated → yazılmaz).
        await tx.productSearchDocument.upsert({
          where: { productId },
          create: {
            storeId: document.storeId,
            productId: document.productId,
            primaryCategoryId: document.primaryCategoryId,
            title: document.title,
            slug: document.slug,
            brand: document.brand,
            searchText: document.searchText,
            status: document.status,
            minPriceMinor: document.minPriceMinor,
            maxPriceMinor: document.maxPriceMinor,
            currency: document.currency,
            hasStock: document.hasStock,
            availability: document.availability,
            variantCount: document.variantCount,
            productCreatedAt: document.productCreatedAt,
            productUpdatedAt: document.productUpdatedAt,
            revision: 0,
          },
          update: {
            primaryCategoryId: document.primaryCategoryId,
            title: document.title,
            slug: document.slug,
            brand: document.brand,
            searchText: document.searchText,
            status: document.status,
            minPriceMinor: document.minPriceMinor,
            maxPriceMinor: document.maxPriceMinor,
            currency: document.currency,
            hasStock: document.hasStock,
            availability: document.availability,
            variantCount: document.variantCount,
            productCreatedAt: document.productCreatedAt,
            productUpdatedAt: document.productUpdatedAt,
            revision: { increment: 1 },
            indexedAt: new Date(),
          },
        });
        if (facets.length > 0) {
          await tx.productFacetValue.createMany({
            data: facets.map((f) => ({
              storeId: f.storeId,
              productId: f.productId,
              categoryId: f.categoryId,
              attributeDefinitionId: f.attributeDefinitionId,
              optionId: f.optionId,
              valueText: f.valueText,
              valueNumber: f.valueNumber,
              valueBoolean: f.valueBoolean,
              valueDate: f.valueDate,
              normalizedText: f.normalizedText,
            })),
          });
        }
      });
      return { action: "indexed", facetCount: facets.length };
    },

    async removeProduct(storeId, productId) {
      await removeProductRows(client, storeId, productId);
    },

    async scanProductIds(storeId, afterId, batchSize) {
      const rows = await client.product.findMany({
        where: { storeId, ...(afterId ? { id: { gt: afterId } } : {}) },
        orderBy: { id: "asc" },
        take: batchSize,
        select: { id: true },
      });
      return rows.map((r) => r.id);
    },

    async getIndexStatus(storeId) {
      const [documentCount, facetCount, last] = await Promise.all([
        client.productSearchDocument.count({ where: { storeId } }),
        client.productFacetValue.count({ where: { storeId } }),
        client.productSearchDocument.findFirst({
          where: { storeId },
          orderBy: { indexedAt: "desc" },
          select: { indexedAt: true },
        }),
      ]);
      return { storeId, documentCount, facetCount, lastIndexedAt: last?.indexedAt ?? null };
    },
  };
}

async function removeProductRows(client: PrismaLike, storeId: string, productId: string): Promise<void> {
  // Tek transaction: facet + doküman birlikte silinir (yarım-silme yok).
  await (client as PrismaClient).$transaction(async (tx) => {
    await tx.productFacetValue.deleteMany({ where: { storeId, productId } });
    await tx.productSearchDocument.deleteMany({ where: { storeId, productId } });
  });
}

// ── küçük yardımcılar ──

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = map.get(k) ?? [];
    arr.push(item);
    map.set(k, arr);
  }
  return map;
}

function toOptionRef(
  option: { id: string; value: string; label: string; status: "ACTIVE" | "ARCHIVED" } | null,
): SearchOptionRef | null {
  return option ? { id: option.id, value: option.value, label: option.label, status: option.status } : null;
}

type RawCategoryAttribute = {
  attributeDefinitionId: string;
  filterable: boolean;
  searchable: boolean;
  variantDefining: boolean;
  definition: { code: string; name: string; dataType: SearchSourceCategoryAttribute["dataType"]; status: "ACTIVE" | "ARCHIVED" };
};

function toCategoryAttribute(ca: RawCategoryAttribute): SearchSourceCategoryAttribute {
  return {
    attributeDefinitionId: ca.attributeDefinitionId,
    filterable: ca.filterable,
    searchable: ca.searchable,
    variantDefining: ca.variantDefining,
    code: ca.definition.code,
    name: ca.definition.name,
    dataType: ca.definition.dataType,
    definitionStatus: ca.definition.status,
  };
}

type RawProductAttributeValue = {
  attributeDefinitionId: string;
  valueText: string | null;
  valueInteger: number | null;
  valueDecimal: { toString(): string } | null;
  valueBoolean: boolean | null;
  valueDate: Date | null;
  option: { id: string; value: string; label: string; status: "ACTIVE" | "ARCHIVED" } | null;
  optionLinks: { option: { id: string; value: string; label: string; status: "ACTIVE" | "ARCHIVED" } }[];
};

function toProductAttributeValue(pav: RawProductAttributeValue): SearchSourceProductAttributeValue {
  return {
    attributeDefinitionId: pav.attributeDefinitionId,
    valueText: pav.valueText,
    valueInteger: pav.valueInteger,
    valueDecimal: pav.valueDecimal !== null ? pav.valueDecimal.toString() : null,
    valueBoolean: pav.valueBoolean,
    valueDate: pav.valueDate,
    option: toOptionRef(pav.option),
    multiOptions: pav.optionLinks.map((link) => ({
      id: link.option.id,
      value: link.option.value,
      label: link.option.label,
      status: link.option.status,
    })),
  };
}
