/**
 * TODO-156E (ADR-084) — Faz 2C-8E · Autocomplete / Discovery SORGU MOTORU (PostgreSQL).
 *
 * `SearchProvider.suggest`'in Postgres implementasyonu. Tam `searchReadModel`'den AYRIDIR: facet,
 * disjunctive count, pagination, filtre çözümü YOKTUR. YALNIZ hafif projeksiyon üretir:
 *   - products     → ProductSearchDocument (relevance sıralı, bounded LIMIT; listing.primaryImage kapak)
 *   - brands       → ProductSearchDocument.brand DISTINCT + COUNT (prefix eşleşmesi)
 *   - categories   → ProductCategory (prefix eşleşmesi) + kök→yaprak breadcrumb (recursive CTE, upward)
 *   - suggestions  → eşleşen başlık/marka'dan SAF türetilmiş sorgu-tamamlamaları (tekil, relevance sıralı)
 *
 * Sorgu sayısı BOUNDED'dır (katalog boyundan bağımsız): products(1) + brands(1) + kategori-eşleşme(1) +
 * kategori-ata(≤1). Product başına sorgu YOKTUR. Tüm SQL parametreli (injection-safe) + storeId-scoped.
 * `Product`/EAV tabloları source-of-truth gibi JOIN EDİLMEZ (ADR-079 kilidi); kategori taksonomisi yalnız
 * meta/breadcrumb için okunur. Kampanya rozeti read-time bastırmadan geçer (bayat badge sızmaz).
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { isCampaignSnapshotDisplayable, type PublicCampaignBadge } from "@commerce-os/contracts";
import { normalizeText } from "./normalize.js";
import { escapeLike } from "./search-query.js";
import type {
  SearchListingProjection,
  SuggestBrand,
  SuggestCategory,
  SuggestCategoryPathNode,
  SuggestProduct,
  SuggestQuery,
  SuggestResult,
} from "./types.js";

/** Kategori ata-zinciri döngü/derinlik guard'ı (bozuk parentId veri döngüsü sonsuz walk'u önler). */
const MAX_CATEGORY_PATH_DEPTH = 10;

/** "Yeni" rozeti penceresi: ürün son N günde oluşturulduysa. Deterministik (suggest'in tek `now`'u ile). */
const NEW_WINDOW_DAYS = 30;
const NEW_WINDOW_MS = NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;

// ── SAF yardımcılar (DB'siz birim-test edilebilir) ──

/**
 * Eşleşen başlık + marka listelerinden SAF sorgu-tamamlama önerileri üretir. Deterministik: verilen sıra
 * korunur (relevance), prefix eşleşmeleri öne alınır (stable), normalize ile tekilleştirilir (duplicate yok),
 * kullanıcının yazdığının BİREBİR aynısı önerilmez. Görünen metin ilk görülen orijinal biçimdir.
 */
export function buildQuerySuggestions(input: {
  normalizedQ: string;
  brands: string[];
  titles: string[];
  limit: number;
}): string[] {
  const { normalizedQ, brands, titles, limit } = input;
  if (limit <= 0) return [];
  // Marka'lar güçlü sorgu terimleridir → başlıklardan önce denenir; sonra başlıklar (ürün adı = geçerli arama).
  const candidates = [...brands, ...titles];
  const seen = new Set<string>();
  const prefix: string[] = [];
  const rest: string[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (!normalized) continue;
    if (normalized === normalizedQ) continue; // yazılanın aynısını önerme
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const display = candidate.trim();
    if (normalized.startsWith(normalizedQ)) prefix.push(display);
    else rest.push(display);
  }
  return [...prefix, ...rest].slice(0, limit);
}

/**
 * Düz kategori düğümlerinden (id/slug/name/parentId) her hedef için kök→yaprak breadcrumb yolu kurar (SAF).
 * Döngü/derinlik guard'lı; eksik ata durursa kısmi yol (yaprağa kadar) döner. Yol son elemanı = hedef kategori.
 */
export function buildCategoryPaths(
  nodes: Array<{ id: string; slug: string; name: string; parentId: string | null }>,
  targetIds: string[],
): Map<string, SuggestCategoryPathNode[]> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, SuggestCategoryPathNode[]>();
  for (const targetId of targetIds) {
    const chain: SuggestCategoryPathNode[] = [];
    let currentId: string | null = targetId;
    const guard = new Set<string>();
    let depth = 0;
    while (currentId && depth < MAX_CATEGORY_PATH_DEPTH) {
      if (guard.has(currentId)) break; // döngü koruması
      guard.add(currentId);
      const node = byId.get(currentId);
      if (!node) break;
      chain.push({ slug: node.slug, name: node.name });
      currentId = node.parentId;
      depth += 1;
    }
    chain.reverse(); // yaprak→kök yığıldı → kök→yaprak'a çevir
    out.set(targetId, chain);
  }
  return out;
}

