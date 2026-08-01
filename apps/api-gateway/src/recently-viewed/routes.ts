/**
 * TODO-161B (ADR-137…143) — Recently Viewed & Similar Products — HTTP route katmanı.
 *
 * Public uçlar (`/public/stores/:storeSlug/...`): store slug'dan sunucu-tarafı çözülür. Kimlik = customer
 * (`x-customer-session`, öncelikli) VEYA guest visitor (`x-visitor-id` → HMAC `visitorHash`). HAM IP/UA
 * saklanmaz. Görüntüleme kaydı bot/prefetch'te SESSIZCE atlanır (200 `{recorded:false}`); PDP bloklanmaz.
 * Rate limit (IP-hash kayan pencere). Öneri kartları read-model `listing` snapshot'ından (ikinci hidrasyon
 * YOK; istemci fiyat otoritesi DEĞİL). deleted/passive/out-of-stock ürünler görünürlük gate'inde elenir.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@commerce-os/config";
import {
  RECENTLY_VIEWED_DEFAULT_LIMIT,
  RECENTLY_VIEWED_MAX_LIMIT,
  RECENTLY_VIEWED_MERGE_MAX_ITEMS,
  SIMILAR_PRODUCTS_DEFAULT_LIMIT,
  SIMILAR_PRODUCTS_MAX_LIMIT,
  clearRecentlyViewedResponseSchema,
  recentlyViewedMergeResponseSchema,
  recentlyViewedResponseSchema,
  recordProductViewRequestSchema,
  recordProductViewResponseSchema,
  similarProductsResponseSchema,
  type PublicSearchProduct,
} from "@commerce-os/contracts";
import {
  createSlidingWindowLimiter,
  hashIdentifier,
  isBotUserAgent,
  type RateLimiter,
} from "../influencers/tracking-core.js";
import { resolveCustomerFromRequest, type CustomerDataAccess } from "../customers/index.js";
import { clampLimit, isPrefetchRequest, shouldRecordView } from "./recently-viewed-core.js";
import { rankSimilar } from "./similarity-core.js";
import type { RecentlyViewedData, SearchDocRow, ViewerIdentity } from "./data.js";

/** Similar aday union üst sınırı (katmanlı; her katman SIMILAR_PER_TIER ile bounded — tüm katalog
 * belleğe alınmaz). 4 relevance katmanının her biri katkı verebilsin diye global cap per-tier'dan büyük. */
const SIMILAR_MAX_CANDIDATES = 400;
/** GET history tarama üst sınırı (cap kadar; görünürlük elemesi sonrası limit uygulanır). */
const HISTORY_SCAN_CAP = RECENTLY_VIEWED_MAX_LIMIT;

export interface RecentlyViewedRoutesDeps {
  config: AppConfig;
  customers: CustomerDataAccess;
  logger: { info: (m: string, meta?: Record<string, unknown>) => void; warn: (m: string, meta?: Record<string, unknown>) => void };
  resolvePublicStore: (slug: string) => Promise<{ id: string; slug: string } | null>;
  data: RecentlyViewedData;
  /** storageKey → public URL (resolveMediaUrl; storageKey/mediaId DTO'ya SIZMAZ). */
  toPublicMediaUrl: (storageKey: string) => string;
  /** Kategori adları (bounded display-only; search ucuyla aynı resolver). */
  resolveCategoryNames: (storeId: string, categoryIds: string[]) => Promise<Map<string, string>>;
  /** Opsiyonel enjekte edilebilir limiter (test); yoksa varsayılan kurulur. */
  rateLimiter?: RateLimiter;
}

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

/* ── Read-model listing snapshot tipleri (ProductSearchDocument.listing) ──────── */
interface ListingImage {
  storageKey: string;
  altText: string | null;
}
interface ListingSwatch {
  optionId: string;
  label: string;
  colorHex: string | null;
  image: { storageKey: string } | null;
  isDefault: boolean;
}
interface ListingSnapshot {
  primaryImage: ListingImage | null;
  secondaryImage: ListingImage | null;
  swatches: ListingSwatch[];
  swatchTotalCount: number;
}

