"use client";

import type { StorefrontDictionary } from "@commerce-os/i18n";
import { Select } from "../ui/field";
import { buildSearchHref, withSort, type SearchSort, type SearchState } from "../../lib/search/url-state";
import { useSearchTransition } from "./search-transition";

/**
 * TODO-156B (ANALIZ §7/§8 · brief §9) — Sıralama denetimi (yalnız backend'in desteklediği 6 anahtar).
 * Değişince: URL güncellenir (replace — geçmiş kirlenmez), page=1'e döner, `useTransition` ile pending.
 * SAHTE sıralama seçeneği gösterilmez. Sunucu değeri (`state.sort`) tek otoritedir (kontrollü <select>).
 */
const SORT_OPTIONS: { value: SearchSort; key: keyof StorefrontDictionary["search"] }[] = [
  { value: "relevance", key: "sortRelevance" },
  { value: "newest", key: "sortNewest" },
  { value: "price_asc", key: "sortPriceAsc" },
  { value: "price_desc", key: "sortPriceDesc" },
  { value: "title_asc", key: "sortTitleAsc" },
  { value: "title_desc", key: "sortTitleDesc" },
];

export function SortControl({ state, t }: { state: SearchState; t: StorefrontDictionary }) {
  const s = t.search;
  const { navigate } = useSearchTransition();

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">{s.sortLabel}</span>
      <Select
        aria-label={s.sortLabel}
        value={state.sort}
        onChange={(event) => {
          const next = withSort(state, event.target.value as SearchSort);
          navigate(buildSearchHref(next), { replace: true, scroll: false });
        }}
        className="h-10 min-w-[11rem] text-xs"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {s[option.key]}
          </option>
        ))}
      </Select>
    </label>
  );
}
