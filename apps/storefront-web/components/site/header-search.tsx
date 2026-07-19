"use client";

import type { StorefrontDictionary } from "@commerce-os/i18n";
import { SearchCombobox } from "../search/autocomplete/search-combobox";

/**
 * TODO-156E (ADR-084) — Header arama alanı = enterprise autocomplete COMBOBOX (SearchCombobox).
 * Native GET fallback korunur (combobox içindeki `<form action="/products">` → JS kapalıyken submit çalışır;
 * yeni arama /products?q=..., diğer paramları sıfırlar). Debounce/abort/cache/klavye/mobil hepsi combobox'ta.
 * (Önceki düz input + `useSearchParams` prefill DEĞİŞTİ; combobox kendi `q` state'ini yönetir.)
 */
export function HeaderSearch({ t, className }: { t: StorefrontDictionary; className?: string }) {
  return (
    <div className={className}>
      <SearchCombobox t={t} variant="header" />
    </div>
  );
}

/**
 * Suspense/hydration fallback — statik native GET form (prefill YOK ama JS'siz submit çalışır). Görsel olarak
 * combobox input'uyla birebir.
 */
export function HeaderSearchFallback({
  placeholder,
  submitLabel,
}: {
  placeholder: string;
  submitLabel: string;
}) {
  return (
    <form action="/products" method="get" role="search" className="hidden items-center md:flex">
      <label htmlFor="site-search" className="sr-only">
        {submitLabel}
      </label>
      <input
        id="site-search"
        name="q"
        type="search"
        placeholder={placeholder}
        autoComplete="off"
        className="h-9 w-40 rounded-none border-b border-line bg-transparent px-1 text-sm text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none lg:w-52"
      />
      <button type="submit" aria-label={submitLabel} className="ml-1 text-ink-muted hover:text-ink">
        <SearchIcon />
      </button>
    </form>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
