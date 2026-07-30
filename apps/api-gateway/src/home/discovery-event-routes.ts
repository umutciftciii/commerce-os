/**
 * TODO-162 (ADR-205) — Home Discovery section-analytics HTTP route katmanı.
 *
 * Public ingest ucu (`POST /public/stores/:storeSlug/home/discovery-events`): store slug'dan sunucu-tarafı
 * çözülür; kimlik = customer (`x-customer-session`, öncelikli) VEYA guest visitor (`x-visitor-id` → HMAC).
 * Ek per-oturum `x-discovery-session` → sessionHash (dedupe granülerliği). HAM IP/UA saklanmaz. Bot/prefetch →
 * event ÜRETİLMEZ (200 {recorded:false}). Rate limit (IP-hash). eventType ALLOWLIST; sectionId GERÇEK yayınlanmış
 * (enabled) discovery section'a karşı doğrulanır (uydurma section reddi = server-authoritative "rendered"
 * proxy'si); sectionType DB'den otoritatif alınır; eligibilitySource allowlist; ürün/kampanya/sponsor
 * store-sahipliği doğrulanır (cross-store reddi). İstemci zaman/store/kimlik OTORİTESİ DEĞİL. Dedupe:
 * impression/click zaman-penceresi, add-to-cart dedupeKey idempotency. Sponsorlu kartların OTORİTATİF ölçümü
 * yine SponsoredProductEvent token'ıdır (bu event yalnız funnel kırılımı; çift-ölçüm değil).
 *
 * Admin özet ucu (`GET /stores/:storeId/home/discovery-events/summary`): platform-admin + store-scope
 * (tenant-izole). Küçük funnel (impression→card→click→cta→add-to-cart + sectionType/eligibilitySource kırılımı).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@commerce-os/config";
import {
  homeDiscoveryEventRequestSchema,
  homeDiscoveryEventResponseSchema,
  homeDiscoverySummaryResponseSchema,
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
  computeDiscoveryCtr,
  discoveryDedupeWindowSecondsFor,
  isAllowedDiscoveryEligibilitySource,
  isAllowedDiscoverySectionType,
  shouldRecordDiscoveryEvent,
} from "./discovery-event-core.js";
import type { DiscoveryEventData, DiscoveryEventIdentity } from "./discovery-event-data.js";

/** Admin özet aralığı üst sınırı (gün) — büyük tarama koruması. */
const MAX_SUMMARY_RANGE_DAYS = 366;
const DEFAULT_SUMMARY_RANGE_DAYS = 30;

