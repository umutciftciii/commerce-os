/**
 * TODO-161A.1 (ADR-136) — Commercial Automation HTTP route testleri.
 *
 * Kapsam: store-admin guard + cross-store isolation · status serialize · manuel dry-run/run ·
 * retention APPLY yalnız `dryRun:false` ile (varsayılan dry-run) · gövde 400 · sunucu-otoriter scope.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { registerCommercialAutomationRoutes } from "../src/commercial-automation/routes.js";
import type { SettlementSchedulerService, SettlementSchedulerSummary } from "../src/commercial-automation/settlement-scheduler-service.js";
import type { RetentionService, RetentionSummary } from "../src/commercial-automation/retention-service.js";
import type { JobLogClient } from "../src/commercial-automation/job-log.js";

const STORE_A = "store_a";
const STORE_B = "store_b";

function auth(storeId: string) {
  return { authorization: `Bearer admin:${storeId}` };
}

function settlementSummary(over: Partial<SettlementSchedulerSummary> = {}): SettlementSchedulerSummary {
  return {
    stores: 1,
    mode: "apply",
    scannedAgreements: 1,
    createdDrafts: 1,
    candidateDrafts: 0,
    erroredAgreements: 0,
    skippedLocked: 0,
    perStore: [],
    ...over,
  };
}

function retentionSummary(over: Partial<RetentionSummary> = {}): RetentionSummary {
  return {
    stores: 1,
    mode: "dry-run",
    totalCandidates: 3,
    totalDeleted: 0,
    skippedLocked: 0,
    perStore: [],
    ...over,
  };
}

interface Captured {
  settlement?: { storeId?: string; apply?: boolean };
  retention?: { storeId?: string; apply?: boolean };
}

function buildApp(captured: Captured, jobLog: JobLogClient): FastifyInstance {
  const app = Fastify();
  const settlementScheduler: SettlementSchedulerService = {
    async runOnce(options) {
      captured.settlement = { storeId: options?.storeId, apply: options?.apply };
      return settlementSummary({ mode: options?.apply === false ? "dry-run" : "apply" });
    },
  };
  const retention: RetentionService = {
    async runOnce(options) {
      captured.retention = { storeId: options?.storeId, apply: options?.apply };
      return retentionSummary({ mode: options?.apply === true ? "apply" : "dry-run", totalDeleted: options?.apply === true ? 2 : 0 });
    },
  };
  registerCommercialAutomationRoutes(app, {
    requireStoreAdmin: async (request, reply, storeId) => {
      const a = (request.headers["authorization"] as string | undefined) ?? "";
      const m = /^Bearer admin:(.+)$/.exec(a);
      if (!m || m[1] !== storeId) {
        reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "no" } });
        return null;
      }
      return { actorUserId: "admin_1" };
    },
    settlementScheduler,
    retention,
    jobLog,
    recordAudit: async () => undefined,
    retentionConfig: { sponsoredEventRetentionDays: 180, influencerClickRetentionDays: 180, maxDeletePerRun: 200_000 },
  });
  return app;
}

function jobLogFake(latest: unknown): JobLogClient {
  return {
    queueJobLog: {
      findFirst: async ({ where }: { where: { jobName: string } }) =>
        latest && where.jobName === "sponsorship-settlement-scheduler"
          ? { id: "j1", jobName: where.jobName, status: "COMPLETED", attempts: 1, payload: latest, error: null, createdAt: new Date("2026-07-29T00:00:00Z"), storeId: STORE_A, updatedAt: new Date() }
          : null,
      create: async () => ({}),
    },
  } as unknown as JobLogClient;
}

let captured: Captured;
let app: FastifyInstance;
beforeEach(() => {
  captured = {};
  app = buildApp(captured, jobLogFake({ createdDrafts: 2 }));
});

describe("commercial automation routes", () => {
  it("status: auth yoksa 401", async () => {
    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A}/commercial-automation/status` });
    expect(res.statusCode).toBe(401);
  });

  it("status: cross-store 401 (tenant isolation)", async () => {
    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A}/commercial-automation/status`, headers: auth(STORE_B) });
    expect(res.statusCode).toBe(401);
  });

  it("status: son çalışma + retentionConfig döner", async () => {
    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A}/commercial-automation/status`, headers: auth(STORE_A) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.settlementScheduler.status).toBe("COMPLETED");
    expect(body.data.retentionConfig.sponsoredEventRetentionDays).toBe(180);
  });

  it("settlement run: varsayılan APPLY (dryRun yok)", async () => {
    const res = await app.inject({ method: "POST", url: `/stores/${STORE_A}/commercial-automation/settlement-scheduler/run`, headers: auth(STORE_A), payload: {} });
    expect(res.statusCode).toBe(200);
    expect(captured.settlement).toEqual({ storeId: STORE_A, apply: true });
    expect(res.json().data.mode).toBe("apply");
  });

  it("settlement run: dryRun=true → dry-run", async () => {
    const res = await app.inject({ method: "POST", url: `/stores/${STORE_A}/commercial-automation/settlement-scheduler/run`, headers: auth(STORE_A), payload: { dryRun: true } });
    expect(res.statusCode).toBe(200);
    expect(captured.settlement).toEqual({ storeId: STORE_A, apply: false });
  });

  it("retention run: varsayılan DRY-RUN (dryRun yok)", async () => {
    const res = await app.inject({ method: "POST", url: `/stores/${STORE_A}/commercial-automation/retention/run`, headers: auth(STORE_A), payload: {} });
    expect(res.statusCode).toBe(200);
    expect(captured.retention).toEqual({ storeId: STORE_A, apply: false });
    expect(res.json().data.mode).toBe("dry-run");
  });

  it("retention run: APPLY yalnız dryRun:false ile", async () => {
    const res = await app.inject({ method: "POST", url: `/stores/${STORE_A}/commercial-automation/retention/run`, headers: auth(STORE_A), payload: { dryRun: false } });
    expect(res.statusCode).toBe(200);
    expect(captured.retention).toEqual({ storeId: STORE_A, apply: true });
    expect(res.json().data.mode).toBe("apply");
    expect(res.json().data.totalDeleted).toBe(2);
  });

  it("retention run: cross-store 401 (server-otoriter scope)", async () => {
    const res = await app.inject({ method: "POST", url: `/stores/${STORE_A}/commercial-automation/retention/run`, headers: auth(STORE_B), payload: { dryRun: false } });
    expect(res.statusCode).toBe(401);
    expect(captured.retention).toBeUndefined();
  });

  it("geçersiz gövde → 400", async () => {
    const res = await app.inject({ method: "POST", url: `/stores/${STORE_A}/commercial-automation/retention/run`, headers: auth(STORE_A), payload: { dryRun: "yes" } });
    expect(res.statusCode).toBe(400);
  });

  it("settlement run: kilit alınamazsa 409 JOB_ALREADY_RUNNING", async () => {
    const lockedApp = Fastify();
    registerCommercialAutomationRoutes(lockedApp, {
      requireStoreAdmin: async () => ({ actorUserId: "a" }),
      settlementScheduler: { async runOnce() { return settlementSummary({ skippedLocked: 1, createdDrafts: 0 }); } },
      retention: { async runOnce() { return retentionSummary(); } },
      jobLog: jobLogFake(null),
      recordAudit: async () => undefined,
      retentionConfig: { sponsoredEventRetentionDays: 180, influencerClickRetentionDays: 180, maxDeletePerRun: 200_000 },
    });
    const res = await lockedApp.inject({ method: "POST", url: `/stores/${STORE_A}/commercial-automation/settlement-scheduler/run`, headers: auth(STORE_A), payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("JOB_ALREADY_RUNNING");
  });

  it("retention apply: kilit alınamazsa 409 JOB_ALREADY_RUNNING", async () => {
    const lockedApp = Fastify();
    registerCommercialAutomationRoutes(lockedApp, {
      requireStoreAdmin: async () => ({ actorUserId: "a" }),
      settlementScheduler: { async runOnce() { return settlementSummary(); } },
      retention: { async runOnce() { return retentionSummary({ skippedLocked: 1, mode: "apply" }); } },
      jobLog: jobLogFake(null),
      recordAudit: async () => undefined,
      retentionConfig: { sponsoredEventRetentionDays: 180, influencerClickRetentionDays: 180, maxDeletePerRun: 200_000 },
    });
    const res = await lockedApp.inject({ method: "POST", url: `/stores/${STORE_A}/commercial-automation/retention/run`, headers: auth(STORE_A), payload: { dryRun: false } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("JOB_ALREADY_RUNNING");
  });
});
