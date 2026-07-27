/**
 * TODO-161B (ADR-139) — Recently Viewed retention SERVİSİ testleri (in-memory persistence double).
 *
 * Kapsam: dry-run yazma yapmaz · apply 90-gün cutoff siler · yakın satır korunur · store scope ·
 * circuit breaker · batch delete sınırları · SKIPPED_LOCKED (lock alınamaz) + job log kaydı.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "@commerce-os/logger";
import {
  createRecentlyViewedRetentionService,
  type JobLogClient,
} from "../src/recently-viewed/retention-service.js";
import type { RecentlyViewedRetentionPersistence } from "../src/recently-viewed/retention-persistence.js";
import type { StoreJobLocker } from "../src/commercial-automation/advisory-lock.js";

const NOW = new Date("2026-07-29T00:00:00Z");
const DAY = 86_400_000;
const RETENTION_DAYS = 90;

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

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
  lastViewedAt: Date;
}

function createPersistenceDouble(initial: Row[]) {
  let rows: Row[] = [...initial];
  const deleteBatchSizes: number[] = [];
  const persistence: RecentlyViewedRetentionPersistence = {
    async listStoreScope() {
      return [...new Set(rows.map((r) => r.storeId))];
    },
    async countExpired(storeId, cutoff) {
      return rows.filter((r) => r.storeId === storeId && r.lastViewedAt.getTime() < cutoff.getTime()).length;
    },
    async deleteExpiredBatch(storeId, cutoff, batchSize) {
      deleteBatchSizes.push(batchSize);
      const victims = rows
        .filter((r) => r.storeId === storeId && r.lastViewedAt.getTime() < cutoff.getTime())
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
    svc: createRecentlyViewedRetentionService({
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
  return { storeId, lastViewedAt: new Date(NOW.getTime() - daysAgo * DAY) };
}

let jobLog: ReturnType<typeof createJobLogFake>;
beforeEach(() => {
  jobLog = createJobLogFake();
});

describe("recently-viewed retention service", () => {
  const baseRows = (): Row[] => [row("store_a", 91), row("store_a", 89)]; // 1 aday + 1 taze

  it("dry-run: silme YOK, aday sayılır, mode=dry-run", async () => {
    const { svc, remaining } = service(baseRows(), jobLog.client);
    const summary = await svc.runOnce({ now: NOW }); // apply omit → dry-run
    expect(summary.mode).toBe("dry-run");
    expect(summary.totalCandidates).toBe(1);
    expect(summary.totalDeleted).toBe(0);
    expect(remaining()).toHaveLength(2);
    expect(summary.perStore[0].outcome).toBe("DRY_RUN");
  });

  it("apply: cutoff'tan eski satır silinir, taze satır korunur", async () => {
    const { svc, remaining } = service(baseRows(), jobLog.client);
    const summary = await svc.runOnce({ now: NOW, apply: true });
    expect(summary.mode).toBe("apply");
    expect(summary.totalDeleted).toBe(1);
    const left = remaining();
    expect(left).toHaveLength(1);
    // korunan satır cutoff'tan yeni (89 gün önce)
    expect(left[0].lastViewedAt.getTime()).toBeGreaterThan(NOW.getTime() - RETENTION_DAYS * DAY);
  });

  it("store scope: yalnız hedef store işlenir (cross-store izolasyon)", async () => {
    const rows = [row("store_a", 91), row("store_b", 91)];
    const { svc, remaining } = service(rows, jobLog.client);
    const summary = await svc.runOnce({ now: NOW, apply: true, storeId: "store_a" });
    expect(summary.totalDeleted).toBe(1);
    const left = remaining();
    expect(left).toHaveLength(1);
    expect(left[0].storeId).toBe("store_b"); // store_b'ye dokunulmadı
  });

  it("circuit breaker: aday > maxDeletePerRun → apply atlanır (tripped)", async () => {
    const rows = [row("store_a", 100), row("store_a", 100), row("store_a", 100)];
    const { svc, remaining } = service(rows, jobLog.client, { maxDeletePerRun: 2 });
    const summary = await svc.runOnce({ now: NOW, apply: true });
    expect(summary.perStore[0].circuitBreakerTripped).toBe(true);
    expect(summary.perStore[0].outcome).toBe("PARTIAL_SUCCESS");
    expect(summary.totalDeleted).toBe(0);
    expect(remaining()).toHaveLength(3); // silinmedi
  });

  it("circuit breaker: dry-run tetiklenmez ama adayları raporlar", async () => {
    const rows = [row("store_a", 100), row("store_a", 100), row("store_a", 100)];
    const { svc, remaining } = service(rows, jobLog.client, { maxDeletePerRun: 2 });
    const summary = await svc.runOnce({ now: NOW }); // dry-run
    expect(summary.mode).toBe("dry-run");
    expect(summary.totalCandidates).toBe(3);
    expect(summary.perStore[0].circuitBreakerTripped).toBe(false);
    expect(remaining()).toHaveLength(3);
  });

  it("batch delete: batchSize her silme çağrısını sınırlar, toplam doğru", async () => {
    const many: Row[] = Array.from({ length: 25 }, () => row("store_a", 120));
    const { svc, remaining, deleteBatchSizes } = service(many, jobLog.client, { batchSize: 10 });
    const summary = await svc.runOnce({ now: NOW, apply: true });
    expect(summary.totalDeleted).toBe(25);
    expect(remaining()).toHaveLength(0);
    // her delete çağrısına batchSize=10 aktarıldı
    expect(deleteBatchSizes.every((n) => n === 10)).toBe(true);
    expect(deleteBatchSizes.length).toBeGreaterThanOrEqual(3);
  });

  it("SKIPPED_LOCKED: lock alınamaz → silme yok, skippedLocked artar, job log yazılır", async () => {
    const { svc, remaining } = service(baseRows(), jobLog.client, undefined, neverLock);
    const summary = await svc.runOnce({ now: NOW, apply: true, storeId: "store_a" });
    expect(summary.skippedLocked).toBe(1);
    expect(summary.totalDeleted).toBe(0);
    expect(remaining()).toHaveLength(2);
    expect(summary.perStore[0].outcome).toBe("SKIPPED_LOCKED");
    expect(jobLog.rows).toHaveLength(1);
    expect(jobLog.rows[0].payload.outcome).toBe("SKIPPED_LOCKED");
  });

  it("job log kaydı normal turda yazılır (jobName/queueName)", async () => {
    const { svc } = service(baseRows(), jobLog.client);
    await svc.runOnce({ now: NOW, storeId: "store_a" });
    expect(jobLog.rows).toHaveLength(1);
    expect(jobLog.rows[0].jobName).toBe("recently-viewed-retention");
    expect(jobLog.rows[0].queueName).toBe("recently-viewed");
  });
});
