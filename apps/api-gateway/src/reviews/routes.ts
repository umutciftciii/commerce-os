/**
 * TODO-159E (ADR-094) — Product Reviews & Ratings — HTTP route katmanı.
 *
 * Üç yüzey:
 *  - Public (auth yok):     ürün summary + APPROVED yorum listesi + batched kart summary.
 *  - Customer (x-customer-session): uygunluk, oluştur/düzenle, kendi yorumlarım, faydalı oyu.
 *  - Admin (platform-admin bearer): Data Grid liste + detay + moderate (approve/reject/hide).
 *
 * Uygunluk SUNUCU-otoriter (data.ts join'i). Public projeksiyon ALLOWLIST: customerId/email/
 * orderId/orderLineId/moderationNote/status SIZMAZ. Aggregate projection'dan okunur (O(1)).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@commerce-os/config";
import {
  REVIEW_BODY_MIN_LENGTH,
  REVIEW_PUBLIC_DEFAULT_PAGE_SIZE,
  REVIEW_SUMMARY_MAX_IDS,
  adminReviewDetailResponseSchema,
  adminReviewListQuerySchema,
  adminReviewListResponseSchema,
  buildAdminListPagination,
  customerReviewMutationResponseSchema,
  customerReviewsResponseSchema,
  publicReviewSchema,
  resolveAdminListPage,
  reviewCreateRequestSchema,
  reviewEligibilityResponseSchema,
  reviewHelpfulRequestSchema,
  reviewHelpfulResponseSchema,
  reviewModerateRequestSchema,
  reviewModerateResponseSchema,
  reviewPublicListQuerySchema,
  reviewPublicListResponseSchema,
  reviewSummaryBatchRequestSchema,
  reviewSummaryBatchResponseSchema,
  reviewSummaryResponseSchema,
  reviewUpdateRequestSchema,
  type AdminReviewDetail,
  type AdminReviewSummary,
  type CustomerReview,
  type ProductReviewStatus,
  type PublicReview,
  type RatingDistribution,
  type ReviewEligibleOrderLine,
  type ReviewModerationAction,
  type ReviewSummary,
} from "@commerce-os/contracts";
import { buildProductCoverUrlMap, type ListProductImagesFn } from "../media/cover.js";
import {
  resolveCustomerFromRequest,
  type CustomerAuthRecord,
  type CustomerDataAccess,
} from "../customers/index.js";
import { displayAverage } from "./data.js";
import type { AggregateRecord, ReviewData, ReviewRecord } from "./data.js";

export interface ReviewRoutesDeps {
  config: AppConfig;
  customers: CustomerDataAccess;
  logger: {
    info: (m: string, meta?: Record<string, unknown>) => void;
    warn: (m: string, meta?: Record<string, unknown>) => void;
  };
  resolvePublicStore: (slug: string) => Promise<{ id: string; slug: string } | null>;
  data: ReviewData;
  catalog: { listProductImages: ListProductImagesFn };
}

export interface ReviewAdminRoutesDeps {
  data: ReviewData;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  recordAudit: (input: {
    action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "SYSTEM";
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>;
}

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

/**
 * Basit in-process sliding-window rate limiter (auth OTP'sindeki desenle aynı; ayrı
 * proses koordinasyonu yok — abuse'a karşı temel koruma). storeId:customerId anahtarı.
 */
function createRateLimiter(windowSeconds: number, maxAttempts: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    isLimited(key: string): boolean {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) return false;
      return entry.count >= maxAttempts;
    },
    record(key: string): void {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
        return;
      }
      entry.count += 1;
    },
  };
}

/**
 * Düz metin güvencesi: HTML etiketlerini (</?letter...>) kaldırır — "a < b" gibi metni
 * BOZMAZ (boşluklu < korunur). Kontrol karakterlerini temizler, trim'ler. Depolanan içerik
 * her zaman düz metindir; storefront/admin React ile escape'li (text) render eder → XSS yok.
 */
function sanitizePlainText(input: string): string {
  const withoutTags = input.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  // Kontrol karakterlerini (tab U+09 / newline U+0A / CR U+0D haric) kaldir — codepoint bazli.
  let out = "";
  for (const ch of withoutTags) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    if (!isControl && code !== 0x7f) out += ch;
  }
  return out.trim();
}

