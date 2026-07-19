"use client";

import type { StorefrontDictionary } from "@commerce-os/i18n";
import { buildSearchHref, withInStock, type SearchState } from "../../../lib/search/url-state";
import { useSearchTransition } from "../search-transition";

/**
 * TODO-156C (brief §7) — STOK facet'i (top-level inStock). Switch DEĞİL, tek checkbox: "✓ Stoktakiler".
 * Tıklama YALNIZ URL'i günceller (withInStock → replace). Yerel state YOK.
 */
export function StockFacet({ state, t }: { state: SearchState; t: StorefrontDictionary }) {
  const s = t.search;
  const { navigate } = useSearchTransition();
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink">
      <input
        type="checkbox"
        checked={state.inStock}
        onChange={() => navigate(buildSearchHref(withInStock(state, !state.inStock)), { replace: true })}
        className="h-4 w-4 shrink-0 accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
      />
      <span className="flex-1">{s.stockInStockOnly}</span>
    </label>
  );
}
