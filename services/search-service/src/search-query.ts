/**
 * TODO-155 (ADR-079) — Faz 2C-8B · Public Search & Facet SORGU MOTORU (PostgreSQL).
 *
 * Bu modül `SearchProvider.search`'ün Postgres implementasyonudur. YALNIZ search read-model'den okur:
 *   - `ProductSearchDocument`  → sonuç kümesi + sıralama + pagination + listing projeksiyonu
 *   - `ProductFacetValue`      → facet countları + numeric aralık (disjunctive faceting)
 * `Product`/EAV/`ProductVariant` tabloları source-of-truth gibi YENİDEN JOIN EDİLMEZ (ADR-079 kilidi).
 * Kategori ağacı + AttributeDefinition/AttributeOption YALNIZ taksonomi ÇÖZÜMÜ + facet META'sı için okunur
 * (hangi ürünlerin eşleştiği/sayıldığı read-model'de belirlenir).
 *
 * Sorgu sayısı BOUNDED'dır (ürün sayısından bağımsız): kategori(≤1) + filtre çözümü(≤2) + items(1) +
 * count(1) + facet-universe(1) + facet-meta(1) + option-meta(1) + facet-count/numeric (1 + seçili-facet).
 * Product başına sorgu YOKTUR. Tüm SQL parametreli (injection-safe) ve storeId ile tenant-scoped.
 *
 * Facet count semantiği (§6, enterprise disjunctive faceting):
 *   - Aynı facet içinde birden fazla değer → OR
 *   - Farklı facet'ler arası → AND
 *   - Bir facet'in KENDİ countları hesaplanırken kendi filtresi HARİÇ tutulur (seçili değer diğer
 *     seçenekleri sıfırlamaz); seçili olmayan facet'ler tam-filtreli kümede sayılır.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { normalizeText } from "./normalize.js";
import {
  SearchError,
  type SearchAttributeDataType,
  type SearchFacet,
  type SearchFacetSelectionMode,
  type SearchFacetValue,
  type SearchFilter,
  type SearchListingProjection,
  type SearchQuery,
  type SearchResult,
  type SearchResultItem,
  type SearchSortKey,
} from "./types.js";

// ── SAF yardımcılar (DB'siz birim-test edilebilir) ──

/** dataType → facet etkileşim modu. IMAGE/FILE facet olmaz (çağrı öncesi elenir). */
export function deriveSelectionMode(dataType: SearchAttributeDataType): SearchFacetSelectionMode {
  switch (dataType) {
    case "INTEGER":
    case "DECIMAL":
    case "DATE":
      return "RANGE";
    case "BOOLEAN":
      return "BOOLEAN";
    default:
      return "MULTI"; // SELECT / MULTI_SELECT / COLOR / TEXT ...
  }
}

const RANGE_TYPES = new Set<SearchAttributeDataType>(["INTEGER", "DECIMAL", "DATE"]);
const NON_FACETABLE = new Set<SearchAttributeDataType>(["IMAGE", "FILE"]);
const TEXT_TYPES = new Set<SearchAttributeDataType>(["TEXT", "TEXTAREA", "RICH_TEXT", "URL"]);
const OPTION_TYPES = new Set<SearchAttributeDataType>(["SELECT", "MULTI_SELECT", "COLOR"]);

/** Numaralı pagination özeti (deterministik). */
export function computePagination(page: number, pageSize: number, totalItems: number) {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalItems > 0,
  };
}

/** LIKE metakarakterlerini kaçır (kullanıcı q'sunun `%`/`_` içermesi tüm satırı eşleştirmesin). */
export function escapeLike(input: string): string {
  return input.replace(/([\\%_])/g, "\\$1");
}

// ── Facet birleştirme (SAF; count satırları + meta + option meta + uygulanan filtre → SearchFacet[]) ──

export interface FacetMetaRow {
  attributeDefinitionId: string;
  code: string;
  name: string;
  dataType: SearchAttributeDataType;
  unit: string | null;
  displayOrder: number;
}

export interface FacetCountRow {
  attributeDefinitionId: string;
  optionId: string | null;
  normalizedText: string | null;
  valueBoolean: boolean | null;
  count: number;
}

