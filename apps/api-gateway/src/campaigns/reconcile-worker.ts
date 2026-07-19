/**
 * TODO-155.2 — Zamanlanmış kampanya rozeti reconciliation worker'ı (TODO-129 sync-worker deseniyle BİREBİR).
 *
 * Neden api-gateway süreci içinde? search-index emitter + prisma bağlamı burada yaşar (apps/worker yalnız
 * BullMQ consumer'ıdır). En küçük güvenilir desen: süreç-içi setTimeout zinciri (overlap-korumalı).
 *
 * Davranış:
 *  - CAMPAIGN_RECONCILE_ENABLED=false (varsayılan) → döngü KURULMAZ, tek satır bilgi loglanır (no-op handle).
 *  - Overlap koruması: yeni tur ancak önceki tur BİTTİKTEN sonra planlanır (setTimeout zinciri; setInterval yok).
 *  - Tur hatası süreci ÇÖKERTMEZ; loglanır, sonraki tur planlanır.
 *  - Enqueue-only: ağır indeksleme worker'da (fire-and-forget); reconcile yalnız drift tespit + job enqueue.
 */
import type { AppConfig } from "@commerce-os/config";
import type { Logger } from "@commerce-os/logger";
import { prisma } from "@commerce-os/db";
import { createSearchIndexEmitter } from "../search-index/emitter.js";
import {
  createCampaignReconcileService,
  createPrismaCampaignReconcilePersistence,
  type CampaignReconcileService,
  type CampaignReconcileSummary,
} from "./reconcile-service.js";

export interface CampaignReconcileWorkerHandle {
  enabled: boolean;
  /** Testler/manuel tetik için: tek tur çalıştırır (zamanlayıcıdan bağımsız). */
  runOnce(): Promise<CampaignReconcileSummary | null>;
  stop(): Promise<void>;
}

export interface CampaignReconcileWorkerDeps {
  config: AppConfig;
  logger: Logger;
  /** Test enjeksiyonu; verilmezse prisma persistence + gerçek emitter kurulur. */
  service?: CampaignReconcileService;
}

export function startCampaignReconcileWorker(deps: CampaignReconcileWorkerDeps): CampaignReconcileWorkerHandle {
  const { config, logger } = deps;

  if (!config.CAMPAIGN_RECONCILE_ENABLED) {
    logger.info("campaign reconcile worker disabled", { env: "CAMPAIGN_RECONCILE_ENABLED" });
    return { enabled: false, runOnce: async () => null, stop: async () => {} };
  }

  const intervalMs = config.CAMPAIGN_RECONCILE_INTERVAL_SECONDS * 1000;
  const service = deps.service ?? buildDefaultService(config, logger, intervalMs);

  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  async function runOnce(): Promise<CampaignReconcileSummary | null> {
    if (running) return null; // overlap koruması
    running = true;
    try {
      return await service.reconcileOnce();
    } catch (error) {
      logger.error("campaign reconcile cycle failed", { error: error as Error });
      return null;
    } finally {
      running = false;
    }
  }

  function schedule(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      void runOnce().finally(schedule);
    }, intervalMs);
    timer.unref?.();
  }

  logger.info("campaign reconcile worker started", {
    intervalSeconds: config.CAMPAIGN_RECONCILE_INTERVAL_SECONDS,
    batchSize: config.CAMPAIGN_RECONCILE_BATCH_SIZE,
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

function buildDefaultService(config: AppConfig, logger: Logger, intervalMs: number): CampaignReconcileService {
  return createCampaignReconcileService({
    persistence: createPrismaCampaignReconcilePersistence(prisma),
    emitter: createSearchIndexEmitter(config.REDIS_URL, logger),
    logger,
    batchSize: config.CAMPAIGN_RECONCILE_BATCH_SIZE,
    // Yeni-başlayan kampanyayı "yakın" saymak için interval × 2 (bir tur kaçsa bile yakalanır).
    lookbackMs: intervalMs * 2,
  });
}
