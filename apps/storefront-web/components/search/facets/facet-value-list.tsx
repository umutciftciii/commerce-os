"use client";

import { useState } from "react";
import { format } from "@commerce-os/i18n";
import { buildSearchHref, toggleFilterValue } from "../../../lib/search/url-state";
import { useSearchTransition } from "../search-transition";
import type { FacetRendererProps } from "./types";

/**
 * TODO-156C (ANALIZ-156A §6, brief §5/§7) — Checkbox tabanlı değer listesi.
 *
 * SELECT / MULTI_SELECT / TEXT (MULTI) VE BOOLEAN (Evet/Hayır) facet'leri AYNI checkbox render'ını paylaşır
 * (brief §7: "switch yerine checkbox"). Her satır: native <input type=checkbox> (klavye + aria doğal) + etiket
 * + disjunctive count. count=0 & seçili değil → disabled (dimmed). Uzun listelerde "daha fazla göster" (ilk N).
 * Tıklama YALNIZ URL'i günceller (toggleFilterValue → replace); yerel seçim kopyası YOK.
 */
const DEFAULT_VISIBLE = 8;

export function FacetValueList({ facet, state, t }: FacetRendererProps) {
  const s = t.search;
  const { navigate } = useSearchTransition();
  const [expanded, setExpanded] = useState(false);

  const values = facet.values;
  if (values.length === 0) {
    return <p className="text-xs text-ink-subtle">{s.facetNoValues}</p>;
  }

  const visible = expanded ? values : values.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = values.length - visible.length;
  const groupId = `facet-${facet.code}`;

  return (
    <div role="group" aria-label={facet.name}>
      <ul className="space-y-0.5">
        {visible.map((value) => {
          const disabled = value.count === 0 && !value.selected;
          const inputId = `${groupId}-${value.value}`;
          return (
            <li key={value.value}>
              <label
                htmlFor={inputId}
                className={`flex items-center gap-3 py-1.5 text-sm transition-colors ${
                  disabled
                    ? "cursor-not-allowed text-ink-subtle opacity-50"
                    : "cursor-pointer text-ink-muted hover:text-ink"
                }`}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={value.selected}
                  disabled={disabled}
                  onChange={() => navigate(buildSearchHref(toggleFilterValue(state, facet.code, value.value)), { replace: true })}
                  className="h-4 w-4 shrink-0 accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
                />
                <span className="flex-1 truncate">{value.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-ink-subtle">{value.count}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {values.length > DEFAULT_VISIBLE ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[11px] font-medium uppercase tracking-wideish text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {expanded ? s.facetShowLess : format(s.facetShowMore, { count: hiddenCount })}
        </button>
      ) : null}
    </div>
  );
}
