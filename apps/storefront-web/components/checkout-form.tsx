"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Alert, Button, Card, Input, Select } from "@commerce-os/ui";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { CustomerAddress } from "@commerce-os/api-client";
import { isValidTckn } from "@commerce-os/api-client/validators";
import type { CartView, ShippingOptionView } from "../lib/server/cart";
import {
  type CheckoutFormState,
  selectShippingOptionAction,
  submitCheckoutAction,
} from "../lib/server/cart-actions";
import { districtsOf, trProvinceNames } from "../lib/tr-location-data";
import { formatTrPhone } from "../lib/phone";
import { hasProviderLogo, providerInitials } from "../lib/shipment";

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
  addressBook,
}: {
  view: CartView;
  t: CheckoutDict;
  /** F3B.2: Aktif TEST/MOCK provider varsa ödeme bölümü test-akış metnini gösterir. */
  paymentTestEnabled?: boolean;
  /**
   * F3B.3: Oturum acmis musteride teslimat, adres defterinden secilir. Verilirse
   * iletisim/teslimat kartlari yerine adres secici + e-posta render edilir; secilen
   * adres action'in bekledigi alan adlarini (fullName/phone/city/...) hidden input
   * olarak yayar. Fatura ("fatura farkli") akisi degismeden korunur.
   */
  addressBook?: {
    addresses: CustomerAddress[];
    accountEmail: string | null;
  };
}) {
  const [state, formAction, isPending] = useActionState(submitCheckoutAction, initialState);

  // F3B.2: Order olusumu basariliysa Server Action SUNUCU-TARAFI redirect yapar
  // (/checkout/payment veya /checkout/success). Bu nedenle burada "success" durumu
  // RENDER EDILMEZ; yalniz validasyon/hata durumlari client'ta gosterilir. Onceki
  // client-side redirect, bos-sepet revalidate'i ile clobber oluyordu (F3B.1 bug).
  const fieldErrors = state.fieldErrors ?? {};
  const bannerError = state.status === "error" ? bannerMessage(state.errorReason, t) : null;

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {bannerError ? <Alert tone="error">{bannerError}</Alert> : null}

        {addressBook ? (
          <Card className="p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-900">{t.addressBook.title}</h2>
            <CheckoutAddressBook
              t={t}
              addresses={addressBook.addresses}
              accountEmail={addressBook.accountEmail}
              emailError={fieldErrors.email}
            />
          </Card>
        ) : (
          <>
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
          </>
        )}

        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-900">{t.shippingOptions.title}</h2>
          <ShippingOptions t={t} options={view.shippingOptions} selectedId={view.selectedShippingOptionId} />
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">{t.billing.title}</h2>
          <BillingFields t={t} fieldErrors={fieldErrors} />
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">{t.paymentTitle}</h2>
            <span
              className={[
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                paymentTestEnabled
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : "bg-slate-100 text-slate-500",
              ].join(" ")}
            >
              {paymentTestEnabled ? t.paymentTestBadge : t.paymentMock}
            </span>
          </div>
          {paymentTestEnabled ? (
            <>
              <p className="mt-2 text-sm font-medium text-slate-700">{t.paymentTestNote}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">{t.paymentTestHint}</p>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{t.paymentNote}</p>
          )}
        </Card>
      </div>

      <CheckoutSummary view={view} t={t} isPending={isPending} paymentTestEnabled={paymentTestEnabled} />
    </form>
  );
}

/**
 * F3B.2 — Fatura bölümü. VARSAYILAN: "Fatura bilgilerim farklı" KAPALI → fatura
 * bilgisi teslimat/iletişimden türetilir, T.C. Kimlik No / VKN İSTENMEZ. Kullanıcı
 * checkbox'ı işaretlerse Bireysel/Kurumsal seçimi ve ilgili alanlar (Bireysel:
 * ad soyad + TCKN; Kurumsal: firma + vergi dairesi + vergi no) ve istenirse ayrı
 * fatura adresi açılır. TCKN istemci-tarafı anlık doğrulanır (server da doğrular).
 */
