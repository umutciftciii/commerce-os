"use client";

import { useState } from "react";
import Link from "next/link";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { ListingSwatch, SearchListingCard } from "../../lib/search/listing-adapter";
import { Badge } from "../ui/badge";
import { ProductMedia } from "../ui/product-media";

/**
 * TODO-156B (ANALIZ-156A §5-§9) — Public search projeksiyonuyla beslenen PLP kartı.
 *
 * Search yanıtı kartın TEK veri kaynağıdır (ikinci hidrasyon YOK); ticari alanlar (indirim %, compareAt,
 * Omnibus) sunucuda hesaplanır, burada YALNIZCA gösterilir. Aksan rengi (#735389) kart içinde KULLANILMAZ.
 *
 * Görsel öncelik sırası (§8): 1) aktif swatch önizleme → 2) secondary hover (yalnız hover-capable cihaz) →
 * 3) primary. Swatch YALNIZ görsel önizlemedir (varyant seçimi/SKU/fiyat/sepet kararı YOK — §7). colorHex
 * yoksa erişilebilir label fallback; görsel yoksa primary/placeholder fallback.
 *
 * TODO-155.2 — Kampanya rozeti/"Sepette" fiyatı artık search read-model snapshot'ından gelir (PDP ile AYNI
 * "tek formül"; istemci HESAP YAPMAZ). ÖNCELİK (belgeli): otomatik sepet kampanyası varsa "Sepette" bloğu
 * gösterilir (compareAt üstü-çizili + Omnibus bu dalda GİZLENİR — kampanya güncel/gösterilen tekliftir);
 * kampanya yoksa compareAt liste-markdown'ı + Omnibus gösterilir (F4C semantiği). Kampanyasız kart kırılmaz.
 */
