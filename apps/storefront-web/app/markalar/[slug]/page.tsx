import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format } from "@commerce-os/i18n";
import { ButtonLink, Container, EmptyState, Eyebrow, Heading, Lead, ProductMedia } from "../../../components/ui";
import { Breadcrumb } from "../../../components/seo/breadcrumb";
import { JsonLd } from "../../../components/seo/json-ld";
import { getRequestLocale, getStorefrontDict } from "../../../lib/i18n";
import { getStorefrontBrand } from "../../../lib/server/brands";
import { getStorefrontSearch } from "../../../lib/server/search";
import { parseServerSearchParams, type SearchState } from "../../../lib/search/url-state";
import { toListingCards } from "../../../lib/search/listing-adapter";
import { isIndexable } from "../../../lib/search/seo";
import { buildMetadata } from "../../../lib/seo/metadata";
import { brandPath, productPath } from "../../../lib/seo/routes";
import { absoluteUrl } from "../../../lib/seo/site-url";
import { buildBrandBreadcrumb } from "../../../lib/seo/breadcrumb";
import { buildBrandJsonLd, buildBreadcrumbJsonLd, buildItemListJsonLd } from "../../../lib/seo/json-ld";
import { brandMetaDescription, brandMetaTitle } from "../../../lib/seo/brand-seo";
import { ProductGrid } from "../../../components/search/product-grid";
import { FilterRail } from "../../../components/search/filter-rail";
import { ActiveFilterChips } from "../../../components/search/active-filter-chips";
import { SearchPagination } from "../../../components/search/search-pagination";
import { SearchEmpty } from "../../../components/search/search-empty";
import { SearchResultsRegion } from "../../../components/search/results-region";
import { SearchTransitionProvider } from "../../../components/search/search-transition";
import { WishlistProvider } from "../../../components/wishlist/wishlist-provider";
import { RatingProvider } from "../../../components/reviews/rating-provider";
import { isStorefrontModuleEnabled, getServerSlotVariant } from "../../../lib/server/site";
import { getWishlistStatus } from "../../../lib/server/wishlist";
import { getCardRatings } from "../../../lib/server/reviews";

/**
 * TODO-165A (ADR-165A) Task 20 — `/markalar/[slug]` marka vitrini: marka header'ı (logo/kapak/açıklama)
 * + AYNI PLP ARAMA BORU HATTI (`getStorefrontSearch` → `FilterRail`/`ProductGrid`/`SearchPagination`),
 * yalnızca `SearchState.brand = slug` ile daraltılmış. `app/products/page.tsx`'in kopyası DEĞİL: yeniden
 * kullanır (brief §"PLP reuse — do not rebuild"). `brand` bu route'ta PATH parametresidir (query değil);
 * FilterRail/ActiveFilterChips/SearchPagination gibi paylaşılan bileşenlerin ürettiği href'ler
 * (`buildSearchHref` varsayılan `/products`) bu sayfadan `/products?brand=slug&...`'a yönlendirir — kasıtlı,
 * minimal bir ödünleşim (component pathname yeniden-kablolaması bu görevin kapsamı DIŞINDA; TD-165A.1).
 */
export const dynamic = "force-dynamic";

type SearchParamsInput = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParamsInput>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [sp, dict, locale] = await Promise.all([searchParams, getStorefrontDict(), getRequestLocale()]);
  const s = dict.brands;
  const result = await getStorefrontBrand(slug);

  if (!result.ok) {
    // Gateway 5xx/ağ hatası (silinmiş DEĞİL): 404 üretme. noindex minimal meta; sayfa error EmptyState render eder.
    return { title: s.errorTitle, robots: { index: false, follow: false } };
  }
  if (result.data === null) {
    // Marka gerçekten yok (gateway 404): HTML flush'tan ÖNCE gerçek 404 (PDP ile aynı soft-404 hotfix deseni).
    notFound();
  }

  const brand = result.data;
  // brief — "plain brand page = index,follow; extra filters = noindex,follow". `brand` PATH parametresidir
  // (bu sayfanın query'sinde YOKTUR); dolayısıyla isIndexable yalnız ÜSTÜNE binen q/fiyat/stok/dinamik
  // filtre daraltmasına bakar (kategori de aynı sebeple isIndexable'da kontrol edilmez — bkz. lib/search/seo.ts).
  const extraNarrowing = !isIndexable(parseServerSearchParams(sp));
  const images = brand.coverUrl ? [brand.coverUrl] : brand.logoUrl ? [brand.logoUrl] : [];

  return buildMetadata({
    title: brandMetaTitle(brand),
    description: brandMetaDescription(brand, s.metaDescription),
    // Kanonik DAİMA temiz marka landing'i (filtreli varyantlar buraya ezilir — duplicate content önlenir).
    canonicalPath: brandPath(brand.slug),
    robots: { index: !extraNarrowing, follow: true },
    siteName: dict.meta.title,
    locale,
    openGraph: images.length > 0 ? { type: "website", images } : undefined,
  });
}

