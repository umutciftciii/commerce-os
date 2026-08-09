"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { PublicCouponReason } from "@commerce-os/api-client";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type {
  CartView as CartViewModel,
  CartLineChangeView,
  CartLineView,
} from "../lib/server/cart";
import {
  acknowledgeAllCartChangesAction,
  acknowledgeCartChangeAction,
  applyWalletCouponAction,
  claimCouponAction,
  clearCartNoticeAction,
  reconcileCartAction,
  removeCartItemAction,
  removeCouponAction,
  toggleCartItemSelectedAction,
  updateCartItemAction,
  type ClaimCouponResult,
} from "../lib/server/cart-actions";
import { emitCartChangeEvent } from "../lib/cart-change-analytics";
import type { CartNotice } from "../lib/server/cart-cookie";
import type { StorefrontWalletCouponView } from "../lib/catalog-types";
import { cn } from "@commerce-os/ui";
import { Badge, Button, ButtonLink, Input, ProductMediaFrame, Subheading } from "./ui";

type CartDict = StorefrontDictionary["cart"];

/**
 * Sepet etkilesim katmani (F3B.1, client). Adet/ kaldirma islemleri Server
 * Action'lar uzerinden cookie'yi gunceller (fiyat/stok client'ta hesaplanmaz).
 * Stale sepet gateway tarafindan reconcile edilir; gerektiginde cookie kanonik
 * hale getirilir.
 *
 * Görsel katman vitrin DS'ine göçtü (yerel components/ui barrel + ink/surface/line/
 * accent token'lari, PLP/PDP dili). Aksan (menekse) YALNIZCA tekil birincil CTA'da
 * ("Ödemeye geç"); indirim/kupon yuzeyleri NOTR kalir. Ticaret mantigi (Server
 * Action bagları, useTransition + disabled, kosullu render) DEGISMEDI.
 */
