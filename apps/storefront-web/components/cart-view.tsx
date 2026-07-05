"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Card } from "@commerce-os/ui";
import type { PublicCouponReason } from "@commerce-os/api-client";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { CartView as CartViewModel, CartLineView } from "../lib/server/cart";
import {
  applyWalletCouponAction,
  claimCouponAction,
  reconcileCartAction,
  removeCartItemAction,
  removeCouponAction,
  updateCartItemAction,
  type ClaimCouponResult,
} from "../lib/server/cart-actions";
import type { StorefrontWalletCouponView } from "../lib/catalog-types";

type CartDict = StorefrontDictionary["cart"];

/**
 * Sepet etkilesim katmani (F3B.1, client). Adet/ kaldirma islemleri Server
 * Action'lar uzerinden cookie'yi gunceller (fiyat/stok client'ta hesaplanmaz).
 * Stale sepet gateway tarafindan reconcile edilir; gerektiginde cookie kanonik
 * hale getirilir.
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

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {showReconciled ? (
          <Alert tone="info" action={<DismissButton onClick={() => setShowReconciled(false)} />}>
            {t.reconciledNotice}
          </Alert>
        ) : null}

        {/* F4A.3 — Sepet ust kupon alani: kullanilabilir kupon kartlari + manuel
            "Kupon Kodu Ekle" (claim). Uygulama kart uzerinden "Kullan" ile yapilir. */}
        <CouponsArea summary={view.summary} t={t} />

        <ul className="space-y-3" aria-busy={isPending}>
          {view.lines.map((line) => (
            <li key={line.variantId}>
              <CartLineRow line={line} t={t} pending={isPending} onSetQuantity={setQuantity} onRemove={remove} />
            </li>
          ))}
        </ul>

        <Link href="/products" className="inline-block text-sm font-medium text-brand-700 hover:text-brand-800">
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
}: {
  line: CartLineView;
  t: CartDict;
  pending: boolean;
  onSetQuantity: (line: CartLineView, next: number) => void;
  onRemove: (line: CartLineView) => void;
}) {
  const unavailable = line.status === "UNAVAILABLE" || line.status === "OUT_OF_STOCK";
  const atMin = line.quantity <= line.minQuantity;
  const atMax = line.maxQuantity !== null && line.quantity >= line.maxQuantity;

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`/products/${line.productSlug}`}
            className="text-sm font-semibold text-slate-900 hover:text-brand-700"
          >
            {line.title}
          </Link>
          <p className="mt-0.5 text-xs text-slate-500">{line.variantTitle}</p>
          <p className="mt-0.5 text-xs text-slate-400">{line.sku}</p>
          {line.status === "UNAVAILABLE" ? (
            <Badge tone="danger" className="mt-2">
              {t.statusUnavailable}
            </Badge>
          ) : null}
          {line.status === "OUT_OF_STOCK" ? (
            <Badge tone="danger" className="mt-2">
              {t.statusOutOfStock}
            </Badge>
          ) : null}
          {line.status === "QUANTITY_ADJUSTED" ? (
            <Badge tone="warning" className="mt-2">
              {t.statusQuantityAdjusted}
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-4">
          {!unavailable ? (
            <div className="inline-flex items-center rounded-lg border border-slate-200">
              <button
                type="button"
                aria-label={t.decrease}
                disabled={pending || atMin}
                onClick={() => onSetQuantity(line, line.quantity - 1)}
                className="h-9 w-9 text-lg text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                −
              </button>
              <span className="w-9 text-center text-sm font-medium text-slate-900">{line.quantity}</span>
              <button
                type="button"
                aria-label={t.increase}
                disabled={pending || atMax}
                onClick={() => onSetQuantity(line, line.quantity + 1)}
                className="h-9 w-9 text-lg text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                +
              </button>
            </div>
          ) : null}

          <div className="text-right">
            {!unavailable ? (
              <>
                <p className="text-sm font-semibold text-slate-900">{line.lineTotalLabel}</p>
                <p className="text-xs text-slate-400">{line.unitPriceLabel}</p>
              </>
            ) : null}
          </div>

          <button
            type="button"
            disabled={pending}
            onClick={() => onRemove(line)}
            className="text-xs font-medium text-slate-400 hover:text-red-600 disabled:opacity-40"
          >
            {t.remove}
          </button>
        </div>
      </div>
    </Card>
  );
}

