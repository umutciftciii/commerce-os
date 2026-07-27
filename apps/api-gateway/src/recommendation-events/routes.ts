/**
 * TD-130 (ADR-145…148) — Recommendation Measurement HTTP route katmanı.
 *
 * Public ingest ucu (`POST /public/stores/:storeSlug/recommendation-events`): store slug'dan sunucu-tarafı
 * çözülür; kimlik = customer (`x-customer-session`, öncelikli) VEYA guest visitor (`x-visitor-id` → HMAC).
 * Ek per-oturum `x-recommendation-session` → sessionHash (dedupe granülerliği). HAM IP/UA saklanmaz.
 * Bot/prefetch → event ÜRETİLMEZ (200 {recorded:false}). Rate limit (IP-hash). source/placement/type
 * ALLOWLIST + ürün/anchor store-sahipliği doğrulanır (cross-store reddi). İstemci zaman/store/gelir
 * OTORİTESİ DEĞİL. Dedupe: impression/click zaman-penceresi, add-to-cart dedupeKey idempotency.
 *
 * Admin özet ucu (`GET /stores/:storeId/recommendation-events/summary`): platform-admin + store-scope
 * (tenant-izole). Küçük funnel (impression/click/add-to-cart/CTR + source/placement kırılımı); büyük
 * raporlama YOK.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@commerce-os/config";
import {
  recommendationEventRequestSchema,
  recommendationEventResponseSchema,
  recommendationSummaryResponseSchema,
} from "@commerce-os/contracts";
import {
  createSlidingWindowLimiter,
  hashIdentifier,
  isBotUserAgent,
  type RateLimiter,
} from "../influencers/tracking-core.js";
import { resolveCustomerFromRequest, type CustomerDataAccess } from "../customers/index.js";
import { isPrefetchRequest } from "../recently-viewed/recently-viewed-core.js";
import {
  computeCtr,
  dedupeWindowSecondsFor,
  isAllowedPlacement,
  isAllowedSource,
  isWithinDedupeWindow,
  shouldRecordEvent,
  type RecommendationPlacement,
  type RecommendationSource,
} from "./event-core.js";
import type { RecommendationEventData, RecommendationEventIdentity } from "./data.js";

/** Admin özet aralığı üst sınırı (gün) — büyük tarama koruması. */
const MAX_SUMMARY_RANGE_DAYS = 366;
const DEFAULT_SUMMARY_RANGE_DAYS = 30;

