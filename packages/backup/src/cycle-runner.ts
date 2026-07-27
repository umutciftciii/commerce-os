/**
 * PB-2/PB-3 — Backup tur çekirdeği (advisory lock + job-log + retention + opsiyonel verify).
 *
 * PB-2/PB-3 hardening: `apps/api-gateway/src/backup/worker.ts`'ten @commerce-os/backup'a TAŞINDI ve
 * genelleştirildi. Hem `apps/worker` (BullMQ scheduled/manuel job) hem api-gateway (manuel enqueue öncesi
 * DEĞİL — artık worker'a delege) bu çekirdeği paylaşır. Advisory lock manuel/scheduled + çok-replika
 * çakışmasını çözer (kilit yoksa SKIPPED_LOCKED).
 *
 * TUR SIRASI (spec §7): advisory lock → job STARTED → runBackup(config validation → pg_dump → non-zero/archive
 * validation → encrypt → checksum → manifest → remote upload → remote HEAD/checksum) → job COMPLETED →
 * retention (dry-run/apply) → (opsiyonel) restore-verification → cleanup (runBackup finally) → lock release.
 * Upload/HEAD başarısızsa runBackup THROW eder → COMPLETED sayılmaz (FAILED).
 */
import path from "node:path";
import type { Logger } from "@commerce-os/logger";
import type { StoreJobLocker } from "@commerce-os/db";
import type { BackupConfig } from "./config.js";
import { resolvePgRunner, resolveStorageAdapter } from "./config.js";
import { runBackup } from "./backup-service.js";
import { runRestoreVerification } from "./verify-service.js";
import { runRetention } from "./retention-service.js";
import { readMigrationInfo } from "./migration-info.js";
import { redactError } from "./redaction.js";
import {
  startBackupRun,
  finishBackupRun,
  recordSkippedLockedBackupRun,
  getLastSuccessfulBackupAt,
  DATABASE_BACKUP_JOB,
  RESTORE_VERIFICATION_JOB,
  type BackupJobLogClient,
  type BackupJobTrigger,
} from "./job-log.js";

export const BACKUP_LOCK_JOB_TYPE = "database-backup";

export interface BackupCycleSummary {
  outcome: "COMPLETED" | "FAILED" | "SKIPPED_LOCKED" | "DRY_RUN";
  base: string | null;
  remoteVerified: boolean;
  verificationOk: boolean | null;
}

export type BackupRunnerFn = (
  dryRun: boolean,
) => Promise<{ base: string; remoteVerified: boolean; report: Record<string, unknown> }>;

export interface BackupCycleDeps {
  backupConfig: BackupConfig;
  logger: Logger;
  jobLog: BackupJobLogClient;
  lock: StoreJobLocker;
  runBackupFn: BackupRunnerFn;
  now: () => Date;
}

export interface BackupCycleRunner {
  runCycle(trigger: BackupJobTrigger, opts?: { dryRun?: boolean }): Promise<BackupCycleSummary>;
}

