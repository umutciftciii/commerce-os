/**
 * TODO-162 (ADR-205) — Home Discovery event retention persistence (prisma). Ayrı domain tablosu
 * (`HomeDiscoveryEvent`); influencer/sponsored/recommendation `RETENTION_TABLE_SPECS` allowlist'ine DOKUNMAZ.
 * Store-scope + bounded batch delete (take → deleteMany(id in)). createdAt < cutoff budanır (180 gün).
 */
import type { PrismaClient } from "@prisma/client";

export interface DiscoveryEventRetentionPersistence {
  /** Retention'a konu distinct store id'ler (HomeDiscoveryEvent'te kaydı olanlar). */
  listStoreScope(): Promise<string[]>;
  /** storeId + createdAt < cutoff aday satır sayısı (circuit-breaker için). */
  countExpired(storeId: string, cutoff: Date): Promise<number>;
  /** Bounded batch delete; silinen satır sayısı (0 = tükendi). */
  deleteExpiredBatch(storeId: string, cutoff: Date, batchSize: number): Promise<number>;
}

export function createPrismaDiscoveryEventRetentionPersistence(db: PrismaClient): DiscoveryEventRetentionPersistence {
  return {
    async listStoreScope() {
      const rows = await db.homeDiscoveryEvent.findMany({ distinct: ["storeId"], select: { storeId: true } });
      return rows.map((r) => r.storeId);
    },
    async countExpired(storeId, cutoff) {
      return db.homeDiscoveryEvent.count({ where: { storeId, createdAt: { lt: cutoff } } });
    },
    async deleteExpiredBatch(storeId, cutoff, batchSize) {
      const rows = await db.homeDiscoveryEvent.findMany({
        where: { storeId, createdAt: { lt: cutoff } },
        select: { id: true },
        take: Math.max(1, batchSize),
      });
      if (rows.length === 0) return 0;
      const result = await db.homeDiscoveryEvent.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      return result.count;
    },
  };
}
