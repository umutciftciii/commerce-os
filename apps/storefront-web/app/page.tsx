import {
  ButtonLink,
  Container,
  Display,
  Eyebrow,
  Heading,
  Lead,
  Section,
  Text,
} from "../components/ui";
import { StorefrontProductCard } from "../components/site/product-card";
import { HomeSections } from "../components/site/home/home-sections";
import { EditorialBanner, ValueProps } from "../components/site/home/editorial";
import type { Metadata } from "next";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { StorefrontProductSummary } from "../lib/catalog-types";
import { getRequestLocale, getStorefrontDict } from "../lib/i18n";
import { getFeaturedProducts, getHome } from "../lib/server/catalog";
import { getStoreInfo } from "../lib/server/site";
import { buildMetadata } from "../lib/seo/metadata";
import { homePath } from "../lib/seo/routes";

// TODO-158A (ADR-086) — Ana sayfa yönetilebilir section'lardan (public composed /home) beslenir;
// içerik her istekte canlı çözülür (dynamic showcase kuralları dahil).
export const dynamic = "force-dynamic";

/**
 * TODO-156D — Ana sayfa metadata (merkezî builder). Canonical "/" (kök otoritesi); index,follow.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [dict, locale] = await Promise.all([getStorefrontDict(), getRequestLocale()]);
  return buildMetadata({
    description: dict.meta.description,
    canonicalPath: homePath(),
    robots: { index: true, follow: true },
    siteName: dict.meta.title,
    locale,
  });
}

/**
 * TODO-158A (ADR-086) — Home Experience Platform. Ana sayfa artık HARDCODED içerik taşımaz:
 * hero, öne çıkan kategoriler ve ürün showcase'leri store-admin'den yönetilir ve gateway'in
 * public composed `/home` ucundan DB SIRASINDA gelir. Yapılandırılmamış mağazada (section yok)
 * generic karşılama + GERÇEK öne çıkan ürünler fallback'i gösterilir (vitrin asla boş görünmez).
 */
export default async function HomePage() {
  const [dict, locale] = await Promise.all([getStorefrontDict(), getRequestLocale()]);
  const home = await getHome(locale);

  if (home.sections.length > 0) {
    return <HomeSections sections={home.sections} dict={dict} />;
  }

  // Fallback — section yapılandırılmamış: generic hero + gerçek katalog ürünleri.
  const [featuredResult, storeInfo] = await Promise.all([getFeaturedProducts(10, locale), getStoreInfo()]);
  const featured = featuredResult.ok ? featuredResult.data : [];
  const brandLabel = storeInfo?.storeName ?? dict.shell.brand;
  return <HomeFallback dict={dict} featured={featured} brandLabel={brandLabel} />;
}

/** Yapılandırılmamış mağaza fallback'i: sade karşılama bandı + gerçek öne çıkan ürünler. */
function HomeFallback({
  dict,
  featured,
  brandLabel,
}: {
  dict: StorefrontDictionary;
  featured: StorefrontProductSummary[];
  brandLabel: string;
}) {
  const t = dict.home;
  return (
    <>
      <Section as="div" spacing="lg" className="border-b border-line">
        <Container className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="max-w-xl">
            <Eyebrow>{t.heroEyebrow}</Eyebrow>
            <Display className="mt-5">{t.heroTitle}</Display>
            <Lead className="mt-6">{t.heroDescription}</Lead>
            <div className="mt-9">
              <ButtonLink href="/products" variant="cta" size="lg">
                {t.heroCta}
              </ButtonLink>
            </div>
          </div>
          <div className="relative hidden aspect-[4/5] overflow-hidden rounded-md border border-line bg-surface-muted lg:block">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-serif text-6xl font-normal tracking-tightish text-line-strong">
                {brandLabel}
              </span>
            </div>
          </div>
        </Container>
      </Section>

      <ValueProps dict={dict} />

      {featured.length > 0 ? (
        <Section className="border-b border-line">
          <Container>
            <div className="mb-8">
              <Eyebrow>{t.featuredEyebrow}</Eyebrow>
              <Heading className="mt-2">{t.featuredTitle}</Heading>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {featured.map((product) => (
                <StorefrontProductCard key={product.handle} product={product} t={dict} />
              ))}
            </div>
          </Container>
        </Section>
      ) : (
        <Section className="border-b border-line">
          <Container>
            <div className="border border-line bg-surface px-6 py-16 text-center">
              <Heading as="p">{t.emptyTitle}</Heading>
              <Text className="mx-auto mt-2 max-w-md">{t.emptyDescription}</Text>
              <ButtonLink href="/products" variant="secondary" className="mt-6">
                {t.shopCta}
              </ButtonLink>
            </div>
          </Container>
        </Section>
      )}

      <EditorialBanner dict={dict} />
    </>
  );
}