export function registerRecentlyViewedRoutes(app: FastifyInstance, deps: RecentlyViewedRoutesDeps): void {
  const { config, customers, data, logger } = deps;
  const rateLimiter = deps.rateLimiter ?? createSlidingWindowLimiter(120, 60_000);

  async function requireStore(slug: string, reply: FastifyReply) {
    const store = await deps.resolvePublicStore(slug);
    if (!store) {
      reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
      return null;
    }
    return store;
  }

  /** Kimlik: customer (öncelikli) → visitorHash. İkisi de yoksa null. */
  async function resolveIdentity(request: FastifyRequest, storeId: string): Promise<ViewerIdentity | null> {
    const customer = await resolveCustomerFromRequest(request, storeId, { customers, config }).catch(() => null);
    if (customer) return { customerId: customer.id };
    const rawVisitor = request.headers["x-visitor-id"];
    const visitorId = Array.isArray(rawVisitor) ? rawVisitor[0] : rawVisitor;
    const visitorHash = hashIdentifier(visitorId, config.SESSION_SECRET);
    if (visitorHash) return { visitorHash };
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

  /** SearchDocRow → publicSearchProductSchema kart DTO'su (search toPublicProduct ile birebir). */
  function toCard(row: SearchDocRow, categoryNames: Map<string, string>, nowMs: number): PublicSearchProduct {
    const listing = (row.listing as unknown as ListingSnapshot | null) ?? null;
    const toImage = (img: ListingImage | null, position: number) =>
      img ? { url: deps.toPublicMediaUrl(img.storageKey), altText: img.altText, position, variantOptionId: null } : null;

    // Kampanya rozeti read-time suppression: snapshot penceresi dışındaysa gösterme (bayat rozet sızmaz).
    const campaignDisplayable =
      row.campaign !== null &&
      (row.campaignStartsAt === null || row.campaignStartsAt.getTime() <= nowMs) &&
      (row.campaignEndsAt === null || row.campaignEndsAt.getTime() > nowMs);

    return {
      id: row.productId,
      slug: row.slug,
      title: row.title,
      brand: row.brand,
      // TODO-165A (ADR-165A) Task 11 — brandRef henüz bu modülde hidratlanmıyor (recently-viewed/similar
      // read-model satırı brandId taşımaz; ayrı bir bounded lookup follow-up'ı gerektirir). Additive/
      // nullable alan olduğundan kart görünümünü BOZMAZ — yalnız marka rozeti/linki burada eksik kalır.
      brandRef: null,
      categoryLabel: row.primaryCategoryId ? categoryNames.get(row.primaryCategoryId) ?? null : null,
      minPriceMinor: row.minPriceMinor,
      maxPriceMinor: row.maxPriceMinor,
      currency: row.currency,
      availability: row.availability,
      inStock: row.hasStock,
      image: toImage(listing?.primaryImage ?? null, 0),
      compareAtMinor: row.compareAtMinor,
      discountPercent: row.discountPercent,
      omnibusPreviousPriceMinor: row.omnibusPreviousPriceMinor,
      secondaryImage: toImage(listing?.secondaryImage ?? null, 1),
      swatches: (listing?.swatches ?? []).map((swatch) => ({
        optionId: swatch.optionId,
        label: swatch.label,
        colorHex: swatch.colorHex,
        imageUrl: swatch.image ? deps.toPublicMediaUrl(swatch.image.storageKey) : null,
        isDefault: swatch.isDefault,
      })),
      swatchTotalCount: listing?.swatchTotalCount ?? 0,
      campaign: campaignDisplayable ? (row.campaign as PublicSearchProduct["campaign"]) : null,
      sponsored: false,
      sponsoredToken: null,
    };
  }

  /** Sıralı id'ler → kartlar (görünürlük gate zaten uygulanmış cards Map'inden; bounded). */
  async function buildCards(storeId: string, orderedIds: string[], cards: Map<string, SearchDocRow>): Promise<PublicSearchProduct[]> {
    const rows = orderedIds.map((id) => cards.get(id)).filter((r): r is SearchDocRow => r !== undefined);
    const categoryIds = [...new Set(rows.map((r) => r.primaryCategoryId).filter((id): id is string => id !== null))];
    const categoryNames = categoryIds.length > 0 ? await deps.resolveCategoryNames(storeId, categoryIds) : new Map<string, string>();
    const nowMs = Date.now();
    return rows.map((row) => toCard(row, categoryNames, nowMs));
  }

  // ── POST record view ────────────────────────────────────────────────────────
  app.post("/public/stores/:storeSlug/recently-viewed", async (request, reply) => {
    const { storeSlug } = request.params as { storeSlug: string };
    const store = await requireStore(storeSlug, reply);
    if (!store) return;

    if (!rateLimiter.hit(clientIpHash(request), Date.now())) {
      return reply.code(429).send(errorBody("RATE_LIMITED", "Too many requests."));
    }

    const parsed = recordProductViewRequestSchema.safeParse(request.body);
    const identity = await resolveIdentity(request, store.id);
    const isBot = isBotUserAgent(userAgent(request));
    const isPrefetch = isPrefetchRequest({
      secPurpose: request.headers["sec-purpose"],
      purpose: request.headers["purpose"],
      xPurpose: request.headers["x-purpose"],
      xMoz: request.headers["x-moz"],
    });

    const eligible = shouldRecordView({
      isBot,
      isPrefetch,
      hasIdentity: identity !== null,
      hasProductId: parsed.success,
    });
    if (!eligible || !parsed.success || !identity) {
      return reply.code(200).send(recordProductViewResponseSchema.parse({ data: { recorded: false } }));
    }

    try {
      const recorded = await data.recordView(store.id, identity, parsed.data.productId, new Date(), config.RECENTLY_VIEWED_MAX_PER_VISITOR);
      return reply.code(200).send(recordProductViewResponseSchema.parse({ data: { recorded } }));
    } catch (error) {
      // Kayıt hatası PDP'yi ETKİLEMEZ — sessiz no-op.
      logger.warn("recently-viewed.record_failed", { error: String(error) });
      return reply.code(200).send(recordProductViewResponseSchema.parse({ data: { recorded: false } }));
    }
  });

  // ── GET recently viewed ───────────────────────────────────────────────────────
  app.get("/public/stores/:storeSlug/recently-viewed", async (request, reply) => {
    const { storeSlug } = request.params as { storeSlug: string };
    const store = await requireStore(storeSlug, reply);
    if (!store) return;

    const identity = await resolveIdentity(request, store.id);
    if (!identity) {
      return reply.code(200).send(recentlyViewedResponseSchema.parse({ data: [] }));
    }

    const query = request.query as { limit?: string };
    const limit = clampLimit(query.limit ? Number(query.limit) : undefined, RECENTLY_VIEWED_DEFAULT_LIMIT, RECENTLY_VIEWED_MAX_LIMIT);

    const history = await data.listHistory(store.id, identity, HISTORY_SCAN_CAP);
    const historyIds = history.map((h) => h.productId);
    const visible = await data.filterVisibleInStock(store.id, historyIds);
    const orderedVisibleIds = historyIds.filter((id) => visible.has(id)).slice(0, limit);
    const cards = await data.loadCards(store.id, orderedVisibleIds);
    const products = await buildCards(store.id, orderedVisibleIds, cards);
    return reply.code(200).send(recentlyViewedResponseSchema.parse({ data: products }));
  });

  // ── DELETE recently viewed ────────────────────────────────────────────────────
  app.delete("/public/stores/:storeSlug/recently-viewed", async (request, reply) => {
    const { storeSlug } = request.params as { storeSlug: string };
    const store = await requireStore(storeSlug, reply);
    if (!store) return;

    if (!rateLimiter.hit(clientIpHash(request), Date.now())) {
      return reply.code(429).send(errorBody("RATE_LIMITED", "Too many requests."));
    }

    const identity = await resolveIdentity(request, store.id);
    if (!identity) {
      return reply.code(200).send(clearRecentlyViewedResponseSchema.parse({ data: { cleared: 0 } }));
    }
    const cleared = await data.clearHistory(store.id, identity);
    return reply.code(200).send(clearRecentlyViewedResponseSchema.parse({ data: { cleared } }));
  });

  // ── POST merge (guest → customer) ─────────────────────────────────────────────
  app.post("/public/stores/:storeSlug/recently-viewed/merge", async (request, reply) => {
    const { storeSlug } = request.params as { storeSlug: string };
    const store = await requireStore(storeSlug, reply);
    if (!store) return;

    if (!rateLimiter.hit(clientIpHash(request), Date.now())) {
      return reply.code(429).send(errorBody("RATE_LIMITED", "Too many requests."));
    }

    const customer = await resolveCustomerFromRequest(request, store.id, { customers, config }).catch(() => null);
    if (!customer) {
      return reply.code(401).send(errorBody("CUSTOMER_UNAUTHORIZED", "Customer session required."));
    }
    const rawVisitor = request.headers["x-visitor-id"];
    const visitorId = Array.isArray(rawVisitor) ? rawVisitor[0] : rawVisitor;
    const visitorHash = hashIdentifier(visitorId, config.SESSION_SECRET);
    if (!visitorHash) {
      // Guest kimliği yoksa merge no-op (idempotent).
      return reply.code(200).send(recentlyViewedMergeResponseSchema.parse({ data: { merged: 0 } }));
    }

    const merged = await data.mergeGuestIntoCustomer(
      store.id,
      customer.id,
      visitorHash,
      config.RECENTLY_VIEWED_MAX_PER_VISITOR,
      RECENTLY_VIEWED_MERGE_MAX_ITEMS,
    );
    return reply.code(200).send(recentlyViewedMergeResponseSchema.parse({ data: { merged } }));
  });

  // ── GET similar products ──────────────────────────────────────────────────────
  app.get("/public/stores/:storeSlug/products/:productId/similar", async (request, reply) => {
    const { storeSlug, productId } = request.params as { storeSlug: string; productId: string };
    const store = await requireStore(storeSlug, reply);
    if (!store) return;

    const query = request.query as { limit?: string };
    const limit = clampLimit(query.limit ? Number(query.limit) : undefined, SIMILAR_PRODUCTS_DEFAULT_LIMIT, SIMILAR_PRODUCTS_MAX_LIMIT);

    const anchor = await data.loadAnchor(store.id, productId);
    if (!anchor) {
      // Anchor ACTIVE değil/yok → öneri üretilmez (guvenli boş).
      return reply.code(200).send(similarProductsResponseSchema.parse({ data: [] }));
    }

    const { features, cards } = await data.loadSimilarCandidates(store.id, anchor.features, SIMILAR_MAX_CANDIDATES);
    const ranked = rankSimilar(anchor.features, features, limit);
    const orderedIds = ranked.map((r) => r.productId);
    const products = await buildCards(store.id, orderedIds, cards);
    return reply.code(200).send(similarProductsResponseSchema.parse({ data: products }));
  });
}