function BillingFields({ t, fieldErrors }: { t: CheckoutDict; fieldErrors: Record<string, boolean> }) {
  const [different, setDifferent] = useState(false);
  const [type, setType] = useState<"INDIVIDUAL" | "CORPORATE">("INDIVIDUAL");
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [province, setProvince] = useState("");
  const [tckn, setTckn] = useState("");
  const [tcknTouched, setTcknTouched] = useState(false);
  const districts = useMemo(() => districtsOf(province), [province]);
  const b = t.billing;

  // TCKN istemci-tarafı UX doğrulaması (server bağımsız doğrular). Yalnızca
  // bireysel + farklı fatura açıkken anlamlı; boş değilse ve geçersizse hata.
  // tcknTouched: kullanıcı alandan çıkınca ya da server hata döndürünce gösterilir.
  const tcknLocalInvalid = different && type === "INDIVIDUAL" && tckn.length > 0 && !isValidTckn(tckn);
  const showTcknError = (tcknLocalInvalid && tcknTouched) || Boolean(fieldErrors.tckn);

  return (
    <div className="space-y-4">
      <input type="hidden" name="billingDifferent" value={different ? "true" : "false"} />

      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" checked={different} onChange={(event) => setDifferent(event.target.checked)} />
        {b.differentToggle}
      </label>
      {!different ? <p className="text-xs text-slate-400">{b.defaultNote}</p> : null}

      {different ? (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <input type="hidden" name="billingType" value={type} />
          <input type="hidden" name="billingSameAsShipping" value={sameAsShipping ? "true" : "false"} />

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{b.typeLabel}</span>
            <div className="flex gap-3">
              {(["INDIVIDUAL", "CORPORATE"] as const).map((value) => (
                <label
                  key={value}
                  className={[
                    "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
                    type === value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="billingTypeRadio"
                    className="sr-only"
                    checked={type === value}
                    onChange={() => setType(value)}
                  />
                  {value === "INDIVIDUAL" ? b.individual : b.corporate}
                </label>
              ))}
            </div>
          </div>

          {type === "INDIVIDUAL" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field name="billingName" label={b.nameLabel} error={fieldErrors.billingName} autoComplete="name" />
              <div>
                <Input
                  id="checkout-tckn"
                  name="tckn"
                  label={b.tcknLabel}
                  inputMode="numeric"
                  placeholder={b.tcknPlaceholder}
                  value={tckn}
                  onChange={(event) => setTckn(event.target.value.replace(/\D+/g, "").slice(0, 11))}
                  onBlur={() => setTcknTouched(true)}
                  aria-invalid={showTcknError ? true : undefined}
                  className={
                    showTcknError ? "border-red-300 focus:border-red-400 focus:ring-red-100" : undefined
                  }
                />
                <p className={["mt-1 text-xs", showTcknError ? "text-red-600" : "text-slate-400"].join(" ")}>
                  {showTcknError ? b.tcknInvalid : b.tcknHint}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field name="companyName" label={b.companyLabel} error={fieldErrors.companyName} />
              <Field name="taxOffice" label={b.taxOfficeLabel} error={fieldErrors.taxOffice} />
              <Field
                name="taxNumber"
                label={b.taxNumberLabel}
                error={fieldErrors.taxNumber}
                inputMode="numeric"
                placeholder={b.taxNumberPlaceholder}
              />
              <Field name="billingEmail" label={b.emailLabel} type="email" autoComplete="email" />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={!sameAsShipping}
              onChange={(event) => setSameAsShipping(!event.target.checked)}
            />
            {b.differentAddressToggle}
          </label>

          {!sameAsShipping ? (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-700">{b.addressTitle}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">{t.city}</span>
                  <Select
                    name="billingCity"
                    value={province}
                    onChange={(event) => setProvince(event.target.value)}
                    className={
                      fieldErrors.billingCity ? "border-red-300 focus:border-red-400 focus:ring-red-100" : undefined
                    }
                    aria-invalid={fieldErrors.billingCity ? true : undefined}
                    options={[
                      { value: "", label: t.cityPlaceholder },
                      ...trProvinceNames.map((name) => ({ value: name, label: name })),
                    ]}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">{t.district}</span>
                  <Select
                    name="billingDistrict"
                    disabled={!province}
                    className={
                      fieldErrors.billingDistrict ? "border-red-300 focus:border-red-400 focus:ring-red-100" : undefined
                    }
                    aria-invalid={fieldErrors.billingDistrict ? true : undefined}
                    options={[
                      { value: "", label: province ? t.districtPlaceholder : t.districtSelectCityFirst },
                      ...districts.map((name) => ({ value: name, label: name })),
                    ]}
                  />
                </label>
              </div>
              <Field name="billingAddressLine1" label={t.addressLine1} error={fieldErrors.billingAddressLine1} />
              <Field name="billingAddressLine2" label={`${t.addressLine2} (${t.optional})`} />
              <div className="sm:max-w-[200px]">
                <Field name="billingPostalCode" label={t.postalCode} inputMode="numeric" />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
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
  placeholder?: string;
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

function CheckoutSummary({
  view,
  t,
  isPending,
  paymentTestEnabled,
}: {
  view: CartView;
  t: CheckoutDict;
  isPending: boolean;
  paymentTestEnabled: boolean;
}) {
  const s = view.summary;
  // F3C.2 — Kargo TARİFE quote'u OK değilse (adres yok / tarife yok / kural yok /
  // ölçü eksik) ödeme adımına geçilmez: satır boş kalmaz, net mesaj basılır ve
  // submit bloklanır (gateway de 409 ile bloklar; bu istemci-tarafı eşleğidir).
  const shippingBlocked = s.shippingStatus !== "OK";
  const shippingStatusMessage =
    s.shippingStatus === "ADDRESS_REQUIRED"
      ? t.shippingPending
      : s.shippingStatus === "NO_RATE_PLAN"
        ? t.shippingNoRatePlan
        : t.shippingUnavailable;
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
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">{t.shipping}</dt>
            <dd className="text-right">
              {shippingBlocked ? (
                <span className="text-xs font-normal text-slate-500">{shippingStatusMessage}</span>
              ) : s.shippingIsFree ? (
                <span className="font-medium text-emerald-700">{t.shippingFree}</span>
              ) : (
                <span className="font-medium text-slate-900">{s.shippingLabel}</span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-2">
            <dt className="font-semibold text-slate-900">{t.grandTotal}</dt>
            <dd className="text-lg font-semibold text-slate-900">{s.grandTotalLabel}</dd>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <dt>{format(t.taxIncludedLabel, { rate: s.taxRatePercent })}</dt>
            <dd>{s.taxIncludedLabel}</dd>
          </div>
        </dl>

        {shippingBlocked ? (
          <Alert tone="warning" className="mt-4">
            {t.shippingBlockedNotice}
          </Alert>
        ) : null}

        <Button type="submit" className="mt-5 w-full" disabled={isPending || shippingBlocked}>
          {isPending ? t.submitting : paymentTestEnabled ? t.submitContinue : t.submit}
        </Button>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">{t.summaryNote}</p>
      </Card>
    </aside>
  );
}

/**
 * TODO-125 — Kargo sağlayıcı/seçenek seçimi. Seçenekler sunucu-otoriter fiyatlanmış
 * gelir (istemci fiyatına güvenilmez). Seçim cookie'ye yazılır (Server Action) ve
 * sayfa yeniden doğrulanır → özet/toplam sunucuda güncellenir. Logo varsa gösterilir,
 * yoksa sağlayıcı baş harfleri fallback. Erişilebilir radio kartları (dropdown değil).
 */
function ShippingOptions({
  t,
  options,
  selectedId,
}: {
  t: CheckoutDict;
  options: ShippingOptionView[];
  selectedId: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(selectedId);
  const selectable = options.filter((o) => o.available);

  // Hiç uygun seçenek yoksa net Türkçe uyarı (ödeme zaten özet tarafında bloklanır).
  if (selectable.length === 0) {
    return (
      <div className="mt-2">
        <Alert tone="warning" title={t.shippingOptions.noneTitle}>
          {t.shippingOptions.noneDescription}
        </Alert>
      </div>
    );
  }

  const effectiveSelected = selected ?? selectedId ?? selectable[0]?.optionId ?? null;

  function onSelect(optionId: string) {
    setSelected(optionId);
    startTransition(() => {
      void selectShippingOptionAction(optionId);
    });
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Submit için son seçim (cookie fallback yanında belt-and-suspenders). */}
      <input type="hidden" name="shippingOptionId" value={effectiveSelected ?? ""} />
      <p className="text-xs text-slate-400">{t.shippingOptions.hint}</p>
      <div className="space-y-2" role="radiogroup" aria-label={t.shippingOptions.title}>
        {selectable.map((option) => {
          const active = option.optionId === effectiveSelected;
          return (
            <label
              key={option.optionId}
              className={[
                "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition",
                active
                  ? "border-brand-500 bg-brand-50 ring-1 ring-brand-200"
                  : "border-slate-200 hover:border-slate-300",
              ].join(" ")}
            >
              <input
                type="radio"
                name="shippingOptionChoice"
                className="sr-only"
                checked={active}
                onChange={() => onSelect(option.optionId)}
              />
              <ProviderBadge name={option.providerName} logoUrl={option.logoUrl} logoAlt={option.logoAlt} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900">
                  {option.providerName}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {option.serviceName}
                  {option.estimatedDelivery ? ` · ${option.estimatedDelivery}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                {option.freeShipping ? (
                  <span className="text-sm font-semibold text-emerald-700">
                    {t.shippingOptions.free}
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-slate-900">{option.priceLabel}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {isPending ? <p className="text-xs text-slate-400">{t.shippingOptions.updating}</p> : null}
    </div>
  );
}

/** Sağlayıcı logosu (varsa) veya baş-harf rozeti (fallback). */
function ProviderBadge({
  name,
  logoUrl,
  logoAlt,
}: {
  name: string;
  logoUrl: string | null;
  logoAlt: string | null;
}) {
  if (hasProviderLogo(logoUrl)) {
    return (
      <img
        src={logoUrl!}
        alt={logoAlt ?? name}
        className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1"
      />
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xs font-semibold text-brand-700">
      {providerInitials(name)}
    </span>
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

function bannerMessage(reason: string | undefined, t: CheckoutDict): string {
  switch (reason) {
    case "validation":
      return t.validationError;
    case "cart-not-ready":
      return t.errorCartNotReady;
    // F4A — sunucu kupon yeniden dogrulamasi reddetti; kupon kaldirilarak duzeltilir.
    case "coupon-invalid":
      return t.errorCouponInvalid;
    case "rejected":
      return t.errorRejected;
    case "no-store":
      return t.errorNoStore;
    default:
      return t.errorGeneric;
  }
}

/**
 * F3B.3 — Checkout adres defteri secici (oturum acmis musteri). Secilen adres,
 * Server Action'in bekledigi alan adlarini (fullName/phone/country/city/district/
 * addressLine1/2/postalCode) hidden input olarak yayar. Varsayilan teslimat adresi
 * onceden secili gelir; "Degistir" ile diger kayitli adresler arasinda gecilir.
 * E-posta adres defterinde tutulmadigindan ayrica alinir (hesap e-postasi onerilir).
 */
function CheckoutAddressBook({
  t,
  addresses,
  accountEmail,
  emailError,
}: {
  t: CheckoutDict;
  addresses: CustomerAddress[];
  accountEmail: string | null;
  emailError?: boolean;
}) {
  const defaultId = addresses.find((a) => a.isDefaultShipping)?.id ?? addresses[0].id;
  const [selectedId, setSelectedId] = useState(defaultId);
  const [changing, setChanging] = useState(false);
  const selected = addresses.find((a) => a.id === selectedId) ?? addresses[0];
  const ab = t.addressBook;

  return (
    <div className="space-y-4">
      <input type="hidden" name="fullName" value={selected.fullName} />
      <input type="hidden" name="phone" value={selected.phone ?? ""} />
      <input type="hidden" name="country" value="TR" />
      <input type="hidden" name="city" value={selected.city} />
      <input type="hidden" name="district" value={selected.district ?? ""} />
      <input type="hidden" name="addressLine1" value={selected.addressLine1} />
      <input type="hidden" name="addressLine2" value={selected.addressLine2 ?? ""} />
      <input type="hidden" name="postalCode" value={selected.postalCode ?? ""} />

      {!changing ? (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
          <div className="text-sm text-slate-700">
            <p className="font-medium text-slate-900">
              {selected.addressName ? `${selected.addressName} · ` : ""}
              {selected.fullName}
              {selected.isDefaultShipping ? (
                <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                  {ab.default}
                </span>
              ) : null}
            </p>
            <p className="mt-1 leading-relaxed text-slate-600">
              {selected.addressLine1}
              {selected.addressLine2 ? `, ${selected.addressLine2}` : ""}
            </p>
            <p className="text-slate-600">
              {selected.district ? `${selected.district} / ` : ""}
              {selected.city}
              {selected.postalCode ? ` ${selected.postalCode}` : ""}
            </p>
            {selected.phone ? <p className="text-slate-500">{selected.phone}</p> : null}
          </div>
          {addresses.length > 1 ? (
            <button
              type="button"
              className="shrink-0 text-sm font-medium text-brand-700 hover:text-brand-800"
              onClick={() => setChanging(true)}
            >
              {ab.change}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          {addresses.map((address) => (
            <label
              key={address.id}
              className={[
                "flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm",
                address.id === selectedId
                  ? "border-brand-500 bg-brand-50"
                  : "border-slate-200 hover:border-slate-300",
              ].join(" ")}
            >
              <input
                type="radio"
                name="addressBookChoice"
                className="mt-1"
                checked={address.id === selectedId}
                onChange={() => setSelectedId(address.id)}
              />
              <span className="text-slate-700">
                <span className="font-medium text-slate-900">
                  {address.addressName ? `${address.addressName} · ` : ""}
                  {address.fullName}
                </span>
                <span className="mt-0.5 block text-slate-600">
                  {address.addressLine1}
                  {address.district ? `, ${address.district}` : ""} / {address.city}
                </span>
              </span>
            </label>
          ))}
          <button
            type="button"
            className="text-sm font-medium text-brand-700 hover:text-brand-800"
            onClick={() => setChanging(false)}
          >
            {ab.use}
          </button>
        </div>
      )}

      <div>
        <Input
          id="checkout-account-email"
          name="email"
          type="email"
          label={t.email}
          autoComplete="email"
          defaultValue={accountEmail ?? ""}
          aria-invalid={emailError ? true : undefined}
          className={emailError ? "border-red-300 focus:border-red-400 focus:ring-red-100" : undefined}
        />
        <a
          href="/account?section=addresses"
          className="mt-1.5 inline-block text-xs font-medium text-brand-700 hover:text-brand-800"
        >
          {ab.manageCta}
        </a>
      </div>
    </div>
  );
}
