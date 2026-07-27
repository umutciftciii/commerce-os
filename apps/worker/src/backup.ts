/**
 * PB-2/PB-3 — DB backup BullMQ worker + zamanlayıcı (apps/worker).
 *
 * Backup zamanlaması artık burada (api-gateway `setTimeout` zincirinden TAŞINDI):
 *  - Periyodik tetik = BullMQ Job Scheduler (`upsertBackupSchedule`, sabit id → idempotent; worker restart
 *    PARALEL zamanlama üretmez).
 *  - Manuel tetik = api-gateway `POST /internal/backup/run` → `enqueueBackupJob` → aynı worker işler.
 *  - Duplicate/paralel (çok-replika) → advisory lock (jobType=database-backup, storeId=environment) →
 *    kilit alınamayan tur `SKIPPED_LOCKED`.
 *  - API gateway deploy/restart backup takvimini ETKİLEMEZ (zamanlama Redis'te, yürütme worker'da).
 */
import type { Job } from "bullmq";
import type { AppConfig } from "@commerce-os/config";
import type { Logger } from "@commerce-os/logger";
import { createWorker, BACKUP_QUEUE, upsertBackupSchedule, type BackupJobData } from "@commerce-os/queues";
import { prisma, getDefaultAdvisoryLockManager } from "@commerce-os/db";
import {
  loadBackupConfig,
  createBackupCycleRunner,
  buildRealBackupRunner,
  type BackupCycleSummary,
} from "@commerce-os/backup";

export interface BackupWorkerHandle {
  enabled: boolean;
  stop(): Promise<void>;
}

export function startBackupWorker(deps: { config: AppConfig; logger: Logger }): BackupWorkerHandle {
  const { config, logger } = deps;
  const backupConfig = loadBackupConfig(process.env);

  if (!backupConfig.scheduler.enabled) {
    logger.info("database backup worker disabled", { env: "DATABASE_BACKUP_ENABLED" });
    return { enabled: false, stop: async () => {} };
  }

  const runner = createBackupCycleRunner({
    backupConfig,
    logger,
    jobLog: prisma,
    lock: getDefaultAdvisoryLockManager({ logger }).lock,
    runBackupFn: buildRealBackupRunner(backupConfig, logger),
    now: () => new Date(),
  });

  // Backup ağır iş; concurrency 1 (advisory lock zaten çok-replikayı korur).
  const worker = createWorker<BackupJobData>(
    BACKUP_QUEUE,
    config.REDIS_URL,
    async (job: Job<BackupJobData>): Promise<BackupCycleSummary> => {
      const trigger = job.data.trigger ?? "SCHEDULED";
      return runner.runCycle(trigger, { dryRun: job.data.dryRun });
    },
    1,
  );

  worker.on("failed", (job, error) => {
    logger.error("database backup job failed", { jobId: job?.id, error });
  });

  // Zamanlamayı upsert et (idempotent). cron > interval.
  void upsertBackupSchedule(config.REDIS_URL, {
    cron: backupConfig.scheduler.cron,
    everyMs: backupConfig.scheduler.intervalSeconds * 1000,
  }).catch((error) => logger.error("backup schedule upsert failed", { error }));

  logger.info("database backup worker started", {
    queue: BACKUP_QUEUE,
    environment: backupConfig.environment,
    schedule: backupConfig.scheduler.cron ?? `every ${backupConfig.scheduler.intervalSeconds}s`,
    offsite: backupConfig.storage ? "configured" : "NONE",
  });

  return {
    enabled: true,
    async stop() {
      await worker.close();
    },
  };
}
