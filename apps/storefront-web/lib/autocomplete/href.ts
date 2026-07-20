/**
 * TODO-156E — Autocomplete öğe → hedef URL (SAF). Tüm arama hedefleri url-state codec'inden geçer →
 * gateway parser sözleşmesiyle birebir kanonik URL. Ürün = PDP path segment; kategori = PLP category param;
 * marka = q araması (marka facet'i YOK — searchText marka içerir; ayrı brand facet'i FUTURE, bkz. TECHNICAL_DEBT).
 */

import { buildSearchHref, emptySearchState, withCategory, withQuery } from "../search/url-state";

/** Sorgu-tamamlama / genel arama → /products?q=... (kanonik). */
export function suggestionHref(query: string): string {
  return buildSearchHref(withQuery(emptySearchState(), query));
}

/** Ürün → PDP (path segment; slug). */
export function productHref(slug: string): string {
  return `/products/${slug}`;
}

/** Kategori → /products?category=slug (PLP subtree). */
export function categoryHref(slug: string): string {
  return buildSearchHref(withCategory(emptySearchState(), slug));
}

/** Marka → /products?q=marka (marka facet'i yok; searchText marka'yı kapsar). */
export function brandHref(brand: string): string {
  return buildSearchHref(withQuery(emptySearchState(), brand));
}
