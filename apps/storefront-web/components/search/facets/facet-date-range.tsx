"use client";

import { useState, type FormEvent } from "react";
import { buildSearchHref, setFilterRange } from "../../../lib/search/url-state";
import { useSearchTransition } from "../search-transition";
import type { FacetRendererProps } from "./types";

/**
 * TODO-156C (ANALIZ-156A §6.3, brief §9) — DATE range facet: iki tarih input'u (type=date).
 *
 * Backend değerleri EPOCH-MS'tir (`valueDate` → epoch); UI gün başına (UTC) yuvarlanmış yyyy-mm-dd ↔ epoch-ms
 * dönüşümü yapar. Bu faz "hazırlık": backend DATE facet gönderirse çalışır, aksi hiç render edilmez (universe'de
 * yoksa gelmez). Slider/takvim widget YOK; native tarih input'u (klavye + platform datepicker + a11y bedava).
 */
export function FacetDateRange(props: FacetRendererProps) {
  const r = props.facet.range;
  return <DateForm key={`${r?.selectedMin ?? ""}:${r?.selectedMax ?? ""}`} {...props} />;
}

function DateForm({ facet, state, t }: FacetRendererProps) {
  const s = t.search;
  const { navigate } = useSearchTransition();
  const range = facet.range;
  const [from, setFrom] = useState(range?.selectedMin != null ? epochToDay(range.selectedMin) : "");
  const [to, setTo] = useState(range?.selectedMax != null ? epochToDay(range.selectedMax) : "");

  const apply = (event: FormEvent) => {
    event.preventDefault();
    // Başlangıç = günün 00:00 UTC; bitiş = günün 23:59:59.999 UTC (kapsayıcı üst sınır).
    const min = dayToEpoch(from, false);
    const max = dayToEpoch(to, true);
    navigate(buildSearchHref(setFilterRange(state, facet.code, min, max)), { replace: true });
  };

  return (
    <form onSubmit={apply} className="space-y-3" aria-label={facet.name}>
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wideish text-ink-subtle">{s.dateFrom}</span>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-10 w-full rounded-none border border-line bg-surface px-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wideish text-ink-subtle">{s.dateTo}</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-10 w-full rounded-none border border-line bg-surface px-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
        />
      </label>
      <button
        type="submit"
        className="h-9 w-full rounded-none border border-ink px-4 text-[11px] font-medium uppercase tracking-wideish text-ink transition-colors hover:bg-ink hover:text-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        {s.rangeApply}
      </button>
    </form>
  );
}

/** epoch-ms → yyyy-mm-dd (UTC). */
function epochToDay(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** yyyy-mm-dd → epoch-ms (UTC); endOfDay ise günün son ms'i. Geçersiz/boş → null. */
function dayToEpoch(day: string, endOfDay: boolean): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const base = Date.UTC(y, mo - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(base)) return null;
  return endOfDay ? base + 86_399_999 : base;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
