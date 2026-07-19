/**
 * TODO-155 (ADR-079) — Faz 2C-8B · Public arama query PARSER (SAF, DB'siz test edilebilir).
 *
 * URL query string → normalize `SearchQuery`. Fastify VARSAYILAN querystring parser'ı kullanılır
 * (bracket syntax'ı NESNE'ye çevirmez); bu yüzden dinamik attribute filtreleri DÜZ anahtarlardan
 * (`filter[code]`, `filter[code][min]`, `filter[code][max]`) regex ile ayrıştırılır — açık ve kararlı
 * kontrat (ADR-079 §6.1'de belgeli). OpenSearch provider'a geçişte kontrat DEĞİŞMEZ.
 *
 * Kontratlı hatalar tipli döner (INVALID_SEARCH_QUERY / INVALID_SORT / INVALID_PAGINATION /
 * INVALID_FILTER / INVALID_FILTER_VALUE); route bunları 400 errorBody'ye eşler. SQL/internal mesaj YOK.
 */

import { SEARCH_SORT_KEYS, type SearchFilter, type SearchQuery, type SearchSortKey } from "@commerce-os/search-service";

export const SEARCH_DEFAULT_PAGE_SIZE = 24;
export const SEARCH_MAX_PAGE_SIZE = 100;
/** Offset overflow guard (page * pageSize taşmasını + absürd derin sayfayı önler). */
export const SEARCH_MAX_PAGE = 100_000;
export const SEARCH_MAX_Q_LENGTH = 200;
/** Kötüye kullanım guard'ları (bounded sorgu). */
const MAX_FILTERS = 40;
const MAX_VALUES_PER_FILTER = 100;

export type SearchQueryErrorCode =
  | "INVALID_SEARCH_QUERY"
  | "INVALID_SORT"
  | "INVALID_PAGINATION"
  | "INVALID_FILTER"
  | "INVALID_FILTER_VALUE";

export type ParseSearchResult =
  | { ok: true; value: SearchQuery }
  | { ok: false; code: SearchQueryErrorCode; message: string };

type RawQuery = Record<string, unknown>;

/** Fastify query değeri (string | string[] | undefined) → ilk string. */
function firstString(v: unknown): string | undefined {
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return typeof v === "string" ? v : undefined;
}

/** Bir filtre değerini virgülle böl + trim + boşları at. */
function splitValues(raw: unknown): string[] {
  const out: string[] = [];
  const pieces = Array.isArray(raw) ? raw : [raw];
  for (const p of pieces) {
    if (typeof p !== "string") continue;
    for (const part of p.split(",")) {
      const t = part.trim();
      if (t.length > 0) out.push(t);
    }
  }
  return out;
}

/** Tam sayı ayrıştır (yalnız ondalıksız tam sayı; "12.5"/"1e3"/"abc" reddi). */
function parseIntStrict(raw: string): number | null {
  if (!/^-?\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) ? n : null;
}

const FILTER_KEY = /^filter\[([^\]]+)\](?:\[(min|max)\])?$/;

