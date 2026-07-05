import Link from "next/link";
import { Card } from "@commerce-os/ui";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { StorefrontCampaignView, StorefrontProductSummary } from "../lib/catalog-types";
import { ctaLabel, primaryPriceText, showsNumericPrice } from "../lib/labels";

/**
 * Canli vitrin urun karti. Satis-modeli ve fiyat gorunurlugunu yansitir: ONLINE
 * urunlerde fiyat + "Sepete ekle" ipucu, teklif/randevu/whatsapp/katalog
 * urunlerinde ilgili CTA etiketi ve (gizli/talep fiyatlarda) numerik fiyat yerine
 * mesaj gosterilir. Tum gorunur metin sozlukten (urun verisi + i18n) gelir.
 *
 * F4A.6 — Otomatik sepet indirimi (AUTOMATIC_CART_DISCOUNT) uygulanan urunlerde
 * fiyat satiri yerine "Sepette" fiyat blogu gosterilir: ustu cizili normal fiyat
 * + "%X" rozeti + (sunucu guvenli hesapladiysa) kalin nihai fiyat. Nihai fiyat
 * guvenli degilse (fiyat araligi / alt-limit belirsizligi) sahte fiyat yerine
 * yalniz "Sepette %X" + alt-limit notu gosterilir. Public kupon rozeti "Kuponlu
 * urun" olarak ayrilir; kod gerektigi izlenimi VERILMEZ.
 */
export function ProductCard({
  product,
  t,
}: {
  product: StorefrontProductSummary;
  t: StorefrontDictionary;
}) {
  const { commerce, price, campaign, secondaryCoupon } = product;
  const numeric = showsNumericPrice(price);
  const isAutomatic = campaign?.displayKind === "AUTOMATIC_CART_DISCOUNT";
  const isCoupon = campaign?.displayKind === "PUBLIC_COUPON";

  return (
    <Link href={`/products/${product.handle}`} className="group block">
      <Card className="flex h-full flex-col overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-card-hover">
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
          {/* F4A.1/F4A.3/F4A.6 — Kose rozeti. Otomatik sepet indiriminde kompakt
              emerald "%X"; public kuponda amber "Kuponlu ürün"; yoksa compareAt
              indirim/yeni rozeti. */}
          {campaign ? (
            <span
              className={[
                "absolute left-3 top-3 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-card",
                isCoupon ? "bg-amber-500" : "bg-emerald-600",
              ].join(" ")}
            >
              {isAutomatic ? campaign.discountText : campaign.badgeText}
            </span>
          ) : product.badgeKind ? (
            <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-rose-600 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-card">
              {product.badgeKind === "discount" ? t.badges.discount : t.badges.new}
            </span>
          ) : null}
          {/* F4A.6 — Otomatik indirim birincil iken (stackable ise) EK kupon cipi. */}
          {isAutomatic && secondaryCoupon ? (
            <span className="absolute right-3 top-3 inline-flex items-center rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-card">
              {secondaryCoupon.badgeText}
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

          {isAutomatic && numeric ? (
            <CartPriceBlock price={price} campaign={campaign} t={t} />
          ) : (
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-sm font-semibold text-slate-900">{primaryPriceText(price, t)}</p>
              {numeric && price.compareAtLabel ? (
                <span className="text-xs text-slate-400 line-through">{price.compareAtLabel}</span>
              ) : null}
            </div>
          )}

          <p className="mt-3 text-xs font-medium text-brand-600">{ctaLabel(commerce.primaryCta, t)}</p>
        </div>
      </Card>
    </Link>
  );
}

/**
 * F4A.6 — Otomatik sepet indirimi "Sepette" fiyat blogu. Guvenli nihai fiyat
 * (estimatedFinalLabel) varsa: ustu cizili normal fiyat + "%X" + "Sepette" +
 * kalin nihai fiyat. Guvenli degilse: normal fiyat + "Sepette %X indirim" (+ alt
 * limit notu) — sahte nihai fiyat gosterilmez.
 */
function CartPriceBlock({
  price,
  campaign,
  t,
}: {
  price: StorefrontProductSummary["price"];
  campaign: StorefrontCampaignView;
  t: StorefrontDictionary;
}) {
  const normal = price.amountLabel;
  if (campaign.estimatedFinalLabel) {
    return (
      <div className="mt-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 line-through">{normal}</span>
          <span className="inline-flex items-center rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">
            {campaign.discountText}
          </span>
        </div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            {t.badges.inCart}
          </span>
          <span className="text-base font-bold text-emerald-700">{campaign.estimatedFinalLabel}</span>
        </div>
      </div>
    );
  }
  // Nihai fiyat guvenli degil: normal fiyat + "Sepette %X" rozeti (+ alt limit).
  return (
    <div className="mt-2">
      <p className="text-sm font-semibold text-slate-900">{normal}</p>
      <p className="mt-0.5 text-xs font-medium text-emerald-700">
        {campaign.label}
        {campaign.minOrderLabel
          ? ` · ${format(t.detail.campaignMinOrder, { amount: campaign.minOrderLabel })}`
          : ""}
      </p>
    </div>
  );
}
