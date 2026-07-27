/**
 * TD-130 (ADR-148) — Recommendation event retention persistence (prisma). Ayrı domain tablosu
 * (`RecommendationEvent`); influencer/sponsored `RETENTION_TABLE_SPECS` allowlist'ine DOKUNMAZ.
 * Store-scope + bounded batch delete (take → deleteMany(id in)). createdAt < cutoff budanır (180 gün).
 */
import type { PrismaClient } from "@prisma/client";

export interface RecommendationEventRetentionPersistence {
  /** Retention'a konu distinct store id'ler (RecommendationEvent'te kaydı olanlar). */
  listStoreScope(): Promise<string[]>;
  /** storeId + createdAt < cutoff aday satır sayısı (circuit-breaker için). */
  countExpired(storeId: string, cutoff: Date): Promise<number>;
  /** Bounded batch delete; silinen satır sayısı (0 = tükendi). */
  deleteExpiredBatch(storeId: string, cutoff: Date, batchSize: number): Promise<number>;
}

export function createPrismaRecommendationEventRetentionPersistence(db: PrismaClient): RecommendationEventRetentionPersistence {
  return {
    async listStoreScope() {
      const rows = await db.recommendationEvent.findMany({ distinct: ["storeId"], select: { storeId: true } });
      return rows.map((r) => r.storeId);
    },
    async countExpired(storeId, cutoff) {
      return db.recommendationEvent.count({ where: { storeId, createdAt: { lt: cutoff } } });
    },
    async deleteExpiredBatch(storeId, cutoff, batchSize) {
      const rows = await db.recommendationEvent.findMany({
        where: { storeId, createdAt: { lt: cutoff } },
        select: { id: true },
        take: Math.max(1, batchSize),
      });
      if (rows.length === 0) return 0;
      const result = await db.recommendationEvent.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      return result.count;
    },
  };
}
