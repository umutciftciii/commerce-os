import type { ReactNode } from "react";
import Link from "next/link";
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
  Text,
} from "../../../components/ui";
import { ProductCard } from "../../../components/ui/product-card";
import { BuyBox } from "../../../components/buy-box";
import { PdpSelectionProvider } from "../../../components/pdp-selection";
import { VariantGallery } from "../../../components/variant-gallery";
import { getRequestLocale, getStorefrontDict } from "../../../lib/i18n";
import { getStorefrontProductByHandle } from "../../../lib/server/catalog";
import { salesModeLabel } from "../../../lib/labels";
import { mockRating } from "../../../lib/mock-rating";
import { cheapestVariantId, type StorefrontProductDetail } from "../../../lib/catalog-types";

// Detay canli veriden cozulur; slug -> urun eslesmesi her istekte yapilir.
export const dynamic = "force-dynamic";

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
    return (
      <Container className="py-16">
        <EmptyState
          title={t.notFoundTitle}
          description={t.notFoundDescription}
          action={backToProducts(t)}
        />
      </Container>
    );
  }

  const detail = result.data;
  // MOCK: puan/değerlendirme — Home kartıyla AYNI deterministik helper (bkz. todo.md).
  const rating = mockRating(detail.handle);

  return (
    <Container className="py-12 lg:py-16">
      {/* Breadcrumb */}
      <nav className="mb-8 text-[11px] uppercase tracking-wideish text-ink-subtle" aria-label="Sayfa yolu">
        <Link href="/products" className="transition-colors hover:text-ink">
          {t.breadcrumbProducts}
        </Link>
        {detail.categoryLabel ? (
          <>
            <span className="px-2 text-line-strong">/</span>
            <span className="text-ink-muted">{detail.categoryLabel}</span>
          </>
        ) : null}
        <span className="px-2 text-line-strong">/</span>
        <span className="text-ink">{detail.title}</span>
      </nav>

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

      {/* Orta: fayda + aciklama + ozellikler */}
      <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-3 lg:gap-14">
        <div className="lg:col-span-2">
          <Section title={t.benefitsTitle}>
            <ul className="space-y-2.5">
              {t.benefits.map((benefit) => (
                <li key={benefit} className="flex gap-2.5 text-sm text-ink-muted">
                  <span aria-hidden className="mt-0.5 text-ink">
                    ✓
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>
          </Section>

          <Section title={t.descriptionTitle}>
            <Text className="whitespace-pre-line">{detail.description ?? t.descriptionFallback}</Text>
          </Section>

          <Section title={t.specsTitle}>
            <Specs detail={detail} t={t} dict={dict} />
          </Section>

          <Section title={t.packageTitle}>
            <Text>{t.packageBody}</Text>
          </Section>

          <Section title={t.usageTitle}>
            <Text>{t.usageBody}</Text>
          </Section>

          {/* Yorumlar (yer tutucu) */}
          <Section title={dict.reviews.title}>
            <EmptyState title={dict.reviews.emptyTitle} description={dict.reviews.emptyBody} />
          </Section>

          {/* Soru & cevap (yer tutucu) */}
          <Section title={dict.questions.title}>
            <EmptyState
              title={dict.questions.emptyTitle}
              description={dict.questions.emptyBody}
              action={
                <ButtonLink href="/products" variant="secondary">
                  {dict.questions.askCta}
                </ButtonLink>
              }
            />
          </Section>
        </div>

        {/* Yan kolon: birlikte alinanlar / son bakilanlar (yer tutucu) */}
        <aside className="space-y-6">
          <SidePlaceholder
            title={dict.related.boughtTogetherTitle}
            body={dict.related.boughtTogetherBody}
          />
          <SidePlaceholder
            title={dict.related.recentlyViewedTitle}
            body={dict.related.recentlyViewedBody}
          />
        </aside>
      </div>

      {/* Benzer urunler (canli) */}
      {detail.related.length > 0 ? (
        <section className="mt-20">
          <Heading as="h2" className="mb-8 text-xl sm:text-2xl">
            {dict.related.title}
          </Heading>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-14">
            {detail.related.map((item) => (
              <ProductCard key={item.handle} product={item} t={dict} />
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-8 first:border-t-0 first:pt-0">
      <Heading as="h2" className="mb-4 text-lg sm:text-xl">
        {title}
      </Heading>
      {children}
    </section>
  );
}

function Specs({
  detail,
  t,
  dict,
}: {
  detail: StorefrontProductDetail;
  t: StorefrontDictionary["detail"];
  dict: StorefrontDictionary;
}) {
  const rows: { label: string; value: string }[] = [];
  if (detail.brand) rows.push({ label: t.specBrand, value: detail.brand });
  if (detail.categoryLabel) rows.push({ label: t.specCategory, value: detail.categoryLabel });
  if (detail.sku) rows.push({ label: t.specSku, value: detail.sku });
  if (detail.variants.length > 0) {
    rows.push({ label: t.specOptions, value: detail.variants.map((v) => v.title).join(", ") });
  }
  rows.push({ label: t.specSalesMode, value: salesModeLabel(detail.commerce.salesMode, dict) });

  return (
    <dl className="divide-y divide-line border border-line">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-3 gap-4 px-4 py-3">
          <dt className="text-sm text-ink-subtle">{row.label}</dt>
          <dd className="col-span-2 text-sm text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SidePlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-line bg-surface p-5">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-ink-subtle">{body}</p>
    </div>
  );
}
