/**
 * TODO-160 (ADR-102…107) — Influencer Tracking & Attribution — Prisma veri erişimi.
 *
 * Tüm sorgular `storeId` ile scope'lanır (tenant izolasyonu). Attribution SUNUCU-
 * otoriter + sipariş anında SNAPSHOT (ADR-103). Gross/net AYRI (ADR-104): iade
 * `OrderAttributionRefund` append-only defterine yazılır, net toplamdan türetilir
 * (idempotency `@@unique([orderAttributionId, refundKey])`). Rapor aggregasyonu
 * `$queryRaw` ile (N+1 yok); metrik türetimi SAF `tracking-core` fonksiyonlarıyla.
 */
import { prisma, type TransactionClient } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type {
  InfluencerStatus,
  InfluencerCampaignStatus,
  TrackingLinkTargetType,
  TrackingLinkStatus,
} from "@commerce-os/contracts";
import {
  computeNetRevenueMinor,
  isRapidRepeatClick,
  reduceAttributionRevenue,
} from "./tracking-core.js";

type PrismaLike = typeof prisma;

// ── Record tipleri ──────────────────────────────────────────────────────────
export interface InfluencerRecord {
  id: string;
  storeId: string;
  name: string;
  code: string;
  email: string | null;
  status: InfluencerStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InfluencerCampaignRecord {
  id: string;
  storeId: string;
  influencerId: string;
  name: string;
  status: InfluencerCampaignStatus;
  attributionWindowDays: number;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrackingLinkRecord {
  id: string;
  storeId: string;
  campaignId: string;
  tokenHash: string;
  targetType: TrackingLinkTargetType;
  targetPath: string;
  productId: string | null;
  categoryId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  status: TrackingLinkStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Public track çözümü: link + kampanya + influencer aktiflik/pencere için. */
export interface ResolvedTrackingLink {
  link: TrackingLinkRecord;
  campaign: InfluencerCampaignRecord;
  influencer: Pick<InfluencerRecord, "id" | "name" | "code" | "status">;
}

/** Grant doğrulandıktan sonra checkout'un yazacağı çözülmüş attribution. */
export interface ResolvedAttribution {
  influencerId: string;
  campaignId: string;
  trackingLinkId: string | null;
  clickedAt: Date;
  snapshot: Record<string, unknown>;
}

export interface AdminListPage {
  limit: number;
  offset: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  search?: string;
}

// ── Data-access arayüzü (route'lar buna bağımlı — test in-memory enjekte eder) ─
export interface InfluencerData {
  // Influencer
  listInfluencers(
    storeId: string,
    filters: { status?: InfluencerStatus },
    page: AdminListPage,
  ): Promise<{ items: (InfluencerRecord & { campaignCount: number })[]; total: number }>;
  getInfluencer(storeId: string, id: string): Promise<InfluencerRecord | null>;
  createInfluencer(
    storeId: string,
    input: { name: string; code: string; email: string | null; status: InfluencerStatus; notes: string | null },
  ): Promise<InfluencerRecord | "CODE_TAKEN">;
  updateInfluencer(
    storeId: string,
    id: string,
    input: Partial<{ name: string; code: string; email: string | null; status: InfluencerStatus; notes: string | null }>,
  ): Promise<InfluencerRecord | null | "CODE_TAKEN">;

  // Campaign
  listCampaigns(
    storeId: string,
    filters: { status?: InfluencerCampaignStatus; influencerId?: string },
    page: AdminListPage,
  ): Promise<{
    items: (InfluencerCampaignRecord & { influencerName: string; linkCount: number })[];
    total: number;
  }>;
  getCampaign(
    storeId: string,
    id: string,
  ): Promise<(InfluencerCampaignRecord & { influencerName: string; linkCount: number }) | null>;
  createCampaign(
    storeId: string,
    input: {
      influencerId: string;
      name: string;
      status: InfluencerCampaignStatus;
      attributionWindowDays: number;
      startsAt: Date | null;
      endsAt: Date | null;
    },
  ): Promise<(InfluencerCampaignRecord & { influencerName: string; linkCount: number }) | "INFLUENCER_NOT_FOUND">;
  updateCampaign(
    storeId: string,
    id: string,
    input: Partial<{
      name: string;
      status: InfluencerCampaignStatus;
      attributionWindowDays: number;
      startsAt: Date | null;
      endsAt: Date | null;
    }>,
  ): Promise<(InfluencerCampaignRecord & { influencerName: string; linkCount: number }) | null>;

  // Tracking link
  listTrackingLinks(
    storeId: string,
    filters: { status?: TrackingLinkStatus; campaignId?: string; influencerId?: string },
    page: AdminListPage,
  ): Promise<{ items: TrackingLinkListRow[]; total: number }>;
  getTrackingLink(storeId: string, id: string): Promise<TrackingLinkListRow | null>;
  createTrackingLink(
    storeId: string,
    input: {
      campaignId: string;
      tokenHash: string;
      targetType: TrackingLinkTargetType;
      targetPath: string;
      productId: string | null;
      categoryId: string | null;
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
    },
  ): Promise<TrackingLinkListRow | "CAMPAIGN_NOT_FOUND" | "TOKEN_COLLISION">;
  updateTrackingLink(
    storeId: string,
    id: string,
    input: Partial<{ status: TrackingLinkStatus; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null }>,
  ): Promise<TrackingLinkListRow | null>;
  /** Yenileme (rotation): eski tokenHash yerine yenisini yazar (eski token geçersizlenir). */
  regenerateTrackingLinkToken(storeId: string, id: string, tokenHash: string): Promise<TrackingLinkListRow | null | "TOKEN_COLLISION">;
  resolveProductTarget(storeId: string, productId: string): Promise<{ slug: string; title: string } | null>;
  resolveCategoryTarget(storeId: string, categoryId: string): Promise<{ slug: string; title: string } | null>;

  // Public track — gelen token'ın HMAC hash'i ile aranır (plain saklanmaz).
  resolveTrackingLinkByTokenHash(storeId: string, tokenHash: string): Promise<ResolvedTrackingLink | null>;
  findLastClickAt(storeId: string, trackingLinkId: string, visitorIdHash: string): Promise<Date | null>;
  insertClick(input: {
    storeId: string;
    campaignId: string;
    trackingLinkId: string;
    visitorIdHash: string;
    sessionIdHash: string | null;
    ipHash: string | null;
    userAgentHash: string | null;
    referrerHost: string | null;
    landingPath: string;
    isBot: boolean;
  }): Promise<{ id: string }>;

  // Order attribution
  recordOrderAttribution(
    storeId: string,
    orderId: string,
    resolved: ResolvedAttribution & { grossRevenueMinor: number; currency: string; attributedAt: Date },
  ): Promise<void>;
  applyRefund(storeId: string, orderId: string, refundKey: string, amountMinor: number): Promise<void>;

  // Analytics
  getAnalytics(storeId: string, filters: AnalyticsFilters): Promise<AnalyticsResult>;
  exportRows(storeId: string, filters: AnalyticsFilters): Promise<AttributionExportRow[]>;
}

export interface TrackingLinkListRow extends TrackingLinkRecord {
  campaignName: string;
  influencerId: string;
  influencerName: string;
  productTitle: string | null;
  categoryTitle: string | null;
  totalClicks: number;
  attributedOrders: number;
}

export interface AnalyticsFilters {
  dateFrom?: Date;
  dateTo?: Date;
  influencerId?: string;
  campaignId?: string;
  trackingLinkId?: string;
}

export interface AnalyticsResult {
  summary: {
    totalClicks: number;
    uniqueVisitors: number;
    attributedOrders: number;
    grossRevenueMinor: number;
    refundedRevenueMinor: number;
    netRevenueMinor: number;
    currency: string;
  };
  daily: {
    date: string;
    clicks: number;
    uniqueVisitors: number;
    orders: number;
    grossRevenueMinor: number;
    netRevenueMinor: number;
  }[];
  influencers: {
    influencerId: string;
    influencerName: string;
    code: string;
    clicks: number;
    orders: number;
    grossRevenueMinor: number;
    netRevenueMinor: number;
  }[];
  campaigns: {
    campaignId: string;
    campaignName: string;
    influencerName: string;
    clicks: number;
    orders: number;
    grossRevenueMinor: number;
    netRevenueMinor: number;
  }[];
  topLinks: {
    trackingLinkId: string;
    targetPath: string;
    campaignName: string;
    influencerName: string;
    clicks: number;
    orders: number;
    netRevenueMinor: number;
  }[];
  topProducts: {
    productId: string;
    productTitle: string;
    orders: number;
    grossRevenueMinor: number;
  }[];
}

export interface AttributionExportRow {
  orderId: string;
  orderNumber: string;
  attributedAt: Date;
  influencerName: string;
  influencerCode: string;
  campaignName: string;
  // Plain token CSV'ye YAZILMAZ (ADR-102): link hedef yolu ile tanımlanır.
  trackingLinkTarget: string | null;
  currency: string;
  grossRevenueMinor: number;
  refundedRevenueMinor: number;
  netRevenueMinor: number;
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const CLICK_DEDUPE_WINDOW_SECONDS = 1800;

// ── Prisma implementasyonu ──────────────────────────────────────────────────
export function createInfluencerData(db: PrismaLike = prisma): InfluencerData {
  return {
    // ---- Influencer -------------------------------------------------------
    async listInfluencers(storeId, filters, page) {
      const where: Prisma.InfluencerWhereInput = {
        storeId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(page.search
          ? { OR: [{ name: { contains: page.search, mode: "insensitive" } }, { code: { contains: page.search, mode: "insensitive" } }] }
          : {}),
      };
      const [rows, total] = await Promise.all([
        db.influencer.findMany({
          where,
          orderBy: influencerOrderBy(page),
          skip: page.offset,
          take: page.limit,
          include: { _count: { select: { campaigns: true } } },
        }),
        db.influencer.count({ where }),
      ]);
      return {
        items: rows.map((r) => ({ ...toInfluencer(r), campaignCount: r._count.campaigns })),
        total,
      };
    },
    async getInfluencer(storeId, id) {
      const row = await db.influencer.findFirst({ where: { id, storeId } });
      return row ? toInfluencer(row) : null;
    },
    async createInfluencer(storeId, input) {
      try {
        const row = await db.influencer.create({ data: { storeId, ...input } });
        return toInfluencer(row);
      } catch (error) {
        if (isUniqueViolation(error)) return "CODE_TAKEN";
        throw error;
      }
    },
    async updateInfluencer(storeId, id, input) {
      const existing = await db.influencer.findFirst({ where: { id, storeId }, select: { id: true } });
      if (!existing) return null;
      try {
        const row = await db.influencer.update({ where: { id }, data: input });
        return toInfluencer(row);
      } catch (error) {
        if (isUniqueViolation(error)) return "CODE_TAKEN";
        throw error;
      }
    },

    // ---- Campaign ---------------------------------------------------------
    async listCampaigns(storeId, filters, page) {
      const where: Prisma.InfluencerCampaignWhereInput = {
        storeId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.influencerId ? { influencerId: filters.influencerId } : {}),
        ...(page.search ? { name: { contains: page.search, mode: "insensitive" } } : {}),
      };
      const [rows, total] = await Promise.all([
        db.influencerCampaign.findMany({
          where,
          orderBy: campaignOrderBy(page),
          skip: page.offset,
          take: page.limit,
          include: { influencer: { select: { name: true } }, _count: { select: { trackingLinks: true } } },
        }),
        db.influencerCampaign.count({ where }),
      ]);
      return {
        items: rows.map((r) => ({
          ...toCampaign(r),
          influencerName: r.influencer.name,
          linkCount: r._count.trackingLinks,
        })),
        total,
      };
    },
    async getCampaign(storeId, id) {
      const row = await db.influencerCampaign.findFirst({
        where: { id, storeId },
        include: { influencer: { select: { name: true } }, _count: { select: { trackingLinks: true } } },
      });
      return row
        ? { ...toCampaign(row), influencerName: row.influencer.name, linkCount: row._count.trackingLinks }
        : null;
    },
    async createCampaign(storeId, input) {
      const influencer = await db.influencer.findFirst({
        where: { id: input.influencerId, storeId },
        select: { id: true, name: true },
      });
      if (!influencer) return "INFLUENCER_NOT_FOUND";
      const row = await db.influencerCampaign.create({
        data: { storeId, ...input },
        include: { _count: { select: { trackingLinks: true } } },
      });
      return { ...toCampaign(row), influencerName: influencer.name, linkCount: row._count.trackingLinks };
    },
    async updateCampaign(storeId, id, input) {
      const existing = await db.influencerCampaign.findFirst({ where: { id, storeId }, select: { id: true } });
      if (!existing) return null;
      const row = await db.influencerCampaign.update({
        where: { id },
        data: input,
        include: { influencer: { select: { name: true } }, _count: { select: { trackingLinks: true } } },
      });
      return { ...toCampaign(row), influencerName: row.influencer.name, linkCount: row._count.trackingLinks };
    },

    // ---- Tracking link ----------------------------------------------------
    async listTrackingLinks(storeId, filters, page) {
      const where: Prisma.InfluencerTrackingLinkWhereInput = {
        storeId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
        ...(filters.influencerId ? { campaign: { influencerId: filters.influencerId } } : {}),
      };
      const [rows, total] = await Promise.all([
        db.influencerTrackingLink.findMany({
          where,
          orderBy: linkOrderBy(page),
          skip: page.offset,
          take: page.limit,
          include: linkInclude(),
        }),
        db.influencerTrackingLink.count({ where }),
      ]);
      return { items: rows.map(toLinkRow), total };
    },
    async getTrackingLink(storeId, id) {
      const row = await db.influencerTrackingLink.findFirst({ where: { id, storeId }, include: linkInclude() });
      return row ? toLinkRow(row) : null;
    },
    async createTrackingLink(storeId, input) {
      const campaign = await db.influencerCampaign.findFirst({
        where: { id: input.campaignId, storeId },
        select: { id: true },
      });
      if (!campaign) return "CAMPAIGN_NOT_FOUND";
      try {
        const row = await db.influencerTrackingLink.create({
          data: { storeId, ...input },
          include: linkInclude(),
        });
        return toLinkRow(row);
      } catch (error) {
        if (isUniqueViolation(error)) return "TOKEN_COLLISION";
        throw error;
      }
    },
    async updateTrackingLink(storeId, id, input) {
      const existing = await db.influencerTrackingLink.findFirst({ where: { id, storeId }, select: { id: true } });
      if (!existing) return null;
      const row = await db.influencerTrackingLink.update({ where: { id }, data: input, include: linkInclude() });
      return toLinkRow(row);
    },
    async regenerateTrackingLinkToken(storeId, id, tokenHash) {
      const existing = await db.influencerTrackingLink.findFirst({ where: { id, storeId }, select: { id: true } });
      if (!existing) return null;
      try {
        const row = await db.influencerTrackingLink.update({ where: { id }, data: { tokenHash }, include: linkInclude() });
        return toLinkRow(row);
      } catch (error) {
        if (isUniqueViolation(error)) return "TOKEN_COLLISION";
        throw error;
      }
    },
    async resolveProductTarget(storeId, productId) {
      const row = await db.product.findFirst({ where: { id: productId, storeId }, select: { slug: true, title: true } });
      return row ? { slug: row.slug, title: row.title } : null;
    },
    async resolveCategoryTarget(storeId, categoryId) {
      const row = await db.productCategory.findFirst({
        where: { id: categoryId, storeId },
        select: { slug: true, name: true },
      });
      return row ? { slug: row.slug, title: row.name } : null;
    },

    // ---- Public track -----------------------------------------------------
    async resolveTrackingLinkByTokenHash(storeId, tokenHash) {
      const row = await db.influencerTrackingLink.findFirst({
        where: { storeId, tokenHash },
        include: { campaign: { include: { influencer: { select: { id: true, name: true, code: true, status: true } } } } },
      });
      if (!row) return null;
      const { campaign, ...link } = row;
      const { influencer, ...campaignFields } = campaign;
      return {
        link: toLink(link),
        campaign: toCampaign(campaignFields),
        influencer,
      };
    },
    async findLastClickAt(storeId, trackingLinkId, visitorIdHash) {
      const row = await db.attributionClick.findFirst({
        where: { storeId, trackingLinkId, visitorIdHash, isBot: false },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      return row?.createdAt ?? null;
    },
    async insertClick(input) {
      const row = await db.attributionClick.create({ data: input, select: { id: true } });
      return row;
    },

    // ---- Order attribution ------------------------------------------------
    async recordOrderAttribution(storeId, orderId, resolved) {
      // Idempotent: orderId @unique. Yeniden çağrı P2002 → yut (attribution zaten var).
      try {
        await db.orderAttribution.create({
          data: {
            storeId,
            orderId,
            influencerId: resolved.influencerId,
            campaignId: resolved.campaignId,
            trackingLinkId: resolved.trackingLinkId,
            attributionModel: "LAST_CLICK",
            attributedAt: resolved.attributedAt,
            grossRevenueMinor: resolved.grossRevenueMinor,
            refundedRevenueMinor: 0,
            netRevenueMinor: resolved.grossRevenueMinor,
            currency: resolved.currency,
            snapshot: resolved.snapshot as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) return; // zaten kayıtlı — no-op
        throw error;
      }
    },
    async applyRefund(storeId, orderId, refundKey, amountMinor) {
      await db.$transaction(async (tx: TransactionClient) => {
        const attribution = await tx.orderAttribution.findUnique({
          where: { orderId },
          select: { id: true, storeId: true, grossRevenueMinor: true },
        });
        if (!attribution || attribution.storeId !== storeId) return; // attribution yok → no-op
        // Append-only defter; aynı refundKey ikinci kez → P2002 → idempotent no-op.
        try {
          await tx.orderAttributionRefund.create({
            data: { storeId, orderAttributionId: attribution.id, refundKey, amountMinor: Math.max(0, amountMinor) },
          });
        } catch (error) {
          if (isUniqueViolation(error)) return; // aynı iade zaten uygulanmış
          throw error;
        }
        const entries = await tx.orderAttributionRefund.findMany({
          where: { orderAttributionId: attribution.id },
          select: { refundKey: true, amountMinor: true },
        });
        const state = reduceAttributionRevenue(attribution.grossRevenueMinor, entries);
        await tx.orderAttribution.update({
          where: { id: attribution.id },
          data: { refundedRevenueMinor: state.refundedRevenueMinor, netRevenueMinor: state.netRevenueMinor },
        });
      });
    },

    // ---- Analytics --------------------------------------------------------
    getAnalytics: (storeId, filters) => getAnalyticsImpl(db, storeId, filters),
    exportRows: (storeId, filters) => exportRowsImpl(db, storeId, filters),
  };
}

// ── Dönüştürücüler ──────────────────────────────────────────────────────────
function toInfluencer(r: {
  id: string;
  storeId: string;
  name: string;
  code: string;
  email: string | null;
  status: InfluencerStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): InfluencerRecord {
  return {
    id: r.id,
    storeId: r.storeId,
    name: r.name,
    code: r.code,
    email: r.email,
    status: r.status,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toCampaign(r: {
  id: string;
  storeId: string;
  influencerId: string;
  name: string;
  status: InfluencerCampaignStatus;
  attributionWindowDays: number;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): InfluencerCampaignRecord {
  return {
    id: r.id,
    storeId: r.storeId,
    influencerId: r.influencerId,
    name: r.name,
    status: r.status,
    attributionWindowDays: r.attributionWindowDays,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toLink(r: TrackingLinkRecord): TrackingLinkRecord {
  return {
    id: r.id,
    storeId: r.storeId,
    campaignId: r.campaignId,
    tokenHash: r.tokenHash,
    targetType: r.targetType,
    targetPath: r.targetPath,
    productId: r.productId,
    categoryId: r.categoryId,
    utmSource: r.utmSource,
    utmMedium: r.utmMedium,
    utmCampaign: r.utmCampaign,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function linkInclude() {
  return {
    campaign: { select: { name: true, influencerId: true, influencer: { select: { name: true } } } },
    product: { select: { title: true } },
    category: { select: { name: true } },
    _count: { select: { clicks: true, orderAttributions: true } },
  } satisfies Prisma.InfluencerTrackingLinkInclude;
}

type LinkWithInclude = TrackingLinkRecord & {
  campaign: { name: string; influencerId: string; influencer: { name: string } };
  product: { title: string } | null;
  category: { name: string } | null;
  _count: { clicks: number; orderAttributions: number };
};

function toLinkRow(r: LinkWithInclude): TrackingLinkListRow {
  return {
    ...toLink(r),
    campaignName: r.campaign.name,
    influencerId: r.campaign.influencerId,
    influencerName: r.campaign.influencer.name,
    productTitle: r.product?.title ?? null,
    categoryTitle: r.category?.name ?? null,
    totalClicks: r._count.clicks,
    attributedOrders: r._count.orderAttributions,
  };
}

function influencerOrderBy(page: AdminListPage): Prisma.InfluencerOrderByWithRelationInput[] {
  const dir = page.sortOrder;
  const field = page.sortBy;
  const primary: Prisma.InfluencerOrderByWithRelationInput =
    field === "name" ? { name: dir } : field === "code" ? { code: dir } : field === "status" ? { status: dir } : { createdAt: dir };
  return [primary, { id: "asc" }];
}

function campaignOrderBy(page: AdminListPage): Prisma.InfluencerCampaignOrderByWithRelationInput[] {
  const dir = page.sortOrder;
  const field = page.sortBy;
  const primary: Prisma.InfluencerCampaignOrderByWithRelationInput =
    field === "name" ? { name: dir } : field === "status" ? { status: dir } : { createdAt: dir };
  return [primary, { id: "asc" }];
}

function linkOrderBy(page: AdminListPage): Prisma.InfluencerTrackingLinkOrderByWithRelationInput[] {
  const dir = page.sortOrder;
  const field = page.sortBy;
  const primary: Prisma.InfluencerTrackingLinkOrderByWithRelationInput =
    field === "status"
      ? { status: dir }
      : field === "totalClicks"
        ? { clicks: { _count: dir } }
        : field === "attributedOrders"
          ? { orderAttributions: { _count: dir } }
          : { createdAt: dir };
  return [primary, { id: "asc" }];
}

// ── Analytics ($queryRaw, tenant-safe filtre fragmanları) ───────────────────
function clickWhere(storeId: string, f: AnalyticsFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`c."storeId" = ${storeId}`, Prisma.sql`c."isBot" = false`];
  if (f.dateFrom) parts.push(Prisma.sql`c."createdAt" >= ${f.dateFrom}`);
  if (f.dateTo) parts.push(Prisma.sql`c."createdAt" < ${f.dateTo}`);
  if (f.campaignId) parts.push(Prisma.sql`c."campaignId" = ${f.campaignId}`);
  if (f.trackingLinkId) parts.push(Prisma.sql`c."trackingLinkId" = ${f.trackingLinkId}`);
  if (f.influencerId) parts.push(Prisma.sql`cam."influencerId" = ${f.influencerId}`);
  return Prisma.join(parts, " AND ");
}

function attrWhere(storeId: string, f: AnalyticsFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`a."storeId" = ${storeId}`];
  if (f.dateFrom) parts.push(Prisma.sql`a."attributedAt" >= ${f.dateFrom}`);
  if (f.dateTo) parts.push(Prisma.sql`a."attributedAt" < ${f.dateTo}`);
  if (f.campaignId) parts.push(Prisma.sql`a."campaignId" = ${f.campaignId}`);
  if (f.trackingLinkId) parts.push(Prisma.sql`a."trackingLinkId" = ${f.trackingLinkId}`);
  if (f.influencerId) parts.push(Prisma.sql`a."influencerId" = ${f.influencerId}`);
  return Prisma.join(parts, " AND ");
}

async function getAnalyticsImpl(db: PrismaLike, storeId: string, f: AnalyticsFilters): Promise<AnalyticsResult> {
  const cw = clickWhere(storeId, f);
  const aw = attrWhere(storeId, f);

  const [
    clickSummary,
    orderSummary,
    dailyClicks,
    dailyOrders,
    byInfluencer,
    byCampaign,
    byLink,
    byProduct,
    currencyRow,
    clicksByInfluencer,
    clicksByCampaign,
    clicksByLink,
  ] = await Promise.all([
      db.$queryRaw<{ total: bigint; uniques: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS total, COUNT(DISTINCT c."visitorIdHash")::bigint AS uniques
          FROM "AttributionClick" c JOIN "InfluencerCampaign" cam ON cam."id" = c."campaignId" WHERE ${cw}`,
      ),
      db.$queryRaw<{ orders: bigint; gross: bigint; refunded: bigint; net: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS orders, COALESCE(SUM(a."grossRevenueMinor"),0)::bigint AS gross,
          COALESCE(SUM(a."refundedRevenueMinor"),0)::bigint AS refunded, COALESCE(SUM(a."netRevenueMinor"),0)::bigint AS net
          FROM "OrderAttribution" a WHERE ${aw}`,
      ),
      db.$queryRaw<{ day: string; clicks: bigint; uniques: bigint }[]>(
        Prisma.sql`SELECT to_char(date_trunc('day', c."createdAt"), 'YYYY-MM-DD') AS day,
          COUNT(*)::bigint AS clicks, COUNT(DISTINCT c."visitorIdHash")::bigint AS uniques
          FROM "AttributionClick" c JOIN "InfluencerCampaign" cam ON cam."id" = c."campaignId"
          WHERE ${cw} GROUP BY 1 ORDER BY 1`,
      ),
      db.$queryRaw<{ day: string; orders: bigint; gross: bigint; net: bigint }[]>(
        Prisma.sql`SELECT to_char(date_trunc('day', a."attributedAt"), 'YYYY-MM-DD') AS day,
          COUNT(*)::bigint AS orders, COALESCE(SUM(a."grossRevenueMinor"),0)::bigint AS gross,
          COALESCE(SUM(a."netRevenueMinor"),0)::bigint AS net
          FROM "OrderAttribution" a WHERE ${aw} GROUP BY 1 ORDER BY 1`,
      ),
      db.$queryRaw<{ influencerId: string; name: string; code: string; orders: bigint; gross: bigint; net: bigint }[]>(
        Prisma.sql`SELECT a."influencerId", i."name", i."code", COUNT(*)::bigint AS orders,
          COALESCE(SUM(a."grossRevenueMinor"),0)::bigint AS gross, COALESCE(SUM(a."netRevenueMinor"),0)::bigint AS net
          FROM "OrderAttribution" a JOIN "Influencer" i ON i."id" = a."influencerId"
          WHERE ${aw} GROUP BY a."influencerId", i."name", i."code" ORDER BY net DESC LIMIT 50`,
      ),
      db.$queryRaw<{ campaignId: string; name: string; influencerName: string; orders: bigint; gross: bigint; net: bigint }[]>(
        Prisma.sql`SELECT a."campaignId", cam."name", i."name" AS "influencerName", COUNT(*)::bigint AS orders,
          COALESCE(SUM(a."grossRevenueMinor"),0)::bigint AS gross, COALESCE(SUM(a."netRevenueMinor"),0)::bigint AS net
          FROM "OrderAttribution" a JOIN "InfluencerCampaign" cam ON cam."id" = a."campaignId"
          JOIN "Influencer" i ON i."id" = a."influencerId"
          WHERE ${aw} GROUP BY a."campaignId", cam."name", i."name" ORDER BY net DESC LIMIT 50`,
      ),
      db.$queryRaw<{ trackingLinkId: string; targetPath: string; campaignName: string; influencerName: string; orders: bigint; net: bigint }[]>(
        Prisma.sql`SELECT a."trackingLinkId", l."targetPath", cam."name" AS "campaignName", i."name" AS "influencerName",
          COUNT(*)::bigint AS orders, COALESCE(SUM(a."netRevenueMinor"),0)::bigint AS net
          FROM "OrderAttribution" a JOIN "InfluencerCampaign" cam ON cam."id" = a."campaignId"
          JOIN "Influencer" i ON i."id" = a."influencerId"
          JOIN "InfluencerTrackingLink" l ON l."id" = a."trackingLinkId"
          WHERE ${aw} AND a."trackingLinkId" IS NOT NULL
          GROUP BY a."trackingLinkId", l."targetPath", cam."name", i."name" ORDER BY net DESC LIMIT 20`,
      ),
      db.$queryRaw<{ productId: string; title: string; orders: bigint; gross: bigint }[]>(
        Prisma.sql`SELECT (a."snapshot"->>'productId') AS "productId", MAX(a."snapshot"->>'productTitle') AS title,
          COUNT(*)::bigint AS orders, COALESCE(SUM(a."grossRevenueMinor"),0)::bigint AS gross
          FROM "OrderAttribution" a WHERE ${aw} AND (a."snapshot"->>'productId') IS NOT NULL
          GROUP BY (a."snapshot"->>'productId') ORDER BY gross DESC LIMIT 20`,
      ),
      db.$queryRaw<{ currency: string }[]>(
        Prisma.sql`SELECT a."currency" FROM "OrderAttribution" a WHERE ${aw} GROUP BY a."currency" ORDER BY COUNT(*) DESC LIMIT 1`,
      ),
      db.$queryRaw<{ influencerId: string; clicks: bigint }[]>(
        Prisma.sql`SELECT cam."influencerId", COUNT(*)::bigint AS clicks
          FROM "AttributionClick" c JOIN "InfluencerCampaign" cam ON cam."id" = c."campaignId"
          WHERE ${cw} GROUP BY cam."influencerId"`,
      ),
      db.$queryRaw<{ campaignId: string; clicks: bigint }[]>(
        Prisma.sql`SELECT c."campaignId", COUNT(*)::bigint AS clicks
          FROM "AttributionClick" c JOIN "InfluencerCampaign" cam ON cam."id" = c."campaignId"
          WHERE ${cw} GROUP BY c."campaignId"`,
      ),
      db.$queryRaw<{ trackingLinkId: string; clicks: bigint }[]>(
        Prisma.sql`SELECT c."trackingLinkId", COUNT(*)::bigint AS clicks
          FROM "AttributionClick" c JOIN "InfluencerCampaign" cam ON cam."id" = c."campaignId"
          WHERE ${cw} GROUP BY c."trackingLinkId"`,
      ),
    ]);

  const clicksByInfluencerMap = new Map(clicksByInfluencer.map((r) => [r.influencerId, n(r.clicks)]));
  const clicksByCampaignMap = new Map(clicksByCampaign.map((r) => [r.campaignId, n(r.clicks)]));
  const clicksByLinkMap = new Map(clicksByLink.map((r) => [r.trackingLinkId, n(r.clicks)]));

  const cs = clickSummary[0] ?? { total: 0n, uniques: 0n };
  const os = orderSummary[0] ?? { orders: 0n, gross: 0n, refunded: 0n, net: 0n };
  const clicksByDay = new Map(dailyClicks.map((d) => [d.day, d]));
  const ordersByDay = new Map(dailyOrders.map((d) => [d.day, d]));
  const days = Array.from(new Set([...clicksByDay.keys(), ...ordersByDay.keys()])).sort();

  return {
    summary: {
      totalClicks: n(cs.total),
      uniqueVisitors: n(cs.uniques),
      attributedOrders: n(os.orders),
      grossRevenueMinor: n(os.gross),
      refundedRevenueMinor: n(os.refunded),
      netRevenueMinor: n(os.net),
      currency: currencyRow[0]?.currency ?? "TRY",
    },
    daily: days.map((day) => {
      const c = clicksByDay.get(day);
      const o = ordersByDay.get(day);
      return {
        date: day,
        clicks: c ? n(c.clicks) : 0,
        uniqueVisitors: c ? n(c.uniques) : 0,
        orders: o ? n(o.orders) : 0,
        grossRevenueMinor: o ? n(o.gross) : 0,
        netRevenueMinor: o ? n(o.net) : 0,
      };
    }),
    influencers: byInfluencer.map((r) => ({
      influencerId: r.influencerId,
      influencerName: r.name,
      code: r.code,
      clicks: clicksByInfluencerMap.get(r.influencerId) ?? 0,
      orders: n(r.orders),
      grossRevenueMinor: n(r.gross),
      netRevenueMinor: n(r.net),
    })),
    campaigns: byCampaign.map((r) => ({
      campaignId: r.campaignId,
      campaignName: r.name,
      influencerName: r.influencerName,
      clicks: clicksByCampaignMap.get(r.campaignId) ?? 0,
      orders: n(r.orders),
      grossRevenueMinor: n(r.gross),
      netRevenueMinor: n(r.net),
    })),
    topLinks: byLink.map((r) => ({
      trackingLinkId: r.trackingLinkId,
      targetPath: r.targetPath,
      campaignName: r.campaignName,
      influencerName: r.influencerName,
      clicks: clicksByLinkMap.get(r.trackingLinkId) ?? 0,
      orders: n(r.orders),
      netRevenueMinor: n(r.net),
    })),
    topProducts: byProduct.map((r) => ({
      productId: r.productId,
      productTitle: r.title ?? r.productId,
      orders: n(r.orders),
      grossRevenueMinor: n(r.gross),
    })),
  };
}

async function exportRowsImpl(db: PrismaLike, storeId: string, f: AnalyticsFilters): Promise<AttributionExportRow[]> {
  const aw = attrWhere(storeId, f);
  const rows = await db.$queryRaw<
    {
      orderId: string;
      orderNumber: string;
      attributedAt: Date;
      influencerName: string;
      influencerCode: string;
      campaignName: string;
      targetPath: string | null;
      currency: string;
      gross: bigint;
      refunded: bigint;
      net: bigint;
    }[]
  >(
    Prisma.sql`SELECT a."orderId", o."orderNumber", a."attributedAt", i."name" AS "influencerName",
      i."code" AS "influencerCode", cam."name" AS "campaignName", l."targetPath", a."currency",
      a."grossRevenueMinor" AS gross, a."refundedRevenueMinor" AS refunded, a."netRevenueMinor" AS net
      FROM "OrderAttribution" a
      JOIN "Order" o ON o."id" = a."orderId"
      JOIN "Influencer" i ON i."id" = a."influencerId"
      JOIN "InfluencerCampaign" cam ON cam."id" = a."campaignId"
      LEFT JOIN "InfluencerTrackingLink" l ON l."id" = a."trackingLinkId"
      WHERE ${aw} ORDER BY a."attributedAt" DESC LIMIT 10000`,
  );
  return rows.map((r) => ({
    orderId: r.orderId,
    orderNumber: r.orderNumber,
    attributedAt: r.attributedAt,
    influencerName: r.influencerName,
    influencerCode: r.influencerCode,
    campaignName: r.campaignName,
    trackingLinkTarget: r.targetPath,
    currency: r.currency,
    grossRevenueMinor: n(r.gross),
    refundedRevenueMinor: n(r.refunded),
    netRevenueMinor: n(r.net),
  }));
}

function n(value: bigint | number): number {
  return typeof value === "bigint" ? Number(value) : value;
}

// Re-export SAF çekirdek yardımcıları (routes tek yerden alsın diye).
export { computeNetRevenueMinor, isRapidRepeatClick, CLICK_DEDUPE_WINDOW_SECONDS };
