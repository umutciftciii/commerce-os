"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
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
import { Badge, Button, Field as FieldShell, Input, Select, Subheading } from "./ui";

type CheckoutDict = StorefrontDictionary["checkout"];

const initialState: CheckoutFormState = { status: "idle" };

// Hata durumunda kontrol cercevesi. `cn` tailwind-merge DEGIL (saf joiner);
// bu yuzden taban `border-line`/`focus:ring-ink` uzerine yazmak icin `!` important
// ile deterministik kilinir (vitrin field.tsx hata dili: kirmizi ayrisir).
const inputError = "!border-red-500 focus:!border-red-500 focus:!ring-red-400";

// DS bolum yuzeyi: duz hairline kart (rounded-none, golge yok) — PLP/PDP/cart dili.
const cardSurface = "border border-line bg-surface p-6";

/**
 * Checkout formu (F3B.1 UX). useActionState ile Server Action'a baglanir. Sepet
 * kalemleri/kupon formdan DEGIL cookie'den (sunucu) okunur; form iletisim/adres
 * tasir. Il/ilce bagimli dropdown'dir (il secilmeden ilce kapali; il degisince
 * ilce sifirlanir). Telefon TR cep formatinda yazilir; sunucu normalize/dogrular.
 * Order olusumu/validasyon nihai olarak gateway'dedir.
 *
 * Görsel katman vitrin DS'ine göçtü (yerel components/ui barrel + ink/surface/line/
 * accent token'lari, PLP/PDP/cart dili). Aksan (menekse) YALNIZCA tekil birincil
 * CTA'da (submit butonu, variant="cta"); indirim/kupon/rozet yuzeyleri NOTR kalir.
 * Ticaret mantigi (Server Action bagları, hidden input'lar, useTransition, kosullu
 * render, il/ilce/TCKN/sameAsShipping state'i) DEGISMEDI — yalniz palet/tipografi.
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
        {bannerError ? (
          <div role="alert" className="border border-line bg-surface-muted px-4 py-3 text-sm text-red-600">
            {bannerError}
          </div>
        ) : null}

        {addressBook ? (
          <div className={cardSurface}>
            <Subheading as="h2" className="mb-4 text-base">
              {t.addressBook.title}
            </Subheading>
            <CheckoutAddressBook
              t={t}
              addresses={addressBook.addresses}
              accountEmail={addressBook.accountEmail}
              emailError={fieldErrors.email}
            />
          </div>
        ) : (
          <>
            <div className={cardSurface}>
              <Subheading as="h2" className="mb-4 text-base">
                {t.contactTitle}
              </Subheading>
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
            </div>

            <div className={cardSurface}>
              <Subheading as="h2" className="mb-4 text-base">
                {t.addressTitle}
              </Subheading>
              <AddressFields t={t} fieldErrors={fieldErrors} />
            </div>
          </>
        )}

        <div className={cardSurface}>
          <Subheading as="h2" className="text-base">
            {t.shippingOptions.title}
          </Subheading>
          <ShippingOptions t={t} options={view.shippingOptions} selectedId={view.selectedShippingOptionId} />
        </div>

        <div className={cardSurface}>
          <Subheading as="h2" className="mb-4 text-base">
            {t.billing.title}
          </Subheading>
          <BillingFields t={t} fieldErrors={fieldErrors} />
        </div>

        <div className={cardSurface}>
          <div className="flex items-center justify-between">
            <Subheading as="h2" className="text-base">
              {t.paymentTitle}
            </Subheading>
            <Badge tone={paymentTestEnabled ? "outline" : "muted"}>
              {paymentTestEnabled ? t.paymentTestBadge : t.paymentMock}
            </Badge>
          </div>
          {paymentTestEnabled ? (
            <>
              <p className="mt-2 text-sm font-medium text-ink">{t.paymentTestNote}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t.paymentTestHint}</p>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t.paymentNote}</p>
          )}
        </div>
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

      <label className="flex items-center gap-2 text-sm font-medium text-ink-muted">
        <input type="checkbox" checked={different} onChange={(event) => setDifferent(event.target.checked)} />
        {b.differentToggle}
      </label>
      {!different ? <p className="text-xs text-ink-subtle">{b.defaultNote}</p> : null}

      {different ? (
        <div className="space-y-4 border border-line bg-surface-muted p-4">
          <input type="hidden" name="billingType" value={type} />
          <input type="hidden" name="billingSameAsShipping" value={sameAsShipping ? "true" : "false"} />

          <div>
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wideish text-ink-muted">
              {b.typeLabel}
            </span>
            <div className="flex gap-3">
              {(["INDIVIDUAL", "CORPORATE"] as const).map((value) => (
                <label
                  key={value}
                  className={[
                    "flex flex-1 cursor-pointer items-center justify-center gap-2 border px-3 py-2 text-sm font-medium transition-colors",
                    type === value
                      ? "border-ink bg-surface text-ink"
                      : "border-line text-ink-muted hover:border-line-strong",
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
              <FieldShell
                label={b.tcknLabel}
                htmlFor="checkout-tckn"
                error={showTcknError ? b.tcknInvalid : undefined}
                hint={showTcknError ? undefined : b.tcknHint}
              >
                <Input
                  id="checkout-tckn"
                  name="tckn"
                  inputMode="numeric"
                  placeholder={b.tcknPlaceholder}
                  value={tckn}
                  onChange={(event) => setTckn(event.target.value.replace(/\D+/g, "").slice(0, 11))}
                  onBlur={() => setTcknTouched(true)}
                  aria-invalid={showTcknError ? true : undefined}
                  className={showTcknError ? inputError : undefined}
                />
              </FieldShell>
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

          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={!sameAsShipping}
              onChange={(event) => setSameAsShipping(!event.target.checked)}
            />
            {b.differentAddressToggle}
          </label>

          {!sameAsShipping ? (
            <div className="space-y-4 border border-line bg-surface p-4">
              <p className="text-sm font-medium text-ink">{b.addressTitle}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldShell label={t.city} htmlFor="checkout-billingCity">
                  <Select
                    id="checkout-billingCity"
                    name="billingCity"
                    value={province}
                    onChange={(event) => setProvince(event.target.value)}
                    className={fieldErrors.billingCity ? inputError : undefined}
                    aria-invalid={fieldErrors.billingCity ? true : undefined}
                  >
                    <option value="">{t.cityPlaceholder}</option>
                    {trProvinceNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </FieldShell>
                <FieldShell label={t.district} htmlFor="checkout-billingDistrict">
                  <Select
                    id="checkout-billingDistrict"
                    name="billingDistrict"
                    disabled={!province}
                    className={fieldErrors.billingDistrict ? inputError : undefined}
                    aria-invalid={fieldErrors.billingDistrict ? true : undefined}
                  >
                    <option value="">{province ? t.districtPlaceholder : t.districtSelectCityFirst}</option>
                    {districts.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </FieldShell>
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
        <FieldShell label={t.city} htmlFor="checkout-city">
          <Select
            id="checkout-city"
            name="city"
            value={province}
            onChange={(event) => setProvince(event.target.value)}
            className={fieldErrors.city ? inputError : undefined}
            aria-invalid={fieldErrors.city ? true : undefined}
          >
            <option value="">{t.cityPlaceholder}</option>
            {trProvinceNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </FieldShell>
        <FieldShell label={t.district} htmlFor="checkout-district">
          <Select
            id="checkout-district"
            name="district"
            disabled={!province}
            className={fieldErrors.district ? inputError : undefined}
            aria-invalid={fieldErrors.district ? true : undefined}
          >
            <option value="">{province ? t.districtPlaceholder : t.districtSelectCityFirst}</option>
            {districts.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </FieldShell>
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
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wideish text-ink-muted">
          {label}
        </span>
        <div className="flex items-stretch">
          <span className="inline-flex items-center border border-r-0 border-line bg-surface-muted px-3 text-sm text-ink-muted">
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
              "h-11 w-full border bg-surface px-3.5 text-sm text-ink placeholder:text-ink-subtle transition-colors focus:outline-none focus:ring-1",
              error
                ? "border-red-500 focus:border-red-500 focus:ring-red-400"
                : "border-line focus:border-ink focus:ring-ink",
            ].join(" ")}
          />
        </div>
      </label>
      <p className={["mt-1 text-xs", error ? "text-red-600" : "text-ink-subtle"].join(" ")}>{hint}</p>
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
  const id = `checkout-${name}`;
  return (
    <FieldShell label={label} htmlFor={id}>
      <Input
        id={id}
        name={name}
        className={error ? inputError : undefined}
        aria-invalid={error ? true : undefined}
        {...props}
      />
    </FieldShell>
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
      <div className="border border-line bg-surface p-6">
        <Subheading as="h2" className="text-base">
          {t.summaryTitle}
        </Subheading>

        <ul className="mt-4 space-y-3">
          {view.lines.map((line) => (
            <li key={line.variantId} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{line.title}</span>
                <span className="block text-xs text-ink-subtle">
                  {line.variantTitle} · {line.quantity}×
                </span>
              </span>
              <span className="shrink-0 font-medium text-ink">{line.lineTotalLabel}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          <Row label={t.subtotal} value={s.subtotalLabel} />
          {/* F4A.1 — Indirim satirlari kampanya ADIYLA listelenir (kuponda kod
              parantezde); satir bilgisi yoksa toplam indirim satirina dusulur.
              DS: indirim NOTR (aksan yalniz CTA'da); "−" isareti + ink ile ayrisir. */}
          {s.discountLines.length > 0 ? (
            s.discountLines.map((line, index) => (
              <Row
                key={index}
                label={`${line.label}${line.code ? ` (${line.code})` : ""}`}
                value={`−${line.amountLabel}`}
              />
            ))
          ) : s.discountLabel ? (
            <Row
              label={`${t.discount}${s.couponCode ? ` (${s.couponCode})` : ""}`}
              value={`−${s.discountLabel}`}
            />
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-muted">{t.shipping}</dt>
            <dd className="text-right">
              {shippingBlocked ? (
                <span className="text-xs font-normal text-ink-muted">{shippingStatusMessage}</span>
              ) : s.shippingIsFree ? (
                <span className="font-medium text-ink">{t.shippingFree}</span>
              ) : (
                <span className="font-medium text-ink">{s.shippingLabel}</span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-2">
            <dt className="font-semibold text-ink">{t.grandTotal}</dt>
            <dd className="text-base font-semibold text-ink">{s.grandTotalLabel}</dd>
          </div>
          <div className="flex items-center justify-between text-xs text-ink-subtle">
            <dt>{format(t.taxIncludedLabel, { rate: s.taxRatePercent })}</dt>
            <dd>{s.taxIncludedLabel}</dd>
          </div>
        </dl>

        {shippingBlocked ? (
          <div className="mt-4 border border-line-strong bg-surface-muted px-4 py-3 text-sm text-ink">
            {t.shippingBlockedNotice}
          </div>
        ) : null}

        {/* Checkout'un TEKIL birincil eylemi: submit "Ödemeye/Siparişe" aksan
            (variant="cta") tasir — cart-view "Ödemeye geç" ile ayni görsel dil,
            ama artik formun kendi submit'i. disabled bağı (isPending || shippingBlocked)
            DEGISMEDI; sunucu-otoriter akista kargo bloklanmissa submit kapali. */}
        <Button
          type="submit"
          variant="cta"
          className="mt-5 w-full"
          disabled={isPending || shippingBlocked}
        >
          {isPending ? t.submitting : paymentTestEnabled ? t.submitContinue : t.submit}
        </Button>
        <p className="mt-3 text-xs leading-relaxed text-ink-subtle">{t.summaryNote}</p>
      </div>
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
      <div className="mt-3 border border-line-strong bg-surface-muted px-4 py-3 text-sm">
        <p className="font-medium text-ink">{t.shippingOptions.noneTitle}</p>
        <p className="mt-0.5 text-ink-muted">{t.shippingOptions.noneDescription}</p>
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
      <p className="text-xs text-ink-subtle">{t.shippingOptions.hint}</p>
      <div className="space-y-2" role="radiogroup" aria-label={t.shippingOptions.title}>
        {selectable.map((option) => {
          const active = option.optionId === effectiveSelected;
          return (
            <label
              key={option.optionId}
              className={[
                "flex cursor-pointer items-center gap-3 border p-3 transition-colors",
                active ? "border-ink bg-surface-muted" : "border-line hover:border-line-strong",
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
                <span className="block truncate text-sm font-semibold text-ink">
                  {option.providerName}
                </span>
                <span className="block truncate text-xs text-ink-muted">
                  {option.serviceName}
                  {option.estimatedDelivery ? ` · ${option.estimatedDelivery}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                {option.freeShipping ? (
                  <span className="text-sm font-semibold text-ink">{t.shippingOptions.free}</span>
                ) : (
                  <span className="text-sm font-semibold text-ink">{option.priceLabel}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {isPending ? <p className="text-xs text-ink-subtle">{t.shippingOptions.updating}</p> : null}
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
        className="h-9 w-9 shrink-0 border border-line bg-surface object-contain p-1"
      />
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line bg-surface-muted text-xs font-semibold text-ink">
      {providerInitials(name)}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
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
        <div className="flex items-start justify-between gap-4 border border-line bg-surface-muted p-4">
          <div className="text-sm text-ink-muted">
            <p className="font-medium text-ink">
              {selected.addressName ? `${selected.addressName} · ` : ""}
              {selected.fullName}
              {selected.isDefaultShipping ? (
                <Badge tone="outline" className="ml-2">
                  {ab.default}
                </Badge>
              ) : null}
            </p>
            <p className="mt-1 leading-relaxed text-ink-muted">
              {selected.addressLine1}
              {selected.addressLine2 ? `, ${selected.addressLine2}` : ""}
            </p>
            <p className="text-ink-muted">
              {selected.district ? `${selected.district} / ` : ""}
              {selected.city}
              {selected.postalCode ? ` ${selected.postalCode}` : ""}
            </p>
            {selected.phone ? <p className="text-ink-subtle">{selected.phone}</p> : null}
          </div>
          {addresses.length > 1 ? (
            <button
              type="button"
              className="shrink-0 text-sm font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
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
                "flex cursor-pointer items-start gap-3 border p-4 text-sm transition-colors",
                address.id === selectedId
                  ? "border-ink bg-surface-muted"
                  : "border-line hover:border-line-strong",
              ].join(" ")}
            >
              <input
                type="radio"
                name="addressBookChoice"
                className="mt-1"
                checked={address.id === selectedId}
                onChange={() => setSelectedId(address.id)}
              />
              <span className="text-ink-muted">
                <span className="font-medium text-ink">
                  {address.addressName ? `${address.addressName} · ` : ""}
                  {address.fullName}
                </span>
                <span className="mt-0.5 block text-ink-muted">
                  {address.addressLine1}
                  {address.district ? `, ${address.district}` : ""} / {address.city}
                </span>
              </span>
            </label>
          ))}
          <button
            type="button"
            className="text-sm font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
            onClick={() => setChanging(false)}
          >
            {ab.use}
          </button>
        </div>
      )}

      <div>
        <FieldShell label={t.email} htmlFor="checkout-account-email">
          <Input
            id="checkout-account-email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={accountEmail ?? ""}
            aria-invalid={emailError ? true : undefined}
            className={emailError ? inputError : undefined}
          />
        </FieldShell>
        <a
          href="/account?section=addresses"
          className="mt-1.5 inline-block text-xs font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
        >
          {ab.manageCta}
        </a>
      </div>
    </div>
  );
}
