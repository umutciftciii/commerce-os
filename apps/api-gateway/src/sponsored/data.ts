/**
 * TODO-161 (ADR-114…120) — Sponsored Product Management — Prisma veri erişimi.
 *
 * Tüm sorgular `storeId` ile scope'lanır (tenant izolasyonu). Sponsorlu aday çözümü
 * ProductSearchDocument read-model'i üzerinden yapılır → pasif/stok-dışı ürün otomatik
 * elenir + organik metin relevancy'sine erişim (ADR-116). Order/refund SUNUCU-otoriter +
 * append-only iade defteri (ADR-118). Rapor aggregasyonu Prisma groupBy + tek raw daily
 * sorgu ile (N+1 yok); metrik türetimi SAF `sponsored-core` fonksiyonlarıyla.
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import {
  isCampaignSnapshotDisplayable,
  type PublicCampaignBadge,
  type SponsoredCampaignStatus,
  type SponsoredEventType,
  type SponsoredPlacementType,
} from "@commerce-os/contracts";
import type { SearchListingProjection, SearchResultItem } from "@commerce-os/search-service";
import {
  compareSponsored,
  dedupeSponsoredByProduct,
  matchesSponsoredRelevancy,
  reduceAttributionRevenue,
  type SponsoredOrderable,
} from "./sponsored-core.js";
// TODO-161A (ADR-124) — Ticari teslim guard'ı (SPONSORED kampanya uygunluk kapısı).
import { buildCommercialDeliveryWhere } from "../sponsorship/delivery-guard.js";

type PrismaLike = typeof prisma;

/** Store `SPONSORED` kampanya için ödemesiz teslime izin veriyor mu? (ADR-124) */
async function storeAllowsUnpaidSponsored(db: PrismaLike, storeId: string): Promise<boolean> {
  const s = await db.storeSettings.findUnique({ where: { storeId }, select: { allowUnpaidSponsoredCampaigns: true } });
  return s?.allowUnpaidSponsoredCampaigns ?? false;
}

// ── Record tipleri ──────────────────────────────────────────────────────────
export interface SponsoredCampaignRecord {
  id: string;
  storeId: string;
  name: string;
  status: SponsoredCampaignStatus;
  placement: SponsoredPlacementType;
  startsAt: Date | null;
  endsAt: Date | null;
  priority: number;
  maxSlots: number;
  targetCategoryId: string | null;
  timezone: string;
  // TODO-161A.2 (ADR-128) — ticari mod. INTERNAL_PROMOTION guard'dan muaf; SPONSORED anlaşma gerektirir.
  commercialMode: "INTERNAL_PROMOTION" | "SPONSORED";
  createdAt: Date;
  updatedAt: Date;
}

export interface SponsoredCampaignWithMeta extends SponsoredCampaignRecord {
  targetCategoryLabel: string | null;
  productCount: number;
  keywordCount: number;
}

export interface SponsoredPlacementProductRow {
  productId: string;
  title: string;
  slug: string;
  position: number | null;
  priority: number;
  eligible: boolean;
}

export interface SponsoredCampaignDetail extends SponsoredCampaignWithMeta {
  products: SponsoredPlacementProductRow[];
  keywords: string[];
}

/** Sponsorlu aday: read-model item + iç kimlikler (token imzası route'ta). */
export interface ResolvedSponsoredCandidate {
  item: SearchResultItem;
  campaignId: string;
  placementId: string;
}

/** Checkout'un yazacağı, doğrulanmış sponsorlu attribution (grant başına 1). */
export interface ResolvedSponsoredAttribution {
  campaignId: string;
  placementId: string | null;
  productId: string;
  snapshot: Record<string, unknown>;
}

export interface SponsoredAdminListPage {
  limit: number;
  offset: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  search?: string;
}

export interface SponsoredCampaignWriteInput {
  name: string;
  placement: SponsoredPlacementType;
  status?: SponsoredCampaignStatus;
  startsAt?: Date | null;
  endsAt?: Date | null;
  priority?: number;
  maxSlots?: number;
  targetCategoryId?: string | null;
  timezone?: string;
  productIds?: string[];
  keywords?: string[]; // NORMALIZE edilmiş + tekilleştirilmiş (route hazırlar)
  commercialMode?: "INTERNAL_PROMOTION" | "SPONSORED";
}

export interface SponsoredAnalyticsFilters {
  dateFrom?: Date;
  dateTo?: Date;
  campaignId?: string;
  placement?: SponsoredPlacementType;
  productId?: string;
}

export interface SponsoredEventInput {
  campaignId: string;
  placementId: string | null;
  productId: string;
  type: SponsoredEventType;
  placement: SponsoredPlacementType;
  source: string | null;
  visitorIdHash: string | null;
  sessionIdHash: string | null;
  isBot: boolean;
  dedupeWindowSeconds: number;
  now: Date;
}

