/**
 * TODO-155.2 — Kampanya rozeti RECONCILIATION çekirdeği (provider-agnostik, DI-testable).
 *
 * Kampanya geçerlilik pencereleri (startsAt/endsAt) zamanla EVENT olmadan değişir: gelecek-başlangıçlı bir
 * kampanya, hiçbir mutasyon olmadan aktif hale gelir; aktif bir kampanya süresi dolar. Lifecycle reindex
 * (onCampaignChanged) yalnız MUTASYON anını yakalar. Bu sweep zaman-sınırı geçişlerini yakalar:
 *   (a) Süresi geçmiş snapshot'lı ürünler → reindex (badge yeniden hesaplanır; muhtemelen null/next kampanya).
 *   (b) Aralığı YENİ açılan (startsAt yakın geçmişte) kampanyaların mağazaları → store reindex.
 *
 * Read-time bastırma zaten stale badge'i GİZLER (kullanıcı görmez); bu sweep snapshot'ı eninde sonunda
 * TEMİZLER (index tutarlılığı + reconciliation). İşlem enqueue-only (worker indeksler) → api-gateway süreci
 * ağır indeksleme yapmaz. Idempotent (reindex idempotent + upsert). Bounded (batchSize + distinct store).
 */
import type { PrismaClient } from "@prisma/client";
import type { Logger } from "@commerce-os/logger";
import type { WorkerCapabilityGate } from "../capabilities/worker-gate.js";

/** Reconciliation'ın kullandığı reindex kuyruğu yüzeyi (SearchIndexEmitter alt kümesi; fire-and-forget). */
export interface CampaignReconcileEmitter {
  reindexProduct(storeId: string, productId: string): void;
  reindexStore(storeId: string): void;
}

/** DB erişim portu (fake ile birim-test edilebilir). Tüm sorgular bounded. */
export interface CampaignReconcilePersistence {
  /** Snapshot penceresi geçmiş ürünler (campaignEndsAt < now); en fazla `limit` (index'li, bounded). */
  findExpiredSnapshotProducts(now: Date, limit: number): Promise<Array<{ storeId: string; productId: string }>>;
  /** (now-lookback, now] aralığında BAŞLAYAN + hâlâ pencere-içi aktif public kampanyaların DISTINCT store'ları. */
  findRecentlyStartedCampaignStoreIds(now: Date, lookbackMs: number): Promise<string[]>;
}

export interface CampaignReconcileSummary {
  /** Süresi geçmiş snapshot'ı olup reindex kuyruğuna alınan ürün sayısı. */
  expiredRequeued: number;
  /** Yeni açılan kampanya nedeniyle store reindex tetiklenen mağaza sayısı. */
  storesRefreshed: number;
  // TODO-163 Faz 3 (TD-153) — CAMPAIGNS kapalı store olduğundan reindex ETMEDEN atlanan ürün/mağaza sayısı.
  expiredSkippedDisabled: number;
  storesSkippedDisabled: number;
}

export interface CampaignReconcileService {
  /** Tek tur reconciliation (zamanlayıcıdan bağımsız; test/manuel tetik). `now` enjekte edilebilir. */
  reconcileOnce(now?: Date): Promise<CampaignReconcileSummary>;
}

export interface CampaignReconcileServiceDeps {
  persistence: CampaignReconcilePersistence;
  emitter: CampaignReconcileEmitter;
  logger: Logger;
  batchSize: number;
  /** Yeni-başlayan kampanyayı "yakın" saymak için geriye bakış (genelde interval × 2). */
  lookbackMs: number;
  // TODO-163 Faz 3 (TD-153) — verildiyse: CAMPAIGNS kapalı store için reindex EMIT edilmez (sessiz skip;
  // bu global sweep'in per-store jobLog'u yok — emit-site gate + sayaç). Enjekte edilmezse davranış eskisi.
  capabilityGate?: WorkerCapabilityGate;
}

