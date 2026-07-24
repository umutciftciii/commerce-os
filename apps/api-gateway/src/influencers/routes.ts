/**
 * TODO-160 (ADR-102…107) — Influencer Tracking & Attribution — HTTP route katmanı.
 *
 * İki yüzey:
 *  - Admin (platform-admin bearer): influencer/campaign/tracking-link CRUD +
 *    attribution dashboard + CSV export. Tümü `/stores/:storeId/...`, storeId
 *    URL'den + `requireStoreAdmin` guard'ı; her sorgu tenant-izole.
 *  - Public (auth YOK): `POST /public/stores/:slug/track/:token` — token çöz,
 *    aktiflik/pencere kontrol, click kaydet (KVKK: yalnız hash), GATEWAY-imzalı
 *    grant + güvenli hedef döndür. Open-redirect yok; write başarısızsa redirect
 *    yine devam eder; invalid token → 404 (storefront güvenli fallback yapar).
 *
 * Order attribution için PUBLIC WRITE ENDPOINT YOK (ADR-102): attribution yalnız
 * gerçek checkout transaction'ının yan etkisidir (bkz. server.ts checkout handler).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@commerce-os/config";
import {
  ADMIN_LIST_DEFAULT_PAGE_SIZE,
  buildAdminListPagination,
  influencerCampaignCreateRequestSchema,
  influencerCampaignDetailResponseSchema,
  influencerCampaignListQuerySchema,
  influencerCampaignListResponseSchema,
  influencerCampaignUpdateRequestSchema,
  influencerCreateRequestSchema,
  influencerDetailResponseSchema,
  influencerListQuerySchema,
  influencerListResponseSchema,
  influencerUpdateRequestSchema,
  influencerAnalyticsQuerySchema,
  influencerAnalyticsResponseSchema,
  resolveAdminListPage,
  trackClickResponseSchema,
  trackingLinkCreateRequestSchema,
  trackingLinkCreateResponseSchema,
  trackingLinkDetailResponseSchema,
  trackingLinkListQuerySchema,
  trackingLinkListResponseSchema,
  trackingLinkUpdateRequestSchema,
  type InfluencerCampaignSummary,
  type InfluencerSummary,
  type TrackingLinkSummary,
  type TrackingLinkWithUrl,
} from "@commerce-os/contracts";
import type {
  AnalyticsFilters,
  InfluencerCampaignRecord,
  InfluencerData,
  InfluencerRecord,
  TrackingLinkListRow,
} from "./data.js";
import {
  clampAttributionWindowDays,
  computeAttributionExpiry,
  computeAttributionMetrics,
  generateTrackingToken,
  hashIdentifier,
  hashTrackingToken,
  isBotUserAgent,
  isRapidRepeatClick,
  isValidTrackingTokenFormat,
  isWithinAttributionWindow,
  resolveReferrerHost,
  resolveSafeTargetPath,
  signAttributionGrant,
  DEFAULT_ATTRIBUTION_COOKIE_TTL_DAYS,
  DEFAULT_CLICK_DEDUPE_WINDOW_SECONDS,
  type RateLimiter,
} from "./tracking-core.js";

type AuditFn = (input: {
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "SYSTEM";
  platformUserId?: string;
  storeId?: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) => Promise<unknown>;

export interface InfluencerAdminRoutesDeps {
  config: AppConfig;
  data: InfluencerData;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  recordAudit: AuditFn;
  /** Kopyalanabilir tam tracking URL'sini üretir (STOREFRONT_PUBLIC_BASE_URL). */
  buildTrackingUrl: (token: string) => string;
}

export interface PublicTrackingRoutesDeps {
  data: InfluencerData;
  config: AppConfig;
  resolvePublicStore: (slug: string) => Promise<{ id: string; slug: string } | null>;
  logger: { warn: (m: string, meta?: Record<string, unknown>) => void };
  /** IP başına public track rate limiter (SAF, injectable). */
  rateLimiter: RateLimiter;
  /** Test enjekte edebilsin diye saat (varsayılan Date.now). */
  now?: () => number;
}

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

