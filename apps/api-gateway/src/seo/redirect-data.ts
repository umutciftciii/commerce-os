// TODO-166 (ADR-265) — Admin Slug & Redirect Management veri erişimi (prisma).
//
// Mevcut Redirect / SlugHistory tablolarını YÖNETİR; yeni motor kurmaz. Tüm sorgular
// store-scoped ({storeId, ...}); başka mağazanın kaydı GÖRÜNMEZ (cross-store id → null).
// Redirect kaynağı: origin (AUTOMATIC = slug-değişimi, MANUAL = elle). Slug projeksiyonu
// ürün/kategori/marka güncel slug'ını + SlugHistory'den türeyen "önceki slug" sayısını birleştirir.

import { prisma as defaultPrisma } from "@commerce-os/db";
import { productUrlPath, categoryUrlPath, brandUrlPath } from "@commerce-os/utils";
import type { PrismaClient, Prisma } from "@prisma/client";

export type RedirectTypeValue = "PERMANENT_301" | "FOUND_302" | "TEMPORARY_307" | "PERMANENT_308";
export type RedirectOriginValue = "AUTOMATIC" | "MANUAL";
export type SlugEntityTypeValue = "PRODUCT" | "CATEGORY" | "BRAND";

/** Slug listesinde "tümü" seçildiğinde her tablodan taranacak üst sınır (patolojik derin sayfa koruması). */
export const SLUG_SCAN_LIMIT = 5000;

