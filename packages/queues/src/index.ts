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
// PB-2/PB-3 — DB backup kuyruğu. Periyodik tetikleme BullMQ Job Scheduler ile (worker sürecinde);
// api-gateway yalnız manuel one-off job enqueue eder. setTimeout scheduler'ından TAŞINDI.
export const BACKUP_QUEUE = "database-backup";
// Sabit scheduler id → upsert idempotent: worker restart PARALEL zamanlama üretmez (setTimeout zinciri sorunu yok).
export const BACKUP_SCHEDULER_ID = "database-backup-schedule";

export interface BackupJobData {
  trigger: "MANUAL" | "SCHEDULED";
  dryRun?: boolean;
}

// H-3 pre-ship (ADR-191 revize) — Rezervasyon bakım kuyruğu (expiry + reconcile). Periyodik expiry
// tetiklemesi BullMQ Job Scheduler ile (worker sürecinde; sabit id → idempotent, restart paralel
// zamanlama üretmez). api-gateway yalnız MANUEL one-off (expiry/reconcile) enqueue eder; süpürücü
// api-gateway runtime'ında ÇALIŞMAZ. setTimeout scheduler'ından TAŞINDI (backup standardı).
export const INVENTORY_MAINTENANCE_QUEUE = "inventory-maintenance";
export const INVENTORY_RESERVATION_EXPIRY_SCHEDULER_ID = "inventory-reservation-expiry-schedule";

export interface InventoryMaintenanceJobData {
  /** Hangi bakım işi: süre-aşımı süpürme veya PAID+ACTIVE reconcile. */
  jobType: "expiry" | "reconcile";
  trigger: "MANUAL" | "SCHEDULED";
  /** true → dry-run (yazma yok). expiry scheduled varsayılan apply; reconcile manuel varsayılan dry-run. */
  dryRun?: boolean;
  /** Manuel scoped tek-store run; yoksa tüm store'lar (sweep). */
  storeId?: string;
}

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

export function backupQueue(redisUrl: string): Queue<BackupJobData> {
  return createQueue<BackupJobData>(BACKUP_QUEUE, redisUrl);
}

/**
 * Manuel one-off backup job'u kuyruğa koyar (api-gateway `POST /internal/backup/run` → worker'da çalışır).
 * Backup ana API request sürecinde ÇALIŞMAZ. Retry/backoff sınırlı (kısa); advisory lock duplicate'i engeller.
 */
export async function enqueueBackupJob(
  redisUrl: string,
  data: BackupJobData,
  options?: JobsOptions,
): Promise<string> {
  const queue = backupQueue(redisUrl);
  const job = await queue.add(BACKUP_QUEUE, data, {
    attempts: 1,
    removeOnComplete: 1000,
    removeOnFail: 1000,
    ...options,
  });
  return job.id ?? "";
}

/**
 * Periyodik backup zamanlamasını (BullMQ Job Scheduler) upsert eder — worker sürecinde çağrılır.
 * Sabit id ile idempotent: restart/çift-çağrı PARALEL zamanlama üretmez. `cron` verilmezse `everyMs` kullanılır.
 */
export async function upsertBackupSchedule(
  redisUrl: string,
  opts: { cron?: string; everyMs?: number; tz?: string },
): Promise<void> {
  const queue = backupQueue(redisUrl);
  const repeat = opts.cron
    ? { pattern: opts.cron, ...(opts.tz ? { tz: opts.tz } : {}) }
    : { every: opts.everyMs ?? 86_400_000 };
  await queue.upsertJobScheduler(BACKUP_SCHEDULER_ID, repeat, {
    name: BACKUP_QUEUE,
    data: { trigger: "SCHEDULED" } satisfies BackupJobData,
    opts: { attempts: 1, removeOnComplete: 1000, removeOnFail: 1000 },
  });
}

/** Zamanlamayı kaldırır (test/temizlik). */
export async function removeBackupSchedule(redisUrl: string): Promise<void> {
  const queue = backupQueue(redisUrl);
  await queue.removeJobScheduler(BACKUP_SCHEDULER_ID);
}

export function inventoryMaintenanceQueue(redisUrl: string): Queue<InventoryMaintenanceJobData> {
  return createQueue<InventoryMaintenanceJobData>(INVENTORY_MAINTENANCE_QUEUE, redisUrl);
}

/**
 * Manuel rezervasyon bakım job'u kuyruğa koyar (api-gateway `POST .../expiry/run` | `.../reconcile/run`
 * → worker'da çalışır). İş api-gateway request sürecinde ÇALIŞMAZ. Advisory lock duplicate/paralel'i korur.
 */
export async function enqueueInventoryMaintenanceJob(
  redisUrl: string,
  data: InventoryMaintenanceJobData,
  options?: JobsOptions,
): Promise<string> {
  const queue = inventoryMaintenanceQueue(redisUrl);
  const job = await queue.add(data.jobType, data, {
    attempts: 1,
    removeOnComplete: 1000,
    removeOnFail: 1000,
    ...options,
  });
  return job.id ?? "";
}

/**
 * Periyodik rezervasyon EXPIRY zamanlamasını (BullMQ Job Scheduler) upsert eder — worker sürecinde
 * çağrılır. Sabit id ile idempotent: restart/çift-çağrı PARALEL zamanlama üretmez. `cron` > `everyMs`.
 * Reconcile zamanlanmaz (yalnız manuel/operasyonel).
 */
export async function upsertReservationExpirySchedule(
  redisUrl: string,
  opts: { cron?: string; everyMs?: number; tz?: string },
): Promise<void> {
  const queue = inventoryMaintenanceQueue(redisUrl);
  const repeat = opts.cron
    ? { pattern: opts.cron, ...(opts.tz ? { tz: opts.tz } : {}) }
    : { every: opts.everyMs ?? 300_000 };
  await queue.upsertJobScheduler(INVENTORY_RESERVATION_EXPIRY_SCHEDULER_ID, repeat, {
    name: "expiry",
    data: { jobType: "expiry", trigger: "SCHEDULED" } satisfies InventoryMaintenanceJobData,
    opts: { attempts: 1, removeOnComplete: 1000, removeOnFail: 1000 },
  });
}

/** Rezervasyon expiry zamanlamasını kaldırır (worker disabled ise / test / temizlik). */
export async function removeReservationExpirySchedule(redisUrl: string): Promise<void> {
  const queue = inventoryMaintenanceQueue(redisUrl);
  await queue.removeJobScheduler(INVENTORY_RESERVATION_EXPIRY_SCHEDULER_ID);
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