// ── Executor ──

interface RawProductRow {
  productId: string;
  slug: string;
  title: string;
  brand: string | null;
  primaryCategoryId: string | null;
  availability: "IN_STOCK" | "OUT_OF_STOCK";
  hasStock: boolean;
  listing: SearchListingProjection | null;
  campaign: PublicCampaignBadge | null;
  campaignStartsAt: Date | null;
  campaignEndsAt: Date | null;
  productCreatedAt: Date;
}

/**
 * Autocomplete sorgusunu read-model üzerinde çalıştırır. Kontrollü hata YOKTUR (boş sonuç = boş gruplar;
 * kategori bulunamaması hata değil). q çağıran tarafından normalize edilmemiş ham gelir → burada normalize.
 */
export async function suggestReadModel(
  client: PrismaClient,
  storeId: string,
  query: SuggestQuery,
): Promise<SuggestResult> {
  const q = normalizeText(query.q);
  if (!q) {
    return { query: q, suggestions: [], products: [], categories: [], brands: [], total: 0 };
  }
  const prefixLike = `${escapeLike(q)}%`;
  const containsLike = `%${escapeLike(q)}%`;

  // Base predicate: store + ACTIVE + (title prefix OR searchText contains OR FTS). Prefix-dostu (autocomplete).
  const matchPredicate = Prisma.sql`
    d."storeId" = ${storeId} AND d.status = 'ACTIVE'::"ProductStatus"
    AND (
      d.title ILIKE ${prefixLike} ESCAPE '\\'
      OR d."searchText" ILIKE ${containsLike} ESCAPE '\\'
      OR d."searchVector" @@ plainto_tsquery('simple', ${q})
    )`;

  // 1) Ürün önerileri (relevance sıralı, bounded). Exact başlık → başlık prefix → stok → trigram → başlık.
  // TODO-156E UX: FİYAT alanları SELECT edilmez (autocomplete satın-alma ekranı değil). primaryCategoryId +
  // productCreatedAt (kategori etiketi + "Yeni" rozeti) + kampanya snapshot (yalnız rozet varlığı/etiketi) alınır.
  const productRows = await client.$queryRaw<RawProductRow[]>(Prisma.sql`
    SELECT d."productId", d.slug, d.title, d.brand, d."primaryCategoryId",
           d.availability, d."hasStock", d.listing,
           d.campaign, d."campaignStartsAt", d."campaignEndsAt", d."productCreatedAt"
    FROM "ProductSearchDocument" d
    WHERE ${matchPredicate}
    ORDER BY
      (lower(d.title) = ${q}) DESC,
      (d.title ILIKE ${prefixLike} ESCAPE '\\') DESC,
      d."hasStock" DESC,
      similarity(d.title, ${q}) DESC,
      d.title ASC,
      d."productId" ASC
    LIMIT ${clampLimit(query.limitProducts)}`);

  // 1b) Eşleşen TOPLAM ürün sayısı (gösterilen bounded; "tüm sonuçları görüntüle (N)" için). Tek COUNT.
  const totalRows = await client.$queryRaw<Array<{ total: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS total FROM "ProductSearchDocument" d WHERE ${matchPredicate}`);
  const total = totalRows[0]?.total ?? 0;

  // 2) Marka önerileri (DISTINCT + COUNT; prefix eşleşmesi öne). brand orijinal case; ILIKE case-insensitive.
  const brandRows = await client.$queryRaw<Array<{ brand: string; count: number }>>(Prisma.sql`
    SELECT d.brand AS brand, COUNT(*)::int AS count
    FROM "ProductSearchDocument" d
    WHERE d."storeId" = ${storeId} AND d.status = 'ACTIVE'::"ProductStatus"
      AND d.brand IS NOT NULL AND d.brand <> ''
      AND (d.brand ILIKE ${prefixLike} ESCAPE '\\' OR d.brand ILIKE ${containsLike} ESCAPE '\\')
    GROUP BY d.brand
    ORDER BY (d.brand ILIKE ${prefixLike} ESCAPE '\\') DESC, COUNT(*) DESC, d.brand ASC
    LIMIT ${clampLimit(query.limitBrands)}`);

  // 3) Kategori eşleşmesi (prefix name/slug öne). ACTIVE kategoriler; breadcrumb için parentId de gelir.
  const categoryMatchRows = await client.$queryRaw<
    Array<{ id: string; slug: string; name: string; parentId: string | null }>
  >(Prisma.sql`
    SELECT id, slug, name, "parentId"
    FROM "ProductCategory"
    WHERE "storeId" = ${storeId} AND status = 'ACTIVE'
      AND (name ILIKE ${prefixLike} ESCAPE '\\' OR name ILIKE ${containsLike} ESCAPE '\\'
           OR slug ILIKE ${prefixLike} ESCAPE '\\')
    ORDER BY (name ILIKE ${prefixLike} ESCAPE '\\') DESC, name ASC, id ASC
    LIMIT ${clampLimit(query.limitCategories)}`);

  const categories = await hydrateCategoryPaths(client, storeId, categoryMatchRows);

  // 4) Sorgu-tamamlamaları (SAF; eşleşen başlık + marka'dan türetilir).
  const suggestions = buildQuerySuggestions({
    normalizedQ: q,
    brands: brandRows.map((b) => b.brand),
    titles: productRows.map((p) => p.title),
    limit: clampLimit(query.limitSuggestions),
  });

  const now = new Date();
  const products: SuggestProduct[] = productRows.map((r) => toSuggestProduct(r, now));
  const brands: SuggestBrand[] = brandRows.map((b) => ({ brand: b.brand, productCount: b.count }));

  return { query: q, suggestions, products, categories, brands, total };
}

/** Eşleşen kategoriler için kök→yaprak breadcrumb'ı doldurur (ata düğümlerini tek recursive CTE ile çeker). */
async function hydrateCategoryPaths(
  client: PrismaClient,
  storeId: string,
  matched: Array<{ id: string; slug: string; name: string; parentId: string | null }>,
): Promise<SuggestCategory[]> {
  if (matched.length === 0) return [];
  const ids = matched.map((c) => c.id);
  // Yukarı doğru recursive CTE — eşleşen kategoriler + TÜM ataları (tek sorgu; bounded = ağaç derinliği).
  const ancestorRows = await client.$queryRaw<
    Array<{ id: string; slug: string; name: string; parentId: string | null }>
  >(Prisma.sql`
    WITH RECURSIVE anc AS (
      SELECT id, slug, name, "parentId" FROM "ProductCategory"
        WHERE "storeId" = ${storeId} AND id IN (${Prisma.join(ids)})
      UNION ALL
      SELECT c.id, c.slug, c.name, c."parentId" FROM "ProductCategory" c
        JOIN anc a ON c.id = a."parentId"
        WHERE c."storeId" = ${storeId}
    )
    SELECT DISTINCT id, slug, name, "parentId" FROM anc`);
  const paths = buildCategoryPaths(ancestorRows, ids);
  return matched.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    path: paths.get(c.id) ?? [{ slug: c.slug, name: c.name }],
  }));
}

function toSuggestProduct(r: RawProductRow, now: Date): SuggestProduct {
  // READ-TIME kampanya geçerlilik bastırması (search-query.ts ile AYNI semantik; bayat badge sızmaz).
  // TODO-156E UX: yalnız ROZET varlığı + etiketi taşınır (indirim TUTARI/fiyat DEĞİL — keşif ekranı).
  const displayable =
    r.campaign !== null &&
    isCampaignSnapshotDisplayable({ startsAt: r.campaignStartsAt, endsAt: r.campaignEndsAt }, now);
  const primary = r.listing?.primaryImage ?? null;
  const isNew = now.getTime() - r.productCreatedAt.getTime() <= NEW_WINDOW_MS;
  return {
    productId: r.productId,
    slug: r.slug,
    title: r.title,
    brand: r.brand,
    primaryCategoryId: r.primaryCategoryId,
    availability: r.availability,
    inStock: r.hasStock,
    image: primary ? { storageKey: primary.storageKey, altText: primary.altText, width: primary.width, height: primary.height } : null,
    hasCampaign: displayable,
    campaignLabel: displayable ? r.campaign?.badgeLabel ?? null : null,
    isNew,
  };
}

/** Limit guard (autocomplete küçük olmalı; parser da sınırlar ama motor kendini de korur). */
function clampLimit(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(24, Math.floor(n));
}