function CartSummary({ view, t, pending }: { view: CartViewModel; t: CartDict; pending: boolean }) {
  const s = view.summary;
  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">{t.summaryTitle}</h2>

        <dl className="mt-4 space-y-2.5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">
              {t.subtotal}{" "}
              <span className="text-xs text-slate-400">· {format(t.itemsLabel, { count: view.itemCount })}</span>
            </dt>
            <dd className="font-medium text-slate-900">{s.subtotalLabel}</dd>
          </div>

          {/* F4A — Uygulanan indirim satirlari (kupon + otomatik kampanyalar).
              Sunucu-otoriter: etiket/tutar motor sonucudur; istemci hesap yapmaz.
              F4A.1 — Kampanya ADI gosterilir ("Sepette %10 İndirim"); kupon
              satirinda kod parantez icinde eklenir. Gecersiz kupon girilse bile
              otomatik kampanya satirlari burada gorunmeye devam eder. */}
          {s.discountLines.length > 0 ? (
            s.discountLines.map((line, index) => (
              <div key={index} className="flex items-center justify-between text-emerald-700">
                <dt>
                  {line.label}
                  {line.code ? (
                    <span className="ml-1 text-xs font-medium">({line.code})</span>
                  ) : null}
                </dt>
                <dd className="font-medium">−{line.amountLabel}</dd>
              </div>
            ))
          ) : s.discountLabel ? (
            <div className="flex items-center justify-between text-emerald-700">
              <dt>
                {t.discount}
                {s.couponCode ? <span className="ml-1 text-xs font-medium">({s.couponCode})</span> : null}
              </dt>
              <dd className="font-medium">−{s.discountLabel}</dd>
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <dt className="text-slate-500">{t.shipping}</dt>
            <dd className="font-medium text-slate-900">
              {s.shippingStatus !== "OK" ? (
                <span className="text-right text-xs font-normal text-slate-500">
                  {s.shippingStatus === "ADDRESS_REQUIRED"
                    ? t.shippingPending
                    : s.shippingStatus === "NO_RATE_PLAN"
                      ? t.shippingNoRatePlan
                      : t.shippingUnavailable}
                </span>
              ) : s.shippingIsFree ? (
                <span className="text-emerald-700">{t.shippingFree}</span>
              ) : (
                s.shippingLabel
              )}
            </dd>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
            <dt className="font-semibold text-slate-900">{t.grandTotal}</dt>
            <dd className="text-base font-semibold text-slate-900">{s.grandTotalLabel}</dd>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <dt>{format(t.taxIncludedLabel, { rate: s.taxRatePercent })}</dt>
            <dd>{s.taxIncludedLabel}</dd>
          </div>
        </dl>

        {s.shippingStatus === "OK" && !s.shippingIsFree ? (
          <p className="mt-2 text-xs text-slate-400">
            {format(t.freeShippingHint, { amount: s.freeShippingThresholdLabel })}
          </p>
        ) : null}

        <AppliedCouponControl summary={s} t={t} disabled={pending} />

        {!view.checkoutReady ? (
          <Alert tone="warning" className="mt-4">
            {t.blockedNotice}
          </Alert>
        ) : null}

        <div className="mt-5">
          {view.checkoutReady ? (
            <Link href="/checkout" className="block">
              <Button className="w-full" disabled={pending}>
                {t.checkoutCta}
              </Button>
            </Link>
          ) : (
            <Button className="w-full" disabled>
              {t.checkoutCta}
            </Button>
          )}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-400">{t.summaryNote}</p>
      </Card>
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
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-slate-900">{t.couponsTitle}</h2>
      {coupons.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {coupons.map((coupon) => (
            <li key={coupon.code}>
              <AvailableCouponCard coupon={coupon} appliedCode={appliedCode} t={t} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-slate-400">{t.couponsEmpty}</p>
      )}
      <ClaimCouponForm summary={summary} t={t} />
    </Card>
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

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <span>{coupon.discountText}</span>
          <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-amber-800 ring-1 ring-amber-200">
            {coupon.code}
          </span>
          {coupon.source === "ASSIGNED" ? (
            <Badge tone="success">{t.couponSourceAssigned}</Badge>
          ) : null}
        </p>
        <p className="mt-0.5 text-[11px] text-amber-700">
          {coupon.minOrderLabel
            ? format(t.couponMinOrder, { amount: coupon.minOrderLabel })
            : t.couponNoMinOrder}
          {coupon.endsAt ? ` · ${format(t.couponExpiry, { date: formatCouponDate(coupon.endsAt) })}` : ""}
        </p>
      </div>
      {isApplied ? (
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone="success">{t.couponStateApplied}</Badge>
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="text-xs font-medium text-emerald-700 underline hover:text-emerald-900 disabled:opacity-40"
          >
            {t.couponRemove}
          </button>
        </div>
      ) : coupon.state === "MIN_ORDER_NOT_MET" ? (
        <Badge tone="warning" className="shrink-0">
          {t.couponStateMinOrder}
        </Badge>
      ) : coupon.state === "EXPIRED" ? (
        <Badge tone="neutral" className="shrink-0">
          {t.couponStateExpired}
        </Badge>
      ) : (
        <Button variant="secondary" className="shrink-0" onClick={use} disabled={isPending}>
          {t.couponUse}
        </Button>
      )}
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
        className="mt-3 text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        + {t.couponAdd}
      </button>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t.couponPlaceholder}
          aria-label={t.couponLabel}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm uppercase text-slate-900 placeholder:text-slate-400 placeholder:normal-case focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <Button variant="secondary" onClick={submit} disabled={isPending || !code.trim()}>
          {t.couponClaimSubmit}
        </Button>
      </div>
      {result?.status === "ok" ? (
        <p className="mt-1.5 text-xs text-emerald-700">{t.couponClaimSuccess}</p>
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
      <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
        <span className="font-medium text-emerald-700">
          {format(t.couponApplied, { code: summary.couponCode ?? "" })}
        </span>
        <button
          type="button"
          onClick={() => startTransition(() => void removeCouponAction())}
          disabled={disabled || isPending}
          className="text-xs font-medium text-emerald-700 underline hover:text-emerald-900 disabled:opacity-40"
        >
          {t.couponRemove}
        </button>
      </div>
    );
  }
  if (summary.couponStatus === "INVALID") {
    return (
      <div className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm">
        <span className="text-red-600">{couponErrorMessage(summary, t)}</span>
        <button
          type="button"
          onClick={() => startTransition(() => void removeCouponAction())}
          disabled={disabled || isPending}
          className="shrink-0 text-xs font-medium text-red-600 underline hover:text-red-800 disabled:opacity-40"
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
