"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Card } from "@commerce-os/ui";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { CartView as CartViewModel, CartLineView } from "../lib/server/cart";
import {
  applyCouponAction,
  reconcileCartAction,
  removeCartItemAction,
  removeCouponAction,
  updateCartItemAction,
} from "../lib/server/cart-actions";

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

          {s.discountLabel ? (
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
              {s.shippingIsFree ? <span className="text-emerald-700">{t.shippingFree}</span> : s.shippingLabel}
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

        {!s.shippingIsFree ? (
          <p className="mt-2 text-xs text-slate-400">
            {format(t.freeShippingHint, { amount: s.freeShippingThresholdLabel })}
          </p>
        ) : null}

        <CouponForm summary={s} t={t} disabled={pending} />

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

function CouponForm({
  summary,
  t,
  disabled,
}: {
  summary: CartViewModel["summary"];
  t: CartDict;
  disabled: boolean;
}) {
  const [code, setCode] = useState("");
  const [isPending, startTransition] = useTransition();
  const applied = summary.couponStatus === "APPLIED";
  const invalid = summary.couponStatus === "INVALID";

  function apply() {
    const value = code.trim();
    if (!value) return;
    startTransition(() => {
      void applyCouponAction(value);
    });
  }

  function remove() {
    startTransition(() => {
      void removeCouponAction();
    });
  }

  if (applied) {
    return (
      <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
        <span className="font-medium text-emerald-700">
          {format(t.couponApplied, { code: summary.couponCode ?? "" })}
        </span>
        <button
          type="button"
          onClick={remove}
          disabled={disabled || isPending}
          className="text-xs font-medium text-emerald-700 underline hover:text-emerald-900 disabled:opacity-40"
        >
          {t.couponRemove}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t.couponPlaceholder}
          aria-label={t.couponLabel}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm uppercase text-slate-900 placeholder:text-slate-400 placeholder:normal-case focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <Button variant="secondary" onClick={apply} disabled={disabled || isPending || !code.trim()}>
          {t.couponApply}
        </Button>
      </div>
      {invalid ? (
        <p className="mt-1.5 text-xs text-red-600">
          {format(t.couponInvalid, { code: summary.couponCode ?? "" })}
        </p>
      ) : null}
    </div>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="×" className="text-current opacity-60 hover:opacity-100">
      ×
    </button>
  );
}
