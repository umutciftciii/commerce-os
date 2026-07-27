/**
 * PB-2/PB-3 — Backup sağlık/readiness özeti (spec §8, §16).
 *
 * Durum: HEALTHY / DEGRADED / CRITICAL / NOT_CONFIGURED. API secret ya da object key DÖNDÜRMEZ.
 * Kurallar (production = requireOffsiteInProduction):
 *  - offsite config yok → NOT_CONFIGURED (yalnız-local production sağlığı YETERSİZ).
 *  - son başarılı REMOTE backup RPO'yu aştı → CRITICAL (production'da yalnız remoteVerified backup sayılır).
 *  - en son deneme FAILED → DEGRADED.
 *  - restore-verification yapılandırılmamış / eski → DEGRADED (production; §9 — PB-3 kapanmaz).
 *  - remote backup + güncel restore-verification → HEALTHY.
 * Worker downtime sonrası kaçırılmış backup → lastSuccessfulBackupAt yaşlanır → RPO ihlali (CRITICAL) görünür.
 */
import type { BackupConfig } from "./config.js";
import {
  getRecentBackupRuns,
  DATABASE_BACKUP_JOB,
  RESTORE_VERIFICATION_JOB,
  type BackupJobLogClient,
} from "./job-log.js";

export type BackupHealthStatus = "HEALTHY" | "DEGRADED" | "CRITICAL" | "NOT_CONFIGURED";

export interface BackupHealthSummary {
  status: BackupHealthStatus;
  configured: boolean;
  offsiteConfigured: boolean;
  verificationConfigured: boolean;
  /** production-grade istekler (remote-verified backup + verification zorunlu). */
  strict: boolean;
  environment: string;
  lastSuccessfulBackupAt: string | null;
  lastSuccessfulBackupBase: string | null;
  lastFailedBackupAt: string | null;
  lastVerifiedRestoreAt: string | null;
  backupAgeHours: number | null;
  verifyAgeHours: number | null;
  rpoTargetHours: number;
  rtoTargetHours: number;
  restoreVerificationMaxAgeHours: number;
}

/** NOT_CONFIGURED ve CRITICAL readiness açısından "hazır değil" (HTTP 503). */
export function isBackupHealthReady(status: BackupHealthStatus): boolean {
  return status === "HEALTHY" || status === "DEGRADED";
}

function ageHours(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.round(((now.getTime() - new Date(iso).getTime()) / 3_600_000) * 10) / 10;
}

export async function computeBackupHealth(
  db: BackupJobLogClient,
  cfg: BackupConfig,
  now: () => Date = () => new Date(),
): Promise<BackupHealthSummary> {
  const nowD = now();
  const configured = Boolean(cfg.encryptionKey) && Boolean(cfg.databaseUrl);
  const offsiteConfigured = cfg.storage !== null;
  const strict = cfg.requireOffsiteInProduction;
  const verificationConfigured = cfg.scheduler.verifyAfter && Boolean(cfg.scheduler.verifyTargetUrl);

  const backupRuns = await getRecentBackupRuns(db, DATABASE_BACKUP_JOB, 50);
  const verifyRuns = await getRecentBackupRuns(db, RESTORE_VERIFICATION_JOB, 20);

  // production'da yalnız REMOTE-doğrulanmış backup "başarılı" sayılır (local yetersiz).
  const lastSuccess = backupRuns.find(
    (r) => r.outcome === "COMPLETED" && (!strict || r.report.remoteVerified === true),
  );
  const lastFailure = backupRuns.find((r) => r.outcome === "FAILED");
  const lastVerify = verifyRuns.find((r) => r.outcome === "COMPLETED");

  const lastSuccessAt = lastSuccess
    ? ((lastSuccess.report.completedAt as string) ?? lastSuccess.createdAt.toISOString())
    : null;
  const lastVerifyAt = lastVerify
    ? ((lastVerify.report.completedAt as string) ?? lastVerify.createdAt.toISOString())
    : null;
  const backupAgeHours = ageHours(lastSuccessAt, nowD);
  const verifyAgeHours = ageHours(lastVerifyAt, nowD);

  let status: BackupHealthStatus;
  if (!configured || (strict && !offsiteConfigured)) {
    status = "NOT_CONFIGURED";
  } else if (!lastSuccess) {
    status = "CRITICAL";
  } else if (backupAgeHours !== null && backupAgeHours > cfg.rpoTargetHours) {
    status = "CRITICAL";
  } else if (backupRuns[0]?.outcome === "FAILED") {
    status = "DEGRADED";
  } else if (
    strict &&
    (!verificationConfigured ||
      !lastVerify ||
      (verifyAgeHours !== null && verifyAgeHours > cfg.restoreVerificationMaxAgeHours))
  ) {
    status = "DEGRADED";
  } else {
    status = "HEALTHY";
  }

  return {
    status,
    configured,
    offsiteConfigured,
    verificationConfigured,
    strict,
    environment: cfg.environment,
    lastSuccessfulBackupAt: lastSuccessAt,
    lastSuccessfulBackupBase: lastSuccess ? ((lastSuccess.report.base as string) ?? null) : null,
    lastFailedBackupAt: lastFailure
      ? ((lastFailure.report.completedAt as string) ?? lastFailure.createdAt.toISOString())
      : null,
    lastVerifiedRestoreAt: lastVerifyAt,
    backupAgeHours,
    verifyAgeHours,
    rpoTargetHours: cfg.rpoTargetHours,
    rtoTargetHours: cfg.rtoTargetHours,
    restoreVerificationMaxAgeHours: cfg.restoreVerificationMaxAgeHours,
  };
}
