/**
 * PB-2/PB-3 — Backup/restore-verification job-run audit'i (QueueJobLog reuse; yeni tablo YOK).
 *
 * PB-2/PB-3 hardening: `apps/api-gateway/src/backup/job-log.ts`'ten @commerce-os/backup'a TAŞINDI → backup
 * job'u artık `apps/worker` sürecinde çalıştığından hem worker hem api-gateway (status/health) AYNI helper'ları
 * paylaşır. İnce durum `payload.outcome` (STARTED/COMPLETED/FAILED/SKIPPED_LOCKED/DRY_RUN); enum kolonu eşlenir.
 * Backup GLOBAL bir iştir (store-scoped değil) → storeId null. Secret ASLA payload'a yazılmaz.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

export const BACKUP_QUEUE = "database-backup";
export const DATABASE_BACKUP_JOB = "database-backup";
export const RESTORE_VERIFICATION_JOB = "database-restore-verification";

export type BackupJobName = typeof DATABASE_BACKUP_JOB | typeof RESTORE_VERIFICATION_JOB;
export type BackupJobTrigger = "MANUAL" | "SCHEDULED";
export type BackupJobOutcome = "STARTED" | "COMPLETED" | "FAILED" | "SKIPPED_LOCKED" | "DRY_RUN";

export type BackupJobLogClient = Pick<PrismaClient, "queueJobLog">;

function outcomeToStatus(outcome: BackupJobOutcome): "PROCESSING" | "COMPLETED" | "FAILED" {
  if (outcome === "STARTED") return "PROCESSING";
  if (outcome === "FAILED") return "FAILED";
  return "COMPLETED";
}

export async function startBackupRun(
  db: BackupJobLogClient,
  input: { jobName: BackupJobName; trigger: BackupJobTrigger; startedAt: Date; environment: string },
): Promise<string> {
  const row = await db.queueJobLog.create({
    data: {
      storeId: null,
      jobName: input.jobName,
      queueName: BACKUP_QUEUE,
      status: "PROCESSING",
      attempts: 1,
      payload: {
        outcome: "STARTED",
        trigger: input.trigger,
        environment: input.environment,
        startedAt: input.startedAt.toISOString(),
      } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return row.id;
}

export async function finishBackupRun(
  db: BackupJobLogClient,
  id: string,
  input: {
    outcome: Exclude<BackupJobOutcome, "STARTED">;
    trigger: BackupJobTrigger;
    environment: string;
    startedAt: Date;
    completedAt: Date;
    report: Record<string, unknown>;
    error?: { name: string; message: string };
  },
): Promise<void> {
  await db.queueJobLog.update({
    where: { id },
    data: {
      status: outcomeToStatus(input.outcome),
      payload: {
        outcome: input.outcome,
        trigger: input.trigger,
        environment: input.environment,
        startedAt: input.startedAt.toISOString(),
        completedAt: input.completedAt.toISOString(),
        durationMs: input.completedAt.getTime() - input.startedAt.getTime(),
        ...input.report,
      } as Prisma.InputJsonValue,
      error: input.error === undefined ? undefined : (input.error as unknown as Prisma.InputJsonValue),
    },
  });
}

export async function recordSkippedLockedBackupRun(
  db: BackupJobLogClient,
  input: { jobName: BackupJobName; trigger: BackupJobTrigger; environment: string; startedAt: Date; completedAt: Date },
): Promise<void> {
  await db.queueJobLog.create({
    data: {
      storeId: null,
      jobName: input.jobName,
      queueName: BACKUP_QUEUE,
      status: "COMPLETED",
      attempts: 1,
      payload: {
        outcome: "SKIPPED_LOCKED",
        trigger: input.trigger,
        environment: input.environment,
        startedAt: input.startedAt.toISOString(),
        completedAt: input.completedAt.toISOString(),
        durationMs: input.completedAt.getTime() - input.startedAt.getTime(),
      } as Prisma.InputJsonValue,
    },
  });
}

export interface BackupRunRow {
  id: string;
  jobName: string;
  outcome: BackupJobOutcome | string;
  report: Record<string, unknown>;
  createdAt: Date;
}

export async function getRecentBackupRuns(
  db: BackupJobLogClient,
  jobName: BackupJobName,
  limit = 20,
): Promise<BackupRunRow[]> {
  const rows = await db.queueJobLog.findMany({
    where: { jobName, queueName: BACKUP_QUEUE },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      jobName: row.jobName,
      outcome: (payload.outcome as string) ?? row.status,
      report: payload,
      createdAt: row.createdAt,
    };
  });
}

/** En son BAŞARILI backup zamanı (job başında RPO-gap gözlemi + health için). */
export async function getLastSuccessfulBackupAt(db: BackupJobLogClient): Promise<Date | null> {
  const runs = await getRecentBackupRuns(db, DATABASE_BACKUP_JOB, 50);
  const success = runs.find((r) => r.outcome === "COMPLETED");
  if (!success) return null;
  const completedAt = success.report.completedAt as string | undefined;
  return completedAt ? new Date(completedAt) : success.createdAt;
}
