/**
 * TD-130 (ADR-145…148) — Recommendation event HTTP route testleri (Fastify inject; fakes).
 *
 * Kapsam: impression/click/add-to-cart kaydı · bot/prefetch elenir · kimliksiz elenir · source/placement/type
 * allowlist · cross-store ürün/anchor reddi · impression zaman-pencere dedupe · add-to-cart dedupeKey · rate
 * limit 429 · guest (visitorHash) vs customer kimliği · admin özet (yetki + CTR) · cross-store yetki reddi.
 */
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@commerce-os/db", () => ({ prisma: {} }));

// resolveCustomerFromRequest'i mutable mock ile kontrol et (guest vs customer).
let mockCustomer: { id: string } | null = null;
vi.mock("../src/customers/index.js", () => ({
  resolveCustomerFromRequest: async () => mockCustomer,
}));

const { registerRecommendationEventRoutes } = await import("../src/recommendation-events/routes.js");
type Deps = Parameters<typeof registerRecommendationEventRoutes>[1];

const CONFIG = {
  SESSION_SECRET: "test-secret-abcdefghijklmnopqrstuvwxyz",
  RECOMMENDATION_IMPRESSION_DEDUPE_SECONDS: 1800,
  RECOMMENDATION_CLICK_DEDUPE_SECONDS: 30,
  RECOMMENDATION_EVENT_RATE_LIMIT_MAX: 240,
  RECOMMENDATION_EVENT_RATE_LIMIT_WINDOW_SECONDS: 60,
} as unknown as Deps["config"];

interface Inserted {
  storeId: string;
  identity: { customerId?: string | null; visitorHash?: string | null; sessionHash?: string | null };
  productId: string;
  anchorProductId?: string | null;
  source: string;
  placement: string;
  eventType: string;
  dedupeKey?: string | null;
}

function buildApp(over?: {
  productOwned?: boolean;
  anchorOwned?: boolean;
  lastEventAtMs?: number | null;
  dedupeKeyExists?: boolean;
  summarize?: unknown;
  requireAdminOk?: boolean;
  rateLimitAllow?: boolean;
}) {
  const inserted: Inserted[] = [];
  const data = {
    productBelongsToStore: vi.fn(async (_s: string, pid: string) =>
      pid.startsWith("anchor") ? over?.anchorOwned ?? true : over?.productOwned ?? true,
    ),
    lastEventAtMs: vi.fn(async () => over?.lastEventAtMs ?? null),
    dedupeKeyExists: vi.fn(async () => over?.dedupeKeyExists ?? false),
    insertEvent: vi.fn(async (input: Inserted) => {
      inserted.push(input);
    }),
    summarize: vi.fn(async () =>
      over?.summarize ?? {
        totals: { impressions: 100, clicks: 25, addToCart: 5 },
        bySource: [{ key: "RECENTLY_VIEWED", impressions: 100, clicks: 25, addToCart: 5 }],
        byPlacement: [{ key: "HOME", impressions: 100, clicks: 25, addToCart: 5 }],
      },
    ),
  };
  const rateLimiter = { hit: () => over?.rateLimitAllow ?? true, prune: () => {} };
  const app = Fastify();
  registerRecommendationEventRoutes(app, {
    config: CONFIG,
    customers: {} as Deps["customers"],
    logger: { warn: () => {} },
    resolvePublicStore: async (slug: string) => (slug === "demo" ? { id: "store_1", slug } : null),
    data: data as unknown as Deps["data"],
    requireStoreAdmin: async (_req, reply) => {
      if (over?.requireAdminOk === false) {
        reply.code(403).send({ error: { code: "FORBIDDEN", message: "no" } });
        return null;
      }
      return { actorUserId: "u1" };
    },
    rateLimiter,
  });
  return { app, data, inserted };
}

const post = (app: ReturnType<typeof buildApp>["app"], body: unknown, headers: Record<string, string> = {}) =>
  app.inject({
    method: "POST",
    url: "/public/stores/demo/recommendation-events",
    headers: { "user-agent": "Mozilla/5.0 (test-browser)", "x-visitor-id": "vid-123", ...headers },
    payload: body,
  });

const impression = { type: "IMPRESSION", source: "RECENTLY_VIEWED", placement: "HOME", productId: "prod_1" };

beforeEach(() => {
  mockCustomer = null;
});
afterEach(() => vi.clearAllMocks());

