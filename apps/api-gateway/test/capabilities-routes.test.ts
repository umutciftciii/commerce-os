/**
 * TODO-163 (ADR-208…ADR-210) — Capability veri orkestrasyonu + HTTP route testleri.
 * Fake persistence + gerçek Fastify ile (monolit gerekmez): matris GET · override PUT ·
 * core-immutable 409 · unknown 404 · enforcement 403 · sparse INHERIT silme.
 */
import Fastify from "fastify";
import { describe, expect, it, beforeEach } from "vitest";
import {
  createStoreModuleData,
  type StoreModulePersistence,
} from "../src/capabilities/data.js";
import { createRequireCapability, registerCapabilityRoutes } from "../src/capabilities/routes.js";
import type { ModuleOverrideState } from "../src/capabilities/resolver.js";

class FakePersistence implements StoreModulePersistence {
  overrides = new Map<string, ModuleOverrideState>();
  planMetadata: unknown = null;

  async listStoreModuleOverrides(storeId: string) {
    const out: Array<{ moduleKey: string; state: string }> = [];
    for (const [k, state] of this.overrides) {
      const [sid, moduleKey] = k.split("::");
      if (sid === storeId && moduleKey) out.push({ moduleKey, state });
    }
    return out;
  }
  async getActivePlanMetadata() {
    return this.planMetadata;
  }
  async upsertStoreModuleOverride(
    storeId: string,
    moduleKey: string,
    state: "ENABLED" | "DISABLED",
  ) {
    this.overrides.set(`${storeId}::${moduleKey}`, state);
  }
  async deleteStoreModuleOverride(storeId: string, moduleKey: string) {
    this.overrides.delete(`${storeId}::${moduleKey}`);
  }
}

function buildApp(persistence: StoreModulePersistence, opts: { admin?: boolean } = {}) {
  const app = Fastify();
  const data = createStoreModuleData(persistence);
  registerCapabilityRoutes(app, {
    data,
    requireStoreAdmin: async (_req, reply) => {
      if (opts.admin === false) {
        reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "no" } });
        return null;
      }
      return { actorUserId: "admin_1" };
    },
  });
  return { app, data };
}

describe("capability data orchestration", () => {
  let p: FakePersistence;
  beforeEach(() => {
    p = new FakePersistence();
  });

  it("baseline: tüm modüller açık", async () => {
    const data = createStoreModuleData(p);
    const list = await data.resolveEffective("s1");
    expect(list.every((m) => m.enabled)).toBe(true);
  });

  it("plan default kapatır, store override ezer", async () => {
    p.planMetadata = { modules: { campaigns: false } };
    const data = createStoreModuleData(p);
    let list = await data.resolveEffective("s1");
    expect(list.find((m) => m.key === "campaigns")).toMatchObject({ enabled: false, source: "plan" });

    await data.setOverride("s1", "campaigns", "ENABLED", "admin_1");
    list = await data.resolveEffective("s1");
    expect(list.find((m) => m.key === "campaigns")).toMatchObject({ enabled: true, source: "override" });
  });

  it("INHERIT sparse siler", async () => {
    const data = createStoreModuleData(p);
    await data.setOverride("s1", "campaigns", "DISABLED", null);
    expect(p.overrides.size).toBe(1);
    await data.setOverride("s1", "campaigns", "INHERIT", null);
    expect(p.overrides.size).toBe(0);
  });

  it("core immutable / unknown reddi", async () => {
    const data = createStoreModuleData(p);
    expect(await data.setOverride("s1", "catalog", "DISABLED", null)).toEqual({
      ok: false,
      reason: "CORE_IMMUTABLE",
    });
    expect(await data.setOverride("s1", "nope", "DISABLED", null)).toEqual({
      ok: false,
      reason: "UNKNOWN_MODULE",
    });
  });
});

describe("capability routes", () => {
  it("GET matris döner (admin)", async () => {
    const { app } = buildApp(new FakePersistence());
    const res = await app.inject({ method: "GET", url: "/stores/s1/modules" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.storeId).toBe("s1");
    expect(body.data.modules.length).toBeGreaterThan(0);
    expect(body.data.modules.find((m: { key: string }) => m.key === "catalog").core).toBe(true);
  });

  it("PUT DISABLED sonra effective kapanır", async () => {
    const { app } = buildApp(new FakePersistence());
    const res = await app.inject({
      method: "PUT",
      url: "/stores/s1/modules/campaigns",
      payload: { state: "DISABLED" },
    });
    expect(res.statusCode).toBe(200);
    const entry = res.json().data.modules.find((m: { key: string }) => m.key === "campaigns");
    expect(entry.effectiveEnabled).toBe(false);
    expect(entry.overrideState).toBe("DISABLED");
  });

  it("PUT core modül 409", async () => {
    const { app } = buildApp(new FakePersistence());
    const res = await app.inject({
      method: "PUT",
      url: "/stores/s1/modules/catalog",
      payload: { state: "DISABLED" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CORE_MODULE_IMMUTABLE");
  });

  it("PUT bilinmeyen modül 404", async () => {
    const { app } = buildApp(new FakePersistence());
    const res = await app.inject({
      method: "PUT",
      url: "/stores/s1/modules/nope",
      payload: { state: "ENABLED" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("UNKNOWN_MODULE");
  });

  it("PUT geçersiz state 400", async () => {
    const { app } = buildApp(new FakePersistence());
    const res = await app.inject({
      method: "PUT",
      url: "/stores/s1/modules/campaigns",
      payload: { state: "MAYBE" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("admin değilse 401 (guard)", async () => {
    const { app } = buildApp(new FakePersistence(), { admin: false });
    const res = await app.inject({ method: "GET", url: "/stores/s1/modules" });
    expect(res.statusCode).toBe(401);
  });
});

describe("createRequireCapability enforcement", () => {
  it("kapalı modül 403 CAPABILITY_DISABLED", async () => {
    const p = new FakePersistence();
    const data = createStoreModuleData(p);
    await data.setOverride("s1", "payments", "DISABLED", null);
    const requireCapability = createRequireCapability(data);

    const app = Fastify();
    app.get("/probe", async (_req, reply) => {
      if (!(await requireCapability(reply, "s1", "payments"))) return reply;
      return reply.send({ ok: true });
    });
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("CAPABILITY_DISABLED");
  });

  it("açık modül geçer", async () => {
    const data = createStoreModuleData(new FakePersistence());
    const requireCapability = createRequireCapability(data);
    const app = Fastify();
    app.get("/probe", async (_req, reply) => {
      if (!(await requireCapability(reply, "s1", "payments"))) return reply;
      return reply.send({ ok: true });
    });
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});