export interface FacetRangeRow {
  attributeDefinitionId: string;
  availableMin: number | null;
  availableMax: number | null;
}

export interface OptionMetaRow {
  id: string;
  attributeDefinitionId: string;
  value: string;
  label: string;
  colorHex: string | null;
  sortOrder: number;
}

/**
 * Ham SQL sonuçlarını SearchFacet[]'e çevirir (SAF). Facet sırası displayOrder ASC (eşitlikte code ASC);
 * option değer sırası AttributeOption.sortOrder ASC (eşitlikte label ASC). Numeric/DATE facet → range.
 */
export function assembleFacets(input: {
  meta: FacetMetaRow[];
  counts: FacetCountRow[];
  ranges: FacetRangeRow[];
  options: OptionMetaRow[];
  filters: SearchFilter[];
}): SearchFacet[] {
  const { meta, counts, ranges, options, filters } = input;
  const filterByCode = new Map(filters.map((f) => [f.code, f]));
  const optionById = new Map(options.map((o) => [o.id, o]));
  const rangeByDef = new Map(ranges.map((r) => [r.attributeDefinitionId, r]));
  const countsByDef = new Map<string, FacetCountRow[]>();
  for (const row of counts) {
    const arr = countsByDef.get(row.attributeDefinitionId) ?? [];
    arr.push(row);
    countsByDef.set(row.attributeDefinitionId, arr);
  }

  const facets: SearchFacet[] = [];
  for (const m of meta) {
    if (NON_FACETABLE.has(m.dataType)) continue;
    const selectionMode = deriveSelectionMode(m.dataType);
    const applied = filterByCode.get(m.code);
    const facet: SearchFacet = {
      attributeDefinitionId: m.attributeDefinitionId,
      code: m.code,
      name: m.name,
      dataType: m.dataType,
      unit: m.unit,
      displayOrder: m.displayOrder,
      selectionMode,
      values: [],
      range: null,
    };

    if (RANGE_TYPES.has(m.dataType)) {
      const r = rangeByDef.get(m.attributeDefinitionId);
      facet.range = {
        availableMin: r?.availableMin ?? null,
        availableMax: r?.availableMax ?? null,
        selectedMin: applied?.min ?? null,
        selectedMax: applied?.max ?? null,
      };
    } else {
      const selectedValues = new Set((applied?.values ?? []).map((v) => normalizeText(v)));
      const rows = countsByDef.get(m.attributeDefinitionId) ?? [];
      const values: SearchFacetValue[] = [];
      for (const row of rows) {
        if (m.dataType === "BOOLEAN") {
          if (row.valueBoolean === null) continue;
          values.push({
            optionId: null,
            value: row.valueBoolean ? "true" : "false",
            label: row.valueBoolean ? "Evet" : "Hayır",
            colorHex: null,
            count: row.count,
            selected: selectedValues.has(row.valueBoolean ? "true" : "false"),
          });
        } else if (OPTION_TYPES.has(m.dataType)) {
          if (!row.optionId) continue;
          const opt = optionById.get(row.optionId);
          if (!opt) continue; // ARCHIVED/silinmiş option — facet'e çıkmaz
          values.push({
            optionId: opt.id,
            value: opt.value,
            label: opt.label,
            colorHex: opt.colorHex,
            count: row.count,
            selected: selectedValues.has(normalizeText(opt.value)),
          });
        } else if (TEXT_TYPES.has(m.dataType)) {
          if (row.normalizedText === null) continue;
          values.push({
            optionId: null,
            value: row.normalizedText,
            label: row.normalizedText,
            colorHex: null,
            count: row.count,
            selected: selectedValues.has(row.normalizedText),
          });
        }
      }
      // Option facet: sortOrder ASC → label ASC; text/boolean: label ASC.
      values.sort((a, b) => {
        const oa = a.optionId ? optionById.get(a.optionId)?.sortOrder ?? 0 : 0;
        const ob = b.optionId ? optionById.get(b.optionId)?.sortOrder ?? 0 : 0;
        if (oa !== ob) return oa - ob;
        return a.label.localeCompare(b.label, "tr");
      });
      facet.values = values;
    }
    facets.push(facet);
  }

  facets.sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.code.localeCompare(b.code, "tr");
  });
  return facets;
}

