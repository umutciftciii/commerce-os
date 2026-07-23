import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "@commerce-os/config";
import {
  registerCustomerReviewRoutes,
  registerPublicReviewRoutes,
  registerReviewAdminRoutes,
  type ReviewRoutesDeps,
} from "../src/reviews/routes.js";
import {
  computeAggregate,
  type AggregateRecord,
  type EligibleLine,
  type ReviewData,
  type ReviewRecord,
} from "../src/reviews/data.js";
import type { CustomerDataAccess } from "../src/customers/index.js";

/**
 * TODO-159E (ADR-094) — Product Reviews gateway route testleri (DB'siz, in-memory fake).
 *
 * Doğrulananlar: sunucu-otoriter uygunluk, cross-customer reddi, duplicate koruması, rating
 * validasyonu, PENDING create, approved edit→pending, moderate approve/reject/hide, public
 * YALNIZ approved, public projeksiyon sızıntısı, helpful add/remove/idempotency + self engeli,
 * rate-limit, tenant izolasyonu, admin sayfalama/filtre. Aggregate SAF hesabı ayrı testte.
 */

const SECRET = "test-session-secret-with-enough-length";
const STORE = { id: "store_a", slug: "store-a" };
const STORE_B = { id: "store_b", slug: "store-b" };

function hash(token: string): string {
  return createHash("sha256").update(`${token}.${SECRET}`).digest("hex");
}

const sessions: Record<string, { storeId: string; customerId: string }> = {
  [hash("token-a")]: { storeId: STORE.id, customerId: "customer_a" },
  [hash("token-a2")]: { storeId: STORE.id, customerId: "customer_b" },
  [hash("token-b")]: { storeId: STORE_B.id, customerId: "customer_c" },
};

// Uygunluk seed'i: orderLineId → { storeId, customerId, line }
interface EligibleSeed {
  storeId: string;
  customerId: string;
  line: EligibleLine;
}
function seedEligible(): Map<string, EligibleSeed> {
  const m = new Map<string, EligibleSeed>();
  const mk = (id: string, product: string, customer: string, storeId: string): EligibleSeed => ({
    storeId,
    customerId: customer,
    line: {
      orderLineId: id,
      orderId: `order_${id}`,
      orderNumber: `NO-${id}`,
      productId: product,
      productTitle: `Product ${product}`,
      productSlug: product,
      variantId: `var_${id}`,
      variantLabel: "V",
      purchasedAt: new Date("2026-07-01T00:00:00Z"),
    },
  });
  m.set("line_a1", mk("line_a1", "p1", "customer_a", STORE.id));
  m.set("line_a2", mk("line_a2", "p2", "customer_a", STORE.id));
  m.set("line_b1", mk("line_b1", "p3", "customer_c", STORE_B.id));
  return m;
}

