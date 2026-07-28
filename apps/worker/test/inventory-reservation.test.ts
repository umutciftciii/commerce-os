/**
 * H-3 pre-ship (§11 worker scheduler) — reservation maintenance worker davranış testleri (mock'lu).
 * Kapsam: consumer HER ZAMAN kayıtlı · schedule upsert YALNIZ enabled iken · disabled → upsert yok ·
 * processor dispatch (expiry vs reconcile + dryRun apply semantiği).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const upsertSpy = vi.fn(async () => {});
const createWorkerSpy = vi.fn();
const expiryRunOnce = vi.fn(async () => ({ ok: "expiry" }));
const reconcileRunOnce = vi.fn(async () => ({ ok: "reconcile" }));

vi.mock("@commerce-os/queues", () => ({
  INVENTORY_MAINTENANCE_QUEUE: "inventory-maintenance",
  createWorker: (_name: string, _url: string, processor: unknown) => {
    createWorkerSpy(processor);
    return { on: vi.fn(), close: vi.fn(async () => {}) };
  },
  upsertReservationExpirySchedule: upsertSpy,
}));

vi.mock("@commerce-os/db", () => ({
  prisma: {},
  getDefaultAdvisoryLockManager: () => ({ lock: vi.fn() }),
}));

vi.mock("@commerce-os/inventory", () => ({
  createReservationExpiryService: () => ({ runOnce: expiryRunOnce }),
  createPrismaReservationExpiryPersistence: () => ({}),
  createReservationReconcileService: () => ({ runOnce: reconcileRunOnce }),
  createPrismaReservationReconcilePersistence: () => ({}),
}));

const { startReservationMaintenanceWorker } = await import("../src/inventory-reservation.js");

const noopLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

function cfg(enabled: boolean) {
  return {
    REDIS_URL: "redis://x",
    INVENTORY_RESERVATION_EXPIRY_ENABLED: enabled,
    INVENTORY_RESERVATION_EXPIRY_INTERVAL_SECONDS: 300,
    INVENTORY_RESERVATION_EXPIRY_CRON: undefined,
    INVENTORY_RESERVATION_EXPIRY_BATCH_SIZE: 500,
    INVENTORY_RESERVATION_EXPIRY_MAX_RELEASE_PER_RUN: 100000,
    INVENTORY_RESERVATION_RECONCILE_BATCH_SIZE: 500,
    INVENTORY_RESERVATION_RECONCILE_MAX_PER_RUN: 100000,
    ORPHAN_DRAFT_MAX_AGE_MINUTES: 1440,
  } as never;
}

beforeEach(() => {
  upsertSpy.mockClear();
  createWorkerSpy.mockClear();
  expiryRunOnce.mockClear();
  reconcileRunOnce.mockClear();
});

describe("reservation maintenance worker", () => {
  it("enabled: consumer kayıtlı + schedule upsert edilir", () => {
    const handle = startReservationMaintenanceWorker({ config: cfg(true), logger: noopLogger });
    expect(handle.enabled).toBe(true);
    expect(createWorkerSpy).toHaveBeenCalledTimes(1); // consumer her zaman
    expect(upsertSpy).toHaveBeenCalledTimes(1); // schedule yalnız enabled
  });

  it("disabled: consumer yine kayıtlı ama schedule upsert EDİLMEZ", () => {
    const handle = startReservationMaintenanceWorker({ config: cfg(false), logger: noopLogger });
    expect(handle.enabled).toBe(false);
    expect(createWorkerSpy).toHaveBeenCalledTimes(1); // manuel job'lar yine işlenir
    expect(upsertSpy).not.toHaveBeenCalled(); // periyodik auto-expiry yok
  });

  it("processor: expiry job → expiryService (dryRun!==true → apply)", async () => {
    startReservationMaintenanceWorker({ config: cfg(false), logger: noopLogger });
    const processor = createWorkerSpy.mock.calls[0][0] as (j: { data: unknown }) => Promise<unknown>;
    await processor({ data: { jobType: "expiry", trigger: "SCHEDULED", storeId: "s1" } });
    expect(expiryRunOnce).toHaveBeenCalledWith({ storeId: "s1", apply: true });
    await processor({ data: { jobType: "expiry", trigger: "MANUAL", storeId: "s1", dryRun: true } });
    expect(expiryRunOnce).toHaveBeenLastCalledWith({ storeId: "s1", apply: false });
  });

  it("processor: reconcile job → reconcileService (yalnız dryRun===false → apply)", async () => {
    startReservationMaintenanceWorker({ config: cfg(false), logger: noopLogger });
    const processor = createWorkerSpy.mock.calls[0][0] as (j: { data: unknown }) => Promise<unknown>;
    await processor({ data: { jobType: "reconcile", trigger: "MANUAL", storeId: "s1", dryRun: true } });
    expect(reconcileRunOnce).toHaveBeenLastCalledWith({ storeId: "s1", apply: false });
    await processor({ data: { jobType: "reconcile", trigger: "MANUAL", storeId: "s1", dryRun: false } });
    expect(reconcileRunOnce).toHaveBeenLastCalledWith({ storeId: "s1", apply: true });
  });
});