// ── SQL parça yardımcıları ──

/** Boş dizide `1=0` (asla eşleşmez); aksi halde `col IN (...)`. */
function inClause(col: Prisma.Sql, values: string[]): Prisma.Sql {
  if (values.length === 0) return Prisma.sql`1=0`;
  return Prisma.sql`${col} IN (${Prisma.join(values)})`;
}

/** Prisma.Sql parçalarını AND ile birleştirir (parantezli; hiç yoksa TRUE). */
function joinAnd(parts: Prisma.Sql[]): Prisma.Sql {
  if (parts.length === 0) return Prisma.sql`TRUE`;
  return parts.reduce((acc, p, i) => (i === 0 ? Prisma.sql`(${p})` : Prisma.sql`${acc} AND (${p})`));
}

// ── Çözümlenmiş dinamik filtre (code → defId + dataType + değer daraltması) ──

interface ResolvedFilter {
  code: string;
  attributeDefinitionId: string;
  dataType: SearchAttributeDataType;
  /** Bu filtrenin ProductFacetValue f üzerindeki EXISTS değer-predikatı. */
  valuePredicate: Prisma.Sql;
}

/** Tek dinamik filtre için `EXISTS(ProductFacetValue ...)` predikatı üretir (excludeCode ile hariç bırakılabilir). */
function facetExists(storeId: string, rf: ResolvedFilter): Prisma.Sql {
  return Prisma.sql`EXISTS (SELECT 1 FROM "ProductFacetValue" f
    WHERE f."storeId" = ${storeId} AND f."productId" = d."productId"
      AND f."attributeDefinitionId" = ${rf.attributeDefinitionId} AND (${rf.valuePredicate}))`;
}

// ── Executor ──

/**
 * Public arama sorgusunu read-model üzerinde çalıştırır. Kontrollü hatalar `SearchError` fırlatır
 * (CATEGORY_NOT_FOUND / ATTRIBUTE_NOT_FILTERABLE / INVALID_FILTER_VALUE). SQL/Prisma mesajı public'e sızmaz.
 */
