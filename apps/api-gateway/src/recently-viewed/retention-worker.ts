/**
 * TODO-161B (ADR-139) — Zamanlanmış Recently Viewed retention worker'ı (attribution worker deseniyle birebir).
 *
 * RECENTLY_VIEWED_RETENTION_ENABLED=false (varsayılan) → döngü KURULMAZ (env gate: açıkça etkinleştirilmeden
 * ASLA otomatik DELETE). Etkinse tur APPLY modunda çalışır; circuit-breaker + store-scope + batch korumaları
 * serviste. Overlap: setTimeout zinciri + in-process guard. Tur hatası süreci çökertmez.
 */
import type { AppConfig } from "@commerce-os/config";
import type { Logger } from "@commerce-os/logger";
import { prisma } from "@commerce-os/db";
import {
  createRecentlyViewedRetentionService,
  type RecentlyViewedRetentionService,
  type RecentlyViewedRetentionSummary,
} from "./retention-service.js";
import { createPrismaRecentlyViewedRetentionPersistence } from "./retention-persistence.js";
import { getDefaultAdvisoryLockManager } from "../commercial-automation/advisory-lock.js";
import type { WorkerCapabilityGate } from "../capabilities/worker-gate.js";

export interface RecentlyViewedRetentionWorkerHandle {
  enabled: boolean;
  runOnce(apply?: boolean): Promise<RecentlyViewedRetentionSummary | null>;
  stop(): Promise<void>;
}

export interface RecentlyViewedRetentionWorkerDeps {
  config: AppConfig;
  logger: Logger;
  service?: RecentlyViewedRetentionService;
  // TODO-163 Faz 3 (TD-153) — RECENTLY_VIEWED kapalı store'da tur atlanır (SKIPPED_DISABLED).
  capabilityGate?: WorkerCapabilityGate;
}

export function buildRecentlyViewedRetentionService(
  config: AppConfig,
  logger: Logger,
  capabilityGate?: WorkerCapabilityGate,
): RecentlyViewedRetentionService {
  return createRecentlyViewedRetentionService({
    persistence: createPrismaRecentlyViewedRetentionPersistence(prisma),
    jobLog: prisma,
    logger,
    lock: getDefaultAdvisoryLockManager({ logger }).lock,
    config: {
      retentionDays: config.RECENTLY_VIEWED_RETENTION_DAYS,
      batchSize: config.RECENTLY_VIEWED_RETENTION_BATCH_SIZE,
      maxDeletePerRun: config.RECENTLY_VIEWED_RETENTION_MAX_DELETE_PER_RUN,
    },
    capabilityGate,
  });
}

export function startRecentlyViewedRetentionWorker(
  deps: RecentlyViewedRetentionWorkerDeps,
): RecentlyViewedRetentionWorkerHandle {
  const { config, logger } = deps;

  if (!config.RECENTLY_VIEWED_RETENTION_ENABLED) {
    logger.info("recently-viewed retention worker disabled", { env: "RECENTLY_VIEWED_RETENTION_ENABLED" });
    return { enabled: false, runOnce: async () => null, stop: async () => {} };
  }

  const intervalMs = config.RECENTLY_VIEWED_RETENTION_INTERVAL_SECONDS * 1000;
  const service = deps.service ?? buildRecentlyViewedRetentionService(config, logger, deps.capabilityGate);

  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  async function runOnce(apply = true): Promise<RecentlyViewedRetentionSummary | null> {
    if (running) return null;
    running = true;
    try {
      return await service.runOnce({ apply });
    } catch (error) {
      logger.error("recently-viewed retention cycle failed", { error: error as Error });
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

  logger.info("recently-viewed retention worker started", {
    intervalSeconds: config.RECENTLY_VIEWED_RETENTION_INTERVAL_SECONDS,
    retentionDays: config.RECENTLY_VIEWED_RETENTION_DAYS,
    batchSize: config.RECENTLY_VIEWED_RETENTION_BATCH_SIZE,
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
