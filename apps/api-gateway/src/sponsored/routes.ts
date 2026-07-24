/**
 * TODO-161 (ADR-114…120) — Sponsored Product Management — HTTP route katmanı.
 *
 * İki yüzey:
 *  - Admin (platform-admin bearer): kampanya CRUD (ürün/keyword atomik replace-set) +
 *    performans dashboard + CSV export. Tümü `/stores/:storeId/...`, storeId URL'den +
 *    `requireStoreAdmin` guard'ı; her sorgu tenant-izole.
 *  - Public (auth YOK): `POST /public/stores/:slug/sponsored/events` — GATEWAY-imzalı
 *    token doğrula → impression/click/cart event kaydet (KVKK: yalnız hash; bot dışla;
 *    repeat dedupe). İstemci campaign/product BELİRLEYEMEZ (yalnız imzalı token'a güvenilir).
 *
 * Order/refund attribution için PUBLIC WRITE ENDPOINT YOK (ADR-118): yalnız gerçek checkout
 * transaction'ının yan etkisidir (bkz. server.ts + checkout-attribution.ts).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@commerce-os/config";
import {
  ADMIN_LIST_DEFAULT_PAGE_SIZE,
  buildAdminListPagination,
  resolveAdminListPage,
  sponsoredAnalyticsQuerySchema,
  sponsoredAnalyticsResponseSchema,
  sponsoredCampaignCreateRequestSchema,
  sponsoredCampaignDetailResponseSchema,
  sponsoredCampaignListQuerySchema,
  sponsoredCampaignListResponseSchema,
  sponsoredCampaignUpdateRequestSchema,
  sponsoredEventRequestSchema,
  sponsoredEventResponseSchema,
  type SponsoredCampaignDetail,
  type SponsoredCampaignSummary,
} from "@commerce-os/contracts";
import type { SponsoredCampaignWithMeta as WithMeta, SponsoredCampaignDetail as DetailRecord, SponsoredData } from "./data.js";
import {
  computeSponsoredMetrics,
  hashIdentifier,
  isBotUserAgent,
  normalizeKeyword,
  verifySponsoredToken,
  isWithinSponsoredWindow,
  SPONSORED_EVENT_DEDUPE_WINDOW_SECONDS,
  type RateLimiter,
} from "./sponsored-core.js";

type AuditFn = (input: {
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "SYSTEM";
  platformUserId?: string;
  storeId?: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) => Promise<unknown>;

export interface SponsoredAdminRoutesDeps {
  config: AppConfig;
  data: SponsoredData;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  recordAudit: AuditFn;
}

export interface SponsoredPublicRoutesDeps {
  data: SponsoredData;
  config: AppConfig;
  resolvePublicStore: (slug: string) => Promise<{ id: string; slug: string } | null>;
  logger: { warn: (m: string, meta?: Record<string, unknown>) => void };
  rateLimiter: RateLimiter;
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

// ── Serialize (record → contract DTO; iç alan sızmaz) ───────────────────────────
function toCampaignSummary(r: WithMeta, now: Date): SponsoredCampaignSummary {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    placement: r.placement,
    startsAt: r.startsAt?.toISOString() ?? null,
    endsAt: r.endsAt?.toISOString() ?? null,
    priority: r.priority,
    maxSlots: r.maxSlots,
    targetCategoryId: r.targetCategoryId,
    targetCategoryLabel: r.targetCategoryLabel,
    timezone: r.timezone,
    productCount: r.productCount,
    keywordCount: r.keywordCount,
    isLive: computeIsLive(r, now),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function computeIsLive(r: { status: string; startsAt: Date | null; endsAt: Date | null }, now: Date): boolean {
  if (r.status !== "ACTIVE") return false;
  if (r.startsAt && r.startsAt > now) return false;
  if (r.endsAt && r.endsAt <= now) return false;
  return true;
}

function toCampaignDetail(r: DetailRecord, now: Date): SponsoredCampaignDetail {
  return {
    ...toCampaignSummary(r, now),
    products: r.products.map((p) => ({
      productId: p.productId,
      title: p.title,
      slug: p.slug,
      position: p.position,
      priority: p.priority,
      eligible: p.eligible,
    })),
    keywords: r.keywords,
  };
}

function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Route normalize + tekilleştirir; boş kelimeler atılır. */
function normalizeKeywords(raw: string[] | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of raw) {
    const norm = normalizeKeyword(k);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

// ── Admin routes ────────────────────────────────────────────────────────────────
export function registerSponsoredAdminRoutes(app: FastifyInstance, deps: SponsoredAdminRoutesDeps): void {
  const { data, requireStoreAdmin, recordAudit } = deps;

  app.get("/stores/:storeId/sponsored-campaigns", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsoredCampaignListQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const q = parsed.data;
    const pageInfo = resolveAdminListPage(q, ADMIN_LIST_DEFAULT_PAGE_SIZE);
    const now = new Date();
    const { items, total } = await data.listCampaigns(
      storeId,
      { status: q.status, placement: q.placement },
      { ...pageInfo, sortBy: q.sortBy ?? "createdAt", sortOrder: q.sortOrder ?? "desc", search: q.search },
      now,
    );
    return reply.send(
      sponsoredCampaignListResponseSchema.parse({
        data: items.map((i) => toCampaignSummary(i, now)),
        pagination: buildAdminListPagination({ page: pageInfo.page, pageSize: pageInfo.pageSize, totalItems: total }),
      }),
    );
  });

  app.post("/stores/:storeId/sponsored-campaigns", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsoredCampaignCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid campaign."));
    const b = parsed.data;
    const created = await data.createCampaign(storeId, {
      name: b.name,
      placement: b.placement,
      status: b.status,
      startsAt: parseDate(b.startsAt) ?? null,
      endsAt: parseDate(b.endsAt) ?? null,
      priority: b.priority,
      maxSlots: b.maxSlots,
      targetCategoryId: b.targetCategoryId ?? null,
      timezone: b.timezone,
      productIds: b.productIds,
      keywords: normalizeKeywords(b.keywords),
    });
    if (created === "INVALID_CATEGORY") return reply.code(400).send(errorBody("INVALID_CATEGORY", "Category not found for this store."));
    await recordAudit({ action: "CREATE", platformUserId: access.actorUserId, storeId, entityType: "SponsoredProductCampaign", entityId: created.id });
    const detail = await data.getCampaignDetail(storeId, created.id, new Date());
    return reply.code(201).send(sponsoredCampaignDetailResponseSchema.parse({ data: toCampaignDetail(detail!, new Date()) }));
  });

  app.get("/stores/:storeId/sponsored-campaigns/:id", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const now = new Date();
    const detail = await data.getCampaignDetail(storeId, id, now);
    if (!detail) return reply.code(404).send(errorBody("NOT_FOUND", "Campaign not found."));
    return reply.send(sponsoredCampaignDetailResponseSchema.parse({ data: toCampaignDetail(detail, now) }));
  });

  app.patch("/stores/:storeId/sponsored-campaigns/:id", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsoredCampaignUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid campaign."));
    const b = parsed.data;
    const result = await data.updateCampaign(storeId, id, {
      ...(b.name !== undefined ? { name: b.name } : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
      ...(b.startsAt !== undefined ? { startsAt: parseDate(b.startsAt) ?? null } : {}),
      ...(b.endsAt !== undefined ? { endsAt: parseDate(b.endsAt) ?? null } : {}),
      ...(b.priority !== undefined ? { priority: b.priority } : {}),
      ...(b.maxSlots !== undefined ? { maxSlots: b.maxSlots } : {}),
      ...(b.targetCategoryId !== undefined ? { targetCategoryId: b.targetCategoryId ?? null } : {}),
      ...(b.timezone !== undefined ? { timezone: b.timezone } : {}),
      ...(b.productIds !== undefined ? { productIds: b.productIds } : {}),
      ...(b.keywords !== undefined ? { keywords: normalizeKeywords(b.keywords) } : {}),
    });
    if (result === null) return reply.code(404).send(errorBody("NOT_FOUND", "Campaign not found."));
    if (result === "INVALID_CATEGORY") return reply.code(400).send(errorBody("INVALID_CATEGORY", "Category not found for this store."));
    await recordAudit({ action: "UPDATE", platformUserId: access.actorUserId, storeId, entityType: "SponsoredProductCampaign", entityId: id });
    const now = new Date();
    const detail = await data.getCampaignDetail(storeId, id, now);
    return reply.send(sponsoredCampaignDetailResponseSchema.parse({ data: toCampaignDetail(detail!, now) }));
  });

  // ---- Performans dashboard ----------------------------------------------
  app.get("/stores/:storeId/sponsored-analytics", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsoredAnalyticsQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const result = await data.getAnalytics(storeId, toAnalyticsFilters(parsed.data));
    const metrics = computeSponsoredMetrics({
      impressions: result.summary.impressions,
      uniqueImpressions: result.summary.uniqueImpressions,
      clicks: result.summary.clicks,
      carts: result.summary.carts,
      orders: result.summary.orders,
      grossRevenueMinor: result.summary.grossRevenueMinor,
      refundedRevenueMinor: result.summary.refundedRevenueMinor,
      netRevenueMinor: result.summary.netRevenueMinor,
    });
    return reply.send(
      sponsoredAnalyticsResponseSchema.parse({
        data: {
          summary: {
            impressions: metrics.impressions,
            uniqueImpressions: metrics.uniqueImpressions,
            clicks: metrics.clicks,
            clickThroughRate: metrics.clickThroughRate,
            carts: metrics.carts,
            orders: metrics.orders,
            conversionRate: metrics.conversionRate,
            grossRevenueMinor: metrics.grossRevenueMinor,
            refundedRevenueMinor: metrics.refundedRevenueMinor,
            netRevenueMinor: metrics.netRevenueMinor,
            currency: result.summary.currency,
          },
          daily: result.daily,
          campaigns: result.campaigns,
          products: result.products,
          placements: result.placements,
          topSearchTerms: result.topSearchTerms,
        },
      }),
    );
  });

  // ---- CSV export (aynı filtreler, tenant-safe) --------------------------
  app.get("/stores/:storeId/sponsored-analytics/export", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsoredAnalyticsQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const rows = await data.exportRows(storeId, toAnalyticsFilters(parsed.data));
    const header = [
      "orderNumber",
      "attributedAt",
      "campaignName",
      "placement",
      "productTitle",
      "quantity",
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
          csvCell(r.campaignName),
          csvCell(r.placement),
          csvCell(r.productTitle),
          String(r.quantity),
          csvCell(r.currency),
          String(r.grossRevenueMinor),
          String(r.refundedRevenueMinor),
          String(r.netRevenueMinor),
        ].join(","),
      );
    }
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="sponsored-performance.csv"`);
    return reply.send(lines.join("\r\n"));
  });
}

function toAnalyticsFilters(q: {
  dateFrom?: string;
  dateTo?: string;
  campaignId?: string;
  placement?: "HOME_SHOWCASE" | "SEARCH_RESULTS";
  productId?: string;
}) {
  return {
    dateFrom: parseAnalyticsDate(q.dateFrom),
    dateTo: expandDateTo(q.dateTo),
    campaignId: q.campaignId,
    placement: q.placement,
    productId: q.productId,
  };
}

function parseAnalyticsDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function expandDateTo(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return new Date(d.getTime() + 24 * 60 * 60 * 1000);
  return d;
}

/** CSV injection + ayraç/quote güvenli hücre (formül-önek prefix + kaçış). */
function csvCell(value: string): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

// ── Public event route ────────────────────────────────────────────────────────
export function registerSponsoredPublicRoutes(app: FastifyInstance, deps: SponsoredPublicRoutesDeps): void {
  const { data, config, resolvePublicStore, logger, rateLimiter } = deps;
  const now = deps.now ?? (() => Date.now());

  app.post("/public/stores/:storeSlug/sponsored/events", async (request, reply) => {
    const { storeSlug } = request.params as { storeSlug: string };
    const ip = clientIp(request);
    const ipHash = hashIdentifier(ip, config.SESSION_SECRET);

    if (!rateLimiter.hit(ipHash ?? ip ?? "anon", now())) {
      return reply.code(429).send(errorBody("RATE_LIMITED", "Too many requests."));
    }
    const parsed = sponsoredEventRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid event."));
    const body = parsed.data;

    const store = await resolvePublicStore(storeSlug);
    if (!store) return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));

    // Token doğrula (imza + tenant + pencere). İstemci campaign/product BELİRLEYEMEZ.
    const payload = verifySponsoredToken(body.token, config.SESSION_SECRET);
    if (!payload || payload.storeId !== store.id) {
      // Sessiz kabul (200) — ölçüm ucu; geçersiz token AUDIT'e girmez, istemciye durum sızmaz.
      return reply.send(sponsoredEventResponseSchema.parse({ data: { recorded: false } }));
    }
    if (!isWithinSponsoredWindow(now(), payload.expiresAt)) {
      return reply.send(sponsoredEventResponseSchema.parse({ data: { recorded: false } }));
    }

    const userAgent = headerValue(request, "user-agent");
    const isBot = isBotUserAgent(userAgent);
    const visitorSeed = headerValue(request, "x-visitor-id") ?? `${ip}|${userAgent ?? ""}`;
    const visitorIdHash = hashIdentifier(visitorSeed, config.SESSION_SECRET);
    const sessionIdHash = hashIdentifier(headerValue(request, "x-customer-session"), config.SESSION_SECRET);

    let recorded = false;
    try {
      recorded = await data.recordEvent(store.id, {
        campaignId: payload.campaignId,
        placementId: payload.placementId,
        productId: payload.productId,
        type: body.type,
        placement: payload.placement,
        source: body.source ?? null,
        visitorIdHash,
        sessionIdHash,
        isBot,
        dedupeWindowSeconds: SPONSORED_EVENT_DEDUPE_WINDOW_SECONDS,
        now: new Date(now()),
      });
    } catch {
      logger.warn("sponsored event record failed", { storeId: store.id, type: body.type });
    }
    return reply.send(sponsoredEventResponseSchema.parse({ data: { recorded } }));
  });
}