export async function searchReadModel(
  client: PrismaClient,
  storeId: string,
  query: SearchQuery,
): Promise<SearchResult> {
  // 1) Kategori subtree çözümü (verilmişse). ACTIVE kök + ACTIVE alt kategoriler (ADR-079: subtree DAHİL).
  let categoryIds: string[] | null = null;
  if (query.categorySlug) {
    const rows = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH RECURSIVE subtree AS (
        SELECT id FROM "ProductCategory"
          WHERE "storeId" = ${storeId} AND slug = ${query.categorySlug} AND status = 'ACTIVE'
        UNION ALL
        SELECT c.id FROM "ProductCategory" c
          JOIN subtree s ON c."parentId" = s.id
          WHERE c."storeId" = ${storeId} AND c.status = 'ACTIVE'
      )
      SELECT id FROM subtree`);
    if (rows.length === 0) {
      throw new SearchError("CATEGORY_NOT_FOUND", "Category not found.");
    }
    categoryIds = rows.map((r) => r.id);
  }

  // 2) Dinamik filtre çözümü + doğrulama.
  const resolvedFilters = await resolveFilters(client, storeId, query.filters, categoryIds);

  // 3) Sabit taban predikatı (kategori + fiyat + stok + keyword).
  const q = query.q ? normalizeText(query.q) : "";
  const basePredicate = buildBasePredicate(storeId, query, categoryIds, q);

  // 4) Tam where (excludeCode ile bir facet'in kendi filtresi hariç bırakılabilir).
  const whereWith = (excludeCode: string | null): Prisma.Sql => {
    const facetParts = resolvedFilters
      .filter((rf) => rf.code !== excludeCode)
      .map((rf) => facetExists(storeId, rf));
    return joinAnd([basePredicate, ...facetParts]);
  };
  const whereAll = whereWith(null);

  // 5) Items + total (2 sorgu). ORDER BY deterministik + tie-breaker.
  const offset = (query.page - 1) * query.pageSize;
  const orderBy = buildOrderBy(query.sort, q);
  const itemRows = await client.$queryRaw<RawItemRow[]>(Prisma.sql`
    SELECT d."productId", d.slug, d.title, d.brand, d."primaryCategoryId",
           d."minPriceMinor", d."maxPriceMinor", d.currency, d.availability, d."hasStock", d."variantCount",
           d."compareAtMinor", d."discountPercent", d."omnibusPreviousPriceMinor", d.listing
    FROM "ProductSearchDocument" d
    WHERE ${whereAll}
    ORDER BY ${orderBy}
    LIMIT ${query.pageSize} OFFSET ${offset}`);
  const totalRow = await client.$queryRaw<Array<{ total: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS total FROM "ProductSearchDocument" d WHERE ${whereAll}`);
  const totalItems = totalRow[0]?.total ?? 0;

  // 6) Facet universe: sonuç uzayında (dinamik facet filtreleri HARİÇ taban) hangi attribute'lar var.
  const baseOnly = buildBasePredicate(storeId, query, categoryIds, q);
  const universeRows = await client.$queryRaw<Array<{ attributeDefinitionId: string }>>(Prisma.sql`
    SELECT DISTINCT f."attributeDefinitionId"
    FROM "ProductFacetValue" f
    JOIN "ProductSearchDocument" d ON d."productId" = f."productId"
    WHERE f."storeId" = ${storeId} AND ${baseOnly}`);
  const universeDefIds = universeRows.map((r) => r.attributeDefinitionId);

  const facets =
    universeDefIds.length === 0
      ? []
      : await buildFacets(
          client,
          storeId,
          universeDefIds,
          resolvedFilters,
          query.filters,
          whereWith,
          categoryIds,
        );

  return {
    sort: query.sort,
    pagination: computePagination(query.page, query.pageSize, totalItems),
    items: itemRows.map(toResultItem),
    facets,
  };
}

interface RawItemRow {
  productId: string;
  slug: string;
  title: string;
  brand: string | null;
  primaryCategoryId: string | null;
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
  currency: string | null;
  availability: "IN_STOCK" | "OUT_OF_STOCK";
  hasStock: boolean;
  variantCount: number;
  // TODO-155.1 — Listing projection (read-model snapshot; jsonb → parsed obje). storageKey IÇ (route türetir).
  compareAtMinor: number | null;
  discountPercent: number | null;
  omnibusPreviousPriceMinor: number | null;
  listing: SearchListingProjection | null;
}

function toResultItem(r: RawItemRow): SearchResultItem {
  return {
    productId: r.productId,
    slug: r.slug,
    title: r.title,
    brand: r.brand,
    primaryCategoryId: r.primaryCategoryId,
    minPriceMinor: r.minPriceMinor,
    maxPriceMinor: r.maxPriceMinor,
    currency: r.currency,
    availability: r.availability,
    inStock: r.hasStock,
    variantCount: r.variantCount,
    // jsonb `listing` Prisma raw'da parsed obje döner (null olabilir); snapshot kendi yazımımız → shape güvenli.
    compareAtMinor: r.compareAtMinor,
    discountPercent: r.discountPercent,
    omnibusPreviousPriceMinor: r.omnibusPreviousPriceMinor,
    listing: r.listing ?? null,
  };
}

/** Taban predikatı: store + ACTIVE + kategori(subtree) + fiyat overlap + stok + keyword (dinamik facet HARİÇ). */
function buildBasePredicate(
  storeId: string,
  query: SearchQuery,
  categoryIds: string[] | null,
  normalizedQ: string,
): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`d."storeId" = ${storeId}`,
    Prisma.sql`d.status = 'ACTIVE'::"ProductStatus"`,
  ];
  if (categoryIds) {
    parts.push(inClause(Prisma.sql`d."primaryCategoryId"`, categoryIds));
  }
  // Fiyat: ürün [min,max] aralığı filtre [minPrice,maxPrice] ile OVERLAP. Fiyat gizliyse (min null) elenir.
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    parts.push(Prisma.sql`d."minPriceMinor" IS NOT NULL`);
    if (query.minPrice !== undefined) parts.push(Prisma.sql`d."maxPriceMinor" >= ${query.minPrice}`);
    if (query.maxPrice !== undefined) parts.push(Prisma.sql`d."minPriceMinor" <= ${query.maxPrice}`);
  }
  if (query.inStock) {
    parts.push(Prisma.sql`d."hasStock" = TRUE`);
  }
  if (normalizedQ) {
    const like = `%${escapeLike(normalizedQ)}%`;
    parts.push(Prisma.sql`(d."searchVector" @@ plainto_tsquery('simple', ${normalizedQ})
      OR d.title ILIKE ${like} ESCAPE '\\')`);
  }
  return joinAnd(parts);
}

