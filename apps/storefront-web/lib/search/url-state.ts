/**
 * TODO-156B (ANALIZ-156A §7) — Storefront arama URL-state CODEC'i (TEK OTORITE).
 *
 * URL query string ↔ normalize `SearchState`. Bu modul SAF'tir (Next/React importu YOK):
 * hem RSC (sunucu; `searchParams` → fetch) hem client island'lar (yalniz URL gunceller) ayni
 * codec'i kullanir. Boylece "URL = tek gercek kaynak" ilkesi tek yerde uygulanir; yerel tekrar
 * eden filtre state'i YOKTUR.
 *
 * Sozlesme, gateway public search parser'iyla (apps/api-gateway/src/search/query-parser.ts) BIREBIR
 * hizalidir: `q`, `category`, `sort`, `page`, `pageSize`, `minPrice`, `maxPrice`, `inStock`,
 * `filter[code]=v1,v2`, `filter[code][min]`, `filter[code][max]`. Bu fazda dinamik filtre UI YOK; ancak
 * URL'de filtre varsa PASSTHROUGH edilir (endpoint'e eksiksiz aktarilir) — 156C facet UI'i bunu tuketir.
 *
 * Kanonik seri hale getirme (deterministik): anahtar sirasi sabit, filtre kodlari + coklu degerler
 * alfabetik, VARSAYILAN degerler (page=1, sort=relevance, pageSize=24, inStock=false, bos q/category)
 * ATILIR. Ayni secim → ayni URL (cache + canonical + paylasim tutarliligi). Bilinmeyen query paramlari
 * KORUNMAZ (kontrollu eleme): codec yalniz bilinen anahtarlari okur; sonraki gezinmede stray param
 * duser — canonical temizligi + SEO icin bilincli karar (ANALIZ §7 "elenir").
 */

export type SearchSort =
  | "relevance"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "title_asc"
  | "title_desc";

/** Backend'in desteklegi sort anahtarlari (SAHTE secenek uretilmez). */
export const SEARCH_SORTS: readonly SearchSort[] = [
  "relevance",
  "newest",
  "price_asc",
  "price_desc",
  "title_asc",
  "title_desc",
] as const;

export const DEFAULT_SORT: SearchSort = "relevance";
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;
/** Offset overflow guard (gateway ile ayni): absurd derin sayfayi kesler. */
export const MAX_PAGE = 100_000;
export const MAX_Q_LENGTH = 200;

/**
 * Tek bir dinamik attribute filtresi (bu fazda yalniz PASSTHROUGH; UI 156C). Facet ICI OR: coklu degerler,
 * VEYA numeric aralik (min/max). Ikisi ayni anda olamaz (gateway karistirmayi reddeder → codec de karistirmaz).
 */
export type SearchFilterState =
  | { kind: "values"; values: string[] }
  | { kind: "range"; min: number | null; max: number | null };

/** Normalize edilmis arama durumu (URL'in tek gercek kaynagi). */
export interface SearchState {
  q: string | null;
  category: string | null;
  /**
   * TODO-165A (ADR-165A) Task 20 — Marka (Brand.slug) daraltması. `category` ile AYNI desen: ayrı, sabit
   * query param (gateway `brand=<slug>` — bkz. apps/api-gateway/src/search/query-parser.ts). Attribute
   * filtre sistemine (filter[code]) GİRMEZ. `/markalar/[slug]` marka-filtreli PLP'yi bu alanla besler.
   */
  brand: string | null;
  page: number;
  pageSize: number;
  sort: SearchSort;
  minPrice: number | null;
  maxPrice: number | null;
  inStock: boolean;
  /** code → filtre (deterministik seri icin kodlar serialize'da siralanir). */
  filters: Record<string, SearchFilterState>;
}

/** Tum-varsayilan (bos) arama durumu — ilk PLP acilisi. */
export function emptySearchState(): SearchState {
  return {
    q: null,
    category: null,
    brand: null,
    page: DEFAULT_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,
    sort: DEFAULT_SORT,
    minPrice: null,
    maxPrice: null,
    inStock: false,
    filters: {},
  };
}

// ── Girdi normalizasyonu ────────────────────────────────────────────────────

/** RSC `searchParams` (Record) → Map<key, string[]> (coklu deger korunur). */
export function searchParamsToMap(
  params: Record<string, string | string[] | undefined>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    map.set(key, Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [value]);
  }
  return map;
}

/** Client `URLSearchParams` → Map<key, string[]>. */
export function urlSearchParamsToMap(sp: URLSearchParams): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const key of sp.keys()) {
    if (map.has(key)) continue;
    map.set(key, sp.getAll(key));
  }
  return map;
}

