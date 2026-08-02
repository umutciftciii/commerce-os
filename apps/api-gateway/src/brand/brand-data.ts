// TODO-165A (ADR-165A) — Product Data Governance: Brand (Marka) prisma veri erisimi.
//
// Tum sorgular store-scoped ({id, storeId}); baska magazanin markasi GORUNMEZ. logoMedia/
// coverMedia storageKey ham tasinir (public URL route katmaninda resolveMediaUrl ile
// turetilir — ProductCategory imageUrl deseniyle ayni, storageKey response'a SIZMAZ).
// productCount Product.brandId FK'sina Prisma relation-count (_count) ile JOIN eder;
// tekil sayim (productCount) ve toplu sayim (productsByBrand) ayri, N+1 uretmeyen yollardir.

import { prisma as defaultPrisma } from "@commerce-os/db";
import type { PrismaClient } from "@prisma/client";
import { recordSlugChange } from "../seo/slug-governance.js";

export type BrandStatus = "ACTIVE" | "ARCHIVED";
export type BrandListSortBy = "name" | "createdAt" | "productCount";
export type BrandSelectorSortBy = "name" | "createdAt";

export interface BrandRecord {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  description: string | null;
  logoMediaId: string | null;
  logoStorageKey: string | null;
  coverMediaId: string | null;
  coverStorageKey: string | null;
  websiteUrl: string | null;
  status: BrandStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  /** Turetilmis (COUNT) — Product.brandId'den; create()'de daima 0. */
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrandListCriteria {
  limit: number;
  offset: number;
  search?: string;
  status?: BrandStatus;
  sortBy?: BrandListSortBy;
  sortOrder?: "asc" | "desc";
}

/** TODO-165A (ADR-165A) Task 15/16 gap — marka "Bağlı ürünler" listesi kriteri. */
export interface BrandProductListCriteria {
  limit: number;
  offset: number;
  search?: string;
}

/** Minimal projeksiyon — coverStorageKey ham tasinir (route katmaninda toPublicMediaUrl ile turetilir). */
export interface BrandProductRecord {
  id: string;
  title: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  /** TEK ornek varyanttan (ilk/en eski) — coklu varyantli urunde de tek bir SKU secilir. */
  sku: string | null;
  coverStorageKey: string | null;
}

/**
 * Secici kriteri: `ids` verildiginde arama/durum/siralama YOK SAYILIR — cozum modu
 * (bkz. ADR-090 desenini mirror eden AdminProductSelectorCriteria).
 */
export interface BrandSelectorCriteria {
  limit: number;
  offset: number;
  search?: string;
  status?: BrandStatus;
  sortBy?: BrandSelectorSortBy;
  sortOrder?: "asc" | "desc";
  ids?: string[];
}

export interface BrandCreateData {
  storeId: string;
  name: string;
  slug: string;
  description: string | null;
  logoMediaId: string | null;
  coverMediaId: string | null;
  websiteUrl: string | null;
  status: BrandStatus;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface BrandUpdateData {
  name?: string;
  slug?: string;
  description?: string | null;
  logoMediaId?: string | null;
  coverMediaId?: string | null;
  websiteUrl?: string | null;
  status?: BrandStatus;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export interface BrandDataAccess {
  list(storeId: string, criteria: BrandListCriteria): Promise<{ data: BrandRecord[]; total: number }>;
  get(storeId: string, id: string): Promise<BrandRecord | null>;
  /** Slug tekillik kontrolu icin (store-scoped `@@unique([storeId, slug])`). */
  findBySlug(storeId: string, slug: string): Promise<BrandRecord | null>;
  create(input: BrandCreateData): Promise<BrandRecord>;
  update(storeId: string, id: string, patch: BrandUpdateData, actorId?: string | null): Promise<BrandRecord>;
  setStatus(storeId: string, id: string, status: BrandStatus): Promise<BrandRecord>;
  /** TODO-159B (ADR-090) desenini mirror eden dual `?ids=` / arama-sayfalama secici. */
  selector(storeId: string, criteria: BrandSelectorCriteria): Promise<{ data: BrandRecord[]; total: number }>;
  /** Tekil marka icin urun sayisi (Product.brandId). */
  productCount(storeId: string, brandId: string): Promise<number>;
  /**
   * TODO-165A (ADR-165A) Task 15/16 gap — marka icin GERCEK (sayfalanmis) urun listesi.
   * Task 6'nin COUNT-ONLY ucunun yerini alir; "Baglı urunler" modalinin veri kaynagidir.
   * Cagiran taraf (route) brandId'nin storeId'ye ait oldugunu ONCE service.get() ile
   * dogrular (cross-store id → 404); bu metod ek bir tenant kontrolu yapmaz (where'de
   * storeId+brandId ikisi de zorlanir, savunma katmani).
   */
  listProducts(
    storeId: string,
    brandId: string,
    criteria: BrandProductListCriteria,
  ): Promise<{ data: BrandProductRecord[]; total: number }>;
  /** Toplu (N+1 uretmeyen) urun sayisi — liste/secici projeksiyonu icin. */
  productsByBrand(storeId: string, brandIds: string[]): Promise<Map<string, number>>;
  /**
   * TODO-165A (ADR-165A) Task 11 — Toplu GORUNUR (status ACTIVE) urun sayisi. `productsByBrand`'den
   * (admin, TUM durumlar) BILINCLI olarak AYRI: public marka listesi/detayi yalniz ACTIVE urunu olan
   * markalari gosterir (loadActivePublicProducts ile ayni "visible" tanimi — status ACTIVE).
   */
  visibleProductCounts(storeId: string, brandIds: string[]): Promise<Map<string, number>>;
  /** logoMediaId/coverMediaId cross-tenant baglama reddi icin (MediaAsset store-scoped). */
  mediaBelongsToStore(storeId: string, mediaId: string): Promise<boolean>;
}

type BrandRow = {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  description: string | null;
  logoMediaId: string | null;
  coverMediaId: string | null;
  websiteUrl: string | null;
  status: string;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
  logoMedia?: { storageKey: string } | null;
  coverMedia?: { storageKey: string } | null;
  _count?: { products: number };
};

function mapBrand(row: BrandRow): BrandRecord {
  return {
    id: row.id,
    storeId: row.storeId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    logoMediaId: row.logoMediaId,
    logoStorageKey: row.logoMedia?.storageKey ?? null,
    coverMediaId: row.coverMediaId,
    coverStorageKey: row.coverMedia?.storageKey ?? null,
    websiteUrl: row.websiteUrl,
    status: row.status as BrandStatus,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    productCount: row._count?.products ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const includeMediaAndCount = {
  logoMedia: { select: { storageKey: true } },
  coverMedia: { select: { storageKey: true } },
  _count: { select: { products: true } },
} as const;

function buildOrderBy(sortBy: string | undefined, sortOrder: "asc" | "desc" | undefined) {
  const order = sortOrder ?? "asc";
  // Allowlist: bilinmeyen/desteklenmeyen deger createdAt'e duser (defensive — zod route
  // katmaninda zaten enum'a kisitlar, burasi ikinci savunma hattidir).
  switch (sortBy) {
    case "name":
      return { name: order } as const;
    case "productCount":
      return { products: { _count: order } } as const;
    case "createdAt":
    default:
      return { createdAt: order } as const;
  }
}

export function createPrismaBrandDataAccess(prisma: PrismaClient = defaultPrisma): BrandDataAccess {
  return {
    async list(storeId, criteria) {
      const where = {
        storeId,
        ...(criteria.status ? { status: criteria.status } : {}),
        ...(criteria.search
          ? {
              OR: [
                { name: { contains: criteria.search, mode: "insensitive" as const } },
                { slug: { contains: criteria.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.brand.findMany({
          where,
          include: includeMediaAndCount,
          orderBy: buildOrderBy(criteria.sortBy, criteria.sortOrder),
          take: criteria.limit,
          skip: criteria.offset,
        }),
        prisma.brand.count({ where }),
      ]);
      return { data: rows.map((r) => mapBrand(r as unknown as BrandRow)), total };
    },

    async get(storeId, id) {
      const row = await prisma.brand.findFirst({
        where: { id, storeId },
        include: includeMediaAndCount,
      });
      return row ? mapBrand(row as unknown as BrandRow) : null;
    },

    async findBySlug(storeId, slug) {
      const row = await prisma.brand.findFirst({
        where: { storeId, slug },
        include: includeMediaAndCount,
      });
      return row ? mapBrand(row as unknown as BrandRow) : null;
    },

    async create(input) {
      const row = await prisma.brand.create({
        data: {
          storeId: input.storeId,
          name: input.name,
          slug: input.slug,
          description: input.description,
          logoMediaId: input.logoMediaId,
          coverMediaId: input.coverMediaId,
          websiteUrl: input.websiteUrl,
          status: input.status,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
        },
        include: includeMediaAndCount,
      });
      return mapBrand(row as unknown as BrandRow);
    },

    async update(storeId, id, patch, actorId) {
      // storeId guard: route/servis zaten get() ile once dogrular; burada id ile update
      // (Prisma composite where gerektirmez, cagiran taraf tenant'i onceden dogruladi).
      const data = {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.logoMediaId !== undefined ? { logoMediaId: patch.logoMediaId } : {}),
        ...(patch.coverMediaId !== undefined ? { coverMediaId: patch.coverMediaId } : {}),
        ...(patch.websiteUrl !== undefined ? { websiteUrl: patch.websiteUrl } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.seoTitle !== undefined ? { seoTitle: patch.seoTitle } : {}),
        ...(patch.seoDescription !== undefined ? { seoDescription: patch.seoDescription } : {}),
      };

      // ADR-265 — Slug DEĞİŞİYORSA: AYNI transaction'da SlugHistory + otomatik 301 redirect yaz
      // (urun/kategori ile simetrik; atomik → history yazilamazsa update de geri alinir). Slug
      // gelmiyorsa (metadata-only patch) transaction'a girmeye gerek yok (mevcut hizli yol).
      if (patch.slug === undefined) {
        const row = await prisma.brand.update({ where: { id }, data, include: includeMediaAndCount });
        void storeId;
        return mapBrand(row as unknown as BrandRow);
      }

      const row = await prisma.$transaction(async (tx) => {
        const existing = await tx.brand.findFirst({ where: { id, storeId }, select: { slug: true } });
        if (existing && patch.slug !== undefined && patch.slug !== existing.slug) {
          await recordSlugChange(tx, {
            storeId,
            entityType: "BRAND",
            entityId: id,
            oldSlug: existing.slug,
            newSlug: patch.slug,
            createdBy: actorId ?? null,
          });
        }
        return tx.brand.update({ where: { id }, data, include: includeMediaAndCount });
      });
      return mapBrand(row as unknown as BrandRow);
    },

    async setStatus(storeId, id, status) {
      const row = await prisma.brand.update({
        where: { id },
        data: { status },
        include: includeMediaAndCount,
      });
      void storeId;
      return mapBrand(row as unknown as BrandRow);
    },

    async selector(storeId, criteria) {
      if (criteria.ids && criteria.ids.length > 0) {
        const rows = await prisma.brand.findMany({
          where: { storeId, id: { in: criteria.ids } },
          include: includeMediaAndCount,
        });
        const byId = new Map(rows.map((r) => [r.id, mapBrand(r as unknown as BrandRow)]));
        // Cagiranin verdigi sirayi koru (secim sirasi UI'da anlamli olabilir).
        const data = criteria.ids
          .map((id) => byId.get(id))
          .filter((b): b is BrandRecord => !!b);
        return { data, total: data.length };
      }
      const where = {
        storeId,
        ...(criteria.status ? { status: criteria.status } : {}),
        ...(criteria.search
          ? {
              OR: [
                { name: { contains: criteria.search, mode: "insensitive" as const } },
                { slug: { contains: criteria.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.brand.findMany({
          where,
          include: includeMediaAndCount,
          orderBy: buildOrderBy(criteria.sortBy, criteria.sortOrder),
          take: criteria.limit,
          skip: criteria.offset,
        }),
        prisma.brand.count({ where }),
      ]);
      return { data: rows.map((r) => mapBrand(r as unknown as BrandRow)), total };
    },

    async productCount(storeId, brandId) {
      return prisma.product.count({ where: { storeId, brandId } });
    },

    async productsByBrand(storeId, brandIds) {
      const map = new Map<string, number>();
      if (brandIds.length === 0) return map;
      const rows = await prisma.product.groupBy({
        by: ["brandId"],
        where: { storeId, brandId: { in: brandIds } },
        _count: { _all: true },
      });
      for (const row of rows) {
        if (row.brandId) map.set(row.brandId, row._count._all);
      }
      // Urunu olmayan markalar 0 ile doldurulur (cagiran taraf Map.get(id) ?? 0 yapmadan
      // dogrudan okuyabilsin diye).
      for (const id of brandIds) {
        if (!map.has(id)) map.set(id, 0);
      }
      return map;
    },

    async visibleProductCounts(storeId, brandIds) {
      const map = new Map<string, number>();
      if (brandIds.length === 0) return map;
      const rows = await prisma.product.groupBy({
        by: ["brandId"],
        where: { storeId, brandId: { in: brandIds }, status: "ACTIVE" },
        _count: { _all: true },
      });
      for (const row of rows) {
        if (row.brandId) map.set(row.brandId, row._count._all);
      }
      for (const id of brandIds) {
        if (!map.has(id)) map.set(id, 0);
      }
      return map;
    },

    async mediaBelongsToStore(storeId, mediaId) {
      const row = await prisma.mediaAsset.findFirst({ where: { id: mediaId, storeId }, select: { id: true } });
      return !!row;
    },

    async listProducts(storeId, brandId, criteria) {
      const where = {
        storeId,
        brandId,
        ...(criteria.search
          ? { title: { contains: criteria.search, mode: "insensitive" as const } }
          : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.product.findMany({
          where,
          orderBy: { createdAt: "desc" as const },
          take: criteria.limit,
          skip: criteria.offset,
          select: {
            id: true,
            title: true,
            status: true,
            variants: {
              orderBy: { createdAt: "asc" as const },
              take: 1,
              select: { sku: true },
            },
          },
        }),
        prisma.product.count({ where }),
      ]);
      if (rows.length === 0) return { data: [], total };

      // Kapak gorselleri TEK batched sorgu (mevcut coverOnly deseni; N+1 yok).
      const covers = await prisma.productImage.findMany({
        where: { storeId, productId: { in: rows.map((row) => row.id) } },
        orderBy: [{ productId: "asc" }, { position: "asc" }],
        distinct: ["productId"],
        select: { productId: true, media: { select: { storageKey: true } } },
      });
      const coverByProduct = new Map(
        covers.map((cover) => [cover.productId, cover.media?.storageKey ?? null]),
      );

      return {
        data: rows.map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status as BrandProductRecord["status"],
          sku: row.variants[0]?.sku ?? null,
          coverStorageKey: coverByProduct.get(row.id) ?? null,
        })),
        total,
      };
    },
  };
}
