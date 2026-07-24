import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "@commerce-os/config";
import {
  registerInfluencerAdminRoutes,
  registerPublicTrackingRoutes,
} from "../src/influencers/routes.js";
import { resolveAttributionForCheckout } from "../src/influencers/checkout-attribution.js";
import {
  computeAttributionExpiry,
  createSlidingWindowLimiter,
  reduceAttributionRevenue,
  signAttributionGrant,
  verifyAttributionGrant,
} from "../src/influencers/tracking-core.js";
import type {
  AnalyticsResult,
  AttributionExportRow,
  InfluencerCampaignRecord,
  InfluencerData,
  InfluencerRecord,
  ResolvedAttribution,
  TrackingLinkListRow,
  TrackingLinkRecord,
} from "../src/influencers/data.js";

const SECRET = "test-session-secret-with-enough-length-999";
const STORE_A = { id: "store_a", slug: "store-a" };
const STORE_B = { id: "store_b", slug: "store-b" };

// ── In-memory InfluencerData double ─────────────────────────────────────────
interface AttrState {
  storeId: string;
  orderId: string;
  influencerId: string;
  campaignId: string;
  trackingLinkId: string | null;
  grossRevenueMinor: number;
  refunds: Map<string, number>;
  currency: string;
}

function createMemoryData() {
  let seq = 0;
  const id = (p: string) => `${p}_${(seq += 1)}`;
  const influencers = new Map<string, InfluencerRecord>();
  const campaigns = new Map<string, InfluencerCampaignRecord>();
  const links = new Map<string, TrackingLinkRecord>();
  const products = new Map<string, { storeId: string; slug: string; title: string }>();
  const categories = new Map<string, { storeId: string; slug: string; title: string }>();
  const clicks: {
    id: string;
    storeId: string;
    trackingLinkId: string;
    visitorIdHash: string;
    isBot: boolean;
    createdAt: Date;
  }[] = [];
  const attributions = new Map<string, AttrState>();

  const now = new Date("2026-07-24T00:00:00.000Z");
  // Test-kontrollü saat: insertClick.createdAt route'un now()'ı ile TUTARLI olmalı
  // (gerçekte DB now() ≈ Date.now()). Dedupe testi bunu paylaşır.
  let clock = () => Date.now();

  function linkRow(link: TrackingLinkRecord): TrackingLinkListRow {
    const campaign = campaigns.get(link.campaignId)!;
    const influencer = influencers.get(campaign.influencerId)!;
    return {
      ...link,
      campaignName: campaign.name,
      influencerId: influencer.id,
      influencerName: influencer.name,
      productTitle: link.productId ? (products.get(link.productId)?.title ?? null) : null,
      categoryTitle: link.categoryId ? (categories.get(link.categoryId)?.title ?? null) : null,
      totalClicks: clicks.filter((c) => c.trackingLinkId === link.id).length,
      attributedOrders: [...attributions.values()].filter((a) => a.trackingLinkId === link.id).length,
    };
  }

  const data: InfluencerData = {
    async listInfluencers(storeId, filters, page) {
      let items = [...influencers.values()].filter((i) => i.storeId === storeId);
      if (filters.status) items = items.filter((i) => i.status === filters.status);
      const total = items.length;
      return {
        items: items.slice(page.offset, page.offset + page.limit).map((i) => ({ ...i, campaignCount: 0 })),
        total,
      };
    },
    async getInfluencer(storeId, idv) {
      const i = influencers.get(idv);
      return i && i.storeId === storeId ? i : null;
    },
    async createInfluencer(storeId, input) {
      if ([...influencers.values()].some((i) => i.storeId === storeId && i.code === input.code)) return "CODE_TAKEN";
      const rec: InfluencerRecord = { id: id("inf"), storeId, ...input, createdAt: now, updatedAt: now };
      influencers.set(rec.id, rec);
      return rec;
    },
    async updateInfluencer(storeId, idv, input) {
      const rec = influencers.get(idv);
      if (!rec || rec.storeId !== storeId) return null;
      if (input.code && [...influencers.values()].some((i) => i.storeId === storeId && i.code === input.code && i.id !== idv))
        return "CODE_TAKEN";
      Object.assign(rec, input);
      return rec;
    },
    async listCampaigns(storeId, filters, page) {
      let items = [...campaigns.values()].filter((c) => c.storeId === storeId);
      if (filters.status) items = items.filter((c) => c.status === filters.status);
      if (filters.influencerId) items = items.filter((c) => c.influencerId === filters.influencerId);
      const total = items.length;
      return {
        items: items.slice(page.offset, page.offset + page.limit).map((c) => ({
          ...c,
          influencerName: influencers.get(c.influencerId)?.name ?? "",
          linkCount: [...links.values()].filter((l) => l.campaignId === c.id).length,
        })),
        total,
      };
    },
    async getCampaign(storeId, idv) {
      const c = campaigns.get(idv);
      if (!c || c.storeId !== storeId) return null;
      return { ...c, influencerName: influencers.get(c.influencerId)?.name ?? "", linkCount: 0 };
    },
    async createCampaign(storeId, input) {
      const inf = influencers.get(input.influencerId);
      if (!inf || inf.storeId !== storeId) return "INFLUENCER_NOT_FOUND";
      const rec: InfluencerCampaignRecord = { id: id("cam"), storeId, ...input, createdAt: now, updatedAt: now };
      campaigns.set(rec.id, rec);
      return { ...rec, influencerName: inf.name, linkCount: 0 };
    },
    async updateCampaign(storeId, idv, input) {
      const c = campaigns.get(idv);
      if (!c || c.storeId !== storeId) return null;
      Object.assign(c, input);
      return { ...c, influencerName: influencers.get(c.influencerId)?.name ?? "", linkCount: 0 };
    },
    async listTrackingLinks(storeId, filters, page) {
      let items = [...links.values()].filter((l) => l.storeId === storeId);
      if (filters.status) items = items.filter((l) => l.status === filters.status);
      if (filters.campaignId) items = items.filter((l) => l.campaignId === filters.campaignId);
      const total = items.length;
      return { items: items.slice(page.offset, page.offset + page.limit).map(linkRow), total };
    },
    async getTrackingLink(storeId, idv) {
      const l = links.get(idv);
      return l && l.storeId === storeId ? linkRow(l) : null;
    },
    async createTrackingLink(storeId, input) {
      const c = campaigns.get(input.campaignId);
      if (!c || c.storeId !== storeId) return "CAMPAIGN_NOT_FOUND";
      if ([...links.values()].some((l) => l.storeId === storeId && l.tokenHash === input.tokenHash)) return "TOKEN_COLLISION";
      // Prisma `status @default(ACTIVE)` uygular; in-memory double aynısını yapmalı.
      const rec: TrackingLinkRecord = { id: id("lnk"), storeId, status: "ACTIVE", ...input, createdAt: now, updatedAt: now };
      links.set(rec.id, rec);
      return linkRow(rec);
    },
    async updateTrackingLink(storeId, idv, input) {
      const l = links.get(idv);
      if (!l || l.storeId !== storeId) return null;
      Object.assign(l, input);
      return linkRow(l);
    },
    async regenerateTrackingLinkToken(storeId, idv, tokenHash) {
      const l = links.get(idv);
      if (!l || l.storeId !== storeId) return null;
      if ([...links.values()].some((x) => x.storeId === storeId && x.tokenHash === tokenHash && x.id !== idv)) return "TOKEN_COLLISION";
      l.tokenHash = tokenHash;
      return linkRow(l);
    },
    async resolveProductTarget(storeId, productId) {
      const p = products.get(productId);
      return p && p.storeId === storeId ? { slug: p.slug, title: p.title } : null;
    },
    async resolveCategoryTarget(storeId, categoryId) {
      const c = categories.get(categoryId);
      return c && c.storeId === storeId ? { slug: c.slug, title: c.title } : null;
    },
    async resolveTrackingLinkByTokenHash(storeId, tokenHash) {
      const l = [...links.values()].find((x) => x.storeId === storeId && x.tokenHash === tokenHash);
      if (!l) return null;
      const campaign = campaigns.get(l.campaignId)!;
      const influencer = influencers.get(campaign.influencerId)!;
      return { link: l, campaign, influencer: { id: influencer.id, name: influencer.name, code: influencer.code, status: influencer.status } };
    },
    async findLastClickAt(storeId, trackingLinkId, visitorIdHash) {
      const matching = clicks
        .filter((c) => c.storeId === storeId && c.trackingLinkId === trackingLinkId && c.visitorIdHash === visitorIdHash && !c.isBot)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return matching[0]?.createdAt ?? null;
    },
    async insertClick(input) {
      const rec = { id: id("clk"), ...input, createdAt: new Date(clock()) };
      clicks.push(rec);
      return { id: rec.id };
    },
    async recordOrderAttribution(storeId, orderId, resolved) {
      if (attributions.has(orderId)) return;
      attributions.set(orderId, {
        storeId,
        orderId,
        influencerId: resolved.influencerId,
        campaignId: resolved.campaignId,
        trackingLinkId: resolved.trackingLinkId,
        grossRevenueMinor: resolved.grossRevenueMinor,
        refunds: new Map(),
        currency: resolved.currency,
      });
    },
    async applyRefund(storeId, orderId, refundKey, amountMinor) {
      const a = attributions.get(orderId);
      if (!a || a.storeId !== storeId) return;
      if (a.refunds.has(refundKey)) return;
      a.refunds.set(refundKey, Math.max(0, amountMinor));
    },
    async getAnalytics(): Promise<AnalyticsResult> {
      return {
        summary: {
          totalClicks: 0,
          uniqueVisitors: 0,
          attributedOrders: 0,
          grossRevenueMinor: 0,
          refundedRevenueMinor: 0,
          netRevenueMinor: 0,
          currency: "TRY",
        },
        daily: [],
        influencers: [],
        campaigns: [],
        topLinks: [],
        topProducts: [],
      };
    },
    async exportRows(): Promise<AttributionExportRow[]> {
      return [];
    },
  };

  return { data, influencers, campaigns, links, products, categories, clicks, attributions, setClock: (fn: () => number) => { clock = fn; }, netOf: (orderId: string) => {
    const a = attributions.get(orderId)!;
    return reduceAttributionRevenue(a.grossRevenueMinor, [...a.refunds.entries()].map(([refundKey, amountMinor]) => ({ refundKey, amountMinor })));
  } };
}

