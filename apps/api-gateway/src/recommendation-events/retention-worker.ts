/**
 * TD-130 (ADR-148) — Zamanlanmış Recommendation event retention worker'ı (attribution worker deseniyle birebir).
 *
 * RECOMMENDATION_EVENT_RETENTION_ENABLED=false (varsayılan) → döngü KURULMAZ (env gate: açıkça
 * etkinleştirilmeden ASLA otomatik DELETE). Etkinse tur APPLY modunda çalışır; circuit-breaker + store-scope +
 * batch korumaları serviste. Overlap: setTimeout zinciri + in-process guard. Tur hatası süreci çökertmez.
 */
import type { AppConfig } from "@commerce-os/config";
import type { Logger } from "@commerce-os/logger";
import { prisma } from "@commerce-os/db";
import {
  createRecommendationEventRetentionService,
  type RecommendationEventRetentionService,
  type RecommendationEventRetentionSummary,
} from "./retention-service.js";
import { createPrismaRecommendationEventRetentionPersistence } from "./retention-persistence.js";
import { getDefaultAdvisoryLockManager } from "../commercial-automation/advisory-lock.js";
import type { WorkerCapabilityGate } from "../capabilities/worker-gate.js";

export interface RecommendationEventRetentionWorkerHandle {
  enabled: boolean;
  runOnce(apply?: boolean): Promise<RecommendationEventRetentionSummary | null>;
  stop(): Promise<void>;
}

export interface RecommendationEventRetentionWorkerDeps {
  config: AppConfig;
  logger: Logger;
  service?: RecommendationEventRetentionService;
  // TODO-163 Faz 3 (TD-153) — RECOMMENDATION_ANALYTICS kapalı store'da tur atlanır (SKIPPED_DISABLED).
  capabilityGate?: WorkerCapabilityGate;
}

export function buildRecommendationEventRetentionService(
  config: AppConfig,
  logger: Logger,
  capabilityGate?: WorkerCapabilityGate,
): RecommendationEventRetentionService {
  return createRecommendationEventRetentionService({
    persistence: createPrismaRecommendationEventRetentionPersistence(prisma),
    jobLog: prisma,
    logger,
    lock: getDefaultAdvisoryLockManager({ logger }).lock,
    config: {
      retentionDays: config.RECOMMENDATION_EVENT_RETENTION_DAYS,
      batchSize: config.RECOMMENDATION_EVENT_RETENTION_BATCH_SIZE,
      maxDeletePerRun: config.RECOMMENDATION_EVENT_RETENTION_MAX_DELETE_PER_RUN,
    },
    capabilityGate,
  });
}

export function startRecommendationEventRetentionWorker(
  deps: RecommendationEventRetentionWorkerDeps,
): RecommendationEventRetentionWorkerHandle {
  const { config, logger } = deps;

  if (!config.RECOMMENDATION_EVENT_RETENTION_ENABLED) {
    logger.info("recommendation-event retention worker disabled", { env: "RECOMMENDATION_EVENT_RETENTION_ENABLED" });
    return { enabled: false, runOnce: async () => null, stop: async () => {} };
  }

  const intervalMs = config.RECOMMENDATION_EVENT_RETENTION_INTERVAL_SECONDS * 1000;
  const service = deps.service ?? buildRecommendationEventRetentionService(config, logger, deps.capabilityGate);

  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  async function runOnce(apply = true): Promise<RecommendationEventRetentionSummary | null> {
    if (running) return null;
    running = true;
    try {
      return await service.runOnce({ apply });
    } catch (error) {
      logger.error("recommendation-event retention cycle failed", { error: error as Error });
      return null;
    } finally {
      running = false;
    }
  }

  function schedule(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      void runOnce(true).finally(schedule);
    }, intervalMs);
    timer.unref?.();
  }

  logger.info("recommendation-event retention worker started", {
    intervalSeconds: config.RECOMMENDATION_EVENT_RETENTION_INTERVAL_SECONDS,
    retentionDays: config.RECOMMENDATION_EVENT_RETENTION_DAYS,
    batchSize: config.RECOMMENDATION_EVENT_RETENTION_BATCH_SIZE,
  });
  schedule();

  return {
    enabled: true,
    runOnce,
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      while (running) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
  };
}
