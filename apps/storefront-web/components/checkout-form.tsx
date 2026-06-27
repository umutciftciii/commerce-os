"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input, Select } from "@commerce-os/ui";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { CartView } from "../lib/server/cart";
import { type CheckoutFormState, submitCheckoutAction } from "../lib/server/cart-actions";
import { districtsOf, trProvinceNames } from "../lib/tr-location-data";
import { formatTrPhone } from "../lib/phone";

type CheckoutDict = StorefrontDictionary["checkout"];

const initialState: CheckoutFormState = { status: "idle" };

/**
 * Checkout formu (F3B.1 UX). useActionState ile Server Action'a baglanir. Sepet
 * kalemleri/kupon formdan DEGIL cookie'den (sunucu) okunur; form iletisim/adres
 * tasir. Il/ilce bagimli dropdown'dir (il secilmeden ilce kapali; il degisince
 * ilce sifirlanir). Telefon TR cep formatinda yazilir; sunucu normalize/dogrular.
 * Order olusumu/validasyon nihai olarak gateway'dedir.
 */
export function CheckoutForm({
  view,
  t,
  paymentTestEnabled = false,
}: {
  view: CartView;
  t: CheckoutDict;
  /** F3B.2: Aktif TEST/MOCK provider varsa ödeme bölümü test-akış metnini gösterir. */
  paymentTestEnabled?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(submitCheckoutAction, initialState);

  // F3B.2: Uygun TEST/MOCK provider varsa order sonrasi ödeme test sayfasina
  // yönlendir; yoksa (paymentRedirectPath undefined) bugünkü onay ekrani gösterilir.
  const paymentRedirectPath =
    state.status === "success" ? state.confirmation?.paymentRedirectPath : undefined;
  useEffect(() => {
    if (paymentRedirectPath) router.push(paymentRedirectPath);
  }, [paymentRedirectPath, router]);

  if (state.status === "success" && state.confirmation) {
    if (state.confirmation.paymentRedirectPath) {
      return (
        <Card className="mx-auto max-w-xl p-8 text-center">
          <p className="text-sm text-slate-500">{t.paymentRedirecting}</p>
        </Card>
      );
    }
    return <CheckoutSuccess confirmation={state.confirmation} t={t} />;
  }

  const fieldErrors = state.fieldErrors ?? {};
  const bannerError = state.status === "error" ? bannerMessage(state.errorReason, t) : null;

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {bannerError ? <Alert tone="error">{bannerError}</Alert> : null}

        <Card className="p-6">
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
            <PhoneField label={t.phone} placeholder={t.phonePlaceholder} hint={t.phoneHint} error={fieldErrors.phone} />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">{t.addressTitle}</h2>
          <AddressFields t={t} fieldErrors={fieldErrors} />
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">{t.paymentTitle}</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
              {t.paymentMock}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {paymentTestEnabled ? t.paymentTestNote : t.paymentNote}
          </p>
        </Card>
      </div>

      <CheckoutSummary view={view} t={t} isPending={isPending} />
    </form>
  );
}

function AddressFields({ t, fieldErrors }: { t: CheckoutDict; fieldErrors: Record<string, boolean> }) {
  const [province, setProvince] = useState("");
  const districts = useMemo(() => districtsOf(province), [province]);

  return (
    <div className="space-y-4">
      <input type="hidden" name="country" value="TR" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">{t.city}</span>
          <Select
            name="city"
            value={province}
            onChange={(event) => setProvince(event.target.value)}
            className={fieldErrors.city ? "border-red-300 focus:border-red-400 focus:ring-red-100" : undefined}
            aria-invalid={fieldErrors.city ? true : undefined}
            options={[
              { value: "", label: t.cityPlaceholder },
              ...trProvinceNames.map((name) => ({ value: name, label: name })),
            ]}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">{t.district}</span>
          <Select
            name="district"
            disabled={!province}
            className={fieldErrors.district ? "border-red-300 focus:border-red-400 focus:ring-red-100" : undefined}
            aria-invalid={fieldErrors.district ? true : undefined}
            options={[
              { value: "", label: province ? t.districtPlaceholder : t.districtSelectCityFirst },
              ...districts.map((name) => ({ value: name, label: name })),
            ]}
          />
        </label>
      </div>
      <Field
        name="addressLine1"
        label={t.addressLine1}
        error={fieldErrors.addressLine1}
        autoComplete="address-line1"
        required
      />
      <Field name="addressLine2" label={`${t.addressLine2} (${t.optional})`} autoComplete="address-line2" />
      <div className="sm:max-w-[200px]">
        <Field name="postalCode" label={t.postalCode} autoComplete="postal-code" inputMode="numeric" />
      </div>
    </div>
  );
}

