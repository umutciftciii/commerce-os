"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Card, Input, Select } from "@commerce-os/ui";
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

type PaymentDict = StorefrontDictionary["payment"];
type CheckoutDict = StorefrontDictionary["checkout"];

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
 * olabilecegi UI'da iddia edilmez.
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
  if (state.provider !== "MOCK") {
    return (
      <Card className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold text-slate-900">{t.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.subtitle}</p>
        <OrderSummaryBox state={state} t={t} c={c} />
        <Alert tone="warning" className="mt-6">
          <span className="font-semibold">{t.providerNotConfiguredTitle}.</span>{" "}
          {t.providerNotConfiguredDescription}
        </Alert>
        <div className="mt-6 text-center">
          <Link href="/products" className="text-sm font-medium text-brand-700 hover:text-brand-800">
            {t.backToStore}
          </Link>
        </div>
      </Card>
    );
  }

  const busy = phase.kind === "processing";

  return (
    <Card className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold text-slate-900">{t.title}</h1>
      <p className="mt-1 text-sm text-slate-500">{t.subtitle}</p>

      <OrderSummaryBox state={state} t={t} c={c} />

      {phase.kind === "requires_action" ? (
        <ThreeDsChallenge state={state} t={t} busy={busy} onResolve={(action) => void pay({ threeDsAction: action })} />
      ) : (
        <div className="mt-6">
          {phase.kind === "failed" ? (
            <Alert tone="error" className="mb-4">
              <span className="font-semibold">{phase.title}.</span> {phase.description}
            </Alert>
          ) : null}

          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t.cardSectionTitle}</h2>
          <div className="space-y-4">
            <Input
              label={t.cardHolderLabel}
              placeholder={t.cardHolderPlaceholder}
              value={holder}
              onChange={(event) => setHolder(event.target.value)}
              autoComplete="cc-name"
            />
            <div>
              <Input
                label={t.cardNumberLabel}
                placeholder={t.cardNumberPlaceholder}
                value={number}
                inputMode="numeric"
                autoComplete="cc-number"
                aria-invalid={errors.number ? true : undefined}
                className={errors.number ? "border-red-300 focus:border-red-400 focus:ring-red-100" : undefined}
                onChange={(event) => setNumber(formatCardNumber(event.target.value))}
              />
              {errors.number ? <p className="mt-1 text-xs text-red-600">{t.cardNumberInvalid}</p> : null}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input
                label={`${t.expiryLabel} ${t.expMonthPlaceholder}`}
                placeholder={t.expMonthPlaceholder}
                value={expMonth}
                inputMode="numeric"
                autoComplete="cc-exp-month"
                aria-invalid={errors.expiry ? true : undefined}
                className={errors.expiry ? "border-red-300 focus:border-red-400 focus:ring-red-100" : undefined}
                onChange={(event) => setExpMonth(event.target.value.replace(/\D+/g, "").slice(0, 2))}
              />
              <Input
                label={`${t.expiryLabel} ${t.expYearPlaceholder}`}
                placeholder={t.expYearPlaceholder}
                value={expYear}
                inputMode="numeric"
                autoComplete="cc-exp-year"
                aria-invalid={errors.expiry ? true : undefined}
                className={errors.expiry ? "border-red-300 focus:border-red-400 focus:ring-red-100" : undefined}
                onChange={(event) => setExpYear(event.target.value.replace(/\D+/g, "").slice(0, 4))}
              />
              <Input
                label={t.cvcLabel}
                placeholder={t.cvcPlaceholder}
                value={cvc}
                inputMode="numeric"
                autoComplete="cc-csc"
                aria-invalid={errors.cvc ? true : undefined}
                className={errors.cvc ? "border-red-300 focus:border-red-400 focus:ring-red-100" : undefined}
                onChange={(event) => setCvc(event.target.value.replace(/\D+/g, "").slice(0, 4))}
              />
            </div>
            {errors.cvc ? <p className="text-xs text-red-600">{t.cvcInvalid}</p> : null}

            {state.installmentEnabled && state.installmentOptions.length > 1 ? (
              <div className="space-y-3">
                <Select
                  label={t.installmentLabel}
                  value={String(installment)}
                  onChange={(event) => setInstallment(Number(event.target.value))}
                  options={state.installmentOptions.map((count) => ({
                    value: String(count),
                    label: count === 1 ? t.singleShot : format(t.installmentValue, { count }),
                  }))}
                />
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

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">{t.testCardsTitle}</p>
            <p className="mt-0.5 text-xs text-slate-400">{t.testCardsHint}</p>
            <div className="mt-3 space-y-1.5">
              {TEST_CARDS.filter((card) => state.scenarios.includes(card.scenario)).map((card) => (
                <div key={card.scenario} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-slate-700">{t.scenarios[card.scenario]}</span>
                    <span className="block font-mono text-xs text-slate-400">
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

          <Button className="mt-5 w-full" onClick={() => void pay()} disabled={busy}>
            {busy ? t.processing : t.pay}
          </Button>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link href="/products" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          {t.backToStore}
        </Link>
      </div>
    </Card>
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
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-slate-500">{t.orderLabel}</span>
        <span className="font-semibold text-slate-900">{state.orderNumber}</span>
      </div>
      {state.lines.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-slate-200 pt-2">
          {state.lines.map((line, index) => (
            <li key={`${line.title}-${index}`} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-slate-600">
                {line.title} · {line.variantTitle} · {line.quantity}×
              </span>
              <span className="shrink-0 font-medium text-slate-900">
                {money(line.lineTotalMinor, state.currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
        <span className="font-semibold text-slate-700">{c.grandTotal}</span>
        <span className="font-semibold text-slate-900">{money(state.totalMinor, state.currency)}</span>
      </div>
    </div>
  );
}

/**
 * F3B.2 — Zengin başarılı ödeme ekranı: sipariş no, ödeme durumu, ürünler, ödeme
 * bilgisi (sağlayıcı/yöntem/maskeli kart/taksit/işlem no/tarih), teslimat ve fatura
 * özeti. Maskeli kart dışında kart verisi gösterilmez.
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
    <Card className="mx-auto max-w-xl p-8">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
          ✓
        </div>
        <h1 className="text-xl font-semibold text-slate-900">{s.paidTitle}</h1>
        <p className="mt-1 text-sm text-slate-500">{s.paidSubtitle}</p>
      </div>

      <div className="mt-6 space-y-4 text-sm">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <Row label={s.orderNumberLabel} value={result.orderNumber} mono />
          <Row label={s.paymentStatusLabel} value={t.paidTitle} />
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <p className="mb-2 font-semibold text-slate-700">{s.itemsTitle}</p>
          <ul className="space-y-1.5">
            {lines.map((line, index) => (
              <li key={`${line.title}-${index}`} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-slate-700">{line.title}</span>
                  <span className="block text-xs text-slate-400">
                    {line.variantTitle} · {line.quantity}× · {money(line.unitPriceMinor, currency)}
                  </span>
                </span>
                <span className="shrink-0 font-medium text-slate-900">
                  {money(line.lineTotalMinor, currency)}
                </span>
              </li>
            ))}
          </ul>
          {receipt ? (
            <dl className="mt-3 space-y-1.5 border-t border-slate-200 pt-3">
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
              <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                <dt className="font-semibold text-slate-700">{c.grandTotal}</dt>
                <dd className="text-base font-semibold text-slate-900">
                  {money(receipt.totalMinor, currency)}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>

        {payment ? (
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-2 font-semibold text-slate-700">{s.paymentTitle}</p>
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
                <p className="text-xs text-slate-400">{s.noInterestNote}</p>
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
              <p className="mt-2 text-xs text-slate-400">{s.testModeNote}</p>
            ) : null}
          </div>
        ) : null}

        {receipt?.shippingAddress ? (
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-1 font-semibold text-slate-700">{s.shippingTitle}</p>
            <p className="text-slate-700">{receipt.shippingAddress.fullName}</p>
            <p className="text-slate-500">
              {receipt.shippingAddress.addressLine1}
              {receipt.shippingAddress.addressLine2 ? `, ${receipt.shippingAddress.addressLine2}` : ""}
            </p>
            <p className="text-slate-500">
              {receipt.shippingAddress.district ? `${receipt.shippingAddress.district}, ` : ""}
              {receipt.shippingAddress.city} {receipt.shippingAddress.postalCode ?? ""}
            </p>
          </div>
        ) : null}

        {receipt?.billing ? (
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-1 font-semibold text-slate-700">{s.billingTitle}</p>
            <p className="text-slate-700">
              {receipt.billing.type === "CORPORATE" ? s.billingCorporate : s.billingIndividual}
            </p>
            {receipt.billing.type === "CORPORATE" ? (
              <>
                {receipt.billing.companyName ? (
                  <p className="text-slate-500">{receipt.billing.companyName}</p>
                ) : null}
                {receipt.billing.taxOffice || receipt.billing.taxNumber ? (
                  <p className="text-slate-500">
                    {receipt.billing.taxOffice} {receipt.billing.taxNumber}
                  </p>
                ) : null}
              </>
            ) : receipt.billing.name ? (
              <p className="text-slate-500">{receipt.billing.name}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <Link href="/account?section=orders" className="block">
          <Button className="w-full">{s.goToOrders}</Button>
        </Link>
        <Link href="/products" className="block">
          <Button variant="secondary" className="w-full">
            {s.continueShopping}
          </Button>
        </Link>
      </div>
    </Card>
  );
}

/**
 * Taksit ozeti (odeme adimi): "N taksit × ₺X" + toplam + vade farksiz notu.
 * SAHTE FAIZ/ORAN YOK — toplam degismez; taksit basina esit bolunur.
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
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-slate-500">{t.installmentLabel}</span>
        <span className="font-semibold text-slate-900">
          {format(t.installmentSummaryValue, {
            count,
            amount: money(perInstallmentMinor(totalMinor, count), currency),
          })}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-slate-500">{t.installmentTotalLabel}</span>
        <span className="font-medium text-slate-700">{money(totalMinor, currency)}</span>
      </div>
      <p className="mt-1 text-xs text-emerald-600">{t.noInterestNote}</p>
    </div>
  );
}

/**
 * 3D Secure dogrulama simulasyonu (MOCK). Gercek banka redirect YOK; demo amacli
 * banka dogrulama ekranini taklit eder. Kullanici dogrulamayi basariyla tamamlar
 * (→ PAID) ya da basarisiz yapar (→ FAILED, tekrar deneme imkani). Bu adim olmadan
 * 3DS karti ANINDA PAID olmaz.
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
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white">
            3D
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">{t.threeDsTitle}</p>
            <p className="text-xs text-slate-500">{t.threeDsBankSim}</p>
          </div>
        </div>
        <dl className="mt-3 space-y-1 border-t border-indigo-200/70 pt-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">{t.orderLabel}</dt>
            <dd className="font-medium text-slate-900">{state.orderNumber}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">{t.totalLabel}</dt>
            <dd className="font-semibold text-slate-900">{money(state.totalMinor, state.currency)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">{t.threeDsDescription}</p>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Button className="w-full" onClick={() => onResolve("success")} disabled={busy}>
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
      <span className="text-slate-500">{label}</span>
      <span className={["font-medium text-slate-900", mono ? "font-mono text-xs" : ""].join(" ")}>
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
