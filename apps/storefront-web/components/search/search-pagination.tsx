"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import { buildSearchHref, withPage, type SearchState } from "../../lib/search/url-state";
import { paginationRange } from "../../lib/search/pagination";
import { useSearchTransition } from "./search-transition";

/**
 * TODO-156B (brief §10) — SSR numaralı pagination. Deterministik href'ler codec'ten türer (SEO otoritesi).
 * Gerçek `<Link>` (anchor) → JS kapalıyken de çalışır; JS varsa `useTransition` ile eski içerik dimlenir
 * (push → geri/ileri sayfalar arası adımlar). Sayfa değişince en üste scroll. Erişilebilir: `nav[aria-label]`,
 * `aria-current="page"`, prev/next disabled durumları. Tek sayfa varsa render edilmez.
 */
export function SearchPagination({
  state,
  totalPages,
  hasPreviousPage,
  hasNextPage,
  t,
}: {
  state: SearchState;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  t: StorefrontDictionary;
}) {
  const s = t.search;
  const { navigate } = useSearchTransition();
  if (totalPages <= 1) return null;

  const current = Math.min(Math.max(state.page, 1), totalPages);
  const tokens = paginationRange(current, totalPages);

  const hrefFor = (page: number) => buildSearchHref(withPage(state, page));

  const onNavigate = (page: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    // Sol tık + modifier yok → SPA geçişi (push, en üste scroll). Aksi tarayıcıya bırak (yeni sekme vb.).
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate(hrefFor(page), { replace: false, scroll: true });
  };

  return (
    <nav aria-label={s.paginationLabel} className="mt-12 flex items-center justify-center gap-1 lg:mt-16">
      {/* Önceki */}
      <PageLink
        href={hasPreviousPage ? hrefFor(current - 1) : undefined}
        label={s.pagePrevious}
        onNavigate={hasPreviousPage ? onNavigate(current - 1) : undefined}
        disabled={!hasPreviousPage}
      >
        <span aria-hidden>‹</span>
        <span className="ml-1 hidden sm:inline">{s.pagePrevious}</span>
      </PageLink>

      {/* Numaralı jetonlar */}
      <ol className="flex items-center gap-1">
        {tokens.map((token, index) =>
          token === "ellipsis" ? (
            <li key={`e-${index}`} aria-hidden className="px-2 text-sm text-ink-subtle">
              …
            </li>
          ) : (
            <li key={token}>
              <PageNumber
                page={token}
                current={token === current}
                href={hrefFor(token)}
                onNavigate={onNavigate(token)}
                t={t}
              />
            </li>
          ),
        )}
      </ol>

      {/* Sonraki */}
      <PageLink
        href={hasNextPage ? hrefFor(current + 1) : undefined}
        label={s.pageNext}
        onNavigate={hasNextPage ? onNavigate(current + 1) : undefined}
        disabled={!hasNextPage}
      >
        <span className="mr-1 hidden sm:inline">{s.pageNext}</span>
        <span aria-hidden>›</span>
      </PageLink>
    </nav>
  );
}

function PageNumber({
  page,
  current,
  href,
  onNavigate,
  t,
}: {
  page: number;
  current: boolean;
  href: string;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
  t: StorefrontDictionary;
}) {
  const s = t.search;
  const base =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1";
  if (current) {
    return (
      <span
        aria-current="page"
        aria-label={format(s.pageCurrent, { page })}
        className={`${base} border-ink bg-ink font-medium text-surface`}
      >
        {page}
      </span>
    );
  }
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={format(s.pageGoto, { page })}
      className={`${base} border-line text-ink hover:border-ink`}
    >
      {page}
    </Link>
  );
}

function PageLink({
  href,
  label,
  onNavigate,
  disabled,
  children,
}: {
  href: string | undefined;
  label: string;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const base =
    "inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1";
  if (disabled || !href) {
    return (
      <span aria-disabled className={`${base} cursor-not-allowed border-line text-ink-subtle opacity-50`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} onClick={onNavigate} aria-label={label} className={`${base} border-line text-ink hover:border-ink`}>
      {children}
    </Link>
  );
}
