import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container, Eyebrow, Heading, Section } from "../../../components/ui";
import { StorefrontProductCard } from "../../../components/site/product-card";
import { WishlistProvider } from "../../../components/wishlist/wishlist-provider";
import { RatingProvider } from "../../../components/reviews/rating-provider";
import { getRequestLocale, getStorefrontDict } from "../../../lib/i18n";
import { getDiscovery } from "../../../lib/server/catalog";
import { getWishlistStatus } from "../../../lib/server/wishlist";
import { getCardRatings } from "../../../lib/server/reviews";

/**
 * TODO-162 — Keşif bölümü "Tümünü gör" liste sayfası. Bir discovery section'ın (Günün Fırsatları, Sepetine
 * Göre Öneriler, Kaldığın Yerden, …) KENDİ ürünlerini tam grid olarak listeler — tüm katalog DEĞİL. İçerik
 * viewer-specific (Katman B `getDiscovery`); sectionId ile o an eligible section bulunur. Section artık uygun
 * değilse (sinyal değişti / yayından kalktı) tüm katalog listesine (`/products`) düşülür. Viewer-specific →
 * force-dynamic + noindex (kişiye özel, aranabilir değil).
 */
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return { robots: { index: false, follow: false } };
}

export default async function DiscoverySectionPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  const [dict, locale] = await Promise.all([getStorefrontDict(), getRequestLocale()]);
  const sections = await getDiscovery(locale);
  const section = sections.find((item) => item.id === sectionId);
  // Bulunamadı / artık ürün yok → tüm katalog listesine düş (vitrin bozulmaz).
  if (!section || section.products.length === 0) redirect("/products");

  const title =
    section.title ||
    (dict.discovery.titles as Record<string, string>)[section.type] ||
    dict.discovery.gridTitle;

  const ids = section.products.map((product) => product.id);
  const [savedProductIds, cardRatings] = await Promise.all([
    getWishlistStatus(ids).then((set) => [...set]),
    getCardRatings(ids),
  ]);

  return (
    <WishlistProvider initialSavedIds={savedProductIds}>
      <RatingProvider summaries={cardRatings}>
        <Section as="div" spacing="lg">
          <Container>
            <Eyebrow>{dict.discovery.gridEyebrow}</Eyebrow>
            <Heading as="h1" className="mt-3">
              {title}
            </Heading>
            <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
              {section.products.map((product) => (
                <StorefrontProductCard key={product.handle} product={product} t={dict} />
              ))}
            </div>
          </Container>
        </Section>
      </RatingProvider>
    </WishlistProvider>
  );
}