// ── Data-access arayüzü (route'lar buna bağımlı; test in-memory enjekte edebilir) ─
export interface SponsoredData {
  listCampaigns(
    storeId: string,
    filters: { status?: SponsoredCampaignStatus; placement?: SponsoredPlacementType },
    page: SponsoredAdminListPage,
    now: Date,
  ): Promise<{ items: SponsoredCampaignWithMeta[]; total: number }>;
  getCampaign(storeId: string, id: string): Promise<SponsoredCampaignRecord | null>;
  getCampaignDetail(storeId: string, id: string, now: Date): Promise<SponsoredCampaignDetail | null>;
  createCampaign(storeId: string, input: SponsoredCampaignWriteInput): Promise<SponsoredCampaignRecord | "INVALID_CATEGORY">;
  updateCampaign(
    storeId: string,
    id: string,
    input: Partial<SponsoredCampaignWriteInput>,
  ): Promise<SponsoredCampaignRecord | null | "INVALID_CATEGORY">;

  resolveSearchCandidates(
    storeId: string,
    input: { queryTokens: string[]; categorySlug: string | null; now: Date; limit: number; excludeProductIds: Set<string> },
  ): Promise<ResolvedSponsoredCandidate[]>;
  resolveHomeCandidates(
    storeId: string,
    input: { now: Date; limit: number },
  ): Promise<ResolvedSponsoredCandidate[]>;

  recordEvent(storeId: string, input: SponsoredEventInput): Promise<boolean>;
  recordOrderSponsoredAttribution(
    storeId: string,
    orderId: string,
    resolved: ResolvedSponsoredAttribution[],
    orderLines: Array<{ productId: string; quantity: number; lineTotalMinor: number }>,
    currency: string,
    attributedAt: Date,
  ): Promise<void>;
  applyRefund(storeId: string, orderId: string, refundKey: string, ratio: number): Promise<void>;

  getAnalytics(storeId: string, filters: SponsoredAnalyticsFilters): Promise<SponsoredAnalyticsResult>;
  exportRows(storeId: string, filters: SponsoredAnalyticsFilters): Promise<SponsoredExportRow[]>;
}

export interface SponsoredAnalyticsResult {
  summary: {
    impressions: number;
    uniqueImpressions: number;
    clicks: number;
    carts: number;
    orders: number;
    grossRevenueMinor: number;
    refundedRevenueMinor: number;
    netRevenueMinor: number;
    currency: string;
  };
  daily: Array<{
    date: string;
    impressions: number;
    clicks: number;
    orders: number;
    grossRevenueMinor: number;
    netRevenueMinor: number;
  }>;
  campaigns: Array<{
    campaignId: string;
    campaignName: string;
    placement: SponsoredPlacementType;
    impressions: number;
    clicks: number;
    orders: number;
    grossRevenueMinor: number;
    netRevenueMinor: number;
  }>;
  products: Array<{
    productId: string;
    productTitle: string;
    impressions: number;
    clicks: number;
    orders: number;
    grossRevenueMinor: number;
  }>;
  placements: Array<{
    placement: SponsoredPlacementType;
    impressions: number;
    clicks: number;
    orders: number;
    grossRevenueMinor: number;
  }>;
  topSearchTerms: Array<{ keyword: string; campaignCount: number }>;
}

export interface SponsoredExportRow {
  orderNumber: string;
  attributedAt: Date;
  campaignName: string;
  placement: SponsoredPlacementType;
  productTitle: string;
  quantity: number;
  currency: string;
  grossRevenueMinor: number;
  refundedRevenueMinor: number;
  netRevenueMinor: number;
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────
/** status ACTIVE + pencere geçerli (UTC instant; timezone-bağımsız — ADR-119). */
function activeWindowWhere(now: Date): Prisma.SponsoredProductCampaignWhereInput {
  return {
    status: "ACTIVE",
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ],
  };
}

