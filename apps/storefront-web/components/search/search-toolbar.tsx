import type { PublicSearchFacet } from "@commerce-os/api-client";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { SearchState } from "../../lib/search/url-state";
import { SortControl } from "./sort-control";
import { FilterDrawer } from "./filter-drawer";

/**
 * TODO-156B/156C (brief §9/§3) — Araç çubuğu (RSC + client island'lar). Sonuç sayısı `aria-live="polite"`;
 * sıralama backend'in desteklediği 6 anahtar. 156C: `lg` altında mobil/tablet FİLTRE drawer tetikleyicisi
 * (FilterDrawer kendi içinde `lg:hidden`); ≥ lg'de kalıcı rail devralır → burada gizlenir. Sticky (header altında).
 */
export function SearchToolbar({
  state,
  totalItems,
  facets,
  currency,
  t,
}: {
  state: SearchState;
  totalItems: number;
  facets: PublicSearchFacet[];
  currency: string;
  t: StorefrontDictionary;
}) {
  const s = t.search;
  return (
    <div
      role="group"
      aria-label={s.toolbarRegion}
      className="sticky top-16 z-10 flex flex-col gap-4 border-b border-line bg-paper/95 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-3">
        <FilterDrawer facets={facets} state={state} currency={currency} totalItems={totalItems} t={t} />
        <p aria-live="polite" className="text-xs uppercase tracking-wideish text-ink-subtle">
          {format(s.resultCount, { count: totalItems })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SortControl state={state} t={t} />
      </div>
    </div>
  );
}