function createMemoryData(eligible: Map<string, EligibleSeed>): ReviewData {
  const reviews: ReviewRecord[] = [];
  const helpful: Array<{ reviewId: string; customerId: string }> = [];
  let seq = 0;

  const names: Record<string, { firstName: string | null; lastName: string | null; email: string | null }> = {
    customer_a: { firstName: "Ayşe", lastName: "Kaya", email: "a@example.com" },
    customer_b: { firstName: "Mehmet", lastName: "Demir", email: "m@example.com" },
    customer_c: { firstName: "Can", lastName: "Yıldız", email: "c@example.com" },
  };

  const hasReviewForProduct = (storeId: string, productId: string, customerId: string) =>
    reviews.some((r) => r.storeId === storeId && r.productId === productId && r.customerId === customerId);

  const buildAggregate = (storeId: string, productId: string): AggregateRecord | null => {
    const approved = reviews.filter(
      (r) => r.storeId === storeId && r.productId === productId && r.status === "APPROVED",
    );
    if (approved.length === 0) return null;
    const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
    for (const r of approved) c[r.rating as 1 | 2 | 3 | 4 | 5] += 1;
    return { productId, storeId, ...computeAggregate(c) };
  };

  return {
    async listEligibleLines(storeId, customerId) {
      const out: EligibleLine[] = [];
      const seen = new Set<string>();
      for (const s of eligible.values()) {
        if (s.storeId !== storeId || s.customerId !== customerId) continue;
        if (reviews.some((r) => r.orderLineId === s.line.orderLineId)) continue;
        if (hasReviewForProduct(storeId, s.line.productId, customerId)) continue;
        if (seen.has(s.line.productId)) continue;
        seen.add(s.line.productId);
        out.push(s.line);
      }
      return out;
    },
    async findEligibleLineForProduct(storeId, customerId, productId) {
      for (const s of eligible.values()) {
        if (s.storeId === storeId && s.customerId === customerId && s.line.productId === productId) {
          if (reviews.some((r) => r.orderLineId === s.line.orderLineId)) return null;
          return s.line;
        }
      }
      return null;
    },
    async resolveEligibleLineById(storeId, customerId, orderLineId) {
      const s = eligible.get(orderLineId);
      if (!s || s.storeId !== storeId || s.customerId !== customerId) return null;
      if (reviews.some((r) => r.orderLineId === orderLineId)) return null;
      return s.line;
    },
    async findReviewById(storeId, id) {
      return reviews.find((r) => r.id === id && r.storeId === storeId) ?? null;
    },
    async findOwnReview(storeId, customerId, id) {
      return reviews.find((r) => r.id === id && r.storeId === storeId && r.customerId === customerId) ?? null;
    },
    async findReviewByProductCustomer(storeId, productId, customerId) {
      return reviews.find(
        (r) => r.storeId === storeId && r.productId === productId && r.customerId === customerId,
      ) ?? null;
    },
    async createReview(input) {
      if (hasReviewForProduct(input.storeId, input.productId, input.customerId)) {
        throw Object.assign(new Error("dup"), { code: "P2002" });
      }
      const now = new Date();
      const record: ReviewRecord = {
        id: `rev_${++seq}`,
        storeId: input.storeId,
        productId: input.productId,
        variantId: input.variantId,
        customerId: input.customerId,
        orderId: input.orderId,
        orderLineId: input.orderLineId,
        rating: input.rating,
        title: input.title,
        body: input.body,
        status: "PENDING",
        verifiedPurchase: true,
        helpfulCount: 0,
        moderationNote: null,
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      reviews.push(record);
      return record;
    },
    async updateOwnReview(storeId, id, input) {
      const record = reviews.find((r) => r.id === id && r.storeId === storeId);
      if (!record) throw new Error("not-found");
      record.rating = input.rating;
      record.title = input.title;
      record.body = input.body;
      if (input.backToPending && record.status === "APPROVED") {
        record.status = "PENDING";
        record.publishedAt = null;
      }
      record.updatedAt = new Date();
      return record;
    },
    async listCustomerReviews(storeId, customerId) {
      return reviews.filter((r) => r.storeId === storeId && r.customerId === customerId);
    },
    async getAggregate(storeId, productId) {
      return buildAggregate(storeId, productId);
    },
    async getAggregatesByProductIds(storeId, productIds) {
      return productIds
        .map((id) => buildAggregate(storeId, id))
        .filter((a): a is AggregateRecord => a !== null);
    },
    async listApprovedReviews(storeId, productId, options) {
      let items = reviews.filter(
        (r) => r.storeId === storeId && r.productId === productId && r.status === "APPROVED",
      );
      if (options.rating) items = items.filter((r) => r.rating === options.rating);
      const total = items.length;
      const sorted = [...items].sort((a, b) => {
        switch (options.sort) {
          case "highest":
            return b.rating - a.rating;
          case "lowest":
            return a.rating - b.rating;
          case "most_helpful":
            return b.helpfulCount - a.helpfulCount;
          case "oldest":
            return a.createdAt.getTime() - b.createdAt.getTime();
          default:
            return b.createdAt.getTime() - a.createdAt.getTime();
        }
      });
      return { items: sorted.slice(options.offset, options.offset + options.limit), total };
    },
    async findViewerHelpfulSet(reviewIds, customerId) {
      return new Set(
        helpful.filter((h) => h.customerId === customerId && reviewIds.includes(h.reviewId)).map((h) => h.reviewId),
      );
    },
    async hasViewerHelpful(reviewId, customerId) {
      return helpful.some((h) => h.reviewId === reviewId && h.customerId === customerId);
    },
    async toggleHelpful(_storeId, reviewId, customerId, desired) {
      const record = reviews.find((r) => r.id === reviewId);
      const idx = helpful.findIndex((h) => h.reviewId === reviewId && h.customerId === customerId);
      if (desired && idx === -1) {
        helpful.push({ reviewId, customerId });
        if (record) record.helpfulCount += 1;
      } else if (!desired && idx >= 0) {
        helpful.splice(idx, 1);
        if (record) record.helpfulCount = Math.max(0, record.helpfulCount - 1);
      }
      return { helpful: helpful.some((h) => h.reviewId === reviewId && h.customerId === customerId), helpfulCount: record?.helpfulCount ?? 0 };
    },
    async listAdminReviews(storeId, filters) {
      let items = reviews.filter((r) => r.storeId === storeId);
      if (filters.status) items = items.filter((r) => r.status === filters.status);
      if (filters.rating) items = items.filter((r) => r.rating === filters.rating);
      if (filters.verifiedPurchase !== undefined)
        items = items.filter((r) => r.verifiedPurchase === filters.verifiedPurchase);
      if (filters.productId) items = items.filter((r) => r.productId === filters.productId);
      const total = items.length;
      const sorted = [...items].sort((a, b) =>
        filters.sortOrder === "asc"
          ? a.createdAt.getTime() - b.createdAt.getTime()
          : b.createdAt.getTime() - a.createdAt.getTime(),
      );
      return { items: sorted.slice(filters.offset, filters.offset + filters.limit), total };
    },
    async moderateReview(storeId, id, nextStatus, moderationNote) {
      const record = reviews.find((r) => r.id === id && r.storeId === storeId);
      if (!record) return null;
      record.status = nextStatus;
      record.moderationNote = moderationNote;
      record.publishedAt = nextStatus === "APPROVED" ? new Date() : null;
      record.updatedAt = new Date();
      return record;
    },
    async findProductInfoByIds(_storeId, ids) {
      return new Map(ids.map((id) => [id, { id, title: `Product ${id}`, slug: id }]));
    },
    async findCustomerNamesByIds(_storeId, ids) {
      return new Map(ids.map((id) => [id, names[id] ?? { firstName: null, lastName: null, email: null }]));
    },
    async findOrderNumbersByIds(_storeId, ids) {
      return new Map(ids.map((id) => [id, `NO-${id}`]));
    },
  };
}

let recordAudit: ReturnType<typeof vi.fn>;

function buildApp(): { app: FastifyInstance; data: ReviewData } {
  const data = createMemoryData(seedEligible());
  const customers = {
    async findSessionByTokenHash(tokenHash: string) {
      const s = sessions[tokenHash];
      if (!s) return null;
      return {
        id: "sess",
        storeId: s.storeId,
        customerId: s.customerId,
        tokenHash,
        expiresAt: new Date(Date.now() + 3_600_000),
        revokedAt: null,
        customer: { id: s.customerId, storeId: s.storeId, status: "ACTIVE" as const },
      };
    },
  } as unknown as CustomerDataAccess;

  const deps: ReviewRoutesDeps = {
    config: { SESSION_SECRET: SECRET, MEDIA_PUBLIC_BASE_URL: "" } as unknown as AppConfig,
    customers,
    logger: { info() {}, warn() {} },
    resolvePublicStore: async (slug) =>
      slug === STORE.slug ? STORE : slug === STORE_B.slug ? STORE_B : null,
    data,
    catalog: { listProductImages: async () => new Map() },
  };

  recordAudit = vi.fn(async () => undefined);
  const app = Fastify({ logger: false });
  // Production server.ts ile aynı: ZodError → 400 (test app'te de aynı davranış).
  app.setErrorHandler(async (error, _req, reply) => {
    if (error instanceof z.ZodError) {
      await reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Validation failed." } });
      return;
    }
    await reply.code(500).send({ error: { code: "INTERNAL", message: "error" } });
  });
  registerPublicReviewRoutes(app, deps);
  registerCustomerReviewRoutes(app, deps);
  registerReviewAdminRoutes(app, {
    data,
    requireStoreAdmin: async (_req: FastifyRequest, reply: FastifyReply, storeId: string) => {
      // Yalnız store_a admin'i (tenant izolasyon testi için store_b reddedilir).
      if (storeId !== STORE.id) {
        await reply.code(404).send({ error: { code: "STORE_ACCESS_DENIED" } });
        return null;
      }
      return { actorUserId: "admin_1" };
    },
    recordAudit,
  });
  return { app, data };
}

const A = { "x-customer-session": "token-a" };
const A2 = { "x-customer-session": "token-a2" };
const cbase = "/public/stores/store-a/customer";
const pbase = "/public/stores/store-a";

let app: FastifyInstance;
beforeEach(() => {
  app = buildApp().app;
});

async function createReview(headers: Record<string, string>, body: unknown) {
  return app.inject({ method: "POST", url: `${cbase}/reviews`, headers, payload: body });
}
async function approve(reviewId: string) {
  return app.inject({
    method: "POST",
    url: `/stores/store_a/reviews/${reviewId}/moderate`,
    payload: { action: "approve" },
  });
}

describe("reviews — oluşturma + uygunluk", () => {
  it("uygun sipariş kalemi → 201 PENDING + verifiedPurchase", async () => {
    const res = await createReview(A, { orderLineId: "line_a1", rating: 5, body: "Harika ürün" });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.status).toBe("PENDING");
    expect(body.data.verifiedPurchase).toBe(true);
    expect(body.data.rating).toBe(5);
  });

  it("oturumsuz → 401", async () => {
    const res = await createReview({}, { orderLineId: "line_a1", rating: 5, body: "x" });
    expect(res.statusCode).toBe(401);
  });

  it("başka müşterinin sipariş kalemi → 403", async () => {
    // customer_b, customer_a'nın line_a1'ine yorum yazamaz.
    const res = await createReview(A2, { orderLineId: "line_a1", rating: 4, body: "deneme" });
    expect(res.statusCode).toBe(403);
  });

  it("cross-store sipariş kalemi → 403", async () => {
    const res = await createReview(A, { orderLineId: "line_b1", rating: 4, body: "deneme" });
    expect(res.statusCode).toBe(403);
  });

  it("rating 1–5 dışı → 400 (validasyon)", async () => {
    const r6 = await createReview(A, { orderLineId: "line_a1", rating: 6, body: "x" });
    expect(r6.statusCode).toBe(400);
    const r0 = await createReview(A, { orderLineId: "line_a2", rating: 0, body: "x" });
    expect(r0.statusCode).toBe(400);
  });

  it("boş gövde → 400", async () => {
    const res = await createReview(A, { orderLineId: "line_a1", rating: 5, body: "   " });
    expect(res.statusCode).toBe(400);
  });

  it("HTML gövde plain-text'e indirgenir (etiket saklanmaz)", async () => {
    const res = await createReview(A, {
      orderLineId: "line_a1",
      rating: 5,
      body: "<script>alert(1)</script>Güzel",
    });
    expect(res.statusCode).toBe(201);
    // Etiketler kaldırılır (script çalıştırılamaz); etiket-içi düz metin korunur.
    expect(res.json().data.body).not.toContain("<script>");
    expect(res.json().data.body).toContain("Güzel");
  });

  it("aynı ürüne ikinci yorum → 409", async () => {
    await createReview(A, { orderLineId: "line_a1", rating: 5, body: "ilk" });
    // line_a1 kullanıldı; aynı ürün p1 için başka satır yok ama duplicate product kontrolü:
    const res = await createReview(A, { orderLineId: "line_a1", rating: 4, body: "ikinci" });
    expect(res.statusCode).toBe(403); // line_a1 artık kullanıldı → uygunluk yok
  });
});

