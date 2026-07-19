"use client";

import { useState } from "react";
import { format } from "@commerce-os/i18n";
import { buildSearchHref, toggleFilterValue } from "../../../lib/search/url-state";
import { useSearchTransition } from "../search-transition";
import type { FacetRendererProps } from "./types";

/**
 * TODO-156C (ANALIZ-156A §6, brief §6) — COLOR facet: gerçek renk swatch'ı.
 *
 * `colorHex` doluysa renk dairesi; yoksa nötr fallback (harf/desen değil, sade daire). Seçili → kalın halka +
 * onay işareti; count=0 & seçili değil → disabled. Native <input type=checkbox> (görsel gizli) → klavye/aria
 * doğal; label görsel swatch + ad + count taşır. Tooltip = title. Tıklama YALNIZ URL (toggleFilterValue).
 */
const DEFAULT_VISIBLE = 12;

export function FacetColorSwatch({ facet, state, t }: FacetRendererProps) {
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
      <ul className="flex flex-wrap gap-x-4 gap-y-3">
        {visible.map((value) => {
          const disabled = value.count === 0 && !value.selected;
          const inputId = `facet-${facet.code}-${value.value}`;
          const swatchLabel = format(s.swatchLabel, { label: value.label });
          return (
            <li key={value.value}>
              <label
                htmlFor={inputId}
                title={`${value.label} (${value.count})`}
                className={`flex flex-col items-center gap-1.5 ${
                  disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
                }`}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={value.selected}
                  disabled={disabled}
                  aria-label={`${swatchLabel} · ${value.count}`}
                  onChange={() => navigate(buildSearchHref(toggleFilterValue(state, facet.code, value.value)), { replace: true })}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  style={value.colorHex ? { backgroundColor: value.colorHex } : undefined}
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full border transition-shadow peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-paper ${
                    value.colorHex ? "border-line" : "border-dashed border-line-strong bg-surface-muted"
                  } ${value.selected ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : ""}`}
                >
                  {value.selected ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="drop-shadow">
                      <path
                        d="M3 7.5l2.5 2.5L11 4.5"
                        stroke={isLight(value.colorHex) ? "#111" : "#fff"}
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>
                <span className="max-w-[4.5rem] truncate text-center text-[11px] text-ink-muted">
                  {value.label}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
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

/** Onay işareti kontrastı: açık renk swatch'ta koyu tik, koyu renkte beyaz (kaba luminance eşiği). */
function isLight(hex: string | null): boolean {
  if (!hex) return true;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Rec. 601 luma; > 160 → açık kabul.
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}
