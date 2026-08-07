/**
 * TODO-174B (ADR-284) — Store Credit lot expiry sweep worker'ı (cart/expiry-worker deseniyle).
 *
 * CREDIT_EXPIRY_SWEEP_ENABLED=false (varsayılan) → döngü KURULMAZ (env gate: açıkça etkinleştirilmeden
 * ASLA otomatik EXPIRE materialization). KRİTİK: available bakiye zaten expiresAt>now ile doğru; bu
 * worker YALNIZ housekeeping — süresi dolmuş lot'ları EXPIRED işaretler + EXPIRE ledger entry yazar.
 * Overlap: setTimeout zinciri + in-process guard. Tur hatası süreci çökertmez.
 */
import type { AppConfig } from "@commerce-os/config";
import type { Logger } from "@commerce-os/logger";
import { sweepExpiredCreditAllStores } from "./service.js";

export interface CreditExpiryWorkerHandle {
  enabled: boolean;
  runOnce(): Promise<number | null>;
  stop(): Promise<void>;
}

export interface CreditExpiryWorkerDeps {
  config: AppConfig;
  logger: Logger;
}

export function startCreditExpiryWorker(deps: CreditExpiryWorkerDeps): CreditExpiryWorkerHandle {
  const { config, logger } = deps;

  if (!config.CREDIT_EXPIRY_SWEEP_ENABLED) {
    logger.info("credit expiry worker disabled", { env: "CREDIT_EXPIRY_SWEEP_ENABLED" });
    return { enabled: false, runOnce: async () => null, stop: async () => {} };
  }

  const intervalMs = config.CREDIT_EXPIRY_SWEEP_INTERVAL_SECONDS * 1000;
  const batch = config.CREDIT_EXPIRY_SWEEP_BATCH_SIZE;

  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  async function runOnce(): Promise<number | null> {
    if (running) return null;
    running = true;
    try {
      const processed = await sweepExpiredCreditAllStores(batch);
      if (processed > 0) logger.info("credit expiry sweep materialized lots", { processed });
      return processed;
    } catch (error) {
      logger.error("credit expiry cycle failed", { error: error as Error });
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

  logger.info("credit expiry worker started", {
    intervalSeconds: config.CREDIT_EXPIRY_SWEEP_INTERVAL_SECONDS,
    batchSize: batch,
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
