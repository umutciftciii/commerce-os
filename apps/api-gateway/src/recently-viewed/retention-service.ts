/**
 * TODO-161B (ADR-139) — Recently Viewed retention SERVİSİ (DB orkestrasyon; DI-testable).
 *
 * TODO-161A.1 SAF altyapısını YENİDEN KULLANIR ama AYRI domain: `computeCutoff`/`isCircuitBreakerTripped`
 * (pure), dağıtık advisory lock (jobType=recently-viewed-retention), `QueueJobLog` (queueName ayrı).
 * `RETENTION_TABLE_SPECS` allowlist'ine (sponsored/influencer) DOKUNMAZ. Tek tablo: `RecentlyViewedProduct`.
 * Yalnız 90-gün cutoff'u uygular (cap=50 write-time otoritesidir). dry-run varsayılan; apply explicit.
 */
import type { Logger } from "@commerce-os/logger";
import type { Prisma, PrismaClient } from "@prisma/client";
import { computeCutoff, isCircuitBreakerTripped } from "../commercial-automation/retention-core.js";
import type { StoreJobLocker } from "../commercial-automation/advisory-lock.js";
import type { RecentlyViewedRetentionPersistence } from "./retention-persistence.js";

export const RECENTLY_VIEWED_RETENTION_JOB = "recently-viewed-retention";
export const RECENTLY_VIEWED_QUEUE = "recently-viewed";

export type JobLogClient = Pick<PrismaClient, "queueJobLog">;

export interface RecentlyViewedRetentionRunOptions {
  now?: Date;
  storeId?: string;
  apply?: boolean;
}

export interface StoreRetentionReport {
  storeId: string;
  mode: "dry-run" | "apply";
  outcome: "DRY_RUN" | "COMPLETED" | "PARTIAL_SUCCESS" | "SKIPPED_LOCKED";
  cutoff: string;
  candidates: number;
  deleted: number;
  circuitBreakerTripped: boolean;
}

export interface RecentlyViewedRetentionSummary {
  stores: number;
  totalCandidates: number;
  totalDeleted: number;
  mode: "dry-run" | "apply";
  skippedLocked: number;
  perStore: StoreRetentionReport[];
}

export interface RecentlyViewedRetentionServiceConfig {
  retentionDays: number;
  batchSize: number;
  maxDeletePerRun: number;
}

export interface RecentlyViewedRetentionServiceDeps {
  persistence: RecentlyViewedRetentionPersistence;
  jobLog: JobLogClient;
  logger: Logger;
  lock: StoreJobLocker;
  config: RecentlyViewedRetentionServiceConfig;
  clock?: () => Date;
}

export interface RecentlyViewedRetentionService {
  runOnce(options?: RecentlyViewedRetentionRunOptions): Promise<RecentlyViewedRetentionSummary>;
}

async function writeJobLog(
  jobLog: JobLogClient,
  storeId: string,
  status: "PROCESSING" | "COMPLETED" | "FAILED",
  payload: Record<string, unknown>,
): Promise<string> {
  const row = await jobLog.queueJobLog.create({
    data: {
      storeId,
      jobName: RECENTLY_VIEWED_RETENTION_JOB,
      queueName: RECENTLY_VIEWED_QUEUE,
      status,
      attempts: 1,
      payload: payload as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return row.id;
}

export function createRecentlyViewedRetentionService(
  deps: RecentlyViewedRetentionServiceDeps,
): RecentlyViewedRetentionService {
  const { persistence, jobLog, logger, lock, config } = deps;
  const clock = deps.clock ?? (() => new Date());

  return {
    async runOnce(options): Promise<RecentlyViewedRetentionSummary> {
      const now = options?.now ?? new Date();
      const apply = options?.apply === true;
      const mode: "dry-run" | "apply" = apply ? "apply" : "dry-run";
      const trigger = options?.storeId != null ? "MANUAL" : "SCHEDULED";

      const allStores = await persistence.listStoreScope();
      const storeIds = options?.storeId ? allStores.filter((s) => s === options.storeId) : allStores;

      const summary: RecentlyViewedRetentionSummary = {
        stores: 0,
        totalCandidates: 0,
        totalDeleted: 0,
        mode,
        skippedLocked: 0,
        perStore: [],
      };

      for (const storeId of storeIds) {
        const lockResult = await lock(RECENTLY_VIEWED_RETENTION_JOB, storeId, async () => {
          const startedAt = clock();
          const cutoff = computeCutoff(now, config.retentionDays);
          const candidates = await persistence.countExpired(storeId, cutoff);

          let deleted = 0;
          let tripped = false;
          if (apply && candidates > 0) {
            if (isCircuitBreakerTripped(candidates, config.maxDeletePerRun)) {
              tripped = true;
              logger.warn("recently-viewed retention circuit breaker tripped — apply skipped", {
                storeId,
                candidates,
                maxDeletePerRun: config.maxDeletePerRun,
              });
            } else {
              const maxBatches = Math.ceil(candidates / config.batchSize) + 1;
              for (let i = 0; i < maxBatches; i += 1) {
                const removed = await persistence.deleteExpiredBatch(storeId, cutoff, config.batchSize);
                deleted += removed;
                if (removed < config.batchSize) break;
              }
            }
          }

          const outcome: StoreRetentionReport["outcome"] = mode === "dry-run" ? "DRY_RUN" : tripped ? "PARTIAL_SUCCESS" : "COMPLETED";
          const report: StoreRetentionReport = { storeId, mode, outcome, cutoff: cutoff.toISOString(), candidates, deleted, circuitBreakerTripped: tripped };
          const completedAt = clock();
          // QueueJobStatus enum COMPLETED; ince durum payload.outcome'da (DRY_RUN/PARTIAL_SUCCESS/…).
          await writeJobLog(jobLog, storeId, "COMPLETED", {
            outcome,
            trigger,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            durationMs: completedAt.getTime() - startedAt.getTime(),
            mode,
            cutoff: cutoff.toISOString(),
            candidates,
            deleted,
            circuitBreakerTripped: tripped,
          });
          return report;
        });

        if (!lockResult.acquired) {
          const at = clock();
          await writeJobLog(jobLog, storeId, "COMPLETED", {
            outcome: "SKIPPED_LOCKED",
            trigger,
            startedAt: at.toISOString(),
            completedAt: at.toISOString(),
            durationMs: 0,
          });
          summary.skippedLocked += 1;
          summary.stores += 1;
          summary.perStore.push({ storeId, mode, outcome: "SKIPPED_LOCKED", cutoff: "", candidates: 0, deleted: 0, circuitBreakerTripped: false });
          logger.warn("recently-viewed retention store skipped (locked)", { storeId });
          continue;
        }

        const report = lockResult.result;
        summary.stores += 1;
        summary.totalCandidates += report.candidates;
        summary.totalDeleted += report.deleted;
        summary.perStore.push(report);
      }

      return summary;
    },
  };
}