/** Deterministik ORDER BY (sort + tie-breaker productId ASC). sort enum ile sınırlı (injection yok). */
function buildOrderBy(sort: SearchSortKey, normalizedQ: string): Prisma.Sql {
  const tie = Prisma.sql`d."productId" ASC`;
  switch (sort) {
    case "relevance":
      if (!normalizedQ) return Prisma.sql`d."productCreatedAt" DESC, ${tie}`;
      return Prisma.sql`
        (lower(d.title) = lower(${normalizedQ})) DESC,
        (d.title ILIKE ${escapeLike(normalizedQ) + "%"} ESCAPE '\\') DESC,
        ts_rank(d."searchVector", plainto_tsquery('simple', ${normalizedQ})) DESC,
        similarity(d.title, ${normalizedQ}) DESC,
        ${tie}`;
    case "newest":
      return Prisma.sql`d."productCreatedAt" DESC, ${tie}`;
    case "price_asc":
      return Prisma.sql`d."minPriceMinor" ASC NULLS LAST, ${tie}`;
    case "price_desc":
      return Prisma.sql`d."maxPriceMinor" DESC NULLS LAST, ${tie}`;
    case "title_asc":
      return Prisma.sql`d.title ASC, ${tie}`;
    case "title_desc":
      return Prisma.sql`d.title DESC, ${tie}`;
    default:
      return Prisma.sql`d."productCreatedAt" DESC, ${tie}`;
  }
}

/** Dinamik filtreleri code→defId+dataType'a çözer, değerleri doğrular, EXISTS predikatlarını üretir. */
async function resolveFilters(
  client: PrismaClient,
  storeId: string,
  filters: SearchFilter[],
  categoryIds: string[] | null,
): Promise<ResolvedFilter[]> {
  if (filters.length === 0) return [];
  const codes = [...new Set(filters.map((f) => f.code))];

  // code → (defId, dataType) — YALNIZ filterable + ACTIVE tanım; kategori verilmişse subtree'ye scope'lu.
  const catScope = categoryIds
    ? Prisma.sql`AND ${inClause(Prisma.sql`ca."categoryId"`, categoryIds)}`
    : Prisma.empty;
  const defRows = await client.$queryRaw<
    Array<{ code: string; id: string; dataType: SearchAttributeDataType }>
  >(Prisma.sql`
    SELECT DISTINCT ad.code, ad.id, ad."dataType"
    FROM "CategoryAttribute" ca
    JOIN "AttributeDefinition" ad ON ad.id = ca."attributeDefinitionId"
    WHERE ca."storeId" = ${storeId} AND ca.filterable = TRUE AND ad.status = 'ACTIVE'
      AND ${inClause(Prisma.sql`ad.code`, codes)} ${catScope}`);
  const defByCode = new Map(defRows.map((r) => [r.code, r]));

  // Option-tipli filtreler için değer→optionId çözümü (tek sorgu).
  const optionDefIds: string[] = [];
  const wantedValues: string[] = [];
  for (const f of filters) {
    const def = defByCode.get(f.code);
    if (def && OPTION_TYPES.has(def.dataType) && f.values) {
      optionDefIds.push(def.id);
      wantedValues.push(...f.values);
    }
  }
  const optionRows =
    optionDefIds.length > 0 && wantedValues.length > 0
      ? await client.$queryRaw<Array<{ id: string; attributeDefinitionId: string; value: string }>>(
          Prisma.sql`
          SELECT id, "attributeDefinitionId", value FROM "AttributeOption"
          WHERE ${inClause(Prisma.sql`"attributeDefinitionId"`, [...new Set(optionDefIds)])}
            AND ${inClause(Prisma.sql`value`, [...new Set(wantedValues)])} AND status = 'ACTIVE'`,
        )
      : [];
  // (defId, normalize(value)) → optionId
  const optionByKey = new Map<string, string>();
  for (const o of optionRows) {
    optionByKey.set(`${o.attributeDefinitionId}|${normalizeText(o.value)}`, o.id);
  }

  const resolved: ResolvedFilter[] = [];
  for (const f of filters) {
    const def = defByCode.get(f.code);
    if (!def || NON_FACETABLE.has(def.dataType)) {
      // Bilinmeyen/filtrelenemez kod → sessizce yok sayma (§16).
      throw new SearchError("ATTRIBUTE_NOT_FILTERABLE", `Attribute '${f.code}' is not filterable.`);
    }
    const valuePredicate = buildFilterValuePredicate(f, def, optionByKey);
    resolved.push({ code: f.code, attributeDefinitionId: def.id, dataType: def.dataType, valuePredicate });
  }
  return resolved;
}

