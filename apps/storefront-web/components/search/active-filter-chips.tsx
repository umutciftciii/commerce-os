"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import type { PublicSearchFacet } from "@commerce-os/api-client";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import {
  buildSearchHref,
  clearedSearchState,
  type SearchState,
} from "../../lib/search/url-state";
import { deriveActiveChips } from "../../lib/search/facets";
import { useSearchTransition } from "./search-transition";

/**
 * TODO-156C (ANALIZ-156A §4/§7, brief §4) — Grid üstü AKTİF FİLTRE ÇİPLERİ.
 *
 * Çipler YALNIZCA URL state'ten türetilir (`deriveActiveChips`; facet meta yalnız etiket). Her çip tekil "×"
 * (removeHref) + "Tümünü temizle". Gerçek <Link> (JS'siz de çalışır) + onClick ile `useTransition` (replace;
 * geçmiş kirlenmez). Hiç çip yoksa render edilmez. Yatay kaydırma mobilde (tek satır), sarma desktop'ta.
 */
export function ActiveFilterChips({
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
  const chips = deriveActiveChips(state, facets, { t, currency });
  if (chips.length === 0) return null;

  const onRemove = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate(href, { replace: true });
  };

  const clearAllHref = buildSearchHref(clearedSearchState(state));

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line py-3" aria-label={s.activeFiltersRegion} role="group">
      <span className="sr-only">{s.activeFiltersRegion}</span>
      <ul className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <li key={chip.id}>
            <Link
              href={chip.removeHref}
              onClick={onRemove(chip.removeHref)}
              aria-label={chip.removeLabel}
              className="group inline-flex items-center gap-2 rounded-none border border-line bg-surface px-3 py-1.5 text-xs text-ink transition-colors hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
            >
              <span className="text-ink-subtle">{chip.groupLabel}:</span>
              <span className="font-medium">{chip.valueLabel}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="text-ink-subtle transition-colors group-hover:text-ink">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={clearAllHref}
        onClick={onRemove(clearAllHref)}
        className="ml-1 text-[11px] font-medium uppercase tracking-wideish text-ink-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {s.clearAll}
      </Link>
    </div>
  );
}
