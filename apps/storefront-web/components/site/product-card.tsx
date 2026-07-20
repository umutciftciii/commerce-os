"use client";

import { useState } from "react";
import Link from "next/link";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { StorefrontProductSummary } from "../../lib/catalog-types";
import { primaryPriceText, showsNumericPrice } from "../../lib/labels";
import { mockRating } from "../../lib/mock-rating";
import { Badge, ButtonLink, ProductMedia, Stars } from "../ui";

/**
 * Premium vitrin ürün kartı (TODO-158C yeniden tasarım). Daha kompakt, daha premium:
 * yumuşak köşeli görsel (rounded-md), hover'da hafif ölçek + kart yükselmesi, net rozet
 * sistemi (kampanya / indirim / yeni / TÜKENDİ), belirgin fiyat, tokenize edilmiş
 * medya-üzeri kontroller (`control-surface`, `overlay-scrim`) — ham black/white YOK.
 *
 * GERÇEK veri: başlık, marka/kategori, fiyat, compareAt, kampanya, stok durumu.
 * MOCK etkileşimler (backend karşılığı yok — bkz. todo.md):
 *  - Favori (wishlist) — yalnız yerel geçici durum, persist YOK.
 *  - Hızlı bakış (quick view) — mevcut özet veriyle küçük modal.
 *  - Puanlama — deterministik yer tutucu.
 */
