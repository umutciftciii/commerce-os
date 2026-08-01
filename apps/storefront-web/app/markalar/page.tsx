import type { Metadata } from "next";
import { Container, EmptyState, Eyebrow, Heading, Lead } from "../../components/ui";
import { Breadcrumb } from "../../components/seo/breadcrumb";
import { JsonLd } from "../../components/seo/json-ld";
import { getRequestLocale, getStorefrontDict } from "../../lib/i18n";
import { getStorefrontBrands } from "../../lib/server/brands";
import { buildMetadata } from "../../lib/seo/metadata";
import { brandPath, brandsPath } from "../../lib/seo/routes";
import { absoluteUrl } from "../../lib/seo/site-url";
import { buildBrandsBreadcrumb } from "../../lib/seo/breadcrumb";
import { buildBreadcrumbJsonLd, buildItemListJsonLd } from "../../lib/seo/json-ld";
import { BrandDirectory } from "./brand-directory";

/**
 * TODO-165A (ADR-165A) Task 19 — `/markalar` marka DİZİN sayfası.
 *
 * Gateway public `GET /public/stores/:slug/brands` ucundan (yalnız ACTIVE + görünür ürünlü markalar)
 * SSR beslenir (bkz. `lib/server/brands.ts`). Kategori-benzeri, ama ADANMIŞ bir route (governed Brand
 * entity'si logo/kapak/website taşır — PLP `category=` query paramı gibi bir filtre değil). Her marka
 * kartı `brandPath(slug)` ile `/markalar/[slug]` detay/vitrin sayfasına bağlanır (Task 20).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [dict, locale] = await Promise.all([getStorefrontDict(), getRequestLocale()]);
  const s = dict.brands;
  return buildMetadata({
    title: s.metaTitle,
    description: s.metaDescription,
    canonicalPath: brandsPath(),
    // Sabit dizin sayfası; arama/filtre daralması yok → daima indexlenebilir (§ lib/search/seo.ts benzeri karar).
    robots: { index: true, follow: true },
    siteName: dict.meta.title,
    locale,
  });
}

export default async function BrandsPage() {
  const dict = await getStorefrontDict();
  const s = dict.brands;
  const result = await getStorefrontBrands();

  const trail = buildBrandsBreadcrumb({ home: s.breadcrumbHome, brands: s.breadcrumbBrands });
  const canonicalUrl = absoluteUrl(brandsPath());
  const breadcrumbLd = buildBreadcrumbJsonLd(trail, absoluteUrl, canonicalUrl);

  if (!result.ok) {
    return (
      <Container className="py-16 lg:py-20">
        <JsonLd data={breadcrumbLd} />
        <Breadcrumb
          items={trail}
          label={dict.shell.breadcrumb}
          className="mb-8 text-[11px] uppercase tracking-wideish text-ink-subtle"
        />
        <EmptyState title={s.errorTitle} description={s.errorDescription} />
      </Container>
    );
  }

  const brands = result.data;
  // TODO-165A (Task 19, brief §14) — ItemList JSON-LD (CollectionPage benzeri); PLP'deki
  // `buildItemListJsonLd(products)` ile AYNI builder — marka listesi de sıralı bir koleksiyondur.
  const itemListLd =
    brands.length > 0
      ? buildItemListJsonLd({
          items: brands.map((brand) => ({ url: absoluteUrl(brandPath(brand.slug)), name: brand.name })),
        })
      : null;

  return (
    <Container className="py-16 lg:py-20">
      <JsonLd data={breadcrumbLd} />
      {itemListLd ? <JsonLd data={itemListLd} /> : null}
      <header className="max-w-2xl">
        <Breadcrumb
          items={trail}
          label={dict.shell.breadcrumb}
          className="mb-4 text-[11px] uppercase tracking-wideish text-ink-subtle"
        />
        <Eyebrow>{s.breadcrumbBrands}</Eyebrow>
        <Heading as="h1" className="mt-3">
          {s.heading}
        </Heading>
        <Lead className="mt-3">{s.tagline}</Lead>
      </header>
      <BrandDirectory brands={brands} t={dict} />
    </Container>
  );
}
