/**
 * TODO-161A.1 (TD-125) — Zamanlanmış settlement scheduler worker'ı (TODO-129 sync-worker deseniyle BİREBİR).
 *
 * Neden api-gateway süreci içinde? previewSettlement + prisma bağlamı burada yaşar (apps/worker yalnız
 * BullMQ consumer'ı). Desen: süreç-içi setTimeout zinciri + in-process overlap guard.
 *
 * Davranış:
 *  - SETTLEMENT_SCHEDULER_ENABLED=false (varsayılan) → döngü KURULMAZ, tek satır log (no-op handle).
 *  - Overlap: yeni tur ancak önceki BİTTİKTEN sonra planlanır (setTimeout zinciri; setInterval yok).
 *  - Tur hatası süreci ÇÖKERTMEZ; loglanır, sonraki tur planlanır. Anlaşma-başına hata izolasyonu servis içinde.
 *  - Yalnız DRAFT üretir; otomatik finalize YOK.
 */
import type { AppConfig } from "@commerce-os/config";
import type { Logger } from "@commerce-os/logger";
import { prisma } from "@commerce-os/db";
import { createSponsorshipData } from "../sponsorship/data.js";
import {
  createSettlementSchedulerService,
  type SettlementSchedulerService,
  type SettlementSchedulerSummary,
} from "./settlement-scheduler-service.js";
import { createPrismaSettlementSchedulerPersistence } from "./settlement-scheduler-persistence.js";
import { getDefaultAdvisoryLockManager } from "./advisory-lock.js";
import type { WorkerCapabilityGate } from "../capabilities/worker-gate.js";

export interface SettlementSchedulerWorkerHandle {
  enabled: boolean;
  /** Testler/manuel tetik için: tek tur (zamanlayıcıdan bağımsız). */
  runOnce(): Promise<SettlementSchedulerSummary | null>;
  stop(): Promise<void>;
}

export interface SettlementSchedulerWorkerDeps {
  config: AppConfig;
  logger: Logger;
  /** Test enjeksiyonu; verilmezse prisma persistence + previewSettlement kurulur. */
  service?: SettlementSchedulerService;
  // TODO-163 Faz 3 (TD-153) — SPONSORSHIP_FINANCE kapalı store'da tur atlanır (SKIPPED_DISABLED).
  capabilityGate?: WorkerCapabilityGate;
}

export function startSettlementSchedulerWorker(
  deps: SettlementSchedulerWorkerDeps,
): SettlementSchedulerWorkerHandle {
  const { config, logger } = deps;

  if (!config.SETTLEMENT_SCHEDULER_ENABLED) {
    logger.info("settlement scheduler worker disabled", { env: "SETTLEMENT_SCHEDULER_ENABLED" });
    return { enabled: false, runOnce: async () => null, stop: async () => {} };
  }

  const intervalMs = config.SETTLEMENT_SCHEDULER_INTERVAL_SECONDS * 1000;
  const service = deps.service ?? buildSettlementSchedulerService(config, logger, deps.capabilityGate);

  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  async function runOnce(): Promise<SettlementSchedulerSummary | null> {
    if (running) return null; // overlap koruması
    running = true;
    try {
      return await service.runOnce();
    } catch (error) {
      logger.error("settlement scheduler cycle failed", { error: error as Error });
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

  logger.info("settlement scheduler worker started", {
    intervalSeconds: config.SETTLEMENT_SCHEDULER_INTERVAL_SECONDS,
    batchSize: config.SETTLEMENT_SCHEDULER_BATCH_SIZE,
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

export function buildSettlementSchedulerService(
  config: AppConfig,
  logger: Logger,
  capabilityGate?: WorkerCapabilityGate,
): SettlementSchedulerService {
  const sponsorship = createSponsorshipData(prisma);
  return createSettlementSchedulerService({
    persistence: createPrismaSettlementSchedulerPersistence(
      prisma,
      sponsorship,
      config.COMMERCIAL_AUTOMATION_DEFAULT_TIMEZONE,
    ),
    jobLog: prisma,
    logger,
    lock: getDefaultAdvisoryLockManager({ logger }).lock,
    defaultTimeZone: config.COMMERCIAL_AUTOMATION_DEFAULT_TIMEZONE,
    batchSize: config.SETTLEMENT_SCHEDULER_BATCH_SIZE,
    capabilityGate,
  });
}
