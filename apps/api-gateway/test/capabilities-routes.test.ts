/**
 * TODO-163 (ADR-208…ADR-213 · Faz 2) — Capability veri orkestrasyonu + cache + HTTP route testleri.
 * Fake persistence + gerçek Fastify (monolit gerekmez): matris/preview/override + dependents guard
 * (409 DEPENDENTS_ACTIVE) + cascade + core 409 + unknown 404 + public projeksiyon + enforcement 403
 * (MODULE_DISABLED) + cache TTL/invalidate/fail-closed.
 */
import Fastify from "fastify";
import { describe, expect, it, beforeEach } from "vitest";
import { createStoreModuleData, type StoreModulePersistence } from "../src/capabilities/data.js";
import { createCapabilityCache } from "../src/capabilities/cache.js";
import { createRequireCapability, registerCapabilityRoutes } from "../src/capabilities/routes.js";
import type { ModuleOverrideState } from "../src/capabilities/resolver.js";

class FakePersistence implements StoreModulePersistence {
  overrides = new Map<string, ModuleOverrideState>();
  planMetadata: unknown = null;
  failReads = false;

  async listStoreModuleOverrides(storeId: string) {
    if (this.failReads) throw new Error("db down");
    const out: Array<{ moduleKey: string; state: string }> = [];
    for (const [k, state] of this.overrides) {
      const [sid, moduleKey] = k.split("::");
      if (sid === storeId && moduleKey) out.push({ moduleKey, state });
    }
    return out;
  }
  async getActivePlanMetadata() {
    if (this.failReads) throw new Error("db down");
    return this.planMetadata;
  }
  async upsertStoreModuleOverride(storeId: string, moduleKey: string, state: "ENABLED" | "DISABLED") {
    this.overrides.set(`${storeId}::${moduleKey}`, state);
  }
  async deleteStoreModuleOverride(storeId: string, moduleKey: string) {
    this.overrides.delete(`${storeId}::${moduleKey}`);
  }
}

function buildApp(persistence: StoreModulePersistence, opts: { admin?: boolean; store?: boolean } = {}) {
  const app = Fastify();
  const data = createStoreModuleData(persistence);
  const cache = createCapabilityCache(data, { ttlMs: 30_000 });
  registerCapabilityRoutes(app, {
    data,
    cache,
    requireStoreAdmin: async (_req, reply) => {
      if (opts.admin === false) {
        reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "no" } });
        return null;
      }
      return { actorUserId: "admin_1" };
    },
    resolvePublicStore: async (slug) => (opts.store === false ? null : { id: "s1", slug }),
  });
  return { app, data, cache };
}