export function StorefrontProductCard({
  product,
  t,
}: {
  product: StorefrontProductSummary;
  t: StorefrontDictionary;
}) {
  const [saved, setSaved] = useState(false); // MOCK: wishlist — persist yok.
  const [quickOpen, setQuickOpen] = useState(false);
  const href = `/products/${product.handle}`;
  const { campaign } = product;
  const rating = mockRating(product.handle);
  // GERÇEK: yalnız ONLINE satış modunda satın alınamıyorsa "Tükendi" (diğer modlar sepet dışıdır).
  const soldOut = product.commerce.salesMode === "ONLINE" && !product.commerce.purchasable;
  const promoLabel = campaign
    ? campaign.badgeText
    : product.badgeKind === "discount"
      ? t.badges.discount
      : product.badgeKind === "new"
        ? t.badges.new
        : null;

  return (
    <div className="group relative flex flex-col">
      <div className="relative aspect-[4/5] overflow-hidden rounded-md border border-line bg-surface transition-shadow duration-300 ease-premium group-hover:shadow-md">
        <Link href={href} aria-label={product.title} className="block h-full w-full">
          <div className="h-full w-full transition-transform duration-500 ease-premium group-hover:scale-[1.04]">
            <ProductMedia handle={product.handle} title={product.title} imageUrl={product.coverUrl} />
          </div>
        </Link>

        {/* Rozetler (sol üst yığın): kampanya/indirim/yeni (nötr) + TÜKENDİ (outline). */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
          {promoLabel ? <Badge tone="ink">{promoLabel}</Badge> : null}
          {soldOut ? (
            <Badge tone="outline" className="bg-surface">
              {t.home.card.soldOut}
            </Badge>
          ) : null}
        </div>

        {/* MOCK: Favori — tokenize cam kontrol. */}
        <button
          type="button"
          onClick={() => setSaved((v) => !v)}
          aria-label={t.home.card.wishlistAdd}
          aria-pressed={saved}
          className="control-surface absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full backdrop-blur transition-colors"
        >
          <HeartIcon filled={saved} />
        </button>

        {/* MOCK: Hızlı bakış — hover'da beliren düğme. */}
        <div className="absolute inset-x-0 bottom-0 translate-y-2 p-3 opacity-0 transition-all duration-300 ease-premium group-hover:translate-y-0 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => setQuickOpen(true)}
            className="w-full rounded-sm bg-ink py-2.5 text-[11px] font-medium uppercase tracking-wideish text-surface transition-opacity hover:opacity-90"
          >
            {t.home.card.quickView}
          </button>
        </div>
      </div>

      {/* Bilgi — kompakt yoğunluk. */}
      <div className="flex flex-1 flex-col pt-3">
        {product.categoryLabel ? (
          <p className="text-[10px] font-medium uppercase tracking-wideish text-ink-subtle">
            {product.categoryLabel}
          </p>
        ) : null}
        <Link href={href} className="mt-0.5 block">
          <h3 className="line-clamp-2 text-[13px] font-medium leading-snug text-ink underline-offset-4 transition-all group-hover:underline">
            {product.title}
          </h3>
        </Link>

        <div className="mt-1 flex items-center gap-1.5">
          <Stars rating={rating.value} ariaLabel={format(t.home.card.ratingAria, { rating: rating.value.toFixed(1) })} />
          <span className="text-[11px] text-ink-subtle">
            {format(t.home.card.reviews, { count: rating.count })}
          </span>
        </div>

        <PriceBlock product={product} t={t} size="sm" />
      </div>

      {quickOpen ? (
        <QuickView product={product} rating={rating} t={t} onClose={() => setQuickOpen(false)} />
      ) : null}
    </div>
  );
}

/** MOCK: hızlı bakış modalı — mevcut özet veriyle (ekstra istek yok). */
function QuickView({
  product,
  rating,
  t,
  onClose,
}: {
  product: StorefrontProductSummary;
  rating: { value: number; count: number };
  t: StorefrontDictionary;
  onClose: () => void;
}) {
  const href = `/products/${product.handle}`;
  return (
    <div
      className="overlay-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={product.title}
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-md bg-surface shadow-lg sm:flex-row"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t.home.card.close}
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-muted"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <div className="aspect-square w-full bg-surface-muted sm:w-1/2">
          <ProductMedia handle={product.handle} title={product.title} imageUrl={product.coverUrl} />
        </div>
        <div className="flex w-full flex-col justify-center gap-3 p-6 sm:w-1/2 sm:p-8">
          {product.categoryLabel ? (
            <p className="text-[11px] font-medium uppercase tracking-wideish text-ink-subtle">
              {product.categoryLabel}
            </p>
          ) : null}
          <h2 className="font-serif text-2xl font-normal tracking-tightish text-ink">
            {product.title}
          </h2>
          <Stars
            rating={rating.value}
            ariaLabel={format(t.home.card.ratingAria, { rating: rating.value.toFixed(1) })}
          />
          <PriceBlock product={product} t={t} size="md" />
          <ButtonLink href={href} variant="primary" className="mt-2 w-full">
            {t.home.card.viewProduct}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

/**
 * Ürün kartı/quick-view fiyat bloğu. İndirim göstergesini fiyat seviyesinde yansıtır:
 *  - Sepet kampanyası (AUTOMATIC_CART_DISCOUNT): liste üzeri çizili + "Sepette" nihai (güvenli tahmin varsa).
 *  - compareAt liste markdown'ı: satış kalın + liste üzeri çizili.
 *  - indirim yok: düz fiyat.
 */
function PriceBlock({
  product,
  t,
  size,
}: {
  product: StorefrontProductSummary;
  t: StorefrontDictionary;
  size: "sm" | "md";
}) {
  const { price, campaign } = product;
  const numeric = showsNumericPrice(price);
  const finalSize = size === "md" ? "text-lg" : "text-sm";
  const strikeSize = size === "md" ? "text-sm" : "text-xs";

  if (campaign && campaign.displayKind === "AUTOMATIC_CART_DISCOUNT" && numeric) {
    return (
      <div className="mt-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={`${finalSize} font-semibold text-ink`}>
            {campaign.estimatedFinalLabel ?? price.amountLabel}
          </span>
          {campaign.estimatedFinalLabel ? (
            <span className={`${strikeSize} text-ink-subtle line-through`}>{price.amountLabel}</span>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-wideish text-ink-subtle">
          {t.badges.inCart} · {campaign.discountText}
          {campaign.minOrderLabel
            ? ` · ${format(t.detail.campaignMinOrder, { amount: campaign.minOrderLabel })}`
            : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-baseline gap-2">
      <p className={`${finalSize} font-semibold text-ink`}>{primaryPriceText(price, t)}</p>
      {numeric && price.compareAtLabel ? (
        <span className={`${strikeSize} text-ink-subtle line-through`}>{price.compareAtLabel}</span>
      ) : null}
    </div>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 16.5S3 12.5 3 7.75A3.25 3.25 0 0 1 10 5.6a3.25 3.25 0 0 1 7 2.15C17 12.5 10 16.5 10 16.5Z"
        fill={filled ? "var(--ink)" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