export interface RedirectRecord {
  id: string;
  storeId: string;
  sourcePath: string;
  targetPath: string;
  type: RedirectTypeValue;
  origin: RedirectOriginValue;
  enabled: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RedirectEntityTypeValue = "PRODUCT" | "CATEGORY" | "BRAND" | "OTHER";

export interface RedirectListCriteria {
  limit: number;
  offset: number;
  search?: string;
  origin?: RedirectOriginValue;
  type?: RedirectTypeValue;
  enabled?: boolean;
  /** Kaynak path şeklinden TÜRETİLEN entity türü (DB'de kolon yok → path deseniyle filtrelenir). */
  entityType?: RedirectEntityTypeValue;
  sortBy?: "createdAt" | "updatedAt" | "sourcePath";
  sortOrder?: "asc" | "desc";
}

/**
 * entityType filtresini kaynak-path deseniyle DB where'ine çevirir (türetilmiş türü sunucu-otoriter
 * ve SAYFALAMA-DOĞRU filtreler; route'ta sayfa-sonrası eleme yapılmaz). redirect-service
 * `redirectEntityType` ile AYNI kurallar: /products/ → PRODUCT, /markalar/ → BRAND, category= → CATEGORY.
 */
function entityTypeWhere(entityType: RedirectEntityTypeValue): Prisma.RedirectWhereInput {
  const product: Prisma.RedirectWhereInput = { sourcePath: { startsWith: "/products/" } };
  const brand: Prisma.RedirectWhereInput = { sourcePath: { startsWith: "/markalar/" } };
  const category: Prisma.RedirectWhereInput = { sourcePath: { contains: "category=" } };
  switch (entityType) {
    case "PRODUCT":
      return product;
    case "BRAND":
      return brand;
    case "CATEGORY":
      return category;
    case "OTHER":
      return { NOT: [product, brand, category] };
  }
}

export interface RedirectCreateData {
  storeId: string;
  sourcePath: string;
  targetPath: string;
  type: RedirectTypeValue;
  origin: RedirectOriginValue;
  enabled: boolean;
  notes: string | null;
}

export interface RedirectUpdateData {
  sourcePath?: string;
  targetPath?: string;
  type?: RedirectTypeValue;
  enabled?: boolean;
  notes?: string | null;
}

/** Store'un TÜM redirect kuralları (SAF resolver + loop kontrolü için minimal projeksiyon). */
export interface RedirectRuleRow {
  source: string;
  target: string;
  type: RedirectTypeValue;
  enabled: boolean;
}

export interface SlugRecordRow {
  entityType: SlugEntityTypeValue;
  entityId: string;
  name: string;
  slug: string;
  canonicalUrl: string;
  status: string;
  previousSlugCount: number;
  redirectCount: number;
  updatedAt: Date;
}

export interface SlugHistoryRow {
  oldSlug: string;
  oldPath: string;
  createdAt: Date;
}

export interface SlugListCriteria {
  limit: number;
  offset: number;
  search?: string;
  entityType?: SlugEntityTypeValue;
  status?: "active" | "archived";
  hasRedirects?: boolean;
  sortBy?: "updatedAt" | "slug" | "name";
  sortOrder?: "asc" | "desc";
}

export interface RedirectDataAccess {
  list(storeId: string, criteria: RedirectListCriteria): Promise<{ data: RedirectRecord[]; total: number }>;
  get(storeId: string, id: string): Promise<RedirectRecord | null>;
  findBySource(storeId: string, sourcePath: string): Promise<RedirectRecord | null>;
  create(input: RedirectCreateData): Promise<RedirectRecord>;
  update(storeId: string, id: string, patch: RedirectUpdateData): Promise<RedirectRecord | null>;
  remove(storeId: string, id: string): Promise<boolean>;
  /** Store'un tüm kuralları (loop kontrolü + zincir çözümü). */
  allRules(storeId: string): Promise<RedirectRuleRow[]>;
  /** Canlı ürün slug'ı var mı (manuel redirect kaynağı canlı sayfayı gölgelememeli). */
  productSlugExists(storeId: string, slug: string): Promise<boolean>;
  /** Canlı marka slug'ı var mı. */
  brandSlugExists(storeId: string, slug: string): Promise<boolean>;
  listSlugRecords(storeId: string, criteria: SlugListCriteria): Promise<{ data: SlugRecordRow[]; total: number }>;
  getSlugRecord(
    storeId: string,
    entityType: SlugEntityTypeValue,
    entityId: string,
  ): Promise<SlugRecordRow | null>;
  slugHistory(
    storeId: string,
    entityType: SlugEntityTypeValue,
    entityId: string,
  ): Promise<SlugHistoryRow[]>;
}

const redirectSelect = {
  id: true,
  storeId: true,
  sourcePath: true,
  targetPath: true,
  type: true,
  origin: true,
  enabled: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RedirectSelect;

function canonicalUrlFor(entityType: SlugEntityTypeValue, slug: string): string {
  switch (entityType) {
    case "PRODUCT":
      return productUrlPath(slug);
    case "CATEGORY":
      return categoryUrlPath(slug);
    case "BRAND":
      return brandUrlPath(slug);
  }
}

export function createPrismaRedirectDataAccess(prisma: PrismaClient = defaultPrisma): RedirectDataAccess {
  function mapRedirect(row: {
    id: string;
    storeId: string;
    sourcePath: string;
    targetPath: string;
    type: string;
    origin: string;
    enabled: boolean;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): RedirectRecord {
    return {
      id: row.id,
      storeId: row.storeId,
      sourcePath: row.sourcePath,
      targetPath: row.targetPath,
      type: row.type as RedirectTypeValue,
      origin: row.origin as RedirectOriginValue,
      enabled: row.enabled,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** SlugHistory'den entity-başı "önceki slug" sayıları (store-scoped groupBy). */
  async function historyCountMap(storeId: string): Promise<Map<string, number>> {
    const groups = await prisma.slugHistory.groupBy({
      by: ["entityType", "entityId"],
      where: { storeId },
      _count: { _all: true },
    });
    const map = new Map<string, number>();
    for (const g of groups) map.set(`${g.entityType}:${g.entityId}`, g._count._all);
    return map;
  }

  return {
    async list(storeId, criteria) {
      const where: Prisma.RedirectWhereInput = { storeId };
      if (criteria.origin) where.origin = criteria.origin;
      if (criteria.type) where.type = criteria.type;
      if (criteria.enabled !== undefined) where.enabled = criteria.enabled;
      const andClauses: Prisma.RedirectWhereInput[] = [];
      if (criteria.entityType) andClauses.push(entityTypeWhere(criteria.entityType));
      if (criteria.search) {
        const q = criteria.search;
        andClauses.push({
          OR: [
            { sourcePath: { contains: q, mode: "insensitive" } },
            { targetPath: { contains: q, mode: "insensitive" } },
            { notes: { contains: q, mode: "insensitive" } },
          ],
        });
      }
      if (andClauses.length > 0) where.AND = andClauses;
      const sortBy = criteria.sortBy ?? "createdAt";
      const sortOrder = criteria.sortOrder ?? "desc";
      const [rows, total] = await Promise.all([
        prisma.redirect.findMany({
          where,
          select: redirectSelect,
          orderBy: { [sortBy]: sortOrder },
          skip: criteria.offset,
          take: criteria.limit,
        }),
        prisma.redirect.count({ where }),
      ]);
      return { data: rows.map(mapRedirect), total };
    },

    async get(storeId, id) {
      const row = await prisma.redirect.findFirst({ where: { id, storeId }, select: redirectSelect });
      return row ? mapRedirect(row) : null;
    },

    async findBySource(storeId, sourcePath) {
      const row = await prisma.redirect.findFirst({ where: { storeId, sourcePath }, select: redirectSelect });
      return row ? mapRedirect(row) : null;
    },

    async create(input) {
      const row = await prisma.redirect.create({
        data: {
          storeId: input.storeId,
          sourcePath: input.sourcePath,
          targetPath: input.targetPath,
          type: input.type,
          origin: input.origin,
          enabled: input.enabled,
          notes: input.notes,
        },
        select: redirectSelect,
      });
      return mapRedirect(row);
    },

    async update(storeId, id, patch) {
      const existing = await prisma.redirect.findFirst({ where: { id, storeId }, select: { id: true } });
      if (!existing) return null;
      const row = await prisma.redirect.update({
        where: { id },
        data: {
          ...(patch.sourcePath !== undefined ? { sourcePath: patch.sourcePath } : {}),
          ...(patch.targetPath !== undefined ? { targetPath: patch.targetPath } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        },
        select: redirectSelect,
      });
      return mapRedirect(row);
    },

    async remove(storeId, id) {
      const existing = await prisma.redirect.findFirst({ where: { id, storeId }, select: { id: true } });
      if (!existing) return false;
      await prisma.redirect.delete({ where: { id } });
      return true;
    },

    async allRules(storeId) {
      const rows = await prisma.redirect.findMany({
        where: { storeId },
        select: { sourcePath: true, targetPath: true, type: true, enabled: true },
      });
      return rows.map((r) => ({
        source: r.sourcePath,
        target: r.targetPath,
        type: r.type as RedirectTypeValue,
        enabled: r.enabled,
      }));
    },

    async productSlugExists(storeId, slug) {
      const row = await prisma.product.findFirst({ where: { storeId, slug }, select: { id: true } });
      return row !== null;
    },

    async brandSlugExists(storeId, slug) {
      const row = await prisma.brand.findFirst({ where: { storeId, slug }, select: { id: true } });
      return row !== null;
    },

    async listSlugRecords(storeId, criteria) {
      const types: SlugEntityTypeValue[] = criteria.entityType
        ? [criteria.entityType]
        : ["PRODUCT", "CATEGORY", "BRAND"];
      const historyMap = await historyCountMap(storeId);

      // hasRedirects filtresi: SlugHistory'ye sahip entity id kümesi (tür bazlı).
      const idsWithHistory = (type: SlugEntityTypeValue): string[] => {
        const ids: string[] = [];
        for (const key of historyMap.keys()) {
          const [t, id] = key.split(":");
          if (t === type) ids.push(id);
        }
        return ids;
      };

      const statusValue = criteria.status === "archived" ? "ARCHIVED" : undefined;
      const notArchived = criteria.status === "active" ? { not: "ARCHIVED" as const } : undefined;

      interface RawRow {
        entityType: SlugEntityTypeValue;
        entityId: string;
        name: string;
        slug: string;
        status: string;
        updatedAt: Date;
      }

      const scanTake = criteria.offset + criteria.limit; // birleşik sayfa için ilk N satır yeterli.
      const collected: RawRow[] = [];
      let total = 0;

      for (const type of types) {
        // hasRedirects: true → yalnız geçmişi olanlar; false → geçmişi olmayanlar.
        let idFilter: Prisma.StringFilter | undefined;
        if (criteria.hasRedirects === true) {
          idFilter = { in: idsWithHistory(type) };
        } else if (criteria.hasRedirects === false) {
          const ids = idsWithHistory(type);
          if (ids.length > 0) idFilter = { notIn: ids };
        }

        const searchOr = criteria.search
          ? [
              { slug: { contains: criteria.search, mode: "insensitive" as const } },
              type === "PRODUCT"
                ? { title: { contains: criteria.search, mode: "insensitive" as const } }
                : { name: { contains: criteria.search, mode: "insensitive" as const } },
            ]
          : undefined;

        const statusWhere = statusValue
          ? { status: statusValue }
          : notArchived
            ? { status: notArchived }
            : {};

        const commonWhere = {
          storeId,
          ...(idFilter ? { id: idFilter } : {}),
          ...(searchOr ? { OR: searchOr } : {}),
          ...statusWhere,
        };

        const orderBy =
          criteria.sortBy === "slug"
            ? { slug: criteria.sortOrder ?? "asc" }
            : criteria.sortBy === "name"
              ? type === "PRODUCT"
                ? { title: criteria.sortOrder ?? "asc" }
                : { name: criteria.sortOrder ?? "asc" }
              : { updatedAt: criteria.sortOrder ?? "desc" };

        if (type === "PRODUCT") {
          const [rows, count] = await Promise.all([
            prisma.product.findMany({
              where: commonWhere as Prisma.ProductWhereInput,
              select: { id: true, title: true, slug: true, status: true, updatedAt: true },
              orderBy: orderBy as Prisma.ProductOrderByWithRelationInput,
              take: Math.min(scanTake, SLUG_SCAN_LIMIT),
            }),
            prisma.product.count({ where: commonWhere as Prisma.ProductWhereInput }),
          ]);
          total += count;
          for (const r of rows)
            collected.push({
              entityType: "PRODUCT",
              entityId: r.id,
              name: r.title,
              slug: r.slug,
              status: r.status,
              updatedAt: r.updatedAt,
            });
        } else if (type === "CATEGORY") {
          const [rows, count] = await Promise.all([
            prisma.productCategory.findMany({
              where: commonWhere as Prisma.ProductCategoryWhereInput,
              select: { id: true, name: true, slug: true, status: true, updatedAt: true },
              orderBy: orderBy as Prisma.ProductCategoryOrderByWithRelationInput,
              take: Math.min(scanTake, SLUG_SCAN_LIMIT),
            }),
            prisma.productCategory.count({ where: commonWhere as Prisma.ProductCategoryWhereInput }),
          ]);
          total += count;
          for (const r of rows)
            collected.push({
              entityType: "CATEGORY",
              entityId: r.id,
              name: r.name,
              slug: r.slug,
              status: r.status,
              updatedAt: r.updatedAt,
            });
        } else {
          const [rows, count] = await Promise.all([
            prisma.brand.findMany({
              where: commonWhere as Prisma.BrandWhereInput,
              select: { id: true, name: true, slug: true, status: true, updatedAt: true },
              orderBy: orderBy as Prisma.BrandOrderByWithRelationInput,
              take: Math.min(scanTake, SLUG_SCAN_LIMIT),
            }),
            prisma.brand.count({ where: commonWhere as Prisma.BrandWhereInput }),
          ]);
          total += count;
          for (const r of rows)
            collected.push({
              entityType: "BRAND",
              entityId: r.id,
              name: r.name,
              slug: r.slug,
              status: r.status,
              updatedAt: r.updatedAt,
            });
        }
      }

      // Birleşik sıralama (aynı ölçüt) + sayfa dilimi.
      const dir = criteria.sortOrder ?? (criteria.sortBy ? "asc" : "desc");
      const cmp = (a: RawRow, b: RawRow): number => {
        let res: number;
        if (criteria.sortBy === "slug") res = a.slug.localeCompare(b.slug);
        else if (criteria.sortBy === "name") res = a.name.localeCompare(b.name);
        else res = a.updatedAt.getTime() - b.updatedAt.getTime();
        return dir === "asc" ? res : -res;
      };
      collected.sort(cmp);
      const page = collected.slice(criteria.offset, criteria.offset + criteria.limit);

      return {
        data: page.map((r) => {
          const count = historyMap.get(`${r.entityType}:${r.entityId}`) ?? 0;
          return {
            entityType: r.entityType,
            entityId: r.entityId,
            name: r.name,
            slug: r.slug,
            canonicalUrl: canonicalUrlFor(r.entityType, r.slug),
            status: r.status,
            previousSlugCount: count,
            redirectCount: count,
            updatedAt: r.updatedAt,
          };
        }),
        total,
      };
    },

    async getSlugRecord(storeId, entityType, entityId) {
      const count = await prisma.slugHistory.count({ where: { storeId, entityType, entityId } });
      if (entityType === "PRODUCT") {
        const row = await prisma.product.findFirst({
          where: { id: entityId, storeId },
          select: { id: true, title: true, slug: true, status: true, updatedAt: true },
        });
        if (!row) return null;
        return {
          entityType,
          entityId: row.id,
          name: row.title,
          slug: row.slug,
          canonicalUrl: canonicalUrlFor(entityType, row.slug),
          status: row.status,
          previousSlugCount: count,
          redirectCount: count,
          updatedAt: row.updatedAt,
        };
      }
      if (entityType === "CATEGORY") {
        const row = await prisma.productCategory.findFirst({
          where: { id: entityId, storeId },
          select: { id: true, name: true, slug: true, status: true, updatedAt: true },
        });
        if (!row) return null;
        return {
          entityType,
          entityId: row.id,
          name: row.name,
          slug: row.slug,
          canonicalUrl: canonicalUrlFor(entityType, row.slug),
          status: row.status,
          previousSlugCount: count,
          redirectCount: count,
          updatedAt: row.updatedAt,
        };
      }
      const row = await prisma.brand.findFirst({
        where: { id: entityId, storeId },
        select: { id: true, name: true, slug: true, status: true, updatedAt: true },
      });
      if (!row) return null;
      return {
        entityType,
        entityId: row.id,
        name: row.name,
        slug: row.slug,
        canonicalUrl: canonicalUrlFor(entityType, row.slug),
        status: row.status,
        previousSlugCount: count,
        redirectCount: count,
        updatedAt: row.updatedAt,
      };
    },

    async slugHistory(storeId, entityType, entityId) {
      const rows = await prisma.slugHistory.findMany({
        where: { storeId, entityType, entityId },
        select: { oldSlug: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((r) => ({
        oldSlug: r.oldSlug,
        oldPath: canonicalUrlFor(entityType, r.oldSlug),
        createdAt: r.createdAt,
      }));
    },
  };
}