export function CartView({
  view,
  canonicalItems,
  reconcileNeeded,
  notice,
  t,
}: {
  view: CartViewModel;
  canonicalItems: Array<{ variantId: string; quantity: number }>;
  reconcileNeeded: boolean;
  // TODO-167 (ADR-266) — Persistent cart kullanici-dostu bildirimi (merge / cross-device /
  // ödeme-korundu). One-shot: gösterildikten sonra client temizler.
  notice?: CartNotice | null;
  t: CartDict;
}) {
  const [isPending, startTransition] = useTransition();
  const reconciledOnce = useRef(false);
  const [showReconciled, setShowReconciled] = useState(reconcileNeeded);

  useEffect(() => {
    if (reconcileNeeded && !reconciledOnce.current) {
      reconciledOnce.current = true;
      startTransition(() => {
        void reconcileCartAction(canonicalItems);
      });
    }
  }, [reconcileNeeded, canonicalItems]);

  function setQuantity(line: CartLineView, next: number) {
    const max = line.maxQuantity ?? 999;
    const clamped = Math.min(Math.max(next, 0), max);
    startTransition(() => {
      void updateCartItemAction(line.variantId, clamped);
    });
  }

  function remove(line: CartLineView) {
    startTransition(() => {
      void removeCartItemAction(line.variantId);
    });
  }

  // Dilim 6a-refine — Satir secimini (checkbox) tersine cevirir. Secimi kaldirilan
  // satir sepette kalir; fiyat/adet DEGISMEZ, yalniz toplam/checkout'a girmez.
  function toggleSelected(line: CartLineView) {
    startTransition(() => {
      void toggleCartItemSelectedAction(line.variantId);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {/* TODO-167 — Persistent cart bildirimi (merge / cross-device / ödeme-korundu). */}
        <CartNoticeBanner notice={notice ?? null} t={t} />
        {showReconciled ? (
          <div
            role="status"
            className="flex items-center justify-between gap-3 border border-line bg-surface-muted px-4 py-3 text-sm text-ink"
          >
            <span>{t.reconciledNotice}</span>
            <DismissButton onClick={() => setShowReconciled(false)} />
          </div>
        ) : null}

        {/* TODO-168 (ADR-267) — Sepet değişiklik farkındalığı paneli (fiyat/stok/varlık).
            view.changes sunucu-otoriter; ham CART_CHANGED kodu/fingerprint gösterilmez. */}
        <CartChangeBar view={view} t={t} pending={isPending} startTransition={startTransition} />

        {/* F4A.3 — Sepet ust kupon alani: kullanilabilir kupon kartlari + manuel
            "Kupon Kodu Ekle" (claim). Uygulama kart uzerinden "Kullan" ile yapilir. */}
        <CouponsArea summary={view.summary} t={t} />

        <ul className="space-y-4" aria-busy={isPending}>
          {view.lines.map((line) => (
            <li key={line.variantId} data-testid="cart-line">
              <CartLineRow
                line={line}
                t={t}
                pending={isPending}
                onSetQuantity={setQuantity}
                onRemove={remove}
                onToggleSelected={toggleSelected}
              />
            </li>
          ))}
        </ul>

        <Link
          href="/products"
          className="inline-block text-sm font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
        >
          ← {t.continueShopping}
        </Link>
      </div>

      <CartSummary view={view} t={t} pending={isPending} />
    </div>
  );
}

/**
 * TODO-167 (ADR-266) — Persistent cart kullanici-dostu bildirimi. Ham hata kodu (CART_STALE /
 * MERGE_LIMIT_EXCEEDED) ASLA gösterilmez; yalniz i18n metnine eslenir. One-shot (mount'ta sunucu
 * cookie'si temizlenir). Kritik cross-device mesaji role="alert"; digerleri role="status" (kontrollü
 * aria-live). Durum yalniz renkle degil ikon + baslik + metinle anlatilir. Kapatma erisilebilir.
 */
function CartNoticeBanner({ notice, t }: { notice: CartNotice | null; t: CartDict }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (notice) {
      // Gösterildikten sonra sunucudaki bildirim cookie'sini temizle (tekrar gösterme).
      void clearCartNoticeAction();
    }
  }, [notice]);

  if (!notice || !visible) return null;

  let title: string | null;
  let body: string;
  let critical = false;
  if (notice.kind === "merge") {
    title = t.mergeNoticeTitle;
    body = notice.limitExceeded
      ? t.mergeNoticeLimit
      : notice.partial
        ? t.mergeNoticePartial
        : format(t.mergeNoticeSuccess, { count: notice.merged ?? 0 });
  } else if (notice.kind === "crossDevice") {
    title = t.crossDeviceTitle;
    body = t.crossDeviceNotice;
    critical = true;
  } else {
    title = null;
    body = t.paymentPreservedNotice;
  }

  return (
    <div
      role={critical ? "alert" : "status"}
      aria-live={critical ? "assertive" : "polite"}
      className={cn(
        "flex items-start justify-between gap-3 border px-4 py-3 text-sm text-ink",
        critical ? "border-ink-subtle bg-surface" : "border-line bg-surface-muted",
      )}
    >
      <div className="flex items-start gap-2.5">
        <NoticeIcon critical={critical} />
        <div>
          {title ? <p className="font-semibold text-ink">{title}</p> : null}
          <p className={cn(title ? "mt-0.5 text-ink-muted" : "text-ink")}>{body}</p>
        </div>
      </div>
      <DismissButton onClick={() => setVisible(false)} label={t.noticeDismiss} />
    </div>
  );
}

function NoticeIcon({ critical }: { critical: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="10" cy="10" r="8" />
      {critical ? (
        <path d="M10 6v5M10 14h.01" strokeLinecap="round" />
      ) : (
        <path d="M10 9v5M10 6h.01" strokeLinecap="round" />
      )}
    </svg>
  );
}

/**
 * TODO-168 (ADR-267) — Değişiklik mesajını i18n'e eşler. Ham changeType/fingerprint gösterilmez;
 * para değişimlerinde {old}/{new} sunucu-biçimli etiketlerle doldurulur.
 */
function changeMessage(change: Pick<CartLineChangeView, "changeType" | "oldValueLabel" | "newValueLabel">, t: CartDict): string {
  const old = change.oldValueLabel ?? "";
  const nv = change.newValueLabel ?? "";
  switch (change.changeType) {
    case "PRICE_DECREASED":
      return format(t.changePriceDecreased, { old, new: nv });
    case "PRICE_INCREASED":
      return format(t.changePriceIncreased, { old, new: nv });
    case "DISCOUNT_STARTED":
      return t.changeDiscountStarted;
    case "DISCOUNT_ENDED":
      return t.changeDiscountEnded;
    case "VARIANT_OUT_OF_STOCK":
      return t.changeOutOfStock;
    case "VARIANT_BACK_IN_STOCK":
      return t.changeBackInStock;
    case "PRODUCT_UNAVAILABLE":
      return t.changeUnavailable;
    case "PRODUCT_AVAILABLE_AGAIN":
      return t.changeAvailableAgain;
    case "QUANTITY_ADJUSTED":
      return t.changeQuantityAdjusted;
    default:
      return "";
  }
}

