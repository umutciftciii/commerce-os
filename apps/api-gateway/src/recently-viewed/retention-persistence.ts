/**
 * TODO-161B (ADR-139) — Recently Viewed retention persistence (prisma). Ayrı domain tablosu
 * (`RecentlyViewedProduct`); attribution/sponsored allowlist'ine DOKUNMAZ. Store-scope + bounded batch
 * delete (take → deleteMany(id in)) — her statement sınırlı. Cap (max 50/kimlik) write-time otoritesidir;
 * bu zamanlanmış tur yalnız 90-gün cutoff'unu uygular.
 */
import type { PrismaClient } from "@prisma/client";

export interface RecentlyViewedRetentionPersistence {
  /** Retention'a konu olan distinct store id'ler (RecentlyViewedProduct'ta kaydı olanlar). */
  listStoreScope(): Promise<string[]>;
  /** storeId + lastViewedAt < cutoff aday satır sayısı (circuit-breaker için). */
  countExpired(storeId: string, cutoff: Date): Promise<number>;
  /** Bounded batch delete; silinen satır sayısı (0 = tükendi). */
  deleteExpiredBatch(storeId: string, cutoff: Date, batchSize: number): Promise<number>;
}

export function createPrismaRecentlyViewedRetentionPersistence(db: PrismaClient): RecentlyViewedRetentionPersistence {
  return {
    async listStoreScope() {
      const rows = await db.recentlyViewedProduct.findMany({ distinct: ["storeId"], select: { storeId: true } });
      return rows.map((r) => r.storeId);
    },
    async countExpired(storeId, cutoff) {
      return db.recentlyViewedProduct.count({ where: { storeId, lastViewedAt: { lt: cutoff } } });
    },
    async deleteExpiredBatch(storeId, cutoff, batchSize) {
      const rows = await db.recentlyViewedProduct.findMany({
        where: { storeId, lastViewedAt: { lt: cutoff } },
        select: { id: true },
        take: Math.max(1, batchSize),
      });
      if (rows.length === 0) return 0;
      const result = await db.recentlyViewedProduct.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      return result.count;
    },
  };
}
