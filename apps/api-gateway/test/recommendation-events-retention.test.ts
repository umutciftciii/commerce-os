/**
 * TD-130 (ADR-148) — Recommendation event retention SERVİSİ testleri (in-memory persistence double).
 *
 * Kapsam: dry-run yazma yapmaz · apply 180-gün cutoff siler (createdAt) · yakın satır korunur · store scope ·
 * circuit breaker · batch delete sınırları · SKIPPED_LOCKED + job log (jobName/queueName). Ayrı domain worker.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "@commerce-os/logger";
import {
  createRecommendationEventRetentionService,
  type JobLogClient,
} from "../src/recommendation-events/retention-service.js";
import type { RecommendationEventRetentionPersistence } from "../src/recommendation-events/retention-persistence.js";
import type { StoreJobLocker } from "../src/commercial-automation/advisory-lock.js";

const NOW = new Date("2026-07-29T00:00:00Z");
const DAY = 86_400_000;
const RETENTION_DAYS = 180;

const noopLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as Logger;

function createJobLogFake() {
  const rows: any[] = [];
  let seq = 0;
  const client = {
    queueJobLog: {
      create: async ({ data }: any) => {
        const id = `jl_${(seq += 1)}`;
        rows.push({ id, ...data });
        return { id };
      },
      update: async ({ where, data }: any) => {
        const r = rows.find((x) => x.id === where.id);
        if (r) Object.assign(r, data);
        return r ?? {};
      },
    },
  } as unknown as JobLogClient;
  return { client, rows };
}

const alwaysLock: StoreJobLocker = async (_j, _s, fn) => ({ acquired: true as const, result: await fn() });
const neverLock: StoreJobLocker = async () => ({ acquired: false as const });

interface Row {
  storeId: string;
  createdAt: Date;
}

function createPersistenceDouble(initial: Row[]) {
  let rows: Row[] = [...initial];
  const deleteBatchSizes: number[] = [];
  const persistence: RecommendationEventRetentionPersistence = {
    async listStoreScope() {
      return [...new Set(rows.map((r) => r.storeId))];
    },
    async countExpired(storeId, cutoff) {
      return rows.filter((r) => r.storeId === storeId && r.createdAt.getTime() < cutoff.getTime()).length;
    },
    async deleteExpiredBatch(storeId, cutoff, batchSize) {
      deleteBatchSizes.push(batchSize);
      const victims = rows
        .filter((r) => r.storeId === storeId && r.createdAt.getTime() < cutoff.getTime())
        .slice(0, Math.max(1, batchSize));
      const victimSet = new Set(victims);
      rows = rows.filter((r) => !victimSet.has(r));
      return victims.length;
    },
  };
  return { persistence, deleteBatchSizes, remaining: () => rows };
}

function service(
  initial: Row[],
  jobLog: JobLogClient,
  over?: Partial<{ batchSize: number; maxDeletePerRun: number }>,
  locker: StoreJobLocker = alwaysLock,
) {
  const double = createPersistenceDouble(initial);
  return {
    ...double,
    svc: createRecommendationEventRetentionService({
      persistence: double.persistence,
      jobLog,
      logger: noopLogger,
      lock: locker,
      clock: () => NOW,
      config: {
        retentionDays: RETENTION_DAYS,
        batchSize: over?.batchSize ?? 1000,
        maxDeletePerRun: over?.maxDeletePerRun ?? 200_000,
      },
    }),
  };
}

function row(storeId: string, daysAgo: number): Row {
  return { storeId, createdAt: new Date(NOW.getTime() - daysAgo * DAY) };
}

let jobLog: ReturnType<typeof createJobLogFake>;
beforeEach(() => {
  jobLog = createJobLogFake();
});

describe("recommendation-event retention service", () => {
  const baseRows = (): Row[] => [row("store_a", 181), row("store_a", 179)]; // 1 aday (181g) + 1 taze (179g)

  it("dry-run: silme YOK, aday sayılır", async () => {
    const { svc, remaining } = service(baseRows(), jobLog.client);
    const summary = await svc.runOnce({ now: NOW });
    expect(summary.mode).toBe("dry-run");
    expect(summary.totalCandidates).toBe(1);
    expect(summary.totalDeleted).toBe(0);
    expect(remaining()).toHaveLength(2);
    expect(summary.perStore[0].outcome).toBe("DRY_RUN");
  });

  it("apply: 181 günlük silinir, 179 günlük korunur", async () => {
    const { svc, remaining } = service(baseRows(), jobLog.client);
    const summary = await svc.runOnce({ now: NOW, apply: true });
    expect(summary.totalDeleted).toBe(1);
    const left = remaining();
    expect(left).toHaveLength(1);
    expect(left[0].createdAt.getTime()).toBeGreaterThan(NOW.getTime() - RETENTION_DAYS * DAY);
  });

  it("store scope: cross-store izolasyon", async () => {
    const rows = [row("store_a", 200), row("store_b", 200)];
    const { svc, remaining } = service(rows, jobLog.client);
    const summary = await svc.runOnce({ now: NOW, apply: true, storeId: "store_a" });
    expect(summary.totalDeleted).toBe(1);
    expect(remaining().map((r) => r.storeId)).toEqual(["store_b"]);
  });

  it("circuit breaker: aday > max → apply atlanır (PARTIAL_SUCCESS)", async () => {
    const rows = [row("store_a", 200), row("store_a", 200), row("store_a", 200)];
    const { svc, remaining } = service(rows, jobLog.client, { maxDeletePerRun: 2 });
    const summary = await svc.runOnce({ now: NOW, apply: true });
    expect(summary.perStore[0].circuitBreakerTripped).toBe(true);
    expect(summary.totalDeleted).toBe(0);
    expect(remaining()).toHaveLength(3);
  });

  it("batch delete: batchSize her çağrıyı sınırlar", async () => {
    const many: Row[] = Array.from({ length: 25 }, () => row("store_a", 200));
    const { svc, remaining, deleteBatchSizes } = service(many, jobLog.client, { batchSize: 10 });
    const summary = await svc.runOnce({ now: NOW, apply: true });
    expect(summary.totalDeleted).toBe(25);
    expect(remaining()).toHaveLength(0);
    expect(deleteBatchSizes.every((n) => n === 10)).toBe(true);
  });

  it("SKIPPED_LOCKED: lock alınamaz → silme yok + job log", async () => {
    const { svc, remaining } = service(baseRows(), jobLog.client, undefined, neverLock);
    const summary = await svc.runOnce({ now: NOW, apply: true, storeId: "store_a" });
    expect(summary.skippedLocked).toBe(1);
    expect(summary.totalDeleted).toBe(0);
    expect(remaining()).toHaveLength(2);
    expect(jobLog.rows[0].payload.outcome).toBe("SKIPPED_LOCKED");
  });

  it("job log jobName/queueName ayrı domain", async () => {
    const { svc } = service(baseRows(), jobLog.client);
    await svc.runOnce({ now: NOW, storeId: "store_a" });
    expect(jobLog.rows[0].jobName).toBe("recommendation-event-retention");
    expect(jobLog.rows[0].queueName).toBe("recommendation-events");
  });
});

// TODO-163 Faz 3 (TD-153) — RECOMMENDATION_ANALYTICS kapalı store'da tur atlanır (SKIPPED_DISABLED).
describe("recommendation-event retention — capability gate (TD-153)", () => {
  const gate = (enabled: Record<string, boolean>) => ({
    isEnabled: async (storeId: string) => enabled[storeId] !== false,
  });

  function gatedSvc(rows: Row[], enabled: Record<string, boolean>) {
    const double = createPersistenceDouble(rows);
    return {
      double,
      svc: createRecommendationEventRetentionService({
        persistence: double.persistence,
        jobLog: jobLog.client,
        logger: noopLogger,
        lock: alwaysLock,
        clock: () => NOW,
        config: { retentionDays: RETENTION_DAYS, batchSize: 1000, maxDeletePerRun: 200_000 },
        capabilityGate: gate(enabled),
      }),
    };
  }

  it("kapalı store: MUTATION YOK + SKIPPED_DISABLED jobLog; açık store işlenir; cross-store leak yok", async () => {
    const rows = [row("store_off", 200), row("store_on", 200)];
    const { double, svc } = gatedSvc(rows, { store_off: false, store_on: true });
    const summary = await svc.runOnce({ now: NOW, apply: true });

    expect(summary.skippedDisabled).toBe(1);
    expect(summary.totalDeleted).toBe(1); // yalnız store_on
    // store_off satırı DURUYOR (silme yok); store_on silindi → cross-store leak yok
    expect(double.remaining().map((r) => r.storeId)).toEqual(["store_off"]);

    const offReport = summary.perStore.find((p) => p.storeId === "store_off")!;
    expect(offReport.outcome).toBe("SKIPPED_DISABLED");
    const offLog = jobLog.rows.find((r) => r.storeId === "store_off");
    expect(offLog.payload.outcome).toBe("SKIPPED_DISABLED");
    expect(offLog.status).toBe("COMPLETED"); // HATA DEĞİL (retry storm yok)
  });

  it("gate enjekte edilmezse davranış eskisiyle AYNI (regresyonsuz; skippedDisabled=0)", async () => {
    const { svc, remaining } = service([row("store_a", 200)], jobLog.client);
    const summary = await svc.runOnce({ now: NOW, apply: true });
    expect(summary.skippedDisabled).toBe(0);
    expect(summary.totalDeleted).toBe(1);
    expect(remaining()).toHaveLength(0);
  });
});
