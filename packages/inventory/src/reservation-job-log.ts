/**
 * H-3 (ADR-191) — inventory-reservation-expiry job-run audit. Mevcut `QueueJobLog` modeli kullanılır
 * (yeni tablo YOK). commercial-automation/job-log.ts deseniyle birebir; ayrı queue/job adı.
 * TEK satır/tur: startJobRun (PROCESSING/STARTED) → finishJobRun (terminal update). Kilit alınamazsa
 * tek recordSkippedLockedRun satırı.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

export const INVENTORY_MAINTENANCE_QUEUE = "inventory-maintenance";
export const INVENTORY_RESERVATION_EXPIRY_JOB = "inventory-reservation-expiry";

export type JobTrigger = "MANUAL" | "SCHEDULED";

export type JobOutcome =
  | "STARTED"
  | "COMPLETED"
  | "PARTIAL_SUCCESS"
  | "FAILED"
  | "SKIPPED_LOCKED"
  | "CIRCUIT_BROKEN"
  | "DRY_RUN";

export type TerminalJobOutcome = Exclude<JobOutcome, "STARTED">;

export type JobLogClient = Pick<PrismaClient, "queueJobLog">;

function outcomeToStatus(outcome: JobOutcome): "PROCESSING" | "COMPLETED" | "FAILED" {
  if (outcome === "STARTED") return "PROCESSING";
  if (outcome === "FAILED") return "FAILED";
  return "COMPLETED";
}

export interface StartJobRunInput {
  storeId: string;
  trigger: JobTrigger;
  startedAt: Date;
  /** İş adı (varsayılan expiry; reconcile açıkça geçer). Aynı `inventory-maintenance` queue. */
  jobName?: string;
}

export async function startJobRun(db: JobLogClient, input: StartJobRunInput): Promise<string> {
  const row = await db.queueJobLog.create({
    data: {
      storeId: input.storeId,
      jobName: input.jobName ?? INVENTORY_RESERVATION_EXPIRY_JOB,
      queueName: INVENTORY_MAINTENANCE_QUEUE,
      status: "PROCESSING",
      attempts: 1,
      payload: {
        outcome: "STARTED",
        trigger: input.trigger,
        startedAt: input.startedAt.toISOString(),
      } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return row.id;
}

export interface FinishJobRunInput {
  outcome: TerminalJobOutcome;
  trigger: JobTrigger;
  startedAt: Date;
  completedAt: Date;
  report: unknown;
  error?: unknown;
  /** finishJobRun id ile günceller; jobName gerekmez (uyumluluk için opsiyonel, yok sayılır). */
  jobName?: string;
}

export async function finishJobRun(db: JobLogClient, id: string, input: FinishJobRunInput): Promise<void> {
  const durationMs = input.completedAt.getTime() - input.startedAt.getTime();
  await db.queueJobLog.update({
    where: { id },
    data: {
      status: outcomeToStatus(input.outcome),
      payload: {
        outcome: input.outcome,
        trigger: input.trigger,
        startedAt: input.startedAt.toISOString(),
        completedAt: input.completedAt.toISOString(),
        durationMs,
        ...(input.report && typeof input.report === "object"
          ? (input.report as Record<string, unknown>)
          : { report: input.report }),
      } as Prisma.InputJsonValue,
      error: input.error === undefined ? undefined : (input.error as Prisma.InputJsonValue),
    },
  });
}

export interface SkippedLockedInput {
  storeId: string;
  trigger: JobTrigger;
  startedAt: Date;
  completedAt: Date;
  jobName?: string;
}

export async function recordSkippedLockedRun(db: JobLogClient, input: SkippedLockedInput): Promise<void> {
  await db.queueJobLog.create({
    data: {
      storeId: input.storeId,
      jobName: input.jobName ?? INVENTORY_RESERVATION_EXPIRY_JOB,
      queueName: INVENTORY_MAINTENANCE_QUEUE,
      status: "COMPLETED",
      attempts: 1,
      payload: {
        outcome: "SKIPPED_LOCKED",
        trigger: input.trigger,
        startedAt: input.startedAt.toISOString(),
        completedAt: input.completedAt.toISOString(),
        durationMs: input.completedAt.getTime() - input.startedAt.getTime(),
      } as Prisma.InputJsonValue,
    },
  });
}

export interface JobRunRow {
  id: string;
  status: string;
  report: unknown;
  error: unknown;
  createdAt: Date;
}

export async function getLatestJobRun(
  db: JobLogClient,
  storeId: string,
  jobName: string = INVENTORY_RESERVATION_EXPIRY_JOB,
): Promise<JobRunRow | null> {
  const row = await db.queueJobLog.findFirst({
    where: { storeId, jobName, queueName: INVENTORY_MAINTENANCE_QUEUE },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  return { id: row.id, status: row.status, report: row.payload, error: row.error, createdAt: row.createdAt };
}
