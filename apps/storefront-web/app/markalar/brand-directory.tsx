import Link from "next/link";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { StorefrontBrandSummary } from "../../lib/catalog-types";
import { EmptyState, ProductMedia } from "../../components/ui";
import { brandPath } from "../../lib/seo/routes";

/**
 * TODO-165A (ADR-165A) Task 19 — `/markalar` dizin GRID'i (Server Component; hidrasyon gerektirmez).
 *
 * Ana sayfanın FEATURED_CATEGORIES şeridiyle (bkz. components/site/home/home-sections.tsx) AYNI premium
 * dil: hairline çerçeveli kart + `ProductMedia` (gerçek logo → `imageUrl`; yoksa deterministik monogram
 * yer tutucu — kart ASLA kırılmaz). Logo tam-bleed KAPAK değil `contain` ile ortalanır (çoğu marka logosu
 * şeffaf/dikdörtgen; kırpma yanlış olur — PDP ana görseliyle aynı `fit="contain"` kararı).
 */
export function BrandDirectory({
  brands,
  t,
}: {
  brands: StorefrontBrandSummary[];
  t: StorefrontDictionary;
}) {
  const s = t.brands;

  if (brands.length === 0) {
    return (
      <div className="mt-10">
        <EmptyState title={s.emptyTitle} description={s.emptyDescription} />
      </div>
    );
  }

  return (
    <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">
      {brands.map((brand) => (
        <Link key={brand.id} href={brandPath(brand.slug)} className="group/brand block">
          <div className="relative aspect-square overflow-hidden rounded-md border border-line bg-surface p-6 transition-colors duration-300 ease-premium group-hover/brand:border-ink">
            <ProductMedia handle={brand.slug} title={brand.name} imageUrl={brand.logoUrl} fit="contain" />
          </div>
          <p className="mt-3 text-center font-serif text-base font-normal text-ink">{brand.name}</p>
        </Link>
      ))}
    </div>
  );
}
