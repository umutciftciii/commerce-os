/**
 * TODO-162 (ADR-205) — Zamanlanmış Home Discovery event retention worker'ı (recommendation worker'ıyla birebir).
 *
 * HOME_DISCOVERY_EVENT_RETENTION_ENABLED=false (varsayılan) → döngü KURULMAZ (env gate: açıkça
 * etkinleştirilmeden ASLA otomatik DELETE). Etkinse tur APPLY modunda çalışır; circuit-breaker + store-scope +
 * batch korumaları serviste. Overlap: setTimeout zinciri + in-process guard. Tur hatası süreci çökertmez.
 */
import type { AppConfig } from "@commerce-os/config";
import type { Logger } from "@commerce-os/logger";
import { prisma } from "@commerce-os/db";
import {
  createDiscoveryEventRetentionService,
  type DiscoveryEventRetentionService,
  type DiscoveryEventRetentionSummary,
} from "./discovery-event-retention-service.js";
import { createPrismaDiscoveryEventRetentionPersistence } from "./discovery-event-retention-persistence.js";
import { getDefaultAdvisoryLockManager } from "../commercial-automation/advisory-lock.js";

export interface DiscoveryEventRetentionWorkerHandle {
  enabled: boolean;
  runOnce(apply?: boolean): Promise<DiscoveryEventRetentionSummary | null>;
  stop(): Promise<void>;
}

export interface DiscoveryEventRetentionWorkerDeps {
  config: AppConfig;
  logger: Logger;
  service?: DiscoveryEventRetentionService;
}

export function buildDiscoveryEventRetentionService(config: AppConfig, logger: Logger): DiscoveryEventRetentionService {
  return createDiscoveryEventRetentionService({
    persistence: createPrismaDiscoveryEventRetentionPersistence(prisma),
    jobLog: prisma,
    logger,
    lock: getDefaultAdvisoryLockManager({ logger }).lock,
    config: {
      retentionDays: config.HOME_DISCOVERY_EVENT_RETENTION_DAYS,
      batchSize: config.HOME_DISCOVERY_EVENT_RETENTION_BATCH_SIZE,
      maxDeletePerRun: config.HOME_DISCOVERY_EVENT_RETENTION_MAX_DELETE_PER_RUN,
    },
  });
}

export function startDiscoveryEventRetentionWorker(
  deps: DiscoveryEventRetentionWorkerDeps,
): DiscoveryEventRetentionWorkerHandle {
  const { config, logger } = deps;

  if (!config.HOME_DISCOVERY_EVENT_RETENTION_ENABLED) {
    logger.info("home-discovery-event retention worker disabled", { env: "HOME_DISCOVERY_EVENT_RETENTION_ENABLED" });
    return { enabled: false, runOnce: async () => null, stop: async () => {} };
  }

  const intervalMs = config.HOME_DISCOVERY_EVENT_RETENTION_INTERVAL_SECONDS * 1000;
  const service = deps.service ?? buildDiscoveryEventRetentionService(config, logger);

  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  async function runOnce(apply = true): Promise<DiscoveryEventRetentionSummary | null> {
    if (running) return null;
    running = true;
    try {
      return await service.runOnce({ apply });
    } catch (error) {
      logger.error("home-discovery-event retention cycle failed", { error: error as Error });
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

  logger.info("home-discovery-event retention worker started", {
    intervalSeconds: config.HOME_DISCOVERY_EVENT_RETENTION_INTERVAL_SECONDS,
    retentionDays: config.HOME_DISCOVERY_EVENT_RETENTION_DAYS,
    batchSize: config.HOME_DISCOVERY_EVENT_RETENTION_BATCH_SIZE,
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