export function SearchProductCard({
  card,
  t,
  priority = false,
}: {
  card: SearchListingCard;
  t: StorefrontDictionary;
  /** İlk görünür satır (LCP) → eager/priority görsel. */
  priority?: boolean;
}) {
  const s = t.search;
  // Aktif swatch önizleme (hover/focus ile set; ayrılınca temizlenir). Yalnız görsel state.
  const [activeSwatch, setActiveSwatch] = useState<ListingSwatch | null>(null);

  // Görsel öncelik: aktif swatch görseli > (secondary hover CSS ile) > primary/placeholder.
  const baseImageUrl = activeSwatch?.imageUrl ?? card.primaryImage?.url ?? null;
  const baseAlt = activeSwatch ? format(s.swatchLabel, { label: activeSwatch.label }) : card.primaryImage?.alt ?? card.title;
  // Secondary hover katmanı YALNIZCA swatch önizleme yokken ve secondary görsel varken.
  const showSecondary = !activeSwatch && card.secondaryImage !== null;
  const discountBadgePercent = badgePercent(card);

  return (
    <div className="group relative flex flex-col">
      <Link
        href={card.href}
        aria-label={card.title}
        className="relative block aspect-[4/5] overflow-hidden border border-line bg-surface"
      >
        {/* Temel görsel (swatch önizleme dahil) — layout-shift'siz drop-in. */}
        <div className="h-full w-full transition-transform duration-700 ease-premium group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
          <ProductMedia
            handle={card.slug}
            title={card.title}
            imageUrl={baseImageUrl}
            alt={baseAlt}
            priority={priority}
          />
        </div>

        {/* Secondary hover katmanı: yalnız hover-capable cihazda (touch'ta varsayım yok) fade-in. */}
        {showSecondary ? (
          <img
            src={card.secondaryImage!.url}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 ease-premium [@media(hover:hover)]:group-hover:opacity-100 motion-reduce:transition-none"
          />
        ) : null}

        {/* İndirim rozeti (nötr — aksan taşımaz). compareAt markdown %'si öncelik; yoksa otomatik kampanya %'si. */}
        {discountBadgePercent !== null ? (
          <Badge tone="ink" className="absolute left-3 top-3">
            {format(s.discountBadge, { percent: discountBadgePercent })}
          </Badge>
        ) : null}

        {/* Stok dışı göstergesi (renk tek başına anlam taşımaz → metin). */}
        {!card.inStock ? (
          <Badge tone="outline" className="absolute right-3 top-3 bg-surface">
            {s.outOfStock}
          </Badge>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col pt-4">
        {card.categoryLabel ? (
          <p className="text-[11px] font-medium uppercase tracking-wideish text-ink-subtle">
            {card.categoryLabel}
          </p>
        ) : null}

        <Link href={card.href} className="mt-1 block">
          <h3 className="line-clamp-2 text-sm font-normal leading-snug text-ink underline-offset-4 group-hover:underline">
            {card.title}
          </h3>
        </Link>

        <PriceBlock card={card} t={t} />

        {card.swatches.length > 0 ? (
          <SwatchRow card={card} t={t} onPreview={setActiveSwatch} />
        ) : null}
      </div>
    </div>
  );
}

/** Kart üst-sol indirim rozeti yüzdesi: compareAt markdown önceliği; yoksa otomatik kampanya %'si; yoksa null. */
function badgePercent(card: SearchListingCard): number | null {
  if (card.discountPercent !== null) return card.discountPercent;
  if (card.campaign?.isAutomatic && card.campaign.percent !== null) return card.campaign.percent;
  return null;
}

/**
 * Kart fiyat bloğu — sunucunun hazır etiketleri; istemci fiyat HESAPLAMAZ. Vurgu nötr `ink`.
 * ÖNCELİK: otomatik "Sepette" kampanyası (güvenli tahmin) → kampanya bloğu; aksi compareAt markdown + Omnibus.
 */
function PriceBlock({ card, t }: { card: SearchListingCard; t: StorefrontDictionary }) {
  if (card.priceLabel === null) return null;
  const campaign = card.campaign;

  // Sepet kampanyası (kod gerektirmeden sepette uygulanır) — PDP ile AYNI "Sepette" sunumu.
  if (campaign && campaign.isAutomatic) {
    return (
      <div className="mt-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-ink">{campaign.estimatedFinalLabel ?? card.priceLabel}</span>
          {campaign.estimatedFinalLabel ? (
            <span className="text-xs text-ink-subtle line-through">{card.priceLabel}</span>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-wideish text-ink-subtle">
          {t.badges.inCart} · {campaign.discountText}
          {campaign.minOrderLabel ? ` · ${format(t.detail.campaignMinOrder, { amount: campaign.minOrderLabel })}` : ""}
        </p>
      </div>
    );
  }

  // compareAt liste markdown'ı ya da indirim yok (F4C semantiği + Omnibus).
  return (
    <div className="mt-2">
      <div className="flex items-baseline gap-2">
        <p className="text-sm font-semibold text-ink">{card.priceLabel}</p>
        {card.compareAtLabel ? (
          <span className="text-xs text-ink-subtle line-through">{card.compareAtLabel}</span>
        ) : null}
      </div>
      {card.omnibusLabel ? (
        <p className="mt-1 text-[11px] text-ink-subtle">
          {format(t.badges.omnibusLowest, { amount: card.omnibusLabel })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Renk swatch şeridi (§7). Yalnız görsel önizleme: hover/focus → kart görselini değiştir; ayrılınca
 * varsayılana dön. Klavye ile erişilebilir; renk tek başına anlam taşımaz (aria-label + görünür label).
 */
function SwatchRow({
  card,
  t,
  onPreview,
}: {
  card: SearchListingCard;
  t: StorefrontDictionary;
  onPreview: (swatch: ListingSwatch | null) => void;
}) {
  const s = t.search;
  return (
    <ul
      className="mt-3 flex items-center gap-1.5"
      aria-label={s.swatchGroupLabel}
    >
      {card.swatches.map((swatch) => (
        <li key={swatch.optionId}>
          <button
            type="button"
            aria-label={format(s.swatchLabel, { label: swatch.label })}
            title={swatch.label}
            onMouseEnter={() => onPreview(swatch)}
            onMouseLeave={() => onPreview(null)}
            onFocus={() => onPreview(swatch)}
            onBlur={() => onPreview(null)}
            className="block h-5 w-5 rounded-full border border-line transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 motion-reduce:transition-none"
            style={swatch.colorHex ? { backgroundColor: swatch.colorHex } : undefined}
          >
            {/* colorHex yoksa erişilebilir label baş harfi (renk tek başına anlam taşımasın). */}
            {!swatch.colorHex ? (
              <span aria-hidden className="flex h-full w-full items-center justify-center text-[9px] text-ink-subtle">
                {swatch.label.trim()[0]?.toLocaleUpperCase("tr-TR") ?? "·"}
              </span>
            ) : null}
          </button>
        </li>
      ))}
      {card.extraSwatchCount > 0 ? (
        <li>
          <span className="ml-0.5 text-[11px] font-medium text-ink-subtle">
            {format(s.swatchMore, { count: card.extraSwatchCount })}
          </span>
        </li>
      ) : null}
    </ul>
  );
}