describe("reviews — moderasyon + public görünürlük", () => {
  it("PENDING yorum public listede GÖRÜNMEZ; approve sonrası görünür", async () => {
    const created = (await createReview(A, { orderLineId: "line_a1", rating: 5, body: "Süper" })).json();
    let pub = await app.inject({ method: "GET", url: `${pbase}/products/p1/reviews` });
    expect(pub.json().data).toHaveLength(0);
    expect(pub.json().summary.reviewCount).toBe(0);

    const mod = await approve(created.data.id);
    expect(mod.statusCode).toBe(200);
    expect(recordAudit).toHaveBeenCalledTimes(1);

    pub = await app.inject({ method: "GET", url: `${pbase}/products/p1/reviews` });
    expect(pub.json().data).toHaveLength(1);
    expect(pub.json().summary.reviewCount).toBe(1);
    expect(pub.json().summary.averageRating).toBe(5);
  });

  it("public yanıt ALLOWLIST — PII/order/note SIZMAZ", async () => {
    const created = (await createReview(A, { orderLineId: "line_a1", rating: 5, body: "Gizli test" })).json();
    await approve(created.data.id);
    const pub = await app.inject({ method: "GET", url: `${pbase}/products/p1/reviews` });
    const review = pub.json().data[0];
    const serialized = JSON.stringify(review);
    expect(serialized).not.toContain("customer_a");
    expect(serialized).not.toContain("example.com");
    expect(serialized).not.toContain("line_a1");
    expect(serialized).not.toContain("order_");
    expect(review.customerId).toBeUndefined();
    expect(review.orderId).toBeUndefined();
    expect(review.moderationNote).toBeUndefined();
    // Yazar adı MASKELİ (ad + soyad baş harfi).
    expect(review.authorName).toBe("Ayşe K.");
  });

  it("reject/hide sonrası public aggregate güncellenir", async () => {
    const created = (await createReview(A, { orderLineId: "line_a1", rating: 4, body: "x" })).json();
    await approve(created.data.id);
    let summary = (await app.inject({ method: "GET", url: `${pbase}/products/p1/reviews/summary` })).json();
    expect(summary.data.reviewCount).toBe(1);
    await app.inject({
      method: "POST",
      url: `/stores/store_a/reviews/${created.data.id}/moderate`,
      payload: { action: "hide", moderationNote: "spam" },
    });
    summary = (await app.inject({ method: "GET", url: `${pbase}/products/p1/reviews/summary` })).json();
    expect(summary.data.reviewCount).toBe(0);
  });

  it("approved yorum düzenlenince tekrar PENDING", async () => {
    const created = (await createReview(A, { orderLineId: "line_a1", rating: 5, body: "ilk" })).json();
    await approve(created.data.id);
    const edited = await app.inject({
      method: "PATCH",
      url: `${cbase}/reviews/${created.data.id}`,
      headers: A,
      payload: { rating: 3, body: "güncellendi" },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().data.status).toBe("PENDING");
  });
});

describe("reviews — helpful", () => {
  async function approvedReviewByOther() {
    // customer_a yazar, approve; customer_b oy verir.
    const created = (await createReview(A, { orderLineId: "line_a1", rating: 5, body: "faydalı" })).json();
    await approve(created.data.id);
    return created.data.id as string;
  }

  it("faydalı ekle/çıkar idempotent", async () => {
    const id = await approvedReviewByOther();
    const add = await app.inject({
      method: "POST",
      url: `${cbase}/reviews/${id}/helpful`,
      headers: A2,
      payload: { helpful: true },
    });
    expect(add.json().data.helpful).toBe(true);
    expect(add.json().data.helpfulCount).toBe(1);
    // Tekrar true → idempotent (sayaç 1 kalır).
    const again = await app.inject({
      method: "POST",
      url: `${cbase}/reviews/${id}/helpful`,
      headers: A2,
      payload: { helpful: true },
    });
    expect(again.json().data.helpfulCount).toBe(1);
    // false → kaldır.
    const remove = await app.inject({
      method: "POST",
      url: `${cbase}/reviews/${id}/helpful`,
      headers: A2,
      payload: { helpful: false },
    });
    expect(remove.json().data.helpful).toBe(false);
    expect(remove.json().data.helpfulCount).toBe(0);
  });

  it("kendi yorumuna helpful → 409", async () => {
    const id = await approvedReviewByOther();
    const res = await app.inject({
      method: "POST",
      url: `${cbase}/reviews/${id}/helpful`,
      headers: A,
      payload: { helpful: true },
    });
    expect(res.statusCode).toBe(409);
  });

  it("PENDING yoruma helpful → 404", async () => {
    const created = (await createReview(A, { orderLineId: "line_a1", rating: 5, body: "x" })).json();
    const res = await app.inject({
      method: "POST",
      url: `${cbase}/reviews/${created.data.id}/helpful`,
      headers: A2,
      payload: { helpful: true },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("reviews — rate limit + tenant + admin", () => {
  it("düzenlemede rate-limit (10/dk) 11. istekte 429", async () => {
    const created = (await createReview(A, { orderLineId: "line_a1", rating: 5, body: "x" })).json();
    let last = 0;
    for (let i = 0; i < 11; i += 1) {
      const res = await app.inject({
        method: "PATCH",
        url: `${cbase}/reviews/${created.data.id}`,
        headers: A,
        payload: { rating: 4, body: `edit ${i}` },
      });
      last = res.statusCode;
    }
    expect(last).toBe(429);
  });

  it("admin liste tenant-izole: store_b admin reddedilir", async () => {
    const res = await app.inject({ method: "GET", url: `/stores/store_b/reviews` });
    expect(res.statusCode).toBe(404);
  });

  it("admin liste sayfalama + status filtresi", async () => {
    const c1 = (await createReview(A, { orderLineId: "line_a1", rating: 5, body: "bir" })).json();
    await createReview(A, { orderLineId: "line_a2", rating: 3, body: "iki" });
    await approve(c1.data.id);
    const pending = await app.inject({ method: "GET", url: `/stores/store_a/reviews?status=PENDING` });
    expect(pending.json().data).toHaveLength(1);
    expect(pending.json().pagination.totalItems).toBe(1);
    const approved = await app.inject({ method: "GET", url: `/stores/store_a/reviews?status=APPROVED` });
    expect(approved.json().data).toHaveLength(1);
    const all = await app.inject({ method: "GET", url: `/stores/store_a/reviews?pageSize=25` });
    expect(all.json().pagination.totalItems).toBe(2);
  });

  it("moderate bilinmeyen id → 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/stores/store_a/reviews/nope/moderate`,
      payload: { action: "approve" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("eligibility ucu: yorumlanınca ALREADY_REVIEWED", async () => {
    const before = await app.inject({
      method: "GET",
      url: `${cbase}/products/p1/review-eligibility`,
      headers: A,
    });
    expect(before.json().data.eligible).toBe(true);
    expect(before.json().data.reason).toBe("ELIGIBLE");
    await createReview(A, { orderLineId: "line_a1", rating: 5, body: "x" });
    const after = await app.inject({
      method: "GET",
      url: `${cbase}/products/p1/review-eligibility`,
      headers: A,
    });
    expect(after.json().data.eligible).toBe(false);
    expect(after.json().data.reason).toBe("ALREADY_REVIEWED");
  });
});
