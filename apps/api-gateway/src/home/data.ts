/**
 * TODO-158A (ADR-086) — Home Experience Platform veri erişimi.
 *
 * Yönetilebilir ana sayfa "section" altyapısının tek veri erişim otoritesi. Mevcut
 * store-scoped HeroSlide/StoreSettings (ADR-065) DOKUNULMAZ — bu katman tümüyle
 * ADDITIVE ve geriye-uyumludur.
 *
 * Mimari:
 *  - HomeSection POLYMORPHIC kök: `type` bir DB enum DEĞİL String'tir + tip-özel veri
 *    `config` (Json) + ilişkisel çocuk tablolardadır. Yeni tip = migration'sız.
 *  - Üç somut tip: HERO_SLIDER (HomeHeroSlide), FEATURED_CATEGORIES (HomeFeaturedCategory),
 *    PRODUCT_SHOWCASE (MANUAL: HomeShowcaseProduct; DYNAMIC: config.source kuralı,
 *    render-zamanı canlı katalogtan çözülür).
 *  - Tüm sorgular store-scoped; başka mağazanın section'ı GÖRÜNMEZ (404). HomePage
 *    aggregate kökü yazımdan önce lazy upsert edilir (StoreSettings deseni).
 *
 * Public çözüm (`buildPublicHome`) yalnız yayın penceresi geçerli + enabled içerikleri
 * döner; DRAFT/kapalı/pencere-dışı içerik DB seviyesinde elenir. Product projeksiyonu
 * server.ts'in mevcut `buildPublicProduct` otoritesine bırakılır (bu katman yalnız
 * ORDERED product id listesi üretir) — allowlist ve fiyat/rozet tutarlılığı korunur.
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import {
  homeSectionSchema,
  homeHeroSlideSchema,
  homeFeaturedCategorySchema,
  homeShowcaseProductSchema,
  homeShowcaseConfigSchema,
  homeHeroConfigSchema,
  publicHomeHeroSlideSchema,
  publicHomeFeaturedCategorySchema,
  type HomeSectionType,
  type HomeShowcaseRule,
} from "@commerce-os/contracts";
import { resolveMediaUrl } from "../media/url.js";

// ─────────────────────────── Kayıt tipleri (Prisma select projeksiyonları) ───────────────────────────

export type HomeSectionRecord = {
  id: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  enabled: boolean;
  sortOrder: number;
  desktopVisible: boolean;
  mobileVisible: boolean;
  publishStart: Date | null;
  publishEnd: Date | null;
  config: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

const homeSectionSelect = {
  id: true,
  type: true,
  title: true,
  subtitle: true,
  enabled: true,
  sortOrder: true,
  desktopVisible: true,
  mobileVisible: true,
  publishStart: true,
  publishEnd: true,
  config: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.HomeSectionSelect;

export type HomeHeroSlideRecord = {
  id: string;
  sectionId: string;
  mediaId: string;
  mobileMediaId: string | null;
  videoUrl: string | null;
  headline: string | null;
  subtext: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  targetProductId: string | null;
  targetCategoryId: string | null;
  targetCampaignId: string | null;
  enabled: boolean;
  sortOrder: number;
  publishStart: Date | null;
  publishEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
  media: { storageKey: string };
  mobileMedia: { storageKey: string } | null;
};

const homeHeroSlideSelect = {
  id: true,
  sectionId: true,
  mediaId: true,
  mobileMediaId: true,
  videoUrl: true,
  headline: true,
  subtext: true,
  ctaLabel: true,
  ctaHref: true,
  targetProductId: true,
  targetCategoryId: true,
  targetCampaignId: true,
  enabled: true,
  sortOrder: true,
  publishStart: true,
  publishEnd: true,
  createdAt: true,
  updatedAt: true,
  media: { select: { storageKey: true } },
  mobileMedia: { select: { storageKey: true } },
} satisfies Prisma.HomeHeroSlideSelect;

export type HomeFeaturedCategoryRecord = {
  id: string;
  sectionId: string;
  categoryId: string;
  imageMediaId: string | null;
  titleOverride: string | null;
  descriptionOverride: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  category: { slug: string; name: string; status: string; image: { storageKey: string } | null };
  image: { storageKey: string } | null;
};

const homeFeaturedCategorySelect = {
  id: true,
  sectionId: true,
  categoryId: true,
  imageMediaId: true,
  titleOverride: true,
  descriptionOverride: true,
  enabled: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: { slug: true, name: true, status: true, image: { select: { storageKey: true } } },
  },
  image: { select: { storageKey: true } },
} satisfies Prisma.HomeFeaturedCategorySelect;

export type HomeShowcaseProductRecord = {
  id: string;
  sectionId: string;
  productId: string;
  sortOrder: number;
  product: { title: string; slug: string; status: string };
};

const homeShowcaseProductSelect = {
  id: true,
  sectionId: true,
  productId: true,
  sortOrder: true,
  product: { select: { title: true, slug: true, status: true } },
} satisfies Prisma.HomeShowcaseProductSelect;

// ─────────────────────────── Girdi tipleri (route katmanınca normalize edilmiş) ───────────────────────────

export interface HomeSectionCreateInput {
  type: HomeSectionType;
  title?: string | null;
  subtitle?: string | null;
  enabled?: boolean;
  desktopVisible?: boolean;
  mobileVisible?: boolean;
  publishStart?: Date | null;
  publishEnd?: Date | null;
  // Route katmanı tip-özel şema ile doğrulanmış config'i geçer (opaque obje); DB'ye JSON yazılır.
  config: Record<string, unknown>;
}

export interface HomeSectionUpdateInput {
  title?: string | null;
  subtitle?: string | null;
  enabled?: boolean;
  desktopVisible?: boolean;
  mobileVisible?: boolean;
  publishStart?: Date | null;
  publishEnd?: Date | null;
  config?: Record<string, unknown>;
}

export interface HomeHeroSlideWriteInput {
  mediaId?: string;
  mobileMediaId?: string | null;
  videoUrl?: string | null;
  headline?: string | null;
  subtext?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  targetProductId?: string | null;
  targetCategoryId?: string | null;
  targetCampaignId?: string | null;
  enabled?: boolean;
  publishStart?: Date | null;
  publishEnd?: Date | null;
}

export interface HomeFeaturedCategoryWriteInput {
  categoryId?: string;
  imageMediaId?: string | null;
  titleOverride?: string | null;
  descriptionOverride?: string | null;
  enabled?: boolean;
}

// ─────────────────────────── Veri erişim arayüzü ───────────────────────────

export interface HomeDataAccess {
  // — Section CRUD —
  listSections(storeId: string): Promise<HomeSectionRecord[]>;
  findSection(storeId: string, sectionId: string): Promise<HomeSectionRecord | null>;
  createSection(storeId: string, input: HomeSectionCreateInput): Promise<HomeSectionRecord>;
  updateSection(
    storeId: string,
    sectionId: string,
    input: HomeSectionUpdateInput,
  ): Promise<HomeSectionRecord | null>;
  deleteSection(storeId: string, sectionId: string): Promise<boolean>;
  reorderSections(storeId: string, orderedIds: string[]): Promise<HomeSectionRecord[] | "MISMATCH">;

  // — Doğrulama yardımcıları (server-authoritative; FK yerine) —
  findMediaAssetById(storeId: string, mediaId: string): Promise<{ id: string; context: string } | null>;
  categoryExists(storeId: string, categoryId: string): Promise<boolean>;
  productExists(storeId: string, productId: string): Promise<boolean>;
  campaignExists(storeId: string, campaignId: string): Promise<boolean>;

  // — Hero slide (section-scoped) —
  listHeroSlides(storeId: string, sectionId: string): Promise<HomeHeroSlideRecord[]>;
  createHeroSlide(
    storeId: string,
    sectionId: string,
    input: HomeHeroSlideWriteInput & { mediaId: string },
  ): Promise<HomeHeroSlideRecord>;
  updateHeroSlide(
    storeId: string,
    sectionId: string,
    id: string,
    input: HomeHeroSlideWriteInput,
  ): Promise<HomeHeroSlideRecord | null>;
  deleteHeroSlide(storeId: string, sectionId: string, id: string): Promise<boolean>;
  reorderHeroSlides(
    storeId: string,
    sectionId: string,
    orderedIds: string[],
  ): Promise<HomeHeroSlideRecord[] | "MISMATCH">;

  // — Featured kategori (section-scoped) —
  listFeaturedCategories(storeId: string, sectionId: string): Promise<HomeFeaturedCategoryRecord[]>;
  createFeaturedCategory(
    storeId: string,
    sectionId: string,
    input: HomeFeaturedCategoryWriteInput & { categoryId: string },
  ): Promise<HomeFeaturedCategoryRecord | "DUPLICATE">;
  updateFeaturedCategory(
    storeId: string,
    sectionId: string,
    id: string,
    input: HomeFeaturedCategoryWriteInput,
  ): Promise<HomeFeaturedCategoryRecord | null>;
  deleteFeaturedCategory(storeId: string, sectionId: string, id: string): Promise<boolean>;
  reorderFeaturedCategories(
    storeId: string,
    sectionId: string,
    orderedIds: string[],
  ): Promise<HomeFeaturedCategoryRecord[] | "MISMATCH">;

  // — Showcase manuel ürünler (section-scoped, replace-set) —
  listShowcaseProducts(storeId: string, sectionId: string): Promise<HomeShowcaseProductRecord[]>;
  setShowcaseProducts(
    storeId: string,
    sectionId: string,
    productIds: string[],
  ): Promise<HomeShowcaseProductRecord[] | "INVALID_PRODUCT">;

  // — Public composed okuma —
  listPublishedSections(storeId: string, now: Date): Promise<HomeSectionRecord[]>;
  listPublishedHeroSlides(storeId: string, sectionId: string, now: Date): Promise<HomeHeroSlideRecord[]>;
  listPublishedFeaturedCategories(
    storeId: string,
    sectionId: string,
  ): Promise<HomeFeaturedCategoryRecord[]>;
  listShowcaseProductIds(storeId: string, sectionId: string): Promise<string[]>;
  resolveDynamicShowcaseProductIds(
    storeId: string,
    rule: HomeShowcaseRule,
    params: DynamicShowcaseParams,
    now: Date,
  ): Promise<string[]>;
}

export interface DynamicShowcaseParams {
  categorySlug?: string;
  brand?: string;
  attributeCode?: string;
  attributeValue?: string;
}

// Yayın penceresi WHERE parçası (enabled + start<=now + (end null | end>now)).
function publishedWhere(now: Date) {
  return {
    enabled: true,
    AND: [
      { OR: [{ publishStart: null }, { publishStart: { lte: now } }] },
      { OR: [{ publishEnd: null }, { publishEnd: { gt: now } }] },
    ],
  };
}

export function createPrismaHomeDataAccess(): HomeDataAccess {
  // HomeSection yazımından önce HomePage (aggregate kökü) lazy upsert edilir.
  async function ensureHomePage(storeId: string): Promise<void> {
    await prisma.homePage.upsert({ where: { storeId }, create: { storeId }, update: {} });
  }

  return {
    listSections: (storeId) =>
      prisma.homeSection.findMany({
        where: { storeId },
        orderBy: { sortOrder: "asc" },
        select: homeSectionSelect,
      }),

    findSection: (storeId, sectionId) =>
      prisma.homeSection.findFirst({ where: { id: sectionId, storeId }, select: homeSectionSelect }),

    createSection: async (storeId, input) => {
      await ensureHomePage(storeId);
      return prisma.$transaction(async (tx) => {
        const max = await tx.homeSection.aggregate({ where: { storeId }, _max: { sortOrder: true } });
        return tx.homeSection.create({
          data: {
            storeId,
            type: input.type,
            title: input.title ?? null,
            subtitle: input.subtitle ?? null,
            enabled: input.enabled ?? true,
            desktopVisible: input.desktopVisible ?? true,
            mobileVisible: input.mobileVisible ?? true,
            publishStart: input.publishStart ?? null,
            publishEnd: input.publishEnd ?? null,
            sortOrder: (max._max.sortOrder ?? -1) + 1,
            config: input.config as Prisma.InputJsonValue,
          },
          select: homeSectionSelect,
        });
      });
    },

    updateSection: async (storeId, sectionId, input) => {
      try {
        // config verilmişse InputJsonValue'ya çevir; diğer alanlar doğrudan geçer.
        const { config, ...rest } = input;
        return await prisma.homeSection.update({
          where: { id: sectionId, storeId },
          data: {
            ...rest,
            ...(config !== undefined ? { config: config as Prisma.InputJsonValue } : {}),
          },
          select: homeSectionSelect,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
        throw error;
      }
    },

    deleteSection: async (storeId, sectionId) => {
      try {
        await prisma.homeSection.delete({ where: { id: sectionId, storeId } });
        return true;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return false;
        throw error;
      }
    },

    reorderSections: (storeId, orderedIds) =>
      prisma.$transaction(async (tx) => {
        const existing = await tx.homeSection.findMany({ where: { storeId }, select: { id: true } });
        const ids = new Set(existing.map((s) => s.id));
        if (orderedIds.length !== ids.size || !orderedIds.every((id) => ids.has(id))) {
          return "MISMATCH" as const;
        }
        for (const [index, id] of orderedIds.entries()) {
          await tx.homeSection.update({ where: { id }, data: { sortOrder: index }, select: { id: true } });
        }
        return tx.homeSection.findMany({
          where: { storeId },
          orderBy: { sortOrder: "asc" },
          select: homeSectionSelect,
        });
      }),

    findMediaAssetById: (storeId, mediaId) =>
      prisma.mediaAsset.findFirst({ where: { id: mediaId, storeId }, select: { id: true, context: true } }),

    categoryExists: async (storeId, categoryId) =>
      (await prisma.productCategory.count({ where: { id: categoryId, storeId } })) > 0,

    productExists: async (storeId, productId) =>
      (await prisma.product.count({ where: { id: productId, storeId } })) > 0,

    campaignExists: async (storeId, campaignId) =>
      (await prisma.campaign.count({ where: { id: campaignId, storeId } })) > 0,

    // — Hero slide —
    listHeroSlides: (storeId, sectionId) =>
      prisma.homeHeroSlide.findMany({
        where: { storeId, sectionId },
        orderBy: { sortOrder: "asc" },
        select: homeHeroSlideSelect,
      }),

    createHeroSlide: (storeId, sectionId, input) =>
      prisma.$transaction(async (tx) => {
        const max = await tx.homeHeroSlide.aggregate({
          where: { storeId, sectionId },
          _max: { sortOrder: true },
        });
        return tx.homeHeroSlide.create({
          data: {
            storeId,
            sectionId,
            mediaId: input.mediaId,
            mobileMediaId: input.mobileMediaId ?? null,
            videoUrl: input.videoUrl ?? null,
            headline: input.headline ?? null,
            subtext: input.subtext ?? null,
            ctaLabel: input.ctaLabel ?? null,
            ctaHref: input.ctaHref ?? null,
            targetProductId: input.targetProductId ?? null,
            targetCategoryId: input.targetCategoryId ?? null,
            targetCampaignId: input.targetCampaignId ?? null,
            enabled: input.enabled ?? true,
            publishStart: input.publishStart ?? null,
            publishEnd: input.publishEnd ?? null,
            sortOrder: (max._max.sortOrder ?? -1) + 1,
          },
          select: homeHeroSlideSelect,
        });
      }),

    updateHeroSlide: async (storeId, sectionId, id, input) => {
      // updateMany ({id, sectionId, storeId}) tenant+section izolasyonu; 0 satır → null.
      const result = await prisma.homeHeroSlide.updateMany({
        where: { id, sectionId, storeId },
        data: input,
      });
      if (result.count === 0) return null;
      return prisma.homeHeroSlide.findFirst({ where: { id, storeId }, select: homeHeroSlideSelect });
    },

    deleteHeroSlide: async (storeId, sectionId, id) => {
      const result = await prisma.homeHeroSlide.deleteMany({ where: { id, sectionId, storeId } });
      return result.count > 0;
    },

    reorderHeroSlides: (storeId, sectionId, orderedIds) =>
      prisma.$transaction(async (tx) => {
        const existing = await tx.homeHeroSlide.findMany({
          where: { storeId, sectionId },
          select: { id: true },
        });
        const ids = new Set(existing.map((s) => s.id));
        if (orderedIds.length !== ids.size || !orderedIds.every((id) => ids.has(id))) {
          return "MISMATCH" as const;
        }
        for (const [index, id] of orderedIds.entries()) {
          await tx.homeHeroSlide.update({ where: { id }, data: { sortOrder: index }, select: { id: true } });
        }
        return tx.homeHeroSlide.findMany({
          where: { storeId, sectionId },
          orderBy: { sortOrder: "asc" },
          select: homeHeroSlideSelect,
        });
      }),

    // — Featured kategori —
    listFeaturedCategories: (storeId, sectionId) =>
      prisma.homeFeaturedCategory.findMany({
        where: { storeId, sectionId },
        orderBy: { sortOrder: "asc" },
        select: homeFeaturedCategorySelect,
      }),

    createFeaturedCategory: async (storeId, sectionId, input) => {
      try {
        return await prisma.$transaction(async (tx) => {
          const max = await tx.homeFeaturedCategory.aggregate({
            where: { storeId, sectionId },
            _max: { sortOrder: true },
          });
          return tx.homeFeaturedCategory.create({
            data: {
              storeId,
              sectionId,
              categoryId: input.categoryId,
              imageMediaId: input.imageMediaId ?? null,
              titleOverride: input.titleOverride ?? null,
              descriptionOverride: input.descriptionOverride ?? null,
              enabled: input.enabled ?? true,
              sortOrder: (max._max.sortOrder ?? -1) + 1,
            },
            select: homeFeaturedCategorySelect,
          });
        });
      } catch (error) {
        // @@unique([sectionId, categoryId]) ihlali → aynı kategori zaten öne çıkarılmış.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return "DUPLICATE" as const;
        }
        throw error;
      }
    },

    updateFeaturedCategory: async (storeId, sectionId, id, input) => {
      const result = await prisma.homeFeaturedCategory.updateMany({
        where: { id, sectionId, storeId },
        data: input,
      });
      if (result.count === 0) return null;
      return prisma.homeFeaturedCategory.findFirst({
        where: { id, storeId },
        select: homeFeaturedCategorySelect,
      });
    },

    deleteFeaturedCategory: async (storeId, sectionId, id) => {
      const result = await prisma.homeFeaturedCategory.deleteMany({ where: { id, sectionId, storeId } });
      return result.count > 0;
    },

    reorderFeaturedCategories: (storeId, sectionId, orderedIds) =>
      prisma.$transaction(async (tx) => {
        const existing = await tx.homeFeaturedCategory.findMany({
          where: { storeId, sectionId },
          select: { id: true },
        });
        const ids = new Set(existing.map((s) => s.id));
        if (orderedIds.length !== ids.size || !orderedIds.every((id) => ids.has(id))) {
          return "MISMATCH" as const;
        }
        for (const [index, id] of orderedIds.entries()) {
          await tx.homeFeaturedCategory.update({
            where: { id },
            data: { sortOrder: index },
            select: { id: true },
          });
        }
        return tx.homeFeaturedCategory.findMany({
          where: { storeId, sectionId },
          orderBy: { sortOrder: "asc" },
          select: homeFeaturedCategorySelect,
        });
      }),

    // — Showcase manuel ürünler (replace-set) —
    listShowcaseProducts: (storeId, sectionId) =>
      prisma.homeShowcaseProduct.findMany({
        where: { storeId, sectionId },
        orderBy: { sortOrder: "asc" },
        select: homeShowcaseProductSelect,
      }),

    setShowcaseProducts: async (storeId, sectionId, productIds) => {
      // Tüm ürünler mağazaya ait mi? Değilse INVALID_PRODUCT (hiç yazma yapmadan).
      if (productIds.length > 0) {
        const count = await prisma.product.count({ where: { storeId, id: { in: productIds } } });
        if (count !== productIds.length) return "INVALID_PRODUCT" as const;
      }
      return prisma.$transaction(async (tx) => {
        await tx.homeShowcaseProduct.deleteMany({ where: { storeId, sectionId } });
        if (productIds.length > 0) {
          await tx.homeShowcaseProduct.createMany({
            data: productIds.map((productId, index) => ({
              storeId,
              sectionId,
              productId,
              sortOrder: index,
            })),
          });
        }
        return tx.homeShowcaseProduct.findMany({
          where: { storeId, sectionId },
          orderBy: { sortOrder: "asc" },
          select: homeShowcaseProductSelect,
        });
      });
    },

    // — Public composed okuma —
    listPublishedSections: (storeId, now) =>
      prisma.homeSection.findMany({
        where: { storeId, ...publishedWhere(now) },
        orderBy: { sortOrder: "asc" },
        select: homeSectionSelect,
      }),

    listPublishedHeroSlides: (storeId, sectionId, now) =>
      prisma.homeHeroSlide.findMany({
        where: { storeId, sectionId, ...publishedWhere(now) },
        orderBy: { sortOrder: "asc" },
        select: homeHeroSlideSelect,
      }),

    listPublishedFeaturedCategories: (storeId, sectionId) =>
      prisma.homeFeaturedCategory.findMany({
        // Kategori de ACTIVE olmalı (public görünürlük); enabled entry + ACTIVE kategori.
        where: { storeId, sectionId, enabled: true, category: { status: "ACTIVE" } },
        orderBy: { sortOrder: "asc" },
        select: homeFeaturedCategorySelect,
      }),

    listShowcaseProductIds: async (storeId, sectionId) => {
      const rows = await prisma.homeShowcaseProduct.findMany({
        where: { storeId, sectionId },
        orderBy: { sortOrder: "asc" },
        select: { productId: true },
      });
      return rows.map((r) => r.productId);
    },

    resolveDynamicShowcaseProductIds: (storeId, rule, params, now) =>
      resolveDynamicShowcase(storeId, rule, params, now),
  };
}

/**
 * DYNAMIC showcase kural çözümleyici motoru. Yalnız ACTIVE ürünler üzerinde çalışır ve
 * ORDERED product id listesi döner (server.ts bunları buildPublicProduct ile projekte eder,
 * maxItems truncation'ı active-filter sonrası yapar). Kurallar KOLAY GENİŞLETİLEBİLİR:
 * yeni kural = bu switch'e bir dal + contract enum'una bir değer (migration yok).
 */
