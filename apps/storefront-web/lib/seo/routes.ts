/**
 * TODO-156D (ADR-080) — SEO URL GOVERNANCE (TEK OTORİTE, deterministik, çerçeve-bağımsız).
 *
 * Ürün / kategori / arama / ana sayfa URL kuralları TEK yerden üretilir (brief §2). Route bileşenleri path
 * string'ini ELLE kurmaz — daima bu builder'ları çağırır → "route bazında tekrar/rastgele slug yok" garantisi.
 * SAF: Next/React importu yok; hem RSC hem client kullanır. locale genişlemeye açık (opts.locale ileride
 * `/{locale}` prefix'i ekleyebilir; bugün tek locale → prefix yok, imza hazır).
 *
 * Arama URL'i codec'e delege edilir (lib/search/url-state — mevcut tek arama otoritesi); bu modül onun
 * üzerine ürün/kategori/statik path'leri ekler. Kategori surface kararı: kategori = PLP `/products?category=slug`
 * (ayrı `/categories/*` route YOK → soft-404 + duplicate önlenir; bkz. ADR-080 §Kategori).
 */
import { productUrlPath } from "@commerce-os/utils";
import { buildSearchHref, emptySearchState, type SearchState } from "../search/url-state";

/** Ana sayfa. */
export function homePath(): string {
  return "/";
}

/** Tüm ürünler / arama giriş (düz PLP). */
export function productsPath(): string {
  return "/products";
}

/** Ürün detay path'i (handle = slug). Redirect yazımıyla TEK KAYNAK (`@commerce-os/utils` productUrlPath). */
export function productPath(handle: string): string {
  return productUrlPath(handle);
}

/**
 * Kategori landing path'i = PLP + `category=slug` (kanonik). page>1 opsiyonel. Kategori kanonik URL'inin
 * TEK kaynağı; breadcrumb/JSON-LD/sitemap buradan besler. Boş slug → düz PLP (güvenli).
 */
export function categoryPath(slug: string, opts: { page?: number } = {}): string {
  const trimmed = slug.trim();
  if (trimmed.length === 0) return productsPath();
  const state = emptySearchState();
  state.category = trimmed;
  if (opts.page && opts.page > 1) state.page = opts.page;
  return buildSearchHref(state);
}

/** Arama state → PLP href (codec otoritesi; kanonik query normalize). */
export function searchPath(state: SearchState): string {
  return buildSearchHref(state);
}

/**
 * Kategori landing href'inden (`/products?category=slug`) slug'ı çıkarır; yoksa null. `categoryPath`'in
 * TERSİ. Navigasyon kategorisini (FEATURED_CATEGORIES) seçili `state.category` slug'ıyla eşleştirmek için
 * TEK yer (chip aktif-vurgusu + PLP başlığı görünen adı aynı kaynağı kullanır).
 */
export function categorySlugFromHref(href: string): string | null {
  const match = href.match(/[?&]category=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** WebSite JSON-LD SearchAction target şablonu (ham `{search_term_string}` yer tutucu). */
export function searchActionTemplate(): string {
  return `${productsPath()}?q={search_term_string}`;
}