export function parseSearchQuery(rawQuery: unknown): ParseSearchResult {
  const raw = (rawQuery ?? {}) as RawQuery;

  // q
  let q: string | undefined;
  const qRaw = firstString(raw.q);
  if (qRaw !== undefined) {
    const trimmed = qRaw.trim();
    if (trimmed.length > SEARCH_MAX_Q_LENGTH) {
      return { ok: false, code: "INVALID_SEARCH_QUERY", message: "Search query is too long." };
    }
    q = trimmed.length > 0 ? trimmed : undefined;
  }

  // category
  const categorySlug = firstString(raw.category)?.trim() || undefined;

  // page / pageSize
  let page = 1;
  const pageRaw = firstString(raw.page);
  if (pageRaw !== undefined) {
    const p = parseIntStrict(pageRaw);
    if (p === null || p < 1 || p > SEARCH_MAX_PAGE) {
      return { ok: false, code: "INVALID_PAGINATION", message: "Invalid page." };
    }
    page = p;
  }
  let pageSize = SEARCH_DEFAULT_PAGE_SIZE;
  const pageSizeRaw = firstString(raw.pageSize);
  if (pageSizeRaw !== undefined) {
    const ps = parseIntStrict(pageSizeRaw);
    if (ps === null || ps < 1 || ps > SEARCH_MAX_PAGE_SIZE) {
      return { ok: false, code: "INVALID_PAGINATION", message: "Invalid pageSize." };
    }
    pageSize = ps;
  }

  // sort
  let sort: SearchSortKey = "relevance";
  const sortRaw = firstString(raw.sort);
  if (sortRaw !== undefined && sortRaw.length > 0) {
    if (!(SEARCH_SORT_KEYS as readonly string[]).includes(sortRaw)) {
      return { ok: false, code: "INVALID_SORT", message: `Unsupported sort '${sortRaw}'.` };
    }
    sort = sortRaw as SearchSortKey;
  }

  // minPrice / maxPrice
  let minPrice: number | undefined;
  let maxPrice: number | undefined;
  const minRaw = firstString(raw.minPrice);
  if (minRaw !== undefined && minRaw.length > 0) {
    const n = parseIntStrict(minRaw);
    if (n === null || n < 0) {
      return { ok: false, code: "INVALID_FILTER_VALUE", message: "Invalid minPrice." };
    }
    minPrice = n;
  }
  const maxRaw = firstString(raw.maxPrice);
  if (maxRaw !== undefined && maxRaw.length > 0) {
    const n = parseIntStrict(maxRaw);
    if (n === null || n < 0) {
      return { ok: false, code: "INVALID_FILTER_VALUE", message: "Invalid maxPrice." };
    }
    maxPrice = n;
  }

  // inStock
  let inStock: boolean | undefined;
  const inStockRaw = firstString(raw.inStock);
  if (inStockRaw !== undefined && inStockRaw.length > 0) {
    const v = inStockRaw.trim().toLowerCase();
    if (v === "true" || v === "1") inStock = true;
    else if (v === "false" || v === "0") inStock = false;
    else return { ok: false, code: "INVALID_FILTER", message: "Invalid inStock." };
  }

  // Dinamik attribute filtreleri: filter[code], filter[code][min], filter[code][max].
  const byCode = new Map<string, { values: string[]; min?: number; max?: number; hasRange: boolean }>();
  for (const [key, value] of Object.entries(raw)) {
    const m = FILTER_KEY.exec(key);
    if (!m) continue;
    const code = m[1].trim();
    const bound = m[2] as "min" | "max" | undefined;
    if (code.length === 0) {
      return { ok: false, code: "INVALID_FILTER", message: "Empty filter code." };
    }
    const entry = byCode.get(code) ?? { values: [], hasRange: false };
    if (bound) {
      const raw1 = firstString(value);
      const n = raw1 === undefined ? null : parseIntStrict(raw1);
      if (n === null) {
        return { ok: false, code: "INVALID_FILTER_VALUE", message: `Invalid ${bound} for '${code}'.` };
      }
      entry[bound] = n;
      entry.hasRange = true;
    } else {
      const vals = splitValues(value);
      for (const v of vals) entry.values.push(v);
    }
    byCode.set(code, entry);
  }

  if (byCode.size > MAX_FILTERS) {
    return { ok: false, code: "INVALID_FILTER", message: "Too many filters." };
  }

  const filters: SearchFilter[] = [];
  for (const [code, entry] of byCode) {
    const hasValues = entry.values.length > 0;
    if (hasValues && entry.hasRange) {
      return {
        ok: false,
        code: "INVALID_FILTER",
        message: `Filter '${code}' cannot mix values and range.`,
      };
    }
    if (entry.hasRange) {
      filters.push({ code, min: entry.min, max: entry.max });
    } else if (hasValues) {
      if (entry.values.length > MAX_VALUES_PER_FILTER) {
        return { ok: false, code: "INVALID_FILTER", message: `Too many values for '${code}'.` };
      }
      filters.push({ code, values: [...new Set(entry.values)] });
    } else {
      return { ok: false, code: "INVALID_FILTER_VALUE", message: `Filter '${code}' has no value.` };
    }
  }

  const value: SearchQuery = {
    q,
    categorySlug,
    page,
    pageSize,
    sort,
    minPrice,
    maxPrice,
    inStock,
    filters,
  };
  return { ok: true, value };
}
