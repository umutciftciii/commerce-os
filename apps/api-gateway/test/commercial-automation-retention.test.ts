/**
 * TODO-161A.1 (TD-121 + TD-113) — Retention SERVİSİ testleri (in-memory persistence double).
 *
 * Kapsam: dry-run yazma yapmaz · apply siler · store scope · 180 gün cutoff · sponsored+influencer
 * silme · yakın event korunur · circuit breaker · batch delete · yalnız izinli tablolara dokunulur
 * (finans/orphan koruma) · job log kaydı.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "@commerce-os/logger";
import {
  createRetentionService,
  type RetentionPersistence,
} from "../src/commercial-automation/retention-service.js";
import type { RetentionTable } from "../src/commercial-automation/retention-core.js";
import type { JobLogClient } from "../src/commercial-automation/job-log.js";

const NOW = new Date("2026-07-29T00:00:00Z");
const DAY = 86_400_000;

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

function createJobLogFake() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];
  let seq = 0;
  const client = {
    queueJobLog: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: any) => {
        const id = `jl_${(seq += 1)}`;
        rows.push({ id, ...data });
        return { id };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async ({ where, data }: any) => {
        const r = rows.find((x) => x.id === where.id);
        if (r) Object.assign(r, data);
        return r ?? {};
      },
      findFirst: async () => null,
    },
  } as unknown as JobLogClient;
  return { client, rows };
}

const alwaysLock = async <T>(_j: string, _s: string, fn: () => Promise<T>) => ({ acquired: true as const, result: await fn() });
const neverLock = async () => ({ acquired: false as const });

interface Row {
  id: string;
  storeId: string;
  createdAt: number;
}

interface RetentionDoubleConfig {
  rows: Record<RetentionTable, Row[]>;
}

function createDouble(cfg: RetentionDoubleConfig) {
  const state: Record<RetentionTable, Row[]> = {
    SponsoredProductEvent: [...cfg.rows.SponsoredProductEvent],
    AttributionClick: [...cfg.rows.AttributionClick],
  };
  const deleteCalls: RetentionTable[] = [];
  const persistence: RetentionPersistence = {
    async listStoreScope(storeId) {
      if (storeId) return [storeId];
      const set = new Set<string>();
      for (const t of ["SponsoredProductEvent", "AttributionClick"] as RetentionTable[]) {
        for (const r of state[t]) set.add(r.storeId);
      }
      return [...set];
    },
    async countExpired(table, storeId, cutoff) {
      return state[table].filter((r) => r.storeId === storeId && r.createdAt < cutoff.getTime()).length;
    },
    async deleteExpiredBatch(table, storeId, cutoff, batchSize) {
      deleteCalls.push(table);
      const victims = state[table]
        .filter((r) => r.storeId === storeId && r.createdAt < cutoff.getTime())
        .slice(0, batchSize);
      const ids = new Set(victims.map((v) => v.id));
      state[table] = state[table].filter((r) => !ids.has(r.id));
      return victims.length;
    },
  };
  return { persistence, state, deleteCalls };
}

function service(
  cfg: RetentionDoubleConfig,
  jobLog: JobLogClient,
  over?: Partial<{ batchSize: number; maxDeletePerRun: number }>,
  locker = alwaysLock,
) {
  const { persistence, state, deleteCalls } = createDouble(cfg);
  return {
    state,
    deleteCalls,
    svc: createRetentionService({
      persistence,
      jobLog,
      logger: noopLogger,
      lock: locker,
      config: {
        retentionDaysByTable: { SponsoredProductEvent: 180, AttributionClick: 180 },
        batchSize: over?.batchSize ?? 1000,
        maxDeletePerRun: over?.maxDeletePerRun ?? 200_000,
      },
    }),
  };
}

function row(id: string, storeId: string, daysAgo: number): Row {
  return { id, storeId, createdAt: NOW.getTime() - daysAgo * DAY };
}

let jobLog: ReturnType<typeof createJobLogFake>;
beforeEach(() => {
  jobLog = createJobLogFake();
});

describe("retention service", () => {
  const baseRows = (): RetentionDoubleConfig["rows"] => ({
    SponsoredProductEvent: [row("s_old", "store_a", 181), row("s_new", "store_a", 179)],
    AttributionClick: [row("c_old", "store_a", 181), row("c_new", "store_a", 179)],
  });

  it("dry-run: yazma YOK, aday sayılır", async () => {
    const { svc, state } = service({ rows: baseRows() }, jobLog.client);
    const summary = await svc.runOnce({ now: NOW }); // apply omit → dry-run
    expect(summary.mode).toBe("dry-run");
    expect(summary.totalCandidates).toBe(2); // s_old + c_old
    expect(summary.totalDeleted).toBe(0);
    expect(state.SponsoredProductEvent).toHaveLength(2);
    expect(state.AttributionClick).toHaveLength(2);
  });

  it("apply: 180 gün öncesi silinir, yeni event korunur (sponsored + influencer)", async () => {
    const { svc, state } = service({ rows: baseRows() }, jobLog.client);
    const summary = await svc.runOnce({ now: NOW, apply: true });
    expect(summary.mode).toBe("apply");
    expect(summary.totalDeleted).toBe(2);
    expect(state.SponsoredProductEvent.map((r) => r.id)).toEqual(["s_new"]);
    expect(state.AttributionClick.map((r) => r.id)).toEqual(["c_new"]);
  });

  it("yalnız izinli iki tabloya dokunulur (finans/orphan koruma)", async () => {
    const { svc, deleteCalls } = service({ rows: baseRows() }, jobLog.client);
    await svc.runOnce({ now: NOW, apply: true });
    expect(new Set(deleteCalls)).toEqual(new Set(["SponsoredProductEvent", "AttributionClick"]));
  });

  it("store scope: yalnız hedef store silinir (cross-store izolasyon)", async () => {
    const rows: RetentionDoubleConfig["rows"] = {
      SponsoredProductEvent: [row("a_old", "store_a", 181), row("b_old", "store_b", 181)],
      AttributionClick: [],
    };
    const { svc, state } = service({ rows }, jobLog.client);
    await svc.runOnce({ now: NOW, apply: true, storeId: "store_a" });
    expect(state.SponsoredProductEvent.map((r) => r.id)).toEqual(["b_old"]); // store_b korunur
  });

  it("circuit breaker devre dışı (max=0): silme yapılır", async () => {
    const { svc, state } = service({ rows: baseRows() }, jobLog.client, { maxDeletePerRun: 0 });
    await svc.runOnce({ now: NOW, apply: true });
    expect(state.SponsoredProductEvent).toHaveLength(1); // s_old silindi, s_new korundu
  });

  it("circuit breaker: eşik aşılınca tablo için silme reddedilir", async () => {
    const rows: RetentionDoubleConfig["rows"] = {
      SponsoredProductEvent: [row("s1", "store_a", 181), row("s2", "store_a", 181), row("s3", "store_a", 181)],
      AttributionClick: [],
    };
    const { svc, state } = service({ rows }, jobLog.client, { maxDeletePerRun: 2 });
    const summary = await svc.runOnce({ now: NOW, apply: true });
    const sponsored = summary.perStore[0].tables.find((t) => t.table === "SponsoredProductEvent")!;
    expect(sponsored.circuitBreakerTripped).toBe(true);
    expect(sponsored.deleted).toBe(0);
    expect(state.SponsoredProductEvent).toHaveLength(3); // silinmedi
  });

  it("batch delete: küçük batch ile tüm eski satırlar silinir", async () => {
    const many: Row[] = Array.from({ length: 25 }, (_, i) => row(`m${i}`, "store_a", 200));
    const rows: RetentionDoubleConfig["rows"] = { SponsoredProductEvent: many, AttributionClick: [] };
    const { svc, state } = service({ rows }, jobLog.client, { batchSize: 10 });
    const summary = await svc.runOnce({ now: NOW, apply: true });
    expect(summary.totalDeleted).toBe(25);
    expect(state.SponsoredProductEvent).toHaveLength(0);
  });

  it("job log kaydı yazılır", async () => {
    const { svc } = service({ rows: baseRows() }, jobLog.client);
    await svc.runOnce({ now: NOW, storeId: "store_a" });
    expect(jobLog.rows).toHaveLength(1);
    expect(jobLog.rows[0].jobName).toBe("attribution-event-retention");
  });

  it("advisory lock alınamazsa store SKIPPED_LOCKED (silme yok, çift yazma yok)", async () => {
    const { svc, state } = service({ rows: baseRows() }, jobLog.client, undefined, neverLock);
    const summary = await svc.runOnce({ now: NOW, storeId: "store_a", apply: true });
    expect(summary.skippedLocked).toBe(1);
    expect(summary.totalDeleted).toBe(0);
    expect(state.SponsoredProductEvent).toHaveLength(2); // silinmedi
    expect(summary.perStore[0].outcome).toBe("SKIPPED_LOCKED");
    expect(jobLog.rows).toHaveLength(1);
    expect(jobLog.rows[0].payload.outcome).toBe("SKIPPED_LOCKED");
  });
});
