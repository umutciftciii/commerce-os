/**
 * TODO-162 (ADR-205) — Home Discovery event HTTP route testleri (Fastify inject; fakes).
 *
 * Kapsam: section/card impression + click kaydı · bot/prefetch/kimliksiz elenir · eventType/sectionType/
 * eligibilitySource allowlist · uydurma section reddi (sectionTypeForStore null) · claimed↔actual type
 * uyuşmazlığı reddi · cross-store ürün reddi · impression zaman-pencere dedupe · add-to-cart dedupeKey · rate
 * limit 429 · guest (visitorHash) vs customer kimliği · admin özet (yetki + CTR + filtre) · yetki reddi.
 */
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@commerce-os/db", () => ({ prisma: {} }));

let mockCustomer: { id: string } | null = null;
vi.mock("../src/customers/index.js", () => ({
  resolveCustomerFromRequest: async () => mockCustomer,
}));

const { registerDiscoveryEventRoutes } = await import("../src/home/discovery-event-routes.js");
type Deps = Parameters<typeof registerDiscoveryEventRoutes>[1];

const CONFIG = {
  SESSION_SECRET: "test-secret-abcdefghijklmnopqrstuvwxyz",
  HOME_DISCOVERY_IMPRESSION_DEDUPE_SECONDS: 1800,
  HOME_DISCOVERY_INTERACTION_DEDUPE_SECONDS: 30,
  HOME_DISCOVERY_EVENT_RATE_LIMIT_MAX: 600,
  HOME_DISCOVERY_EVENT_RATE_LIMIT_WINDOW_SECONDS: 60,
} as unknown as Deps["config"];

interface Inserted {
  storeId: string;
  identity: { customerId?: string | null; visitorHash?: string | null; sessionHash?: string | null };
  sectionId: string;
  sectionType: string;
  eligibilitySource: string;
  eventType: string;
  productId?: string | null;
  dedupeKey?: string | null;
}

