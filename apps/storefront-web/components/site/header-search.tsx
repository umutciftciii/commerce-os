"use client";

import { useSearchParams } from "next/navigation";

/**
 * TODO-156B (brief §12) — Header arama alanı (gerçek). Native GET `<form action="/products">` → JS kapalıyken
 * de çalışır (yeni arama = /products?q=..., diğer paramları sıfırlar). JS ile mevcut `q` input'a önden yazılır
 * (`defaultValue`, useSearchParams). Bu fazda YOK: autocomplete/suggest/recent/debounce. Submit → gerçek SSR PLP.
 * Erişilebilir: role="search", label, Enter submit. Boş query → /products (tüm ürünler).
 */
export function HeaderSearch({
  placeholder,
  submitLabel,
  className,
}: {
  placeholder: string;
  submitLabel: string;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const currentQuery = searchParams.get("q") ?? "";

  return (
    <form action="/products" method="get" role="search" className={className}>
      <label htmlFor="site-search" className="sr-only">
        {submitLabel}
      </label>
      <input
        id="site-search"
        name="q"
        type="search"
        // `key` ile route/q değişince input yeniden mount olur → prefill güncel kalır.
        key={currentQuery}
        defaultValue={currentQuery}
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

/**
 * Suspense fallback (hydration öncesi / useSearchParams çözülürken). Static GET form — prefill YOK ama
 * JS'siz de submit çalışır. Görsel olarak HeaderSearch ile birebir.
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
