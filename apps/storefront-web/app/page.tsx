import Link from "next/link";
import {
  ButtonLink,
  Container,
  Display,
  Eyebrow,
  Heading,
  Lead,
  Muted,
  ProductMedia,
  Section,
  Text,
} from "../components/ui";
import { StorefrontProductCard } from "../components/site/product-card";
import { HeroCarousel } from "../components/site/hero-carousel";
import type { Metadata } from "next";
import { getRequestLocale, getStorefrontDict } from "../lib/i18n";
import { getFeaturedProducts } from "../lib/server/catalog";
import { getHeroSlides, getStoreInfo } from "../lib/server/site";
import { buildMetadata } from "../lib/seo/metadata";
import { homePath } from "../lib/seo/routes";

// One cikan urunler canli katalogtan gelir; her istekte cozulur.
export const dynamic = "force-dynamic";

/**
 * TODO-156D — Ana sayfa metadata (merkezî builder). Canonical "/" (kök otoritesi); index,follow.
 * Başlık layout default'una düşer (mağaza adı) — home için ekstra segment eklenmez.
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

export default async function HomePage() {
  const dict = await getStorefrontDict();
  const t = dict.home;
  const featuredResult = await getFeaturedProducts(8, await getRequestLocale());
  const featured = featuredResult.ok ? featuredResult.data : [];
  // ADR-065 (Faz 3/Site Kabuğu) — GERÇEK PUBLISHED hero slide'ları; boşsa statik
  // HeroVisual fallback. Marka adı carousel görsel-alt / statik panel etiketi için.
  const heroSlides = await getHeroSlides();
  const storeInfo = await getStoreInfo();
  const brandLabel = storeInfo?.storeName ?? dict.shell.brand;

  return (
    <>
      {/* 1 — Hero: büyük, tek net (accent) CTA, bol beyaz alan. */}
      <Section as="div" spacing="lg" className="border-b border-line">
        <Container className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="max-w-xl">
            <Eyebrow>{t.heroEyebrow}</Eyebrow>
            <Display className="mt-5">{t.heroTitle}</Display>
            <Lead className="mt-6">{t.heroDescription}</Lead>
            <div className="mt-9 flex flex-wrap items-center gap-6">
              {/* Sayfanın TEK birincil (accent) CTA'sı. */}
              <ButtonLink href="/products" variant="cta" size="lg">
                {t.heroCta}
              </ButtonLink>
              <Link
                href="/cart"
                className="text-xs font-medium uppercase tracking-wideish text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
              >
                {t.cartCta}
              </Link>
            </div>
          </div>
          {/* Hero görsel paneli: PUBLISHED hero slide varsa GERÇEK carousel,
              yoksa deterministik statik yer tutucu (vitrin asla boş görünmez). */}
          {heroSlides.length > 0 ? (
            <HeroCarousel slides={heroSlides} t={dict.shell} brandLabel={brandLabel} />
          ) : (
            <HeroVisual label={brandLabel} />
          )}
        </Container>
      </Section>

      {/* 2 — Kategori vitrini (MOCK görseller, gerçek gibi isimler). */}
      <Section className="border-b border-line">
        <Container>
          <div className="mb-10 flex items-end justify-between gap-4">
            <div>
              <Eyebrow>{t.categories.eyebrow}</Eyebrow>
              <Heading className="mt-2">{t.categories.title}</Heading>
            </div>
            <Link
              href="/products"
              className="hidden shrink-0 text-xs font-medium uppercase tracking-wideish text-ink underline decoration-line underline-offset-4 hover:decoration-ink sm:inline"
            >
              {t.categories.viewAll}
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {t.categories.items.map((category) => (
              // MOCK: Kategori kartı — kategori görseli/public ucu yok, bkz. todo.md.
              <Link key={category.name} href="/products" className="group block">
                <div className="relative aspect-[3/4] overflow-hidden border border-line bg-surface">
                  <div className="h-full w-full transition-transform duration-500 ease-premium group-hover:scale-[1.03]">
                    <ProductMedia handle={`cat-${category.name}`} title={category.name} />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5">
                    <p className="font-serif text-xl font-normal text-white">{category.name}</p>
                    <p className="mt-0.5 text-xs text-white/75">{category.caption}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      {/* 3 — Öne çıkan ürünler (GERÇEK katalog). */}
      <Section className="border-b border-line">
        <Container>
          <div className="mb-10 flex items-end justify-between gap-4">
            <div>
              <Eyebrow>{t.featuredEyebrow}</Eyebrow>
              <Heading className="mt-2">{t.featuredTitle}</Heading>
            </div>
            <Link
              href="/products"
              className="hidden shrink-0 text-xs font-medium uppercase tracking-wideish text-ink underline decoration-line underline-offset-4 hover:decoration-ink sm:inline"
            >
              {t.featuredViewAll}
            </Link>
          </div>

          {featured.length === 0 ? (
            <div className="border border-line bg-surface px-6 py-16 text-center">
              <Heading as="p">{t.emptyTitle}</Heading>
              <Text className="mx-auto mt-2 max-w-md">{t.emptyDescription}</Text>
              <ButtonLink href="/products" variant="secondary" className="mt-6">
                {t.shopCta}
              </ButtonLink>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
              {featured.map((product) => (
                <StorefrontProductCard key={product.handle} product={product} t={dict} />
              ))}
            </div>
          )}
        </Container>
      </Section>

      {/* 4 — Değer önerisi bandı (sade tipografi, ikonsuz). */}
      <Section spacing="sm" className="border-b border-line">
        <Container className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {t.valueProps.map((prop, index) => (
            <div key={prop.title} className="flex gap-4">
              <span className="font-serif text-lg text-ink-subtle">0{index + 1}</span>
              <div>
                <p className="text-sm font-medium text-ink">{prop.title}</p>
                <Muted className="mt-1">{prop.detail}</Muted>
              </div>
            </div>
          ))}
        </Container>
      </Section>

      {/* 5 — Editöryel / lifestyle blok. */}
      <Section>
        <Container className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* MOCK: Editöryel görsel — gerçek medya yok, bkz. todo.md (P0). */}
          <div className="order-2 aspect-[4/3] overflow-hidden border border-line bg-surface lg:order-1">
            <ProductMedia handle="editorial-story" title={t.editorial.title} />
          </div>
          <div className="order-1 max-w-md lg:order-2">
            <Eyebrow>{t.editorial.eyebrow}</Eyebrow>
            <Heading className="mt-3">{t.editorial.title}</Heading>
            <Text className="mt-4">{t.editorial.body}</Text>
            <ButtonLink href="/products" variant="secondary" className="mt-7">
              {t.editorial.cta}
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}

/**
 * MOCK: Hero görsel paneli — gerçek medya altyapısı yok (bkz. todo.md, P0).
 * Deterministik yer tutucu: sıcak nötr zemin + ince serif kelime-işareti.
 */
function HeroVisual({ label }: { label: string }) {
  return (
    <div className="relative hidden aspect-[4/5] overflow-hidden border border-line bg-gradient-to-br from-[#efece6] to-[#ded8cc] lg:block">
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-serif text-6xl font-normal tracking-tightish text-line-strong">
          {label}
        </span>
      </div>
    </div>
  );
}
