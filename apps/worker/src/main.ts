import type { Job } from "bullmq";
import { loadConfig } from "@commerce-os/config";
import { createLogger } from "@commerce-os/logger";
import {
  closeQueueConnections,
  createWorker,
  PLATFORM_EVENTS_QUEUE,
  type PlatformEventContract,
} from "@commerce-os/queues";

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

logger.info("worker started", {
  queue: PLATFORM_EVENTS_QUEUE,
  concurrency: config.WORKER_CONCURRENCY,
});

const shutdown = async (signal: string) => {
  logger.info("worker shutting down", { signal });
  await closeQueueConnections();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