export interface DiscoveryEventRoutesDeps {
  config: AppConfig;
  customers: CustomerDataAccess;
  logger: { warn: (m: string, meta?: Record<string, unknown>) => void };
  resolvePublicStore: (slug: string) => Promise<{ id: string; slug: string } | null>;
  data: DiscoveryEventData;
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

export function registerDiscoveryEventRoutes(app: FastifyInstance, deps: DiscoveryEventRoutesDeps): void {
  const { config, customers, data, logger } = deps;
  const rateLimiter =
    deps.rateLimiter ??
    createSlidingWindowLimiter(
      config.HOME_DISCOVERY_EVENT_RATE_LIMIT_MAX,
      config.HOME_DISCOVERY_EVENT_RATE_LIMIT_WINDOW_SECONDS * 1000,
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
  async function resolveIdentity(request: FastifyRequest, storeId: string): Promise<DiscoveryEventIdentity | null> {
    const sessionHash = hashIdentifier(headerValue(request, "x-discovery-session"), config.SESSION_SECRET) ?? undefined;
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
    homeDiscoveryEventResponseSchema.parse({ data: { recorded, deduped } });

  // ── POST discovery event (section/card impression, product/cta click, add-to-cart) ─────────────
  app.post("/public/stores/:storeSlug/home/discovery-events", async (request, reply) => {
    const { storeSlug } = request.params as { storeSlug: string };
    const store = await requireStore(storeSlug, reply);
    if (!store) return;

    if (!rateLimiter.hit(clientIpHash(request), Date.now())) {
      return reply.code(429).send(errorBody("RATE_LIMITED", "Too many requests."));
    }

    const parsed = homeDiscoveryEventRequestSchema.safeParse(request.body);
    const identity = await resolveIdentity(request, store.id);
    const isBot = isBotUserAgent(userAgent(request));
    const isPrefetch = isPrefetchRequest({
      secPurpose: request.headers["sec-purpose"],
      purpose: request.headers["purpose"],
      xPurpose: request.headers["x-purpose"],
      xMoz: request.headers["x-moz"],
    });

    const eligible = shouldRecordDiscoveryEvent({
      isBot,
      isPrefetch,
      hasIdentity: identity !== null,
      sectionRendered: parsed.success,
    });
    if (!eligible || !parsed.success || !identity) {
      return reply.code(200).send(ok(false, false));
    }

    const { type, sectionId, sectionType, eligibilitySource, productId, campaignId, sponsoredCampaignId, placement, dedupeKey } =
      parsed.data;

    // Allowlist kapıları (ucuz): section tipi + eligibilitySource bilinen değer mi?
    if (!isAllowedDiscoverySectionType(sectionType) || !isAllowedDiscoveryEligibilitySource(eligibilitySource)) {
      return reply.code(200).send(ok(false, false));
    }

    try {
      // §Server-authoritative "rendered": section GERÇEK, enabled, store'a ait bir yönetilen section mı?
      // DB'deki gerçek type otoritatiftir (istemci iddiasıyla çapraz-doğrula → uyuşmazsa sessiz reddet).
      const actualSectionType = await data.sectionTypeForStore(store.id, sectionId);
      if (actualSectionType === null || actualSectionType !== sectionType) {
        return reply.code(200).send(ok(false, false));
      }

      // Ürün taşıyan event'lerde store-sahipliği (cross-store event + enumeration guard).
      if (productId) {
        const owns = await data.productBelongsToStore(store.id, productId);
        if (!owns) return reply.code(200).send(ok(false, false));
      }

      const now = new Date();

      // Dedupe. ADD_TO_CART → dedupeKey idempotency (aynı dönüşüm iki kez sayılmaz).
      if (type === "ADD_TO_CART") {
        if (dedupeKey && (await data.dedupeKeyExists(store.id, dedupeKey))) {
          return reply.code(200).send(ok(false, true));
        }
      } else {
        const windowSeconds = discoveryDedupeWindowSecondsFor(type, {
          impressionSeconds: config.HOME_DISCOVERY_IMPRESSION_DEDUPE_SECONDS,
          interactionSeconds: config.HOME_DISCOVERY_INTERACTION_DEDUPE_SECONDS,
        });
        if (windowSeconds > 0) {
          const since = new Date(now.getTime() - windowSeconds * 1000);
          const lastAt = await data.lastEventAtMs({
            storeId: store.id,
            identity,
            sectionId,
            productId: productId ?? null,
            eventType: type,
            since,
          });
          if (lastAt != null && now.getTime() - lastAt < windowSeconds * 1000) {
            return reply.code(200).send(ok(false, true));
          }
        }
      }

      await data.insertEvent({
        storeId: store.id,
        identity,
        sectionId,
        sectionType,
        eligibilitySource,
        eventType: type,
        productId: productId ?? null,
        campaignId: campaignId ?? null,
        sponsoredCampaignId: sponsoredCampaignId ?? null,
        placement,
        dedupeKey: type === "ADD_TO_CART" ? dedupeKey ?? null : null,
        now,
      });
      return reply.code(200).send(ok(true, false));
    } catch (error) {
      // Ölçüm hatası UX'i ETKİLEMEZ — sessiz no-op.
      logger.warn("home-discovery-event.record_failed", { error: String(error) });
      return reply.code(200).send(ok(false, false));
    }
  });

  // ── GET admin summary (platform-admin; store-scope) ────────────────────────────────────────────
  app.get("/stores/:storeId/home/discovery-events/summary", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await deps.requireStoreAdmin(request, reply, storeId);
    if (!access) return;

    const query = request.query as { from?: string; to?: string; sectionType?: string; eligibilitySource?: string };

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

    const sectionType =
      query.sectionType && isAllowedDiscoverySectionType(query.sectionType) ? query.sectionType : null;
    const eligibilitySource =
      query.eligibilitySource && isAllowedDiscoveryEligibilitySource(query.eligibilitySource)
        ? query.eligibilitySource
        : null;

    const raw = await data.summarize({ storeId, from, to, sectionType, eligibilitySource });

    const withCtr = (b: {
      key: string;
      sectionImpressions: number;
      cardImpressions: number;
      productClicks: number;
      ctaClicks: number;
      addToCart: number;
    }) => ({ ...b, ctr: computeDiscoveryCtr(b.cardImpressions, b.productClicks) });

    return reply.send(
      homeDiscoverySummaryResponseSchema.parse({
        data: {
          range: { from: from.toISOString(), to: to.toISOString() },
          filters: { sectionType, eligibilitySource },
          totals: {
            sectionImpressions: raw.totals.sectionImpressions,
            cardImpressions: raw.totals.cardImpressions,
            productClicks: raw.totals.productClicks,
            ctaClicks: raw.totals.ctaClicks,
            addToCart: raw.totals.addToCart,
            ctr: computeDiscoveryCtr(raw.totals.cardImpressions, raw.totals.productClicks),
          },
          bySectionType: raw.bySectionType.map(withCtr),
          byEligibilitySource: raw.byEligibilitySource.map(withCtr),
        },
      }),
    );
  });
}
