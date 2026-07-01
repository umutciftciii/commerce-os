import Link from "next/link";
import { Alert, Button, Card } from "@commerce-os/ui";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { OrderConfirmationView } from "../lib/server/cart";

type CheckoutDict = StorefrontDictionary["checkout"];

/**
 * Sunucu-tarafi order onay gorunumu (F3B.2). Order olusumundan sonra kullanici
 * SUNUCU-TARAFI redirect ile /checkout/success'e gelir; bu bilesen onayi sepetten
 * BAGIMSIZ olarak (kisa omurlu imzali cookie'den) render eder. Provider yoksa
 * gosterilen UNPAID/onay ekranidir; uygun TEST/MOCK provider varsa kullanici
 * bunun yerine /checkout/payment adimina yonlendirilir.
 */
export function CheckoutSuccess({
  confirmation,
  t,
}: {
  confirmation: OrderConfirmationView;
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

      {confirmation.shippingOption ? (
        <div className="mt-4 rounded-xl border border-slate-200 p-4 text-left text-sm">
          <p className="mb-1 font-semibold text-slate-700">{t.success.shippingOptionTitle}</p>
          <p className="text-slate-700">
            {confirmation.shippingOption.providerName ?? confirmation.shippingOption.serviceName}
          </p>
          <p className="text-slate-500">
            {confirmation.shippingOption.serviceName ?? ""}
            {confirmation.shippingOption.estimatedDelivery
              ? ` · ${confirmation.shippingOption.estimatedDelivery}`
              : ""}
          </p>
        </div>
      ) : null}

      {confirmation.shippingAddress ? (
        <div className="mt-4 rounded-xl border border-slate-200 p-4 text-left text-sm">
          <p className="mb-1 font-semibold text-slate-700">{t.success.shippingTitle}</p>
          <p className="text-slate-700">{confirmation.shippingAddress.fullName}</p>
          <p className="text-slate-500">
            {confirmation.shippingAddress.addressLine1}
            {confirmation.shippingAddress.addressLine2
              ? `, ${confirmation.shippingAddress.addressLine2}`
              : ""}
          </p>
          <p className="text-slate-500">
            {confirmation.shippingAddress.district ? `${confirmation.shippingAddress.district}, ` : ""}
            {confirmation.shippingAddress.city} {confirmation.shippingAddress.postalCode ?? ""}
          </p>
        </div>
      ) : null}

      {confirmation.billing ? (
        <div className="mt-4 rounded-xl border border-slate-200 p-4 text-left text-sm">
          <p className="mb-1 font-semibold text-slate-700">{t.success.billingTitle}</p>
          <p className="text-slate-700">
            {confirmation.billing.type === "CORPORATE"
              ? t.success.billingCorporate
              : t.success.billingIndividual}
          </p>
          {confirmation.billing.type === "CORPORATE" ? (
            <>
              {confirmation.billing.companyName ? (
                <p className="text-slate-500">{confirmation.billing.companyName}</p>
              ) : null}
              {confirmation.billing.taxOffice || confirmation.billing.taxNumber ? (
                <p className="text-slate-500">
                  {confirmation.billing.taxOffice} {confirmation.billing.taxNumber}
                </p>
              ) : null}
            </>
          ) : confirmation.billing.name ? (
            <p className="text-slate-500">{confirmation.billing.name}</p>
          ) : null}
        </div>
      ) : null}

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
