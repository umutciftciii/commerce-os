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
  Muted,
  Stars,
} from "../../../components/ui";
// TODO-158C — Benzer ürünler kartı: legacy slate/brand `ui/ProductCard` yerine token'lı
// premium `StorefrontProductCard` (aynı StorefrontProductSummary imzası; vitrin kart dili birleşir).
import { StorefrontProductCard } from "../../../components/site/product-card";
import { BuyBox } from "../../../components/buy-box";
import { PdpDetailTabs } from "../../../components/pdp-detail-tabs";
import { PdpSelectionProvider } from "../../../components/pdp-selection";
import { VariantGallery } from "../../../components/variant-gallery";
import { Breadcrumb } from "../../../components/seo/breadcrumb";
import { JsonLd } from "../../../components/seo/json-ld";
import { getRequestLocale, getStorefrontDict } from "../../../lib/i18n";
import { getStorefrontProductByHandle } from "../../../lib/server/catalog";
import { salesModeLabel } from "../../../lib/labels";
import { mockRating } from "../../../lib/mock-rating";
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
  // MOCK: puan/değerlendirme — Home kartıyla AYNI deterministik helper (bkz. todo.md).
  const rating = mockRating(detail.handle);

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

  return (
    <Container className="py-12 lg:py-16">
      {/* TODO-156D — Product + BreadcrumbList JSON-LD (Google Rich Results). */}
      <JsonLd data={productLd} />
      <JsonLd data={breadcrumbLd} />

      {/* Breadcrumb — paylaşılan bileşen (JSON-LD ile tek kaynak). */}
      <Breadcrumb items={breadcrumbTrail} label={dict.shell.breadcrumb} className="mb-8 text-[11px] uppercase tracking-wideish text-ink-subtle" />

      {/* Faz 2C-7 (ADR-078) — Variant Media Engine: secili varyant state'i BuyBox ile
          VariantGallery arasinda PAYLASILIR (lift). Baslik blogu SUNUCU'da kalir (provider'in
          children'i). Baslangic = varsayilan (en ucuz) varyant → SSR dogru grupla gelir. */}
      <PdpSelectionProvider defaultVariantId={cheapestVariantId(detail.variants)}>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
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
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
                <Stars
                  rating={rating.value}
                  ariaLabel={format(dict.home.card.ratingAria, { rating: rating.value.toFixed(1) })}
                />
                <span>{format(dict.home.card.reviews, { count: rating.count })}</span>
              </div>
              {detail.sku ? (
                <Muted className="mt-2">
                  {t.skuLabel}: <span className="font-medium text-ink-muted">{detail.sku}</span>
                </Muted>
              ) : null}
            </div>

            <BuyBox detail={detail} t={dict} />
          </div>
        </div>
      </PdpSelectionProvider>

      {/* Orta: detay sekmeleri ("Storefront - PDP" tasarımı) — açıklama / özellik / kargo&iade.
          Uzun yığılmış bölümler + yan yer tutucular (yorum/S&C/birlikte-alınan/son-bakılan) yerine
          tasarımdaki derli toplu sekme yapısı. Gerçek içerik korunur (açıklama/özellik/kargo). */}
      <PdpDetailTabs detail={detail} t={dict} />

      {/* Benzer urunler (canli) */}
      {detail.related.length > 0 ? (
        <section className="mt-20">
          <Heading as="h2" className="mb-8 text-xl sm:text-2xl">
            {dict.related.title}
          </Heading>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-14">
            {detail.related.map((item) => (
              <StorefrontProductCard key={item.handle} product={item} t={dict} />
            ))}
          </div>
        </section>
      ) : null}
    </Container>
  );
}

function backToProducts(t: StorefrontDictionary["detail"]) {
  return (
    <ButtonLink href="/products" variant="secondary">
      {t.notFoundAction}
    </ButtonLink>
  );
}
