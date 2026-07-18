import { Queue, Worker, type JobsOptions, type Processor } from "bullmq";
import { Redis } from "ioredis";
import {
  platformEventSchema,
  searchIndexJobSchema,
  type PlatformEventContract,
  type SearchIndexJob,
} from "@commerce-os/contracts";

export type { PlatformEventContract } from "@commerce-os/contracts";
export type { SearchIndexJob } from "@commerce-os/contracts";

export const PLATFORM_EVENTS_QUEUE = "platform-events";
// TODO-154 (ADR-079) — Search read-model reindex kuyruğu (mevcut BullMQ altyapısı; yeni evren DEĞİL).
export const SEARCH_INDEX_QUEUE = "search-index";

const connections = new Set<Redis>();
const queues = new Set<Queue>();
const workers = new Set<Worker>();

export function createRedisConnection(redisUrl: string): Redis {
  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });
  connections.add(connection);
  return connection;
}

export function createQueue<T = unknown>(name: string, redisUrl: string): Queue<T> {
  const queue = new Queue(name, {
    connection: createRedisConnection(redisUrl),
  }) as unknown as Queue<T>;
  queues.add(queue);
  return queue;
}

export function createWorker<T = unknown>(
  name: string,
  redisUrl: string,
  processor: Processor<T>,
  concurrency = 5,
): Worker<T> {
  const worker = new Worker<T>(name, processor, {
    concurrency,
    connection: createRedisConnection(redisUrl),
  });
  workers.add(worker);
  return worker;
}

export function platformEventsQueue(redisUrl: string): Queue<PlatformEventContract> {
  return createQueue<PlatformEventContract>(PLATFORM_EVENTS_QUEUE, redisUrl);
}

export async function enqueuePlatformEvent(
  redisUrl: string,
  event: PlatformEventContract,
  options?: JobsOptions,
): Promise<void> {
  const parsed = platformEventSchema.parse(event);
  const queue = platformEventsQueue(redisUrl);
  await queue.add(parsed.type, parsed, options);
}

export function searchIndexQueue(redisUrl: string): Queue<SearchIndexJob> {
  return createQueue<SearchIndexJob>(SEARCH_INDEX_QUEUE, redisUrl);
}

/**
 * Deterministik job anahtarı (dokümantasyon + gelecekte açık coalescing isteyen çağıranlar için util).
 *
 * DELİMİTER `__` — BullMQ custom jobId'de `:` YASAKTIR ("Custom Id cannot contain :"; redis anahtar
 * ayıracı). storeId/productId cuid'dir → çakışma yok.
 *
 * NOT: `enqueueSearchIndexJob` bunu VARSAYILAN OLARAK KULLANMAZ. BullMQ, custom jobId'yi yalnız BEKLEYEN
 * değil TAMAMLANMIŞ-ve-tutulan (removeOnComplete penceresi) job'lara karşı da dedup'lar → aynı ürünün
 * İKİNCİ değişimi sessizce DÜŞER (change-stream bozulur). Bu yüzden event-driven reindex OTOMATİK jobId
 * kullanır; tekrar güvenliği İDEMPOTENT işlemeyle (upsert + delete-and-replace) sağlanır.
 */
export function searchIndexJobId(job: SearchIndexJob): string {
  switch (job.kind) {
    case "reindex-product":
      return `reindex-product__${job.storeId}__${job.productId}`;
    case "remove-product":
      return `remove-product__${job.storeId}__${job.productId}`;
    case "reindex-store":
      return `reindex-store__${job.storeId}`;
    case "reindex-products":
      return `reindex-products__${job.storeId}`;
  }
}

/**
 * Search index job'unu kuyruğa koyar. OTOMATİK jobId (change-stream'i bozmamak için — bkz. searchIndexJobId
 * notu). Retry/backoff + tamamlanınca/başarısız olunca sınırlı tutma varsayılan; iş İDEMPOTENT olduğundan
 * duplicate/retry güvenlidir.
 */
export async function enqueueSearchIndexJob(
  redisUrl: string,
  job: SearchIndexJob,
  options?: JobsOptions,
): Promise<void> {
  const parsed = searchIndexJobSchema.parse(job);
  const queue = searchIndexQueue(redisUrl);
  await queue.add(parsed.kind, parsed, {
    attempts: 5,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
    ...options,
  });
}

export async function checkRedisHealth(redisUrl: string): Promise<boolean> {
  const connection = createRedisConnection(redisUrl);
  try {
    return (await connection.ping()) === "PONG";
  } finally {
    await connection.quit();
    connections.delete(connection);
  }
}

export async function closeQueueConnections(): Promise<void> {
  await Promise.all([...workers].map((worker) => worker.close()));
  await Promise.all([...queues].map((queue) => queue.close()));
  await Promise.all([...connections].map((connection) => connection.quit()));
  workers.clear();
  queues.clear();
  connections.clear();
}
