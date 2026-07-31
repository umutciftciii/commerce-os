import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import {
  Badge,
  ButtonLink,
  Container,
  EmptyState,
  Eyebrow,
  Heading,
  Stars,
} from "../../../components/ui";
// TODO-161B (ADR-137/140) — Görüntüleme izleyici (mount beacon) + açıklanabilir "Benzer Ürünler" (read-model).
import { RecentlyViewedTracker } from "../../../components/recently-viewed/recently-viewed-tracker";
import { SimilarProducts } from "../../../components/recently-viewed/similar-products";
import { BuyBox } from "../../../components/buy-box";
import { PdpDetailTabs } from "../../../components/pdp-detail-tabs";
import { PdpSelectionProvider } from "../../../components/pdp-selection";
import { PdpSkuLabel } from "../../../components/pdp-sku-label";
import { WishlistProvider } from "../../../components/wishlist/wishlist-provider";
import { isStorefrontModuleEnabled, getServerSlotVariant } from "../../../lib/server/site";
import { RatingProvider } from "../../../components/reviews/rating-provider";
import { PdpReviews } from "../../../components/reviews/pdp-reviews";
import { getWishlistStatus } from "../../../lib/server/wishlist";
import type { ReviewSummary } from "@commerce-os/api-client";
import {
  getCardRatings,
  getProductReviews,
  getProductReviewSummary,
  getReviewEligibility,
} from "../../../lib/server/reviews";
import { VariantGallery } from "../../../components/variant-gallery";
import { Breadcrumb } from "../../../components/seo/breadcrumb";
import { JsonLd } from "../../../components/seo/json-ld";
import { getRequestLocale, getStorefrontDict } from "../../../lib/i18n";
import { getStorefrontProductByHandle } from "../../../lib/server/catalog";
import { salesModeLabel } from "../../../lib/labels";
import { cheapestVariantId } from "../../../lib/catalog-types";
import { productPath } from "../../../lib/seo/routes";
import { absoluteUrl } from "../../../lib/seo/site-url";
import { buildMetadata } from "../../../lib/seo/metadata";
import { buildProductBreadcrumb } from "../../../lib/seo/breadcrumb";
import { buildBreadcrumbJsonLd, buildProductJsonLd } from "../../../lib/seo/json-ld";
import {
  deriveProductOffer,
  productMetaDescription,
  productMetaTitle,
} from "../../../lib/seo/product-seo";

// Detay canli veriden cozulur; slug -> urun eslesmesi her istekte yapilir.
export const dynamic = "force-dynamic";

