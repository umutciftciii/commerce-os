/**
 * DAĞITIK job overlap kilidi (PostgreSQL advisory lock OTORİTE). TODO-161A.1 (ADR-136).
 *
 * Bu modül `apps/api-gateway/src/commercial-automation/advisory-lock.ts`'ten @commerce-os/db'ye TAŞINDI
 * (PB-2/PB-3 hardening): backup job'u artık `apps/worker` sürecinde çalıştığından, hem api-gateway hem worker
 * AYNI kilit implementasyonunu paylaşmalıdır (cross-app import olmadan). commercial-automation/advisory-lock.ts
 * artık buradan re-export eder (davranış birebir korunur).
 *
 * TASARIM:
 *  - Kilit anahtarı = (jobType, storeId) → `pg_try_advisory_lock(hashtext(jobType), hashtext(storeId))`.
 *    Farklı jobType/store → FARKLI kilit → gereksiz bloklama yok, paralellik korunur. Manuel ve scheduled AYNI
 *    (jobType,storeId) anahtarını paylaşır → biri diğerini dışlar (çok-replika dahil).
 *  - **Session-level** lock (transaction DEĞİL): uzun batch işler tek tx'e hapsedilmez.
 *  - **Bağlantı sabitleme:** `connection_limit=1` ayrılmış PrismaClient → acquire/unlock TEK session.
 *  - **Crash-safe:** süreç çökerse bağlantı kapanır → PostgreSQL session lock'larını OTOMATİK bırakır.
 */
import { PrismaClient } from "@prisma/client";
import type { Logger } from "@commerce-os/logger";

export type LockOutcome<T> = { acquired: true; result: T } | { acquired: false };

export type StoreJobLocker = <T>(
  jobType: string,
  storeId: string,
  fn: () => Promise<T>,
) => Promise<LockOutcome<T>>;

export interface AdvisoryLockManager {
  lock: StoreJobLocker;
  disconnect(): Promise<void>;
}

function withConnectionLimitOne(url: string): string {
  return url.includes("?") ? `${url}&connection_limit=1` : `${url}?connection_limit=1`;
}

export function createPgAdvisoryLockManager(deps: {
  logger: Logger;
  databaseUrl?: string;
}): AdvisoryLockManager {
  const { logger } = deps;
  const url = deps.databaseUrl ?? process.env.DATABASE_URL;
  const client = new PrismaClient({
    log: ["error"],
    ...(url ? { datasources: { db: { url: withConnectionLimitOne(url) } } } : {}),
  });

  const localHeld = new Set<string>();

  async function tryAcquire(jobType: string, storeId: string): Promise<boolean> {
    const rows = await client.$queryRawUnsafe<Array<{ locked: boolean }>>(
      `SELECT pg_try_advisory_lock(hashtext($1)::int4, hashtext($2)::int4) AS locked`,
      jobType,
      storeId,
    );
    return rows[0]?.locked === true;
  }

  async function release(jobType: string, storeId: string): Promise<void> {
    try {
      const rows = await client.$queryRawUnsafe<Array<{ released: boolean }>>(
        `SELECT pg_advisory_unlock(hashtext($1)::int4, hashtext($2)::int4) AS released`,
        jobType,
        storeId,
      );
      if (rows[0]?.released !== true) {
        logger.warn("advisory lock release returned false", { jobType, storeId });
      }
    } catch (error) {
      logger.error("advisory lock release failed", { jobType, storeId, error: error as Error });
    }
  }

  const lock: StoreJobLocker = async (jobType, storeId, fn) => {
    const key = `${jobType}::${storeId}`;
    if (localHeld.has(key)) return { acquired: false };
    localHeld.add(key);
    let pgHeld = false;
    try {
      pgHeld = await tryAcquire(jobType, storeId);
      if (!pgHeld) return { acquired: false };
      const result = await fn();
      return { acquired: true, result };
    } finally {
      if (pgHeld) await release(jobType, storeId);
      localHeld.delete(key);
    }
  };

  return {
    lock,
    async disconnect() {
      await client.$disconnect();
    },
  };
}

let defaultManager: AdvisoryLockManager | null = null;

export function getDefaultAdvisoryLockManager(deps: {
  logger: Logger;
  databaseUrl?: string;
}): AdvisoryLockManager {
  if (!defaultManager) defaultManager = createPgAdvisoryLockManager(deps);
  return defaultManager;
}

export async function disconnectDefaultAdvisoryLockManager(): Promise<void> {
  if (defaultManager) {
    await defaultManager.disconnect();
    defaultManager = null;
  }
}
