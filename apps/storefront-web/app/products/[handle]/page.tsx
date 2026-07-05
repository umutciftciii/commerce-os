import type { ReactNode } from "react";
import Link from "next/link";
import { Badge, Button, Container, EmptyState } from "@commerce-os/ui";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { ProductCard } from "../../../components/product-card";
import { BuyBox } from "../../../components/buy-box";
import { getRequestLocale, getStorefrontDict } from "../../../lib/i18n";
import { getStorefrontProductByHandle } from "../../../lib/server/catalog";
import { salesModeLabel } from "../../../lib/labels";
import type { StorefrontProductDetail } from "../../../lib/catalog-types";

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

  return (
    <Container className="py-10">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-slate-400" aria-label="Sayfa yolu">
        <Link href="/products" className="hover:text-slate-600">
          {t.breadcrumbProducts}
        </Link>
        {detail.categoryLabel ? (
          <>
            <span className="px-2">/</span>
            <span className="text-slate-500">{detail.categoryLabel}</span>
          </>
        ) : null}
        <span className="px-2">/</span>
        <span className="text-slate-600">{detail.title}</span>
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_1fr]">
        {/* Sol: medya galerisi */}
        <Gallery t={t} />

        {/* Sag: baslik + buy box */}
        <div>
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{salesModeLabel(detail.commerce.salesMode, dict)}</Badge>
              {detail.brand ? (
                <span className="text-xs font-medium text-slate-500">
                  {t.brandLabel}: {detail.brand}
                </span>
              ) : null}
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tightish text-slate-900 sm:text-3xl">
              {detail.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-400">
              <span aria-hidden className="text-amber-400">
                ★★★★★
              </span>
              <span>{t.ratingPlaceholder}</span>
              <span aria-hidden>·</span>
              <span>{t.reviewCountPlaceholder}</span>
            </div>
            {detail.sku ? (
              <p className="mt-1 text-xs text-slate-400">
                {t.skuLabel}: <span className="font-medium text-slate-500">{detail.sku}</span>
              </p>
            ) : null}
          </div>

          <BuyBox detail={detail} t={dict} />
        </div>
      </div>

      {/* Orta: fayda + aciklama + ozellikler */}
      <div className="mt-14 grid grid-cols-1 gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title={t.benefitsTitle}>
            <ul className="space-y-2">
              {t.benefits.map((benefit) => (
                <li key={benefit} className="flex gap-2 text-sm text-slate-600">
                  <span aria-hidden className="mt-0.5 text-brand-500">
                    ✓
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>
          </Section>

          <Section title={t.descriptionTitle}>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
              {detail.description ?? t.descriptionFallback}
            </p>
          </Section>

          <Section title={t.specsTitle}>
            <Specs detail={detail} t={t} dict={dict} />
          </Section>

          <Section title={t.packageTitle}>
            <p className="text-sm leading-relaxed text-slate-600">{t.packageBody}</p>
          </Section>

          <Section title={t.usageTitle}>
            <p className="text-sm leading-relaxed text-slate-600">{t.usageBody}</p>
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
                <Button variant="secondary" disabled>
                  {dict.questions.askCta}
                </Button>
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
        <section className="mt-16">
          <h2 className="mb-6 text-lg font-semibold tracking-tightish text-slate-900">
            {dict.related.title}
          </h2>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
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
    <Link href="/products">
      <Button variant="secondary">{t.notFoundAction}</Button>
    </Link>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 py-6 first:border-t-0 first:pt-0">
      <h2 className="mb-3 text-base font-semibold tracking-tightish text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Gallery({ t }: { t: StorefrontDictionary["detail"] }) {
  return (
    <div>
      <div className="flex aspect-square items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200">
        <span className="text-sm text-slate-400">{t.galleryHint}</span>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            aria-label={t.galleryThumbAlt}
            className="aspect-square rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100"
          />
        ))}
      </div>
    </div>
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
    <dl className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-3 gap-4 px-4 py-3">
          <dt className="text-sm text-slate-400">{row.label}</dt>
          <dd className="col-span-2 text-sm text-slate-700">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SidePlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{body}</p>
    </div>
  );
}