/** Bir filtrenin dataType'a göre değer-predikatını üretir + değeri doğrular (INVALID_FILTER_VALUE). */
function buildFilterValuePredicate(
  f: SearchFilter,
  def: { id: string; dataType: SearchAttributeDataType },
  optionByKey: Map<string, string>,
): Prisma.Sql {
  if (OPTION_TYPES.has(def.dataType)) {
    if (!f.values || f.values.length === 0) {
      throw new SearchError("INVALID_FILTER_VALUE", `Filter '${f.code}' requires at least one value.`);
    }
    const optionIds: string[] = [];
    for (const v of f.values) {
      const id = optionByKey.get(`${def.id}|${normalizeText(v)}`);
      if (!id) {
        throw new SearchError("INVALID_FILTER_VALUE", `Unknown value '${v}' for filter '${f.code}'.`);
      }
      optionIds.push(id);
    }
    return inClause(Prisma.sql`f."optionId"`, optionIds); // facet İÇİ OR
  }
  if (TEXT_TYPES.has(def.dataType)) {
    if (!f.values || f.values.length === 0) {
      throw new SearchError("INVALID_FILTER_VALUE", `Filter '${f.code}' requires at least one value.`);
    }
    const norms = f.values.map((v) => normalizeText(v)).filter((v) => v.length > 0);
    if (norms.length === 0) {
      throw new SearchError("INVALID_FILTER_VALUE", `Filter '${f.code}' has no usable value.`);
    }
    return inClause(Prisma.sql`f."normalizedText"`, [...new Set(norms)]);
  }
  if (def.dataType === "BOOLEAN") {
    if (!f.values || f.values.length === 0) {
      throw new SearchError("INVALID_FILTER_VALUE", `Filter '${f.code}' requires true/false.`);
    }
    const bools: boolean[] = [];
    for (const v of f.values) {
      const n = normalizeText(v);
      if (n === "true") bools.push(true);
      else if (n === "false") bools.push(false);
      else throw new SearchError("INVALID_FILTER_VALUE", `Filter '${f.code}' requires true/false.`);
    }
    // Facet İÇİ OR (true+false = daraltma yok). Prisma.join boş olamaz (yukarıda garanti).
    return Prisma.sql`f."valueBoolean" IN (${Prisma.join(bools)})`;
  }
  if (def.dataType === "INTEGER" || def.dataType === "DECIMAL") {
    return buildNumericRangePredicate(f, Prisma.sql`f."valueNumber"`);
  }
  if (def.dataType === "DATE") {
    // min/max = epoch ms → to_timestamp(sec). valueDate TIMESTAMP karşılaştırması.
    const parts: Prisma.Sql[] = [];
    if (f.min !== undefined) {
      if (!Number.isFinite(f.min)) throw invalidRange(f.code);
      parts.push(Prisma.sql`f."valueDate" >= to_timestamp(${f.min / 1000})`);
    }
    if (f.max !== undefined) {
      if (!Number.isFinite(f.max)) throw invalidRange(f.code);
      parts.push(Prisma.sql`f."valueDate" <= to_timestamp(${f.max / 1000})`);
    }
    if (parts.length === 0) throw invalidRange(f.code);
    return joinAnd(parts);
  }
  throw new SearchError("ATTRIBUTE_NOT_FILTERABLE", `Attribute '${f.code}' is not filterable.`);
}