/** targetCategoryId + tüm alt-ağaç kategori id'leri (recursive; tenant-izole). */
async function resolveCategorySubtreeIds(db: PrismaLike, storeId: string, rootId: string): Promise<Set<string>> {
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH RECURSIVE subtree AS (
      SELECT "id" FROM "ProductCategory" WHERE "storeId" = ${storeId} AND "id" = ${rootId}
      UNION ALL
      SELECT c."id" FROM "ProductCategory" c
      INNER JOIN subtree s ON c."parentId" = s."id"
      WHERE c."storeId" = ${storeId}
    )
    SELECT "id" FROM subtree
  `);
  return new Set(rows.map((r) => r.id));
}

interface SearchDocRow {
  productId: string;
  slug: string;
  title: string;
  brand: string | null;
  // TODO-165A (ADR-165A) Task 11 — governed marka id'si (gateway brandRef hidrasyonu için).
  brandId: string | null;
  primaryCategoryId: string | null;
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
  currency: string | null;
  availability: "IN_STOCK" | "OUT_OF_STOCK";
  hasStock: boolean;
  variantCount: number;
  searchText: string;
  compareAtMinor: number | null;
  discountPercent: number | null;
  omnibusPreviousPriceMinor: number | null;
  listing: Prisma.JsonValue;
  campaign: Prisma.JsonValue;
  campaignStartsAt: Date | null;
  campaignEndsAt: Date | null;
}

/** ProductSearchDocument satırını SearchResultItem'a çevirir (organik toResultItem ile birebir). */
function toResultItem(r: SearchDocRow, now: Date): SearchResultItem {
  const badge = (r.campaign as PublicCampaignBadge | null) ?? null;
  const campaign =
    badge !== null && isCampaignSnapshotDisplayable({ startsAt: r.campaignStartsAt, endsAt: r.campaignEndsAt }, now)
      ? badge
      : null;
  return {
    productId: r.productId,
    slug: r.slug,
    title: r.title,
    brand: r.brand,
    brandId: r.brandId,
    primaryCategoryId: r.primaryCategoryId,
    minPriceMinor: r.minPriceMinor,
    maxPriceMinor: r.maxPriceMinor,
    currency: r.currency,
    availability: r.availability,
    inStock: r.hasStock,
    variantCount: r.variantCount,
    compareAtMinor: r.compareAtMinor,
    discountPercent: r.discountPercent,
    omnibusPreviousPriceMinor: r.omnibusPreviousPriceMinor,
    listing: (r.listing as SearchListingProjection | null) ?? null,
    campaign,
  };
}

const SEARCH_DOC_SELECT = {
  productId: true,
  slug: true,
  title: true,
  brand: true,
  // TODO-165A (ADR-165A) Task 11 — governed marka id'si (gateway brandRef hidrasyonu için).
  brandId: true,
  primaryCategoryId: true,
  minPriceMinor: true,
  maxPriceMinor: true,
  currency: true,
  availability: true,
  hasStock: true,
  variantCount: true,
  searchText: true,
  compareAtMinor: true,
  discountPercent: true,
  omnibusPreviousPriceMinor: true,
  listing: true,
  campaign: true,
  campaignStartsAt: true,
  campaignEndsAt: true,
} as const;

// ── Implementasyon ──────────────────────────────────────────────────────────────
export function createSponsoredData(db: PrismaLike = prisma): SponsoredData {
  // Aktif kampanya + placement + keyword'leri yükleyip aday çözer (search + home ortak çekirdeği).
  async function loadActiveCandidates(
    storeId: string,
    placement: SponsoredPlacementType,
    now: Date,
    opts: {
      queryTokens: string[];
      limit: number;
      excludeProductIds: Set<string>;
      // "keyword": ürün-metni relevancy · "category": kampanya hedef-kategori subtree eşleşmesi · "home": eşik yok.
      mode: "keyword" | "category" | "home";
      browsedCategoryId: string | null;
    },
  ): Promise<ResolvedSponsoredCandidate[]> {
    // TODO-161A (ADR-124) — Ticari teslim guard'ı: `SPONSORED` kampanya geçerli anlaşma +
    // borçsuz + bütçesi tükenmemiş değilse HİÇ aday olmaz (impression bile kaydedilmez).
    // `INTERNAL_PROMOTION` muaf. Store setting `allowUnpaidSponsoredCampaigns=true` ise devre dışı.
    const allowUnpaid = await storeAllowsUnpaidSponsored(db, storeId);
    const commercialWhere = buildCommercialDeliveryWhere(now, allowUnpaid);
    const campaigns = await db.sponsoredProductCampaign.findMany({
      where: {
        storeId,
        placement,
        AND: [activeWindowWhere(now), ...(commercialWhere ? [commercialWhere] : [])],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      include: {
        placements: { orderBy: [{ priority: "desc" }, { position: "asc" }, { createdAt: "asc" }] },
        keywords: true,
      },
    });
    if (campaigns.length === 0) return [];

    // Aday ürün id'leri → tek read-model sorgusu (ACTIVE + hasStock kapısı).
    const candidateIds = new Set<string>();
    for (const c of campaigns) for (const p of c.placements) candidateIds.add(p.productId);
    if (candidateIds.size === 0) return [];
    const docs = await db.productSearchDocument.findMany({
      where: { storeId, productId: { in: [...candidateIds] }, status: "ACTIVE", hasStock: true },
      select: SEARCH_DOC_SELECT,
    });
    const docById = new Map(docs.map((d) => [d.productId, d as SearchDocRow]));

    // Kategori alt-ağaçları (yalnız hedefli kampanyalar için; tekilleştir).
    const subtreeCache = new Map<string, Set<string>>();
    for (const c of campaigns) {
      if (c.targetCategoryId && !subtreeCache.has(c.targetCategoryId)) {
        subtreeCache.set(c.targetCategoryId, await resolveCategorySubtreeIds(db, storeId, c.targetCategoryId));
      }
    }
    // Kategori gezinme modu: gezilen kategorinin alt-ağacı (ata↔alt ÇİFT-YÖNLÜ eşleşme için).
    const browsedSubtree =
      opts.mode === "category" && opts.browsedCategoryId
        ? await resolveCategorySubtreeIds(db, storeId, opts.browsedCategoryId)
        : null;

    // Kampanya sırasına göre aday üret; kampanya başına maxSlots tavanı.
    interface Flat extends SponsoredOrderable {
      productId: string;
      placementId: string;
      item: SearchResultItem;
    }
    const flat: Flat[] = [];
    for (const c of campaigns) {
      const keywords = c.keywords.map((k) => k.keyword);
      const targetCategoryIds = c.targetCategoryId ? subtreeCache.get(c.targetCategoryId) ?? null : null;
      // Kategori gezinme modu: kampanya hedef-kategorisi ile gezilen kategori AYNI ATA-ALT YOLUNDA ise
      // uygundur (ADR-116, çift-yönlü): hedef gezileni kapsıyor (hedef=ata) VEYA gezilen hedefi kapsıyor
      // (gezilen=ata). Böylece "Akıllı Saat"ı hedefleyen kampanya "Elektronik" sayfasında da görünür ve
      // "Elektronik"i hedefleyen kampanya "Akıllı Saat" alt-sayfasında da görünür. İlgisiz kategori elenir.
      if (opts.mode === "category") {
        const bid = opts.browsedCategoryId;
        const tid = c.targetCategoryId;
        const match =
          Boolean(bid) &&
          Boolean(tid) &&
          ((targetCategoryIds?.has(bid!) ?? false) || (browsedSubtree?.has(tid!) ?? false));
        if (!match) {
          continue;
        }
      }
      let used = 0;
      for (const p of c.placements) {
        if (used >= c.maxSlots) break;
        if (opts.excludeProductIds.has(p.productId)) continue;
        const doc = docById.get(p.productId);
        if (!doc) continue; // pasif/stok-dışı → elendi
        if (opts.mode === "keyword") {
          const ok = matchesSponsoredRelevancy(opts.queryTokens, { searchText: doc.searchText, primaryCategoryId: doc.primaryCategoryId }, { keywords, targetCategoryIds });
          if (!ok) continue;
        }
        used += 1;
        flat.push({
          productId: p.productId,
          campaignId: c.id,
          placementId: p.id,
          item: toResultItem(doc, now),
          campaignPriority: c.priority,
          campaignCreatedAt: c.createdAt.getTime(),
          placementPriority: p.priority,
          position: p.position,
        });
      }
    }

    // Deterministik sırala + ürün-tek dedupe + limit.
    flat.sort(compareSponsored);
    const deduped = dedupeSponsoredByProduct(flat).slice(0, Math.max(0, opts.limit));
    return deduped.map((f) => ({ item: f.item, campaignId: f.campaignId, placementId: f.placementId }));
  }

  async function validateCategory(storeId: string, categoryId: string | null | undefined): Promise<boolean> {
    if (!categoryId) return true;
    const cat = await db.productCategory.findFirst({ where: { id: categoryId, storeId }, select: { id: true } });
    return Boolean(cat);
  }

  async function writePlacementsAndKeywords(
    tx: Prisma.TransactionClient,
    storeId: string,
    campaignId: string,
    productIds: string[] | undefined,
    keywords: string[] | undefined,
  ): Promise<void> {
    if (productIds !== undefined) {
      await tx.sponsoredProductPlacement.deleteMany({ where: { storeId, campaignId } });
      // Yalnız bu store'a ait ürünler (cross-tenant guard).
      const valid = productIds.length
        ? await tx.product.findMany({ where: { storeId, id: { in: productIds } }, select: { id: true } })
        : [];
      const validSet = new Set(valid.map((p) => p.id));
      const ordered = productIds.filter((id) => validSet.has(id));
      if (ordered.length) {
        await tx.sponsoredProductPlacement.createMany({
          data: ordered.map((productId, index) => ({ storeId, campaignId, productId, position: index })),
        });
      }
    }
    if (keywords !== undefined) {
      await tx.sponsoredTargetKeyword.deleteMany({ where: { storeId, campaignId } });
      const unique = [...new Set(keywords.filter(Boolean))];
      if (unique.length) {
        await tx.sponsoredTargetKeyword.createMany({
          data: unique.map((keyword) => ({ storeId, campaignId, keyword })),
        });
      }
    }
  }

  return {
    async listCampaigns(storeId, filters, page) {
      const where: Prisma.SponsoredProductCampaignWhereInput = {
        storeId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.placement ? { placement: filters.placement } : {}),
        ...(page.search ? { name: { contains: page.search, mode: "insensitive" } } : {}),
      };
      const [rows, total] = await Promise.all([
        db.sponsoredProductCampaign.findMany({
          where,
          orderBy: { [page.sortBy]: page.sortOrder } as Prisma.SponsoredProductCampaignOrderByWithRelationInput,
          skip: page.offset,
          take: page.limit,
          include: {
            targetCategory: { select: { name: true } },
            _count: { select: { placements: true, keywords: true } },
          },
        }),
        db.sponsoredProductCampaign.count({ where }),
      ]);
      return {
        items: rows.map((r) => ({
          id: r.id,
          storeId: r.storeId,
          name: r.name,
          status: r.status,
          placement: r.placement,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          priority: r.priority,
          maxSlots: r.maxSlots,
          targetCategoryId: r.targetCategoryId,
          targetCategoryLabel: r.targetCategory?.name ?? null,
          timezone: r.timezone,
          commercialMode: r.commercialMode,
          productCount: r._count.placements,
          keywordCount: r._count.keywords,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
        total,
      };
    },

    async getCampaign(storeId, id) {
      const r = await db.sponsoredProductCampaign.findFirst({ where: { id, storeId } });
      return r ?? null;
    },

    async getCampaignDetail(storeId, id) {
      const r = await db.sponsoredProductCampaign.findFirst({
        where: { id, storeId },
        include: {
          targetCategory: { select: { name: true } },
          keywords: { orderBy: { keyword: "asc" } },
          placements: {
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            include: { product: { select: { title: true, slug: true, status: true } } },
          },
          _count: { select: { placements: true, keywords: true } },
        },
      });
      if (!r) return null;
      // Uygunluk (read-model): ACTIVE + hasStock. Bounded (placement sayısı).
      const productIds = r.placements.map((p) => p.productId);
      const eligibleDocs = productIds.length
        ? await db.productSearchDocument.findMany({
            where: { storeId, productId: { in: productIds }, status: "ACTIVE", hasStock: true },
            select: { productId: true },
          })
        : [];
      const eligibleSet = new Set(eligibleDocs.map((d) => d.productId));
      return {
        id: r.id,
        storeId: r.storeId,
        name: r.name,
        status: r.status,
        placement: r.placement,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        priority: r.priority,
        maxSlots: r.maxSlots,
        targetCategoryId: r.targetCategoryId,
        targetCategoryLabel: r.targetCategory?.name ?? null,
        timezone: r.timezone,
        commercialMode: r.commercialMode,
        productCount: r._count.placements,
        keywordCount: r._count.keywords,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        products: r.placements.map((p) => ({
          productId: p.productId,
          title: p.product.title,
          slug: p.product.slug,
          position: p.position,
          priority: p.priority,
          eligible: eligibleSet.has(p.productId),
        })),
        keywords: r.keywords.map((k) => k.keyword),
      };
    },

    async createCampaign(storeId, input) {
      if (input.targetCategoryId && !(await validateCategory(storeId, input.targetCategoryId))) {
        return "INVALID_CATEGORY";
      }
      return db.$transaction(async (tx) => {
        const campaign = await tx.sponsoredProductCampaign.create({
          data: {
            storeId,
            name: input.name,
            placement: input.placement,
            status: input.status ?? "ACTIVE",
            startsAt: input.startsAt ?? null,
            endsAt: input.endsAt ?? null,
            priority: input.priority ?? 0,
            maxSlots: input.maxSlots ?? 3,
            targetCategoryId: input.targetCategoryId ?? null,
            timezone: input.timezone ?? "Europe/Istanbul",
            commercialMode: input.commercialMode ?? "INTERNAL_PROMOTION",
          },
        });
        await writePlacementsAndKeywords(tx, storeId, campaign.id, input.productIds, input.keywords);
        return campaign;
      });
    },

    async updateCampaign(storeId, id, input) {
      const existing = await db.sponsoredProductCampaign.findFirst({ where: { id, storeId }, select: { id: true } });
      if (!existing) return null;
      if (input.targetCategoryId !== undefined && input.targetCategoryId !== null) {
        if (!(await validateCategory(storeId, input.targetCategoryId))) return "INVALID_CATEGORY";
      }
      return db.$transaction(async (tx) => {
        const campaign = await tx.sponsoredProductCampaign.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
            ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
            ...(input.priority !== undefined ? { priority: input.priority } : {}),
            ...(input.maxSlots !== undefined ? { maxSlots: input.maxSlots } : {}),
            ...(input.targetCategoryId !== undefined ? { targetCategoryId: input.targetCategoryId } : {}),
            ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
            ...(input.commercialMode !== undefined ? { commercialMode: input.commercialMode } : {}),
          },
        });
        await writePlacementsAndKeywords(tx, storeId, id, input.productIds, input.keywords);
        return campaign;
      });
    },

    async resolveSearchCandidates(storeId, input) {
      // Keyword araması → ürün-metni relevancy; keyword yok + kategori gezinme → kampanya hedef-kategori
      // subtree eşleşmesi (TD-120 kapanışı). İkisi de yoksa çağrılmaz (route gate'i).
      let browsedCategoryId: string | null = null;
      let mode: "keyword" | "category" = "keyword";
      if (input.queryTokens.length === 0 && input.categorySlug) {
        const cat = await db.productCategory.findFirst({ where: { storeId, slug: input.categorySlug }, select: { id: true } });
        if (!cat) return []; // bilinmeyen kategori → sponsorlu yok
        browsedCategoryId = cat.id;
        mode = "category";
      }
      return loadActiveCandidates(storeId, "SEARCH_RESULTS", input.now, {
        queryTokens: input.queryTokens,
        limit: input.limit,
        excludeProductIds: input.excludeProductIds,
        mode,
        browsedCategoryId,
      });
    },

    resolveHomeCandidates(storeId, input) {
      return loadActiveCandidates(storeId, "HOME_SHOWCASE", input.now, {
        queryTokens: [],
        limit: input.limit,
        excludeProductIds: new Set(),
        mode: "home",
        browsedCategoryId: null,
      });
    },

    async recordEvent(storeId, input) {
      // Bot event'ler AUDIT için kaydedilir ama dedupe/paydadan sonra dışlanır. Repeat dedupe:
      // aynı (visitorIdHash, placementId, type) kısa pencerede yeni satır AÇMAZ.
      if (!input.isBot && input.visitorIdHash && input.placementId) {
        const cutoff = new Date(input.now.getTime() - input.dedupeWindowSeconds * 1000);
        const recent = await db.sponsoredProductEvent.findFirst({
          where: {
            storeId,
            placementId: input.placementId,
            visitorIdHash: input.visitorIdHash,
            type: input.type,
            createdAt: { gt: cutoff },
          },
          select: { id: true },
        });
        if (recent) return false; // dedupe: yeni satır yok
      }
      await db.sponsoredProductEvent.create({
        data: {
          storeId,
          campaignId: input.campaignId,
          placementId: input.placementId,
          productId: input.productId,
          type: input.type,
          placement: input.placement,
          source: input.source,
          visitorIdHash: input.visitorIdHash,
          sessionIdHash: input.sessionIdHash,
          isBot: input.isBot,
          createdAt: input.now,
        },
      });
      return true;
    },

    async recordOrderSponsoredAttribution(storeId, orderId, resolved, orderLines, currency, attributedAt) {
      if (resolved.length === 0) return;
      // Sipariş satırı productId → { quantity, lineTotalMinor } (birden çok satır aynı ürünse topla).
      const byProduct = new Map<string, { quantity: number; lineTotalMinor: number }>();
      for (const line of orderLines) {
        const cur = byProduct.get(line.productId) ?? { quantity: 0, lineTotalMinor: 0 };
        cur.quantity += line.quantity;
        cur.lineTotalMinor += line.lineTotalMinor;
        byProduct.set(line.productId, cur);
      }
      for (const r of resolved) {
        const line = byProduct.get(r.productId);
        if (!line || line.lineTotalMinor <= 0) continue; // ürün siparişte yok → attribution YAZILMAZ
        try {
          await db.orderSponsoredAttribution.create({
            data: {
              storeId,
              orderId,
              campaignId: r.campaignId,
              placementId: r.placementId,
              productId: r.productId,
              attributedAt,
              quantity: line.quantity,
              grossRevenueMinor: line.lineTotalMinor,
              refundedRevenueMinor: 0,
              netRevenueMinor: line.lineTotalMinor,
              currency,
              snapshot: r.snapshot as Prisma.InputJsonValue,
            },
          });
        } catch (error) {
          // @@unique([orderId, campaignId, productId]) → aynı grant ikinci kez: idempotent no-op.
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        }
      }
    },

    async applyRefund(storeId, orderId, refundKey, ratio) {
      // ratio: 1 = tam iptal/iade; 0..1 = oransal (ödeme kısmi refund'u). Her attribution için
      // ledger'a append (idempotent) → net yeniden türetilir.
      const attributions = await db.orderSponsoredAttribution.findMany({ where: { storeId, orderId } });
      for (const attr of attributions) {
        const amount = Math.round(attr.grossRevenueMinor * Math.max(0, Math.min(1, ratio)));
        await db.$transaction(async (tx) => {
          try {
            await tx.orderSponsoredAttributionRefund.create({
              data: { storeId, orderSponsoredAttributionId: attr.id, refundKey, amountMinor: amount },
            });
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return; // idempotent
            throw error;
          }
          const ledger = await tx.orderSponsoredAttributionRefund.findMany({
            where: { orderSponsoredAttributionId: attr.id },
            select: { refundKey: true, amountMinor: true },
          });
          const state = reduceAttributionRevenue(attr.grossRevenueMinor, ledger);
          await tx.orderSponsoredAttribution.update({
            where: { id: attr.id },
            data: { refundedRevenueMinor: state.refundedRevenueMinor, netRevenueMinor: state.netRevenueMinor },
          });
        });
      }
    },

    getAnalytics(storeId, filters) {
      return computeAnalytics(db, storeId, filters);
    },

    exportRows(storeId, filters) {
      return computeExportRows(db, storeId, filters);
    },
  };
}

// ── Analytics (Prisma groupBy + tek raw daily) ────────────────────────────────────
function eventWhere(storeId: string, filters: SponsoredAnalyticsFilters, includeBots = false): Prisma.SponsoredProductEventWhereInput {
  return {
    storeId,
    ...(includeBots ? {} : { isBot: false }),
    ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
    ...(filters.placement ? { placement: filters.placement } : {}),
    ...(filters.productId ? { productId: filters.productId } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? { createdAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lt: filters.dateTo } : {}) } }
      : {}),
  };
}

function attrWhere(storeId: string, filters: SponsoredAnalyticsFilters): Prisma.OrderSponsoredAttributionWhereInput {
  return {
    storeId,
    ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
    ...(filters.productId ? { productId: filters.productId } : {}),
    ...(filters.placement ? { campaign: { placement: filters.placement } } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? { attributedAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lt: filters.dateTo } : {}) } }
      : {}),
  };
}

async function computeAnalytics(db: PrismaLike, storeId: string, filters: SponsoredAnalyticsFilters): Promise<SponsoredAnalyticsResult> {
  const evWhere = eventWhere(storeId, filters);
  const atWhere = attrWhere(storeId, filters);

  const [byType, uniqueImpressionRows, attrAgg, campaignEvents, campaignAttr, productEvents, productAttr, placementEvents, storeCurrency, topKeywords] =
    await Promise.all([
      db.sponsoredProductEvent.groupBy({ by: ["type"], where: evWhere, _count: { _all: true } }),
      db.sponsoredProductEvent.findMany({
        where: { ...evWhere, type: "IMPRESSION", visitorIdHash: { not: null } },
        distinct: ["visitorIdHash"],
        select: { visitorIdHash: true },
      }),
      db.orderSponsoredAttribution.aggregate({
        where: atWhere,
        _count: { _all: true },
        _sum: { grossRevenueMinor: true, refundedRevenueMinor: true, netRevenueMinor: true },
      }),
      db.sponsoredProductEvent.groupBy({ by: ["campaignId", "type"], where: evWhere, _count: { _all: true } }),
      db.orderSponsoredAttribution.groupBy({
        by: ["campaignId"],
        where: atWhere,
        _count: { _all: true },
        _sum: { grossRevenueMinor: true, netRevenueMinor: true },
      }),
      db.sponsoredProductEvent.groupBy({ by: ["productId", "type"], where: evWhere, _count: { _all: true } }),
      db.orderSponsoredAttribution.groupBy({
        by: ["productId"],
        where: atWhere,
        _count: { _all: true },
        _sum: { grossRevenueMinor: true },
      }),
      db.sponsoredProductEvent.groupBy({ by: ["placement", "type"], where: evWhere, _count: { _all: true } }),
      // Store'da currency kolonu YOK → attribution snapshot'ından türet (en son; yoksa TRY).
      db.orderSponsoredAttribution.findFirst({ where: atWhere, orderBy: { attributedAt: "desc" }, select: { currency: true } }),
      db.sponsoredTargetKeyword.groupBy({
        by: ["keyword"],
        where: { storeId, ...(filters.campaignId ? { campaignId: filters.campaignId } : {}) },
        _count: { _all: true },
        orderBy: { _count: { keyword: "desc" } },
        take: 20,
      }),
    ]);

  const typeCount = (t: SponsoredEventType) => byType.find((r) => r.type === t)?._count._all ?? 0;
  const impressions = typeCount("IMPRESSION");
  const clicks = typeCount("CLICK");
  const carts = typeCount("CART");
  const orders = attrAgg._count._all;
  const grossRevenueMinor = attrAgg._sum.grossRevenueMinor ?? 0;
  const refundedRevenueMinor = attrAgg._sum.refundedRevenueMinor ?? 0;
  const netRevenueMinor = attrAgg._sum.netRevenueMinor ?? 0;
  const currency = storeCurrency?.currency ?? "TRY";

  // Kampanya adları + placement (bounded).
  const campaignIds = [...new Set([...campaignEvents.map((r) => r.campaignId), ...campaignAttr.map((r) => r.campaignId)])];
  const campaignMeta = campaignIds.length
    ? await db.sponsoredProductCampaign.findMany({ where: { storeId, id: { in: campaignIds } }, select: { id: true, name: true, placement: true } })
    : [];
  const campaignMetaById = new Map(campaignMeta.map((c) => [c.id, c]));

  const campaigns = campaignIds
    .map((id) => {
      const meta = campaignMetaById.get(id);
      const evImp = campaignEvents.find((r) => r.campaignId === id && r.type === "IMPRESSION")?._count._all ?? 0;
      const evClk = campaignEvents.find((r) => r.campaignId === id && r.type === "CLICK")?._count._all ?? 0;
      const at = campaignAttr.find((r) => r.campaignId === id);
      return {
        campaignId: id,
        campaignName: meta?.name ?? "—",
        placement: (meta?.placement ?? "SEARCH_RESULTS") as SponsoredPlacementType,
        impressions: evImp,
        clicks: evClk,
        orders: at?._count._all ?? 0,
        grossRevenueMinor: at?._sum.grossRevenueMinor ?? 0,
        netRevenueMinor: at?._sum.netRevenueMinor ?? 0,
      };
    })
    .sort((a, b) => b.grossRevenueMinor - a.grossRevenueMinor || b.clicks - a.clicks);

  const productIds = [...new Set([...productEvents.map((r) => r.productId), ...productAttr.map((r) => r.productId)])];
  const productMeta = productIds.length
    ? await db.product.findMany({ where: { storeId, id: { in: productIds } }, select: { id: true, title: true } })
    : [];
  const productMetaById = new Map(productMeta.map((p) => [p.id, p.title]));
  const products = productIds
    .map((id) => {
      const evImp = productEvents.find((r) => r.productId === id && r.type === "IMPRESSION")?._count._all ?? 0;
      const evClk = productEvents.find((r) => r.productId === id && r.type === "CLICK")?._count._all ?? 0;
      const at = productAttr.find((r) => r.productId === id);
      return {
        productId: id,
        productTitle: productMetaById.get(id) ?? "—",
        impressions: evImp,
        clicks: evClk,
        orders: at?._count._all ?? 0,
        grossRevenueMinor: at?._sum.grossRevenueMinor ?? 0,
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 50);

  // Placement breakdown: event'ler placement kolonundan; order'lar kampanya placement'ından türetilir.
  const placementList: SponsoredPlacementType[] = ["HOME_SHOWCASE", "SEARCH_RESULTS"];
  const placements = placementList
    .map((pl) => {
      const evImp = placementEvents.find((r) => r.placement === pl && r.type === "IMPRESSION")?._count._all ?? 0;
      const evClk = placementEvents.find((r) => r.placement === pl && r.type === "CLICK")?._count._all ?? 0;
      const ordersForPl = campaigns.filter((c) => c.placement === pl).reduce((s, c) => s + c.orders, 0);
      const grossForPl = campaigns.filter((c) => c.placement === pl).reduce((s, c) => s + c.grossRevenueMinor, 0);
      return { placement: pl, impressions: evImp, clicks: evClk, orders: ordersForPl, grossRevenueMinor: grossForPl };
    })
    .filter((p) => p.impressions > 0 || p.clicks > 0 || p.orders > 0);

  const daily = await computeDaily(db, storeId, filters);

  return {
    summary: {
      impressions,
      uniqueImpressions: uniqueImpressionRows.length,
      clicks,
      carts,
      orders,
      grossRevenueMinor,
      refundedRevenueMinor,
      netRevenueMinor,
      currency,
    },
    daily,
    campaigns,
    products,
    placements,
    topSearchTerms: topKeywords.map((k) => ({ keyword: k.keyword, campaignCount: k._count._all })),
  };
}

async function computeDaily(db: PrismaLike, storeId: string, filters: SponsoredAnalyticsFilters) {
  const dateFrom = filters.dateFrom ?? null;
  const dateTo = filters.dateTo ?? null;
  const campaignId = filters.campaignId ?? null;
  const placement = filters.placement ?? null;
  const productId = filters.productId ?? null;

  const evRows = await db.$queryRaw<Array<{ d: string; impressions: bigint; clicks: bigint }>>(Prisma.sql`
    SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d,
           COUNT(*) FILTER (WHERE "type" = 'IMPRESSION') AS impressions,
           COUNT(*) FILTER (WHERE "type" = 'CLICK') AS clicks
    FROM "SponsoredProductEvent"
    WHERE "storeId" = ${storeId} AND "isBot" = false
      ${dateFrom ? Prisma.sql`AND "createdAt" >= ${dateFrom}` : Prisma.empty}
      ${dateTo ? Prisma.sql`AND "createdAt" < ${dateTo}` : Prisma.empty}
      ${campaignId ? Prisma.sql`AND "campaignId" = ${campaignId}` : Prisma.empty}
      ${placement ? Prisma.sql`AND "placement" = ${placement}::"SponsoredPlacementType"` : Prisma.empty}
      ${productId ? Prisma.sql`AND "productId" = ${productId}` : Prisma.empty}
    GROUP BY 1 ORDER BY 1
  `);
  const atRows = await db.$queryRaw<Array<{ d: string; orders: bigint; gross: bigint; net: bigint }>>(Prisma.sql`
    SELECT to_char(date_trunc('day', a."attributedAt"), 'YYYY-MM-DD') AS d,
           COUNT(*) AS orders,
           COALESCE(SUM(a."grossRevenueMinor"), 0) AS gross,
           COALESCE(SUM(a."netRevenueMinor"), 0) AS net
    FROM "OrderSponsoredAttribution" a
    ${placement ? Prisma.sql`INNER JOIN "SponsoredProductCampaign" c ON c."id" = a."campaignId"` : Prisma.empty}
    WHERE a."storeId" = ${storeId}
      ${dateFrom ? Prisma.sql`AND a."attributedAt" >= ${dateFrom}` : Prisma.empty}
      ${dateTo ? Prisma.sql`AND a."attributedAt" < ${dateTo}` : Prisma.empty}
      ${campaignId ? Prisma.sql`AND a."campaignId" = ${campaignId}` : Prisma.empty}
      ${placement ? Prisma.sql`AND c."placement" = ${placement}::"SponsoredPlacementType"` : Prisma.empty}
      ${productId ? Prisma.sql`AND a."productId" = ${productId}` : Prisma.empty}
    GROUP BY 1 ORDER BY 1
  `);
  const map = new Map<string, { date: string; impressions: number; clicks: number; orders: number; grossRevenueMinor: number; netRevenueMinor: number }>();
  for (const r of evRows) map.set(r.d, { date: r.d, impressions: Number(r.impressions), clicks: Number(r.clicks), orders: 0, grossRevenueMinor: 0, netRevenueMinor: 0 });
  for (const r of atRows) {
    const cur = map.get(r.d) ?? { date: r.d, impressions: 0, clicks: 0, orders: 0, grossRevenueMinor: 0, netRevenueMinor: 0 };
    cur.orders = Number(r.orders);
    cur.grossRevenueMinor = Number(r.gross);
    cur.netRevenueMinor = Number(r.net);
    map.set(r.d, cur);
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function computeExportRows(db: PrismaLike, storeId: string, filters: SponsoredAnalyticsFilters): Promise<SponsoredExportRow[]> {
  const rows = await db.orderSponsoredAttribution.findMany({
    where: attrWhere(storeId, filters),
    orderBy: { attributedAt: "desc" },
    take: 5000,
    include: {
      order: { select: { orderNumber: true } },
      campaign: { select: { name: true, placement: true } },
    },
  });
  const productIds = [...new Set(rows.map((r) => r.productId))];
  const products = productIds.length
    ? await db.product.findMany({ where: { storeId, id: { in: productIds } }, select: { id: true, title: true } })
    : [];
  const titleById = new Map(products.map((p) => [p.id, p.title]));
  return rows.map((r) => ({
    orderNumber: r.order.orderNumber,
    attributedAt: r.attributedAt,
    campaignName: r.campaign.name,
    placement: r.campaign.placement,
    productTitle: titleById.get(r.productId) ?? "—",
    quantity: r.quantity,
    currency: r.currency,
    grossRevenueMinor: r.grossRevenueMinor,
    refundedRevenueMinor: r.refundedRevenueMinor,
    netRevenueMinor: r.netRevenueMinor,
  }));
}
