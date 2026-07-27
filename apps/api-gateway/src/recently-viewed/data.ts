/**
 * TODO-161B (ADR-137…143) — Recently Viewed & Similar Products — veri erişim katmanı.
 *
 * Konvansiyon (customer-lists ile birebir): factory → düz nesne; ham prisma; TÜM sorgular `storeId`
 * scope'lu; transaction yok; eşzamanlılık P2002-yakala-yeniden-oku ile. Guest kimliği HAM DEĞİL —
 * `visitorHash` (HMAC türevi) route katmanından gelir. Öneri kartları read-model
 * (`ProductSearchDocument`) snapshot'ından; Product/Variant/Image source-of-truth join'i YOK (bounded).
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import { mergeViewCount, mostRecent } from "./recently-viewed-core.js";
import type { SimilarityFeatures } from "./similarity-core.js";

/** Kimlik: tam olarak biri dolu (customer VEYA guest visitor). CHECK constraint ile eşleşir. */
export type ViewerIdentity = { customerId: string; visitorHash?: undefined } | { customerId?: undefined; visitorHash: string };

/** Read-model kart satırı (ProductSearchDocument alt kümesi; kart + skorlama için yeterli). */
export interface SearchDocRow {
  productId: string;
  slug: string;
  title: string;
  brand: string | null;
  primaryCategoryId: string | null;
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
  currency: string | null;
  availability: "IN_STOCK" | "OUT_OF_STOCK";
  hasStock: boolean;
  compareAtMinor: number | null;
  discountPercent: number | null;
  omnibusPreviousPriceMinor: number | null;
  listing: Prisma.JsonValue;
  campaign: Prisma.JsonValue;
  campaignStartsAt: Date | null;
  campaignEndsAt: Date | null;
  productCreatedAt: Date;
}

export interface RecentlyViewedRow {
  productId: string;
  lastViewedAt: Date;
}

