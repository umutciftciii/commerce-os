"use client";

import { useState, type FormEvent } from "react";
import { buildSearchHref, setFilterRange } from "../../../lib/search/url-state";
import { useSearchTransition } from "../search-transition";
import type { FacetRendererProps } from "./types";

/**
 * TODO-156C (ANALIZ-156A §6.3, brief §8) — INTEGER/DECIMAL range facet: iki sayısal input (min/max).
 *
 * SLIDER YOK, HISTOGRAM YOK (backend yalnız availableMin/Max verir; §6.3). Input taslağı geçici UI state'tir
 * (filtre state DEĞİL); "Uygula" / Enter → URL'e yazılır (setFilterRange → replace). URL değişince form `key`
 * ile REMOUNT olur → input'lar her zaman URL gerçeğine döner (yerel filtre kopyası kalıcılaşmaz). `unit` eki.
 *
 * NOT: gateway/codec `filter[code][min|max]`'i TAM SAYI olarak ayrıştırır → DECIMAL sınırları tam sayıya
 * yuvarlanır (bilinçli sınır; TECHNICAL_DEBT). Placeholder available sınırlarından floor/ceil ile türetilir.
 */
export function FacetNumberRange(props: FacetRendererProps) {
  const r = props.facet.range;
  // Seçili değere göre key → URL uygulanınca input'lar reseed olur.
  return <RangeForm key={`${r?.selectedMin ?? ""}:${r?.selectedMax ?? ""}`} {...props} />;
}

function RangeForm({ facet, state, t }: FacetRendererProps) {
  const s = t.search;
  const { navigate } = useSearchTransition();
  const range = facet.range;
  const [min, setMin] = useState(range?.selectedMin != null ? String(range.selectedMin) : "");
  const [max, setMax] = useState(range?.selectedMax != null ? String(range.selectedMax) : "");

  const availLo = range?.availableMin != null ? Math.floor(range.availableMin) : null;
  const availHi = range?.availableMax != null ? Math.ceil(range.availableMax) : null;

  const apply = (event: FormEvent) => {
    event.preventDefault();
    const parsedMin = toInt(min);
    const parsedMax = toInt(max);
    navigate(buildSearchHref(setFilterRange(state, facet.code, parsedMin, parsedMax)), { replace: true });
  };

  const unit = facet.unit ? ` (${facet.unit})` : "";

  return (
    <form onSubmit={apply} className="space-y-3" aria-label={`${facet.name}${unit}`}>
      <div className="flex items-center gap-2">
        <label className="flex-1">
          <span className="sr-only">{`${facet.name} ${s.rangeMin}`}</span>
          <input
            type="number"
            inputMode="numeric"
            value={min}
            min={availLo ?? undefined}
            max={availHi ?? undefined}
            placeholder={availLo != null ? String(availLo) : s.rangeMin}
            onChange={(e) => setMin(e.target.value)}
            className="h-10 w-full rounded-none border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          />
        </label>
        <span aria-hidden className="text-ink-subtle">
          {s.rangeSeparator}
        </span>
        <label className="flex-1">
          <span className="sr-only">{`${facet.name} ${s.rangeMax}`}</span>
          <input
            type="number"
            inputMode="numeric"
            value={max}
            min={availLo ?? undefined}
            max={availHi ?? undefined}
            placeholder={availHi != null ? String(availHi) : s.rangeMax}
            onChange={(e) => setMax(e.target.value)}
            className="h-10 w-full rounded-none border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          />
        </label>
      </div>
      <button
        type="submit"
        className="h-9 w-full rounded-none border border-ink px-4 text-[11px] font-medium uppercase tracking-wideish text-ink transition-colors hover:bg-ink hover:text-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        {s.rangeApply}
      </button>
    </form>
  );
}

/** Boş → null; aksi tam sayı (ondalık/harf reddi codec ile aynı). */
function toInt(raw: string): number | null {
  const t = raw.trim();
  if (t.length === 0) return null;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}