describe("recommendation-events POST", () => {
  it("guest impression → recorded:true, visitorHash yazılır (ham vid DEĞİL)", async () => {
    const { app, inserted } = buildApp();
    const res = await post(app, impression);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ recorded: true, deduped: false });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].identity.visitorHash).toBeTruthy();
    expect(inserted[0].identity.visitorHash).not.toBe("vid-123");
    expect(inserted[0].identity.customerId ?? null).toBeNull();
  });

  it("customer kimliği → customerId yazılır", async () => {
    mockCustomer = { id: "cust_9" };
    const { app, inserted } = buildApp();
    await post(app, impression, { "x-customer-session": "sess" });
    expect(inserted[0].identity.customerId).toBe("cust_9");
  });

  it("bot UA → event üretilmez (recorded:false)", async () => {
    const { app, data } = buildApp();
    const res = await post(app, impression, { "user-agent": "Googlebot/2.1" });
    expect(res.json().data.recorded).toBe(false);
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("prefetch → event üretilmez", async () => {
    const { app, data } = buildApp();
    const res = await post(app, impression, { "sec-purpose": "prefetch" });
    expect(res.json().data.recorded).toBe(false);
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("kimliksiz (visitor + customer yok) → event üretilmez", async () => {
    const { app, data } = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/public/stores/demo/recommendation-events",
      headers: { "user-agent": "Mozilla/5.0 (test)" }, // x-visitor-id YOK
      payload: impression,
    });
    expect(res.json().data.recorded).toBe(false);
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("source allowlist dışı → event üretilmez", async () => {
    const { app, data } = buildApp();
    const res = await post(app, { ...impression, source: "SPONSORED" });
    expect(res.json().data.recorded).toBe(false);
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("placement allowlist dışı → event üretilmez", async () => {
    const { app, data } = buildApp();
    await post(app, { ...impression, placement: "CHECKOUT" });
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("cross-store ürün (sahiplik yok) → reddedilir", async () => {
    const { app, data } = buildApp({ productOwned: false });
    const res = await post(app, impression);
    expect(res.json().data.recorded).toBe(false);
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("anchor sahipliği yok → reddedilir", async () => {
    const { app, data } = buildApp({ anchorOwned: false });
    await post(app, { type: "CLICK", source: "SIMILAR_PRODUCTS", placement: "PDP", productId: "prod_1", anchorProductId: "anchor_9" });
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("impression dedupe: pencere içinde son event varsa deduped:true", async () => {
    const { app, data } = buildApp({ lastEventAtMs: Date.now() - 5_000 });
    const res = await post(app, impression);
    expect(res.json().data).toEqual({ recorded: false, deduped: true });
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("add-to-cart dedupeKey mevcut → deduped:true (idempotent)", async () => {
    const { app, data } = buildApp({ dedupeKeyExists: true });
    const res = await post(app, {
      type: "ADD_TO_CART", source: "SIMILAR_PRODUCTS", placement: "PDP", productId: "prod_1", dedupeKey: "atc:xyz",
    });
    expect(res.json().data).toEqual({ recorded: false, deduped: true });
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("add-to-cart yeni → recorded:true + dedupeKey yazılır", async () => {
    const { app, inserted } = buildApp();
    await post(app, {
      type: "ADD_TO_CART", source: "SIMILAR_PRODUCTS", placement: "PDP", productId: "prod_1", dedupeKey: "atc:xyz",
    });
    expect(inserted[0].eventType).toBe("ADD_TO_CART");
    expect(inserted[0].dedupeKey).toBe("atc:xyz");
  });

  it("rate limit aşımı → 429", async () => {
    const { app } = buildApp({ rateLimitAllow: false });
    const res = await post(app, impression);
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
  });

  it("bilinmeyen store → 404", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "POST", url: "/public/stores/nope/recommendation-events", payload: impression, headers: { "x-visitor-id": "v" } });
    expect(res.statusCode).toBe(404);
  });
});

describe("recommendation-events GET summary (admin)", () => {
  it("yetkili → 200 + totals CTR türetilir", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "GET", url: "/stores/store_1/recommendation-events/summary" });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.totals).toEqual({ impressions: 100, clicks: 25, addToCart: 5, ctr: 0.25 });
    expect(data.bySource[0].ctr).toBe(0.25);
  });

  it("geçersiz source filtresi yok sayılır (null)", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "GET", url: "/stores/store_1/recommendation-events/summary?source=SPONSORED&placement=HOME" });
    expect(res.json().data.filters).toEqual({ source: null, placement: "HOME" });
  });

  it("yetkisiz → 403 (requireStoreAdmin reddeder)", async () => {
    const { app } = buildApp({ requireAdminOk: false });
    const res = await app.inject({ method: "GET", url: "/stores/store_1/recommendation-events/summary" });
    expect(res.statusCode).toBe(403);
  });
});
