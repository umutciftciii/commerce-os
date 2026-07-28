/**
 * H-3 pre-ship (ADR-194) — PAID+ACTIVE reconcile SERVİSİ testleri (in-memory persistence double).
 * Kapsam: dry-run (mutation yok) · apply (CONSUMED) · manual-review · circuit breaker · SKIPPED_LOCKED ·
 * bounded batch · store izolasyonu · job log lifecycle.
 */
import { describe, expect, it } from "vitest";
import type { Logger } from "@commerce-os/logger";
import {
  createReservationReconcileService,
  type ReservationReconcilePersistence,
  type ReconcileBatchResult,
} from "../src/reservation-reconcile-service.js";
import type { JobLogClient } from "../src/reservation-job-log.js";

const noopLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as Logger;

function createJobLogFake() {
  const rows: Array<Record<string, unknown>> = [];
  let seq = 0;
  const client = {
    queueJobLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `jl_${(seq += 1)}`;
        rows.push({ id, ...data, createdAt: new Date() });
        return { id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = rows.find((x) => x.id === where.id);
        if (r) Object.assign(r, data);
        return r ?? {};
      },
      findFirst: async () => rows[rows.length - 1] ?? null,
    },
  } as unknown as JobLogClient;
  return { client, rows };
}

const alwaysLock = async <T>(_j: string, _s: string, fn: () => Promise<T>) => ({ acquired: true as const, result: await fn() });
const neverLock = async () => ({ acquired: false as const });

interface DoubleCfg {
  stores: string[];
  /** store → [reconcilable adet, manualReview adet] */
  candidates?: Record<string, { reconcile: number; manual: number }>;
}

function createDouble(cfg: DoubleCfg) {
  const state = { ...(cfg.candidates ?? {}) };
  const persistence: ReservationReconcilePersistence = {
    async listStores(storeId) {
      return storeId ? cfg.stores.filter((s) => s === storeId) : cfg.stores;
    },
    async countReconcileCandidates(storeId) {
      const s = state[storeId];
      return s ? s.reconcile + s.manual : 0;
    },
    async processReconcileBatch(storeId, _now, batchSize): Promise<ReconcileBatchResult> {
      const s = state[storeId] ?? { reconcile: 0, manual: 0 };
      const total = s.reconcile + s.manual;
      const take = Math.min(total, batchSize);
      // Önce reconcile edilebilenler işlenir, kalan manual.
      const reconciled = Math.min(s.reconcile, take);
      const manual = take - reconciled;
      s.reconcile -= reconciled;
      s.manual -= manual;
      state[storeId] = s;
      return { processed: take, reconciled, manualReview: manual, skipped: 0 };
    },
  };
  return persistence;
}

function service(cfg: DoubleCfg, jobLog: JobLogClient, locker = alwaysLock, overrides?: { batchSize?: number; maxReconcilePerRun?: number }) {
  return createReservationReconcileService({
    persistence: createDouble(cfg),
    jobLog,
    logger: noopLogger,
    lock: locker,
    batchSize: overrides?.batchSize ?? 100,
    maxReconcilePerRun: overrides?.maxReconcilePerRun ?? 100000,
  });
}

describe("reservation reconcile service", () => {
  it("dry-run: aday raporlar, YAZMA yok (varsayılan)", async () => {
    const { client, rows } = createJobLogFake();
    const svc = service({ stores: ["s1"], candidates: { s1: { reconcile: 4, manual: 1 } } }, client);
    const summary = await svc.runOnce({ storeId: "s1" }); // apply verilmedi → dry-run
    expect(summary.mode).toBe("dry-run");
    expect(summary.candidates).toBe(5);
    expect(summary.reconciled).toBe(0);
    expect(rows[0].payload).toMatchObject({ outcome: "DRY_RUN" });
  });

  it("apply: PAID+ACTIVE CONSUMED, belirsiz kayıt manual-review", async () => {
    const { client } = createJobLogFake();
    const svc = service({ stores: ["s1"], candidates: { s1: { reconcile: 3, manual: 2 } } }, client);
    const summary = await svc.runOnce({ storeId: "s1", apply: true });
    expect(summary.mode).toBe("apply");
    expect(summary.reconciled).toBe(3);
    expect(summary.manualReview).toBe(2);
  });

  it("circuit breaker: aday > max → APPLY reddedilir", async () => {
    const { client, rows } = createJobLogFake();
    const svc = service({ stores: ["s1"], candidates: { s1: { reconcile: 500, manual: 0 } } }, client, alwaysLock, { maxReconcilePerRun: 100 });
    const summary = await svc.runOnce({ storeId: "s1", apply: true });
    expect(summary.reconciled).toBe(0);
    expect(rows[0].payload).toMatchObject({ outcome: "CIRCUIT_BROKEN" });
  });

  it("SKIPPED_LOCKED: kilit alınamazsa işlem yok", async () => {
    const { client } = createJobLogFake();
    const svc = service({ stores: ["s1"], candidates: { s1: { reconcile: 5, manual: 0 } } }, client, neverLock);
    const summary = await svc.runOnce({ storeId: "s1", apply: true });
    expect(summary.skippedLocked).toBe(1);
    expect(summary.reconciled).toBe(0);
  });

  it("bounded batch: batchSize'dan büyük aday tükenir", async () => {
    const { client } = createJobLogFake();
    const svc = service({ stores: ["s1"], candidates: { s1: { reconcile: 250, manual: 0 } } }, client, alwaysLock, { batchSize: 100 });
    const summary = await svc.runOnce({ storeId: "s1", apply: true });
    expect(summary.reconciled).toBe(250);
  });

  it("store izolasyonu: sweep tümünü işler", async () => {
    const { client } = createJobLogFake();
    const svc = service({ stores: ["s1", "s2"], candidates: { s1: { reconcile: 2, manual: 0 }, s2: { reconcile: 3, manual: 0 } } }, client);
    const summary = await svc.runOnce({ apply: true });
    expect(summary.stores).toBe(2);
    expect(summary.reconciled).toBe(5);
  });
});
