import Link from "next/link";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type {
  StorefrontHomeFeaturedCategory,
  StorefrontHomeSection,
  StorefrontProductSummary,
} from "../../../lib/catalog-types";
import { Container, Eyebrow, Heading, ProductMedia } from "../../ui";
import { StorefrontProductCard } from "../product-card";
import { HeroSlider } from "./hero-slider";

/**
 * TODO-158A (ADR-086) + TODO-158C (ADR-088) — Ana sayfa section renderer'ı (Server Component).
 * Gateway'in public composed `/home` ucundan gelen section'ları DB SIRASINDA render eder.
 *
 * TODO-158C yeniden tasarımı: tutarlı DİKEY RİTİM (generous whitespace, hairline yerine boşluk
 * ağırlıklı ayrım), section başlıkları için eyebrow + serif başlık + opsiyonel "Tümünü gör",
 * tokenize edilmiş medya-üzeri overlay'ler (`scrim-media`/`on-media`), daha premium kategori/kart
 * yoğunluğu. Görünürlük bayrakları (desktopVisible/mobileVisible) responsive CSS ile uygulanır.
 */
export function HomeSections({
  sections,
  dict,
}: {
  sections: StorefrontHomeSection[];
  dict: StorefrontDictionary;
}) {
  return (
    <div className="flex flex-col">
      {sections.map((section) => {
        const visibility = visibilityClass(section.desktopVisible, section.mobileVisible);
        if (section.type === "HERO_SLIDER") {
          return (
            <div key={section.id} className={visibility}>
              <HeroSlider
                slides={section.slides}
                autoplayMs={section.autoplayMs}
                labels={{
                  region: dict.shell.heroRegion,
                  prev: dict.shell.heroPrev,
                  next: dict.shell.heroNext,
                }}
              />
            </div>
          );
        }
        if (section.type === "FEATURED_CATEGORIES") {
          return (
            <FeaturedCategoriesSection
              key={section.id}
              title={section.title}
              subtitle={section.subtitle}
              categories={section.categories}
              className={visibility}
            />
          );
        }
        return (
          <ProductShowcaseSection
            key={section.id}
            title={section.title}
            subtitle={section.subtitle}
            layout={section.layout}
            products={section.products}
            dict={dict}
            className={visibility}
          />
        );
      })}
    </div>
  );
}

// desktopVisible/mobileVisible → responsive görünürlük sınıfı (mobil-öncelikli breakpoint sm).
function visibilityClass(desktop: boolean, mobile: boolean): string {
  if (desktop && mobile) return "";
  if (desktop && !mobile) return "hidden sm:block";
  if (!desktop && mobile) return "block sm:hidden";
  return "hidden";
}

/** Tutarlı dikey ritim: her section aynı generous boşluk skalasını kullanır. */
const SECTION_SPACING = "py-14 sm:py-20 lg:py-24";

function SectionHeading({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
}: {
  title: string | null;
  subtitle: string | null;
  viewAllHref?: string;
  viewAllLabel?: string;
}) {
  if (!title && !subtitle) return null;
  return (
    <div className="mb-8 flex items-end justify-between gap-4 sm:mb-10">
      <div>
        {subtitle ? <Eyebrow>{subtitle}</Eyebrow> : null}
        {title ? <Heading className="mt-2">{title}</Heading> : null}
      </div>
      {viewAllHref && viewAllLabel ? (
        <Link
          href={viewAllHref}
          className="hidden shrink-0 items-center gap-1.5 pb-1 text-[11px] font-medium uppercase tracking-wideish text-accent transition-colors hover:text-accent-ink sm:inline-flex"
        >
          {viewAllLabel}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M4.5 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      ) : null}
    </div>
  );
}

/** FEATURED_CATEGORIES — admin'den seçilen kategoriler (kapak/başlık/açıklama override). */
function FeaturedCategoriesSection({
  title,
  subtitle,
  categories,
  className,
}: {
  title: string | null;
  subtitle: string | null;
  categories: StorefrontHomeFeaturedCategory[];
  className: string;
}) {
  return (
    <section className={`${SECTION_SPACING} ${className}`}>
      <Container>
        <SectionHeading title={title} subtitle={subtitle} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-6">
          {categories.map((category) => (
            <Link key={category.key} href={category.href} className="group/cat block">
              <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-line bg-surface-muted">
                <div className="h-full w-full transition-transform duration-500 ease-premium group-hover/cat:scale-[1.05]">
                  <ProductMedia handle={`cat-${category.key}`} title={category.title} imageUrl={category.imageUrl} />
                </div>
                <div className="scrim-media absolute inset-x-0 bottom-0 p-3">
                  <p className="on-media font-serif text-base font-normal leading-tight">
                    {category.title}
                  </p>
                  {category.description ? (
                    <p className="on-media-muted mt-0.5 line-clamp-1 text-[11px]">{category.description}</p>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}

/**
 * PRODUCT_SHOWCASE — CAROUSEL (yatay kaydırma, snap) veya GRID (yoğun responsive grid).
 * TODO-158C: section başlığında "Tümünü gör" (/products); carousel kenarlarında snap + peek.
 */
function ProductShowcaseSection({
  title,
  subtitle,
  layout,
  products,
  dict,
  className,
}: {
  title: string | null;
  subtitle: string | null;
  layout: "CAROUSEL" | "GRID";
  products: StorefrontProductSummary[];
  dict: StorefrontDictionary;
  className: string;
}) {
  if (products.length === 0) return null;
  return (
    <section className={`${SECTION_SPACING} ${className}`}>
      <Container>
        <SectionHeading
          title={title}
          subtitle={subtitle}
          viewAllHref="/products"
          viewAllLabel={dict.home.featuredViewAll}
        />
        {layout === "CAROUSEL" ? (
          <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:gap-5">
            {products.map((product) => (
              <div
                key={product.handle}
                className="w-[46%] shrink-0 snap-start sm:w-[30%] lg:w-[23%] xl:w-[18.5%]"
              >
                <StorefrontProductCard product={product} t={dict} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((product) => (
              <StorefrontProductCard key={product.handle} product={product} t={dict} />
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
