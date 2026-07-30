/**
 * TODO-163 Faz 3 (TD-154 · ADR-215) — Plan → Capability editörü testleri.
 * SAF çekirdek: status↔boolean · build doğrulama (core/unknown/invalid-dependency) · preview (değişen +
 * dependency) · merge (diğer metadata korunur). HTTP: matris · preview (subscriberCount) · apply (merge +
 * audit + cache invalidate) · core-unavailable 400 · unauthorized 401 · not-found 404.
 */
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  buildPlanModulesFromStatuses,
  derivePlanCapabilityMatrix,
  mergePlanModulesIntoMetadata,
  previewPlanCapabilities,
  statusFromPlanDefault,
  planDefaultFromStatus,
  type PlanCapabilityStatus,
} from "../src/capabilities/plan-capabilities.js";
import { registerPlanCapabilityRoutes } from "../src/capabilities/plan-routes.js";

describe("plan-capabilities SAF çekirdek", () => {
  it("status ↔ boolean eşlemesi", () => {
    expect(statusFromPlanDefault(true)).toBe("required");
    expect(statusFromPlanDefault(false)).toBe("unavailable");
    expect(statusFromPlanDefault(undefined)).toBe("optional");
    expect(planDefaultFromStatus("required")).toBe(true);
    expect(planDefaultFromStatus("unavailable")).toBe(false);
    expect(planDefaultFromStatus("optional")).toBeUndefined();
  });

  it("matris: core=required (kilitli); modül durumu metadata'dan", () => {
    const matrix = derivePlanCapabilityMatrix({ modules: { REVIEWS: false, CAMPAIGNS: true } });
    expect(matrix.find((m) => m.key === "CATALOG")).toMatchObject({ core: true, status: "required" });
    expect(matrix.find((m) => m.key === "REVIEWS")).toMatchObject({ status: "unavailable" });
    expect(matrix.find((m) => m.key === "CAMPAIGNS")).toMatchObject({ status: "required" });
    expect(matrix.find((m) => m.key === "WISHLIST")).toMatchObject({ status: "optional" });
  });

  it("build: required→true, unavailable→false, optional→atlanır", () => {
    const r = buildPlanModulesFromStatuses({ CAMPAIGNS: "required", REVIEWS: "unavailable", WISHLIST: "optional" });
    expect(r.ok).toBe(true);
    expect(r.modules).toEqual({ CAMPAIGNS: true, REVIEWS: false });
  });

  it("build: core unavailable → CORE_UNAVAILABLE; bilinmeyen → UNKNOWN_MODULE", () => {
    const r = buildPlanModulesFromStatuses({ CATALOG: "unavailable", nope: "required" } as Record<string, PlanCapabilityStatus>);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        { code: "CORE_UNAVAILABLE", key: "CATALOG" },
        { code: "UNKNOWN_MODULE", key: "nope" },
      ]),
    );
  });

  it("build: invalid dependency (SPONSORED_PRODUCTS required + CAMPAIGNS unavailable) → reddedilir", () => {
    const r = buildPlanModulesFromStatuses({ SPONSORED_PRODUCTS: "required", CAMPAIGNS: "unavailable" });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([{ code: "INVALID_DEPENDENCY", key: "SPONSORED_PRODUCTS", requires: "CAMPAIGNS" }]),
    );
  });

  it("preview: CAMPAIGNS unavailable → SPONSORED_PRODUCTS dependency ile kapanır; changed listelenir", () => {
    const preview = previewPlanCapabilities({ modules: {} }, { CAMPAIGNS: "unavailable" });
    expect(preview.ok).toBe(true);
    expect(preview.changedModules).toContain("CAMPAIGNS");
    expect(preview.dependencyDisabled).toContain("SPONSORED_PRODUCTS");
    expect(preview.entries.find((e) => e.key === "SPONSORED_PRODUCTS")).toMatchObject({
      effectivePlanEnabled: false,
      blockedBy: "CAMPAIGNS",
    });
  });

  it("merge: yalnız modules değişir; diğer metadata KORUNUR", () => {
    const merged = mergePlanModulesIntoMetadata({ pricing: { usd: 10 }, modules: { REVIEWS: true } }, { REVIEWS: "unavailable" });
    expect("metadata" in merged).toBe(true);
    if ("metadata" in merged) {
      expect(merged.metadata.pricing).toEqual({ usd: 10 });
      expect(merged.metadata.modules).toEqual({ REVIEWS: false });
    }
  });

  it("merge: doğrulama hatası → errors (yazma yok)", () => {
    const merged = mergePlanModulesIntoMetadata({}, { CATALOG: "unavailable" });
    expect("errors" in merged).toBe(true);
  });
});

