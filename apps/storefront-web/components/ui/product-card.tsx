import Link from "next/link";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { StorefrontProductSummary } from "../../lib/catalog-types";
import { ctaLabel, primaryPriceText, showsNumericPrice } from "../../lib/labels";
import { Badge } from "./badge";
import { ProductMedia } from "./product-media";

/**
 * PLP (Adim 3) vitrin urun karti — minimal/editoryel (Ssense/Net-a-Porter dili):
 * buyuk 4:5 gorsel (P0 yer tutucu, bkz. todo.md; `imageUrl` gelince drop-in),
 * bol beyaz alan, ince tipografi, ABARTISIZ hover (yalniz gorsel yakinlasma +
 * baslik alti cizgi). Home kartinin (`components/site/product-card.tsx`) aksine
 * wishlist/quick-view/rating MOCK etkilesimleri TASIMAZ; kasitli olarak sade.
 *
 * GERCEK ticaret semantigi korunur (istemci hesap yapmaz; etiketler sunucudan):
 *  - Satis-modu CTA ipucu (ONLINE "Sepete ekle", INQUIRY "Fiyat sor" ...).
 *  - Fiyat gorunurlugu (amount / startingFrom / onRequest / hidden).
 *  - F4A kampanya rozeti + F4A.6 "Sepette" otomatik indirim blogu + stackable kupon.
 *  - F4B EU Omnibus "son 30 gunun en dusuk fiyati" notu.
 *
 * Aksan rengi (#735389) KART ICINDE KULLANILMAZ (yalniz ust-seviye tekil CTA'ya
 * ayrildi): fiyat vurgusu notr `ink` ile yapilir.
 */
export function ProductCard({
  product,
  t,
  imageUrl,
}: {
  product: StorefrontProductSummary;
  t: StorefrontDictionary;
  /** Adim 3 — Gorsel altyapisi gelince kapak URL'i; yoksa yer tutucu (P0). */
  imageUrl?: string | null;
}) {
  const { commerce, campaign, secondaryCoupon } = product;
  const isAutomatic = campaign?.displayKind === "AUTOMATIC_CART_DISCOUNT";
  const href = `/products/${product.handle}`;

  return (
    <div className="group relative flex flex-col">
      <Link
        href={href}
        aria-label={product.title}
        className="relative block aspect-[4/5] overflow-hidden border border-line bg-surface"
      >
        <div className="h-full w-full transition-transform duration-700 ease-premium group-hover:scale-[1.04]">
          <ProductMedia handle={product.handle} title={product.title} imageUrl={imageUrl} />
        </div>

        {/* GERCEK: kampanya/indirim rozeti (notr — aksan tasimaz). */}
        {campaign ? (
          <Badge tone="ink" className="absolute left-3 top-3">
            {campaign.badgeText}
          </Badge>
        ) : product.badgeKind ? (
          <Badge tone="ink" className="absolute left-3 top-3">
            {product.badgeKind === "discount" ? t.badges.discount : t.badges.new}
          </Badge>
        ) : null}

        {/* F4A.6 — Otomatik indirim birincil iken (stackable ise) EK kupon cipi. */}
        {isAutomatic && secondaryCoupon ? (
          <Badge tone="outline" className="absolute right-3 top-3 bg-surface">
            {secondaryCoupon.badgeText}
          </Badge>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col pt-4">
        {product.categoryLabel ? (
          <p className="text-[11px] font-medium uppercase tracking-wideish text-ink-subtle">
            {product.categoryLabel}
          </p>
        ) : null}

        <Link href={href} className="mt-1 block">
          <h3 className="line-clamp-2 text-sm font-normal leading-snug text-ink underline-offset-4 group-hover:underline">
            {product.title}
          </h3>
        </Link>

        <PriceBlock product={product} t={t} />

        {/* Satis-modu ipucu (notr, kucuk). Tekil CTA butonu DEGIL — bilgi metni. */}
        <p className="mt-2 text-[11px] font-medium uppercase tracking-wideish text-ink-subtle">
          {ctaLabel(commerce.primaryCta, t)}
        </p>
      </div>
    </div>
  );
}

/**
 * Kompakt kart fiyat blogu. Sunucunun hazir etiketlerini gosterir; istemci fiyat
 * HESAPLAMAZ. Indirim gostergesi fiyat seviyesinde yansitilir:
 *  - Otomatik sepet indirimi (AUTOMATIC_CART_DISCOUNT): guvenli nihai tahmin varsa
 *    ustu cizili liste + kalin nihai + "Sepette · %X" notu; yoksa liste fiyat +
 *    "Sepette %X" notu (SAHTE nihai fiyat gosterilmez).
 *  - compareAt markdown'i: satis fiyati kalin + liste fiyati ustu cizili.
 *  - indirim yok: duz fiyat.
 * Fiyat vurgusu NOTR `ink` ile yapilir (aksan degil).
 */
function PriceBlock({
  product,
  t,
}: {
  product: StorefrontProductSummary;
  t: StorefrontDictionary;
}) {
  const { price, campaign } = product;
  const numeric = showsNumericPrice(price);
  const isAutomatic = campaign?.displayKind === "AUTOMATIC_CART_DISCOUNT";

  if (isAutomatic && campaign && numeric) {
    return (
      <div className="mt-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-ink">
            {campaign.estimatedFinalLabel ?? price.amountLabel}
          </span>
          {campaign.estimatedFinalLabel ? (
            <span className="text-xs text-ink-subtle line-through">{price.amountLabel}</span>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-wideish text-ink-subtle">
          {t.badges.inCart} · {campaign.discountText}
          {campaign.minOrderLabel
            ? ` · ${format(t.detail.campaignMinOrder, { amount: campaign.minOrderLabel })}`
            : ""}
        </p>
        {price.lowestRecentLabel ? (
          <p className="mt-1 text-[11px] text-ink-subtle">
            {format(t.badges.omnibusLowest, { amount: price.lowestRecentLabel })}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex items-baseline gap-2">
        <p className="text-sm font-semibold text-ink">{primaryPriceText(price, t)}</p>
        {numeric && price.compareAtLabel ? (
          <span className="text-xs text-ink-subtle line-through">{price.compareAtLabel}</span>
        ) : null}
      </div>
      {numeric && price.lowestRecentLabel ? (
        <p className="mt-1 text-[11px] text-ink-subtle">
          {format(t.badges.omnibusLowest, { amount: price.lowestRecentLabel })}
        </p>
      ) : null}
    </div>
  );
}
