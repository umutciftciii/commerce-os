/**
 * TODO-154 (ADR-079) — Faz 2C-8A · PostgresSearchProvider.
 *
 * SearchProvider'ın İLK ve tek implementasyonu (gelecekte OpenSearchProvider aynı portu uygular).
 * Orkestrasyon: loadSources (bounded batch) → buildSearchDocument (SAF) → applyBuild (tek-ürün tek-tx).
 *
 *  - indexProduct: ürün bulunamazsa/ACTIVE değilse güvenli remove (no-op idempotent).
 *  - indexProducts: BOUNDED sub-chunk (loadSources IN-listesini sınırlar) + PER-ÜRÜN izolasyon
 *    (bir poison ürün tüm batch'i düşürmez → failed/errors sayaçları).
 *  - rebuildStore / backfillStore: id-cursor ile RESUMABLE + idempotent; katalog belleğe YÜKLENMEZ,
 *    transaction katalog boyu AÇIK TUTULMAZ (chunk başına ayrı tx).
 */

import type { PrismaClient } from "@prisma/client";
import { buildSearchDocument } from "./document-builder.js";
import { createPrismaSearchDataAccess, type SearchDataAccess } from "./data.js";
import type {
  BatchIndexOutcome,
  IndexOutcome,
  IndexStatus,
  RebuildOptions,
  RebuildReport,
  SearchProvider,
} from "./types.js";

/** loadSources IN-listesi + apply döngüsü için chunk (bellek + query planı guard'ı). */
const DEFAULT_BATCH_SIZE = 100;

export interface PostgresSearchProviderOptions {
  /** Test/DI için data-access override (varsayılan: createPrismaSearchDataAccess(client)). */
  dataAccess?: SearchDataAccess;
  batchSize?: number;
}

export function createPostgresSearchProvider(
  client: PrismaClient,
  options: PostgresSearchProviderOptions = {},
): SearchProvider {
  const data = options.dataAccess ?? createPrismaSearchDataAccess(client);
  const batchSize = clampBatchSize(options.batchSize ?? DEFAULT_BATCH_SIZE);

  async function indexProduct(storeId: string, productId: string): Promise<IndexOutcome> {
    const sources = await data.loadSources(storeId, [productId]);
    const source = sources.get(productId);
    if (!source) {
      // Ürün yok / başka store / silinmiş → güvenli remove (idempotent).
      await data.removeProduct(storeId, productId);
      return { productId, action: "removed", facetCount: 0 };
    }
    const result = buildSearchDocument(source);
    const applied = await data.applyBuild(storeId, productId, result);
    return { productId, action: applied.action, facetCount: applied.facetCount };
  }

  async function indexProducts(storeId: string, productIds: string[]): Promise<BatchIndexOutcome> {
    const outcome: BatchIndexOutcome = { scanned: 0, indexed: 0, removed: 0, failed: 0, errors: [] };
    const unique = [...new Set(productIds)];
    for (const chunk of chunkArray(unique, batchSize)) {
      const sources = await data.loadSources(storeId, chunk);
      for (const productId of chunk) {
        outcome.scanned += 1;
        try {
          const source = sources.get(productId);
          if (!source) {
            await data.removeProduct(storeId, productId);
            outcome.removed += 1;
            continue;
          }
          const applied = await data.applyBuild(storeId, productId, buildSearchDocument(source));
          if (applied.action === "indexed") outcome.indexed += 1;
          else outcome.removed += 1;
        } catch (error) {
          outcome.failed += 1;
          outcome.errors.push({ productId, message: errorMessage(error) });
        }
      }
    }
    return outcome;
  }

  async function removeProduct(storeId: string, productId: string): Promise<void> {
    await data.removeProduct(storeId, productId);
  }

  async function rebuildStore(storeId: string, opts: RebuildOptions = {}): Promise<RebuildReport> {
    const started = Date.now();
    const effectiveBatch = clampBatchSize(opts.batchSize ?? batchSize);
    const agg: BatchIndexOutcome = { scanned: 0, indexed: 0, removed: 0, failed: 0, errors: [] };
    let batches = 0;

    if (opts.productIds && opts.productIds.length > 0) {
      // Hedefli reindex (kategori/attribute şema değişimi → etkilenen ürünler).
      const partial = await indexProducts(storeId, opts.productIds);
      mergeOutcome(agg, partial);
      batches = Math.max(1, Math.ceil(opts.productIds.length / effectiveBatch));
    } else {
      // Tam mağaza taraması — id cursor (resumable). Her chunk ayrı tx grubu; belleğe tüm katalog GİRMEZ.
      let afterId: string | null = null;
      for (;;) {
        const ids = await data.scanProductIds(storeId, afterId, effectiveBatch);
        if (ids.length === 0) break;
        batches += 1;
        const partial = await indexProducts(storeId, ids);
        mergeOutcome(agg, partial);
        afterId = ids[ids.length - 1];
        if (ids.length < effectiveBatch) break;
      }
    }

    return { storeId, batches, durationMs: Date.now() - started, ...agg };
  }

  async function backfillStore(storeId: string, opts: RebuildOptions = {}): Promise<RebuildReport> {
    // Backfill = rebuild'in anlamsal takma adı (ilk doldurma); aynı resumable/idempotent garantiler.
    return rebuildStore(storeId, opts);
  }

  async function getIndexStatus(storeId: string): Promise<IndexStatus> {
    return data.getIndexStatus(storeId);
  }

  return { indexProduct, indexProducts, removeProduct, rebuildStore, backfillStore, getIndexStatus };
}

// ── yardımcılar ──

function clampBatchSize(n: number): number {
  if (!Number.isFinite(n) || n < 1) return DEFAULT_BATCH_SIZE;
  return Math.min(500, Math.floor(n));
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function mergeOutcome(target: BatchIndexOutcome, partial: BatchIndexOutcome): void {
  target.scanned += partial.scanned;
  target.indexed += partial.indexed;
  target.removed += partial.removed;
  target.failed += partial.failed;
  for (const e of partial.errors) target.errors.push(e);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
