/**
 * TODO-154 (ADR-079) — Faz 2C-8A · Search index EMITTER (api-gateway tarafı).
 *
 * Mutation handler'ları başarılı yazımdan SONRA bu emitter'ı çağırır → `search-index` kuyruğuna reindex
 * job'u konur; worker asenkron işler (search read-model EVENTUAL consistency). FIRE-AND-FORGET: enqueue
 * başarısız olsa bile (Redis erişilemez) MUTATION BAŞARISIZ OLMAZ — job kaybı yalnız dokümanı bir sonraki
 * değişime/backfill'e kadar bayat bırakır (checkout/fiyat/stok CANLI tablodan otoriter kalır). Payload
 * yalnız id taşır (secret/PII yok).
 *
 * DI seam: createServer varsayılan olarak createSearchIndexEmitter kullanır; testlerde no-op/recording
 * fake enjekte edilebilir (createNoopSearchIndexEmitter).
 */

import { enqueueSearchIndexJob, type SearchIndexJob } from "@commerce-os/queues";
import type { Logger } from "@commerce-os/logger";

export interface SearchIndexEmitter {
  /** Tek ürünü yeniden indeksle (create/update/archive/publish; varyant/stok/attribute değişimi). */
  reindexProduct(storeId: string, productId: string): void;
  /** Ürünü read-model'den kaldır (hard-delete akışları için; Faz A'da otomatik tetik yok — cascade temizler). */
  removeProduct(storeId: string, productId: string): void;
  /**
   * Mağazanın tüm ürünlerini yeniden indeksle (kategori/attribute ŞEMA değişimi → kontrollü batch;
   * provider chunk'lar). Not: PLATFORM attribute/option değişimi birden çok mağazayı etkiler — otomatik
   * kapsam DIŞI (admin-tetikli global rebuild; TD-049).
   */
  reindexStore(storeId: string): void;
}

export function createSearchIndexEmitter(redisUrl: string, logger: Logger): SearchIndexEmitter {
  const emit = (job: SearchIndexJob) => {
    // Fire-and-forget: enqueue hatası mutation'ı ETKİLEMEZ (yalnız loglanır).
    void enqueueSearchIndexJob(redisUrl, job).catch((error) => {
      logger.warn("search index enqueue failed", {
        kind: job.kind,
        storeId: job.storeId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };
  return {
    reindexProduct: (storeId, productId) => emit({ kind: "reindex-product", storeId, productId }),
    removeProduct: (storeId, productId) => emit({ kind: "remove-product", storeId, productId }),
    reindexStore: (storeId) => emit({ kind: "reindex-store", storeId }),
  };
}

/** Test/izole ortam için no-op (enqueue yapmaz). */
export function createNoopSearchIndexEmitter(): SearchIndexEmitter {
  return { reindexProduct: () => {}, removeProduct: () => {}, reindexStore: () => {} };
}
