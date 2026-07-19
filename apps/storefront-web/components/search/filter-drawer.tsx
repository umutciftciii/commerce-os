"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PublicSearchFacet } from "@commerce-os/api-client";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import {
  buildSearchHref,
  clearedFiltersOnly,
  type SearchState,
} from "../../lib/search/url-state";
import { countActiveFilters } from "../../lib/search/facets";
import { FacetList } from "./facets/facet-list";
import { useSearchTransition } from "./search-transition";

/**
 * TODO-156C (ANALIZ-156A §4.2-§4.3/§5.2, brief §3) — Mobil/tablet filtre DRAWER'ı (< lg).
 *
 * Tetikleyici "Filtrele (n)" + soldan tam-yükseklik overlay. İçerik desktop rail ile AYNI `FacetList`
 * (tek renderer; kopya YOK). Anında uygula: her seçim URL'i günceller → grid SSR ile tazelenir, sayaç
 * ("n Ürünü Göster") canlı kalır (yerel filtre state YOK). Erişilebilir dialog: role=dialog + aria-modal,
 * ESC kapatır, body scroll-lock, focus-trap (Tab döngüsü), kapanınca focus tetikleyiciye döner.
 */
export function FilterDrawer({
  facets,
  state,
  currency,
  totalItems,
  t,
}: {
  facets: PublicSearchFacet[];
  state: SearchState;
  currency: string;
  totalItems: number;
  t: StorefrontDictionary;
}) {
  const s = t.search;
  const { navigate } = useSearchTransition();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const activeCount = countActiveFilters(state);
  const filtersActive =
    state.minPrice !== null || state.maxPrice !== null || state.inStock || Object.keys(state.filters).length > 0;

  // ESC + body scroll-lock + focus yönetimi (focus-trap).
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    // İlk odaklanabilir öğeye (kapat butonu) odaklan.
    const focusFirst = () => {
      const focusables = getFocusable(panelRef.current);
      (focusables[0] ?? panelRef.current)?.focus();
    };
    focusFirst();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = getFocusable(panelRef.current);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      // Kapanınca odak tetikleyiciye döner (erişilebilirlik).
      (triggerRef.current ?? previouslyFocused)?.focus();
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-none border border-line px-4 text-xs font-medium uppercase tracking-wideish text-ink transition-colors hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M1 3h12M3 7h8M5 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {s.filterButton}
        {activeCount > 0 ? (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold text-surface">
            {activeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <button
            type="button"
            aria-label={s.filterClose}
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          {/* Panel */}
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative flex h-full w-[min(22rem,88vw)] flex-col bg-paper shadow-md"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 id={titleId} className="text-xs font-medium uppercase tracking-wideish text-ink">
                {s.filterPanelTitle}
              </h2>
              <button
                type="button"
                aria-label={s.filterClose}
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-2">
              <FacetList facets={facets} state={state} currency={currency} t={t} />
            </div>

            <div className="flex items-center gap-3 border-t border-line px-5 py-4">
              <button
                type="button"
                disabled={!filtersActive}
                onClick={() => navigate(buildSearchHref(clearedFiltersOnly(state)), { replace: true })}
                className="h-11 flex-1 rounded-none border border-line px-4 text-xs font-medium uppercase tracking-wideish text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                {s.filterClear}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-11 flex-[1.4] rounded-none bg-ink px-4 text-xs font-medium uppercase tracking-wideish text-surface transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                {format(s.filterShowResults, { count: totalItems })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Panel içindeki odaklanabilir öğeleri belge sırasında döndürür (focus-trap). */
function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}