async function resolveDynamicShowcase(
  storeId: string,
  rule: HomeShowcaseRule,
  params: DynamicShowcaseParams,
  now: Date,
): Promise<string[]> {
  switch (rule) {
    case "NEW_PRODUCTS": {
      const rows = await prisma.product.findMany({
        where: { storeId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }
    case "BRAND": {
      if (!params.brand) return [];
      const rows = await prisma.product.findMany({
        where: { storeId, status: "ACTIVE", brand: { equals: params.brand, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }
    case "CATEGORY": {
      if (!params.categorySlug) return [];
      const category = await prisma.productCategory.findFirst({
        where: { storeId, slug: params.categorySlug },
        select: { id: true },
      });
      if (!category) return [];
      // v1: ana kategori (primaryCategoryId) VEYA ikincil atama (assignments) — ikisi de dahil.
      const rows = await prisma.product.findMany({
        where: {
          storeId,
          status: "ACTIVE",
          OR: [
            { primaryCategoryId: category.id },
            { assignments: { some: { categoryId: category.id } } },
          ],
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }
    case "CAMPAIGN": {
      // ACTIVE + isPublic + pencere-geçerli kampanyalara ÜRÜN-ÖLÇEKLİ bağlı ürünler (CampaignProduct).
      const links = await prisma.campaignProduct.findMany({
        where: {
          storeId,
          product: { status: "ACTIVE" },
          campaign: {
            status: "ACTIVE",
            isPublic: true,
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        select: { productId: true },
      });
      // Tekilleştir (bir ürün birden çok kampanyada olabilir), sıra korunur.
      const seen = new Set<string>();
      const ids: string[] = [];
      for (const l of links) {
        if (!seen.has(l.productId)) {
          seen.add(l.productId);
          ids.push(l.productId);
        }
      }
      return ids;
    }
    case "IN_STOCK": {
      // Default-depo otoritesi (InventoryItem; public stok haritasıyla tutarlı). onHand-reserved>0
      // olan varyantın ürünü. Legacy InventoryItem, public katalog stok kaynağıyla aynıdır.
      const rows = await prisma.inventoryItem.findMany({
        where: { storeId, variant: { status: "ACTIVE", product: { status: "ACTIVE" } } },
        select: {
          quantityOnHand: true,
          quantityReserved: true,
          variant: { select: { productId: true, product: { select: { createdAt: true } } } },
        },
      });
      const byProduct = new Map<string, Date>();
      for (const row of rows) {
        if (row.quantityOnHand - row.quantityReserved > 0) {
          const existing = byProduct.get(row.variant.productId);
          const created = row.variant.product.createdAt;
          if (!existing || created > existing) byProduct.set(row.variant.productId, created);
        }
      }
      return [...byProduct.entries()].sort((a, b) => b[1].getTime() - a[1].getTime()).map(([id]) => id);
    }
    case "ATTRIBUTE": {
      if (!params.attributeCode || !params.attributeValue) return [];
      const value = params.attributeValue;
      const rows = await prisma.productAttributeValue.findMany({
        where: {
          storeId,
          product: { status: "ACTIVE" },
          definition: { code: params.attributeCode },
          OR: [
            { valueText: { equals: value, mode: "insensitive" } },
            { option: { value: { equals: value, mode: "insensitive" } } },
            { option: { label: { equals: value, mode: "insensitive" } } },
          ],
        },
        select: { productId: true, product: { select: { createdAt: true } } },
      });
      return rows
        .sort((a, b) => b.product.createdAt.getTime() - a.product.createdAt.getTime())
        .map((r) => r.productId);
    }
    default: {
      // Kapsanmayan kural (ileride eklenecek tip) → boş; storefront section'ı gizler.
      return [];
    }
  }
}

// ─────────────────────────── Admin serializerlar (contract allowlist) ───────────────────────────

export function serializeHomeSection(record: HomeSectionRecord) {
  return homeSectionSchema.parse({
    id: record.id,
    type: record.type,
    title: record.title,
    subtitle: record.subtitle,
    enabled: record.enabled,
    sortOrder: record.sortOrder,
    desktopVisible: record.desktopVisible,
    mobileVisible: record.mobileVisible,
    publishStart: record.publishStart ? record.publishStart.toISOString() : null,
    publishEnd: record.publishEnd ? record.publishEnd.toISOString() : null,
    config: (record.config ?? {}) as Record<string, unknown>,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export function serializeHomeHeroSlide(record: HomeHeroSlideRecord, baseUrl?: string) {
  return homeHeroSlideSchema.parse({
    id: record.id,
    sectionId: record.sectionId,
    mediaId: record.mediaId,
    mediaUrl: resolveMediaUrl(baseUrl, record.media.storageKey),
    mobileMediaId: record.mobileMediaId,
    mobileMediaUrl: record.mobileMedia ? resolveMediaUrl(baseUrl, record.mobileMedia.storageKey) : null,
    videoUrl: record.videoUrl,
    headline: record.headline,
    subtext: record.subtext,
    ctaLabel: record.ctaLabel,
    ctaHref: record.ctaHref,
    targetProductId: record.targetProductId,
    targetCategoryId: record.targetCategoryId,
    targetCampaignId: record.targetCampaignId,
    enabled: record.enabled,
    sortOrder: record.sortOrder,
    publishStart: record.publishStart ? record.publishStart.toISOString() : null,
    publishEnd: record.publishEnd ? record.publishEnd.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export function serializeHomeFeaturedCategory(record: HomeFeaturedCategoryRecord, baseUrl?: string) {
  // Görüntü: override kapak varsa o; yoksa kategorinin kendi görseli; ikisi de yoksa null.
  const storageKey = record.image?.storageKey ?? record.category.image?.storageKey ?? null;
  return homeFeaturedCategorySchema.parse({
    id: record.id,
    sectionId: record.sectionId,
    categoryId: record.categoryId,
    categorySlug: record.category.slug,
    categoryName: record.category.name,
    imageMediaId: record.imageMediaId,
    imageUrl: storageKey ? resolveMediaUrl(baseUrl, storageKey) : null,
    titleOverride: record.titleOverride,
    descriptionOverride: record.descriptionOverride,
    enabled: record.enabled,
    sortOrder: record.sortOrder,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export function serializeHomeShowcaseProduct(record: HomeShowcaseProductRecord, coverUrl: string | null) {
  return homeShowcaseProductSchema.parse({
    id: record.id,
    sectionId: record.sectionId,
    productId: record.productId,
    productTitle: record.product.title,
    productSlug: record.product.slug,
    coverUrl,
    sortOrder: record.sortOrder,
  });
}

// ─────────────────────────── Public serializerlar (ALLOWLIST) ───────────────────────────

export function serializePublicHomeHeroSlide(record: HomeHeroSlideRecord, baseUrl?: string) {
  return publicHomeHeroSlideSchema.parse({
    key: record.id,
    mediaUrl: resolveMediaUrl(baseUrl, record.media.storageKey),
    mobileMediaUrl: record.mobileMedia ? resolveMediaUrl(baseUrl, record.mobileMedia.storageKey) : null,
    headline: record.headline,
    subtext: record.subtext,
    ctaLabel: record.ctaLabel,
    ctaHref: record.ctaHref,
  });
}

export function serializePublicHomeFeaturedCategory(
  record: HomeFeaturedCategoryRecord,
  baseUrl?: string,
) {
  const storageKey = record.image?.storageKey ?? record.category.image?.storageKey ?? null;
  return publicHomeFeaturedCategorySchema.parse({
    key: record.id,
    title: record.titleOverride ?? record.category.name,
    description: record.descriptionOverride,
    href: `/products?category=${encodeURIComponent(record.category.slug)}`,
    imageUrl: storageKey ? resolveMediaUrl(baseUrl, storageKey) : null,
  });
}

// ─────────────────────────── Config parse yardımcıları ───────────────────────────

// Section.config'i tipe göre doğrular/normalleştirir. Bilinmeyen tip → boş config.
export function parseHomeShowcaseConfig(config: Prisma.JsonValue) {
  return homeShowcaseConfigSchema.parse(config ?? {});
}

export function parseHomeHeroConfig(config: Prisma.JsonValue) {
  return homeHeroConfigSchema.parse(config ?? {});
}