function buildApp(over?: {
  sectionType?: string | null; // undefined → "CONTINUE_BROWSING" (owned+match); null → not owned
  productOwned?: boolean;
  lastEventAtMs?: number | null;
  dedupeKeyExists?: boolean;
  requireAdminOk?: boolean;
  rateLimitAllow?: boolean;
}) {
  const inserted: Inserted[] = [];
  const data = {
    sectionTypeForStore: vi.fn(async () => (over?.sectionType === undefined ? "CONTINUE_BROWSING" : over.sectionType)),
    productBelongsToStore: vi.fn(async () => over?.productOwned ?? true),
    lastEventAtMs: vi.fn(async () => over?.lastEventAtMs ?? null),
    dedupeKeyExists: vi.fn(async () => over?.dedupeKeyExists ?? false),
    insertEvent: vi.fn(async (input: Inserted) => {
      inserted.push(input);
    }),
    summarize: vi.fn(async () => ({
      totals: { key: "__totals__", sectionImpressions: 100, cardImpressions: 80, productClicks: 20, ctaClicks: 5, addToCart: 3 },
      bySectionType: [
        { key: "CONTINUE_BROWSING", sectionImpressions: 100, cardImpressions: 80, productClicks: 20, ctaClicks: 5, addToCart: 3 },
      ],
      byEligibilitySource: [
        { key: "RECENTLY_VIEWED", sectionImpressions: 100, cardImpressions: 80, productClicks: 20, ctaClicks: 5, addToCart: 3 },
      ],
    })),
  };
  const rateLimiter = { hit: () => over?.rateLimitAllow ?? true, prune: () => {} };
  const app = Fastify();
  registerDiscoveryEventRoutes(app, {
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
    url: "/public/stores/demo/home/discovery-events",
    headers: { "user-agent": "Mozilla/5.0 (test-browser)", "x-visitor-id": "vid-123", ...headers },
    payload: body,
  });

const sectionImpression = {
  type: "SECTION_IMPRESSION",
  sectionId: "sec_1",
  sectionType: "CONTINUE_BROWSING",
  eligibilitySource: "RECENTLY_VIEWED",
};
const cardImpression = { ...sectionImpression, type: "CARD_IMPRESSION", productId: "prod_1" };

beforeEach(() => {
  mockCustomer = null;
});
afterEach(() => vi.clearAllMocks());

describe("discovery-events POST", () => {
  it("guest section impression → recorded:true, visitorHash yazılır (ham vid DEĞİL)", async () => {
    const { app, inserted } = buildApp();
    const res = await post(app, sectionImpression);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ recorded: true, deduped: false });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].identity.visitorHash).toBeTruthy();
    expect(inserted[0].identity.visitorHash).not.toBe("vid-123");
    expect(inserted[0].identity.customerId ?? null).toBeNull();
    expect(inserted[0].productId ?? null).toBeNull();
  });

  it("customer kimliği → customerId yazılır", async () => {
    mockCustomer = { id: "cust_9" };
    const { app, inserted } = buildApp();
    await post(app, sectionImpression, { "x-customer-session": "sess" });
    expect(inserted[0].identity.customerId).toBe("cust_9");
  });

  it("bot UA → event üretilmez", async () => {
    const { app, data } = buildApp();
    const res = await post(app, sectionImpression, { "user-agent": "Googlebot/2.1" });
    expect(res.json().data.recorded).toBe(false);
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("prefetch → event üretilmez", async () => {
    const { app, data } = buildApp();
    const res = await post(app, sectionImpression, { "sec-purpose": "prefetch" });
    expect(res.json().data.recorded).toBe(false);
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("kimliksiz → event üretilmez", async () => {
    const { app, data } = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/public/stores/demo/home/discovery-events",
      headers: { "user-agent": "Mozilla/5.0 (test)" },
      payload: sectionImpression,
    });
    expect(res.json().data.recorded).toBe(false);
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("eventType allowlist dışı → event üretilmez (strict şema reddeder)", async () => {
    const { app, data } = buildApp();
    const res = await post(app, { ...sectionImpression, type: "MOUSE_MOVE" });
    expect(res.json().data.recorded).toBe(false);
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("sectionType allowlist dışı → event üretilmez", async () => {
    const { app, data } = buildApp();
    const res = await post(app, { ...sectionImpression, sectionType: "HERO_SLIDER" });
    expect(res.json().data.recorded).toBe(false);
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("eligibilitySource allowlist dışı → event üretilmez", async () => {
    const { app, data } = buildApp();
    const res = await post(app, { ...sectionImpression, eligibilitySource: "MADE_UP" });
    expect(res.json().data.recorded).toBe(false);
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("gövdede fazladan alan (override girişimi) → strict reddeder", async () => {
    const { app, data } = buildApp();
    const res = await post(app, { ...sectionImpression, customerId: "hack", storeId: "other" });
    expect(res.json().data.recorded).toBe(false);
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("uydurma section (store'da yok / disabled) → reddedilir", async () => {
    const { app, data } = buildApp({ sectionType: null });
    const res = await post(app, sectionImpression);
    expect(res.json().data.recorded).toBe(false);
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("claimed↔actual sectionType uyuşmazlığı → reddedilir", async () => {
    const { app, data } = buildApp({ sectionType: "DAILY_DEALS" }); // DB farklı tip döner
    const res = await post(app, sectionImpression); // claim: CONTINUE_BROWSING
    expect(res.json().data.recorded).toBe(false);
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("cross-store ürün (sahiplik yok) → reddedilir", async () => {
    const { app, data } = buildApp({ productOwned: false });
    const res = await post(app, cardImpression);
    expect(res.json().data.recorded).toBe(false);
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("card impression dedupe: pencere içinde son event varsa deduped:true", async () => {
    const { app, data } = buildApp({ lastEventAtMs: Date.now() - 5_000 });
    const res = await post(app, cardImpression);
    expect(res.json().data).toEqual({ recorded: false, deduped: true });
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("add-to-cart dedupeKey mevcut → deduped:true (idempotent)", async () => {
    const { app, data } = buildApp({ dedupeKeyExists: true });
    const res = await post(app, { ...cardImpression, type: "ADD_TO_CART", dedupeKey: "atc:xyz" });
    expect(res.json().data).toEqual({ recorded: false, deduped: true });
    expect(data.insertEvent).not.toHaveBeenCalled();
  });

  it("add-to-cart yeni → recorded:true + dedupeKey yazılır", async () => {
    const { app, inserted } = buildApp();
    await post(app, { ...cardImpression, type: "ADD_TO_CART", dedupeKey: "atc:xyz" });
    expect(inserted[0].eventType).toBe("ADD_TO_CART");
    expect(inserted[0].dedupeKey).toBe("atc:xyz");
  });

  it("rate limit aşımı → 429", async () => {
    const { app } = buildApp({ rateLimitAllow: false });
    const res = await post(app, sectionImpression);
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
  });

  it("bilinmeyen store → 404", async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/public/stores/nope/home/discovery-events",
      payload: sectionImpression,
      headers: { "x-visitor-id": "v" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("discovery-events GET summary (admin)", () => {
  it("yetkili → 200 + totals CTR (productClicks/cardImpressions) türetilir", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "GET", url: "/stores/store_1/home/discovery-events/summary" });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.totals.ctr).toBe(0.25); // 20 / 80
    expect(data.bySectionType[0].ctr).toBe(0.25);
  });

  it("geçersiz eligibilitySource filtresi yok sayılır (null)", async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/home/discovery-events/summary?sectionType=CONTINUE_BROWSING&eligibilitySource=NOPE",
    });
    expect(res.json().data.filters).toEqual({ sectionType: "CONTINUE_BROWSING", eligibilitySource: null });
  });

  it("yetkisiz → 403", async () => {
    const { app } = buildApp({ requireAdminOk: false });
    const res = await app.inject({ method: "GET", url: "/stores/store_1/home/discovery-events/summary" });
    expect(res.statusCode).toBe(403);
  });
});
