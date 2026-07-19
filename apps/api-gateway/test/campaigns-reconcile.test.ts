import { describe, expect, it } from "vitest";
import {
  createCampaignReconcileService,
  type CampaignReconcileEmitter,
  type CampaignReconcilePersistence,
} from "../src/campaigns/reconcile-service.js";

/**
 * TODO-155.2 — Kampanya rozeti reconciliation çekirdeği testleri (SAF; fake persistence + emitter).
 * (a) süresi geçmiş snapshot'lı ürünler reindex kuyruğuna alınır; (b) yeni açılan kampanyaların
 * mağazaları store reindex tetikler. Idempotent + bounded.
 */

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Parameters<typeof createCampaignReconcileService>[0]["logger"];

function recordingEmitter() {
  const products: Array<{ storeId: string; productId: string }> = [];
  const stores: string[] = [];
  const emitter: CampaignReconcileEmitter = {
    reindexProduct: (storeId, productId) => products.push({ storeId, productId }),
    reindexStore: (storeId) => stores.push(storeId),
  };
  return { emitter, products, stores };
}

function fakePersistence(
  expired: Array<{ storeId: string; productId: string }>,
  startedStoreIds: string[],
): CampaignReconcilePersistence {
  return {
    async findExpiredSnapshotProducts(_now, limit) {
      return expired.slice(0, limit);
    },
    async findRecentlyStartedCampaignStoreIds() {
      return startedStoreIds;
    },
  };
}

describe("campaign reconcile · reconcileOnce", () => {
  it("süresi geçmiş snapshot'lı ürünleri reindexProduct ile kuyruğa alır", async () => {
    const { emitter, products } = recordingEmitter();
    const service = createCampaignReconcileService({
      persistence: fakePersistence([{ storeId: "s1", productId: "p1" }, { storeId: "s1", productId: "p2" }], []),
      emitter,
      logger: silentLogger,
      batchSize: 200,
      lookbackMs: 7_200_000,
    });
    const summary = await service.reconcileOnce(new Date("2026-08-01T00:00:00Z"));
    expect(summary.expiredRequeued).toBe(2);
    expect(products).toEqual([
      { storeId: "s1", productId: "p1" },
      { storeId: "s1", productId: "p2" },
    ]);
  });

  it("yeni açılan kampanyaların mağazalarını reindexStore ile tazeler", async () => {
    const { emitter, stores } = recordingEmitter();
    const service = createCampaignReconcileService({
      persistence: fakePersistence([], ["s1", "s2"]),
      emitter,
      logger: silentLogger,
      batchSize: 200,
      lookbackMs: 7_200_000,
    });
    const summary = await service.reconcileOnce(new Date("2026-07-15T00:00:00Z"));
    expect(summary.storesRefreshed).toBe(2);
    expect(stores).toEqual(["s1", "s2"]);
  });

  it("batchSize sınırı: fazlası requeue edilmez (bounded)", async () => {
    const { emitter, products } = recordingEmitter();
    const expired = Array.from({ length: 5 }, (_, i) => ({ storeId: "s1", productId: `p${i}` }));
    const service = createCampaignReconcileService({
      persistence: fakePersistence(expired, []),
      emitter,
      logger: silentLogger,
      batchSize: 3,
      lookbackMs: 7_200_000,
    });
    const summary = await service.reconcileOnce(new Date("2026-08-01T00:00:00Z"));
    expect(summary.expiredRequeued).toBe(3);
    expect(products).toHaveLength(3);
  });

  it("drift yok → hiçbir job üretilmez", async () => {
    const { emitter, products, stores } = recordingEmitter();
    const service = createCampaignReconcileService({
      persistence: fakePersistence([], []),
      emitter,
      logger: silentLogger,
      batchSize: 200,
      lookbackMs: 7_200_000,
    });
    const summary = await service.reconcileOnce(new Date("2026-07-15T00:00:00Z"));
    expect(summary).toEqual({ expiredRequeued: 0, storesRefreshed: 0 });
    expect(products).toHaveLength(0);
    expect(stores).toHaveLength(0);
  });
});
