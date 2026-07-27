/**
 * TODO-161A.1 (TD-125) — Settlement scheduler SERVİSİ testleri (in-memory persistence double).
 *
 * Kapsam: weekly/monthly/campaign-end · duplicate önleme · existing DRAFT · finalized immutable ·
 * uygun-olmayan statü · anlaşma-başına hata izolasyonu · idempotency · dry-run · job log kaydı.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "@commerce-os/logger";
import {
  createSettlementSchedulerService,
  type SettlementSchedulerPersistence,
  type CreateDraftOutcome,
} from "../src/commercial-automation/settlement-scheduler-service.js";
import type { SchedulableAgreement } from "../src/commercial-automation/settlement-schedule-core.js";
import type { JobLogClient } from "../src/commercial-automation/job-log.js";

const IST = "Europe/Istanbul";
const NOW = new Date("2026-07-29T09:00:00Z"); // Çarşamba 12:00 TR

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

interface FakeSettlement {
  id: string;
  agreementId: string;
  periodStart: number;
  periodEnd: number;
  status: "DRAFT" | "FINALIZED";
}

/** QueueJobLog fake (create→id / update / findFirst) — lifecycle (STARTED→terminal) destekler. */
function createJobLogFake() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];
  let seq = 0;
  const client = {
    queueJobLog: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: any) => {
        const id = `jl_${(seq += 1)}`;
        rows.push({ id, ...data, createdAt: new Date() });
        return { id };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async ({ where, data }: any) => {
        const r = rows.find((x) => x.id === where.id);
        if (r) Object.assign(r, data);
        return r ?? {};
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findFirst: async ({ where }: any) => {
        const found = [...rows].reverse().find((r) => r.storeId === where.storeId && r.jobName === where.jobName);
        return found ? { attempts: 1, error: null, updatedAt: found.createdAt, ...found } : null;
      },
    },
  } as unknown as JobLogClient;
  return { client, rows };
}

/** Her zaman kilit veren fake locker. */
const alwaysLock = async <T>(_j: string, _s: string, fn: () => Promise<T>) => ({ acquired: true as const, result: await fn() });
/** Hiç kilit vermeyen fake locker (SKIPPED_LOCKED senaryosu). */
const neverLock = async () => ({ acquired: false as const });

interface DoubleConfig {
  stores: Array<{ storeId: string; timeZone: string }>;
  agreements: Record<string, SchedulableAgreement[]>;
  existing?: FakeSettlement[];
  /** Bu agreementId için createDraftSettlement fırlatır (hata izolasyonu testi). */
  throwOnAgreementId?: string;
}

function createDouble(cfg: DoubleConfig) {
  const settlements: FakeSettlement[] = [...(cfg.existing ?? [])];
  let seq = settlements.length;
  const persistence: SettlementSchedulerPersistence = {
    async listStoreTimezones(storeId) {
      return storeId ? cfg.stores.filter((s) => s.storeId === storeId) : cfg.stores;
    },
    async listSchedulableAgreements(storeId) {
      return cfg.agreements[storeId] ?? [];
    },
    async findSettlementForPeriod(agreementId, periodStart, periodEnd) {
      const f = settlements.find(
        (s) => s.agreementId === agreementId && s.periodStart === periodStart.getTime() && s.periodEnd === periodEnd.getTime(),
      );
      return f ? { id: f.id, status: f.status } : null;
    },
    async createDraftSettlement(_storeId, agreementId, input): Promise<CreateDraftOutcome> {
      if (cfg.throwOnAgreementId === agreementId) throw new Error("boom");
      seq += 1;
      const id = `st_${seq}`;
      settlements.push({
        id,
        agreementId,
        periodStart: input.periodStart.getTime(),
        periodEnd: input.periodEnd.getTime(),
        status: "DRAFT",
      });
      return { ok: true, settlementId: id };
    },
  };
  return { persistence, settlements };
}

