/**
 * TODO-161A.1 (ADR-136, revize) — DAĞITIK job overlap kilidi (PostgreSQL advisory lock OTORİTE).
 *
 * NEDEN dağıtık? Süreç-içi `withJobLock` yalnız aynı Node.js sürecindeki paralel çalışmayı engeller;
 * çoklu gateway replica'sı, restart sonrası yarış, ya da manuel/scheduled farklı instance çakışması
 * KORUNMAZ. Otorite artık mevcut PostgreSQL'dir (yeni Redis/altyapı YOK).
 *
 * TASARIM:
 *  - Kilit anahtarı = (jobType, storeId) → `pg_try_advisory_lock(hashtext(jobType), hashtext(storeId))`.
 *    İki-argümanlı (int,int) form: farklı jobType (settlement≠retention) VEYA farklı store → FARKLI kilit
 *    → gereksiz bloklama YOK, farklı store'lar paralel, aynı store'da settlement ve retention paralel.
 *    Manuel ve scheduled AYNI (jobType,storeId) anahtarını paylaşır → biri diğerini dışlar.
 *  - **Session-level** `pg_try_advisory_lock` (transaction DEĞİL): iş uzun sürebilir (retention batch
 *    delete) ve tek transaction'a hapsetmek per-agreement hata izolasyonunu bozar (bir DB hatası tüm
 *    tx'i abort eder). Session kilidi işi tx'e hapsetmeden korur.
 *  - **Bağlantı sabitleme:** Prisma havuzunda acquire ile release FARKLI bağlantıya düşerse unlock
 *    yanlış session'da çalışır. Bu yüzden kilit işlemleri, `connection_limit=1` olan AYRILMIŞ bir
 *    PrismaClient üzerinden yapılır → tüm acquire/unlock TEK session'da → unlock doğru. Bir session
 *    aynı anda birden çok advisory lock tutabilir (farklı anahtarlar) → paralellik korunur.
 *  - **Crash-safe / stale-lock YOK:** süreç çökerse ayrılmış bağlantı kapanır → PostgreSQL session
 *    advisory lock'larını OTOMATİK serbest bırakır. Transaction kilidi gibi kalıcı stale lock oluşmaz.
 *  - İn-memory per-anahtar guard İKİNCİL savunma olarak korunur (hızlı yol; tek otorite DEĞİL).
 */
import { PrismaClient } from "@prisma/client";
import type { Logger } from "@commerce-os/logger";

export type LockOutcome<T> = { acquired: true; result: T } | { acquired: false };

/** Servislerin bağımlı olduğu dar yüzey (fake ile test edilebilir; PG bağımlılığı SIZMAZ). */
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

/**
 * Ayrılmış tek-bağlantılı lock client + (jobType,storeId) bazlı dağıtık kilit yöneticisi.
 * `databaseUrl` verilmezse ortam DATABASE_URL'i kullanılır (Prisma varsayılanı).
 */
export function createPgAdvisoryLockManager(deps: {
  logger: Logger;
  databaseUrl?: string;
}): AdvisoryLockManager {
  const { logger } = deps;
  const url = deps.databaseUrl ?? process.env.DATABASE_URL;
  // connection_limit=1 → tüm kilit işlemleri TEK fiziksel bağlantı/session'da (acquire↔unlock eşleşir).
  const client = new PrismaClient({
    log: ["error"],
    ...(url ? { datasources: { db: { url: withConnectionLimitOne(url) } } } : {}),
  });

  // İkincil in-memory guard: aynı süreçte aynı anahtar için gereksiz PG round-trip'i eler.
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
    if (localHeld.has(key)) return { acquired: false }; // ikincil hızlı yol
    localHeld.add(key);
    let pgHeld = false;
    try {
      pgHeld = await tryAcquire(jobType, storeId);
      if (!pgHeld) return { acquired: false };
      const result = await fn();
      return { acquired: true, result };
    } finally {
      if (pgHeld) await release(jobType, storeId); // her success/error yolunda bırak
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

/**
 * Süreç-genelinde TEK paylaşılan lock yöneticisi (workers + routes AYNI api-gateway sürecinde). Tek
 * ayrılmış bağlantı + paylaşılan in-memory guard. PrismaClient constructor'ı bağlantı AÇMAZ (ilk sorguda
 * açılır) → tembel; createServer'ı worker'sız kuran testler için güvenli.
 */
let defaultManager: AdvisoryLockManager | null = null;

export function getDefaultAdvisoryLockManager(deps: { logger: Logger; databaseUrl?: string }): AdvisoryLockManager {
  if (!defaultManager) defaultManager = createPgAdvisoryLockManager(deps);
  return defaultManager;
}

export async function disconnectDefaultAdvisoryLockManager(): Promise<void> {
  if (defaultManager) {
    await defaultManager.disconnect();
    defaultManager = null;
  }
}
