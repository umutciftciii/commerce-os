"use client";

import { useState, type FormEvent } from "react";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { buildSearchHref, withPrice, type SearchState } from "../../../lib/search/url-state";
import { useSearchTransition } from "../search-transition";

/**
 * TODO-156C (ANALIZ-156A §6.2) — FİYAT facet'i (top-level minPrice/maxPrice; ayrı bir attribute DEĞİL).
 *
 * Range component'inin currency-formatlı özel hâli: kullanıcı ANA birimde (₺) girer, URL'e MINOR (kuruş) yazılır
 * (×100; mağaza TRY). URL değişince form `key` ile reseed olur. Slider/histogram YOK (§6.3). Input taslağı
 * geçici UI state; "Uygula"/Enter → withPrice → replace.
 */
const MINOR_PER_MAJOR = 100;

export function PriceFacet({
  state,
  currency,
  t,
}: {
  state: SearchState;
  currency: string;
  t: StorefrontDictionary;
}) {
  return <PriceForm key={`${state.minPrice ?? ""}:${state.maxPrice ?? ""}`} state={state} currency={currency} t={t} />;
}

function PriceForm({ state, currency, t }: { state: SearchState; currency: string; t: StorefrontDictionary }) {
  const s = t.search;
  const { navigate } = useSearchTransition();
  const [min, setMin] = useState(state.minPrice != null ? String(Math.floor(state.minPrice / MINOR_PER_MAJOR)) : "");
  const [max, setMax] = useState(state.maxPrice != null ? String(Math.floor(state.maxPrice / MINOR_PER_MAJOR)) : "");

  const apply = (event: FormEvent) => {
    event.preventDefault();
    const minMinor = majorToMinor(min);
    const maxMinor = majorToMinor(max);
    navigate(buildSearchHref(withPrice(state, minMinor, maxMinor)), { replace: true });
  };

  const symbol = currencySymbol(currency);

  return (
    <form onSubmit={apply} className="space-y-3" aria-label={s.priceFacetLabel}>
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <span className="sr-only">{s.priceMin}</span>
          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">
            {symbol}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={min}
            placeholder={s.priceMin}
            onChange={(e) => setMin(e.target.value)}
            className="h-10 w-full rounded-none border border-line bg-surface pl-7 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          />
        </label>
        <span aria-hidden className="text-ink-subtle">
          {s.rangeSeparator}
        </span>
        <label className="relative flex-1">
          <span className="sr-only">{s.priceMax}</span>
          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">
            {symbol}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={max}
            placeholder={s.priceMax}
            onChange={(e) => setMax(e.target.value)}
            className="h-10 w-full rounded-none border border-line bg-surface pl-7 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
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

/** Ana birim (₺, tam sayı) → minor (kuruş). Boş/geçersiz → null. */
function majorToMinor(raw: string): number | null {
  const t = raw.trim();
  if (t.length === 0) return null;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isSafeInteger(n)) return null;
  return n * MINOR_PER_MAJOR;
}

/** Para birimi sembolü (Intl'den); başarısızsa kodun kendisi. */
function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("tr-TR", { style: "currency", currency }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}
