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
import { DiscoverySections } from "../components/site/home/discovery-sections";
import { WishlistProvider } from "../components/wishlist/wishlist-provider";
import { RatingProvider } from "../components/reviews/rating-provider";
import { getWishlistStatus } from "../lib/server/wishlist";
import { getCardRatings } from "../lib/server/reviews";
import { EditorialBanner, ValueProps } from "../components/site/home/editorial";
import type { Metadata } from "next";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { StorefrontDiscoverySection, StorefrontProductSummary } from "../lib/catalog-types";
import { getRequestLocale, getStorefrontDict } from "../lib/i18n";
import { getDiscovery, getFeaturedProducts, getHome } from "../lib/server/catalog";
import { getStoreInfo, isStorefrontModuleEnabled } from "../lib/server/site";
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
/** TODO-162 — Discovery section (rail + grid kartları) içindeki tüm ürün id'lerini toplar (wishlist/rating batch). */
function collectDiscoveryProductIds(sections: StorefrontDiscoverySection[]): string[] {
  const ids: string[] = [];
  for (const section of sections) {
    for (const product of section.products) ids.push(product.id);
    for (const card of section.cards ?? []) {
      for (const product of card.products) ids.push(product.id);
    }
  }
  return ids;
}

export default async function HomePage() {
  const [dict, locale] = await Promise.all([getStorefrontDict(), getRequestLocale()]);
  // TODO-163 Faz 3 (TD-156) — capability projeksiyonu (`cache()`'li → tek gateway çağrısı). Kapalı
  // modül: veri ÇEKİLMEZ + section/island render EDİLMEZ → beacon/fetch/event yok. Gateway otoriter.
  const [reviewsOn, recommendationsOn, recentlyViewedOn, sponsoredOn, wishlistOn] = await Promise.all([
    isStorefrontModuleEnabled("REVIEWS"),
    isStorefrontModuleEnabled("RECOMMENDATIONS"),
    isStorefrontModuleEnabled("RECENTLY_VIEWED"),
    isStorefrontModuleEnabled("SPONSORED_PRODUCTS"),
    isStorefrontModuleEnabled("WISHLIST"),
  ]);
  const homeCaps = { recentlyViewed: recentlyViewedOn, sponsored: sponsoredOn, wishlist: wishlistOn };
  // TODO-162 (ADR-206) — Public /home (viewer-agnostic) + Katman B discovery (viewer-specific) PARALEL.
  // Discovery sunucu-tarafı çözülür → flash/CLS yok (§24); hata/boş → [] (vitrin bozulmaz).
  // TODO-163 Faz 3 (TD-156) — RECOMMENDATIONS kapalıysa discovery ÇEKİLMEZ (gateway zaten [] döner).
  const [home, discovery] = await Promise.all([
    getHome(locale),
    recommendationsOn ? getDiscovery(locale) : Promise.resolve<StorefrontDiscoverySection[]>([]),
  ]);

  if (home.sections.length > 0 || discovery.length > 0) {
    // TODO-159D (ADR-093) — Public showcase + discovery ürünleri için TEK batched favori-durum + rating çözümü.
    const showcaseIds = home.sections.flatMap((section) =>
      section.type === "PRODUCT_SHOWCASE" || section.type === "SPONSORED_SHOWCASE"
        ? section.products.map((product) => product.id)
        : [],
    );
    const allIds = [...new Set([...showcaseIds, ...collectDiscoveryProductIds(discovery)])];
    const [savedProductIds, cardRatings] = await Promise.all([
      wishlistOn ? getWishlistStatus(allIds).then((set) => [...set]) : Promise.resolve<string[]>([]),
      reviewsOn ? getCardRatings(allIds) : Promise.resolve({}),
    ]);
    // Hero varsa: Hero → Discovery (hero altı, §6) → kalan public section'lar. Hero yoksa: Discovery → public.
    const heroFirst = home.sections.length > 0 && home.sections[0].type === "HERO_SLIDER";
    const heroSections = heroFirst ? home.sections.slice(0, 1) : [];
    const restSections = heroFirst ? home.sections.slice(1) : home.sections;
    return (
      <WishlistProvider initialSavedIds={savedProductIds} enabled={wishlistOn}>
        <RatingProvider summaries={cardRatings}>
          {/* TD-129 — "Son İncelediklerin" artık yönetilebilir bir HomeSection tipidir (RECENTLY_VIEWED);
              manuel sabit render KALDIRILDI. Admin şeridin yerini/başlığını/görünürlüğünü CMS'ten yönetir.
              TODO-163 Faz 3 (TD-156) — homeCaps kapalı RECENTLY_VIEWED/SPONSORED section'larını render dışı bırakır. */}
          {heroSections.length > 0 ? <HomeSections sections={heroSections} dict={dict} caps={homeCaps} /> : null}
          <DiscoverySections sections={discovery} dict={dict} />
          {restSections.length > 0 ? <HomeSections sections={restSections} dict={dict} caps={homeCaps} /> : null}
        </RatingProvider>
      </WishlistProvider>
    );
  }

  // Fallback — section yapılandırılmamış: generic hero + gerçek katalog ürünleri.
  const [featuredResult, storeInfo] = await Promise.all([getFeaturedProducts(10, locale), getStoreInfo()]);
  const featured = featuredResult.ok ? featuredResult.data : [];
  const brandLabel = storeInfo?.storeName ?? dict.shell.brand;
  const featuredIds = featured.map((product) => product.id);
  const [savedProductIds, cardRatings] = await Promise.all([
    wishlistOn ? getWishlistStatus(featuredIds).then((set) => [...set]) : Promise.resolve<string[]>([]),
    reviewsOn ? getCardRatings(featuredIds) : Promise.resolve({}),
  ]);
  return (
    <WishlistProvider initialSavedIds={savedProductIds} enabled={wishlistOn}>
      <RatingProvider summaries={cardRatings}>
        <HomeFallback dict={dict} featured={featured} brandLabel={brandLabel} />
      </RatingProvider>
    </WishlistProvider>
  );
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

      {/* TD-129 — "Son İncelediklerin" artık yalnız RECENTLY_VIEWED HomeSection'ıyla yönetilir; bu
          fallback (section'sız mağaza) manuel şerit taşımaz (CMS-yönetimli davranış). */}
      <EditorialBanner dict={dict} />
    </>
  );
}
