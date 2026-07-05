"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@commerce-os/ui";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import {
  maxPurchasableQuantity,
  type StorefrontCampaignView,
  type StorefrontProductDetail,
  type StorefrontVariantView,
} from "../lib/catalog-types";
import { ctaLabel, primaryPriceText, showsNumericPrice } from "../lib/labels";
import { formatMinor } from "../lib/money";
import { addToCartAction, claimCouponAction } from "../lib/server/cart-actions";

const LOW_STOCK = 5;

function stockLabel(variant: StorefrontVariantView | undefined, t: StorefrontDictionary["detail"]) {
  if (!variant || variant.available === null) return { text: t.stockUnknown, tone: "neutral" as const };
  if (variant.available <= 0) return { text: t.stockOut, tone: "danger" as const };
  if (variant.available <= LOW_STOCK) return { text: t.stockLow, tone: "warning" as const };
  return { text: t.stockIn, tone: "success" as const };
}

/**
 * Satin alma karar paneli (buy box). Varyant secimi ve (yalniz ONLINE) adet
 * secimi yereldir; gercek sepet/odeme YOKTUR (F3B). CTA, satis-modeline gore
 * degisir: ONLINE'da sepete ekle/hemen al kontrollu sekilde /cart'a yonlendirir,
 * diger modlarda ilgili iletisim CTA'si gosterilir. Fiyat gizli/talep modunda
 * numerik fiyat gosterilmez.
 */
