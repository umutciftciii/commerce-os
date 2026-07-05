import Link from "next/link";
import { Card } from "@commerce-os/ui";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { StorefrontProductSummary } from "../lib/catalog-types";
import { ctaLabel, primaryPriceText, showsNumericPrice } from "../lib/labels";

/**
 * Canli vitrin urun karti. Satis-modeli ve fiyat gorunurlugunu yansitir: ONLINE
 * urunlerde fiyat + "Sepete ekle" ipucu, teklif/randevu/whatsapp/katalog
 * urunlerinde ilgili CTA etiketi ve (gizli/talep fiyatlarda) numerik fiyat yerine
 * mesaj gosterilir. Tum gorunur metin sozlukten (urun verisi + i18n) gelir.
 */
export function ProductCard({
  product,
  t,
}: {
  product: StorefrontProductSummary;
  t: StorefrontDictionary;
}) {
  const { commerce, price } = product;
  const numeric = showsNumericPrice(price);

  return (
    <Link href={`/products/${product.handle}`} className="group block">
      <Card className="flex h-full flex-col overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-card-hover">
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
          {/* F4A.1 — Kampanya rozeti oncelikli; yoksa compareAt indirim rozeti. */}
          {product.campaign ? (
            <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-card">
              {product.campaign.badgeText}
            </span>
          ) : product.badgeKind ? (
            <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-rose-600 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-card">
              {product.badgeKind === "discount" ? t.badges.discount : t.badges.new}
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col p-4">
          {product.categoryLabel ? (
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              {product.categoryLabel}
            </p>
          ) : null}
          <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-900 group-hover:text-brand-700">
            {product.title}
          </p>

          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-sm font-semibold text-slate-900">{primaryPriceText(price, t)}</p>
            {numeric && price.compareAtLabel ? (
              <span className="text-xs text-slate-400 line-through">{price.compareAtLabel}</span>
            ) : null}
          </div>

          <p className="mt-3 text-xs font-medium text-brand-600">{ctaLabel(commerce.primaryCta, t)}</p>
        </div>
      </Card>
    </Link>
  );
}