/** Severity ikonu (yalnız renk DEĞİL: farklı şekil + aria-hidden; metin mesajı esas anlatım). */
function ChangeIcon({ severity }: { severity: CartLineChangeView["severity"] }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={cn(
        "mt-0.5 h-4 w-4 shrink-0",
        severity === "BLOCKING" ? "text-red-600" : severity === "WARN" ? "text-amber-600" : "text-ink-muted",
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      {severity === "BLOCKING" ? (
        <>
          <path d="M10 2.5 1.8 16.5h16.4L10 2.5Z" strokeLinejoin="round" />
          <path d="M10 8v3.5M10 14h.01" strokeLinecap="round" />
        </>
      ) : severity === "WARN" ? (
        <>
          <circle cx="10" cy="10" r="8" />
          <path d="M10 6v5M10 14h.01" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="10" cy="10" r="8" />
          <path d="M7 10.5l2 2 4-4.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

/**
 * TODO-168 (ADR-267) — Sepet değişiklik paneli. Onaylanmamış (INFO+WARN+BLOCKING) değişiklikleri
 * severity-sıralı listeler: ürün thumbnail + ad + varyant + editoryel mesaj + eski→yeni fiyat + durum
 * ikonu; tek-mesaj kapat + "Tümünü gördüm". BLOCKING'de role=alert/aria-live=assertive (yalnız renkle
 * anlatmaz). Ack CartChangeAck (auth) veya meta cookie (anon) üzerinden; ham teknik detay sızmaz.
 */
function CartChangeBar({
  view,
  t,
  pending,
  startTransition,
}: {
  view: CartViewModel;
  t: CartDict;
  pending: boolean;
  startTransition: (cb: () => void) => void;
}) {
  const visible = view.changes.filter((c) => !c.acknowledged);
  const cartId = view.changeCartId;

  // Panel görüntülendiğinde her görünür değişiklik için best-effort "detected" (gateway dedupe eder).
  useEffect(() => {
    if (!cartId || visible.length === 0) return;
    for (const c of visible) {
      emitCartChangeEvent({
        cartId,
        changeType: c.changeType,
        eventType: "detected",
        fingerprint: c.fingerprint,
        severity: c.severity,
        variantId: c.variantId,
        oldMinor: c.oldValueMinor,
        newMinor: c.newValueMinor,
        currency: c.currency,
        placement: "CART_BAR",
      });
    }
    // fingerprint listesi değiştiğinde yeniden (yeni değişiklik).
  }, [cartId, visible.map((c) => c.fingerprint).join(",")]);

  if (visible.length === 0) return null;
  const hasBlocking = visible.some((c) => c.blocking);

  function dismissOne(fingerprint: string, change: (typeof visible)[number]) {
    if (cartId) {
      emitCartChangeEvent({
        cartId,
        changeType: change.changeType,
        eventType: "acknowledged",
        fingerprint,
        severity: change.severity,
        variantId: change.variantId,
        placement: "CART_BAR",
      });
    }
    startTransition(() => {
      void acknowledgeCartChangeAction(fingerprint);
    });
  }

  function dismissAll() {
    if (cartId) {
      for (const c of visible) {
        if (c.severity === "BLOCKING") continue;
        emitCartChangeEvent({
          cartId,
          changeType: c.changeType,
          eventType: "acknowledged",
          fingerprint: c.fingerprint,
          severity: c.severity,
          variantId: c.variantId,
          placement: "CART_BAR",
        });
      }
    }
    startTransition(() => {
      void acknowledgeAllCartChangesAction();
    });
  }

  const hasDismissibleAll = visible.some((c) => c.severity !== "BLOCKING");

  return (
    <section
      role={hasBlocking ? "alert" : "status"}
      aria-live={hasBlocking ? "assertive" : "polite"}
      className="border border-ink-subtle bg-surface"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">{t.changesTitle}</h2>
        {hasDismissibleAll ? (
          <button
            type="button"
            disabled={pending}
            onClick={dismissAll}
            className="text-xs font-medium text-ink-subtle underline decoration-line underline-offset-4 transition-colors hover:text-ink disabled:opacity-40"
          >
            {t.changesAckAll}
          </button>
        ) : null}
      </div>
      <ul className="divide-y divide-line">
        {visible.map((change) => (
          <li key={change.fingerprint} className="flex items-start gap-3 px-4 py-3">
            <ProductMediaFrame
              variant="line-thumbnail"
              handle={change.productSlug}
              title={change.title}
              imageUrl={change.imageUrl}
              className="h-12 w-12 shrink-0 border border-line"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{change.title}</p>
              {change.variantTitle ? (
                <p className="truncate text-xs text-ink-subtle">{change.variantTitle}</p>
              ) : null}
              <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-muted">
                <ChangeIcon severity={change.severity} />
                <span>{changeMessage(change, t)}</span>
              </p>
            </div>
            {change.severity !== "BLOCKING" ? (
              <DismissButton
                onClick={() => dismissOne(change.fingerprint, change)}
                label={t.changeDismiss}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CartLineRow({
  line,
  t,
  pending,
  onSetQuantity,
  onRemove,
  onToggleSelected,
}: {
  line: CartLineView;
  t: CartDict;
  pending: boolean;
  onSetQuantity: (line: CartLineView, next: number) => void;
  onRemove: (line: CartLineView) => void;
  onToggleSelected: (line: CartLineView) => void;
}) {
  const unavailable = line.status === "UNAVAILABLE" || line.status === "OUT_OF_STOCK";
  const atMin = line.quantity <= line.minQuantity;
  const atMax = line.maxQuantity !== null && line.quantity >= line.maxQuantity;

  // Dilim 6a-refine — Fiyat gosterimi: KAMPANYA indirimi ONCELIKLI (kampanya-sonrasi
  // fiyat + ustu-cizili orijinal); kampanya yoksa compareAt (liste) YEDEK; o da yoksa
  // sade fiyat. Buyuk (koyu) = efektif satir toplami; kucuk = ustu-cizili + guncel birim.
  const hasCampaignPrice = line.discountedLineTotalLabel !== null;
  const bigPriceLabel = line.discountedLineTotalLabel ?? line.lineTotalLabel;
  const currentUnitLabel = line.discountedUnitPriceLabel ?? line.unitPriceLabel;
  const strikeLabel = hasCampaignPrice ? line.unitPriceLabel : line.compareAtLabel;

  return (
    // Dilim 6a-refine — Secimi kaldirilan satir SOLUK gosterilir (toplama/checkout'a girmez).
    // TODO-168 mobil fix — 375/320'de yatay tasma yok: mobilde ust satir (thumbnail+bilgi) +
    // alt satir (adet+fiyat+kaldir, tam genislik); sm+ mevcut iki-sutun (bilgi solda, aksiyon sagda).
    <div className={cn("border border-line bg-surface p-4 sm:p-5", !line.selected && "opacity-55")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* ── Blok A: checkbox + thumbnail + urun bilgisi (her zaman satir; thumbnail sabit) ── */}
        <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
          {/* Dilim 6a-refine — Satir SECIM checkbox'i. Native accent-ink (tek-accent kurali). */}
          <div className="flex items-start pt-1">
            <input
              type="checkbox"
              checked={line.selected}
              disabled={pending}
              onChange={() => onToggleSelected(line)}
              aria-label={line.selected ? t.deselectItem : t.selectItem}
              className="h-4 w-4 shrink-0 cursor-pointer accent-ink disabled:cursor-not-allowed"
            />
          </div>

          {/* TD-173 — Ortak medya cercevesi (kare, oran korunur; mobilde biraz kucuk, sm+ 96px). */}
          <ProductMediaFrame
            variant="line-thumbnail"
            handle={line.productSlug}
            title={line.title}
            imageUrl={line.imageUrl}
            className="h-20 w-20 shrink-0 border border-line sm:h-24 sm:w-24"
          />

          <div className="min-w-0 flex-1">
            <Link
              href={`/products/${line.productSlug}`}
              className="text-sm font-semibold text-ink transition-colors hover:text-ink-muted"
            >
              {line.title}
            </Link>
            <p data-testid="cart-line-variant" className="mt-0.5 text-xs text-ink-muted">{line.variantTitle}</p>
            <p className="mt-0.5 text-xs text-ink-subtle">{line.sku}</p>
            {/* Dilim 6a-refine — Statik kargo tahmini (yalniz satilabilir satirda). */}
            {!unavailable ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-subtle">
                <TruckIcon />
                {t.shippingEstimate}
              </p>
            ) : null}
            {line.status === "UNAVAILABLE" ? (
              <Badge tone="ink" className="mt-2">
                {t.statusUnavailable}
              </Badge>
            ) : null}
            {line.status === "OUT_OF_STOCK" ? (
              <Badge tone="ink" className="mt-2">
                {t.statusOutOfStock}
              </Badge>
            ) : null}
            {line.status === "QUANTITY_ADJUSTED" ? (
              <Badge tone="outline" className="mt-2">
                {t.statusQuantityAdjusted}
              </Badge>
            ) : null}
            {/* TODO-168 (ADR-267) — Satır-içi değişiklik işareti (yalnız onaylanmamış; panelle simetrik).
                Yalnız renkle DEĞİL: ikon + metin (wrap eder, ezilmez). Fiyat değişiminde eski→yeni etikette. */}
            {line.change && !line.change.acknowledged ? (
              <p
                role="status"
                className={cn(
                  "mt-2 flex items-start gap-1.5 text-xs",
                  line.change.severity === "BLOCKING"
                    ? "text-red-600"
                    : line.change.severity === "WARN"
                      ? "text-amber-700"
                      : "text-ink-muted",
                )}
              >
                <ChangeIcon severity={line.change.severity} />
                <span className="min-w-0">{changeMessage(line.change, t)}</span>
              </p>
            ) : null}
          </div>
        </div>

        {/* ── Blok B: aksiyon kumesi. Mobilde tam-genislik alt satir (adet solda, fiyat+kaldir sagda);
            sm+ sag-hizali tek satir. Thumbnail dar sutununa SIKISMAZ → 320/375'te tasma yok. ── */}
        <div className="flex items-center justify-between gap-3 sm:flex-none sm:justify-end sm:gap-4">
          {!unavailable ? (
            // Dilim 6a — Miktar seçici: tek hairline cerceve; touch target 36px (h-9 w-9).
            <div className="inline-flex shrink-0 items-center border border-line">
              <button
                type="button"
                aria-label={t.decrease}
                disabled={pending || atMin}
                onClick={() => onSetQuantity(line, line.quantity - 1)}
                className="h-9 w-9 border-r border-line text-lg text-ink-muted transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-line-strong disabled:hover:bg-transparent"
              >
                −
              </button>
              <span className="w-9 text-center text-sm font-medium text-ink">{line.quantity}</span>
              <button
                type="button"
                aria-label={t.increase}
                disabled={pending || atMax}
                onClick={() => onSetQuantity(line, line.quantity + 1)}
                className="h-9 w-9 border-l border-line text-lg text-ink-muted transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-line-strong disabled:hover:bg-transparent"
              >
                +
              </button>
            </div>
          ) : (
            <span aria-hidden="true" />
          )}

          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            {!unavailable ? (
              <div className="text-right">
                {/* Buyuk: kampanya varsa kampanya-sonrasi satir toplami, yoksa normal. */}
                <p className="text-sm font-semibold text-ink">{bigPriceLabel}</p>
                {/* Kucuk: ustu-cizili + guncel birim (notr ink-subtle). */}
                <p className="text-xs text-ink-subtle">
                  {strikeLabel ? (
                    <span className="mr-1.5 text-line-strong line-through">{strikeLabel}</span>
                  ) : null}
                  {currentUnitLabel}
                </p>
              </div>
            ) : null}

            <button
              type="button"
              data-testid="cart-line-remove"
              disabled={pending}
              onClick={() => onRemove(line)}
              aria-label={format(t.removeItemLabel, { title: line.title })}
              className="shrink-0 py-2 text-xs font-medium text-ink-subtle transition-colors hover:text-ink disabled:opacity-40"
            >
              {t.remove}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Dilim 6a-refine — Kucuk kargo/teslimat ikonu (statik tahmin satiri icin). */
function TruckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6.5h11v9H3zM14 9.5h4l3 3v3h-7z" />
      <circle cx="7" cy="17.5" r="1.6" />
      <circle cx="17.5" cy="17.5" r="1.6" />
    </svg>
  );
}

function CartSummary({ view, t, pending }: { view: CartViewModel; t: CartDict; pending: boolean }) {
  const s = view.summary;
  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      {/* Dilim 6a — Sipariş özeti paneli muted zemine alindi (mockup gri panel; mevcut
          surface-muted tonu). Başlık ile satirlar ince ayracla ayrilir. */}
      <div className="border border-line bg-surface-muted p-5">
        <Subheading as="h2" className="text-base">
          {t.summaryTitle}
        </Subheading>

        <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-ink-muted">
              {t.subtotal}{" "}
              <span className="text-xs text-ink-subtle">· {format(t.itemsLabel, { count: view.itemCount })}</span>
            </dt>
            <dd className="font-medium text-ink">{s.subtotalLabel}</dd>
          </div>

          {/* F4A — Uygulanan indirim satirlari (kupon + otomatik kampanyalar).
              Sunucu-otoriter: etiket/tutar motor sonucudur; istemci hesap yapmaz.
              F4A.1 — Kampanya ADI gosterilir ("Sepette %10 İndirim"); kupon
              satirinda kod parantez icinde eklenir. Gecersiz kupon girilse bile
              otomatik kampanya satirlari burada gorunmeye devam eder. DS: indirim
              satiri NOTR (aksan yalniz CTA'da); "−" isareti + ink ile ayrisir. */}
          {s.discountLines.length > 0 ? (
            s.discountLines.map((line, index) => (
              <div key={index} className="flex items-center justify-between text-ink">
                <dt className="text-ink-muted">
                  {line.label}
                  {line.code ? (
                    <span className="ml-1 text-xs font-medium">({line.code})</span>
                  ) : null}
                </dt>
                <dd className="font-medium">−{line.amountLabel}</dd>
              </div>
            ))
          ) : s.discountLabel ? (
            <div className="flex items-center justify-between text-ink">
              <dt className="text-ink-muted">
                {t.discount}
                {s.couponCode ? <span className="ml-1 text-xs font-medium">({s.couponCode})</span> : null}
              </dt>
              <dd className="font-medium">−{s.discountLabel}</dd>
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <dt className="text-ink-muted">{t.shipping}</dt>
            <dd className="font-medium text-ink">
              {/* BUG-CART-002 — Secili+orderable urun YOKKEN (itemCount 0) kargo HESAPLANMAZ: "—"
                  gosterilir ve toplam ₺0 kalir (eski "0 urun + ₺49,90" hatasi giderildi). */}
              {view.itemCount === 0 ? (
                <span className="text-ink-muted">—</span>
              ) : s.shippingStatus !== "OK" ? (
                <span className="text-right text-xs font-normal text-ink-muted">
                  {s.shippingStatus === "ADDRESS_REQUIRED"
                    ? t.shippingPending
                    : s.shippingStatus === "NO_RATE_PLAN"
                      ? t.shippingNoRatePlan
                      : t.shippingUnavailable}
                </span>
              ) : s.shippingIsFree ? (
                <span className="text-ink">{t.shippingFree}</span>
              ) : (
                s.shippingLabel
              )}
            </dd>
          </div>

          <div className="flex items-center justify-between border-t border-line pt-2.5">
            <dt className="font-semibold text-ink">{t.grandTotal}</dt>
            <dd className="text-lg font-semibold text-ink">{s.grandTotalLabel}</dd>
          </div>
          <div className="flex items-center justify-between text-xs text-ink-subtle">
            <dt>{format(t.taxIncludedLabel, { rate: s.taxRatePercent })}</dt>
            <dd>{s.taxIncludedLabel}</dd>
          </div>
        </dl>

        {view.itemCount > 0 && s.shippingStatus === "OK" && !s.shippingIsFree ? (
          <p className="mt-2 text-xs text-ink-subtle">
            {format(t.freeShippingHint, { amount: s.freeShippingThresholdLabel })}
          </p>
        ) : null}

        <AppliedCouponControl summary={s} t={t} disabled={pending} />

        {!view.checkoutReady ? (
          <div className="mt-4 border border-line-strong bg-surface-muted px-4 py-3 text-sm text-ink">
            {t.blockedNotice}
          </div>
        ) : null}

        {/* Sepetin TEKIL birincil eylemi: "Ödemeye geç" aksan (variant="cta") tasir.
            checkoutReady degilse ya da bir islem beklerken devre disi buton gosterilir
            (mevcut disabled={pending} bagı korunur). */}
        <div className="mt-5">
          {view.checkoutReady && !pending ? (
            <ButtonLink href="/checkout" variant="cta" className="w-full">
              {t.checkoutCta}
            </ButtonLink>
          ) : (
            <Button variant="cta" className="w-full" disabled>
              {t.checkoutCta}
            </Button>
          )}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-ink-subtle">{t.summaryNote}</p>
      </div>
    </aside>
  );
}

/**
 * F4A.3 — Sepet "Kuponlar" alani (ADR-060): kullanilabilir kupon kartlari +
 * manuel "Kupon Kodu Ekle" (claim). Kart uzerinden "Kullan" ile sepete uygulanir.
 */
function CouponsArea({ summary, t }: { summary: CartViewModel["summary"]; t: CartDict }) {
  const coupons = summary.availableCoupons;
  const appliedCode = summary.couponStatus === "APPLIED" ? summary.couponCode : null;
  return (
    <div className="border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <Subheading as="h2">{t.couponsTitle}</Subheading>
        <Link
          href="/account?section=coupons"
          className="text-xs font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
        >
          {t.couponsAllLink} →
        </Link>
      </div>
      {coupons.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {coupons.map((coupon) => (
            <li key={coupon.code}>
              <AvailableCouponCard coupon={coupon} appliedCode={appliedCode} t={t} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-ink-subtle">{t.couponsEmpty}</p>
      )}
      <ClaimCouponForm summary={summary} t={t} />
    </div>
  );
}

/** Tek kullanilabilir kupon karti; durumuna gore aksiyon/rozet gosterir. */
function AvailableCouponCard({
  coupon,
  appliedCode,
  t,
}: {
  coupon: StorefrontWalletCouponView;
  appliedCode: string | null;
  t: CartDict;
}) {
  const [isPending, startTransition] = useTransition();
  const isApplied = coupon.state === "APPLIED" || coupon.code === appliedCode;

  function use() {
    startTransition(() => {
      void applyWalletCouponAction(coupon.code);
    });
  }
  function remove() {
    startTransition(() => {
      void removeCouponAction();
    });
  }

  // "Storefront - Cart" tasarımı: dashed "ticket" kart YERINE sakin SATIR (ikon + başlık/
  // meta + aksiyon). NÖTR yüzey — aksan YOK (tek-accent kuralı korunur: accent yalnız
  // "Ödemeye geç"te). Kazanılmış (PUBLIC olmayan) kupon dolu-ink "Kazandın" rozeti taşır.
  const earned = coupon.source !== "PUBLIC";
  return (
    <div
      className={cn(
        "flex items-center gap-3 border border-line bg-surface-muted px-3.5 py-3",
        coupon.state === "EXPIRED" && "opacity-60",
      )}
    >
      {/* İkon kutusu (nötr). */}
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface text-ink-muted ring-1 ring-line"
      >
        <CouponIcon />
      </span>

      {/* Başlık (indirim + Kazandın) + meta (alt limit · kod · geçerlilik). */}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink">
          {coupon.discountText}
          {earned ? (
            <span className="inline-flex items-center gap-1 bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-surface">
              {t.couponEarned}
              <span aria-hidden>✓</span>
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-subtle">
          <span>
            {coupon.minOrderLabel
              ? format(t.couponMinOrder, { amount: coupon.minOrderLabel })
              : t.couponNoMinOrder}
          </span>
          <span aria-hidden>·</span>
          <span className="font-mono text-ink-muted">{coupon.code}</span>
          {coupon.endsAt ? (
            <>
              <span aria-hidden>·</span>
              <span>{format(t.couponValidUntil, { date: formatCouponDate(coupon.endsAt) })}</span>
            </>
          ) : null}
        </p>
      </div>

      {/* Aksiyon: uygulandı (rozet + kaldır) / alt-limit / süresi geçti / Kullan. */}
      <div className="shrink-0">
        {isApplied ? (
          <div className="flex items-center gap-2">
            <Badge tone="outline">{t.couponStateApplied}</Badge>
            <button
              type="button"
              onClick={remove}
              disabled={isPending}
              className="text-xs font-medium text-ink underline underline-offset-4 transition-colors hover:text-ink-muted disabled:opacity-40"
            >
              {t.couponRemove}
            </button>
          </div>
        ) : coupon.state === "MIN_ORDER_NOT_MET" ? (
          <Badge tone="muted">{t.couponStateMinOrder}</Badge>
        ) : coupon.state === "EXPIRED" ? (
          <Badge tone="muted">{t.couponStateExpired}</Badge>
        ) : (
          <Button variant="secondary" size="sm" onClick={use} disabled={isPending}>
            {t.couponUse}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Kupon/etiket ikonu (nötr; sepet kupon satırı). */
function CouponIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6M2 7h20M12 3v4M8 3v4M16 3v4" />
    </svg>
  );
}

/**
 * F4A.3 — Manuel "Kupon Kodu Ekle" (claim). Kod kriterleri saglaniyorsa cuzdana
 * (Kuponlar) eklenir; degilse guvenli negatif metin gosterilir. Uygulama AYRIDIR.
 */
function ClaimCouponForm({ summary, t }: { summary: CartViewModel["summary"]; t: CartDict }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ClaimCouponResult | null>(null);
  const [isPending, startTransition] = useTransition();
  void summary;

  function submit() {
    const value = code.trim();
    if (!value) return;
    startTransition(async () => {
      const outcome = await claimCouponAction(value);
      setResult(outcome);
      if (outcome.status === "ok") setCode("");
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-sm font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
      >
        + {t.couponAdd}
      </button>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <Input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t.couponPlaceholder}
          aria-label={t.couponLabel}
          className="uppercase placeholder:normal-case"
        />
        <Button variant="secondary" onClick={submit} disabled={isPending || !code.trim()}>
          {t.couponClaimSubmit}
        </Button>
      </div>
      {result?.status === "ok" ? (
        <p className="mt-1.5 text-xs text-ink">{t.couponClaimSuccess}</p>
      ) : result?.status === "error" ? (
        <p className="mt-1.5 text-xs text-red-600">{claimErrorMessage(result.reason, t)}</p>
      ) : null}
    </div>
  );
}

/**
 * Uygulanan/gecersiz kuponu ozet altinda gosterir. APPLIED: "Kupon indirimi" +
 * kaldir (kart yine Kuponlar'da kalir). INVALID: guvenli neden + kaldir (otomatik
 * kampanya indirimi ozette AYRICA gorunmeye devam eder — celiski olusmaz).
 *
 * DS: APPLIED notr yüzey (border-line/surface-muted). INVALID hata sinyalidir —
 * yuzey notr kalir, metin `text-red-600` ile ayrisir (vitrin field.tsx hata dili).
 */
function AppliedCouponControl({
  summary,
  t,
  disabled,
}: {
  summary: CartViewModel["summary"];
  t: CartDict;
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  if (summary.couponStatus === "APPLIED") {
    return (
      <div className="mt-4 flex items-center justify-between border border-line bg-surface-muted px-3 py-2 text-sm">
        <span className="font-medium text-ink">
          {format(t.couponApplied, { code: summary.couponCode ?? "" })}
        </span>
        <button
          type="button"
          onClick={() => startTransition(() => void removeCouponAction())}
          disabled={disabled || isPending}
          className="text-xs font-medium text-ink underline underline-offset-4 transition-colors hover:text-ink-muted disabled:opacity-40"
        >
          {t.couponRemove}
        </button>
      </div>
    );
  }
  if (summary.couponStatus === "INVALID") {
    return (
      <div className="mt-4 flex items-center justify-between gap-2 border border-line bg-surface-muted px-3 py-2 text-sm">
        <span className="text-red-600">{couponErrorMessage(summary, t)}</span>
        <button
          type="button"
          onClick={() => startTransition(() => void removeCouponAction())}
          disabled={disabled || isPending}
          className="shrink-0 text-xs font-medium text-red-600 underline underline-offset-4 transition-colors hover:text-red-800 disabled:opacity-40"
        >
          {t.couponRemove}
        </button>
      </div>
    );
  }
  return null;
}

/**
 * F4A — INVALID kuponun nedenine gore kullanici kopyasi. NOT_FOUND/INACTIVE ayni
 * genel kopyaya duser (kupon varligi/durum detayi sizdirilmaz).
 */
function couponErrorMessage(summary: CartViewModel["summary"], t: CartDict): string {
  switch (summary.couponReason) {
    case "MIN_ORDER_NOT_MET":
      return t.couponReasonMinOrder;
    case "EXPIRED":
      return t.couponReasonExpired;
    case "NOT_STARTED":
      return t.couponReasonNotStarted;
    case "USAGE_LIMIT_REACHED":
      return t.couponReasonUsageLimit;
    case "NOT_APPLICABLE":
      return t.couponReasonNotApplicable;
    default:
      return format(t.couponInvalid, { code: summary.couponCode ?? "" });
  }
}

/** F4A.3 — Claim negatif nedeni -> kullanici kopyasi (guvenli; detay sizdirmaz). */
function claimErrorMessage(reason: PublicCouponReason | "error", t: CartDict): string {
  switch (reason) {
    case "EXPIRED":
      return t.couponReasonExpired;
    case "NOT_STARTED":
      return t.couponReasonNotStarted;
    case "USAGE_LIMIT_REACHED":
      return t.couponReasonUsageLimit;
    case "MIN_ORDER_NOT_MET":
      return t.couponReasonMinOrder;
    case "NOT_APPLICABLE":
      return t.couponReasonNotApplicable;
    default:
      return t.couponClaimInvalid;
  }
}

/** ISO tarihi kisa TR bicimine cevirir (kupon karti son kullanma). */
function formatCouponDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      // Saat dilimi SABIT: sunucu (UTC) ile istemci (yerel) ayni takvim gununu
      // uretsin; aksi halde gun sinirindaki tarihlerde hydration uyusmazligi olur.
      timeZone: "Europe/Istanbul",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function DismissButton({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? "×"}
      className="shrink-0 text-current opacity-60 transition-opacity hover:opacity-100"
    >
      ×
    </button>
  );
}