/**
 * TODO-156D (brief §11/§13) — Ürün SEO metadata (merkezî builder). title/description admin seoTitle/
 * seoDescription > ürün alanları; canonical = ürün kanonik path'i (tek otorite, routes.ts).
 *
 * TODO-156D HOTFIX (soft-404) — Silinmiş/geçersiz ürün için `notFound()` BURADA (metadata fazında)
 * çağrılır. Sayfa gövdesindeki `notFound()`, `force-dynamic` + streaming'de HTML shell (200 header) flush
 * edildikten SONRA fırladığından status 200 kalıyordu (soft-404). generateMetadata yanıt gövdesi
 * başlamadan ÖNCE çalışır → burada fırlatınca Next gerçek HTTP 404 döner. DİKKAT: gateway 5xx/ağ hatası
 * (`!result.ok`) 404'e ÇEVRİLMEZ — geçici hatadır; noindex minimal meta döner, sayfa error UI render eder.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const dict = await getStorefrontDict();
  const result = await getStorefrontProductByHandle(handle, await getRequestLocale());

  if (!result.ok) {
    // Gateway 5xx / ağ hatası (silinmiş DEĞİL): 404 ÜRETME. noindex minimal meta; sayfa error EmptyState render eder.
    return { title: dict.detail.errorTitle, robots: { index: false, follow: false } };
  }
  if (result.data === null) {
    // Ürün gerçekten yok (gateway 404): HTML flush'tan ÖNCE gerçek 404 (soft-404 değil). app/not-found.tsx render olur.
    notFound();
  }

  const detail = result.data;
  const canonicalPath = productPath(detail.handle);
  const images = detail.images.map((img) => absoluteUrl(img.url));

  return buildMetadata({
    title: productMetaTitle(detail),
    description: productMetaDescription(detail, dict.meta.description),
    canonicalPath,
    robots: { index: true, follow: true },
    siteName: dict.meta.title,
    locale: await getRequestLocale(),
    openGraph: { type: "website", images },
  });
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const dict = await getStorefrontDict();
  const t = dict.detail;
  const result = await getStorefrontProductByHandle(handle, await getRequestLocale());

  if (!result.ok) {
    const title = result.reason === "no-store" ? t.notFoundTitle : t.errorTitle;
    const description = result.reason === "no-store" ? t.notFoundDescription : t.errorDescription;
    return (
      <Container className="py-16">
        <EmptyState title={title} description={description} action={backToProducts(t)} />
      </Container>
    );
  }

  if (result.data === null) {
    // TODO-156D (brief §7) — Silinen/mevcut olmayan ürün: soft-200 boş durum YERİNE gerçek 404
    // (notFound → app/not-found sınırı, status 404). Soft-404 SEO'da zararlıdır; ana sayfaya redirect YOK.
    notFound();
  }

  const detail = result.data;
  const locale = await getRequestLocale();
  // TODO-164A — Ürün detay slot variant'ı (STANDARD/GALLERY_FIRST/EDITORIAL).
  const detailVariant = await getServerSlotVariant("productDetailLayout", "standard");
  // TODO-163 Faz 3 (TD-156) — kapalı modüller: veri ÇEKİLMEZ + render EDİLMEZ + client beacon MOUNT
  // edilmez (event üretilmez). Gateway zaten otoriter (kapalı public uç 404/boş); bu, boşa çağrıyı
  // ve ölü UI'ı önler. Capability projeksiyonu `cache()`'li → hepsi tek gateway çağrısı.
  const [reviewsOn, recentlyViewedOn, recommendationsOn, wishlistOn] = await Promise.all([
    isStorefrontModuleEnabled("REVIEWS"),
    isStorefrontModuleEnabled("RECENTLY_VIEWED"),
    isStorefrontModuleEnabled("RECOMMENDATIONS"),
    isStorefrontModuleEnabled("WISHLIST"),
  ]);
  // TODO-159E (ADR-094) — GERÇEK puan/değerlendirme (REVIEWS kapalıysa fetch YOK → sıfır özet).
  const zeroReviewSummary: ReviewSummary = {
    productId: detail.id,
    averageRating: 0,
    reviewCount: 0,
    ratingDistribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
  };
  const [reviewSummary, reviewsFirstPage, eligibility] = reviewsOn
    ? await Promise.all([
        getProductReviewSummary(detail.id),
        getProductReviews(detail.id, { sort: "newest" }),
        getReviewEligibility(detail.id),
      ])
    : [zeroReviewSummary, null, null];

  // TODO-156D — Breadcrumb TEK KAYNAK (görünür UI + JSON-LD). Kategori slug'ı public detay DTO'sunda
  // yok → kategori etiketi link'siz (uydurma URL üretilmez). Ürün kanonik URL'i mutlaklanır (JSON-LD).
  const breadcrumbTrail = buildProductBreadcrumb({
    labels: { home: dict.search.breadcrumbHome, products: t.breadcrumbProducts },
    title: detail.title,
    categoryLabel: detail.categoryLabel,
    categorySlug: null,
  });
  const canonicalUrl = absoluteUrl(productPath(detail.handle));
  const offer = deriveProductOffer(detail);
  const productLd = buildProductJsonLd({
    name: detail.title,
    description: detail.description,
    url: canonicalUrl,
    images: detail.images.map((img) => absoluteUrl(img.url)),
    brand: detail.brand,
    sku: detail.sku,
    offer: offer ? { ...offer, url: canonicalUrl } : null,
  });
  const breadcrumbLd = buildBreadcrumbJsonLd(breadcrumbTrail, absoluteUrl, canonicalUrl);

  // TODO-159D/159E — PDP + benzer ürünler için TEK batched favori-durum + rating özeti.
  const relatedIds = detail.related.map((item) => item.id);
  const [savedProductIds, relatedRatings] = await Promise.all([
    wishlistOn
      ? getWishlistStatus([detail.id, ...relatedIds]).then((set) => [...set])
      : Promise.resolve<string[]>([]),
    reviewsOn ? getCardRatings(relatedIds) : Promise.resolve({}),
  ]);

  return (
    <WishlistProvider initialSavedIds={savedProductIds} enabled={wishlistOn}>
    <RatingProvider summaries={relatedRatings}>
    <Container className="py-12 lg:py-16">
      {/* TODO-161B (ADR-137) — Görüntüleme kaydı (client mount beacon; SSR/bot/prefetch ELENİR).
          TODO-163 Faz 3 (TD-156) — RECENTLY_VIEWED kapalıysa beacon MOUNT edilmez → view event yok. */}
      {recentlyViewedOn ? <RecentlyViewedTracker productId={detail.id} /> : null}
      {/* TODO-156D — Product + BreadcrumbList JSON-LD (Google Rich Results). */}
      <JsonLd data={productLd} />
      <JsonLd data={breadcrumbLd} />

      {/* Breadcrumb — paylaşılan bileşen (JSON-LD ile tek kaynak). */}
      <Breadcrumb items={breadcrumbTrail} label={dict.shell.breadcrumb} className="mb-8 text-[11px] uppercase tracking-wideish text-ink-subtle" />

      {/* Faz 2C-7 (ADR-078) — Variant Media Engine: secili varyant state'i BuyBox ile
          VariantGallery arasinda PAYLASILIR (lift). Baslik blogu SUNUCU'da kalir (provider'in
          children'i). Baslangic = varsayilan (en ucuz) varyant → SSR dogru grupla gelir. */}
      <PdpSelectionProvider defaultVariantId={cheapestVariantId(detail.variants)}>
        <div
          data-detail-variant={detailVariant}
          className="pdp-layout grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14"
        >
          {/* Sol: medya galerisi (varyanta reaktif) */}
          <VariantGallery detail={detail} t={t} />

          {/* Sag: baslik + buy box */}
          <div>
            <div className="mb-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="muted">{salesModeLabel(detail.commerce.salesMode, dict)}</Badge>
                {detail.brand ? (
                  <Eyebrow as="span">
                    {t.brandLabel}: {detail.brand}
                  </Eyebrow>
                ) : null}
              </div>
              <Heading as="h1" className="mt-4 text-2xl sm:text-3xl">
                {detail.title}
              </Heading>
              {/* TODO-163 Faz 3 (TD-156) — REVIEWS kapalıysa puan/yorum bağlantısı hiç render edilmez. */}
              {!reviewsOn ? null : reviewSummary.reviewCount > 0 ? (
                <a
                  href="#reviews"
                  className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-subtle hover:text-ink"
                >
                  <Stars
                    rating={reviewSummary.averageRating}
                    ariaLabel={format(dict.home.card.ratingAria, {
                      rating: reviewSummary.averageRating.toFixed(1),
                    })}
                  />
                  <span>{format(dict.reviews.reviewCount, { count: reviewSummary.reviewCount })}</span>
                </a>
              ) : (
                <a href="#reviews" className="mt-3 block text-xs text-ink-subtle hover:text-ink">
                  {dict.reviews.emptyTitle}
                </a>
              )}
              {/* TODO-165 (SKU reactivity) — seçili varyanta göre reaktif "Ürün kodu". */}
              <PdpSkuLabel variants={detail.variants} fallbackSku={detail.sku} label={t.skuLabel} />
            </div>

            <BuyBox detail={detail} t={dict} />
          </div>
        </div>
      </PdpSelectionProvider>

      {/* Orta: detay sekmeleri ("Storefront - PDP" tasarımı) — açıklama / özellik / kargo&iade.
          Uzun yığılmış bölümler + yan yer tutucular (yorum/S&C/birlikte-alınan/son-bakılan) yerine
          tasarımdaki derli toplu sekme yapısı. Gerçek içerik korunur (açıklama/özellik/kargo). */}
      <PdpDetailTabs detail={detail} t={dict} />

      {/* TODO-159E (ADR-094) — Gerçek değerlendirme bölümü (özet + liste + yorum yaz + helpful).
          TODO-163 Faz 3 (TD-156) — REVIEWS kapalıysa fetch YOK (reviewsFirstPage=null) → render yok. */}
      {reviewsOn && reviewsFirstPage ? (
        <PdpReviews
          productId={detail.id}
          initial={reviewsFirstPage}
          eligibility={eligibility}
          loginHref={`/auth/login?next=${encodeURIComponent(productPath(detail.handle))}`}
          t={dict}
          locale={locale}
        />
      ) : null}

      {/* TODO-161B — Benzer Ürünler: açıklanabilir öneri motoru (read-model; mevcut ürün hariç,
          sponsored/organik ranking'e dokunulmaz). Client island: skeleton/empty/error.
          TODO-163 Faz 3 (TD-156) — RECOMMENDATIONS kapalıysa island MOUNT edilmez → /similar fetch yok. */}
      {recommendationsOn ? (
        <SimilarProducts productId={detail.id} t={dict} wishlistEnabled={wishlistOn} />
      ) : null}
    </Container>
    </RatingProvider>
    </WishlistProvider>
  );
}

function backToProducts(t: StorefrontDictionary["detail"]) {
  return (
    <ButtonLink href="/products" variant="secondary">
      {t.notFoundAction}
    </ButtonLink>
  );
}