export function BuyBox({ detail, t }: { detail: StorefrontProductDetail; t: StorefrontDictionary }) {
  const { commerce, variants, price } = detail;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? null);
  const [quantity, setQuantity] = useState(commerce.minQuantity);
  const [added, setAdded] = useState(false);

  const selected = variants.find((variant) => variant.id === selectedId) ?? variants[0];
  const numeric = showsNumericPrice(price);
  const stock = stockLabel(selected, t.detail);

  // Satin alinabilir azami adet = magaza max sinir ile (biliniyorsa) varyant stok
  // limitinin kucugu. Stok bilinmiyorsa (available === null) yalniz magaza siniri
  // gecerlidir; server reconcile yine son guvenliktir. Stok 0/yok ise satilamaz.
  const storeMax = commerce.maxQuantity ?? 99;
  const stockLimit = selected?.available ?? null;
  const outOfStock = !!selected && selected.inStock === false;
  const maxQty = maxPurchasableQuantity({
    minQuantity: commerce.minQuantity,
    storeMax: commerce.maxQuantity,
    available: stockLimit,
  });
  const clamp = (value: number) => Math.min(Math.max(value, commerce.minQuantity), maxQty);
  // Stok, magaza sinirindan once devreye giren baglayici kisit mi? (uyari metni icin)
  const stockIsBinding = stockLimit !== null && !outOfStock && stockLimit <= storeMax;
  const atStockLimit = stockIsBinding && quantity >= maxQty;

  // Varyant degisince (veya stok limiti dususe) adet yeni maksimuma normalize edilir.
  // Bagimliliklar bilincli olarak [selectedId, maxQty]; setQuantity sabittir.
  useEffect(() => {
    setQuantity((q) => Math.min(Math.max(q, commerce.minQuantity), maxQty));
  }, [selectedId, maxQty, commerce.minQuantity]);

  // Buy box'ta gosterilen tutar = secili varyant birim fiyati x adet. Ham minor
  // tutarlar varsa istemcide bicimlenir; yoksa tekil etiketlere geri dusulur
  // (gizli/talep modunda numeric zaten false). Sepet/odeme tutari gateway'de
  // yeniden hesaplanir — bu yalniz gosterimdir.
  const currency = selected?.currency ?? "TRY";
  const unitMinor = selected?.priceMinor ?? null;
  const compareMinor = selected?.compareAtMinor ?? null;
  const totalLabel =
    numeric && unitMinor !== null
      ? formatMinor(unitMinor * quantity, currency)
      : (selected?.priceLabel ?? price.amountLabel);
  const compareTotalLabel =
    numeric && compareMinor !== null
      ? formatMinor(compareMinor * quantity, currency)
      : (selected?.compareAtLabel ?? price.compareAtLabel);
  // Adet > 1 iken birim fiyat ipucu ("Birim fiyat ₺1.299,00") gosterilir.
  const showUnitNote = numeric && unitMinor !== null && quantity > 1;

  // ADD_TO_CART: secili varyanti cookie sepete ekler (Server Action) ve SAYFADA
  // KALIR — yonlendirme YOK; nav sayaci revalidate ile guncellenir, inline bir
  // "sepete eklendi" geri bildirimi gosterilir. BUY_NOW (Simdi Al): sepete ekleyip
  // checkout'a yonlendirir. Adet/varyant istemci state'idir; fiyat/stok/uygunluk
  // gateway tarafinda yeniden dogrulanir.
  const canAddToCart =
    commerce.primaryCta === "ADD_TO_CART" && !commerce.primaryCtaDisabled && !!selected && !outOfStock;

  function addToCart() {
    if (!selected) return;
    startTransition(async () => {
      await addToCartAction(selected.id, quantity);
      setAdded(true);
    });
  }

  function buyNow() {
    if (!selected) return;
    startTransition(async () => {
      await addToCartAction(selected.id, quantity);
      router.push("/checkout");
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      {/* Fiyat (adet x birim fiyat) */}
      <div className="flex items-baseline gap-2">
        {numeric ? (
          <>
            <span className="text-2xl font-semibold text-slate-900">{totalLabel}</span>
            {compareTotalLabel ? (
              <span className="text-sm text-slate-400 line-through">{compareTotalLabel}</span>
            ) : null}
          </>
        ) : (
          <span className="text-lg font-semibold text-slate-900">{primaryPriceText(price, t)}</span>
        )}
      </div>
      {/* F4B — EU Omnibus notu: indirim varken son 30 günün en düşük fiyatı. */}
      {numeric && price.lowestRecentLabel ? (
        <p className="mt-1 text-xs text-slate-400">
          {format(t.badges.omnibusLowest, { amount: price.lowestRecentLabel })}
        </p>
      ) : null}
      {showUnitNote ? (
        <p className="mt-1 text-xs text-slate-500">
          {format(t.buyBox.unitEach, { price: formatMinor(unitMinor as number, currency) })}
        </p>
      ) : null}
      {numeric ? <p className="mt-1 text-xs text-slate-400">{t.buyBox.priceNote}</p> : null}

      {/* F4A.1/F4A.3 — Aktif kampanya bilgisi (fiyata yakin). Otomatik sepet
          indirimi ile public kupon AYRI gosterilir; metinler sunucu-otoriter
          public rozet projeksiyonundan turetilir, tutar hesabi yapilmaz. */}
      {detail.campaign ? <DetailCampaign campaign={detail.campaign} t={t} /> : null}

      {/* Stok durumu */}
      <div className="mt-3">
        <Badge tone={stock.tone} dot>
          {stock.text}
        </Badge>
      </div>

      {/* Varyant secimi */}
      {variants.length > 0 ? (
        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-slate-700">{t.detail.variantTitle}</p>
          <div className="flex flex-wrap gap-2">
            {variants.map((variant) => {
              const active = variant.id === selected?.id;
              return (
                <button
                  key={variant.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSelectedId(variant.id);
                    setAdded(false);
                  }}
                  className={[
                    "rounded-lg border px-3 py-2 text-sm transition-colors",
                    active
                      ? "border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                      : "border-slate-200 text-slate-600 hover:border-slate-300",
                  ].join(" ")}
                >
                  {variant.title}
                </button>
              );
            })}
          </div>
          {selected ? (
            <p className="mt-2 text-xs text-slate-400">
              {t.detail.skuLabel}: <span className="font-medium text-slate-500">{selected.sku}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Adet (yalniz ONLINE satilabilir) — stok limitine duyarli */}
      {commerce.showQuantity ? (
        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-slate-700">{t.detail.quantityLabel}</p>
          <div className="inline-flex items-center rounded-lg border border-slate-200">
            <button
              type="button"
              aria-label={t.buyBox.decrease}
              disabled={outOfStock || quantity <= commerce.minQuantity}
              onClick={() => {
                setQuantity((q) => clamp(q - 1));
                setAdded(false);
              }}
              className="h-10 w-10 text-lg text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
            >
              −
            </button>
            <span className="w-10 text-center text-sm font-medium text-slate-900">{quantity}</span>
            <button
              type="button"
              aria-label={t.buyBox.increase}
              disabled={outOfStock || quantity >= maxQty}
              onClick={() => {
                setQuantity((q) => clamp(q + 1));
                setAdded(false);
              }}
              className="h-10 w-10 text-lg text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
            >
              +
            </button>
          </div>
          {/* Stok sinir uyarisi: kullanici en fazla stok kadar secebilir. */}
          {atStockLimit ? (
            <p role="status" className="mt-2 text-xs font-medium text-amber-600">
              {format(t.buyBox.maxQtyNote, { max: maxQty })}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Stokta yok: adet/CTA devre disi + net mesaj */}
      {outOfStock ? (
        <p role="status" className="mt-4 text-sm font-medium text-red-600">
          {t.buyBox.outOfStock}
        </p>
      ) : null}

      {/* Satis-modeli aciklamasi (ONLINE disi) */}
      <SalesModeLead detail={detail} t={t} />

      {/* CTA */}
      <div className="mt-5 flex flex-col gap-2">
        {commerce.primaryCta === "ADD_TO_CART" ? (
          <>
            <Button className="w-full" disabled={!canAddToCart || isPending} onClick={addToCart}>
              {detail.callToActionLabel ?? ctaLabel(commerce.primaryCta, t)}
            </Button>
            {commerce.secondaryCta ? (
              <Button
                variant="secondary"
                className="w-full"
                disabled={!canAddToCart || isPending}
                onClick={buyNow}
              >
                {ctaLabel(commerce.secondaryCta, t)}
              </Button>
            ) : null}
            {/* Sepete eklendi geri bildirimi (yonlendirme yok) */}
            {added ? (
              <div
                role="status"
                className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
              >
                <span className="font-medium">✓ {t.buyBox.addedToCart}</span>
                <Link href="/cart" className="text-xs font-semibold underline hover:text-emerald-900">
                  {t.buyBox.goToCart}
                </Link>
              </div>
            ) : null}
          </>
        ) : (
          <Button className="w-full" disabled={commerce.primaryCtaDisabled}>
            {detail.callToActionLabel ?? ctaLabel(commerce.primaryCta, t)}
          </Button>
        )}
      </div>

      {/* Favori / paylas (yer tutucu) */}
      <div className="mt-3 flex items-center justify-center gap-4 text-xs text-slate-400">
        <span>{t.buyBox.favorite}</span>
        <span aria-hidden>·</span>
        <span>{t.buyBox.share}</span>
      </div>

      {/* Guven kartlari */}
      <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4">
        <TrustRow title={t.buyBox.delivery.title} body={t.buyBox.delivery.body} />
        <TrustRow title={t.buyBox.returns.title} body={t.buyBox.returns.body} />
        <TrustRow title={t.buyBox.secure.title} body={t.buyBox.secure.body} />
      </dl>

      {/* Satici kartı */}
      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-900">{t.buyBox.seller.title}</p>
          <Badge tone="success">{t.buyBox.seller.badge}</Badge>
        </div>
        <p className="mt-1 text-xs text-slate-500">{t.buyBox.seller.body}</p>
      </div>
    </div>
  );
}

/**
 * F4A.3 — Urun detay kampanya kutusu. AUTOMATIC_CART_DISCOUNT: emerald "Sepette
 * %10 indirim" + "Kod gerekmez" + alt limit. PUBLIC_COUPON: amber kupon karti —
 * indirim tutari, alt limit, son kullanma, kupon kodu ve aksiyon (sepete ekle /
 * kopyala). Sadece "Kupon kodu gerektirir" ile birakmaz — kullaniciya yol verir.
 */
function DetailCampaign({
  campaign,
  t,
}: {
  campaign: StorefrontCampaignView;
  t: StorefrontDictionary;
}) {
  if (campaign.displayKind === "AUTOMATIC_CART_DISCOUNT") {
    return (
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        {/* F4A.6 — Guvenli nihai fiyat varsa belirgin "Sepette" fiyat blogu;
            yoksa yalniz "Sepette %X indirim" etiketi (sahte fiyat gosterilmez). */}
        {campaign.estimatedFinalLabel ? (
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              {t.badges.inCart}
            </span>
            <span className="text-lg font-bold text-emerald-800">{campaign.estimatedFinalLabel}</span>
            <span className="inline-flex items-center rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">
              {campaign.discountText}
            </span>
          </div>
        ) : (
          <p className="text-sm font-semibold text-emerald-800">{campaign.label}</p>
        )}
        <p className="mt-0.5 text-xs text-emerald-700">
          {t.detail.campaignNoCode}
          {campaign.minOrderLabel
            ? ` · ${format(t.detail.campaignMinOrder, { amount: campaign.minOrderLabel })}`
            : ""}
        </p>
      </div>
    );
  }
  return <DetailCouponCard campaign={campaign} t={t} />;
}

function DetailCouponCard({
  campaign,
  t,
}: {
  campaign: StorefrontCampaignView;
  t: StorefrontDictionary;
}) {
  const [isPending, startTransition] = useTransition();
  const [claimed, setClaimed] = useState(false);
  const [copied, setCopied] = useState(false);
  const detail = t.detail;

  function addToWallet() {
    if (!campaign.couponCode) return;
    startTransition(async () => {
      const result = await claimCouponAction(campaign.couponCode!);
      if (result.status === "ok") setClaimed(true);
    });
  }

  async function copyCode() {
    if (!campaign.couponCode) return;
    try {
      await navigator.clipboard.writeText(campaign.couponCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* pano erisimi yoksa sessizce yut */
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
          {detail.couponCardTitle}
        </p>
        <span className="text-sm font-bold text-amber-900">{campaign.discountText}</span>
      </div>
      {campaign.couponCode ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-md bg-white px-2 py-1 font-mono text-sm font-semibold tracking-wide text-amber-900 ring-1 ring-amber-300">
            {campaign.couponCode}
          </span>
          <button
            type="button"
            onClick={copyCode}
            className="text-xs font-medium text-amber-800 underline hover:text-amber-900"
          >
            {copied ? detail.couponCopied : detail.couponCopy}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-amber-700">{detail.couponManualHint}</p>
      )}
      <p className="mt-2 text-[11px] text-amber-700">
        {campaign.minOrderLabel
          ? format(detail.campaignMinOrder, { amount: campaign.minOrderLabel })
          : detail.campaignNoMinOrder}
        {campaign.endsAt ? ` · ${format(detail.couponExpiry, { date: formatDetailDate(campaign.endsAt) })}` : ""}
      </p>
      {campaign.couponCode ? (
        <div className="mt-2">
          {claimed ? (
            <p className="text-xs font-medium text-emerald-700">✓ {detail.couponAddedToWallet}</p>
          ) : (
            <Button variant="secondary" onClick={addToWallet} disabled={isPending}>
              {detail.couponAddToWallet}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatDetailDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

function TrustRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm font-medium text-slate-900">{title}</dt>
      <dd className="text-xs text-slate-500">{body}</dd>
    </div>
  );
}

function SalesModeLead({
  detail,
  t,
}: {
  detail: StorefrontProductDetail;
  t: StorefrontDictionary;
}) {
  const { commerce } = detail;
  if (commerce.salesMode === "ONLINE") return null;

  let lead = "";
  if (commerce.salesMode === "INQUIRY") lead = t.salesMode.inquiryLead;
  else if (commerce.salesMode === "APPOINTMENT") lead = t.salesMode.appointmentLead;
  else if (commerce.salesMode === "WHATSAPP") lead = t.salesMode.whatsappLead;
  else lead = t.salesMode.catalogLead;

  return (
    <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50/60 p-3">
      <p className="text-sm text-brand-800">{lead}</p>
      {commerce.showInquiry ? (
        <p className="mt-2 text-xs font-medium text-slate-600">
          {detail.inquiryFormTitle ?? t.salesMode.inquiryTitleFallback}
        </p>
      ) : null}
      {commerce.showAppointmentNote ? (
        <p className="mt-2 text-xs text-slate-600">
          {detail.appointmentNote ?? t.salesMode.appointmentNoteFallback}
        </p>
      ) : null}
      {commerce.showWhatsappTemplate && detail.whatsappMessageTemplate ? (
        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {t.salesMode.whatsappTemplateTitle}
          </p>
          <p className="mt-1 rounded-lg bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
            {detail.whatsappMessageTemplate}
          </p>
        </div>
      ) : null}
    </div>
  );
}
