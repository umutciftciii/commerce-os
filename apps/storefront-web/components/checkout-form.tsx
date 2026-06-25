"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Button, Card, Input, Select } from "@commerce-os/ui";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { CartView } from "../lib/server/cart";
import {
  type CheckoutFormState,
  submitCheckoutAction,
} from "../lib/server/cart-actions";

type CheckoutDict = StorefrontDictionary["checkout"];

const initialState: CheckoutFormState = { status: "idle" };

/**
 * Checkout formu (F3B.1, client). useActionState ile Server Action'a baglanir.
 * Sepet kalemleri formdan DEGIL cookie'den (sunucu) okunur; form yalnizca
 * iletisim/adres tasir. Basarili submit'te onay paneli, hatada alan/banner
 * hatalari gosterilir. Order olusumu/validasyon nihai olarak gateway'dedir.
 */
export function CheckoutForm({ view, t }: { view: CartView; t: CheckoutDict }) {
  const [state, formAction, isPending] = useActionState(submitCheckoutAction, initialState);

  if (state.status === "success" && state.confirmation) {
    return <CheckoutSuccess confirmation={state.confirmation} t={t} />;
  }

  const fieldErrors = state.fieldErrors ?? {};
  const bannerError = state.status === "error" ? bannerMessage(state.errorReason, t) : null;

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {bannerError ? <Alert tone="error">{bannerError}</Alert> : null}

        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">{t.contactTitle}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field name="fullName" label={t.fullName} error={fieldErrors.fullName} autoComplete="name" required />
            <Field
              name="email"
              label={t.email}
              type="email"
              error={fieldErrors.email}
              autoComplete="email"
              required
            />
            <Field name="phone" label={t.phone} type="tel" error={fieldErrors.phone} autoComplete="tel" required />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">{t.addressTitle}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">{t.country}</span>
              <Select name="country" defaultValue="TR" options={[{ value: "TR", label: t.countryTR }]} />
            </label>
            <Field name="city" label={t.city} error={fieldErrors.city} autoComplete="address-level1" required />
            <Field
              name="district"
              label={`${t.district} (${t.optional})`}
              autoComplete="address-level2"
            />
            <Field
              name="postalCode"
              label={`${t.postalCode} (${t.optional})`}
              autoComplete="postal-code"
            />
          </div>
          <div className="mt-4 space-y-4">
            <Field
              name="addressLine1"
              label={t.addressLine1}
              error={fieldErrors.addressLine1}
              autoComplete="address-line1"
              required
            />
            <Field
              name="addressLine2"
              label={`${t.addressLine2} (${t.optional})`}
              autoComplete="address-line2"
            />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-2 text-base font-semibold text-slate-900">{t.paymentTitle}</h2>
          <p className="text-sm leading-relaxed text-slate-500">{t.paymentNote}</p>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card className="p-5">
          <h2 className="text-base font-semibold text-slate-900">{t.summaryTitle}</h2>
          <ul className="mt-4 space-y-3">
            {view.lines.map((line) => (
              <li key={line.variantId} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{line.title}</span>
                  <span className="block text-xs text-slate-400">
                    {line.variantTitle} · {line.quantity}×
                  </span>
                </span>
                <span className="shrink-0 font-medium text-slate-900">{line.lineTotalLabel}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
            <span className="font-medium text-slate-700">{t.success.total}</span>
            <span className="text-base font-semibold text-slate-900">{view.subtotalLabel}</span>
          </div>

          <Button type="submit" className="mt-5 w-full" disabled={isPending}>
            {isPending ? t.submitting : t.submit}
          </Button>
        </Card>
      </aside>
    </form>
  );
}

function Field({
  name,
  label,
  error,
  ...props
}: {
  name: string;
  label: string;
  error?: boolean;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <Input
      id={`checkout-${name}`}
      name={name}
      label={label}
      className={error ? "border-red-300 focus:border-red-400 focus:ring-red-100" : undefined}
      aria-invalid={error ? true : undefined}
      {...props}
    />
  );
}

function CheckoutSuccess({
  confirmation,
  t,
}: {
  confirmation: NonNullable<CheckoutFormState["confirmation"]>;
  t: CheckoutDict;
}) {
  return (
    <Card className="mx-auto max-w-xl p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
        ✓
      </div>
      <h2 className="text-xl font-semibold text-slate-900">{t.success.title}</h2>
      <p className="mt-1 text-sm text-slate-500">{t.success.subtitle}</p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{t.success.orderNumberLabel}</span>
          <span className="font-semibold text-slate-900">{confirmation.orderNumber}</span>
        </div>
        <ul className="mt-3 space-y-1.5 border-t border-slate-200 pt-3 text-sm">
          {confirmation.lines.map((line, index) => (
            <li key={`${line.title}-${index}`} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-slate-600">
                {line.title} · {line.variantTitle} · {line.quantity}×
              </span>
              <span className="shrink-0 font-medium text-slate-900">{line.lineTotalLabel}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
          <span className="font-medium text-slate-700">{t.success.total}</span>
          <span className="text-base font-semibold text-slate-900">{confirmation.totalLabel}</span>
        </div>
      </div>

      {confirmation.paymentPending ? (
        <Alert tone="info" className="mt-4 text-left">
          {t.success.paymentPendingNote}
        </Alert>
      ) : null}

      <Link href="/products" className="mt-6 inline-block">
        <Button variant="secondary">{t.success.continueShopping}</Button>
      </Link>
    </Card>
  );
}

function bannerMessage(reason: string | undefined, t: CheckoutDict): string {
  switch (reason) {
    case "validation":
      return t.validationError;
    case "cart-not-ready":
      return t.errorCartNotReady;
    case "rejected":
      return t.errorRejected;
    case "no-store":
      return t.errorNoStore;
    default:
      return t.errorGeneric;
  }
}
