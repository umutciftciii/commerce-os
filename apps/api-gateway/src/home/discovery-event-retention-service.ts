/**
 * TODO-162 (ADR-205) — Home Discovery event retention SERVİSİ (DB orkestrasyon; DI-testable).
 *
 * TODO-161A.1 SAF altyapısını YENİDEN KULLANIR ama AYRI domain: `computeCutoff`/`isCircuitBreakerTripped`
 * (pure), dağıtık advisory lock (jobType=home-discovery-event-retention), `QueueJobLog` (queueName ayrı).
 * `RETENTION_TABLE_SPECS` allowlist'ine (sponsored/influencer/recommendation) DOKUNMAZ. Tek tablo:
 * `HomeDiscoveryEvent`. Korunacak finansal kayıt yok (yalnız davranış event'i). dry-run varsayılan; apply
 * explicit. 180 gün cutoff. Recommendation retention servisiyle birebir simetrik (ayrı jobType/queueName).
 */
import type { Logger } from "@commerce-os/logger";
import type { Prisma, PrismaClient } from "@prisma/client";
import { computeCutoff, isCircuitBreakerTripped } from "../commercial-automation/retention-core.js";
import type { StoreJobLocker } from "../commercial-automation/advisory-lock.js";
import type { WorkerCapabilityGate } from "../capabilities/worker-gate.js";
import type { DiscoveryEventRetentionPersistence } from "./discovery-event-retention-persistence.js";

export const HOME_DISCOVERY_EVENT_RETENTION_JOB = "home-discovery-event-retention";
export const HOME_DISCOVERY_EVENT_QUEUE = "home-discovery-events";

export type JobLogClient = Pick<PrismaClient, "queueJobLog">;

export interface DiscoveryEventRetentionRunOptions {
  now?: Date;
  storeId?: string;
  apply?: boolean;
}

export interface StoreRetentionReport {
  storeId: string;
  mode: "dry-run" | "apply";
  outcome: "DRY_RUN" | "COMPLETED" | "PARTIAL_SUCCESS" | "SKIPPED_LOCKED" | "SKIPPED_DISABLED";
  cutoff: string;
  candidates: number;
  deleted: number;
  circuitBreakerTripped: boolean;
}

export interface DiscoveryEventRetentionSummary {
  stores: number;
  totalCandidates: number;
  totalDeleted: number;
  mode: "dry-run" | "apply";
  skippedLocked: number;
  // TODO-163 Faz 3 (TD-153) — HOME_EXPERIENCE kapalı store'lar için atlanan tur sayısı.
  skippedDisabled: number;
  perStore: StoreRetentionReport[];
}

export interface DiscoveryEventRetentionServiceConfig {
  retentionDays: number;
  batchSize: number;
  maxDeletePerRun: number;
}

export interface DiscoveryEventRetentionServiceDeps {
  persistence: DiscoveryEventRetentionPersistence;
  jobLog: JobLogClient;
  logger: Logger;
  lock: StoreJobLocker;
  config: DiscoveryEventRetentionServiceConfig;
  clock?: () => Date;
  // TODO-163 Faz 3 (TD-153) — verildiyse: HOME_EXPERIENCE kapalı store'da tur ATLANIR (SKIPPED_DISABLED).
  capabilityGate?: WorkerCapabilityGate;
}

export interface DiscoveryEventRetentionService {
  runOnce(options?: DiscoveryEventRetentionRunOptions): Promise<DiscoveryEventRetentionSummary>;
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
      jobName: HOME_DISCOVERY_EVENT_RETENTION_JOB,
      queueName: HOME_DISCOVERY_EVENT_QUEUE,
      status,
      attempts: 1,
      payload: payload as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return row.id;
}

export function createDiscoveryEventRetentionService(
  deps: DiscoveryEventRetentionServiceDeps,
): DiscoveryEventRetentionService {
  const { persistence, jobLog, logger, lock, config } = deps;
  const clock = deps.clock ?? (() => new Date());

  return {
    async runOnce(options): Promise<DiscoveryEventRetentionSummary> {
      const now = options?.now ?? new Date();
      const apply = options?.apply === true;
      const mode: "dry-run" | "apply" = apply ? "apply" : "dry-run";
      const trigger = options?.storeId != null ? "MANUAL" : "SCHEDULED";

      const allStores = await persistence.listStoreScope();
      const storeIds = options?.storeId ? allStores.filter((s) => s === options.storeId) : allStores;

      const summary: DiscoveryEventRetentionSummary = {
        stores: 0,
        totalCandidates: 0,
        totalDeleted: 0,
        mode,
        skippedLocked: 0,
        skippedDisabled: 0,
        perStore: [],
      };

      for (const storeId of storeIds) {
        // TODO-163 Faz 3 (TD-153) — HOME_EXPERIENCE kapalı store: MUTATION YOK. Lock ALINMADAN
        // SKIPPED_DISABLED (bounded jobLog; hata değil; retry yok); diğer store'lar devam eder.
        if (deps.capabilityGate && !(await deps.capabilityGate.isEnabled(storeId, "HOME_EXPERIENCE"))) {
          const at = clock();
          await writeJobLog(jobLog, storeId, "COMPLETED", {
            outcome: "SKIPPED_DISABLED",
            trigger,
            startedAt: at.toISOString(),
            completedAt: at.toISOString(),
            durationMs: 0,
          });
          summary.skippedDisabled += 1;
          summary.stores += 1;
          summary.perStore.push({ storeId, mode, outcome: "SKIPPED_DISABLED", cutoff: "", candidates: 0, deleted: 0, circuitBreakerTripped: false });
          continue;
        }

        const lockResult = await lock(HOME_DISCOVERY_EVENT_RETENTION_JOB, storeId, async () => {
          const startedAt = clock();
          const cutoff = computeCutoff(now, config.retentionDays);
          const candidates = await persistence.countExpired(storeId, cutoff);

          let deleted = 0;
          let tripped = false;
          if (apply && candidates > 0) {
            if (isCircuitBreakerTripped(candidates, config.maxDeletePerRun)) {
              tripped = true;
              logger.warn("home-discovery-event retention circuit breaker tripped — apply skipped", {
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

          const outcome: StoreRetentionReport["outcome"] =
            mode === "dry-run" ? "DRY_RUN" : tripped ? "PARTIAL_SUCCESS" : "COMPLETED";
          const report: StoreRetentionReport = {
            storeId,
            mode,
            outcome,
            cutoff: cutoff.toISOString(),
            candidates,
            deleted,
            circuitBreakerTripped: tripped,
          };
          const completedAt = clock();
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
          summary.perStore.push({
            storeId,
            mode,
            outcome: "SKIPPED_LOCKED",
            cutoff: "",
            candidates: 0,
            deleted: 0,
            circuitBreakerTripped: false,
          });
          logger.warn("home-discovery-event retention store skipped (locked)", { storeId });
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
