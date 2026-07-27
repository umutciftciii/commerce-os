/**
 * TODO-161A.1 (TD-121 + TD-113) — Zamanlanmış attribution retention worker'ı (sync-worker deseniyle BİREBİR).
 *
 * Davranış:
 *  - ATTRIBUTION_RETENTION_ENABLED=false (varsayılan) → döngü KURULMAZ, tek satır log (no-op handle).
 *    Bu, "environment guard": worker açıkça etkinleştirilmeden ASLA otomatik DELETE yapmaz.
 *  - Etkinse: tur APPLY modunda çalışır (KVKK purge otomasyonu). Circuit-breaker + store-scope + batch
 *    korumaları servis içindedir. Manuel dry-run route katmanından tetiklenir (aşağıdaki `runOnce(false)`).
 *  - Overlap: setTimeout zinciri + in-process guard. Tur hatası süreci çökertmez.
 */
import type { AppConfig } from "@commerce-os/config";
import type { Logger } from "@commerce-os/logger";
import { prisma } from "@commerce-os/db";
import {
  createRetentionService,
  type RetentionService,
  type RetentionSummary,
} from "./retention-service.js";
import { createPrismaRetentionPersistence } from "./retention-persistence.js";
import { getDefaultAdvisoryLockManager } from "./advisory-lock.js";

export interface RetentionWorkerHandle {
  enabled: boolean;
  /** Testler/manuel tetik için: tek tur. `apply=false` → dry-run (yalnız sayım). */
  runOnce(apply?: boolean): Promise<RetentionSummary | null>;
  stop(): Promise<void>;
}

export interface RetentionWorkerDeps {
  config: AppConfig;
  logger: Logger;
  service?: RetentionService;
}

export function buildRetentionService(config: AppConfig, logger: Logger): RetentionService {
  return createRetentionService({
    persistence: createPrismaRetentionPersistence(prisma),
    jobLog: prisma,
    logger,
    lock: getDefaultAdvisoryLockManager({ logger }).lock,
    config: {
      retentionDaysByTable: {
        SponsoredProductEvent: config.SPONSORED_EVENT_RETENTION_DAYS,
        AttributionClick: config.INFLUENCER_CLICK_RETENTION_DAYS,
      },
      batchSize: config.ATTRIBUTION_RETENTION_BATCH_SIZE,
      maxDeletePerRun: config.ATTRIBUTION_RETENTION_MAX_DELETE_PER_RUN,
    },
  });
}

export function startRetentionWorker(deps: RetentionWorkerDeps): RetentionWorkerHandle {
  const { config, logger } = deps;

  if (!config.ATTRIBUTION_RETENTION_ENABLED) {
    logger.info("attribution retention worker disabled", { env: "ATTRIBUTION_RETENTION_ENABLED" });
    return { enabled: false, runOnce: async () => null, stop: async () => {} };
  }

  const intervalMs = config.ATTRIBUTION_RETENTION_INTERVAL_SECONDS * 1000;
  const service = deps.service ?? buildRetentionService(config, logger);

  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  async function runOnce(apply = true): Promise<RetentionSummary | null> {
    if (running) return null; // overlap koruması
    running = true;
    try {
      return await service.runOnce({ apply });
    } catch (error) {
      logger.error("attribution retention cycle failed", { error: error as Error });
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

  logger.info("attribution retention worker started", {
    intervalSeconds: config.ATTRIBUTION_RETENTION_INTERVAL_SECONDS,
    batchSize: config.ATTRIBUTION_RETENTION_BATCH_SIZE,
    sponsoredRetentionDays: config.SPONSORED_EVENT_RETENTION_DAYS,
    influencerRetentionDays: config.INFLUENCER_CLICK_RETENTION_DAYS,
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