describe("capability data orchestration", () => {
  let p: FakePersistence;
  beforeEach(() => {
    p = new FakePersistence();
  });

  it("baseline: opt-in dışı tüm modüller açık (FASHION_VERTICAL varsayılan kapalı)", async () => {
    const list = await createStoreModuleData(p).resolveEffective("s1");
    // TODO-165: FASHION_VERTICAL opt-in (baselineEnabled=false) → varsayılan kapalı.
    for (const m of list) {
      if (m.key === "FASHION_VERTICAL") expect(m.enabled).toBe(false);
      else expect(m.enabled).toBe(true);
    }
  });

  it("plan default kapatır, store override ezer", async () => {
    p.planMetadata = { modules: { CAMPAIGNS: false } };
    const data = createStoreModuleData(p);
    expect((await data.resolveEffective("s1")).find((m) => m.key === "CAMPAIGNS")).toMatchObject({
      enabled: false,
      source: "plan",
    });
    await data.setOverride("s1", "CAMPAIGNS", "ENABLED", "admin_1");
    expect((await data.resolveEffective("s1")).find((m) => m.key === "CAMPAIGNS")).toMatchObject({
      enabled: true,
      source: "override",
    });
  });

  it("INHERIT sparse siler", async () => {
    const data = createStoreModuleData(p);
    await data.setOverride("s1", "REVIEWS", "DISABLED", null);
    expect(p.overrides.size).toBe(1);
    await data.setOverride("s1", "REVIEWS", "INHERIT", null);
    expect(p.overrides.size).toBe(0);
  });

  it("core immutable / unknown reddi", async () => {
    const data = createStoreModuleData(p);
    expect(await data.setOverride("s1", "CATALOG", "DISABLED", null)).toEqual({ ok: false, reason: "CORE_IMMUTABLE" });
    expect(await data.setOverride("s1", "nope", "DISABLED", null)).toEqual({ ok: false, reason: "UNKNOWN_MODULE" });
  });

  it("parent-disable guard: aktif dependent → reddedilir; cascade → geçer", async () => {
    const data = createStoreModuleData(p);
    const preview = await data.previewDisable("s1", "CAMPAIGNS");
    expect(preview).toEqual(expect.arrayContaining(["SPONSORED_PRODUCTS", "INFLUENCER_TRACKING", "SPONSORSHIP_FINANCE"]));

    const rejected = await data.setOverride("s1", "CAMPAIGNS", "DISABLED", null);
    expect(rejected).toMatchObject({ ok: false, reason: "DEPENDENTS_ACTIVE" });
    expect(p.overrides.size).toBe(0); // yazılmadı

    const forced = await data.setOverride("s1", "CAMPAIGNS", "DISABLED", null, { cascade: true });
    expect(forced).toEqual({ ok: true });
    expect(p.overrides.get("s1::CAMPAIGNS")).toBe("DISABLED");
  });

  it("yapraktan köke kapatma: zincir dependency sırasıyla kapatılabilir (guard doğru)", async () => {
    const data = createStoreModuleData(p);
    // Yapraktan köke: SPONSORSHIP_FINANCE → SPONSORED_PRODUCTS → INFLUENCER_TRACKING → CAMPAIGNS.
    expect(await data.setOverride("s1", "SPONSORSHIP_FINANCE", "DISABLED", null)).toEqual({ ok: true });
    expect(await data.setOverride("s1", "SPONSORED_PRODUCTS", "DISABLED", null)).toEqual({ ok: true });
    expect(await data.setOverride("s1", "INFLUENCER_TRACKING", "DISABLED", null)).toEqual({ ok: true });
    // Artık CAMPAIGNS'in aktif dependent'ı yok → kapatılabilir.
    expect(await data.setOverride("s1", "CAMPAIGNS", "DISABLED", null)).toEqual({ ok: true });
  });
});

