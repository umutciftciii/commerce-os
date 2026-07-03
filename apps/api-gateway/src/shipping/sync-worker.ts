/**
 * TODO-129 — Zamanlanmis shipment sync worker'i (provider-agnostic).
 *
 * Neden api-gateway sureci icinde? Shipping domain'i (adapter registry, credential
 * sifreleme, prisma baglami) tamamen bu uygulamada yasar; apps/worker (bullmq stub)
 * bu koda erisemez. En kucuk guvenilir desen: process-ici interval dongusu.
 * Cekirdek mantik sync-service.ts'tedir; ILERIDE (TODO-123 ile) shipping cekirdegi
 * pakete cikarilirsa dongu dedike worker servisine tasinabilir (ADR kaydina bkz.).
 *
 * Davranis:
 *  - SHIPMENT_SYNC_ENABLED=false (varsayilan) → dongu KURULMAZ, tek satir bilgi loglanir.
 *  - Overlap korumasi: yeni tur ancak onceki tur BITTIKTEN sonra planlanir (setTimeout
 *    zinciri; setInterval kullanilmaz → uzun suren tur ust uste binmez).
 *  - Tur hatasi süreci COKERTMEZ; loglanir, sonraki tur normal planlanir.
 *  - Guvenli loglama: id/store/provider/durum/hata kodu — secret/raw payload ASLA.
 */
import type { AppConfig } from "@commerce-os/config";
import type { Logger } from "@commerce-os/logger";
import {
  createDisabledHttpTransport,
  createFetchHttpTransport,
  type ShippingHttpTransport,
} from "./adapters/http.js";
import { createShippingAdapterRegistry } from "./adapters/registry.js";
import {
  createPrismaShipmentSyncPersistence,
  createShipmentSyncService,
  type ShipmentSyncService,
  type ShipmentSyncSummary,
} from "./sync-service.js";

export interface ShipmentSyncWorkerHandle {
  enabled: boolean;
  /** Testler/manuel tetik icin: tek tur calistirir (zamanlayicidan bagimsiz). */
  runOnce(): Promise<ShipmentSyncSummary | null>;
  stop(): Promise<void>;
}

export interface ShipmentSyncWorkerDeps {
  config: AppConfig;
  logger: Logger;
  /** Test enjeksiyonu; verilmezse prisma persistence + gercek registry kurulur. */
  service?: ShipmentSyncService;
}

export function startShipmentSyncWorker(deps: ShipmentSyncWorkerDeps): ShipmentSyncWorkerHandle {
  const { config, logger } = deps;

  if (!config.SHIPMENT_SYNC_ENABLED) {
    logger.info("shipment sync worker disabled", { env: "SHIPMENT_SYNC_ENABLED" });
    return {
      enabled: false,
      runOnce: async () => null,
      stop: async () => {},
    };
  }

  const service = deps.service ?? buildDefaultService(config, logger);
  const intervalMs = config.SHIPMENT_SYNC_INTERVAL_SECONDS * 1000;

  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  async function runOnce(): Promise<ShipmentSyncSummary | null> {
    if (running) return null; // overlap korumasi (manuel tetik + zamanlayici cakismasi)
    running = true;
    try {
      const summary = await service.syncEligibleShipments();
      if (summary.scanned > 0) {
        logger.info("shipment sync cycle completed", {
          scanned: summary.scanned,
          synced: summary.synced,
          failed: summary.failed,
          skipped: summary.skipped,
        });
      }
      return summary;
    } catch (error) {
      // Tur hatasi (or. DB gecici erisilemez) donguyu OLDURMEZ; sonraki tur denenir.
      logger.error("shipment sync cycle failed", { error: error as Error });
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
    // Dev sunucusunun kapanmasini timer bekletmesin.
    timer.unref?.();
  }

  logger.info("shipment sync worker started", {
    intervalSeconds: config.SHIPMENT_SYNC_INTERVAL_SECONDS,
    batchSize: config.SHIPMENT_SYNC_BATCH_SIZE,
    staleAfterMinutes: config.SHIPMENT_SYNC_STALE_AFTER_MINUTES,
    maxAttempts: config.SHIPMENT_SYNC_MAX_ATTEMPTS,
  });
  schedule();

  return {
    enabled: true,
    runOnce,
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      // Devam eden tur varsa bitmesini bekle (yarim yazim/yarim log birakmamak icin).
      while (running) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
  };
}

/** Route'lardaki transport/registry kurulumuyla AYNI (SHIPPING_SANDBOX_HTTP_ENABLED vb.). */
function buildDefaultService(config: AppConfig, logger: Logger): ShipmentSyncService {
  const transport: ShippingHttpTransport = config.SHIPPING_SANDBOX_HTTP_ENABLED
    ? createFetchHttpTransport(config.DHL_ECOMMERCE_HTTP_TIMEOUT_MS)
    : createDisabledHttpTransport();
  const registry = createShippingAdapterRegistry(transport, {
    testBaseUrl: config.DHL_ECOMMERCE_TEST_BASE_URL ?? null,
    liveBaseUrl: config.DHL_ECOMMERCE_LIVE_BASE_URL,
    apiVersion: config.DHL_ECOMMERCE_API_VERSION ?? null,
  });
  return createShipmentSyncService({
    config,
    registry,
    persistence: createPrismaShipmentSyncPersistence(),
    logger,
  });
}