/** Public gösterim adı: "Ayşe K." (ad + soyad-baş harfi). Ad yoksa "" (istemci lokalize eder). */
function maskAuthorName(firstName: string | null, lastName: string | null): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (!first && !last) return "";
  if (!last) return first;
  return `${first} ${last.charAt(0).toUpperCase()}.`.trim();
}

/** Admin gösterim adı: tam ad; yoksa e-posta; yoksa "—". */
function adminCustomerName(
  info: { firstName: string | null; lastName: string | null; email: string | null } | undefined,
): string {
  if (!info) return "—";
  const full = `${info.firstName ?? ""} ${info.lastName ?? ""}`.trim();
  return full || info.email || "—";
}

function emptyDistribution(): RatingDistribution {
  return { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
}

function toSummary(productId: string, aggregate: AggregateRecord | null): ReviewSummary {
  if (!aggregate) {
    return { productId, averageRating: 0, reviewCount: 0, ratingDistribution: emptyDistribution() };
  }
  return {
    productId,
    averageRating: displayAverage(aggregate.averageTimes100),
    reviewCount: aggregate.reviewCount,
    ratingDistribution: {
      "1": aggregate.count1,
      "2": aggregate.count2,
      "3": aggregate.count3,
      "4": aggregate.count4,
      "5": aggregate.count5,
    },
  };
}

function toPublicReview(
  record: ReviewRecord,
  authorName: string,
  viewerFoundHelpful: boolean,
): PublicReview {
  return {
    id: record.id,
    rating: record.rating,
    title: record.title,
    body: record.body,
    authorName,
    verifiedPurchase: record.verifiedPurchase,
    helpfulCount: record.helpfulCount,
    // variantLabel bağlamı public'te taşınmaz (varyant başlığı sipariş-özel olabilir); null.
    variantLabel: null,
    createdAt: record.createdAt.toISOString(),
    publishedAt: record.publishedAt ? record.publishedAt.toISOString() : null,
    viewerFoundHelpful,
  };
}

const HIDDEN_STATUS: ProductReviewStatus = "HIDDEN";

function toCustomerReview(
  record: ReviewRecord,
  product: { title: string; slug: string } | undefined,
  imageUrl: string | null,
): CustomerReview {
  return {
    id: record.id,
    productId: record.productId,
    productTitle: product?.title ?? "",
    productSlug: product?.slug ?? "",
    productImageUrl: imageUrl,
    variantLabel: null,
    rating: record.rating,
    title: record.title,
    body: record.body,
    status: record.status,
    verifiedPurchase: record.verifiedPurchase,
    helpfulCount: record.helpfulCount,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    publishedAt: record.publishedAt ? record.publishedAt.toISOString() : null,
    // HIDDEN yorum müşteri tarafından düzenlenemez (moderasyon kararı); diğerleri düzenlenebilir.
    editable: record.status !== HIDDEN_STATUS,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * PUBLIC (auth yok)
 * ════════════════════════════════════════════════════════════════════════════ */
export function registerPublicReviewRoutes(app: FastifyInstance, deps: ReviewRoutesDeps): void {
  const { config, customers, resolvePublicStore, data } = deps;

  async function requireStore(request: FastifyRequest, reply: FastifyReply) {
    const slug = (request.params as { storeSlug: string }).storeSlug;
    const store = await resolvePublicStore(slug);
    if (!store) {
      await reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
      return null;
    }
    return store;
  }

  /** Opsiyonel viewer: x-customer-session varsa ve mağazaya aitse müşteriyi çözer (yoksa null). */
  async function optionalViewer(
    request: FastifyRequest,
    storeId: string,
  ): Promise<CustomerAuthRecord | null> {
    try {
      return await resolveCustomerFromRequest(request, storeId, { customers, config });
    } catch {
      return null;
    }
  }

  // ── Ürün rating özeti ────────────────────────────────────────────────────
  app.get(
    "/public/stores/:storeSlug/products/:productId/reviews/summary",
    async (request, reply) => {
      const store = await requireStore(request, reply);
      if (!store) return;
      const { productId } = request.params as { productId: string };
      const aggregate = await data.getAggregate(store.id, productId);
      return reviewSummaryResponseSchema.parse({ data: toSummary(productId, aggregate) });
    },
  );

  // ── APPROVED yorum listesi (sayfalı + rating filtresi + sort) ──────────────
  app.get("/public/stores/:storeSlug/products/:productId/reviews", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const { productId } = request.params as { productId: string };
    const query = reviewPublicListQuerySchema.parse(request.query);
    const { page, pageSize, limit, offset } = resolveAdminListPage(
      query,
      REVIEW_PUBLIC_DEFAULT_PAGE_SIZE,
    );
    const [aggregate, listed] = await Promise.all([
      data.getAggregate(store.id, productId),
      data.listApprovedReviews(store.id, productId, {
        rating: query.rating,
        sort: query.sort,
        limit,
        offset,
      }),
    ]);
    const viewer = await optionalViewer(request, store.id);
    const viewerSet = viewer
      ? await data.findViewerHelpfulSet(
          listed.items.map((r) => r.id),
          viewer.id,
        )
      : new Set<string>();
    // Yazar adları tek batched sorgu (N+1 yok).
    const nameMap = await data.findCustomerNamesByIds(
      store.id,
      listed.items.map((r) => r.customerId),
    );
    const reviews = listed.items.map((r) => {
      const info = nameMap.get(r.customerId);
      return toPublicReview(
        r,
        maskAuthorName(info?.firstName ?? null, info?.lastName ?? null),
        viewerSet.has(r.id),
      );
    });
    return reviewPublicListResponseSchema.parse({
      data: reviews.map((rv) => publicReviewSchema.parse(rv)),
      summary: toSummary(productId, aggregate),
      pagination: buildAdminListPagination({ page, pageSize, totalItems: listed.total }),
    });
  });

  // ── Batched kart summary (PLP/Home/Search) ─────────────────────────────────
  app.post("/public/stores/:storeSlug/reviews/summary", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const body = reviewSummaryBatchRequestSchema.parse(request.body);
    const unique = [...new Set(body.productIds)].slice(0, REVIEW_SUMMARY_MAX_IDS);
    const aggregates = await data.getAggregatesByProductIds(store.id, unique);
    return reviewSummaryBatchResponseSchema.parse({
      data: aggregates.map((a) => toSummary(a.productId, a)),
    });
  });
}

/* ════════════════════════════════════════════════════════════════════════════
 * CUSTOMER (x-customer-session)
 * ════════════════════════════════════════════════════════════════════════════ */
export function registerCustomerReviewRoutes(app: FastifyInstance, deps: ReviewRoutesDeps): void {
  const { config, customers, resolvePublicStore, data, catalog } = deps;

  // Create/edit: 10 istek / 60 sn; helpful: 30 istek / 60 sn (storeId:customerId).
  const writeLimiter = createRateLimiter(60, 10);
  const helpfulLimiter = createRateLimiter(60, 30);

  async function requireStore(request: FastifyRequest, reply: FastifyReply) {
    const slug = (request.params as { storeSlug: string }).storeSlug;
    const store = await resolvePublicStore(slug);
    if (!store) {
      await reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
      return null;
    }
    return store;
  }

  async function requireCustomer(
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ): Promise<CustomerAuthRecord | null> {
    const customer = await resolveCustomerFromRequest(request, storeId, { customers, config });
    if (!customer) {
      await reply.code(401).send(errorBody("CUSTOMER_UNAUTHORIZED", "Oturum gerekli."));
      return null;
    }
    return customer;
  }

  async function coverUrl(storeId: string, productIds: string[]): Promise<Map<string, string>> {
    return buildProductCoverUrlMap(
      catalog.listProductImages,
      config.MEDIA_PUBLIC_BASE_URL,
      storeId,
      productIds,
    );
  }

  const base = "/public/stores/:storeSlug/customer";

  // ── Kendi yorumlarım + yoruma uygun kalemler ───────────────────────────────
  app.get(`${base}/reviews`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const [reviews, eligible] = await Promise.all([
      data.listCustomerReviews(store.id, customer.id),
      data.listEligibleLines(store.id, customer.id),
    ]);
    const productIds = [
      ...reviews.map((r) => r.productId),
      ...eligible.map((e) => e.productId),
    ];
    const covers = await coverUrl(store.id, productIds);
    const productMap = await data.findProductInfoByIds(store.id, reviews.map((r) => r.productId));
    return customerReviewsResponseSchema.parse({
      data: {
        reviews: reviews.map((r) =>
          toCustomerReview(r, productMap.get(r.productId), covers.get(r.productId) ?? null),
        ),
        eligible: eligible.map(
          (e): ReviewEligibleOrderLine => ({
            orderLineId: e.orderLineId,
            orderId: e.orderId,
            orderNumber: e.orderNumber,
            productId: e.productId,
            productTitle: e.productTitle,
            productSlug: e.productSlug,
            productImageUrl: covers.get(e.productId) ?? null,
            variantLabel: e.variantLabel,
            purchasedAt: e.purchasedAt.toISOString(),
          }),
        ),
      },
    });
  });

  // ── PDP "yorum yaz" uygunluk gate'i ─────────────────────────────────────────
  app.get(`${base}/products/:productId/review-eligibility`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const { productId } = request.params as { productId: string };
    const existing = await data.findReviewByProductCustomer(store.id, productId, customer.id);
    if (existing) {
      const covers = await coverUrl(store.id, [productId]);
      const productMap = await data.findProductInfoByIds(store.id, [productId]);
      return reviewEligibilityResponseSchema.parse({
        data: {
          eligible: false,
          reason: "ALREADY_REVIEWED",
          orderLineId: null,
          existingReview: toCustomerReview(
            existing,
            productMap.get(productId),
            covers.get(productId) ?? null,
          ),
        },
      });
    }
    const line = await data.findEligibleLineForProduct(store.id, customer.id, productId);
    return reviewEligibilityResponseSchema.parse({
      data: {
        eligible: line !== null,
        reason: line ? "ELIGIBLE" : "NO_ELIGIBLE_PURCHASE",
        orderLineId: line?.orderLineId ?? null,
        existingReview: null,
      },
    });
  });

  // ── Yorum oluştur ──────────────────────────────────────────────────────────
  app.post(`${base}/reviews`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const key = `${store.id}:${customer.id}`;
    if (writeLimiter.isLimited(key)) {
      return reply.code(429).send(errorBody("REVIEW_RATE_LIMITED", "Çok fazla istek. Lütfen sonra tekrar deneyin."));
    }
    const body = reviewCreateRequestSchema.parse(request.body);
    // SUNUCU-otoriter uygunluk: orderLine müşteriye ait + ödenmiş + teslim + kullanılmamış.
    const line = await data.resolveEligibleLineById(store.id, customer.id, body.orderLineId);
    if (!line) {
      return reply.code(403).send(errorBody("REVIEW_NOT_ELIGIBLE", "Bu ürün için yorum yazma hakkınız yok."));
    }
    // Ürün başına tek yorum (bu müşteri).
    const already = await data.findReviewByProductCustomer(store.id, line.productId, customer.id);
    if (already) {
      return reply.code(409).send(errorBody("REVIEW_ALREADY_EXISTS", "Bu ürüne zaten yorum yaptınız."));
    }
    const cleanTitle = body.title ? sanitizePlainText(body.title) : null;
    const cleanBody = sanitizePlainText(body.body);
    if (cleanBody.length < REVIEW_BODY_MIN_LENGTH) {
      return reply.code(422).send(errorBody("REVIEW_BODY_REQUIRED", "Yorum metni boş olamaz."));
    }
    writeLimiter.record(key);
    try {
      const created = await data.createReview({
        storeId: store.id,
        productId: line.productId,
        variantId: line.variantId,
        customerId: customer.id,
        orderId: line.orderId,
        orderLineId: line.orderLineId,
        rating: body.rating,
        title: cleanTitle && cleanTitle.length > 0 ? cleanTitle : null,
        body: cleanBody,
      });
      const covers = await coverUrl(store.id, [line.productId]);
      const productMap = await data.findProductInfoByIds(store.id, [line.productId]);
      return reply.code(201).send(
        customerReviewMutationResponseSchema.parse({
          data: toCustomerReview(created, productMap.get(line.productId), covers.get(line.productId) ?? null),
        }),
      );
    } catch (error) {
      // Yarış: aynı orderLine/ürün için ikinci istek (idempotent duplicate koruması).
      if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
        return reply.code(409).send(errorBody("REVIEW_ALREADY_EXISTS", "Bu ürüne zaten yorum yaptınız."));
      }
      throw error;
    }
  });

  // ── Kendi yorumunu düzenle (approved → pending) ─────────────────────────────
  app.patch(`${base}/reviews/:reviewId`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const key = `${store.id}:${customer.id}`;
    if (writeLimiter.isLimited(key)) {
      return reply.code(429).send(errorBody("REVIEW_RATE_LIMITED", "Çok fazla istek. Lütfen sonra tekrar deneyin."));
    }
    const { reviewId } = request.params as { reviewId: string };
    const existing = await data.findOwnReview(store.id, customer.id, reviewId);
    if (!existing) {
      return reply.code(404).send(errorBody("REVIEW_NOT_FOUND", "Yorum bulunamadı."));
    }
    if (existing.status === "HIDDEN") {
      return reply.code(409).send(errorBody("REVIEW_NOT_EDITABLE", "Bu yorum düzenlenemez."));
    }
    const body = reviewUpdateRequestSchema.parse(request.body);
    const cleanTitle = body.title ? sanitizePlainText(body.title) : null;
    const cleanBody = sanitizePlainText(body.body);
    if (cleanBody.length < REVIEW_BODY_MIN_LENGTH) {
      return reply.code(422).send(errorBody("REVIEW_BODY_REQUIRED", "Yorum metni boş olamaz."));
    }
    writeLimiter.record(key);
    const updated = await data.updateOwnReview(store.id, reviewId, {
      rating: body.rating,
      title: cleanTitle && cleanTitle.length > 0 ? cleanTitle : null,
      body: cleanBody,
      backToPending: true,
    });
    const covers = await coverUrl(store.id, [updated.productId]);
    const productMap = await data.findProductInfoByIds(store.id, [updated.productId]);
    return customerReviewMutationResponseSchema.parse({
      data: toCustomerReview(updated, productMap.get(updated.productId), covers.get(updated.productId) ?? null),
    });
  });

  // ── Faydalı oyu (approved yoruma; kendi yorumu hariç) ───────────────────────
  app.post(`${base}/reviews/:reviewId/helpful`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const key = `${store.id}:${customer.id}`;
    if (helpfulLimiter.isLimited(key)) {
      return reply.code(429).send(errorBody("REVIEW_RATE_LIMITED", "Çok fazla istek. Lütfen sonra tekrar deneyin."));
    }
    const { reviewId } = request.params as { reviewId: string };
    const review = await data.findReviewById(store.id, reviewId);
    if (!review || review.status !== "APPROVED") {
      // Yalnız yayında olan yorumlar oylanabilir (yayında olmayan = enumeration'a karşı 404).
      return reply.code(404).send(errorBody("REVIEW_NOT_FOUND", "Yorum bulunamadı."));
    }
    if (review.customerId === customer.id) {
      return reply.code(409).send(errorBody("REVIEW_SELF_HELPFUL", "Kendi yorumunuzu faydalı işaretleyemezsiniz."));
    }
    const bodyRaw = (request.body ?? {}) as Record<string, unknown>;
    const parsed = reviewHelpfulRequestSchema.parse(bodyRaw);
    const desired =
      parsed.helpful ?? !(await data.hasViewerHelpful(reviewId, customer.id));
    helpfulLimiter.record(key);
    const result = await data.toggleHelpful(store.id, reviewId, customer.id, desired);
    return reviewHelpfulResponseSchema.parse({
      data: { reviewId, helpful: result.helpful, helpfulCount: result.helpfulCount },
    });
  });
}

