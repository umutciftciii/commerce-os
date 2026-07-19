import Link from "next/link";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import { Eyebrow, Heading, Lead } from "../ui";
import type { SearchState } from "../../lib/search/url-state";

/**
 * TODO-156B (brief §16/§17) — PLP/arama başlığı + breadcrumb iskeleti (görünür + semantik). Tam kategori
 * SEO landing + JSON-LD BreadcrumbList 156D'de. H1: arama ise "\"q\" için sonuçlar", aksi "Tüm ürünler".
 */
export function SearchHeading({ state, t }: { state: SearchState; t: StorefrontDictionary }) {
  const s = t.search;
  const isSearch = state.q !== null;
  const title = isSearch ? format(s.searchTitle, { query: state.q as string }) : s.allTitle;
  const tagline = isSearch ? s.searchTagline : state.category ? s.categoryTagline : s.allTagline;

  return (
    <header className="max-w-2xl">
      <nav aria-label={s.breadcrumbHome} className="mb-4 text-[11px] uppercase tracking-wideish text-ink-subtle">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="transition-colors hover:text-ink">
              {s.breadcrumbHome}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current={!state.category && !isSearch ? "page" : undefined} className="text-ink-muted">
            <Link href="/products" className="transition-colors hover:text-ink">
              {s.breadcrumbProducts}
            </Link>
          </li>
          {state.category ? (
            <>
              <li aria-hidden>/</li>
              <li aria-current="page" className="text-ink-muted">
                {state.category}
              </li>
            </>
          ) : null}
        </ol>
      </nav>
      <Eyebrow>{t.listing.eyebrow}</Eyebrow>
      <Heading as="h1" className="mt-3">
        {title}
      </Heading>
      <Lead className="mt-3">{tagline}</Lead>
    </header>
  );
}
