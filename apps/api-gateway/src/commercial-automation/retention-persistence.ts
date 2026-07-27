/**
 * TODO-161A.1 — Retention için Prisma persistence (gerçek çalıştırma). YALNIZ iki HAM event tablosuna
 * dokunur (SponsoredProductEvent, AttributionClick). Finans/defter tablolarına referans YOKTUR →
 * orphan üretilemez (bu tablolar yaprak; kimse onlara FK ile bağlı değil). Batch DELETE bounded:
 * take → deleteMany(id in) (tek statement en fazla batchSize satır).
 */
import type { PrismaClient } from "@prisma/client";
import type { RetentionTable } from "./retention-core.js";
import type { RetentionPersistence } from "./retention-service.js";

export function createPrismaRetentionPersistence(db: PrismaClient): RetentionPersistence {
  return {
    async listStoreScope(storeId) {
      if (storeId) return [storeId];
      const [sponsored, influencer] = await Promise.all([
        db.sponsoredProductEvent.findMany({ distinct: ["storeId"], select: { storeId: true } }),
        db.attributionClick.findMany({ distinct: ["storeId"], select: { storeId: true } }),
      ]);
      const set = new Set<string>();
      for (const r of sponsored) set.add(r.storeId);
      for (const r of influencer) set.add(r.storeId);
      return [...set];
    },

    async countExpired(table, storeId, cutoff) {
      const where = { storeId, createdAt: { lt: cutoff } };
      if (table === "SponsoredProductEvent") {
        return db.sponsoredProductEvent.count({ where });
      }
      return db.attributionClick.count({ where });
    },

    async deleteExpiredBatch(table: RetentionTable, storeId, cutoff, batchSize) {
      const where = { storeId, createdAt: { lt: cutoff } };
      if (table === "SponsoredProductEvent") {
        const rows = await db.sponsoredProductEvent.findMany({ where, select: { id: true }, take: batchSize });
        if (rows.length === 0) return 0;
        const res = await db.sponsoredProductEvent.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
        return res.count;
      }
      const rows = await db.attributionClick.findMany({ where, select: { id: true }, take: batchSize });
      if (rows.length === 0) return 0;
      const res = await db.attributionClick.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      return res.count;
    },
  };
}
