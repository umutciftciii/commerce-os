/**
 * TODO-123 — Zamanlanmis barkod retry/backoff worker'i (provider-agnostic).
 *
 * TODO-129 sync-worker.ts deseninin BIREBIR aynisi (drift olmasin diye): process-ici
 * overlap-korumali setTimeout zinciri, api-gateway sureci icinde. Cekirdek mantik
 * barcode-service.ts'tedir; manuel "Barkod/Etiket Olustur" ile AYNI cekirdegi kullanir.
 *
 * Davranis:
 *  - BARCODE_RETRY_ENABLED=false (varsayilan) → dongu KURULMAZ, tek satir bilgi loglanir.
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
  createBarcodeRetryService,
  createPrismaBarcodeRetryPersistence,
  type BarcodeRetryService,
  type BarcodeRetrySummary,
} from "./barcode-service.js";

export interface BarcodeRetryWorkerHandle {
  enabled: boolean;
  /** Testler/manuel tetik icin: tek tur calistirir (zamanlayicidan bagimsiz). */
  runOnce(): Promise<BarcodeRetrySummary | null>;
  stop(): Promise<void>;
}

export interface BarcodeRetryWorkerDeps {
  config: AppConfig;
  logger: Logger;
  /** Test enjeksiyonu; verilmezse prisma persistence + gercek registry kurulur. */
  service?: BarcodeRetryService;
}

export function startBarcodeRetryWorker(deps: BarcodeRetryWorkerDeps): BarcodeRetryWorkerHandle {
  const { config, logger } = deps;

  if (!config.BARCODE_RETRY_ENABLED) {
    logger.info("barcode retry worker disabled", { env: "BARCODE_RETRY_ENABLED" });
    return {
      enabled: false,
      runOnce: async () => null,
      stop: async () => {},
    };
  }

  const service = deps.service ?? buildDefaultService(config, logger);
  const intervalMs = config.BARCODE_RETRY_INTERVAL_SECONDS * 1000;

  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  async function runOnce(): Promise<BarcodeRetrySummary | null> {
    if (running) return null; // overlap korumasi (manuel tetik + zamanlayici cakismasi)
    running = true;
    try {
      const summary = await service.retryEligibleBarcodes();
      if (summary.scanned > 0) {
        logger.info("barcode retry cycle completed", {
          scanned: summary.scanned,
          created: summary.created,
          scheduled: summary.scheduled,
          blocked: summary.blocked,
          skipped: summary.skipped,
        });
      }
      return summary;
    } catch (error) {
      // Tur hatasi (or. DB gecici erisilemez) donguyu OLDURMEZ; sonraki tur denenir.
      logger.error("barcode retry cycle failed", { error: error as Error });
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

  logger.info("barcode retry worker started", {
    intervalSeconds: config.BARCODE_RETRY_INTERVAL_SECONDS,
    batchSize: config.BARCODE_RETRY_BATCH_SIZE,
    staleAfterMinutes: config.BARCODE_RETRY_STALE_AFTER_MINUTES,
    maxAttempts: config.BARCODE_RETRY_MAX_ATTEMPTS,
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
function buildDefaultService(config: AppConfig, logger: Logger): BarcodeRetryService {
  const transport: ShippingHttpTransport = config.SHIPPING_SANDBOX_HTTP_ENABLED
    ? createFetchHttpTransport(config.DHL_ECOMMERCE_HTTP_TIMEOUT_MS)
    : createDisabledHttpTransport();
  const registry = createShippingAdapterRegistry(transport, {
    testBaseUrl: config.DHL_ECOMMERCE_TEST_BASE_URL ?? null,
    liveBaseUrl: config.DHL_ECOMMERCE_LIVE_BASE_URL,
    apiVersion: config.DHL_ECOMMERCE_API_VERSION ?? null,
  });
  return createBarcodeRetryService({
    config,
    registry,
    persistence: createPrismaBarcodeRetryPersistence(),
    logger,
  });
}