/* ════════════════════════════════════════════════════════════════════════════
 * ADMIN (platform-admin bearer)
 * ════════════════════════════════════════════════════════════════════════════ */
const ACTION_TO_STATUS: Record<ReviewModerationAction, ProductReviewStatus> = {
  approve: "APPROVED",
  reject: "REJECTED",
  hide: "HIDDEN",
};

export function registerReviewAdminRoutes(app: FastifyInstance, deps: ReviewAdminRoutesDeps): void {
  const { data, requireStoreAdmin, recordAudit } = deps;

  function toBodyPreview(body: string): string {
    return body.length > 160 ? `${body.slice(0, 157)}…` : body;
  }

  async function buildSummaries(
    storeId: string,
    records: ReviewRecord[],
  ): Promise<AdminReviewSummary[]> {
    const productMap = await data.findProductInfoByIds(storeId, records.map((r) => r.productId));
    const nameMap = await data.findCustomerNamesByIds(storeId, records.map((r) => r.customerId));
    return records.map((r) => ({
      id: r.id,
      productId: r.productId,
      productTitle: productMap.get(r.productId)?.title ?? "—",
      variantLabel: null,
      customerName: adminCustomerName(nameMap.get(r.customerId)),
      rating: r.rating,
      title: r.title,
      bodyPreview: toBodyPreview(r.body),
      status: r.status,
      verifiedPurchase: r.verifiedPurchase,
      helpfulCount: r.helpfulCount,
      createdAt: r.createdAt.toISOString(),
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    }));
  }

  async function buildDetail(storeId: string, r: ReviewRecord): Promise<AdminReviewDetail> {
    const [summaries, orderMap] = await Promise.all([
      buildSummaries(storeId, [r]),
      data.findOrderNumbersByIds(storeId, [r.orderId]),
    ]);
    const nameMap = await data.findCustomerNamesByIds(storeId, [r.customerId]);
    return {
      ...summaries[0],
      body: r.body,
      moderationNote: r.moderationNote,
      orderId: r.orderId,
      orderNumber: orderMap.get(r.orderId) ?? "—",
      customerId: r.customerId,
      customerEmail: nameMap.get(r.customerId)?.email ?? null,
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  // ── Liste (Data Grid) ──────────────────────────────────────────────────────
  app.get("/stores/:storeId/reviews", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const query = adminReviewListQuerySchema.parse(request.query);
    const { page, pageSize, limit, offset } = resolveAdminListPage(query);
    const { items, total } = await data.listAdminReviews(storeId, {
      status: query.status,
      rating: query.rating,
      verifiedPurchase:
        query.verifiedPurchase === undefined ? undefined : query.verifiedPurchase === "true",
      productId: query.productId,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      limit,
      offset,
    });
    return adminReviewListResponseSchema.parse({
      data: await buildSummaries(storeId, items),
      pagination: buildAdminListPagination({ page, pageSize, totalItems: total }),
    });
  });

  // ── Detay ──────────────────────────────────────────────────────────────────
  app.get("/stores/:storeId/reviews/:reviewId", async (request, reply) => {
    const { storeId, reviewId } = request.params as { storeId: string; reviewId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const review = await data.findReviewById(storeId, reviewId);
    if (!review) {
      return reply.code(404).send(errorBody("REVIEW_NOT_FOUND", "Yorum bulunamadı."));
    }
    return adminReviewDetailResponseSchema.parse({ data: await buildDetail(storeId, review) });
  });

  // ── Moderate (approve / reject / hide) ──────────────────────────────────────
  app.post("/stores/:storeId/reviews/:reviewId/moderate", async (request, reply) => {
    const { storeId, reviewId } = request.params as { storeId: string; reviewId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const body = reviewModerateRequestSchema.parse(request.body ?? {});
    const nextStatus = ACTION_TO_STATUS[body.action];
    const moderated = await data.moderateReview(
      storeId,
      reviewId,
      nextStatus,
      body.moderationNote ?? null,
    );
    if (!moderated) {
      return reply.code(404).send(errorBody("REVIEW_NOT_FOUND", "Yorum bulunamadı."));
    }
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId,
      entityType: "ProductReview",
      entityId: moderated.id,
      metadata: { action: body.action, status: moderated.status, note: body.moderationNote ?? null },
    });
    return reviewModerateResponseSchema.parse({ data: await buildDetail(storeId, moderated) });
  });
}
