import type { Metadata } from "next";
import { format } from "@commerce-os/i18n";
import { ButtonLink, Container, EmptyState } from "../../components/ui";
import { getStorefrontDict } from "../../lib/i18n";
import { getStorefrontSearch } from "../../lib/server/search";
import { parseServerSearchParams } from "../../lib/search/url-state";
import { toListingCards } from "../../lib/search/listing-adapter";
import { canonicalPath, robotsFor } from "../../lib/search/seo";
import { SearchHeading } from "../../components/search/search-heading";
import { SearchToolbar } from "../../components/search/search-toolbar";
import { SearchResultsRegion } from "../../components/search/results-region";
import { SearchTransitionProvider } from "../../components/search/search-transition";
import { ProductGrid } from "../../components/search/product-grid";
import { SearchPagination } from "../../components/search/search-pagination";
import { SearchEmpty } from "../../components/search/search-empty";

/**
 * TODO-156B (ANALIZ-156A §3/§7) — PLP artık public search ucundan (SSR) beslenir.
 *
 * Akış: RSC `searchParams` okur → URL-state codec → gateway `GET /public/stores/:slug/search` (BFF, no-store)
 * → grid + araç çubuğu + sonuç sayısı + numaralı pagination SSR render. İstemci YALNIZCA URL'i günceller
 * (sort/sayfa). İlk yüklemede ek fetch YOK; ürün başına hidrasyon YOK; eski `.../products` uca PLP bağlı DEĞİL.
 */
export const dynamic = "force-dynamic";

type SearchParamsInput = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}): Promise<Metadata> {
  const [sp, dict] = await Promise.all([searchParams, getStorefrontDict()]);
  const state = parseServerSearchParams(sp);
  const s = dict.search;
  const robots = robotsFor(state);
  const base = state.q ? format(s.searchTitle, { query: state.q }) : s.allTitle;
  const title = state.page > 1 ? `${base} · ${format(s.pageGoto, { page: state.page })}` : base;
  return {
    title,
    description: dict.meta.description,
    // Arama/filtre kombinasyonları noindex,follow; düz PLP + kategori-yalnız index,follow (§16).
    robots: { index: robots.index, follow: robots.follow },
    // Kanonik: indexable → kategori+page normalize; noindex → self (ana kategoriye ezme YOK).
    alternates: { canonical: canonicalPath(state) },
  };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const [sp, t] = await Promise.all([searchParams, getStorefrontDict()]);
  const state = parseServerSearchParams(sp);
  const s = t.search;
  const result = await getStorefrontSearch(state);

  // Hata eşlemesi (§15): gerçek hata → route error boundary (retry); diğerleri kontrollü UI (sessiz kurtarma).
  if (!result.ok) {
    if (result.reason === "error") {
      throw new Error("STOREFRONT_SEARCH_FAILED");
    }
    return (
      <Container className="py-16 lg:py-20">
        <SearchHeading state={state} t={t} />
        {result.reason === "category-not-found" ? (
          <div className="mt-10">
            <EmptyState
              title={s.categoryNotFoundTitle}
              description={s.categoryNotFoundDescription}
              action={
                <ButtonLink href="/products" variant="secondary">
                  {s.viewAll}
                </ButtonLink>
              }
            />
          </div>
        ) : result.reason === "no-store" ? (
          <div className="mt-10">
            <EmptyState title={s.emptyCatalogTitle} description={s.emptyCatalogDescription} />
          </div>
        ) : (
          // bad-request (ör. stale/geçersiz filtre kodu) → kurtarılabilir boş durum + temizle aksiyonu.
          <SearchEmpty state={state} currency="TRY" t={t} />
        )}
      </Container>
    );
  }

  const data = result.data;
  const cards = toListingCards(data.products);
  const currency = data.products[0]?.currency ?? "TRY";

  return (
    <Container className="py-16 lg:py-20">
      <SearchHeading state={state} t={t} />
      <SearchTransitionProvider>
        <div className="mt-10 lg:mt-12">
          <SearchToolbar state={state} totalItems={data.pagination.totalItems} t={t} />
          <SearchResultsRegion label={s.resultsRegion}>
            {cards.length === 0 ? (
              <SearchEmpty state={state} currency={currency} t={t} />
            ) : (
              <div className="mt-8 lg:mt-10">
                <ProductGrid cards={cards} t={t} />
              </div>
            )}
          </SearchResultsRegion>
          <SearchPagination
            state={state}
            totalPages={data.pagination.totalPages}
            hasPreviousPage={data.pagination.hasPreviousPage}
            hasNextPage={data.pagination.hasNextPage}
            t={t}
          />
        </div>
      </SearchTransitionProvider>
    </Container>
  );
}
