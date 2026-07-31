"use client";

import { useState } from "react";
import { format } from "@commerce-os/i18n";
import { buildSearchHref, toggleFilterValue } from "../../../lib/search/url-state";
import { useSearchTransition } from "../search-transition";
import type { FacetRendererProps } from "./types";

/**
 * TODO-165 Fashion Vertical — SIZE facet: sıralı beden buton-ızgarası.
 *
 * Checkbox facet'iyle AYNI seçim semantiği (MULTI, disjunctive count, `toggleFilterValue` → URL replace);
 * yalnız SUNUM farklı — bir liste yerine dokunma-dostu toggle butonları (facet değer sırası korunur,
 * backend zaten sıralı döner). Seçili → dolu ink; count=0 & seçili değil → devre dışı (üstü çizili).
 * Native <button aria-pressed> (klavye/erişilebilirlik doğal); URL codec (url-state.ts) DEĞİŞMEZ.
 */
const DEFAULT_VISIBLE = 12;

export function FacetSizeGrid({ facet, state, t }: FacetRendererProps) {
  const s = t.search;
  const { navigate } = useSearchTransition();
  const [expanded, setExpanded] = useState(false);

  const values = facet.values;
  if (values.length === 0) {
    return <p className="text-xs text-ink-subtle">{s.facetNoValues}</p>;
  }

  const visible = expanded ? values : values.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = values.length - visible.length;

  return (
    <div role="group" aria-label={facet.name}>
      <div className="flex flex-wrap gap-2">
        {visible.map((value) => {
          const disabled = value.count === 0 && !value.selected;
          return (
            <button
              key={value.value}
              type="button"
              aria-pressed={value.selected}
              disabled={disabled}
              title={`${value.label} (${value.count})`}
              onClick={() =>
                navigate(buildSearchHref(toggleFilterValue(state, facet.code, value.value)), {
                  replace: true,
                })
              }
              className={[
                "min-w-[3rem] border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                value.selected
                  ? "border-ink bg-ink text-surface"
                  : "border-line text-ink-muted hover:border-ink hover:text-ink",
                disabled
                  ? "cursor-not-allowed text-line-strong line-through hover:border-line hover:text-line-strong"
                  : "",
              ].join(" ")}
            >
              {value.label}
            </button>
          );
        })}
      </div>
      {values.length > DEFAULT_VISIBLE ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-[11px] font-medium uppercase tracking-wideish text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {expanded ? s.facetShowLess : format(s.facetShowMore, { count: hiddenCount })}
        </button>
      ) : null}
    </div>
  );
}