export function createCampaignReconcileService(deps: CampaignReconcileServiceDeps): CampaignReconcileService {
  const { persistence, emitter, logger, batchSize, lookbackMs } = deps;
  return {
    async reconcileOnce(nowInput?: Date): Promise<CampaignReconcileSummary> {
      const now = nowInput ?? new Date();
      const gate = deps.capabilityGate;
      // Store başına CAMPAIGNS kararı memo (aynı store'da tekrar await yok; cache zaten fail-closed/tenant-safe).
      const decision = new Map<string, boolean>();
      const campaignsOn = async (storeId: string): Promise<boolean> => {
        if (!gate) return true;
        let v = decision.get(storeId);
        if (v === undefined) {
          v = await gate.isEnabled(storeId, "CAMPAIGNS");
          decision.set(storeId, v);
        }
        return v;
      };

      // (a) Süresi geçmiş snapshot'lı ürünler → reindex (badge temizlenir/yenilenir). Bounded.
      const expired = await persistence.findExpiredSnapshotProducts(now, batchSize);
      let expiredRequeued = 0;
      let expiredSkippedDisabled = 0;
      for (const row of expired) {
        if (await campaignsOn(row.storeId)) {
          emitter.reindexProduct(row.storeId, row.productId);
          expiredRequeued += 1;
        } else {
          expiredSkippedDisabled += 1;
        }
      }

      // (b) Yakın zamanda AÇILAN kampanyaların mağazaları → store reindex (event kaçırılmışsa yakala).
      const storeIds = await persistence.findRecentlyStartedCampaignStoreIds(now, lookbackMs);
      let storesRefreshed = 0;
      let storesSkippedDisabled = 0;
      for (const storeId of storeIds) {
        if (await campaignsOn(storeId)) {
          emitter.reindexStore(storeId);
          storesRefreshed += 1;
        } else {
          storesSkippedDisabled += 1;
        }
      }

      const summary: CampaignReconcileSummary = {
        expiredRequeued,
        storesRefreshed,
        expiredSkippedDisabled,
        storesSkippedDisabled,
      };
      if (
        summary.expiredRequeued > 0 ||
        summary.storesRefreshed > 0 ||
        summary.expiredSkippedDisabled > 0 ||
        summary.storesSkippedDisabled > 0
      ) {
        logger.info("campaign reconcile cycle completed", {
          expiredRequeued: summary.expiredRequeued,
          storesRefreshed: summary.storesRefreshed,
          expiredSkippedDisabled: summary.expiredSkippedDisabled,
          storesSkippedDisabled: summary.storesSkippedDisabled,
        });
      }
      return summary;
    },
  };
}

/** Rozet üretebilen kampanya tipleri (paylaşılan değerlendirici + loader ile birebir). */
const RECONCILE_BADGE_TYPES = ["COUPON_CODE", "AUTOMATIC_CART", "PRODUCT_DISCOUNT", "CATEGORY_DISCOUNT"] as const;

/** Prisma tabanlı persistence (gerçek çalıştırma). Tüm sorgular bounded + index-dostu. */
export function createPrismaCampaignReconcilePersistence(client: PrismaClient): CampaignReconcilePersistence {
  return {
    async findExpiredSnapshotProducts(now, limit) {
      // campaignEndsAt yalnız kampanya snapshot'ı varken set edilir → geçmiş = süresi dolmuş rozet.
      // (storeId, campaignEndsAt) index'i taranır. take ile bounded.
      return client.productSearchDocument.findMany({
        where: { campaignEndsAt: { lt: now } },
        select: { storeId: true, productId: true },
        orderBy: { campaignEndsAt: "asc" },
        take: limit,
      });
    },
    async findRecentlyStartedCampaignStoreIds(now, lookbackMs) {
      const since = new Date(now.getTime() - lookbackMs);
      const rows = await client.campaign.findMany({
        where: {
          status: "ACTIVE",
          isPublic: true,
          type: { in: [...RECONCILE_BADGE_TYPES] },
          startsAt: { gt: since, lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        select: { storeId: true },
        distinct: ["storeId"],
      });
      return rows.map((r) => r.storeId);
    },
  };
}
