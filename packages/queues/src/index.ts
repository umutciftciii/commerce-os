import { Queue, Worker, type JobsOptions, type Processor } from "bullmq";
import { Redis } from "ioredis";
import { platformEventSchema, type PlatformEventContract } from "@commerce-os/contracts";

export type { PlatformEventContract } from "@commerce-os/contracts";

export const PLATFORM_EVENTS_QUEUE = "platform-events";

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