function service(cfg: DoubleConfig, jobLog: JobLogClient, locker = alwaysLock) {
  const { persistence, settlements } = createDouble(cfg);
  return {
    settlements,
    svc: createSettlementSchedulerService({
      persistence,
      jobLog,
      logger: noopLogger,
      lock: locker,
      defaultTimeZone: IST,
      batchSize: 500,
    }),
  };
}

function weeklyAgreement(id: string, over: Partial<SchedulableAgreement> = {}): SchedulableAgreement {
  return {
    id,
    storeId: "store_a",
    status: "ACTIVE",
    settlementPeriod: "WEEKLY",
    startsAt: new Date("2026-01-01T00:00:00Z"),
    endsAt: new Date("2027-01-01T00:00:00Z"),
    ...over,
  };
}

let jobLog: ReturnType<typeof createJobLogFake>;
beforeEach(() => {
  jobLog = createJobLogFake();
});

describe("settlement scheduler service", () => {
  it("weekly: kapanmış hafta için DRAFT üretir", async () => {
    const { svc, settlements } = service(
      { stores: [{ storeId: "store_a", timeZone: IST }], agreements: { store_a: [weeklyAgreement("ag_w")] } },
      jobLog.client,
    );
    const summary = await svc.runOnce({ now: NOW });
    expect(summary.createdDrafts).toBe(1);
    expect(settlements).toHaveLength(1);
    expect(summary.mode).toBe("apply");
  });

  it("monthly: önceki ay için DRAFT üretir", async () => {
    const { svc } = service(
      { stores: [{ storeId: "store_a", timeZone: IST }], agreements: { store_a: [weeklyAgreement("ag_m", { settlementPeriod: "MONTHLY" })] } },
      jobLog.client,
    );
    const summary = await svc.runOnce({ now: NOW });
    expect(summary.createdDrafts).toBe(1);
  });

  it("campaign-end: bitmiş → DRAFT; bitmemiş → atlanır", async () => {
    const ended = weeklyAgreement("ag_c1", { settlementPeriod: "CAMPAIGN_END", startsAt: new Date("2026-06-01T00:00:00Z"), endsAt: new Date("2026-06-30T00:00:00Z") });
    const notEnded = weeklyAgreement("ag_c2", { settlementPeriod: "CAMPAIGN_END", endsAt: new Date("2099-01-01T00:00:00Z") });
    const { svc } = service(
      { stores: [{ storeId: "store_a", timeZone: IST }], agreements: { store_a: [ended, notEnded] } },
      jobLog.client,
    );
    const summary = await svc.runOnce({ now: NOW });
    expect(summary.createdDrafts).toBe(1);
    expect(summary.perStore[0].skippedByReason.AGREEMENT_NOT_ENDED).toBe(1);
  });

  it("duplicate önleme + idempotency: iki kez çalıştır → tek settlement", async () => {
    const { svc, settlements } = service(
      { stores: [{ storeId: "store_a", timeZone: IST }], agreements: { store_a: [weeklyAgreement("ag_w")] } },
      jobLog.client,
    );
    const first = await svc.runOnce({ now: NOW });
    const second = await svc.runOnce({ now: NOW });
    expect(first.createdDrafts).toBe(1);
    expect(second.createdDrafts).toBe(0);
    expect(second.perStore[0].skippedByReason.EXISTING_DRAFT).toBe(1);
    expect(settlements).toHaveLength(1);
  });

  it("finalized settlement'a dokunmaz (immutable)", async () => {
    const ag = weeklyAgreement("ag_w");
    // periodStart/End weekly ile aynı olmalı → 07-20..07-27 TR
    const existing: FakeSettlement = {
      id: "st_fin",
      agreementId: "ag_w",
      periodStart: new Date("2026-07-19T21:00:00Z").getTime(),
      periodEnd: new Date("2026-07-26T21:00:00Z").getTime(),
      status: "FINALIZED",
    };
    const { svc, settlements } = service(
      { stores: [{ storeId: "store_a", timeZone: IST }], agreements: { store_a: [ag] }, existing: [existing] },
      jobLog.client,
    );
    const summary = await svc.runOnce({ now: NOW });
    expect(summary.createdDrafts).toBe(0);
    expect(summary.perStore[0].skippedByReason.EXISTING_FINALIZED).toBe(1);
    expect(settlements).toHaveLength(1);
    expect(settlements[0].status).toBe("FINALIZED");
  });

  it("uygun olmayan statü (DRAFT anlaşma) atlanır", async () => {
    const { svc } = service(
      { stores: [{ storeId: "store_a", timeZone: IST }], agreements: { store_a: [weeklyAgreement("ag_x", { status: "DRAFT" })] } },
      jobLog.client,
    );
    const summary = await svc.runOnce({ now: NOW });
    expect(summary.createdDrafts).toBe(0);
    expect(summary.perStore[0].skippedByReason.NOT_SCHEDULABLE_STATUS).toBe(1);
  });

  it("anlaşma-başına hata izolasyonu: biri patlar, diğerleri üretilir", async () => {
    const { svc } = service(
      {
        stores: [{ storeId: "store_a", timeZone: IST }],
        agreements: { store_a: [weeklyAgreement("ag_ok"), weeklyAgreement("ag_bad")] },
        throwOnAgreementId: "ag_bad",
      },
      jobLog.client,
    );
    const summary = await svc.runOnce({ now: NOW });
    expect(summary.createdDrafts).toBe(1);
    expect(summary.erroredAgreements).toBe(1);
    expect(summary.perStore[0].errors[0].agreementId).toBe("ag_bad");
  });

  it("dry-run: hiçbir settlement üretilmez, aday sayılır", async () => {
    const { svc, settlements } = service(
      { stores: [{ storeId: "store_a", timeZone: IST }], agreements: { store_a: [weeklyAgreement("ag_w")] } },
      jobLog.client,
    );
    const summary = await svc.runOnce({ now: NOW, apply: false });
    expect(summary.mode).toBe("dry-run");
    expect(summary.createdDrafts).toBe(0);
    expect(summary.candidateDrafts).toBe(1);
    expect(settlements).toHaveLength(0);
  });

  it("cross-store: yalnız scope'lu store işlenir", async () => {
    const { svc } = service(
      {
        stores: [
          { storeId: "store_a", timeZone: IST },
          { storeId: "store_b", timeZone: IST },
        ],
        agreements: {
          store_a: [weeklyAgreement("ag_a")],
          store_b: [weeklyAgreement("ag_b", { storeId: "store_b" })],
        },
      },
      jobLog.client,
    );
    const summary = await svc.runOnce({ now: NOW, storeId: "store_a" });
    expect(summary.stores).toBe(1);
    expect(summary.perStore[0].storeId).toBe("store_a");
  });

  it("job log kaydı yazılır (görünürlük)", async () => {
    const { svc } = service(
      { stores: [{ storeId: "store_a", timeZone: IST }], agreements: { store_a: [weeklyAgreement("ag_w")] } },
      jobLog.client,
    );
    await svc.runOnce({ now: NOW });
    expect(jobLog.rows).toHaveLength(1);
    expect(jobLog.rows[0].jobName).toBe("sponsorship-settlement-scheduler");
    expect(jobLog.rows[0].storeId).toBe("store_a");
  });

  it("advisory lock alınamazsa store SKIPPED_LOCKED (duplicate DRAFT yok)", async () => {
    const { svc, settlements } = service(
      { stores: [{ storeId: "store_a", timeZone: IST }], agreements: { store_a: [weeklyAgreement("ag_w")] } },
      jobLog.client,
      neverLock,
    );
    const summary = await svc.runOnce({ now: NOW });
    expect(summary.skippedLocked).toBe(1);
    expect(summary.createdDrafts).toBe(0);
    expect(settlements).toHaveLength(0);
    expect(summary.perStore[0].outcome).toBe("SKIPPED_LOCKED");
    // Kilit alınamayınca tek SKIPPED_LOCKED satırı (STARTED açılmaz).
    expect(jobLog.rows).toHaveLength(1);
    expect(jobLog.rows[0].payload.outcome).toBe("SKIPPED_LOCKED");
  });
});
