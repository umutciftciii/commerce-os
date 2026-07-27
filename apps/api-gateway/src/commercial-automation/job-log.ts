/**
 * TODO-161A.1 (ADR-131/136) — Job-run audit/görünürlük. Mevcut `QueueJobLog` modeli (şemada VARDI ama
 * yazılmıyordu) burada kullanılır → yeni tablo/migration YOK.
 *
 * DURUM AYRIMI (payload.outcome): STARTED · COMPLETED · PARTIAL_SUCCESS · FAILED · SKIPPED_LOCKED · DRY_RUN.
 * QueueJobStatus enum yalnız PENDING/PROCESSING/COMPLETED/FAILED/RETRYING taşıdığından ince durum
 * `payload.outcome`'da tutulur; enum kolonu eşlenir (STARTED→PROCESSING; FAILED→FAILED; diğerleri→COMPLETED).
 *
 * DUPLICATE LOG YOK: her (store, run) için TEK satır. Kilit alınmış tur `startJobRun` ile PROCESSING/STARTED
 * satırı açar, `finishJobRun` ile AYNI satırı terminal duruma GÜNCELLER (yeni satır değil). Kilit alınamayan
 * tur tek `recordSkippedLockedRun` satırı yazar. startedAt/completedAt/durationMs payload'da.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

export const COMMERCIAL_AUTOMATION_QUEUE = "commercial-automation";
export const SETTLEMENT_SCHEDULER_JOB = "sponsorship-settlement-scheduler";
export const ATTRIBUTION_RETENTION_JOB = "attribution-event-retention";

export type CommercialAutomationJobName =
  | typeof SETTLEMENT_SCHEDULER_JOB
  | typeof ATTRIBUTION_RETENTION_JOB;

export type JobTrigger = "MANUAL" | "SCHEDULED";

export type JobOutcome =
  | "STARTED"
  | "COMPLETED"
  | "PARTIAL_SUCCESS"
  | "FAILED"
  | "SKIPPED_LOCKED"
  | "DRY_RUN";

/** Terminal (STARTED hariç) outcome'lar — job-run bir tura ait nihai durum. */
export type TerminalJobOutcome = Exclude<JobOutcome, "STARTED">;

/** QueueJobLog yazma/okuma için gereken minimum prisma yüzeyi (fake ile test edilebilir). */
export type JobLogClient = Pick<PrismaClient, "queueJobLog">;

function outcomeToStatus(outcome: JobOutcome): "PROCESSING" | "COMPLETED" | "FAILED" {
  if (outcome === "STARTED") return "PROCESSING";
  if (outcome === "FAILED") return "FAILED";
  return "COMPLETED";
}

export interface StartJobRunInput {
  storeId: string;
  jobName: CommercialAutomationJobName;
  trigger: JobTrigger;
  startedAt: Date;
}

/** İşlenmeye başlanan store için PROCESSING/STARTED satırı açar; id döndürür (finishJobRun ile güncellenir). */
export async function startJobRun(db: JobLogClient, input: StartJobRunInput): Promise<string> {
  const row = await db.queueJobLog.create({
    data: {
      storeId: input.storeId,
      jobName: input.jobName,
      queueName: COMMERCIAL_AUTOMATION_QUEUE,
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
  /** Yapısal rapor (candidate/created/deleted/skipped/failed/cutoff/period …). */
  report: unknown;
  /** Güvenli hata özeti (mesaj/kod; asla ham payload/gizli). */
  error?: unknown;
}

/** startJobRun ile açılan satırı AYNI kaydı güncelleyerek terminal duruma taşır (duplicate satır YOK). */
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
        ...(input.report && typeof input.report === "object" ? (input.report as Record<string, unknown>) : { report: input.report }),
      } as Prisma.InputJsonValue,
      error: input.error === undefined ? undefined : (input.error as Prisma.InputJsonValue),
    },
  });
}

export interface SkippedLockedInput {
  storeId: string;
  jobName: CommercialAutomationJobName;
  trigger: JobTrigger;
  startedAt: Date;
  completedAt: Date;
}

/** Kilit alınamadığı için işlenmeyen store için TEK SKIPPED_LOCKED satırı. */
export async function recordSkippedLockedRun(db: JobLogClient, input: SkippedLockedInput): Promise<void> {
  await db.queueJobLog.create({
    data: {
      storeId: input.storeId,
      jobName: input.jobName,
      queueName: COMMERCIAL_AUTOMATION_QUEUE,
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
  jobName: string;
  status: string;
  attempts: number;
  report: unknown;
  error: unknown;
  createdAt: Date;
}

/** Bir store için verilen job adının EN SON çalışmasını döndürür (görünürlük paneli). */
export async function getLatestJobRun(
  db: JobLogClient,
  storeId: string,
  jobName: CommercialAutomationJobName,
): Promise<JobRunRow | null> {
  const row = await db.queueJobLog.findFirst({
    where: { storeId, jobName, queueName: COMMERCIAL_AUTOMATION_QUEUE },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  return {
    id: row.id,
    jobName: row.jobName,
    status: row.status,
    attempts: row.attempts,
    report: row.payload,
    error: row.error,
    createdAt: row.createdAt,
  };
}