function buildNumericRangePredicate(f: SearchFilter, col: Prisma.Sql): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (f.min !== undefined) {
    if (!Number.isFinite(f.min)) throw invalidRange(f.code);
    parts.push(Prisma.sql`${col} >= ${f.min}`);
  }
  if (f.max !== undefined) {
    if (!Number.isFinite(f.max)) throw invalidRange(f.code);
    parts.push(Prisma.sql`${col} <= ${f.max}`);
  }
  if (parts.length === 0) throw invalidRange(f.code);
  return joinAnd(parts);
}

function invalidRange(code: string): SearchError {
  return new SearchError("INVALID_FILTER_VALUE", `Filter '${code}' requires a numeric min/max.`);
}

/**
 * Facet meta + countları toplar (disjunctive). Seçili facet'ler kendi filtresi HARİÇ; seçili olmayanlar
 * tam-filtreli kümede. Bounded: meta(1) + option-meta(1) + [seçili-olmayan-count(1) + numeric(1)] +
 * seçili facet başına [count(1) + numeric(1)].
 */
async function buildFacets(
  client: PrismaClient,
  storeId: string,
  universeDefIds: string[],
  resolvedFilters: ResolvedFilter[],
  originalFilters: SearchFilter[],
  whereWith: (excludeCode: string | null) => Prisma.Sql,
  categoryIds: string[] | null,
): Promise<SearchFacet[]> {
  // Meta (displayOrder = kategori-scope varsa o kapsamda MIN, yoksa store MIN — deterministik).
  const caScope = categoryIds
    ? Prisma.sql`AND ${inClause(Prisma.sql`ca."categoryId"`, categoryIds)}`
    : Prisma.empty;
  const meta = await client.$queryRaw<FacetMetaRow[]>(Prisma.sql`
    SELECT ad.id AS "attributeDefinitionId", ad.code, ad.name, ad."dataType", ad.unit,
      COALESCE((SELECT MIN(ca."displayOrder") FROM "CategoryAttribute" ca
                WHERE ca."storeId" = ${storeId} AND ca."attributeDefinitionId" = ad.id ${caScope}), 0) AS "displayOrder"
    FROM "AttributeDefinition" ad
    WHERE ${inClause(Prisma.sql`ad.id`, universeDefIds)} AND ad.status = 'ACTIVE'
      AND ad."dataType" NOT IN ('IMAGE','FILE')`);
  if (meta.length === 0) return [];

  const defById = new Map(meta.map((m) => [m.attributeDefinitionId, m]));
  const selectedDefIds = new Set(
    resolvedFilters.map((r) => r.attributeDefinitionId).filter((id) => defById.has(id)),
  );
  const nonSelectedDefIds = meta
    .filter((m) => !selectedDefIds.has(m.attributeDefinitionId))
    .map((m) => m.attributeDefinitionId);

  const counts: FacetCountRow[] = [];
  const ranges: FacetRangeRow[] = [];
  const numericDate = (id: string) => defById.get(id)!.dataType === "DATE";
  const isRange = (id: string) => RANGE_TYPES.has(defById.get(id)!.dataType);

  // (a) Seçili OLMAYAN facet'ler → tam-filtreli küme (whereWith(null)).
  if (nonSelectedDefIds.length > 0) {
    const numDefIds = nonSelectedDefIds.filter((id) => isRange(id) && !numericDate(id));
    const dateDefIds = nonSelectedDefIds.filter((id) => numericDate(id));
    const discreteDefIds = nonSelectedDefIds.filter((id) => !isRange(id));
    const w = whereWith(null);
    await collectCounts(client, storeId, w, discreteDefIds, counts);
    await collectRanges(client, storeId, w, numDefIds, NUMERIC_RANGE_EXPR, ranges);
    await collectRanges(client, storeId, w, dateDefIds, DATE_RANGE_EXPR, ranges);
  }

  // (b) Her SEÇİLİ facet → kendi filtresi hariç küme (whereWith(code)).
  for (const rf of resolvedFilters) {
    const m = defById.get(rf.attributeDefinitionId);
    if (!m) continue;
    const where = whereWith(rf.code);
    if (isRange(rf.attributeDefinitionId)) {
      const expr = m.dataType === "DATE" ? DATE_RANGE_EXPR : NUMERIC_RANGE_EXPR;
      await collectRanges(client, storeId, where, [rf.attributeDefinitionId], expr, ranges);
    } else {
      await collectCounts(client, storeId, where, [rf.attributeDefinitionId], counts);
    }
  }

  // Option meta (label/colorHex/sortOrder) — count satırlarındaki optionId'ler için.
  const optionIds = [...new Set(counts.map((c) => c.optionId).filter((v): v is string => v !== null))];
  const options =
    optionIds.length > 0
      ? await client.$queryRaw<OptionMetaRow[]>(Prisma.sql`
          SELECT id, "attributeDefinitionId", value, label, "colorHex", "sortOrder"
          FROM "AttributeOption"
          WHERE ${inClause(Prisma.sql`id`, optionIds)} AND status = 'ACTIVE'`)
      : [];

  return assembleFacets({ meta, counts, ranges, options, filters: originalFilters });
}