// ── Ayristirma yardimcilari (saf) ───────────────────────────────────────────

function firstString(values: string[] | undefined): string | undefined {
  return values && values.length > 0 ? values[0] : undefined;
}

/** Tam sayi (ondalik/exponent/harf reddi); aksi null. */
function parseIntStrict(raw: string): number | null {
  const t = raw.trim();
  if (!/^-?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

function parseNonNegInt(raw: string | undefined): number | null {
  if (raw === undefined || raw.length === 0) return null;
  const n = parseIntStrict(raw);
  return n !== null && n >= 0 ? n : null;
}

/** Virgulle bolunmus deger listesi → trim + bos-at (tekrar korunur; serialize deduplar). */
function splitValues(values: string[]): string[] {
  const out: string[] = [];
  for (const piece of values) {
    for (const part of piece.split(",")) {
      const t = part.trim();
      if (t.length > 0) out.push(t);
    }
  }
  return out;
}

const FILTER_KEY = /^filter\[([^\]]+)\](?:\[(min|max)\])?$/;

/**
 * Map<key,string[]> → normalize `SearchState`. LENIENT: gecersiz/bilinmeyen degerler sessizce
 * varsayilana duser (ANALIZ §15 "sessiz kurtarma"). Boylece bozuk deep-link patlamaz, temiz duruma iner.
 */
export function parseSearchState(map: Map<string, string[]>): SearchState {
  const state = emptySearchState();

  // q
  const qRaw = firstString(map.get("q"));
  if (qRaw !== undefined) {
    const trimmed = qRaw.trim().slice(0, MAX_Q_LENGTH);
    state.q = trimmed.length > 0 ? trimmed : null;
  }

  // category (slug; ham korunur)
  const categoryRaw = firstString(map.get("category"))?.trim();
  state.category = categoryRaw && categoryRaw.length > 0 ? categoryRaw : null;

  // brand (slug; ham korunur — category ile aynı desen)
  const brandRaw = firstString(map.get("brand"))?.trim();
  state.brand = brandRaw && brandRaw.length > 0 ? brandRaw : null;

  // sort
  const sortRaw = firstString(map.get("sort"));
  if (sortRaw && (SEARCH_SORTS as readonly string[]).includes(sortRaw)) {
    state.sort = sortRaw as SearchSort;
  }

  // page
  const page = parseNonNegInt(firstString(map.get("page")));
  if (page !== null && page >= 1 && page <= MAX_PAGE) state.page = page;

  // pageSize
  const pageSize = parseNonNegInt(firstString(map.get("pageSize")));
  if (pageSize !== null && pageSize >= 1 && pageSize <= MAX_PAGE_SIZE) state.pageSize = pageSize;

  // minPrice / maxPrice
  state.minPrice = parseNonNegInt(firstString(map.get("minPrice")));
  state.maxPrice = parseNonNegInt(firstString(map.get("maxPrice")));

  // inStock (true/1 → true; digerleri false)
  const inStockRaw = firstString(map.get("inStock"))?.trim().toLowerCase();
  state.inStock = inStockRaw === "true" || inStockRaw === "1";

  // Dinamik attribute filtreleri: filter[code], filter[code][min], filter[code][max].
  const byCode = new Map<string, { values: string[]; min: number | null; max: number | null; hasRange: boolean }>();
  for (const [key, values] of map) {
    const m = FILTER_KEY.exec(key);
    if (!m) continue;
    const code = m[1].trim();
    if (code.length === 0) continue;
    const bound = m[2] as "min" | "max" | undefined;
    const entry = byCode.get(code) ?? { values: [], min: null, max: null, hasRange: false };
    if (bound) {
      const n = parseNonNegInt(firstString(values));
      if (n !== null) {
        entry[bound] = n;
        entry.hasRange = true;
      }
    } else {
      for (const v of splitValues(values)) entry.values.push(v);
    }
    byCode.set(code, entry);
  }
  for (const [code, entry] of byCode) {
    // Karisim (values + range) → gateway reddeder; codec values'i tercih eder (deterministik).
    if (entry.values.length > 0) {
      state.filters[code] = { kind: "values", values: [...new Set(entry.values)] };
    } else if (entry.hasRange && (entry.min !== null || entry.max !== null)) {
      state.filters[code] = { kind: "range", min: entry.min, max: entry.max };
    }
  }

  return state;
}

/** RSC kolayligi: Next `searchParams` → SearchState. */
export function parseServerSearchParams(
  params: Record<string, string | string[] | undefined>,
): SearchState {
  return parseSearchState(searchParamsToMap(params));
}

// ── Kanonik seri hale getirme ────────────────────────────────────────────────

/**
 * SearchState → kanonik query string (BASINDA `?` YOK). Deterministik anahtar sirasi, alfabetik filtre
 * kodlari + coklu degerler, VARSAYILANLAR atilir. Hem tarayici URL'i hem gateway sorgusu icin AYNI cikti
 * (gateway varsayilanlari yeniden uygular). Degerler encodeURIComponent'lidir; filter[]/virgul yapisI okunur kalir.
 */
export function serializeSearchState(state: SearchState): string {
  const parts: string[] = [];
  const enc = encodeURIComponent;

  if (state.q) parts.push(`q=${enc(state.q)}`);
  if (state.category) parts.push(`category=${enc(state.category)}`);
  if (state.brand) parts.push(`brand=${enc(state.brand)}`);

  // Dinamik filtreler (kod alfabetik).
  for (const code of Object.keys(state.filters).sort()) {
    const filter = state.filters[code];
    if (filter.kind === "values") {
      const values = [...new Set(filter.values)].sort((a, b) => a.localeCompare(b));
      if (values.length > 0) {
        parts.push(`filter[${enc(code)}]=${values.map(enc).join(",")}`);
      }
    } else {
      if (filter.min !== null) parts.push(`filter[${enc(code)}][min]=${filter.min}`);
      if (filter.max !== null) parts.push(`filter[${enc(code)}][max]=${filter.max}`);
    }
  }

  if (state.minPrice !== null) parts.push(`minPrice=${state.minPrice}`);
  if (state.maxPrice !== null) parts.push(`maxPrice=${state.maxPrice}`);
  if (state.inStock) parts.push(`inStock=1`);
  if (state.sort !== DEFAULT_SORT) parts.push(`sort=${state.sort}`);
  if (state.pageSize !== DEFAULT_PAGE_SIZE) parts.push(`pageSize=${state.pageSize}`);
  if (state.page !== DEFAULT_PAGE) parts.push(`page=${state.page}`);

  return parts.join("&");
}

/** `/products` + kanonik query (bos ise sade `/products`). Pagination/sort/link href kaynagi. */
export function buildSearchHref(state: SearchState, pathname = "/products"): string {
  const qs = serializeSearchState(state);
  return qs.length > 0 ? `${pathname}?${qs}` : pathname;
}

// ── Deterministik state mutasyonlari (saf; kopya doner) ──────────────────────

/**
 * Filtre/sort/q/kategori/fiyat/stok degisince page 1'e doner (ANALIZ §7). Yalniz sayfa gezinmesi page'i korur.
 */
export function withSort(state: SearchState, sort: SearchSort): SearchState {
  return { ...state, sort, page: DEFAULT_PAGE };
}

export function withPage(state: SearchState, page: number): SearchState {
  const safe = Number.isSafeInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : DEFAULT_PAGE;
  return { ...state, page: safe };
}

export function withQuery(state: SearchState, q: string | null): SearchState {
  const trimmed = q?.trim().slice(0, MAX_Q_LENGTH) ?? "";
  return { ...state, q: trimmed.length > 0 ? trimmed : null, page: DEFAULT_PAGE };
}

export function withCategory(state: SearchState, category: string | null): SearchState {
  return { ...state, category: category && category.length > 0 ? category : null, page: DEFAULT_PAGE };
}

/** TODO-165A (ADR-165A) Task 20 — Marka daraltmasını ayarlar (withCategory ile aynı desen). */
export function withBrand(state: SearchState, brand: string | null): SearchState {
  return { ...state, brand: brand && brand.length > 0 ? brand : null, page: DEFAULT_PAGE };
}

/** Aramayi/filtreleri tamamen temizler (q + category + filtre + fiyat + stok); sort/pageSize korunur. */
export function clearedSearchState(state: SearchState): SearchState {
  return {
    ...emptySearchState(),
    sort: state.sort,
    pageSize: state.pageSize,
  };
}

/**
 * Yalniz DINAMIK/fiyat/stok filtrelerini temizler; q ve category KORUNUR (arama/kategori baglaminda
 * "filtreleri temizle" davranisi). sort/pageSize de korunur; page 1'e doner.
 */
export function clearedFiltersOnly(state: SearchState): SearchState {
  return {
    ...state,
    page: DEFAULT_PAGE,
    minPrice: null,
    maxPrice: null,
    inStock: false,
    filters: {},
  };
}

// ── TODO-156C (ANALIZ-156A §6-§7) — Dinamik facet URL mutasyonlari (SAF) ──────
//
// Her mutasyon page'i 1'e dondurur (filtre degisimi yeni sonuc uzayi). Islem SAF: kopya doner, girdiyi
// mutate ETMEZ. Bos hale gelen filtre kodu haritadan SILINIR (kanonik serialize + cip turetimi temiz kalir).
// Bu fonksiyonlar facet UI (checkbox/color/boolean/range) + cip kaldirma icin TEK yazma noktasidir.

/** filters haritasindan bir kodu immutably siler. */
function withoutFilterCode(filters: Record<string, SearchFilterState>, code: string): Record<string, SearchFilterState> {
  if (!(code in filters)) return filters;
  const next: Record<string, SearchFilterState> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (k !== code) next[k] = v;
  }
  return next;
}

