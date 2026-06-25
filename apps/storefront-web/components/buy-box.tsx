"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@commerce-os/ui";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { StorefrontProductDetail, StorefrontVariantView } from "../lib/catalog-types";
import { ctaLabel, primaryPriceText, showsNumericPrice } from "../lib/labels";
import { addToCartAction } from "../lib/server/cart-actions";

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

  const maxQty = commerce.maxQuantity ?? 99;
  const clamp = (value: number) => Math.min(Math.max(value, commerce.minQuantity), maxQty);

  // ADD_TO_CART: secili varyanti cookie sepete ekler (Server Action) ve SAYFADA
  // KALIR — yonlendirme YOK; nav sayaci revalidate ile guncellenir, inline bir
  // "sepete eklendi" geri bildirimi gosterilir. BUY_NOW (Simdi Al): sepete ekleyip
  // checkout'a yonlendirir. Adet/varyant istemci state'idir; fiyat/stok/uygunluk
  // gateway tarafinda yeniden dogrulanir.
  const canAddToCart = commerce.primaryCta === "ADD_TO_CART" && !commerce.primaryCtaDisabled && !!selected;

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
      {/* Fiyat */}
      <div className="flex items-baseline gap-2">
        {numeric ? (
          <>
            <span className="text-2xl font-semibold text-slate-900">
              {selected?.priceLabel ?? price.amountLabel}
            </span>
            {selected?.compareAtLabel ?? price.compareAtLabel ? (
              <span className="text-sm text-slate-400 line-through">
                {selected?.compareAtLabel ?? price.compareAtLabel}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-lg font-semibold text-slate-900">{primaryPriceText(price, t)}</span>
        )}
      </div>
      {numeric ? <p className="mt-1 text-xs text-slate-400">{t.buyBox.priceNote}</p> : null}

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

      {/* Adet (yalniz ONLINE satilabilir) */}
      {commerce.showQuantity ? (
        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-slate-700">{t.detail.quantityLabel}</p>
          <div className="inline-flex items-center rounded-lg border border-slate-200">
            <button
              type="button"
              aria-label="-"
              onClick={() => {
                setQuantity((q) => clamp(q - 1));
                setAdded(false);
              }}
              className="h-10 w-10 text-lg text-slate-500 hover:bg-slate-50"
            >
              −
            </button>
            <span className="w-10 text-center text-sm font-medium text-slate-900">{quantity}</span>
            <button
              type="button"
              aria-label="+"
              onClick={() => {
                setQuantity((q) => clamp(q + 1));
                setAdded(false);
              }}
              className="h-10 w-10 text-lg text-slate-500 hover:bg-slate-50"
            >
              +
            </button>
          </div>
        </div>
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