function clientIp(request: FastifyRequest): string {
  const fwd = request.headers["x-forwarded-for"];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  return (first?.split(",")[0].trim() || request.ip || "").trim();
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const v = request.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

// ── Serialize (record → contract DTO; iç alan sızmaz) ───────────────────────
function toInfluencerSummary(r: InfluencerRecord & { campaignCount: number }): InfluencerSummary {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    email: r.email,
    status: r.status,
    campaignCount: r.campaignCount,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toCampaignSummary(
  r: InfluencerCampaignRecord & { influencerName: string; linkCount: number },
): InfluencerCampaignSummary {
  return {
    id: r.id,
    influencerId: r.influencerId,
    influencerName: r.influencerName,
    name: r.name,
    status: r.status,
    attributionWindowDays: r.attributionWindowDays,
    startsAt: r.startsAt?.toISOString() ?? null,
    endsAt: r.endsAt?.toISOString() ?? null,
    linkCount: r.linkCount,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// Liste/detay projeksiyonu: plain token/URL YOK (ADR-102 revizyon).
function toLinkSummary(r: TrackingLinkListRow): TrackingLinkSummary {
  return {
    id: r.id,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    influencerId: r.influencerId,
    influencerName: r.influencerName,
    targetType: r.targetType,
    targetPath: r.targetPath,
    productId: r.productId,
    productTitle: r.productTitle,
    categoryId: r.categoryId,
    categoryTitle: r.categoryTitle,
    utmSource: r.utmSource,
    utmMedium: r.utmMedium,
    utmCampaign: r.utmCampaign,
    status: r.status,
    totalClicks: r.totalClicks,
    attributedOrders: r.attributedOrders,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// Oluşturma/yenileme: özet + TEK SEFERLİK plain URL (plainToken çağırana özel döner).
function toLinkWithUrl(r: TrackingLinkListRow, plainToken: string, buildUrl: (token: string) => string): TrackingLinkWithUrl {
  return { ...toLinkSummary(r), url: buildUrl(plainToken) };
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// ── Admin routes ────────────────────────────────────────────────────────────
export function registerInfluencerAdminRoutes(app: FastifyInstance, deps: InfluencerAdminRoutesDeps): void {
  const { config, data, requireStoreAdmin, recordAudit, buildTrackingUrl } = deps;

  // ---- Influencer CRUD --------------------------------------------------
  app.get("/stores/:storeId/influencers", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = influencerListQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const q = parsed.data;
    const pageInfo = resolveAdminListPage(q, ADMIN_LIST_DEFAULT_PAGE_SIZE);
    const { items, total } = await data.listInfluencers(
      storeId,
      { status: q.status },
      { ...pageInfo, sortBy: q.sortBy ?? "createdAt", sortOrder: q.sortOrder ?? "desc", search: q.search },
    );
    return reply.send(
      influencerListResponseSchema.parse({
        data: items.map(toInfluencerSummary),
        pagination: buildAdminListPagination({ page: pageInfo.page, pageSize: pageInfo.pageSize, totalItems: total }),
      }),
    );
  });

  app.post("/stores/:storeId/influencers", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = influencerCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid influencer."));
    const b = parsed.data;
    const result = await data.createInfluencer(storeId, {
      name: b.name,
      code: b.code.toUpperCase(),
      email: b.email ?? null,
      status: b.status ?? "ACTIVE",
      notes: b.notes ?? null,
    });
    if (result === "CODE_TAKEN") return reply.code(409).send(errorBody("CODE_TAKEN", "Code already in use."));
    await recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId,
      entityType: "Influencer",
      entityId: result.id,
    });
    return reply.code(201).send(
      influencerDetailResponseSchema.parse({
        data: { ...toInfluencerSummary({ ...result, campaignCount: 0 }), notes: result.notes },
      }),
    );
  });

  app.get("/stores/:storeId/influencers/:id", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const row = await data.getInfluencer(storeId, id);
    if (!row) return reply.code(404).send(errorBody("NOT_FOUND", "Influencer not found."));
    return reply.send(
      influencerDetailResponseSchema.parse({ data: { ...toInfluencerSummary({ ...row, campaignCount: 0 }), notes: row.notes } }),
    );
  });

  app.patch("/stores/:storeId/influencers/:id", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = influencerUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid influencer."));
    const b = parsed.data;
    const result = await data.updateInfluencer(storeId, id, {
      ...(b.name !== undefined ? { name: b.name } : {}),
      ...(b.code !== undefined ? { code: b.code.toUpperCase() } : {}),
      ...(b.email !== undefined ? { email: b.email ?? null } : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
      ...(b.notes !== undefined ? { notes: b.notes ?? null } : {}),
    });
    if (result === null) return reply.code(404).send(errorBody("NOT_FOUND", "Influencer not found."));
    if (result === "CODE_TAKEN") return reply.code(409).send(errorBody("CODE_TAKEN", "Code already in use."));
    await recordAudit({ action: "UPDATE", platformUserId: access.actorUserId, storeId, entityType: "Influencer", entityId: id });
    return reply.send(
      influencerDetailResponseSchema.parse({ data: { ...toInfluencerSummary({ ...result, campaignCount: 0 }), notes: result.notes } }),
    );
  });

  // ---- Campaign CRUD ----------------------------------------------------
  app.get("/stores/:storeId/influencer-campaigns", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = influencerCampaignListQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const q = parsed.data;
    const pageInfo = resolveAdminListPage(q, ADMIN_LIST_DEFAULT_PAGE_SIZE);
    const { items, total } = await data.listCampaigns(
      storeId,
      { status: q.status, influencerId: q.influencerId },
      { ...pageInfo, sortBy: q.sortBy ?? "createdAt", sortOrder: q.sortOrder ?? "desc", search: q.search },
    );
    return reply.send(
      influencerCampaignListResponseSchema.parse({
        data: items.map(toCampaignSummary),
        pagination: buildAdminListPagination({ page: pageInfo.page, pageSize: pageInfo.pageSize, totalItems: total }),
      }),
    );
  });

  app.post("/stores/:storeId/influencer-campaigns", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = influencerCampaignCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid campaign."));
    const b = parsed.data;
    const result = await data.createCampaign(storeId, {
      influencerId: b.influencerId,
      name: b.name,
      status: b.status ?? "ACTIVE",
      attributionWindowDays: clampAttributionWindowDays(b.attributionWindowDays),
      startsAt: parseDate(b.startsAt ?? undefined) ?? null,
      endsAt: parseDate(b.endsAt ?? undefined) ?? null,
    });
    if (result === "INFLUENCER_NOT_FOUND") return reply.code(404).send(errorBody("INFLUENCER_NOT_FOUND", "Influencer not found."));
    await recordAudit({ action: "CREATE", platformUserId: access.actorUserId, storeId, entityType: "InfluencerCampaign", entityId: result.id });
    return reply.code(201).send(influencerCampaignDetailResponseSchema.parse({ data: toCampaignSummary(result) }));
  });

  app.get("/stores/:storeId/influencer-campaigns/:id", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const row = await data.getCampaign(storeId, id);
    if (!row) return reply.code(404).send(errorBody("NOT_FOUND", "Campaign not found."));
    return reply.send(influencerCampaignDetailResponseSchema.parse({ data: toCampaignSummary(row) }));
  });

  app.patch("/stores/:storeId/influencer-campaigns/:id", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = influencerCampaignUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid campaign."));
    const b = parsed.data;
    const result = await data.updateCampaign(storeId, id, {
      ...(b.name !== undefined ? { name: b.name } : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
      ...(b.attributionWindowDays !== undefined ? { attributionWindowDays: clampAttributionWindowDays(b.attributionWindowDays) } : {}),
      ...(b.startsAt !== undefined ? { startsAt: parseDate(b.startsAt ?? undefined) ?? null } : {}),
      ...(b.endsAt !== undefined ? { endsAt: parseDate(b.endsAt ?? undefined) ?? null } : {}),
    });
    if (!result) return reply.code(404).send(errorBody("NOT_FOUND", "Campaign not found."));
    await recordAudit({ action: "UPDATE", platformUserId: access.actorUserId, storeId, entityType: "InfluencerCampaign", entityId: id });
    return reply.send(influencerCampaignDetailResponseSchema.parse({ data: toCampaignSummary(result) }));
  });

  // ---- Tracking link CRUD ----------------------------------------------
  app.get("/stores/:storeId/influencer-tracking-links", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = trackingLinkListQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const q = parsed.data;
    const pageInfo = resolveAdminListPage(q, ADMIN_LIST_DEFAULT_PAGE_SIZE);
    const { items, total } = await data.listTrackingLinks(
      storeId,
      { status: q.status, campaignId: q.campaignId, influencerId: q.influencerId },
      { ...pageInfo, sortBy: q.sortBy ?? "createdAt", sortOrder: q.sortOrder ?? "desc", search: q.search },
    );
    return reply.send(
      trackingLinkListResponseSchema.parse({
        data: items.map((r) => toLinkSummary(r)),
        pagination: buildAdminListPagination({ page: pageInfo.page, pageSize: pageInfo.pageSize, totalItems: total }),
      }),
    );
  });

  app.post("/stores/:storeId/influencer-tracking-links", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = trackingLinkCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid tracking link."));
    const b = parsed.data;

    // Hedefi SUNUCUDA güvenli iç yola çöz (open-redirect yok; ürün/kategori slug'a).
    let targetPath = "/";
    let productId: string | null = null;
    let categoryId: string | null = null;
    if (b.targetType === "PRODUCT") {
      const product = await data.resolveProductTarget(storeId, b.productId!);
      if (!product) return reply.code(404).send(errorBody("PRODUCT_NOT_FOUND", "Product not found."));
      productId = b.productId!;
      targetPath = resolveSafeTargetPath({ targetType: "PRODUCT", targetPath: `/products/${product.slug}` });
    } else if (b.targetType === "CATEGORY") {
      const category = await data.resolveCategoryTarget(storeId, b.categoryId!);
      if (!category) return reply.code(404).send(errorBody("CATEGORY_NOT_FOUND", "Category not found."));
      categoryId = b.categoryId!;
      targetPath = resolveSafeTargetPath({ targetType: "CATEGORY", targetPath: `/c/${category.slug}` });
    } else if (b.targetType === "PATH") {
      targetPath = resolveSafeTargetPath({ targetType: "PATH", targetPath: b.targetPath ?? "/" });
    } else {
      targetPath = "/";
    }

    // Plain token üret → HMAC hash sakla. Plain URL YALNIZ bu yanıtta bir kez döner.
    // Token çakışması olası olmasa da (144-bit) her denemede yeni token ile retry.
    let result: TrackingLinkListRow | "CAMPAIGN_NOT_FOUND" | "TOKEN_COLLISION" = "TOKEN_COLLISION";
    let plainToken = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      plainToken = generateTrackingToken();
      result = await data.createTrackingLink(storeId, {
        campaignId: b.campaignId,
        tokenHash: hashTrackingToken(plainToken, config.SESSION_SECRET),
        targetType: b.targetType,
        targetPath,
        productId,
        categoryId,
        utmSource: b.utmSource ?? null,
        utmMedium: b.utmMedium ?? null,
        utmCampaign: b.utmCampaign ?? null,
      });
      if (result !== "TOKEN_COLLISION") break;
    }
    if (result === "CAMPAIGN_NOT_FOUND") return reply.code(404).send(errorBody("CAMPAIGN_NOT_FOUND", "Campaign not found."));
    if (result === "TOKEN_COLLISION") return reply.code(500).send(errorBody("TOKEN_COLLISION", "Could not allocate token."));
    await recordAudit({ action: "CREATE", platformUserId: access.actorUserId, storeId, entityType: "InfluencerTrackingLink", entityId: result.id });
    return reply.code(201).send(trackingLinkCreateResponseSchema.parse({ data: toLinkWithUrl(result, plainToken, buildTrackingUrl) }));
  });

  // Yenileme (rotation): yeni token üretir, eskisini GEÇERSİZ kılar; plain URL bir kez döner.
  app.post("/stores/:storeId/influencer-tracking-links/:id/regenerate", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    let result: TrackingLinkListRow | null | "TOKEN_COLLISION" = "TOKEN_COLLISION";
    let plainToken = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      plainToken = generateTrackingToken();
      result = await data.regenerateTrackingLinkToken(storeId, id, hashTrackingToken(plainToken, config.SESSION_SECRET));
      if (result !== "TOKEN_COLLISION") break;
    }
    if (result === null) return reply.code(404).send(errorBody("NOT_FOUND", "Tracking link not found."));
    if (result === "TOKEN_COLLISION") return reply.code(500).send(errorBody("TOKEN_COLLISION", "Could not allocate token."));
    await recordAudit({ action: "UPDATE", platformUserId: access.actorUserId, storeId, entityType: "InfluencerTrackingLink", entityId: id, metadata: { action: "regenerate" } });
    return reply.send(trackingLinkCreateResponseSchema.parse({ data: toLinkWithUrl(result, plainToken, buildTrackingUrl) }));
  });

  app.get("/stores/:storeId/influencer-tracking-links/:id", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const row = await data.getTrackingLink(storeId, id);
    if (!row) return reply.code(404).send(errorBody("NOT_FOUND", "Tracking link not found."));
    return reply.send(trackingLinkDetailResponseSchema.parse({ data: toLinkSummary(row) }));
  });

  app.patch("/stores/:storeId/influencer-tracking-links/:id", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = trackingLinkUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid tracking link."));
    const b = parsed.data;
    const result = await data.updateTrackingLink(storeId, id, {
      ...(b.status !== undefined ? { status: b.status } : {}),
      ...(b.utmSource !== undefined ? { utmSource: b.utmSource ?? null } : {}),
      ...(b.utmMedium !== undefined ? { utmMedium: b.utmMedium ?? null } : {}),
      ...(b.utmCampaign !== undefined ? { utmCampaign: b.utmCampaign ?? null } : {}),
    });
    if (!result) return reply.code(404).send(errorBody("NOT_FOUND", "Tracking link not found."));
    await recordAudit({ action: "UPDATE", platformUserId: access.actorUserId, storeId, entityType: "InfluencerTrackingLink", entityId: id });
    return reply.send(trackingLinkDetailResponseSchema.parse({ data: toLinkSummary(result) }));
  });

  // ---- Dashboard --------------------------------------------------------
  app.get("/stores/:storeId/influencer-analytics", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = influencerAnalyticsQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const filters = toAnalyticsFilters(parsed.data);
    const result = await data.getAnalytics(storeId, filters);
    const metrics = computeAttributionMetrics({
      totalClicks: result.summary.totalClicks,
      uniqueVisitors: result.summary.uniqueVisitors,
      attributedOrders: result.summary.attributedOrders,
      grossRevenueMinor: result.summary.grossRevenueMinor,
      refundedRevenueMinor: result.summary.refundedRevenueMinor,
      netRevenueMinor: result.summary.netRevenueMinor,
    });
    return reply.send(
      influencerAnalyticsResponseSchema.parse({
        data: {
          summary: {
            totalClicks: metrics.totalClicks,
            uniqueVisitors: metrics.uniqueVisitors,
            attributedOrders: metrics.attributedOrders,
            conversionRate: metrics.conversionRate,
            grossRevenueMinor: metrics.grossRevenueMinor,
            refundedRevenueMinor: metrics.refundedRevenueMinor,
            netRevenueMinor: metrics.netRevenueMinor,
            averageOrderValueMinor: metrics.averageOrderValueMinor,
            currency: result.summary.currency,
          },
          daily: result.daily,
          influencers: result.influencers,
          campaigns: result.campaigns,
          topLinks: result.topLinks.map((l) => ({
            trackingLinkId: l.trackingLinkId,
            campaignName: l.campaignName,
            influencerName: l.influencerName,
            targetPath: l.targetPath,
            clicks: l.clicks,
            orders: l.orders,
            netRevenueMinor: l.netRevenueMinor,
          })),
          topProducts: result.topProducts,
        },
      }),
    );
  });

  // ---- CSV export (aynı filtreler, tenant-safe) -------------------------
  app.get("/stores/:storeId/influencer-analytics/export", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = influencerAnalyticsQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const rows = await data.exportRows(storeId, toAnalyticsFilters(parsed.data));
    const header = [
      "orderNumber",
      "attributedAt",
      "influencerName",
      "influencerCode",
      "campaignName",
      "trackingTarget",
      "currency",
      "grossRevenueMinor",
      "refundedRevenueMinor",
      "netRevenueMinor",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          csvCell(r.orderNumber),
          csvCell(r.attributedAt.toISOString()),
          csvCell(r.influencerName),
          csvCell(r.influencerCode),
          csvCell(r.campaignName),
          csvCell(r.trackingLinkTarget ?? ""),
          csvCell(r.currency),
          String(r.grossRevenueMinor),
          String(r.refundedRevenueMinor),
          String(r.netRevenueMinor),
        ].join(","),
      );
    }
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="influencer-attribution.csv"`);
    return reply.send(lines.join("\r\n"));
  });
}

function toAnalyticsFilters(q: {
  dateFrom?: string;
  dateTo?: string;
  influencerId?: string;
  campaignId?: string;
  trackingLinkId?: string;
}): AnalyticsFilters {
  return {
    dateFrom: parseDate(q.dateFrom),
    // dateTo INCLUSIVE gün: verilen günün sonuna kadar (< dateTo+1gün). Sadece tarih
    // (saatsiz) verilirse gün sonuna genişletilir.
    dateTo: expandDateTo(q.dateTo),
    influencerId: q.influencerId,
    campaignId: q.campaignId,
    trackingLinkId: q.trackingLinkId,
  };
}

function expandDateTo(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  // Yalnız gün verilmişse (YYYY-MM-DD) → ertesi günün başlangıcı (yarı-açık aralık).
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }
  return d;
}

/** CSV injection + ayraç/qoute güvenli hücre (formül-önek prefix + kaçış). */
function csvCell(value: string): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`; // formül enjeksiyonu önle
  if (/[",\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

// ── Public tracking route ────────────────────────────────────────────────────
export function registerPublicTrackingRoutes(app: FastifyInstance, deps: PublicTrackingRoutesDeps): void {
  const { data, config, resolvePublicStore, logger, rateLimiter } = deps;
  const now = deps.now ?? (() => Date.now());
  const cookieTtlSeconds = DEFAULT_ATTRIBUTION_COOKIE_TTL_DAYS * 24 * 60 * 60;

  app.post("/public/stores/:storeSlug/track/:token", async (request, reply) => {
    const { storeSlug, token } = request.params as { storeSlug: string; token: string };
    const ip = clientIp(request);
    const ipHash = hashIdentifier(ip, config.SESSION_SECRET);

    // Rate limit (ipHash başına) — enumeration/DoS yavaşlatma.
    if (!rateLimiter.hit(ipHash ?? ip ?? "anon", now())) {
      return reply.code(429).send(errorBody("RATE_LIMITED", "Too many requests."));
    }
    // Biçim kontrolü (DB'ye gitmeden reddet).
    if (!isValidTrackingTokenFormat(token)) {
      return reply.code(404).send(errorBody("NOT_FOUND", "Invalid link."));
    }
    const store = await resolvePublicStore(storeSlug);
    if (!store) return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));

    // Gelen plain token'ı HMAC hash'leyip tokenHash üzerinden ara (plain saklanmaz).
    const resolved = await data.resolveTrackingLinkByTokenHash(
      store.id,
      hashTrackingToken(token, config.SESSION_SECRET),
    );
    if (!resolved) return reply.code(404).send(errorBody("NOT_FOUND", "Invalid link."));

    const { link, campaign, influencer } = resolved;
    const nowMs = now();
    const targetPath = resolveSafeTargetPath({ targetType: link.targetType, targetPath: link.targetPath });

    // Aktiflik + pencere: link/kampanya/influencer ACTIVE + kampanya tarih aralığı.
    const active =
      link.status === "ACTIVE" &&
      campaign.status === "ACTIVE" &&
      influencer.status === "ACTIVE" &&
      (!campaign.startsAt || campaign.startsAt.getTime() <= nowMs) &&
      (!campaign.endsAt || campaign.endsAt.getTime() >= nowMs);

    if (!active) {
      // Redirect-only: kullanıcı hedefe gider ama attribution YOK (grant null).
      return reply.send(
        trackClickResponseSchema.parse({ data: { grant: null, targetPath, cookieMaxAgeSeconds: cookieTtlSeconds } }),
      );
    }

    // KVKK: yalnız tuzlu hash + referrer host (ham IP/UA saklanmaz).
    const userAgent = headerValue(request, "user-agent");
    const referrer = headerValue(request, "referer") ?? headerValue(request, "referrer");
    const visitorIdRaw = headerValue(request, "x-visitor-id") ?? "";
    const sessionRaw = headerValue(request, "x-customer-session") ?? null;
    const isBot = isBotUserAgent(userAgent);
    // visitorIdHash zorunlu: ziyaretçi id yoksa ip+ua'dan türet (yine hash'lenir).
    const visitorSeed = visitorIdRaw || `${ip}|${userAgent ?? ""}`;
    const visitorIdHash = hashIdentifier(visitorSeed, config.SESSION_SECRET) ?? "anon";

    // Rapid-repeat dedupe: aynı ziyaretçi+link kısa pencerede → yeni satır AÇMA.
    let clickId = "";
    try {
      const lastClickAt = await data.findLastClickAt(store.id, link.id, visitorIdHash);
      const dedupe = isRapidRepeatClick(lastClickAt?.getTime() ?? null, nowMs, DEFAULT_CLICK_DEDUPE_WINDOW_SECONDS);
      if (!dedupe) {
        const inserted = await data.insertClick({
          storeId: store.id,
          campaignId: campaign.id,
          trackingLinkId: link.id,
          visitorIdHash,
          sessionIdHash: sessionRaw ? hashIdentifier(sessionRaw, config.SESSION_SECRET) : null,
          ipHash,
          userAgentHash: hashIdentifier(userAgent, config.SESSION_SECRET),
          referrerHost: resolveReferrerHost(referrer),
          landingPath: targetPath,
          isBot,
        });
        clickId = inserted.id;
      }
    } catch {
      // Click yazımı başarısız olsa bile redirect + attribution grant DEVAM EDER.
      logger.warn("attribution click insert failed", { storeId: store.id, linkId: link.id });
    }

    // GATEWAY-imzalı grant: içindeki influencer/campaign'e checkout DÜZ güvenmez.
    const clickedAt = nowMs;
    const expiresAt = computeAttributionExpiry(clickedAt, campaign.attributionWindowDays);
    const grant = signAttributionGrant(
      {
        v: 1,
        storeId: store.id,
        influencerId: influencer.id,
        campaignId: campaign.id,
        trackingLinkId: link.id,
        clickId,
        clickedAt,
        expiresAt,
      },
      config.SESSION_SECRET,
    );
    const windowSeconds = Math.min(cookieTtlSeconds, Math.ceil((expiresAt - clickedAt) / 1000));
    return reply.send(
      trackClickResponseSchema.parse({
        data: { grant, targetPath, cookieMaxAgeSeconds: Math.max(60, windowSeconds) },
      }),
    );
  });
}

/**
 * Checkout handler için: grant'i doğrular ve influencer/campaign/link aktifliğini +
 * pencereyi DB'den YENİDEN doğrular; geçerliyse OrderAttribution snapshot'ı için
 * çözülmüş attribution döner. Bu fonksiyon SUNUCU-otoriterdir — istemci alanlarına
 * güvenmez (grant gateway-imzalı). server.ts checkout handler'ından çağrılır.
 */
export { isWithinAttributionWindow };