async function collectCounts(
  client: PrismaClient,
  storeId: string,
  where: Prisma.Sql,
  defIds: string[],
  out: FacetCountRow[],
): Promise<void> {
  if (defIds.length === 0) return;
  const rows = await client.$queryRaw<
    Array<{
      attributeDefinitionId: string;
      optionId: string | null;
      normalizedText: string | null;
      valueBoolean: boolean | null;
      count: number;
    }>
  >(Prisma.sql`
    SELECT f."attributeDefinitionId", f."optionId", f."normalizedText", f."valueBoolean",
           COUNT(DISTINCT f."productId")::int AS count
    FROM "ProductFacetValue" f
    JOIN "ProductSearchDocument" d ON d."productId" = f."productId"
    WHERE f."storeId" = ${storeId} AND ${inClause(Prisma.sql`f."attributeDefinitionId"`, defIds)} AND ${where}
    GROUP BY f."attributeDefinitionId", f."optionId", f."normalizedText", f."valueBoolean"`);
  for (const r of rows) out.push(r);
}

/** Numeric range: valueNumber (Decimal → string). */
const NUMERIC_RANGE_EXPR = Prisma.sql`f."valueNumber"`;
/** DATE range: valueDate → epoch millis (JS Date ile simetrik; facet range/filter epoch-ms kontratı). */
const DATE_RANGE_EXPR = Prisma.sql`(extract(epoch FROM f."valueDate") * 1000)`;

async function collectRanges(
  client: PrismaClient,
  storeId: string,
  where: Prisma.Sql,
  defIds: string[],
  valueExpr: Prisma.Sql,
  out: FacetRangeRow[],
): Promise<void> {
  if (defIds.length === 0) return;
  const rows = await client.$queryRaw<
    Array<{ attributeDefinitionId: string; availableMin: string | null; availableMax: string | null }>
  >(Prisma.sql`
    SELECT f."attributeDefinitionId",
           MIN(${valueExpr}) AS "availableMin", MAX(${valueExpr}) AS "availableMax"
    FROM "ProductFacetValue" f
    JOIN "ProductSearchDocument" d ON d."productId" = f."productId"
    WHERE f."storeId" = ${storeId} AND ${inClause(Prisma.sql`f."attributeDefinitionId"`, defIds)} AND ${where}
    GROUP BY f."attributeDefinitionId"`);
  for (const r of rows) {
    out.push({
      attributeDefinitionId: r.attributeDefinitionId,
      availableMin: r.availableMin === null ? null : Number(r.availableMin),
      availableMax: r.availableMax === null ? null : Number(r.availableMax),
    });
  }
}
