"use client";

import type { PublicSearchFacet } from "@commerce-os/api-client";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import {
  buildSearchHref,
  clearedFiltersOnly,
  type SearchState,
} from "../../lib/search/url-state";
import { countActiveFilters } from "../../lib/search/facets";
import { FacetList } from "./facets/facet-list";
import { useSearchTransition } from "./search-transition";

/**
 * TODO-156C (ANALIZ-156A §4.1/§5.1, brief §2) — Desktop kalıcı filtre RAYI (≥ lg).
 *
 * Sol sütun; kendi içinde sticky + scroll (uzun facet listesi header'ın altında yapışık kalır). Başlık +
 * (aktif varsa) "Temizle". İçerik PAYLAŞILAN `FacetList` (drawer ile aynı renderer). `lg` altında GİZLİ
 * (mobilde drawer devralır). Anında uygula: her tık URL'i günceller (FacetList içi), grid SSR ile tazelenir.
 */
export function FilterRail({
  facets,
  state,
  currency,
  t,
}: {
  facets: PublicSearchFacet[];
  state: SearchState;
  currency: string;
  t: StorefrontDictionary;
}) {
  const s = t.search;
  const { navigate } = useSearchTransition();
  const activeCount = countActiveFilters(state);
  // Fiyat/stok/dinamik daralma (q/category hariç) → "Temizle" göster.
  const filtersActive =
    state.minPrice !== null || state.maxPrice !== null || state.inStock || Object.keys(state.filters).length > 0;

  return (
    <aside aria-label={s.filterPanelTitle} className="hidden lg:block">
      <div className="sticky top-32 max-h-[calc(100vh-9rem)] overflow-y-auto pr-2">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wideish text-ink">
            {s.filterPanelTitle}
            {activeCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[10px] font-semibold text-surface">
                {activeCount}
              </span>
            ) : null}
          </h2>
          {filtersActive ? (
            <button
              type="button"
              onClick={() => navigate(buildSearchHref(clearedFiltersOnly(state)), { replace: true })}
              className="text-[11px] font-medium uppercase tracking-wideish text-ink-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {s.clearFilters}
            </button>
          ) : null}
        </div>
        <div className="pt-2">
          <FacetList facets={facets} state={state} currency={currency} t={t} />
        </div>
      </div>
    </aside>
  );
}