function buildAdminApp(mem: ReturnType<typeof createMemoryData>): FastifyInstance {
  const app = Fastify();
  registerInfluencerAdminRoutes(app, {
    config,
    data: mem.data,
    // Bearer "admin:store_x" → o store'a admin; storeId eşleşmezse yetkisiz.
    requireStoreAdmin: async (request, reply, storeId) => {
      const auth = (request.headers["authorization"] as string | undefined) ?? "";
      const match = /^Bearer admin:(.+)$/.exec(auth);
      if (!match || match[1] !== storeId) {
        reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "no" } });
        return null;
      }
      return { actorUserId: "admin_1" };
    },
    recordAudit: async () => undefined,
    buildTrackingUrl: (token) => `https://shop.example/t/${token}`,
  });
  return app;
}

const config = { SESSION_SECRET: SECRET } as AppConfig;

function buildPublicApp(mem: ReturnType<typeof createMemoryData>, limiter = createSlidingWindowLimiter(60, 60_000), now = () => Date.parse("2026-07-24T00:00:00Z")): FastifyInstance {
  const app = Fastify();
  registerPublicTrackingRoutes(app, {
    data: mem.data,
    config,
    resolvePublicStore: async (slug) => (slug === STORE_A.slug ? STORE_A : slug === STORE_B.slug ? STORE_B : null),
    logger: { warn: () => {} },
    rateLimiter: limiter,
    now,
  });
  return app;
}

