"use client";

import { useState } from "react";
import Link from "next/link";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { format } from "@commerce-os/i18n";
import type {
  PublicOrderReceipt,
  PublicPaymentResult,
  PublicPaymentScenario,
  PublicPaymentState,
} from "@commerce-os/api-client";
import { luhnValid } from "@commerce-os/api-client/validators";
import { submitTestPaymentAction } from "../lib/server/cart-actions";
import {
  Button,
  ButtonLink,
  Eyebrow,
  Field as FieldShell,
  Heading,
  Input,
  Select,
  Subheading,
  Text,
} from "./ui";

type PaymentDict = StorefrontDictionary["payment"];
type CheckoutDict = StorefrontDictionary["checkout"];

// Hata durumunda kontrol cercevesi. `cn` tailwind-merge DEGIL (saf joiner); bu yuzden
// taban `border-line`/`focus:ring-ink` uzerine yazmak icin `!` important ile
// deterministik kilinir (vitrin field.tsx hata dili: kirmizi ayrisir; checkout-form ile ayni).
const inputError = "!border-red-500 focus:!border-red-500 focus:!ring-red-400";

// DS bolum yuzeyi: duz hairline kart (rounded-none, golge yok) — PLP/PDP/cart/checkout dili.
const cardSurface = "mx-auto max-w-xl border border-line bg-surface p-8";

/** Public test kartlari (gizli DEGIL). "Kullan" ile form otomatik doldurulur. */
const TEST_CARDS: Array<{ scenario: PublicPaymentScenario; number: string }> = [
  { scenario: "success", number: "5528790000000008" },
  { scenario: "three_ds_required", number: "5890040000000016" },
  { scenario: "failure", number: "4000000000000002" },
  { scenario: "insufficient_funds", number: "4111111111111111" },
  { scenario: "cancelled", number: "5555555555554444" },
];

function money(minor: number, currency: string): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(minor / 100);
}

/**
 * Taksit basina tutar (gosterim). GERCEK FAIZ/ORAN MOTORU YOK — toplam degismez,
 * yalnizca esit bolunur (vade farksiz). Sade tam-bolme; son taksitte kurus farki
 * olabilecegi UI'da iddia edilmez. Bkz. todo.md (taksit gosterim mock notu).
 */
function perInstallmentMinor(totalMinor: number, count: number): number {
  return Math.round(totalMinor / count);
}

