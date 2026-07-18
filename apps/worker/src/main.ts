import type { Job } from "bullmq";
import { loadConfig } from "@commerce-os/config";
import { createLogger } from "@commerce-os/logger";
import {
  closeQueueConnections,
  createWorker,
  PLATFORM_EVENTS_QUEUE,
  SEARCH_INDEX_QUEUE,
  type PlatformEventContract,
  type SearchIndexJob,
} from "@commerce-os/queues";
import { createDefaultSearchProvider } from "@commerce-os/search-service";

const config = loadConfig();
const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);

const worker = createWorker<PlatformEventContract>(
  PLATFORM_EVENTS_QUEUE,
  config.REDIS_URL,
  async (job: Job<PlatformEventContract>) => {
    logger.info("processing platform event", {
      jobId: job.id,
      eventType: job.data.type,
      storeId: job.data.storeId,
    });
  },
  config.WORKER_CONCURRENCY,
);

worker.on("failed", (job, error) => {
  logger.error("platform event failed", { jobId: job?.id, error });
});

// TODO-154 (ADR-079) — Faz 2C-8A · Search read-model reindex worker'ı. İş SearchProvider ardında
// (Prisma detayları worker'a sızmaz). İş idempotent (upsert + delete-and-replace) → duplicate/retry
// güvenli. Hata → BullMQ retry/backoff (attempts:5); poison job worker.on("failed") ile loglanır.
const searchProvider = createDefaultSearchProvider();

const searchWorker = createWorker<SearchIndexJob>(
  SEARCH_INDEX_QUEUE,
  config.REDIS_URL,
  async (job: Job<SearchIndexJob>) => {
    const data = job.data;
    switch (data.kind) {
      case "reindex-product": {
        const outcome = await searchProvider.indexProduct(data.storeId, data.productId);
        logger.info("search reindex-product", {
          jobId: job.id,
          storeId: data.storeId,
          productId: data.productId,
          action: outcome.action,
          facetCount: outcome.facetCount,
        });
        return;
      }
      case "remove-product": {
        await searchProvider.removeProduct(data.storeId, data.productId);
        logger.info("search remove-product", {
          jobId: job.id,
          storeId: data.storeId,
          productId: data.productId,
        });
        return;
      }
      case "reindex-products": {
        const outcome = await searchProvider.indexProducts(data.storeId, data.productIds);
        logger.info("search reindex-products", {
          jobId: job.id,
          storeId: data.storeId,
          scanned: outcome.scanned,
          indexed: outcome.indexed,
          removed: outcome.removed,
          failed: outcome.failed,
        });
        // Poison alt-ürünler batch'i düşürmez; ama TÜMÜ başarısızsa job'u fail ettir (retry devreye girsin).
        if (outcome.failed > 0 && outcome.indexed === 0 && outcome.removed === 0) {
          throw new Error(`search reindex-products all failed (${outcome.failed})`);
        }
        return;
      }
      case "reindex-store": {
        const report = await searchProvider.rebuildStore(data.storeId);
        logger.info("search reindex-store", {
          jobId: job.id,
          storeId: data.storeId,
          batches: report.batches,
          scanned: report.scanned,
          indexed: report.indexed,
          removed: report.removed,
          failed: report.failed,
          durationMs: report.durationMs,
        });
        return;
      }
    }
  },
  config.WORKER_CONCURRENCY,
);

searchWorker.on("failed", (job, error) => {
  logger.error("search index job failed", {
    jobId: job?.id,
    kind: (job?.data as SearchIndexJob | undefined)?.kind,
    storeId: (job?.data as SearchIndexJob | undefined)?.storeId,
    error,
  });
});

logger.info("worker started", {
  queues: [PLATFORM_EVENTS_QUEUE, SEARCH_INDEX_QUEUE],
  concurrency: config.WORKER_CONCURRENCY,
});

const shutdown = async (signal: string) => {
  logger.info("worker shutting down", { signal });
  await closeQueueConnections();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