describe("capability routes", () => {
  it("GET matris döner (admin)", async () => {
    const { app } = buildApp(new FakePersistence());
    const res = await app.inject({ method: "GET", url: "/stores/s1/modules" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.storeId).toBe("s1");
    expect(body.data.modules.find((m: { key: string }) => m.key === "CATALOG").core).toBe(true);
  });

  it("GET disable-preview dependent listeler", async () => {
    const { app } = buildApp(new FakePersistence());
    const res = await app.inject({ method: "GET", url: "/stores/s1/modules/CAMPAIGNS/disable-preview" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.dependents).toEqual(expect.arrayContaining(["SPONSORED_PRODUCTS"]));
  });

  it("PUT leaf DISABLED → effective kapanır", async () => {
    const { app } = buildApp(new FakePersistence());
    const res = await app.inject({ method: "PUT", url: "/stores/s1/modules/REVIEWS", payload: { state: "DISABLED" } });
    expect(res.statusCode).toBe(200);
    const entry = res.json().data.modules.find((m: { key: string }) => m.key === "REVIEWS");
    expect(entry.effectiveEnabled).toBe(false);
  });

  it("PUT parent (aktif dependent) → 409 DEPENDENTS_ACTIVE; cascade → 200", async () => {
    const { app } = buildApp(new FakePersistence());
    const rejected = await app.inject({ method: "PUT", url: "/stores/s1/modules/CAMPAIGNS", payload: { state: "DISABLED" } });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe("DEPENDENTS_ACTIVE");
    expect(rejected.json().error.dependents).toEqual(expect.arrayContaining(["SPONSORED_PRODUCTS"]));

    const ok = await app.inject({ method: "PUT", url: "/stores/s1/modules/CAMPAIGNS", payload: { state: "DISABLED", cascade: true } });
    expect(ok.statusCode).toBe(200);
  });

  it("PUT core 409 / unknown 404 / invalid 400", async () => {
    const { app } = buildApp(new FakePersistence());
    expect((await app.inject({ method: "PUT", url: "/stores/s1/modules/CATALOG", payload: { state: "DISABLED" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "PUT", url: "/stores/s1/modules/nope", payload: { state: "ENABLED" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: "/stores/s1/modules/CAMPAIGNS", payload: { state: "MAYBE" } })).statusCode).toBe(400);
  });

  it("admin değilse 401", async () => {
    const { app } = buildApp(new FakePersistence(), { admin: false });
    expect((await app.inject({ method: "GET", url: "/stores/s1/modules" })).statusCode).toBe(401);
  });

  it("PUBLIC projeksiyon moduleKey→boolean döner; store yoksa 404", async () => {
    const p = new FakePersistence();
    const { app } = buildApp(p);
    await createStoreModuleData(p).setOverride("s1", "REVIEWS", "DISABLED", null);
    const res = await app.inject({ method: "GET", url: "/public/stores/demo/modules" });
    expect(res.statusCode).toBe(200);
    const modules = res.json().data.modules;
    expect(modules.CATALOG).toBe(true);
    expect(modules.REVIEWS).toBe(false);
    // source/label sızmaz — yalnız boolean.
    expect(typeof modules.CAMPAIGNS).toBe("boolean");

    const notFound = buildApp(new FakePersistence(), { store: false });
    expect((await notFound.app.inject({ method: "GET", url: "/public/stores/x/modules" })).statusCode).toBe(404);
  });
});

describe("createRequireCapability enforcement (cache)", () => {
  it("kapalı modül 403 MODULE_DISABLED; açık geçer", async () => {
    const p = new FakePersistence();
    const data = createStoreModuleData(p);
    const cache = createCapabilityCache(data, { ttlMs: 30_000 });
    await data.setOverride("s1", "REVIEWS", "DISABLED", null);
    cache.invalidate("s1");
    const requireCapability = createRequireCapability(cache);

    const app = Fastify();
    app.get("/probe/:key", async (req, reply) => {
      const { key } = req.params as { key: string };
      if (!(await requireCapability(reply, "s1", key))) return reply;
      return reply.send({ ok: true });
    });
    const off = await app.inject({ method: "GET", url: "/probe/REVIEWS" });
    expect(off.statusCode).toBe(403);
    expect(off.json().error.code).toBe("MODULE_DISABLED");
    expect((await app.inject({ method: "GET", url: "/probe/CAMPAIGNS" })).statusCode).toBe(200);
  });
});

describe("capability cache", () => {
  it("TTL içinde tek DB okuması; invalidate sonrası yeniden okur", async () => {
    let reads = 0;
    const p = new FakePersistence();
    const origList = p.listStoreModuleOverrides.bind(p);
    p.listStoreModuleOverrides = async (sid: string) => {
      reads += 1;
      return origList(sid);
    };
    let clock = 1000;
    const data = createStoreModuleData(p);
    const cache = createCapabilityCache(data, { ttlMs: 5000, now: () => clock });
    await cache.getEffective("s1");
    await cache.getEffective("s1"); // cache hit
    expect(reads).toBe(1);
    clock += 6000; // TTL geçti
    await cache.getEffective("s1");
    expect(reads).toBe(2);
    cache.invalidate("s1");
    await cache.getEffective("s1");
    expect(reads).toBe(3);
  });

  it("DB hatası → fail-closed (core açık, non-core kapalı); cache'lenmez", async () => {
    const p = new FakePersistence();
    p.failReads = true;
    const cache = createCapabilityCache(createStoreModuleData(p), { ttlMs: 30_000 });
    expect(await cache.isEnabled("s1", "CATALOG")).toBe(true); // core
    expect(await cache.isEnabled("s1", "CAMPAIGNS")).toBe(false); // non-core fail-closed
    // Hata cache'lenmez → düzeldiğinde doğru okur.
    p.failReads = false;
    expect(await cache.isEnabled("s1", "CAMPAIGNS")).toBe(true);
  });

  it("cross-store leak yok (ayrı store ayrı sonuç)", async () => {
    const p = new FakePersistence();
    const data = createStoreModuleData(p);
    await data.setOverride("s1", "REVIEWS", "DISABLED", null);
    const cache = createCapabilityCache(data, { ttlMs: 30_000 });
    expect(await cache.isEnabled("s1", "REVIEWS")).toBe(false);
    expect(await cache.isEnabled("s2", "REVIEWS")).toBe(true); // s2 etkilenmez
  });
});
