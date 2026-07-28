/**
 * H-3 pre-ship (ADR-191 revize) — Rezervasyon bakım BullMQ worker + zamanlayıcı (apps/worker).
 *
 * Süpürücü artık api-gateway `setTimeout` zincirinde DEĞİL:
 *  - Periyodik EXPIRY tetiği = BullMQ Job Scheduler (`upsertReservationExpirySchedule`, sabit id →
 *    idempotent; worker restart PARALEL zamanlama üretmez). Yalnız `INVENTORY_RESERVATION_EXPIRY_ENABLED=true`
 *    iken upsert edilir (varsayılan KAPALI → periyodik auto-expiry yok).
 *  - Manuel tetik (expiry|reconcile) = api-gateway `POST .../expiry/run|.../reconcile/run` →
 *    `enqueueInventoryMaintenanceJob` → AYNI worker işler. Consumer HER ZAMAN kayıtlı (manuel ops çalışsın).
 *  - Çok-replika/paralel → servis içi (jobType, storeId) advisory lock → kilit alınamayan tur SKIPPED_LOCKED.
 *  - api-gateway deploy/restart expiry takvimini ETKİLEMEZ (zamanlama Redis'te, yürütme worker'da).
 */
import type { Job } from "bullmq";
import type { AppConfig } from "@commerce-os/config";
import type { Logger } from "@commerce-os/logger";
import { prisma, getDefaultAdvisoryLockManager } from "@commerce-os/db";
import {
  createWorker,
  INVENTORY_MAINTENANCE_QUEUE,
  upsertReservationExpirySchedule,
  type InventoryMaintenanceJobData,
} from "@commerce-os/queues";
import {
  createReservationExpiryService,
  createPrismaReservationExpiryPersistence,
  createReservationReconcileService,
  createPrismaReservationReconcilePersistence,
} from "@commerce-os/inventory";

export interface ReservationMaintenanceWorkerHandle {
  enabled: boolean;
  stop(): Promise<void>;
}

export function startReservationMaintenanceWorker(deps: {
  config: AppConfig;
  logger: Logger;
}): ReservationMaintenanceWorkerHandle {
  const { config, logger } = deps;
  const lock = getDefaultAdvisoryLockManager({ logger }).lock;

  const expiryService = createReservationExpiryService({
    persistence: createPrismaReservationExpiryPersistence(prisma),
    jobLog: prisma,
    logger,
    lock,
    batchSize: config.INVENTORY_RESERVATION_EXPIRY_BATCH_SIZE,
    maxReleasePerRun: config.INVENTORY_RESERVATION_EXPIRY_MAX_RELEASE_PER_RUN,
    orphanDraftMaxAgeMinutes: config.ORPHAN_DRAFT_MAX_AGE_MINUTES,
  });
  const reconcileService = createReservationReconcileService({
    persistence: createPrismaReservationReconcilePersistence(prisma),
    jobLog: prisma,
    logger,
    lock,
    batchSize: config.INVENTORY_RESERVATION_RECONCILE_BATCH_SIZE,
    maxReconcilePerRun: config.INVENTORY_RESERVATION_RECONCILE_MAX_PER_RUN,
  });

  // Consumer HER ZAMAN kayıtlı → manuel expiry/reconcile enabled'dan bağımsız işlenir.
  // Ağır iş + advisory lock zaten çok-replikayı korur → concurrency 1.
  const worker = createWorker<InventoryMaintenanceJobData>(
    INVENTORY_MAINTENANCE_QUEUE,
    config.REDIS_URL,
    async (job: Job<InventoryMaintenanceJobData>) => {
      const { jobType, dryRun, storeId } = job.data;
      if (jobType === "reconcile") {
        // Reconcile VARSAYILAN dry-run; apply yalnız dryRun===false ile explicit.
        return reconcileService.runOnce({ storeId, apply: dryRun === false });
      }
      // Expiry: scheduled/manuel varsayılan APPLY; dryRun===true ise yalnız aday raporlar.
      return expiryService.runOnce({ storeId, apply: dryRun !== true });
    },
    1,
  );

  worker.on("failed", (job, error) => {
    logger.error("reservation maintenance job failed", {
      jobId: job?.id,
      jobType: (job?.data as InventoryMaintenanceJobData | undefined)?.jobType,
      error,
    });
  });

  // Periyodik EXPIRY zamanlaması yalnız açıkça etkinleştirilmişse (idempotent upsert; cron > interval).
  if (config.INVENTORY_RESERVATION_EXPIRY_ENABLED) {
    void upsertReservationExpirySchedule(config.REDIS_URL, {
      cron: config.INVENTORY_RESERVATION_EXPIRY_CRON,
      everyMs: config.INVENTORY_RESERVATION_EXPIRY_INTERVAL_SECONDS * 1000,
    }).catch((error) => logger.error("reservation expiry schedule upsert failed", { error }));
    logger.info("reservation expiry scheduler enabled", {
      schedule:
        config.INVENTORY_RESERVATION_EXPIRY_CRON ?? `every ${config.INVENTORY_RESERVATION_EXPIRY_INTERVAL_SECONDS}s`,
    });
  } else {
    logger.info("reservation expiry scheduler disabled (manual jobs still processed)", {
      env: "INVENTORY_RESERVATION_EXPIRY_ENABLED",
    });
  }

  logger.info("reservation maintenance worker started", { queue: INVENTORY_MAINTENANCE_QUEUE });

  return {
    enabled: config.INVENTORY_RESERVATION_EXPIRY_ENABLED,
    async stop() {
      await worker.close();
    },
  };
}