/**
 * Bir values-tipli facet degerini ekler/kaldirir (MULTI/BOOLEAN/COLOR — facet ICI OR). Zaten seciliyse
 * kaldirir; degilse ekler. Filtre bosalirsa kod silinir. Range-tipli mevcut filtre varsa values'a gecirilir.
 */
export function toggleFilterValue(state: SearchState, code: string, value: string): SearchState {
  const trimmed = value.trim();
  if (trimmed.length === 0) return state;
  const existing = state.filters[code];
  const current = existing && existing.kind === "values" ? existing.values : [];
  const set = new Set(current);
  if (set.has(trimmed)) set.delete(trimmed);
  else set.add(trimmed);
  const values = [...set];
  const filters =
    values.length === 0
      ? withoutFilterCode(state.filters, code)
      : { ...state.filters, [code]: { kind: "values" as const, values } };
  return { ...state, filters, page: DEFAULT_PAGE };
}

/** Bir values-tipli facet degerini yalnizca KALDIRIR (cip "×"); yoksa degistirmez. */
export function removeFilterValue(state: SearchState, code: string, value: string): SearchState {
  const existing = state.filters[code];
  if (!existing || existing.kind !== "values") return state;
  if (!existing.values.includes(value)) return state;
  const values = existing.values.filter((v) => v !== value);
  const filters =
    values.length === 0
      ? withoutFilterCode(state.filters, code)
      : { ...state.filters, [code]: { kind: "values" as const, values } };
  return { ...state, filters, page: DEFAULT_PAGE };
}