// ── HTTP route testleri (enjekte deps; AppDataAccess gerekmez) ───────────────────────────────
function buildApp(opts: { admin?: boolean; plan?: { id: string; metadata: unknown } | null } = {}) {
  const plan = opts.plan === undefined ? { id: "plan_1", metadata: { modules: {} } } : opts.plan;
  let stored: unknown = plan?.metadata ?? null;
  const audits: Array<{ planId: string; changedModules: string[] }> = [];
  let cacheCleared = 0;

  const app = Fastify();
  registerPlanCapabilityRoutes(app, {
    requirePlatformAdmin: async (_req, reply) => {
      if (opts.admin === false) {
        reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "no" } });
        return null;
      }
      return { actorUserId: "padmin_1" };
    },
    findPlan: async (id) => (plan && plan.id === id ? { id: plan.id, metadata: stored } : null),
    updatePlanMetadata: async (id, metadata) => {
      if (!plan || plan.id !== id) return null;
      stored = metadata;
      return { id, metadata };
    },
    countActiveSubscriptions: async () => 3,
    recordAudit: async (a) => {
      audits.push({ planId: a.planId, changedModules: a.changedModules });
    },
    invalidateCache: () => {
      cacheCleared += 1;
    },
  });
  return { app, audits, getStored: () => stored, cacheClearedCount: () => cacheCleared };
}

describe("plan-capability routes", () => {
  it("GET matris döner (admin)", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "GET", url: "/admin/plans/plan_1/capabilities" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.planId).toBe("plan_1");
    expect(res.json().data.modules.find((m: { key: string }) => m.key === "CATALOG").core).toBe(true);
  });

  it("POST preview: subscriberCount + changed + dependency", async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/admin/plans/plan_1/capabilities/preview",
      payload: { statuses: { CAMPAIGNS: "unavailable" } },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.subscriberCount).toBe(3);
    expect(data.changedModules).toContain("CAMPAIGNS");
    expect(data.dependencyDisabled).toContain("SPONSORED_PRODUCTS");
  });

  it("PUT apply: merge yazılır + audit + cache invalidate", async () => {
    const { app, audits, getStored, cacheClearedCount } = buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/admin/plans/plan_1/capabilities",
      payload: { statuses: { REVIEWS: "unavailable" } },
    });
    expect(res.statusCode).toBe(200);
    expect((getStored() as { modules: Record<string, boolean> }).modules).toEqual({ REVIEWS: false });
    expect(audits[0]).toMatchObject({ planId: "plan_1" });
    expect(audits[0].changedModules).toContain("REVIEWS");
    expect(cacheClearedCount()).toBe(1);
  });

  it("PUT core unavailable → 400 (yazma yok)", async () => {
    const { app, cacheClearedCount } = buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/admin/plans/plan_1/capabilities",
      payload: { statuses: { CATALOG: "unavailable" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_PLAN_CAPABILITIES");
    expect(cacheClearedCount()).toBe(0);
  });

  it("admin değilse 401", async () => {
    const { app } = buildApp({ admin: false });
    expect((await app.inject({ method: "GET", url: "/admin/plans/plan_1/capabilities" })).statusCode).toBe(401);
  });

  it("plan yoksa 404", async () => {
    const { app } = buildApp({ plan: null });
    expect((await app.inject({ method: "GET", url: "/admin/plans/x/capabilities" })).statusCode).toBe(404);
  });
});
