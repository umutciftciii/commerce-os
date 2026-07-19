/**
 * TODO-156B (brief §16) — Arama/PLP SEO temel kararları (SAF, test edilebilir). Tam JSON-LD + audit 156D.
 *
 * Kurallar:
 *  - Düz PLP + kategori-yalnız (q/filtre/fiyat/stok YOK) → index,follow (canonical zemini).
 *  - Arama (q) VEYA herhangi bir filtre/fiyat/stok daraltması → noindex,follow (kombinasyon patlaması + arama
 *    sonuç sayfaları indexlenmez — Google en iyi pratiği). Filtre URL'leri ana kategoriye canonical'la EZİLMEZ.
 *  - Canonical (yalnız indexable): kategori + page korunur; sort/pageSize/filtre DÜŞER (query param normalize).
 *    page>1 self-canonical (`?page=n`), page 1 temiz path.
 */
import {
  buildSearchHref,
  emptySearchState,
  hasActiveNarrowing,
  type SearchState,
} from "./url-state";

/** Sayfa indexlenmeli mi (arama/filtre yoksa evet). Kategori-yalnız indexlenebilir. */
export function isIndexable(state: SearchState): boolean {
  if (state.q !== null) return false;
  // Kategori dışındaki her daraltma (fiyat/stok/dinamik filtre) → noindex.
  return (
    state.minPrice === null &&
    state.maxPrice === null &&
    !state.inStock &&
    Object.keys(state.filters).length === 0
  );
}

export function robotsFor(state: SearchState): { index: boolean; follow: boolean } {
  return { index: isIndexable(state), follow: true };
}

/**
 * Kanonik path. Indexable ise kategori + page korunur (sort/filtre normalize edilir/düşer). Indexable
 * değilse self-canonical (mevcut anlamlı state; ana kategoriye ezme YOK) — buildSearchHref deterministiktir.
 */
export function canonicalPath(state: SearchState): string {
  if (isIndexable(state)) {
    const canonical = emptySearchState();
    canonical.category = state.category;
    canonical.page = state.page; // page>1 self-canonical; page=1 serialize'da düşer.
    return buildSearchHref(canonical);
  }
  // noindex sayfalar: self-canonical (sort/pageSize hariç normalize; filtre/q korunur).
  const self: SearchState = { ...state, sort: emptySearchState().sort, pageSize: emptySearchState().pageSize };
  return buildSearchHref(self);
}

/** noindex sayfalarda daraltma var mı (title'a "arama"/"filtre" bağlamı için). */
export function isNarrowed(state: SearchState): boolean {
  return hasActiveNarrowing(state);
}