/** Bir filtre kodunu tamamen kaldirir (facet-seviyesi temizleme / range cip). */
export function removeFilter(state: SearchState, code: string): SearchState {
  if (!(code in state.filters)) return state;
  return { ...state, filters: withoutFilterCode(state.filters, code), page: DEFAULT_PAGE };
}

/**
 * Bir range-tipli dinamik facet'in min/max'ini ayarlar (INTEGER/DECIMAL/DATE). Ikisi de null → filtre silinir.
 * Negatif/gecersiz sayi null'a duser (codec zaten reddeder). min>max mantiksal kontrolu UI'da; codec ham tutar.
 */
export function setFilterRange(
  state: SearchState,
  code: string,
  min: number | null,
  max: number | null,
): SearchState {
  const safeMin = min !== null && Number.isSafeInteger(min) && min >= 0 ? min : null;
  const safeMax = max !== null && Number.isSafeInteger(max) && max >= 0 ? max : null;
  if (safeMin === null && safeMax === null) {
    return removeFilter(state, code);
  }
  return {
    ...state,
    filters: { ...state.filters, [code]: { kind: "range", min: safeMin, max: safeMax } },
    page: DEFAULT_PAGE,
  };
}

/** Top-level fiyat aralığı (minPrice/maxPrice, minor birim). Ikisi de null → temizlenir. */
export function withPrice(state: SearchState, min: number | null, max: number | null): SearchState {
  const safeMin = min !== null && Number.isSafeInteger(min) && min >= 0 ? min : null;
  const safeMax = max !== null && Number.isSafeInteger(max) && max >= 0 ? max : null;
  return { ...state, minPrice: safeMin, maxPrice: safeMax, page: DEFAULT_PAGE };
}

/** Top-level stok filtresi (inStock). */
export function withInStock(state: SearchState, on: boolean): SearchState {
  return { ...state, inStock: on, page: DEFAULT_PAGE };
}

/** URL'de herhangi bir daraltma (q/category/fiyat/stok/dinamik filtre) var mi. */
export function hasActiveNarrowing(state: SearchState): boolean {
  return (
    state.q !== null ||
    state.category !== null ||
    state.brand !== null ||
    state.minPrice !== null ||
    state.maxPrice !== null ||
    state.inStock ||
    Object.keys(state.filters).length > 0
  );
}
