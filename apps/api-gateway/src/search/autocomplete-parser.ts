/**
 * TODO-156E (ADR-084) — Faz 2C-8E · Autocomplete query PARSER (SAF, DB'siz test edilebilir).
 *
 * URL query string → normalize `SuggestQuery`. Autocomplete HAFİFtir: `q` (zorunlu, kısa) + opsiyonel `limit`
 * (yalnız ÜRÜN grubunu ölçekler; diğer gruplar sabit). Grup limitleri bounded sabitlerdir → yanıt küçük kalır.
 * Kontratlı hata tipli döner (INVALID_AUTOCOMPLETE_QUERY); route 400'e eşler. SQL/internal mesaj YOK.
 */

import type { SuggestQuery } from "@commerce-os/search-service";

/** Kullanıcı yazarken min tetik uzunluğu (sunucu permissive=1; istemci genelde 2 ile debounce eder). */
export const AUTOCOMPLETE_MIN_Q_LENGTH = 1;
export const AUTOCOMPLETE_MAX_Q_LENGTH = 100;

/** Sabit grup limitleri (bounded; yanıt küçük + hızlı). `limit` yalnız ürün grubunu override eder. */
export const AUTOCOMPLETE_DEFAULT_PRODUCTS = 6;
export const AUTOCOMPLETE_MAX_PRODUCTS = 10;
export const AUTOCOMPLETE_CATEGORIES = 5;
export const AUTOCOMPLETE_BRANDS = 5;
export const AUTOCOMPLETE_SUGGESTIONS = 6;

export type AutocompleteQueryErrorCode = "INVALID_AUTOCOMPLETE_QUERY";

export type ParseAutocompleteResult =
  | { ok: true; value: SuggestQuery }
  | { ok: false; code: AutocompleteQueryErrorCode; message: string };

type RawQuery = Record<string, unknown>;

/** Fastify query değeri (string | string[] | undefined) → ilk string. */
function firstString(v: unknown): string | undefined {
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return typeof v === "string" ? v : undefined;
}

/** Tam sayı ayrıştır (yalnız ondalıksız tam sayı; "abc"/"1.5" reddi). */
function parseIntStrict(raw: string): number | null {
  if (!/^-?\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) ? n : null;
}

export function parseAutocompleteQuery(rawQuery: unknown): ParseAutocompleteResult {
  const raw = (rawQuery ?? {}) as RawQuery;

  const qRaw = firstString(raw.q);
  const q = qRaw?.trim() ?? "";
  if (q.length < AUTOCOMPLETE_MIN_Q_LENGTH) {
    return { ok: false, code: "INVALID_AUTOCOMPLETE_QUERY", message: "Query is required." };
  }
  if (q.length > AUTOCOMPLETE_MAX_Q_LENGTH) {
    return { ok: false, code: "INVALID_AUTOCOMPLETE_QUERY", message: "Query is too long." };
  }

  let limitProducts = AUTOCOMPLETE_DEFAULT_PRODUCTS;
  const limitRaw = firstString(raw.limit);
  if (limitRaw !== undefined && limitRaw.length > 0) {
    const n = parseIntStrict(limitRaw);
    if (n === null || n < 1 || n > AUTOCOMPLETE_MAX_PRODUCTS) {
      return { ok: false, code: "INVALID_AUTOCOMPLETE_QUERY", message: "Invalid limit." };
    }
    limitProducts = n;
  }

  return {
    ok: true,
    value: {
      q,
      limitProducts,
      limitCategories: AUTOCOMPLETE_CATEGORIES,
      limitBrands: AUTOCOMPLETE_BRANDS,
      limitSuggestions: AUTOCOMPLETE_SUGGESTIONS,
    },
  };
}

/** Cache anahtarı için q normalizasyonu (case/space toleransı → daha yüksek hit oranı; motor da normalize eder). */
export function autocompleteCacheKey(storeId: string, value: SuggestQuery): string {
  const q = value.q.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
  return `${storeId}|${q}|p${value.limitProducts}`;
}
