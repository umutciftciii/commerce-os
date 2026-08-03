/**
 * TODO-168 (ADR-267) — Cart Change Awareness analytics ingest (best-effort).
 *
 * Public uç (`POST /public/stores/:storeSlug/cart-change-events`): store slug'dan çözülür; kimlik
 * KVKK-hash'lenir (ham cart id/müşteri saklanmaz). Bot/prefetch → satır ÜRETMEZ (200 {recorded:false}).
 * Rate limit (IP-hash). `(storeId, dedupeKey)` idempotent → re-render/çift-emit 0 yeni satır. Ölçüm
 * hatası UX'i ETKİLEMEZ (her yol 200). RecommendationEvent route deseniyle birebir.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "@commerce-os/config";
import { cartChangeEventRequestSchema, cartChangeEventResponseSchema } from "@commerce-os/contracts";
import {
  createSlidingWindowLimiter,
  hashIdentifier,
  isBotUserAgent,
  type RateLimiter,
} from "../influencers/tracking-core.js";
import { resolveCustomerFromRequest, type CustomerDataAccess } from "../customers/index.js";
import { isPrefetchRequest } from "../recently-viewed/recently-viewed-core.js";
import { cartChangeEventDedupeKey, type CartChangeEventData } from "./event-data.js";

export interface CartChangeEventRoutesDeps {
  config: AppConfig;
  customers: CustomerDataAccess;
  logger: { warn: (m: string, meta?: Record<string, unknown>) => void };
  resolvePublicStore: (slug: string) => Promise<{ id: string; slug: string } | null>;
  data: CartChangeEventData;
  /** Opsiyonel enjekte edilebilir limiter (test); yoksa sabit best-effort limiter kurulur. */
  rateLimiter?: RateLimiter;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export function registerCartChangeEventRoutes(app: FastifyInstance, deps: CartChangeEventRoutesDeps): void {
  const { config, customers, data, logger } = deps;
  // Best-effort ölçüm: makul sabit limit (env eklemeden). Aşımda sessiz 429 (UX etkilenmez).
  const rateLimiter = deps.rateLimiter ?? createSlidingWindowLimiter(240, 60_000);

  function userAgent(request: FastifyRequest): string {
    const ua = request.headers["user-agent"];
    return Array.isArray(ua) ? ua[0] ?? "" : ua ?? "";
  }
  function clientIpHash(request: FastifyRequest): string {
    const fwd = request.headers["x-forwarded-for"];
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim() || request.ip || "anon";
    return hashIdentifier(ip, config.SESSION_SECRET) ?? ip;
  }

  const ok = (recorded: boolean, deduped: boolean) =>
    cartChangeEventResponseSchema.parse({ data: { recorded, deduped } });

  app.post("/public/stores/:storeSlug/cart-change-events", async (request, reply) => {
    const { storeSlug } = request.params as { storeSlug: string };
    const store = await deps.resolvePublicStore(storeSlug);
    if (!store) return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));

    if (!rateLimiter.hit(clientIpHash(request), Date.now())) {
      return reply.code(429).send(errorBody("RATE_LIMITED", "Too many requests."));
    }

    const parsed = cartChangeEventRequestSchema.safeParse(request.body);
    const isBot = isBotUserAgent(userAgent(request));
    const isPrefetch = isPrefetchRequest({
      secPurpose: request.headers["sec-purpose"],
      purpose: request.headers["purpose"],
      xPurpose: request.headers["x-purpose"],
      xMoz: request.headers["x-moz"],
    });
    if (isBot || isPrefetch || !parsed.success) {
      return reply.code(200).send(ok(false, false));
    }

    const body = parsed.data;
    try {
      // KVKK: ham cart id/müşteri SAKLANMAZ — HMAC hash (SESSION_SECRET). Cross-store: storeId ayrı.
      const cartIdHash = hashIdentifier(body.cartId, config.SESSION_SECRET);
      if (!cartIdHash) return reply.code(200).send(ok(false, false));
      const customer = await resolveCustomerFromRequest(request, store.id, { customers, config }).catch(() => null);
      const customerIdHash = customer ? hashIdentifier(customer.id, config.SESSION_SECRET) : null;
      const dedupeKey = cartChangeEventDedupeKey(body.eventType, body.fingerprint);

      if (await data.dedupeKeyExists(store.id, dedupeKey)) {
        return reply.code(200).send(ok(false, true));
      }
      await data.insertEvent({
        storeId: store.id,
        cartIdHash,
        customerIdHash,
        productId: body.productId ?? null,
        variantId: body.variantId ?? null,
        changeType: body.changeType,
        eventType: body.eventType,
        severity: body.severity ?? null,
        oldMinor: body.oldMinor ?? null,
        newMinor: body.newMinor ?? null,
        currency: body.currency ?? null,
        fingerprint: body.fingerprint,
        placement: body.placement ?? null,
        dedupeKey,
        now: new Date(),
      });
      return reply.code(200).send(ok(true, false));
    } catch (error) {
      logger.warn("cart-change-event.record_failed", { error: String(error) });
      return reply.code(200).send(ok(false, false));
    }
  });
}