function PhoneField({
  label,
  placeholder,
  hint,
  error,
}: {
  label: string;
  placeholder: string;
  hint: string;
  error?: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="sm:col-span-2">
      <label htmlFor="checkout-phone" className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
        <div className="flex items-stretch">
          <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
            +90
          </span>
          <input
            id="checkout-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder={placeholder}
            value={value}
            onChange={(event) => setValue(formatTrPhone(event.target.value))}
            aria-invalid={error ? true : undefined}
            className={[
              "h-10 w-full rounded-r-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2",
              error
                ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                : "border-slate-200 focus:border-brand-500 focus:ring-brand-100",
            ].join(" ")}
          />
        </div>
      </label>
      <p className={["mt-1 text-xs", error ? "text-red-600" : "text-slate-400"].join(" ")}>{hint}</p>
    </div>
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
  inputMode?: "numeric" | "text";
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

function CheckoutSummary({ view, t, isPending }: { view: CartView; t: CheckoutDict; isPending: boolean }) {
  const s = view.summary;
  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <Card className="p-6">
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

        <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
          <Row label={t.subtotal} value={s.subtotalLabel} />
          {s.discountLabel ? (
            <Row
              label={`${t.discount}${s.couponCode ? ` (${s.couponCode})` : ""}`}
              value={`−${s.discountLabel}`}
              tone="discount"
            />
          ) : null}
          <Row
            label={t.shipping}
            value={s.shippingIsFree ? t.shippingFree : s.shippingLabel}
            tone={s.shippingIsFree ? "free" : undefined}
          />
          <div className="flex items-center justify-between border-t border-slate-100 pt-2">
            <dt className="font-semibold text-slate-900">{t.grandTotal}</dt>
            <dd className="text-lg font-semibold text-slate-900">{s.grandTotalLabel}</dd>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <dt>{format(t.taxIncludedLabel, { rate: s.taxRatePercent })}</dt>
            <dd>{s.taxIncludedLabel}</dd>
          </div>
        </dl>

        <Button type="submit" className="mt-5 w-full" disabled={isPending}>
          {isPending ? t.submitting : t.submit}
        </Button>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">{t.summaryNote}</p>
      </Card>
    </aside>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "discount" | "free" }) {
  const valueClass =
    tone === "discount" || tone === "free" ? "font-medium text-emerald-700" : "font-medium text-slate-900";
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className={valueClass}>{value}</dd>
    </div>
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
        <dl className="mt-3 space-y-1.5 border-t border-slate-200 pt-3 text-sm">
          <Row label={t.subtotal} value={confirmation.subtotalLabel} />
          {confirmation.discountLabel ? (
            <Row label={t.discount} value={`−${confirmation.discountLabel}`} tone="discount" />
          ) : null}
          <Row
            label={t.shipping}
            value={confirmation.shippingIsFree ? t.shippingFree : confirmation.shippingLabel}
            tone={confirmation.shippingIsFree ? "free" : undefined}
          />
          <div className="flex items-center justify-between border-t border-slate-200 pt-2">
            <dt className="font-semibold text-slate-700">{t.grandTotal}</dt>
            <dd className="text-base font-semibold text-slate-900">{confirmation.totalLabel}</dd>
          </div>
        </dl>
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