export interface RecentlyViewedData {
  /** Görüntüleme kaydı (upsert + cap prune). Ürün store'da yoksa false. */
  recordView(storeId: string, identity: ViewerIdentity, productId: string, now: Date, cap: number): Promise<boolean>;
  /** Kimlik geçmişi (en-yeni-önce), scanLimit ile bounded. */
  listHistory(storeId: string, identity: ViewerIdentity, scanLimit: number): Promise<RecentlyViewedRow[]>;
  /** Kimlik geçmişini temizle; silinen satır sayısı. */
  clearHistory(storeId: string, identity: ViewerIdentity): Promise<number>;
  /** Guest (visitorHash) geçmişini customer'a idempotent merge; birleştirilen ürün sayısı. */
  mergeGuestIntoCustomer(storeId: string, customerId: string, visitorHash: string, cap: number, mergeMax: number): Promise<number>;
  /** Verilen id'lerden yalnız ACTIVE + stokta olanların kümesi (görünürlük gate). */
  filterVisibleInStock(storeId: string, productIds: string[]): Promise<Set<string>>;
  /** Kart hidrasyonu için read-model satırları (yalnız ACTIVE + stokta). Map keyed by productId. */
  loadCards(storeId: string, productIds: string[]): Promise<Map<string, SearchDocRow>>;
  /** Similar için anchor sinyalleri + kart satırı. Anchor ACTIVE değilse null. */
  loadAnchor(storeId: string, productId: string): Promise<{ features: SimilarityFeatures } | null>;
  /** Similar adayları KATMANLI bounded sorgularla (ACTIVE + stokta + anchor hariç) + kart satırları. */
  loadSimilarCandidates(
    storeId: string,
    anchor: SimilarityFeatures,
    maxCandidates: number,
  ): Promise<{ features: SimilarityFeatures[]; cards: Map<string, SearchDocRow> }>;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Kimlik → prisma where (kesin: customerId ya da visitorHash). */
function identityWhere(storeId: string, identity: ViewerIdentity): Prisma.RecentlyViewedProductWhereInput {
  return identity.customerId !== undefined
    ? { storeId, customerId: identity.customerId }
    : { storeId, visitorHash: identity.visitorHash };
}

/** Fallback (Tier 5) tetiklenmeden önce hedeflenen minimum ilgili aday sayısı. */
const SIMILAR_MIN_TARGET = 24;
/** Katman-başına bounded kota: TEK bir sinyal (ör. büyük kategori) global cap'i doldurup diğer
 * sinyalleri (ör. aynı marka farklı kategori) dışlamasın diye. Her katman EN FAZLA bu kadar getirir. */
const SIMILAR_PER_TIER = 120;
/** Fiyat bandı (Tier 3): anchor fiyatının [0.5x, 2x] aralığı (aynı marka). */
const PRICE_BAND_LOW = 0.5;
const PRICE_BAND_HIGH = 2;

const SEARCH_DOC_SELECT = {
  productId: true,
  slug: true,
  title: true,
  brand: true,
  primaryCategoryId: true,
  minPriceMinor: true,
  maxPriceMinor: true,
  currency: true,
  availability: true,
  hasStock: true,
  compareAtMinor: true,
  discountPercent: true,
  omnibusPreviousPriceMinor: true,
  listing: true,
  campaign: true,
  campaignStartsAt: true,
  campaignEndsAt: true,
  productCreatedAt: true,
} satisfies Prisma.ProductSearchDocumentSelect;

export function createRecentlyViewedData(): RecentlyViewedData {
  /** Kimlik başına cap'i aşan (en eski) satırları sil. */
  async function pruneToCap(storeId: string, identity: ViewerIdentity, cap: number): Promise<void> {
    const excess = await prisma.recentlyViewedProduct.findMany({
      where: identityWhere(storeId, identity),
      orderBy: { lastViewedAt: "desc" },
      select: { id: true },
      skip: Math.max(0, cap),
    });
    if (excess.length > 0) {
      await prisma.recentlyViewedProduct.deleteMany({ where: { id: { in: excess.map((r) => r.id) } } });
    }
  }

  /** DocRow'ları SimilarityFeatures'a zenginleştir (parentCategory + salesMode + attribute anahtarları). */
  async function enrichFeatures(storeId: string, docs: SearchDocRow[]): Promise<SimilarityFeatures[]> {
    if (docs.length === 0) return [];
    const productIds = docs.map((d) => d.productId);
    const categoryIds = [...new Set(docs.map((d) => d.primaryCategoryId).filter((id): id is string => id !== null))];

    const [categories, products, facets] = await Promise.all([
      categoryIds.length > 0
        ? prisma.productCategory.findMany({ where: { storeId, id: { in: categoryIds } }, select: { id: true, parentId: true } })
        : Promise.resolve([]),
      prisma.product.findMany({ where: { storeId, id: { in: productIds } }, select: { id: true, salesMode: true } }),
      prisma.productFacetValue.findMany({
        where: { storeId, productId: { in: productIds }, optionId: { not: null } },
        select: { productId: true, attributeDefinitionId: true, optionId: true },
      }),
    ]);

    const parentByCategory = new Map(categories.map((c) => [c.id, c.parentId]));
    const salesModeByProduct = new Map(products.map((p) => [p.id, p.salesMode as string]));
    const attrKeysByProduct = new Map<string, string[]>();
    for (const f of facets) {
      if (f.optionId === null) continue;
      const key = `${f.attributeDefinitionId}:${f.optionId}`;
      const arr = attrKeysByProduct.get(f.productId) ?? [];
      arr.push(key);
      attrKeysByProduct.set(f.productId, arr);
    }

    return docs.map((d) => ({
      productId: d.productId,
      primaryCategoryId: d.primaryCategoryId,
      parentCategoryId: d.primaryCategoryId ? parentByCategory.get(d.primaryCategoryId) ?? null : null,
      brand: d.brand,
      salesMode: salesModeByProduct.get(d.productId) ?? null,
      priceMinor: d.minPriceMinor,
      currency: d.currency,
      attributeKeys: attrKeysByProduct.get(d.productId) ?? [],
      createdAtMs: d.productCreatedAt.getTime(),
    }));
  }

  return {
    async recordView(storeId, identity, productId, now, cap) {
      // Ürün store'da var mı? (enumeration / bogus id koruması + FK hatasını önler).
      const product = await prisma.product.findFirst({ where: { id: productId, storeId }, select: { id: true } });
      if (!product) return false;

      const where = identity.customerId !== undefined
        ? { storeId, customerId: identity.customerId, productId }
        : { storeId, visitorHash: identity.visitorHash, productId };

      const existing = await prisma.recentlyViewedProduct.findFirst({ where, select: { id: true } });
      if (existing) {
        await prisma.recentlyViewedProduct.update({
          where: { id: existing.id },
          data: { lastViewedAt: now, viewCount: { increment: 1 } },
        });
      } else {
        try {
          await prisma.recentlyViewedProduct.create({
            data: {
              storeId,
              productId,
              customerId: identity.customerId ?? null,
              visitorHash: identity.visitorHash ?? null,
              lastViewedAt: now,
              viewCount: 1,
            },
          });
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          const row = await prisma.recentlyViewedProduct.findFirst({ where, select: { id: true } });
          if (row) {
            await prisma.recentlyViewedProduct.update({
              where: { id: row.id },
              data: { lastViewedAt: now, viewCount: { increment: 1 } },
            });
          }
        }
      }
      await pruneToCap(storeId, identity, cap);
      return true;
    },

    async listHistory(storeId, identity, scanLimit) {
      return prisma.recentlyViewedProduct.findMany({
        where: identityWhere(storeId, identity),
        orderBy: { lastViewedAt: "desc" },
        take: Math.max(1, scanLimit),
        select: { productId: true, lastViewedAt: true },
      });
    },

    async clearHistory(storeId, identity) {
      const result = await prisma.recentlyViewedProduct.deleteMany({ where: identityWhere(storeId, identity) });
      return result.count;
    },

    async mergeGuestIntoCustomer(storeId, customerId, visitorHash, cap, mergeMax) {
      const guestRows = await prisma.recentlyViewedProduct.findMany({
        where: { storeId, visitorHash },
        orderBy: { lastViewedAt: "desc" },
        take: Math.max(1, mergeMax),
        select: { id: true, productId: true, viewCount: true, lastViewedAt: true },
      });
      if (guestRows.length === 0) {
        // Kalıntı guest satırı yoksa da temizlik idempotenttir.
        await prisma.recentlyViewedProduct.deleteMany({ where: { storeId, visitorHash } });
        return 0;
      }

      let merged = 0;
      for (const g of guestRows) {
        const existing = await prisma.recentlyViewedProduct.findFirst({
          where: { storeId, customerId, productId: g.productId },
          select: { id: true, viewCount: true, lastViewedAt: true },
        });
        if (existing) {
          await prisma.recentlyViewedProduct.update({
            where: { id: existing.id },
            data: {
              lastViewedAt: mostRecent(existing.lastViewedAt, g.lastViewedAt),
              viewCount: mergeViewCount(existing.viewCount, g.viewCount, cap),
            },
          });
        } else {
          // Guest satırını customer'a taşı (createdAt korunur). Yarış → benzersizlik ihlali; atla.
          try {
            await prisma.recentlyViewedProduct.update({
              where: { id: g.id },
              data: { customerId, visitorHash: null },
            });
          } catch (error) {
            if (!isUniqueViolation(error)) throw error;
          }
        }
        merged += 1;
      }
      // Taşınmayan (çakışan) guest satırlarını temizle; taşınanların visitorHash'i artık null → etkilenmez.
      await prisma.recentlyViewedProduct.deleteMany({ where: { storeId, visitorHash } });
      await pruneToCap(storeId, { customerId }, cap);
      return merged;
    },

    async filterVisibleInStock(storeId, productIds) {
      if (productIds.length === 0) return new Set();
      const docs = await prisma.productSearchDocument.findMany({
        where: { storeId, productId: { in: productIds }, status: "ACTIVE", hasStock: true },
        select: { productId: true },
      });
      return new Set(docs.map((d) => d.productId));
    },

    async loadCards(storeId, productIds) {
      const map = new Map<string, SearchDocRow>();
      if (productIds.length === 0) return map;
      const docs = await prisma.productSearchDocument.findMany({
        where: { storeId, productId: { in: productIds }, status: "ACTIVE", hasStock: true },
        select: SEARCH_DOC_SELECT,
      });
      for (const d of docs) map.set(d.productId, d as SearchDocRow);
      return map;
    },

    async loadAnchor(storeId, productId) {
      const doc = await prisma.productSearchDocument.findFirst({
        where: { storeId, productId, status: "ACTIVE" },
        select: SEARCH_DOC_SELECT,
      });
      if (!doc) return null;
      const [features] = await enrichFeatures(storeId, [doc as SearchDocRow]);
      return { features };
    },

    async loadSimilarCandidates(storeId, anchor, maxCandidates) {
      // KATMANLI DB-seviyesi aday daraltması (ADR-142 revize). Her katman KENDİ sinyal-hedefli bounded
      // sorgusudur → ilgili aday, katalog createdAt sırasının N. kaydından sonra bile KENDİ katmanında
      // getirilir (tek OR + global createdAt LIMIT'in "ilgili adayı düşürme" hatası çözülür). Katmanlar
      // relevance sırasında; `collected` dedup + toplam `maxCandidates` ile bounded (tüm katalog belleğe
      // ALINMAZ). Sıralama nihai SAF skorlamada deterministik (bu Map insertion sırası skoru ETKİLEMEZ).
      const cap = Math.max(1, maxCandidates);
      const collected = new Map<string, SearchDocRow>();
      const addDocs = (docs: SearchDocRow[]) => {
        for (const d of docs) {
          if (collected.size >= cap) break;
          if (!collected.has(d.productId)) collected.set(d.productId, d);
        }
      };
      const baseWhere: Prisma.ProductSearchDocumentWhereInput = {
        storeId,
        status: "ACTIVE",
        hasStock: true,
        productId: { not: anchor.productId },
      };
      // Her katman KENDİ bounded kotasıyla (SIMILAR_PER_TIER) sorgulanır → tek sinyal global cap'i
      // doldurup diğer sinyalleri (ör. aynı marka farklı kategori) DIŞLAMAZ. Global cap `addDocs`'ta.
      const tierQuery = (where: Prisma.ProductSearchDocumentWhereInput) =>
        prisma.productSearchDocument.findMany({
          where: { ...baseWhere, ...where },
          orderBy: { productCreatedAt: "desc" },
          take: SIMILAR_PER_TIER,
          select: SEARCH_DOC_SELECT,
        }) as Promise<SearchDocRow[]>;

      // Tier 1 — aynı alt kategori (en ilgili).
      if (anchor.primaryCategoryId) {
        addDocs(await tierQuery({ primaryCategoryId: anchor.primaryCategoryId }));
      }
      // Tier 2 — aynı üst kategori (kardeş kategoriler; adjacency-list, path/level yok).
      if (collected.size < cap && anchor.parentCategoryId) {
        const siblings = await prisma.productCategory.findMany({
          where: { storeId, parentId: anchor.parentCategoryId, status: "ACTIVE" },
          select: { id: true },
        });
        const siblingIds = siblings.map((s) => s.id).filter((id) => id !== anchor.primaryCategoryId);
        if (siblingIds.length > 0) addDocs(await tierQuery({ primaryCategoryId: { in: siblingIds } }));
      }
      // Tier 3 — aynı marka + yakın fiyat bandı.
      if (collected.size < cap && anchor.brand) {
        const brandWhere: Prisma.ProductSearchDocumentWhereInput = { brand: anchor.brand };
        if (anchor.priceMinor !== null) {
          brandWhere.minPriceMinor = {
            gte: Math.floor(anchor.priceMinor * PRICE_BAND_LOW),
            lte: Math.ceil(anchor.priceMinor * PRICE_BAND_HIGH),
          };
        }
        addDocs(await tierQuery(brandWhere));
      }
      // Tier 4 — ortak dinamik attribute/facet değeri (ProductFacetValue index'i ile).
      if (collected.size < cap && anchor.attributeKeys.length > 0) {
        const pairs = anchor.attributeKeys
          .map((k) => {
            const idx = k.indexOf(":");
            return idx > 0 ? { attributeDefinitionId: k.slice(0, idx), optionId: k.slice(idx + 1) } : null;
          })
          .filter((p): p is { attributeDefinitionId: string; optionId: string } => p !== null);
        if (pairs.length > 0) {
          const facetRows = await prisma.productFacetValue.findMany({
            where: {
              storeId,
              productId: { not: anchor.productId },
              OR: pairs.map((p) => ({ attributeDefinitionId: p.attributeDefinitionId, optionId: p.optionId })),
            },
            select: { productId: true },
            take: SIMILAR_PER_TIER * 2,
          });
          const facetProductIds = [...new Set(facetRows.map((r) => r.productId))]
            .filter((id) => !collected.has(id))
            .slice(0, SIMILAR_PER_TIER);
          if (facetProductIds.length > 0) addDocs(await tierQuery({ productId: { in: facetProductIds } }));
        }
      }
      // Tier 5 — açıklanabilir genel fallback: yalnız yeterli ilgili aday yoksa store-geneli en yeni.
      if (collected.size < SIMILAR_MIN_TARGET) {
        addDocs(await tierQuery({}));
      }

      const docs = [...collected.values()];
      const cards = new Map<string, SearchDocRow>(docs.map((d) => [d.productId, d]));
      const features = await enrichFeatures(storeId, docs);
      return { features, cards };
    },
  };
}