export default async function BrandDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParamsInput>;
}) {
  const { slug } = await params;
  const [sp, dict] = await Promise.all([searchParams, getStorefrontDict()]);
  const s = dict.brands;
  const searchDict = dict.search;
  const brandResult = await getStorefrontBrand(slug);

  if (!brandResult.ok) {
    return (
      <Container className="py-16 lg:py-20">
        <EmptyState title={s.errorTitle} description={s.errorDescription} />
      </Container>
    );
  }
  if (brandResult.data === null) {
    // Silinen/arşivlenen/bilinmeyen marka: soft-200 boş durum YERİNE gerçek 404 (SEO'da soft-404 zararlı).
    notFound();
  }

  const brand = brandResult.data;
  // TODO-165A (Task 20) — brand alanı ROUTE'tan (path) gelir; `withBrand` KULLANILMAZ (o page=1'e döner —
  // burada deep-link'ten gelen ?page=n korunmalı). Diğer tüm daraltmalar (q/sort/fiyat/stok/dinamik filtre)
  // normal query'den okunur (category ile AYNI paylaşımlı desen — kategori de path DEĞİL query'dir orada).
  const state: SearchState = { ...parseServerSearchParams(sp), brand: brand.slug };
  const result = await getStorefrontSearch(state);

  const trail = buildBrandBreadcrumb({
    labels: { home: s.breadcrumbHome, brands: s.breadcrumbBrands },
    brandName: brand.name,
  });
  const canonicalUrl = absoluteUrl(brandPath(brand.slug));
  const breadcrumbLd = buildBreadcrumbJsonLd(trail, absoluteUrl, canonicalUrl);
  const brandLd = buildBrandJsonLd({
    name: brand.name,
    description: brand.description,
    url: canonicalUrl,
    logoUrl: brand.logoUrl,
  });

  const header = (
    <header className="mb-10 flex flex-col items-center gap-6 border-b border-line pb-10 text-center sm:flex-row sm:text-left">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border border-line bg-surface p-4 sm:h-28 sm:w-28">
        <ProductMedia handle={brand.slug} title={brand.name} imageUrl={brand.logoUrl} fit="contain" />
      </div>
      <div className="min-w-0">
        <Breadcrumb
          items={trail}
          label={dict.shell.breadcrumb}
          className="mb-3 flex-wrap justify-center text-[11px] uppercase tracking-wideish text-ink-subtle sm:justify-start"
        />
        <Heading as="h1">{brand.name}</Heading>
        {brand.description ? <Lead className="mt-3 max-w-2xl">{brand.description}</Lead> : null}
        {brand.productCount > 0 ? (
          <Eyebrow as="p" className="mt-3">
            {format(s.productCount, { count: brand.productCount })}
          </Eyebrow>
        ) : null}
      </div>
    </header>
  );

  if (!result.ok) {
    return (
      <Container className="py-16 lg:py-20">
        <JsonLd data={breadcrumbLd} />
        <JsonLd data={brandLd} />
        {header}
        {result.reason === "no-store" ? (
          <EmptyState title={searchDict.emptyCatalogTitle} description={searchDict.emptyCatalogDescription} />
        ) : result.reason === "category-not-found" || result.reason === "bad-request" ? (
          <SearchEmpty state={state} currency="TRY" t={dict} basePath={brandPath(brand.slug)} />
        ) : (
          <EmptyState
            title={searchDict.errorTitle}
            description={searchDict.errorDescription}
            action={
              <ButtonLink href={brandPath(brand.slug)} variant="secondary">
                {searchDict.errorRetry}
              </ButtonLink>
            }
          />
        )}
      </Container>
    );
  }

  const data = result.data;
  const cards = toListingCards(data.products);
  const listingVariant = await getServerSlotVariant("productListingLayout", "standard");
  const cardIds = cards.map((card) => card.id);
  const [reviewsOn, wishlistOn] = await Promise.all([
    isStorefrontModuleEnabled("REVIEWS"),
    isStorefrontModuleEnabled("WISHLIST"),
  ]);
  const [savedProductIds, cardRatings] = await Promise.all([
    wishlistOn ? getWishlistStatus(cardIds).then((set) => [...set]) : Promise.resolve<string[]>([]),
    reviewsOn ? getCardRatings(cardIds) : Promise.resolve({}),
  ]);
  const currency = data.products[0]?.currency ?? "TRY";
  const facets = data.facets;

  // TODO-165A (Task 20, brief §14) — ItemList JSON-LD yalnız indexlenebilir görünümde (PLP ile aynı kural:
  // arama/filtre daraltmasız marka sayfasında; noindex durumunda yapısal veri üretilmez).
  const itemListLd =
    !isIndexable(parseServerSearchParams(sp)) || data.products.length === 0
      ? null
      : buildItemListJsonLd({
          items: data.products.map((product) => ({
            url: absoluteUrl(productPath(product.slug)),
            name: product.title,
          })),
        });

  return (
    <WishlistProvider initialSavedIds={savedProductIds} enabled={wishlistOn}>
      <RatingProvider summaries={cardRatings}>
        <Container className="py-16 lg:py-20">
          <JsonLd data={breadcrumbLd} />
          <JsonLd data={brandLd} />
          {itemListLd ? <JsonLd data={itemListLd} /> : null}
          {header}
          <SearchTransitionProvider>
            <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[17rem_minmax(0,1fr)] xl:gap-12">
              <FilterRail facets={facets} state={state} currency={currency} t={dict} />
              <div className="min-w-0">
                <ActiveFilterChips facets={facets} state={state} currency={currency} t={dict} />
                <SearchResultsRegion label={searchDict.resultsRegion}>
                  {cards.length === 0 ? (
                    <SearchEmpty state={state} currency={currency} t={dict} basePath={brandPath(brand.slug)} />
                  ) : (
                    <div className="mt-8 lg:mt-10">
                      <ProductGrid cards={cards} t={dict} listingVariant={listingVariant} />
                    </div>
                  )}
                </SearchResultsRegion>
                <SearchPagination
                  state={state}
                  totalPages={data.pagination.totalPages}
                  hasPreviousPage={data.pagination.hasPreviousPage}
                  hasNextPage={data.pagination.hasNextPage}
                  t={dict}
                />
              </div>
            </div>
          </SearchTransitionProvider>
        </Container>
      </RatingProvider>
    </WishlistProvider>
  );
}
