"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { PublicCouponReason } from "@commerce-os/api-client";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { CartView as CartViewModel, CartLineView } from "../lib/server/cart";
import {
  applyWalletCouponAction,
  claimCouponAction,
  reconcileCartAction,
  removeCartItemAction,
  removeCouponAction,
  toggleCartItemSelectedAction,
  updateCartItemAction,
  type ClaimCouponResult,
} from "../lib/server/cart-actions";
import type { StorefrontWalletCouponView } from "../lib/catalog-types";
import { cn } from "@commerce-os/ui";
import { Badge, Button, ButtonLink, Input, ProductMedia, Subheading } from "./ui";

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
  t,
}: {
  view: CartViewModel;
  canonicalItems: Array<{ variantId: string; quantity: number }>;
  reconcileNeeded: boolean;
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
        {showReconciled ? (
          <div
            role="status"
            className="flex items-center justify-between gap-3 border border-line bg-surface-muted px-4 py-3 text-sm text-ink"
          >
            <span>{t.reconciledNotice}</span>
            <DismissButton onClick={() => setShowReconciled(false)} />
          </div>
        ) : null}

        {/* F4A.3 — Sepet ust kupon alani: kullanilabilir kupon kartlari + manuel
            "Kupon Kodu Ekle" (claim). Uygulama kart uzerinden "Kullan" ile yapilir. */}
        <CouponsArea summary={view.summary} t={t} />

        <ul className="space-y-4" aria-busy={isPending}>
          {view.lines.map((line) => (
            <li key={line.variantId}>
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
    // Dilim 6a-refine — Secimi kaldirilan satir SOLUK gosterilir (toplama/checkout'a
    // girmez); sepette kalir. Kaldir/checkbox etkilesimi tam opak kalir.
    <div className={cn("border border-line bg-surface p-5", !line.selected && "opacity-55")}>
      <div className="flex gap-4">
        {/* Dilim 6a-refine — Satir SECIM checkbox'i (mockup). Isaretli satir toplama/
            checkout'a dahildir; kaldirilan satir sepette kalir ama dahil edilmez.
            Native checkbox; accent-ink (menekse DEGIL → tek-accent kurali korunur). */}
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

        {/* Dilim 6a — Ürün kapak thumbnail'i (drop-in ProductMedia; imageUrl yoksa
            deterministik yer tutucu). PLP/PDP kutu deseni: sabit boyutlu wrapper +
            ince hairline cerceve, ProductMedia h-full w-full ile doldurur. */}
        <div className="h-24 w-24 shrink-0 overflow-hidden border border-line bg-surface-muted">
          <ProductMedia handle={line.productSlug} title={line.title} imageUrl={line.imageUrl} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Link
              href={`/products/${line.productSlug}`}
              className="text-sm font-semibold text-ink transition-colors hover:text-ink-muted"
            >
              {line.title}
            </Link>
            <p className="mt-0.5 text-xs text-ink-muted">{line.variantTitle}</p>
            <p className="mt-0.5 text-xs text-ink-subtle">{line.sku}</p>
            {/* Dilim 6a-refine — Statik kargo tahmini (urun-bazli hazirlik suresi
                backend'i yok; gercek veri gelince degistirilir). Yalniz satilabilir satirda. */}
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
          </div>

          <div className="flex items-center gap-4">
            {!unavailable ? (
              // Dilim 6a — Miktar seçici: tek hairline cerceve icinde −/+ ince dikey
              // ayraclarla ayrilir (mockup anatomisi; renk mevcut border-line).
              <div className="inline-flex items-center border border-line">
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
            ) : null}

            <div className="text-right">
              {!unavailable ? (
                <>
                  {/* Buyuk: kampanya varsa kampanya-sonrasi satir toplami, yoksa normal. */}
                  <p className="text-sm font-semibold text-ink">{bigPriceLabel}</p>
                  {/* Kucuk: ustu-cizili (kampanya→orijinal birim / yoksa compareAt liste) +
                      guncel birim. Notr ink-subtle (accent yok). */}
                  <p className="text-xs text-ink-subtle">
                    {strikeLabel ? (
                      <span className="mr-1.5 text-line-strong line-through">{strikeLabel}</span>
                    ) : null}
                    {currentUnitLabel}
                  </p>
                </>
              ) : null}
            </div>

            <button
              type="button"
              disabled={pending}
              onClick={() => onRemove(line)}
              className="text-xs font-medium text-ink-subtle transition-colors hover:text-ink disabled:opacity-40"
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
              {s.shippingStatus !== "OK" ? (
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

        {s.shippingStatus === "OK" && !s.shippingIsFree ? (
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

  // Dilim 6a-refine — "Ticket" kupon karti (mockup): iki bolme (tutar+kod | meta+aksiyon)
  // dashed ayracla ayrilir + yanlarda kesik daireler. Kazanilmis (PUBLIC olmayan) kupon
  // dolu-ink "Kazandın" rozeti + sol serit tasir. EXPIRED soluk. NOTR yuzey — aksan YOK
  // (tek-accent kurali korunur; accent yalniz "Ödemeye geç"te).
  const earned = coupon.source !== "PUBLIC";
  return (
    <div
      className={cn(
        "relative flex items-stretch overflow-visible border border-line-strong bg-surface-muted",
        earned && "border-l-2 border-l-ink",
        coupon.state === "EXPIRED" && "opacity-60",
      )}
    >
      {/* Ticket kesikleri: yan kenarlarda dis-zemin (bg-surface) rengiyle "isirik". */}
      <span
        aria-hidden
        className="absolute top-1/2 -left-[7px] h-3 w-3 -translate-y-1/2 rounded-full border border-line-strong bg-surface"
      />
      <span
        aria-hidden
        className="absolute top-1/2 -right-[7px] h-3 w-3 -translate-y-1/2 rounded-full border border-line-strong bg-surface"
      />

      {/* Sol bolme: tutar (vurgu) + kod. */}
      <div className="flex flex-col items-start justify-center gap-1.5 border-r border-dashed border-line-strong px-4 py-3">
        <span className="text-base font-semibold text-ink">{coupon.discountText}</span>
        <span className="bg-surface px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-ink ring-1 ring-line-strong">
          {coupon.code}
        </span>
      </div>

      {/* Sag bolme: rozet + alt limit/gecerlilik + Detaylar + aksiyon. */}
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          {earned ? (
            <span className="inline-flex items-center gap-1 bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-surface">
              {t.couponEarned}
              <span aria-hidden>✓</span>
            </span>
          ) : null}
          <p className={cn("text-[11px] text-ink-subtle", earned && "mt-1")}>
            {coupon.minOrderLabel
              ? format(t.couponMinOrder, { amount: coupon.minOrderLabel })
              : t.couponNoMinOrder}
          </p>
          {coupon.endsAt ? (
            <p className="mt-0.5 text-[11px] text-ink-subtle">
              {format(t.couponValidUntil, { date: formatCouponDate(coupon.endsAt) })}
            </p>
          ) : null}
          <Link
            href="/account?section=coupons"
            className="mt-1 inline-block text-[11px] font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
          >
            {t.couponDetails}
          </Link>
        </div>
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
    </div>
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
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="×" className="text-current opacity-60 hover:opacity-100">
      ×
    </button>
  );
}