function formatCardNumber(value: string): string {
  return value
    .replace(/\D+/g, "")
    .slice(0, 19)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

type Phase =
  | { kind: "form" }
  | { kind: "processing" }
  | { kind: "paid"; result: PublicPaymentResult }
  | { kind: "failed"; title: string; description: string }
  | { kind: "requires_action" };

/**
 * F3B.2 — Test ödeme ekranı. Gerçekçi kart formu MOCK adapter'ı sürer; senaryo kart
 * numarasından türetilir. Gerçek tahsilat YOK. FULL PAN/CVC sunucuya gönderilir ama
 * DB'ye/loglara/response'a yazılmaz (yalnız marka + son 4 gözlemlenir). Gerçek
 * provider (IYZICO/STRIPE/PAYTR) seçiliyse submit kontrollü hata döner (fake yok).
 *
 * Görsel katman vitrin DS'ine göçtü (yerel components/ui barrel + ink/surface/line/
 * accent token'lari, PLP/PDP/cart/checkout dili). "Başarı" (emerald) ve "3DS" (indigo)
 * renkleri NÖTR ink'e indirildi; sinyaller dolu ink disk/rozet + ikon ile ayrışır.
 * Aksan (menekşe) YALNIZCA tekil birincil CTA'da (her fazda tek: ödeme submit /
 * 3DS onay / siparişlerim). MOCK-first guard (provider≠MOCK), gösterilen hata mesajı,
 * POST /payment çağrısı, taksit hesabı ve redirect zinciri DEĞİŞMEDİ — yalniz palet/tipografi.
 */
export function PaymentTester({
  state,
  orderId,
  token,
  t,
  c,
}: {
  state: PublicPaymentState;
  orderId: string;
  token: string;
  t: PaymentDict;
  c: CheckoutDict;
}) {
  const [holder, setHolder] = useState("");
  const [number, setNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvc, setCvc] = useState("");
  const [installment, setInstallment] = useState(1);
  const [errors, setErrors] = useState<{ number?: boolean; expiry?: boolean; cvc?: boolean }>({});

  const initialPhase: Phase =
    state.paymentStatus === "PAID" || state.paymentStatus === "AUTHORIZED"
      ? { kind: "paid", result: syntheticResultFromState(state) }
      : state.attempt.status === "REQUIRES_ACTION"
        ? { kind: "requires_action" }
        : { kind: "form" };
  const [phase, setPhase] = useState<Phase>(initialPhase);

  function fillTestCard(cardNumber: string) {
    setHolder((current) => current || "TEST KART");
    setNumber(formatCardNumber(cardNumber));
    setExpMonth("12");
    setExpYear("30");
    setCvc("123");
    setErrors({});
  }

  function validate(): boolean {
    const digits = number.replace(/\D+/g, "");
    const monthNum = Number(expMonth);
    const yearNum = Number(expYear);
    const next: typeof errors = {};
    if (!luhnValid(digits)) next.number = true;
    if (!(monthNum >= 1 && monthNum <= 12) || !(yearNum >= 0) || expYear.length === 0) next.expiry = true;
    if (!/^[0-9]{3,4}$/.test(cvc)) next.cvc = true;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // threeDsAction verildiginde bu cagri 3DS dogrulama adimidir (kart yeniden
  // dogrulanmaz; ilk submit'teki kart state'i korunur). "fail" → dogrulama
  // basarisiz; "success"/yok → tamam. Aksi halde ilk odeme submit'idir.
  async function pay(opts: { threeDsAction?: "success" | "fail" } = {}) {
    const isThreeDsStep = Boolean(opts.threeDsAction);
    if (!isThreeDsStep && !validate()) return;
    setPhase({ kind: "processing" });
    const yearNum = Number(expYear);
    const outcome = await submitTestPaymentAction(orderId, token, {
      card: {
        holder: holder || "TEST",
        number: number.replace(/\D+/g, ""),
        expMonth: Number(expMonth),
        expYear: yearNum < 100 ? 2000 + yearNum : yearNum,
        cvc,
      },
      installmentCount: installment,
      ...(opts.threeDsAction ? { threeDsAction: opts.threeDsAction } : {}),
    });
    if (outcome.status !== "ok") {
      const reason = outcome.status === "error" ? outcome.reason : "error";
      setPhase(failurePhaseFromReason(reason, t));
      return;
    }
    const result = outcome.result;
    const status = result.attempt.status;
    if (status === "PAID" || status === "AUTHORIZED") {
      setPhase({ kind: "paid", result });
    } else if (status === "REQUIRES_ACTION") {
      setPhase({ kind: "requires_action" });
    } else if (status === "CANCELLED") {
      setPhase({ kind: "failed", title: t.cancelledTitle, description: t.failedDescription });
    } else if (result.attempt.failureCode === "THREE_DS_FAILED") {
      setPhase({ kind: "failed", title: t.threeDsFailedTitle, description: t.threeDsFailedDescription });
    } else {
      setPhase({ kind: "failed", title: t.failedTitle, description: t.failedDescription });
    }
  }

  if (phase.kind === "paid") {
    return <PaymentSuccess result={phase.result} state={state} t={t} c={c} />;
  }

  // Bu fazda test ödemeyi yalnızca MOCK adapter tamamlayabilir. Attempt provider'ı
  // MOCK değilse kart formu/ödeme butonu GÖSTERİLMEZ (boşuna submit edilmesin);
  // bunun yerine net bir bilgilendirme + mağazaya dönüş gösterilir. Normalde
  // checkout MOCK'u önceliklendirdiğinden bu durum yalnızca MOCK hiç yokken oluşur.
  // NOT (DS göçü): koşul (provider !== "MOCK") ve gösterilen mesaj DEĞİŞMEDİ; yalnız
  // Alert → hairline nötr not kutusu (role="alert") olarak yeniden biçimlendirildi.
  if (state.provider !== "MOCK") {
    return (
      <div className={cardSurface}>
        <Heading as="h1" className="text-2xl sm:text-2xl">
          {t.title}
        </Heading>
        <Text className="mt-2">{t.subtitle}</Text>
        <OrderSummaryBox state={state} t={t} c={c} />
        <div
          role="alert"
          className="mt-6 border border-line-strong bg-surface-muted px-4 py-3 text-sm text-ink"
        >
          <span className="font-semibold">{t.providerNotConfiguredTitle}.</span>{" "}
          {t.providerNotConfiguredDescription}
        </div>
        <div className="mt-6 text-center">
          <Link
            href="/products"
            className="text-sm font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
          >
            {t.backToStore}
          </Link>
        </div>
      </div>
    );
  }

  const busy = phase.kind === "processing";

  return (
    <div className={cardSurface}>
      <Heading as="h1" className="text-2xl sm:text-2xl">
        {t.title}
      </Heading>
      <Text className="mt-2">{t.subtitle}</Text>

      <OrderSummaryBox state={state} t={t} c={c} />

      {phase.kind === "requires_action" ? (
        <ThreeDsChallenge state={state} t={t} busy={busy} onResolve={(action) => void pay({ threeDsAction: action })} />
      ) : (
        <div className="mt-6">
          {phase.kind === "failed" ? (
            <div role="alert" className="mb-4 border border-line bg-surface-muted px-4 py-3 text-sm text-red-600">
              <span className="font-semibold">{phase.title}.</span> {phase.description}
            </div>
          ) : null}

          <Subheading as="h2" className="mb-3">
            {t.cardSectionTitle}
          </Subheading>
          <div className="space-y-4">
            <FieldShell label={t.cardHolderLabel} htmlFor="payment-holder">
              <Input
                id="payment-holder"
                placeholder={t.cardHolderPlaceholder}
                value={holder}
                onChange={(event) => setHolder(event.target.value)}
                autoComplete="cc-name"
              />
            </FieldShell>
            <FieldShell
              label={t.cardNumberLabel}
              htmlFor="payment-number"
              error={errors.number ? t.cardNumberInvalid : undefined}
            >
              <Input
                id="payment-number"
                placeholder={t.cardNumberPlaceholder}
                value={number}
                inputMode="numeric"
                autoComplete="cc-number"
                aria-invalid={errors.number ? true : undefined}
                className={errors.number ? inputError : undefined}
                onChange={(event) => setNumber(formatCardNumber(event.target.value))}
              />
            </FieldShell>
            <div className="grid grid-cols-3 gap-3">
              <FieldShell label={`${t.expiryLabel} ${t.expMonthPlaceholder}`} htmlFor="payment-exp-month">
                <Input
                  id="payment-exp-month"
                  placeholder={t.expMonthPlaceholder}
                  value={expMonth}
                  inputMode="numeric"
                  autoComplete="cc-exp-month"
                  aria-invalid={errors.expiry ? true : undefined}
                  className={errors.expiry ? inputError : undefined}
                  onChange={(event) => setExpMonth(event.target.value.replace(/\D+/g, "").slice(0, 2))}
                />
              </FieldShell>
              <FieldShell label={`${t.expiryLabel} ${t.expYearPlaceholder}`} htmlFor="payment-exp-year">
                <Input
                  id="payment-exp-year"
                  placeholder={t.expYearPlaceholder}
                  value={expYear}
                  inputMode="numeric"
                  autoComplete="cc-exp-year"
                  aria-invalid={errors.expiry ? true : undefined}
                  className={errors.expiry ? inputError : undefined}
                  onChange={(event) => setExpYear(event.target.value.replace(/\D+/g, "").slice(0, 4))}
                />
              </FieldShell>
              <FieldShell label={t.cvcLabel} htmlFor="payment-cvc">
                <Input
                  id="payment-cvc"
                  placeholder={t.cvcPlaceholder}
                  value={cvc}
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  aria-invalid={errors.cvc ? true : undefined}
                  className={errors.cvc ? inputError : undefined}
                  onChange={(event) => setCvc(event.target.value.replace(/\D+/g, "").slice(0, 4))}
                />
              </FieldShell>
            </div>
            {errors.cvc ? <p className="text-xs text-red-600">{t.cvcInvalid}</p> : null}

            {state.installmentEnabled && state.installmentOptions.length > 1 ? (
              <div className="space-y-3">
                <FieldShell label={t.installmentLabel} htmlFor="payment-installment">
                  <Select
                    id="payment-installment"
                    value={String(installment)}
                    onChange={(event) => setInstallment(Number(event.target.value))}
                  >
                    {state.installmentOptions.map((count) => (
                      <option key={count} value={String(count)}>
                        {count === 1 ? t.singleShot : format(t.installmentValue, { count })}
                      </option>
                    ))}
                  </Select>
                </FieldShell>
                {installment > 1 ? (
                  <InstallmentSummary
                    totalMinor={state.totalMinor}
                    currency={state.currency}
                    count={installment}
                    t={t}
                  />
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-5 border border-line bg-surface-muted p-4">
            <p className="text-sm font-medium text-ink">{t.testCardsTitle}</p>
            <p className="mt-0.5 text-xs text-ink-subtle">{t.testCardsHint}</p>
            <div className="mt-3 space-y-1.5">
              {TEST_CARDS.filter((card) => state.scenarios.includes(card.scenario)).map((card) => (
                <div key={card.scenario} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{t.scenarios[card.scenario]}</span>
                    <span className="block font-mono text-xs text-ink-subtle">
                      {formatCardNumber(card.number)}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => fillTestCard(card.number)}
                  >
                    {t.useTestCard}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Bu fazın TEKIL birincil eylemi: ödeme submit → aksan (variant="cta"). */}
          <Button variant="cta" className="mt-5 w-full" onClick={() => void pay()} disabled={busy}>
            {busy ? t.processing : t.pay}
          </Button>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link
          href="/products"
          className="text-sm font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
        >
          {t.backToStore}
        </Link>
      </div>
    </div>
  );
}

function OrderSummaryBox({
  state,
  t,
  c,
}: {
  state: PublicPaymentState;
  t: PaymentDict;
  c: CheckoutDict;
}) {
  return (
    <div className="mt-5 border border-line bg-surface-muted p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-ink-muted">{t.orderLabel}</span>
        <span className="font-semibold text-ink">{state.orderNumber}</span>
      </div>
      {state.lines.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-line pt-2">
          {state.lines.map((line, index) => (
            <li key={`${line.title}-${index}`} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-ink-muted">
                {line.title} · {line.variantTitle} · {line.quantity}×
              </span>
              <span className="shrink-0 font-medium text-ink">
                {money(line.lineTotalMinor, state.currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
        <span className="font-semibold text-ink">{c.grandTotal}</span>
        <span className="font-semibold text-ink">{money(state.totalMinor, state.currency)}</span>
      </div>
    </div>
  );
}

/**
 * F3B.2 — Zengin başarılı ödeme ekranı: sipariş no, ödeme durumu, ürünler, ödeme
 * bilgisi (sağlayıcı/yöntem/maskeli kart/taksit/işlem no/tarih), teslimat ve fatura
 * özeti. Maskeli kart dışında kart verisi gösterilmez. "Başarı" rengi (emerald) NÖTR
 * ink'e indirildi; onay sinyali dolu ink disk + ✓ ile ayrışır (checkout-success dili).
 */
function PaymentSuccess({
  result,
  state,
  t,
  c,
}: {
  result: PublicPaymentResult;
  state: PublicPaymentState;
  t: PaymentDict;
  c: CheckoutDict;
}) {
  const s = c.success;
  const receipt: PublicOrderReceipt | null = result.receipt;
  const currency = receipt?.currency ?? state.currency;
  const lines = receipt?.lines ?? state.lines;
  const payment = receipt?.payment;
  const card = payment?.cardLast4
    ? `${payment.cardBrand ?? ""} •••• ${payment.cardLast4}`.trim()
    : null;

  return (
    <div className={cardSurface}>
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-base text-surface">
          ✓
        </div>
        <Heading as="h1" className="text-2xl sm:text-2xl">
          {s.paidTitle}
        </Heading>
        <Text className="mt-2">{s.paidSubtitle}</Text>
      </div>

      <div className="mt-6 space-y-4 text-sm">
        <div className="border border-line bg-surface-muted p-4">
          <Row label={s.orderNumberLabel} value={result.orderNumber} mono />
          <Row label={s.paymentStatusLabel} value={t.paidTitle} />
        </div>

        <div className="border border-line p-4">
          <Eyebrow className="mb-2">{s.itemsTitle}</Eyebrow>
          <ul className="space-y-1.5">
            {lines.map((line, index) => (
              <li key={`${line.title}-${index}`} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{line.title}</span>
                  <span className="block text-xs text-ink-subtle">
                    {line.variantTitle} · {line.quantity}× · {money(line.unitPriceMinor, currency)}
                  </span>
                </span>
                <span className="shrink-0 font-medium text-ink">
                  {money(line.lineTotalMinor, currency)}
                </span>
              </li>
            ))}
          </ul>
          {receipt ? (
            <dl className="mt-3 space-y-1.5 border-t border-line pt-3">
              <Row label={c.subtotal} value={money(receipt.subtotalMinor, currency)} />
              {receipt.discountMinor > 0 ? (
                <Row label={c.discount} value={`−${money(receipt.discountMinor, currency)}`} />
              ) : null}
              <Row
                label={c.shipping}
                value={
                  receipt.shippingMinor === 0 ? c.shippingFree : money(receipt.shippingMinor, currency)
                }
              />
              <div className="flex items-center justify-between border-t border-line pt-2">
                <dt className="font-semibold text-ink">{c.grandTotal}</dt>
                <dd className="text-base font-semibold text-ink">
                  {money(receipt.totalMinor, currency)}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>

        {payment ? (
          <div className="border border-line p-4">
            <Eyebrow className="mb-2">{s.paymentTitle}</Eyebrow>
            <Row label={s.providerLabel} value={`${payment.provider} · ${payment.mode}`} />
            <Row label={s.methodLabel} value={payment.method} />
            {card ? <Row label={s.cardLabel} value={card} mono /> : null}
            {payment.threeDsApplied ? <Row label={s.threeDsLabel} value={s.threeDsVerified} /> : null}
            {payment.installmentCount > 1 ? (
              <>
                <Row
                  label={s.installmentLabel}
                  value={format(s.installmentSummaryValue, {
                    count: payment.installmentCount,
                    amount: money(
                      perInstallmentMinor(receipt?.totalMinor ?? state.totalMinor, payment.installmentCount),
                      currency,
                    ),
                  })}
                />
                <Row label={s.total} value={money(receipt?.totalMinor ?? state.totalMinor, currency)} />
                <p className="text-xs text-ink-subtle">{s.noInterestNote}</p>
              </>
            ) : (
              <Row label={s.installmentLabel} value={s.singleShot} />
            )}
            {payment.providerReference ? (
              <Row label={s.transactionLabel} value={payment.providerReference} mono />
            ) : null}
            {payment.paidAt ? (
              <Row label={s.paidAtLabel} value={new Date(payment.paidAt).toLocaleString("tr-TR")} />
            ) : null}
            {payment.mode === "TEST" ? (
              <p className="mt-2 text-xs text-ink-subtle">{s.testModeNote}</p>
            ) : null}
          </div>
        ) : null}

        {receipt?.shippingAddress ? (
          <div className="border border-line p-4">
            <Eyebrow className="mb-1.5">{s.shippingTitle}</Eyebrow>
            <p className="text-ink">{receipt.shippingAddress.fullName}</p>
            <p className="text-ink-muted">
              {receipt.shippingAddress.addressLine1}
              {receipt.shippingAddress.addressLine2 ? `, ${receipt.shippingAddress.addressLine2}` : ""}
            </p>
            <p className="text-ink-muted">
              {receipt.shippingAddress.district ? `${receipt.shippingAddress.district}, ` : ""}
              {receipt.shippingAddress.city} {receipt.shippingAddress.postalCode ?? ""}
            </p>
          </div>
        ) : null}

        {receipt?.billing ? (
          <div className="border border-line p-4">
            <Eyebrow className="mb-1.5">{s.billingTitle}</Eyebrow>
            <p className="text-ink">
              {receipt.billing.type === "CORPORATE" ? s.billingCorporate : s.billingIndividual}
            </p>
            {receipt.billing.type === "CORPORATE" ? (
              <>
                {receipt.billing.companyName ? (
                  <p className="text-ink-muted">{receipt.billing.companyName}</p>
                ) : null}
                {receipt.billing.taxOffice || receipt.billing.taxNumber ? (
                  <p className="text-ink-muted">
                    {receipt.billing.taxOffice} {receipt.billing.taxNumber}
                  </p>
                ) : null}
              </>
            ) : receipt.billing.name ? (
              <p className="text-ink-muted">{receipt.billing.name}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {/* Bu fazın TEKIL birincil eylemi: siparişlerim → aksan (variant="cta"). */}
        <ButtonLink href="/account?section=orders" variant="cta" className="w-full">
          {s.goToOrders}
        </ButtonLink>
        <ButtonLink href="/products" variant="secondary" className="w-full">
          {s.continueShopping}
        </ButtonLink>
      </div>
    </div>
  );
}

/**
 * Taksit ozeti (odeme adimi): "N taksit × ₺X" + toplam + vade farksiz notu.
 * SAHTE FAIZ/ORAN YOK — toplam degismez; taksit basina esit bolunur (bkz. todo.md).
 */
function InstallmentSummary({
  totalMinor,
  currency,
  count,
  t,
}: {
  totalMinor: number;
  currency: string;
  count: number;
  t: PaymentDict;
}) {
  return (
    <div className="border border-line bg-surface-muted p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-ink-muted">{t.installmentLabel}</span>
        <span className="font-semibold text-ink">
          {format(t.installmentSummaryValue, {
            count,
            amount: money(perInstallmentMinor(totalMinor, count), currency),
          })}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-ink-muted">{t.installmentTotalLabel}</span>
        <span className="font-medium text-ink">{money(totalMinor, currency)}</span>
      </div>
      <p className="mt-1 text-xs text-ink-subtle">{t.noInterestNote}</p>
    </div>
  );
}

/**
 * 3D Secure dogrulama simulasyonu (MOCK). Gercek banka redirect YOK; demo amacli
 * banka dogrulama ekranini taklit eder. Kullanici dogrulamayi basariyla tamamlar
 * (→ PAID) ya da basarisiz yapar (→ FAILED, tekrar deneme imkani). Bu adim olmadan
 * 3DS karti ANINDA PAID olmaz. DS: indigo → NÖTR; "3D" sinyali dolu ink rozet ile ayrisir.
 */
function ThreeDsChallenge({
  state,
  t,
  busy,
  onResolve,
}: {
  state: PublicPaymentState;
  t: PaymentDict;
  busy: boolean;
  onResolve: (action: "success" | "fail") => void;
}) {
  return (
    <div className="mt-6">
      <div className="border border-line-strong bg-surface-muted p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-none bg-ink text-xs font-bold text-surface">
            3D
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">{t.threeDsTitle}</p>
            <p className="text-xs text-ink-muted">{t.threeDsBankSim}</p>
          </div>
        </div>
        <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-ink-muted">{t.orderLabel}</dt>
            <dd className="font-medium text-ink">{state.orderNumber}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-ink-muted">{t.totalLabel}</dt>
            <dd className="font-semibold text-ink">{money(state.totalMinor, state.currency)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink-muted">{t.threeDsDescription}</p>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {/* Bu fazın TEKIL birincil eylemi: 3DS onay → aksan (variant="cta"). */}
        <Button variant="cta" className="w-full" onClick={() => onResolve("success")} disabled={busy}>
          {busy ? t.processing : t.threeDsCompleteSuccess}
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => onResolve("fail")}
          disabled={busy}
        >
          {t.threeDsCompleteFail}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-ink-muted">{label}</span>
      <span className={["font-medium text-ink", mono ? "font-mono text-xs" : ""].join(" ")}>
        {value}
      </span>
    </div>
  );
}

/** Sayfa zaten PAID iken (yeniden ziyaret) state'ten minimal bir sonuc kurar. */
function syntheticResultFromState(state: PublicPaymentState): PublicPaymentResult {
  return {
    orderNumber: state.orderNumber,
    paymentStatus: state.paymentStatus,
    attempt: {
      id: state.attempt.id,
      status: state.attempt.status,
      threeDsApplied: state.attempt.threeDsApplied,
      failureCode: null,
      failureMessage: null,
      cardBrand: null,
      cardLast4: null,
      installmentCount: 1,
      providerReference: null,
    },
    requiresAction: false,
    receipt: null,
  };
}

function failurePhaseFromReason(reason: string, t: PaymentDict): Phase {
  switch (reason) {
    case "CARD_NUMBER_INVALID":
      return { kind: "failed", title: t.failedTitle, description: t.cardNumberInvalid };
    case "CARD_EXPIRED":
      return { kind: "failed", title: t.failedTitle, description: t.cardExpired };
    case "PAYMENT_PROVIDER_NOT_CONFIGURED":
      return {
        kind: "failed",
        title: t.providerNotConfiguredTitle,
        description: t.providerNotConfiguredDescription,
      };
    case "PAYMENT_TOKEN_INVALID":
      return { kind: "failed", title: t.invalidTitle, description: t.invalidDescription };
    default:
      return { kind: "failed", title: t.failedTitle, description: t.failedDescription };
  }
}
