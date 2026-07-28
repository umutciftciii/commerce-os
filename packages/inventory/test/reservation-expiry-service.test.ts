/**
 * H-3 (ADR-191/192) — inventory-reservation-expiry SERVİSİ testleri (in-memory persistence double).
 * Kapsam: dry-run · apply · circuit breaker · SKIPPED_LOCKED · bounded batch döngüsü · orphan DRAFT ·
 * store izolasyonu · job log lifecycle (STARTED→terminal).
 */
import { describe, expect, it } from "vitest";
import type { Logger } from "@commerce-os/logger";
import {
  createReservationExpiryService,
  type ReservationExpiryPersistence,
  type ExpiredBatchResult,
} from "../src/reservation-expiry-service.js";
import type { JobLogClient } from "../src/reservation-job-log.js";

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
        rows.push({ id, ...data, createdAt: new Date() });
        return { id };
      },
      update: async ({ where, data }: any) => {
        const r = rows.find((x) => x.id === where.id);
        if (r) Object.assign(r, data);
        return r ?? {};
      },
      findFirst: async ({ where }: any) => [...rows].reverse().find((r) => r.storeId === where.storeId) ?? null,
    },
  } as unknown as JobLogClient;
  return { client, rows };
}

const alwaysLock = async <T>(_j: string, _s: string, fn: () => Promise<T>) => ({ acquired: true as const, result: await fn() });
const neverLock = async () => ({ acquired: false as const });

interface DoubleConfig {
  stores: string[];
  expiredByStore?: Record<string, number>;
  orphanByStore?: Record<string, number>;
}

/** Persistence double: her batch en fazla batchSize "expired" işler, aday tükenene dek. */
function createDouble(cfg: DoubleConfig) {
  const expired = { ...(cfg.expiredByStore ?? {}) };
  const orphans = { ...(cfg.orphanByStore ?? {}) };
  const expiredOrdersCancelled: Record<string, number> = {};
  const persistence: ReservationExpiryPersistence = {
    async listStores(storeId) {
      return storeId ? cfg.stores.filter((s) => s === storeId) : cfg.stores;
    },
    async countExpiredReservations(storeId) {
      return expired[storeId] ?? 0;
    },
    async processExpiredBatch(storeId, _cutoff, _now, batchSize): Promise<ExpiredBatchResult> {
      const remaining = expired[storeId] ?? 0;
      const take = Math.min(remaining, batchSize);
      expired[storeId] = remaining - take;
      // İlk tur için expired sayısını "cancel edilecek sipariş" olarak da işaretle.
      expiredOrdersCancelled[storeId] = (expiredOrdersCancelled[storeId] ?? 0) + take;
      return { processed: take, expired: take, reconciledConsumed: 0, skipped: 0 };
    },
    async cancelExpiredOrdersBatch(storeId, _now, batchSize) {
      const remaining = expiredOrdersCancelled[storeId] ?? 0;
      const take = Math.min(remaining, batchSize);
      expiredOrdersCancelled[storeId] = remaining - take;
      return take;
    },
    async countOrphanDrafts(storeId) {
      return orphans[storeId] ?? 0;
    },
    async cancelOrphanDraftsBatch(storeId, _cutoff, _now, batchSize) {
      const remaining = orphans[storeId] ?? 0;
      const take = Math.min(remaining, batchSize);
      orphans[storeId] = remaining - take;
      return take;
    },
  };
  return persistence;
}

function service(cfg: DoubleConfig, jobLog: JobLogClient, locker = alwaysLock, overrides?: Partial<{ batchSize: number; maxReleasePerRun: number }>) {
  return createReservationExpiryService({
    persistence: createDouble(cfg),
    jobLog,
    logger: noopLogger,
    lock: locker,
    batchSize: overrides?.batchSize ?? 100,
    maxReleasePerRun: overrides?.maxReleasePerRun ?? 100000,
    orphanDraftMaxAgeMinutes: 1440,
  });
}

describe("reservation expiry service", () => {
  it("apply: expired rezervasyonları bırakır + siparişleri iptal eder + orphan DRAFT temizler", async () => {
    const { client, rows } = createJobLogFake();
    const svc = service({ stores: ["s1"], expiredByStore: { s1: 5 }, orphanByStore: { s1: 3 } }, client);
    const summary = await svc.runOnce({ storeId: "s1", apply: true });
    expect(summary.mode).toBe("apply");
    expect(summary.expiredReleased).toBe(5);
    expect(summary.ordersCancelled).toBe(5);
    expect(summary.orphanDraftsCancelled).toBe(3);
    // Tek job-run satırı, terminal COMPLETED.
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("COMPLETED");
    expect(rows[0].payload.outcome).toBe("COMPLETED");
  });

  it("dry-run: aday raporlar, YAZMA yok", async () => {
    const { client, rows } = createJobLogFake();
    const svc = service({ stores: ["s1"], expiredByStore: { s1: 4 }, orphanByStore: { s1: 2 } }, client);
    const summary = await svc.runOnce({ storeId: "s1", apply: false });
    expect(summary.mode).toBe("dry-run");
    expect(summary.expiredCandidates).toBe(4);
    expect(summary.expiredReleased).toBe(0);
    expect(summary.ordersCancelled).toBe(0);
    expect(summary.orphanDraftsCancelled).toBe(0);
    expect(rows[0].payload.outcome).toBe("DRY_RUN");
  });

  it("circuit breaker: aday > maxReleasePerRun → APPLY reddedilir (CIRCUIT_BROKEN)", async () => {
    const { client, rows } = createJobLogFake();
    const svc = service({ stores: ["s1"], expiredByStore: { s1: 500 } }, client, alwaysLock, { maxReleasePerRun: 100 });
    const summary = await svc.runOnce({ storeId: "s1", apply: true });
    expect(summary.circuitBroken).toBe(1);
    expect(summary.expiredReleased).toBe(0);
    expect(rows[0].payload.outcome).toBe("CIRCUIT_BROKEN");
  });

  it("SKIPPED_LOCKED: kilit alınamazsa tek satır, işlem yok", async () => {
    const { client, rows } = createJobLogFake();
    const svc = service({ stores: ["s1"], expiredByStore: { s1: 5 } }, client, neverLock);
    const summary = await svc.runOnce({ storeId: "s1", apply: true });
    expect(summary.skippedLocked).toBe(1);
    expect(summary.expiredReleased).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.outcome).toBe("SKIPPED_LOCKED");
  });

  it("bounded batch: batchSize'dan büyük aday çok turda tükenir", async () => {
    const { client } = createJobLogFake();
    const svc = service({ stores: ["s1"], expiredByStore: { s1: 250 } }, client, alwaysLock, { batchSize: 100 });
    const summary = await svc.runOnce({ storeId: "s1", apply: true });
    expect(summary.expiredReleased).toBe(250);
  });

  it("store izolasyonu: sweep tüm store'ları işler, biri diğerini etkilemez", async () => {
    const { client } = createJobLogFake();
    const svc = service({ stores: ["s1", "s2"], expiredByStore: { s1: 2, s2: 3 } }, client);
    const summary = await svc.runOnce({ apply: true }); // scope yok → sweep
    expect(summary.stores).toBe(2);
    expect(summary.expiredReleased).toBe(5);
  });
});