function adminAuth(storeId: string) {
  return { authorization: `Bearer admin:${storeId}` };
}

// ── Seed helpers ────────────────────────────────────────────────────────────
async function seedInfluencerAndCampaign(app: FastifyInstance, storeId: string, windowDays = 30) {
  const infRes = await app.inject({
    method: "POST",
    url: `/stores/${storeId}/influencers`,
    headers: adminAuth(storeId),
    payload: { name: "Ayşe", code: "ayse" },
  });
  const influencerId = infRes.json().data.id as string;
  const camRes = await app.inject({
    method: "POST",
    url: `/stores/${storeId}/influencer-campaigns`,
    headers: adminAuth(storeId),
    payload: { influencerId, name: "Yaz", attributionWindowDays: windowDays },
  });
  const campaignId = camRes.json().data.id as string;
  return { influencerId, campaignId };
}

describe("influencer admin CRUD", () => {
  let mem: ReturnType<typeof createMemoryData>;
  let app: FastifyInstance;
  beforeEach(() => {
    mem = createMemoryData();
    app = buildAdminApp(mem);
  });

  it("influencer oluştur + code UPPERCASE normalize + campaignCount", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A.id}/influencers`,
      headers: adminAuth(STORE_A.id),
      payload: { name: "Ayşe", code: "ayse-2026" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.code).toBe("AYSE-2026");
    expect(res.json().data.status).toBe("ACTIVE");
  });

  it("aynı code → 409 CODE_TAKEN", async () => {
    await app.inject({ method: "POST", url: `/stores/${STORE_A.id}/influencers`, headers: adminAuth(STORE_A.id), payload: { name: "A", code: "dup" } });
    const res = await app.inject({ method: "POST", url: `/stores/${STORE_A.id}/influencers`, headers: adminAuth(STORE_A.id), payload: { name: "B", code: "DUP" } });
    expect(res.statusCode).toBe(409);
  });

  it("auth yok / yanlış store → 401 (tenant izolasyonu)", async () => {
    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A.id}/influencers`, headers: adminAuth(STORE_B.id) });
    expect(res.statusCode).toBe(401);
  });

  it("campaign influencer'sız → 404; geçerli → 201", async () => {
    const bad = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A.id}/influencer-campaigns`,
      headers: adminAuth(STORE_A.id),
      payload: { influencerId: "nope", name: "X" },
    });
    expect(bad.statusCode).toBe(404);
    const { campaignId } = await seedInfluencerAndCampaign(app, STORE_A.id);
    expect(campaignId).toBeTruthy();
  });

  it("tracking link PRODUCT hedefi güvenli yola çözülür + opak token", async () => {
    mem.products.set("p1", { storeId: STORE_A.id, slug: "kirmizi-elbise", title: "Kırmızı Elbise" });
    const { campaignId } = await seedInfluencerAndCampaign(app, STORE_A.id);
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A.id}/influencer-tracking-links`,
      headers: adminAuth(STORE_A.id),
      payload: { campaignId, targetType: "PRODUCT", productId: "p1" },
    });
    expect(res.statusCode).toBe(201);
    const link = res.json().data;
    expect(link.targetPath).toBe("/products/kirmizi-elbise");
    // Plain token liste/detayda YOK; yalnız oluşturma yanıtında tek-seferlik url'de.
    expect(link.token).toBeUndefined();
    expect(link.url).toContain("/t/");
    expect(link.url.split("/t/")[1]).toMatch(/^[A-Za-z0-9_-]{16,}$/);
  });

  it("PATH hedefi open-redirect denemesini güvenli yola indirger", async () => {
    const { campaignId } = await seedInfluencerAndCampaign(app, STORE_A.id);
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A.id}/influencer-tracking-links`,
      headers: adminAuth(STORE_A.id),
      payload: { campaignId, targetType: "PATH", targetPath: "//evil.com/phish" },
    });
    expect(res.json().data.targetPath).toBe("/");
  });

  it("liste/detay token/url SIZDIRMAZ (plain token DB'de yok)", async () => {
    const { campaignId } = await seedInfluencerAndCampaign(app, STORE_A.id);
    const created = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A.id}/influencer-tracking-links`,
      headers: adminAuth(STORE_A.id),
      payload: { campaignId, targetType: "PATH", targetPath: "/x" },
    });
    const linkId = created.json().data.id as string;
    const list = await app.inject({ method: "GET", url: `/stores/${STORE_A.id}/influencer-tracking-links`, headers: adminAuth(STORE_A.id) });
    const row = list.json().data.find((r: { id: string }) => r.id === linkId);
    expect(row.token).toBeUndefined();
    expect(row.url).toBeUndefined();
    const detail = await app.inject({ method: "GET", url: `/stores/${STORE_A.id}/influencer-tracking-links/${linkId}`, headers: adminAuth(STORE_A.id) });
    expect(detail.json().data.token).toBeUndefined();
    expect(detail.json().data.url).toBeUndefined();
  });

  it("yenileme (regenerate) eski token'ı GEÇERSİZ kılar, yeni tek-seferlik url verir", async () => {
    const { campaignId } = await seedInfluencerAndCampaign(app, STORE_A.id, 7);
    const created = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A.id}/influencer-tracking-links`,
      headers: adminAuth(STORE_A.id),
      payload: { campaignId, targetType: "PATH", targetPath: "/x" },
    });
    const linkId = created.json().data.id as string;
    const oldToken = (created.json().data.url as string).split("/t/")[1];

    const regen = await app.inject({ method: "POST", url: `/stores/${STORE_A.id}/influencer-tracking-links/${linkId}/regenerate`, headers: adminAuth(STORE_A.id) });
    expect(regen.statusCode).toBe(200);
    const newToken = (regen.json().data.url as string).split("/t/")[1];
    expect(newToken).not.toBe(oldToken);

    // Public: eski token artık çözülmez (404); yeni token geçerli.
    const pub = buildPublicApp(mem);
    const oldHit = await pub.inject({ method: "POST", url: `/public/stores/${STORE_A.slug}/track/${oldToken}`, headers: { "user-agent": "Mozilla/5.0 Safari" } });
    expect(oldHit.statusCode).toBe(404);
    const newHit = await pub.inject({ method: "POST", url: `/public/stores/${STORE_A.slug}/track/${newToken}`, headers: { "user-agent": "Mozilla/5.0 Safari" } });
    expect(newHit.statusCode).toBe(200);
    expect(newHit.json().data.grant).not.toBeNull();
  });
});

describe("public tracking route", () => {
  let mem: ReturnType<typeof createMemoryData>;
  let admin: FastifyInstance;
  let campaignId: string;
  let influencerId: string;
  let token: string;

  // Oluşturma tek-seferlik url döner; plain token'ı url'den çıkar (public track için).
  async function seedLink(targetPath = "/products/x") {
    const res = await admin.inject({
      method: "POST",
      url: `/stores/${STORE_A.id}/influencer-tracking-links`,
      headers: adminAuth(STORE_A.id),
      payload: { campaignId, targetType: "PATH", targetPath },
    });
    return (res.json().data.url as string).split("/t/")[1];
  }

  beforeEach(async () => {
    mem = createMemoryData();
    admin = buildAdminApp(mem);
    ({ campaignId, influencerId } = await seedInfluencerAndCampaign(admin, STORE_A.id, 7));
    token = await seedLink();
  });

  it("geçerli aktif link → grant + güvenli hedef + click kaydı", async () => {
    const app = buildPublicApp(mem);
    const res = await app.inject({
      method: "POST",
      url: `/public/stores/${STORE_A.slug}/track/${token}`,
      headers: { "user-agent": "Mozilla/5.0 iPhone Safari", "x-visitor-id": "v-123" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.targetPath).toBe("/products/x");
    const grant = verifyAttributionGrant(body.grant, SECRET);
    expect(grant?.storeId).toBe(STORE_A.id);
    expect(grant?.influencerId).toBe(influencerId);
    expect(mem.clicks.length).toBe(1);
    expect(mem.clicks[0].isBot).toBe(false);
  });

  it("geçersiz token → 404 (storefront fallback yapar)", async () => {
    const app = buildPublicApp(mem);
    const res = await app.inject({ method: "POST", url: `/public/stores/${STORE_A.slug}/track/nonexistenttoken12345` });
    expect(res.statusCode).toBe(404);
  });

  it("pasif kampanya → grant null (redirect-only, click YOK)", async () => {
    await admin.inject({
      method: "PATCH",
      url: `/stores/${STORE_A.id}/influencer-campaigns/${campaignId}`,
      headers: adminAuth(STORE_A.id),
      payload: { status: "PAUSED" },
    });
    const app = buildPublicApp(mem);
    const res = await app.inject({ method: "POST", url: `/public/stores/${STORE_A.slug}/track/${token}`, headers: { "user-agent": "Mozilla/5.0 Safari" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.grant).toBeNull();
    expect(mem.clicks.length).toBe(0);
  });

  it("rapid-repeat aynı ziyaretçi → ikinci click YENİ SATIR açmaz (dedupe)", async () => {
    let t = Date.parse("2026-07-24T00:00:00Z");
    mem.setClock(() => t); // double'ın insertClick.createdAt'ı route now() ile eşleşsin
    const app = buildPublicApp(mem, createSlidingWindowLimiter(60, 60_000), () => t);
    const hit = () => app.inject({ method: "POST", url: `/public/stores/${STORE_A.slug}/track/${token}`, headers: { "user-agent": "Mozilla/5.0 Safari", "x-visitor-id": "v-1" } });
    await hit();
    t += 60_000; // 1 dk sonra (pencere içinde)
    await hit();
    expect(mem.clicks.length).toBe(1);
    t += 1800_001; // 30 dk+ sonra (pencere dışı)
    await hit();
    expect(mem.clicks.length).toBe(2);
  });

  it("bot UA → click isBot=true olarak kaydedilir", async () => {
    const app = buildPublicApp(mem);
    await app.inject({ method: "POST", url: `/public/stores/${STORE_A.slug}/track/${token}`, headers: { "user-agent": "Googlebot/2.1" } });
    expect(mem.clicks.length).toBe(1);
    expect(mem.clicks[0].isBot).toBe(true);
  });

  it("rate limit aşımı → 429", async () => {
    const app = buildPublicApp(mem, createSlidingWindowLimiter(1, 60_000));
    await app.inject({ method: "POST", url: `/public/stores/${STORE_A.slug}/track/${token}`, headers: { "user-agent": "Mozilla/5.0" } });
    const res = await app.inject({ method: "POST", url: `/public/stores/${STORE_A.slug}/track/${token}`, headers: { "user-agent": "Mozilla/5.0" } });
    expect(res.statusCode).toBe(429);
  });

  it("cross-store: STORE_A token'ı STORE_B slug'ında çözülemez → 404", async () => {
    const app = buildPublicApp(mem);
    const res = await app.inject({ method: "POST", url: `/public/stores/${STORE_B.slug}/track/${token}`, headers: { "user-agent": "Mozilla/5.0" } });
    expect(res.statusCode).toBe(404);
  });
});

describe("checkout attribution resolve (sunucu-otoriter)", () => {
  let mem: ReturnType<typeof createMemoryData>;
  let admin: FastifyInstance;
  let campaignId: string;
  let influencerId: string;

  beforeEach(async () => {
    mem = createMemoryData();
    admin = buildAdminApp(mem);
    ({ campaignId, influencerId } = await seedInfluencerAndCampaign(admin, STORE_A.id, 30));
  });

  function makeGrant(overrides: Record<string, unknown> = {}) {
    const clickedAt = Date.parse("2026-07-24T00:00:00Z");
    return signAttributionGrant(
      {
        v: 1,
        storeId: STORE_A.id,
        influencerId,
        campaignId,
        trackingLinkId: "lnk_missing", // grant'te her zaman string (gerçek akışta link.id)
        clickId: "c1",
        clickedAt,
        expiresAt: computeAttributionExpiry(clickedAt, 30),
        ...overrides,
      } as never,
      SECRET,
    );
  }

  it("geçerli grant → çözülmüş attribution snapshot", async () => {
    const now = Date.parse("2026-07-25T00:00:00Z");
    const resolved = await resolveAttributionForCheckout(mem.data, STORE_A.id, makeGrant(), SECRET, now);
    expect(resolved?.influencerId).toBe(influencerId);
    expect(resolved?.campaignId).toBe(campaignId);
    expect((resolved?.snapshot as { influencerCode: string }).influencerCode).toBe("AYSE");
  });

  it("cross-store grant reddedilir (null)", async () => {
    const now = Date.parse("2026-07-25T00:00:00Z");
    const resolved = await resolveAttributionForCheckout(mem.data, STORE_B.id, makeGrant(), SECRET, now);
    expect(resolved).toBeNull();
  });

  it("pencere dışı → null", async () => {
    const now = Date.parse("2026-09-30T00:00:00Z"); // 30 günden fazla
    const resolved = await resolveAttributionForCheckout(mem.data, STORE_A.id, makeGrant(), SECRET, now);
    expect(resolved).toBeNull();
  });

  it("kurcalanan/yanlış imza → null (istemci alanına güvenilmez)", async () => {
    const now = Date.parse("2026-07-25T00:00:00Z");
    const forged = signAttributionGrant(
      { v: 1, storeId: STORE_A.id, influencerId: "attacker", campaignId, trackingLinkId: null, clickId: "x", clickedAt: now, expiresAt: now + 1000 } as never,
      "yanlış-secret-yeterince-uzun",
    );
    expect(await resolveAttributionForCheckout(mem.data, STORE_A.id, forged, SECRET, now)).toBeNull();
  });

  it("pasif influencer → attribution reddedilir", async () => {
    await admin.inject({ method: "PATCH", url: `/stores/${STORE_A.id}/influencers/${influencerId}`, headers: adminAuth(STORE_A.id), payload: { status: "INACTIVE" } });
    const now = Date.parse("2026-07-25T00:00:00Z");
    expect(await resolveAttributionForCheckout(mem.data, STORE_A.id, makeGrant(), SECRET, now)).toBeNull();
  });
});

describe("refund/net revenue idempotency (data double + core)", () => {
  it("tam iade → net 0; aynı refund tekrar → değişmez", async () => {
    const mem = createMemoryData();
    await mem.data.recordOrderAttribution(STORE_A.id, "o1", {
      influencerId: "i", campaignId: "c", trackingLinkId: null, clickedAt: new Date(), snapshot: {}, grossRevenueMinor: 10000, currency: "TRY", attributedAt: new Date(),
    } as ResolvedAttribution & { grossRevenueMinor: number; currency: string; attributedAt: Date });
    await mem.data.applyRefund(STORE_A.id, "o1", "cancel:o1", 10000);
    expect(mem.netOf("o1").netRevenueMinor).toBe(0);
    await mem.data.applyRefund(STORE_A.id, "o1", "cancel:o1", 10000); // tekrar → idempotent
    expect(mem.netOf("o1").netRevenueMinor).toBe(0);
    expect(mem.netOf("o1").refundedRevenueMinor).toBe(10000);
  });

  it("kısmi iade → net azalır; farklı refundKey birikir", async () => {
    const mem = createMemoryData();
    await mem.data.recordOrderAttribution(STORE_A.id, "o2", {
      influencerId: "i", campaignId: "c", trackingLinkId: null, clickedAt: new Date(), snapshot: {}, grossRevenueMinor: 10000, currency: "TRY", attributedAt: new Date(),
    } as ResolvedAttribution & { grossRevenueMinor: number; currency: string; attributedAt: Date });
    await mem.data.applyRefund(STORE_A.id, "o2", "r1", 3000);
    expect(mem.netOf("o2").netRevenueMinor).toBe(7000);
    await mem.data.applyRefund(STORE_A.id, "o2", "r2", 2000);
    expect(mem.netOf("o2").netRevenueMinor).toBe(5000);
  });

  it("cross-store refund reddedilir", async () => {
    const mem = createMemoryData();
    await mem.data.recordOrderAttribution(STORE_A.id, "o3", {
      influencerId: "i", campaignId: "c", trackingLinkId: null, clickedAt: new Date(), snapshot: {}, grossRevenueMinor: 10000, currency: "TRY", attributedAt: new Date(),
    } as ResolvedAttribution & { grossRevenueMinor: number; currency: string; attributedAt: Date });
    await mem.data.applyRefund(STORE_B.id, "o3", "x", 10000); // yanlış store → no-op
    expect(mem.netOf("o3").netRevenueMinor).toBe(10000);
  });
});
