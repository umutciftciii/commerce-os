/**
 * TODO-167 (ADR-266) — Zamanlanmis Persistent Cart expiry worker'i (retention-worker deseniyle).
 *
 * CART_EXPIRY_SWEEP_ENABLED=false (varsayilan) → dongu KURULMAZ (env gate: acikca etkinlestirilmeden
 * ASLA otomatik EXPIRE). Etkinse tur APPLY modunda calisir (advisory-lock + idempotent sweep). Overlap:
 * setTimeout zinciri + in-process guard. Tur hatasi sureci cokertmez.
 */
import type { AppConfig } from "@commerce-os/config";
import type { Logger } from "@commerce-os/logger";
import { prisma } from "@commerce-os/db";
import { createCartData } from "./data.js";
import { createCartExpirySweepService, type CartExpirySweepSummary } from "./expiry-service.js";
import { getDefaultAdvisoryLockManager } from "../commercial-automation/advisory-lock.js";

export interface CartExpiryWorkerHandle {
  enabled: boolean;
  runOnce(apply?: boolean): Promise<CartExpirySweepSummary | null>;
  stop(): Promise<void>;
}

export interface CartExpiryWorkerDeps {
  config: AppConfig;
  logger: Logger;
  service?: ReturnType<typeof createCartExpirySweepService>;
}

export function startCartExpiryWorker(deps: CartExpiryWorkerDeps): CartExpiryWorkerHandle {
  const { config, logger } = deps;

  if (!config.CART_EXPIRY_SWEEP_ENABLED) {
    logger.info("cart expiry worker disabled", { env: "CART_EXPIRY_SWEEP_ENABLED" });
    return { enabled: false, runOnce: async () => null, stop: async () => {} };
  }

  const intervalMs = config.CART_EXPIRY_SWEEP_INTERVAL_SECONDS * 1000;
  const service =
    deps.service ??
    createCartExpirySweepService({
      data: createCartData(prisma),
      lock: getDefaultAdvisoryLockManager({ logger }).lock,
      now: () => new Date(),
      retentionDays: config.CART_EXPIRY_RETENTION_DAYS,
      batchLimit: config.CART_EXPIRY_SWEEP_BATCH_SIZE,
      logger,
    });

  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  async function runOnce(apply = true): Promise<CartExpirySweepSummary | null> {
    if (running) return null;
    running = true;
    try {
      return await service.runOnce({ apply });
    } catch (error) {
      logger.error("cart expiry cycle failed", { error: error as Error });
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

  logger.info("cart expiry worker started", {
    intervalSeconds: config.CART_EXPIRY_SWEEP_INTERVAL_SECONDS,
    retentionDays: config.CART_EXPIRY_RETENTION_DAYS,
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
