/**
 * TD-130 (ADR-145…148) — Recommendation Measurement veri erişim katmanı (ham Prisma; storeId-scope).
 *
 * Tüm sorgular tenant-izole (storeId). Ürün/anchor sahipliği store bazında doğrulanır (cross-store event
 * reddi). Impression/click zaman-pencere dedupe (kimlik+yüzey+ürün); ADD_TO_CART dedupeKey idempotency.
 * Yazma tek satır insert (transaction gerekmez; event append-only). Admin özeti Prisma groupBy ile bounded.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@commerce-os/db";
import type {
  RecommendationEventTypeValue,
  RecommendationPlacement,
  RecommendationSource,
} from "./event-core.js";

/** Kayıt kimliği: en az biri dolu (customer öncelikli). Ham IP/UA DEĞİL — HMAC hash'ler. */
export interface RecommendationEventIdentity {
  customerId?: string | null;
  visitorHash?: string | null;
  sessionHash?: string | null;
}

export interface RecordEventInput {
  storeId: string;
  identity: RecommendationEventIdentity;
  productId: string;
  anchorProductId?: string | null;
  source: RecommendationSource;
  placement: RecommendationPlacement;
  eventType: RecommendationEventTypeValue;
  dedupeKey?: string | null;
  now: Date;
}

export interface RecommendationSummaryBucket {
  key: string;
  impressions: number;
  clicks: number;
  addToCart: number;
}

export interface RecommendationSummaryRaw {
  totals: { impressions: number; clicks: number; addToCart: number };
  bySource: RecommendationSummaryBucket[];
  byPlacement: RecommendationSummaryBucket[];
}

export interface RecommendationEventData {
  /** Ürün store'a ait mi? (enumeration + cross-store guard; ACTIVE şartı YOK — geçmiş görüntüleme olabilir). */
  productBelongsToStore(storeId: string, productId: string): Promise<boolean>;
  /** Dedupe: aynı kimlik+yüzey+ürün+tip için `since`'ten sonraki son event zamanı (ms) — yoksa null. */
  lastEventAtMs(input: {
    storeId: string;
    identity: RecommendationEventIdentity;
    productId: string;
    source: RecommendationSource;
    placement: RecommendationPlacement;
    eventType: RecommendationEventTypeValue;
    since: Date;
  }): Promise<number | null>;
  /** ADD_TO_CART idempotency: bu dedupeKey ile satır var mı? */
  dedupeKeyExists(storeId: string, dedupeKey: string): Promise<boolean>;
  insertEvent(input: RecordEventInput): Promise<void>;
  /**
   * KVKK/GDPR erasure hook (ADR-148). `customerId` FK'siz plain String olduğundan DB Cascade bu satırları
   * KAPSAMAZ → ileride bir hard customer-deletion akışı eklenirse o akış BU metodu çağırmalıdır. Tenant-scoped
   * (storeId zorunlu): yalnız (storeId, customerId) event'lerini siler; guest (visitorHash-only) event'lere,
   * diğer müşterilere ve diğer store'lara DOKUNMAZ. Finansal Order/OrderLine snapshot'ları ayrı tablodadır.
   * Silinen satır sayısını döner. Mevcut platformda hard customer-deletion YOK (yalnız status soft-deactivation)
   * → bu metod henüz bir akışa bağlı DEĞİL; KVKK erasure primitifi olarak hazır+testlidir.
   */
  deleteForCustomer(storeId: string, customerId: string): Promise<number>;
  summarize(input: {
    storeId: string;
    from: Date;
    to: Date;
    source?: RecommendationSource | null;
    placement?: RecommendationPlacement | null;
  }): Promise<RecommendationSummaryRaw>;
}

function identityWhere(identity: RecommendationEventIdentity): Prisma.RecommendationEventWhereInput {
  // Dedupe için tek ayırt edici kimlik: customer (öncelikli) → visitor → session.
  if (identity.customerId) return { customerId: identity.customerId };
  if (identity.visitorHash) return { visitorHash: identity.visitorHash };
  if (identity.sessionHash) return { sessionHash: identity.sessionHash };
  return { id: "__none__" }; // eşleşmez (kimliksiz zaten shouldRecordEvent'te elenmiş olur)
}

export function createRecommendationEventData(db: PrismaClient = prisma): RecommendationEventData {
  return {
    async productBelongsToStore(storeId, productId) {
      const row = await db.product.findFirst({ where: { id: productId, storeId }, select: { id: true } });
      return row !== null;
    },

    async lastEventAtMs({ storeId, identity, productId, source, placement, eventType, since }) {
      const row = await db.recommendationEvent.findFirst({
        where: {
          storeId,
          productId,
          source,
          placement,
          eventType,
          createdAt: { gte: since },
          ...identityWhere(identity),
        },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      return row ? row.createdAt.getTime() : null;
    },

    async dedupeKeyExists(storeId, dedupeKey) {
      const row = await db.recommendationEvent.findFirst({
        where: { storeId, dedupeKey },
        select: { id: true },
      });
      return row !== null;
    },

    async insertEvent(input) {
      await db.recommendationEvent.create({
        data: {
          storeId: input.storeId,
          customerId: input.identity.customerId ?? null,
          visitorHash: input.identity.visitorHash ?? null,
          sessionHash: input.identity.sessionHash ?? null,
          productId: input.productId,
          anchorProductId: input.anchorProductId ?? null,
          source: input.source,
          placement: input.placement,
          eventType: input.eventType,
          dedupeKey: input.dedupeKey ?? null,
          createdAt: input.now,
        },
        select: { id: true },
      });
    },

    async deleteForCustomer(storeId, customerId) {
      const result = await db.recommendationEvent.deleteMany({ where: { storeId, customerId } });
      return result.count;
    },

    async summarize({ storeId, from, to, source, placement }) {
      const where: Prisma.RecommendationEventWhereInput = {
        storeId,
        createdAt: { gte: from, lt: to },
        ...(source ? { source } : {}),
        ...(placement ? { placement } : {}),
      };
      const grouped = await db.recommendationEvent.groupBy({
        by: ["eventType", "source", "placement"],
        where,
        _count: { _all: true },
      });

      const totals = { impressions: 0, clicks: 0, addToCart: 0 };
      const bySource = new Map<string, RecommendationSummaryBucket>();
      const byPlacement = new Map<string, RecommendationSummaryBucket>();
      const bump = (bucket: { impressions: number; clicks: number; addToCart: number }, type: string, count: number) => {
        if (type === "IMPRESSION") bucket.impressions += count;
        else if (type === "CLICK") bucket.clicks += count;
        else if (type === "ADD_TO_CART") bucket.addToCart += count;
      };
      const ensure = (map: Map<string, RecommendationSummaryBucket>, key: string) => {
        let b = map.get(key);
        if (!b) {
          b = { key, impressions: 0, clicks: 0, addToCart: 0 };
          map.set(key, b);
        }
        return b;
      };

      for (const g of grouped) {
        const count = g._count._all;
        bump(totals, g.eventType, count);
        bump(ensure(bySource, g.source), g.eventType, count);
        bump(ensure(byPlacement, g.placement), g.eventType, count);
      }

      return {
        totals,
        bySource: [...bySource.values()].sort((a, b) => a.key.localeCompare(b.key)),
        byPlacement: [...byPlacement.values()].sort((a, b) => a.key.localeCompare(b.key)),
      };
    },
  };
}