export interface RecommendationEventRoutesDeps {
  config: AppConfig;
  customers: CustomerDataAccess;
  logger: { warn: (m: string, meta?: Record<string, unknown>) => void };
  resolvePublicStore: (slug: string) => Promise<{ id: string; slug: string } | null>;
  data: RecommendationEventData;
  /** Admin özet guard'ı (platform SUPER_ADMIN/SUPPORT_ADMIN + store scope). */
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  /** Opsiyonel enjekte edilebilir limiter (test); yoksa config'ten kurulur. */
  rateLimiter?: RateLimiter;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export function registerRecommendationEventRoutes(app: FastifyInstance, deps: RecommendationEventRoutesDeps): void {
  const { config, customers, data, logger } = deps;
  const rateLimiter =
    deps.rateLimiter ??
    createSlidingWindowLimiter(
      config.RECOMMENDATION_EVENT_RATE_LIMIT_MAX,
      config.RECOMMENDATION_EVENT_RATE_LIMIT_WINDOW_SECONDS * 1000,
    );

  async function requireStore(slug: string, reply: FastifyReply) {
    const store = await deps.resolvePublicStore(slug);
    if (!store) {
      reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
      return null;
    }
    return store;
  }

  function headerValue(request: FastifyRequest, name: string): string | undefined {
    const raw = request.headers[name];
    return Array.isArray(raw) ? raw[0] : raw;
  }

  /** Kimlik: customer (öncelikli) → visitorHash. sessionHash ek (opsiyonel). İkisi de yoksa null. */
  async function resolveIdentity(request: FastifyRequest, storeId: string): Promise<RecommendationEventIdentity | null> {
    const sessionHash = hashIdentifier(headerValue(request, "x-recommendation-session"), config.SESSION_SECRET) ?? undefined;
    const customer = await resolveCustomerFromRequest(request, storeId, { customers, config }).catch(() => null);
    if (customer) return { customerId: customer.id, sessionHash };
    const visitorHash = hashIdentifier(headerValue(request, "x-visitor-id"), config.SESSION_SECRET);
    if (visitorHash) return { visitorHash, sessionHash };
    return null;
  }

  function clientIpHash(request: FastifyRequest): string {
    const fwd = request.headers["x-forwarded-for"];
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim() || request.ip || "anon";
    return hashIdentifier(ip, config.SESSION_SECRET) ?? ip;
  }

  function userAgent(request: FastifyRequest): string {
    const ua = request.headers["user-agent"];
    return Array.isArray(ua) ? ua[0] ?? "" : ua ?? "";
  }

  const ok = (recorded: boolean, deduped: boolean) =>
    recommendationEventResponseSchema.parse({ data: { recorded, deduped } });

  // ── POST recommendation event (impression / click / add-to-cart) ───────────────────────────────
  app.post("/public/stores/:storeSlug/recommendation-events", async (request, reply) => {
    const { storeSlug } = request.params as { storeSlug: string };
    const store = await requireStore(storeSlug, reply);
    if (!store) return;

    if (!rateLimiter.hit(clientIpHash(request), Date.now())) {
      return reply.code(429).send(errorBody("RATE_LIMITED", "Too many requests."));
    }

    const parsed = recommendationEventRequestSchema.safeParse(request.body);
    const identity = await resolveIdentity(request, store.id);
    const isBot = isBotUserAgent(userAgent(request));
    const isPrefetch = isPrefetchRequest({
      secPurpose: request.headers["sec-purpose"],
      purpose: request.headers["purpose"],
      xPurpose: request.headers["x-purpose"],
      xMoz: request.headers["x-moz"],
    });

    const eligible = shouldRecordEvent({
      isBot,
      isPrefetch,
      hasIdentity: identity !== null,
      hasProduct: parsed.success,
    });
    if (!eligible || !parsed.success || !identity) {
      return reply.code(200).send(ok(false, false));
    }

    const { type, source, placement, productId, anchorProductId, dedupeKey } = parsed.data;

    try {
      // Ürün + anchor store-sahipliği (cross-store event reddi; enumeration guard).
      const owns = await data.productBelongsToStore(store.id, productId);
      if (!owns) return reply.code(200).send(ok(false, false));
      if (anchorProductId) {
        const anchorOwns = await data.productBelongsToStore(store.id, anchorProductId);
        if (!anchorOwns) return reply.code(200).send(ok(false, false));
      }

      const now = new Date();

      // Dedupe. ADD_TO_CART → dedupeKey idempotency (aynı dönüşüm iki kez sayılmaz).
      if (type === "ADD_TO_CART") {
        if (dedupeKey && (await data.dedupeKeyExists(store.id, dedupeKey))) {
          return reply.code(200).send(ok(false, true));
        }
      } else {
        const windowSeconds = dedupeWindowSecondsFor(type, {
          impressionSeconds: config.RECOMMENDATION_IMPRESSION_DEDUPE_SECONDS,
          clickSeconds: config.RECOMMENDATION_CLICK_DEDUPE_SECONDS,
        });
        if (windowSeconds > 0) {
          const since = new Date(now.getTime() - windowSeconds * 1000);
          const lastAt = await data.lastEventAtMs({ storeId: store.id, identity, productId, source, placement, eventType: type, since });
          if (isWithinDedupeWindow(lastAt, now.getTime(), windowSeconds)) {
            return reply.code(200).send(ok(false, true));
          }
        }
      }

      await data.insertEvent({
        storeId: store.id,
        identity,
        productId,
        anchorProductId: anchorProductId ?? null,
        source,
        placement,
        eventType: type,
        dedupeKey: type === "ADD_TO_CART" ? dedupeKey ?? null : null,
        now,
      });
      return reply.code(200).send(ok(true, false));
    } catch (error) {
      // Ölçüm hatası UX'i ETKİLEMEZ — sessiz no-op.
      logger.warn("recommendation-event.record_failed", { error: String(error) });
      return reply.code(200).send(ok(false, false));
    }
  });

  // ── GET admin summary (platform-admin; store-scope) ────────────────────────────────────────────
  app.get("/stores/:storeId/recommendation-events/summary", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await deps.requireStoreAdmin(request, reply, storeId);
    if (!access) return;

    const query = request.query as { from?: string; to?: string; source?: string; placement?: string };

    const parseDate = (raw: string | undefined): Date | null => {
      if (!raw) return null;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const now = new Date();
    let to = parseDate(query.to) ?? now;
    let from = parseDate(query.from) ?? new Date(to.getTime() - DEFAULT_SUMMARY_RANGE_DAYS * 86_400_000);
    if (from.getTime() > to.getTime()) [from, to] = [to, from];
    // Aralık üst sınırı (büyük tarama koruması): from'u to - MAX gün'e clamp et.
    const minFrom = new Date(to.getTime() - MAX_SUMMARY_RANGE_DAYS * 86_400_000);
    if (from.getTime() < minFrom.getTime()) from = minFrom;

    const source: RecommendationSource | null = query.source && isAllowedSource(query.source) ? query.source : null;
    const placement: RecommendationPlacement | null =
      query.placement && isAllowedPlacement(query.placement) ? query.placement : null;

    const raw = await data.summarize({ storeId, from, to, source, placement });

    return reply.send(
      recommendationSummaryResponseSchema.parse({
        data: {
          range: { from: from.toISOString(), to: to.toISOString() },
          filters: { source, placement },
          totals: {
            impressions: raw.totals.impressions,
            clicks: raw.totals.clicks,
            addToCart: raw.totals.addToCart,
            ctr: computeCtr(raw.totals.impressions, raw.totals.clicks),
          },
          bySource: raw.bySource.map((b) => ({ ...b, ctr: computeCtr(b.impressions, b.clicks) })),
          byPlacement: raw.byPlacement.map((b) => ({ ...b, ctr: computeCtr(b.impressions, b.clicks) })),
        },
      }),
    );
  });
}