export function createBackupCycleRunner(deps: BackupCycleDeps): BackupCycleRunner {
  const { backupConfig, logger, jobLog, lock, runBackupFn, now } = deps;
  const secrets = [backupConfig.databaseUrl, backupConfig.encryptionKey, backupConfig.storage?.secretAccessKey];

  async function maybeRetention(): Promise<Record<string, unknown> | null> {
    const storage = resolveStorageAdapter(backupConfig, { localFallbackDir: backupConfig.localDir });
    if (!storage) return null;
    try {
      const report = await runRetention({
        offsite: storage,
        prefix: backupConfig.storage?.prefix ?? "",
        policy: backupConfig.retention,
        dryRun: !backupConfig.scheduler.retentionApplyAfterBackup,
        logger,
      });
      return { dryRun: report.dryRun, retained: report.offsite.retained.length, purged: report.offsite.purged.length };
    } catch (error) {
      logger.error("retention after backup failed", { error: redactError(error, secrets) });
      return { error: "RETENTION_FAILED" };
    }
  }

  async function maybeVerify(base: string | null): Promise<boolean | null> {
    if (!backupConfig.scheduler.verifyAfter) return null;
    if (!backupConfig.scheduler.verifyTargetUrl) {
      logger.warn("verifyAfter set ama DATABASE_BACKUP_VERIFY_TARGET_URL yok — doğrulama atlandı", {});
      return null;
    }
    const vStart = now();
    const vid = await startBackupRun(jobLog, {
      jobName: RESTORE_VERIFICATION_JOB,
      trigger: "SCHEDULED",
      startedAt: vStart,
      environment: backupConfig.environment,
    });
    try {
      const pg = resolvePgRunner(backupConfig);
      const storage = resolveStorageAdapter(backupConfig, { localFallbackDir: backupConfig.localDir });
      const report = await runRestoreVerification(
        { pg, storage, logger, now },
        {
          restore: {
            file: base ? path.join(backupConfig.localDir, `${base}.dump.enc`) : undefined,
            encryptionKey: backupConfig.encryptionKey!,
            targetUrl: backupConfig.scheduler.verifyTargetUrl,
            format: backupConfig.pg.format,
            guard: { confirmDestructive: true, currentDatabaseUrl: backupConfig.databaseUrl },
          },
        },
      );
      await finishBackupRun(jobLog, vid, {
        outcome: report.ok ? "COMPLETED" : "FAILED",
        trigger: "SCHEDULED",
        environment: backupConfig.environment,
        startedAt: vStart,
        completedAt: now(),
        report: { ok: report.ok, tables: report.tables.length, failures: report.failures },
      });
      return report.ok;
    } catch (error) {
      await finishBackupRun(jobLog, vid, {
        outcome: "FAILED",
        trigger: "SCHEDULED",
        environment: backupConfig.environment,
        startedAt: vStart,
        completedAt: now(),
        report: {},
        error: redactError(error, secrets),
      });
      return false;
    }
  }

  async function runCycle(trigger: BackupJobTrigger, opts: { dryRun?: boolean } = {}): Promise<BackupCycleSummary> {
    const startedAt = now();
    // Job başında önceki başarılı backup zamanı (RPO-gap gözlemi).
    const previousSuccessAt = await getLastSuccessfulBackupAt(jobLog).catch(() => null);

    const outcome = await lock(BACKUP_LOCK_JOB_TYPE, backupConfig.environment, async (): Promise<BackupCycleSummary> => {
      const id = await startBackupRun(jobLog, {
        jobName: DATABASE_BACKUP_JOB,
        trigger,
        startedAt,
        environment: backupConfig.environment,
      });
      if (opts.dryRun) {
        const res = await runBackupFn(true);
        await finishBackupRun(jobLog, id, {
          outcome: "DRY_RUN",
          trigger,
          environment: backupConfig.environment,
          startedAt,
          completedAt: now(),
          report: { ...res.report, previousSuccessAt: previousSuccessAt?.toISOString() ?? null },
        });
        return { outcome: "DRY_RUN", base: res.base, remoteVerified: false, verificationOk: null };
      }
      try {
        const res = await runBackupFn(false);
        const retention = await maybeRetention();
        await finishBackupRun(jobLog, id, {
          outcome: "COMPLETED",
          trigger,
          environment: backupConfig.environment,
          startedAt,
          completedAt: now(),
          report: { ...res.report, retention, previousSuccessAt: previousSuccessAt?.toISOString() ?? null },
        });
        const verificationOk = await maybeVerify(res.base);
        return { outcome: "COMPLETED", base: res.base, remoteVerified: res.remoteVerified, verificationOk };
      } catch (error) {
        await finishBackupRun(jobLog, id, {
          outcome: "FAILED",
          trigger,
          environment: backupConfig.environment,
          startedAt,
          completedAt: now(),
          report: {},
          error: redactError(error, secrets),
        });
        logger.error("database backup failed", { environment: backupConfig.environment });
        return { outcome: "FAILED", base: null, remoteVerified: false, verificationOk: null };
      }
    });

    if (!outcome.acquired) {
      await recordSkippedLockedBackupRun(jobLog, {
        jobName: DATABASE_BACKUP_JOB,
        trigger,
        environment: backupConfig.environment,
        startedAt,
        completedAt: now(),
      });
      return { outcome: "SKIPPED_LOCKED", base: null, remoteVerified: false, verificationOk: null };
    }
    return outcome.result;
  }

  return { runCycle };
}

/** Gerçek backup çalıştırıcı — pg + storage + runBackup çekirdeğini bağlar (secret'siz rapor). */
export function buildRealBackupRunner(backupConfig: BackupConfig, logger: Logger): BackupRunnerFn {
  const migrationsDir =
    process.env.DATABASE_BACKUP_MIGRATIONS_DIR ?? path.join(process.cwd(), "packages/db/prisma/migrations");
  return async (dryRun: boolean) => {
    const pg = resolvePgRunner(backupConfig);
    const storage = resolveStorageAdapter(backupConfig);
    const migrationInfo = await readMigrationInfo(migrationsDir);
    const result = await runBackup(
      {
        cfg: backupConfig,
        pg,
        storage,
        logger,
        now: () => new Date(),
        appCommitSha: process.env.GIT_COMMIT_SHA ?? process.env.COMMIT_SHA ?? null,
        migrationInfo,
      },
      { dryRun },
    );
    return {
      base: result.base,
      remoteVerified: result.remoteVerified,
      report: {
        base: result.base,
        outcome: result.outcome,
        encryptedSize: result.encryptedSize,
        checksumSha256: result.checksumSha256,
        dumpObjectKey: result.dumpObjectKey,
        postgresVersion: result.postgresVersion,
        migration: result.migration,
        remoteVerified: result.remoteVerified,
        storageDescribe: result.storageDescribe,
        timings: result.timings,
      },
    };
  };
}
