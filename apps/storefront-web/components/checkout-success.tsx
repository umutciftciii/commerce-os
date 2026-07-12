import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { OrderConfirmationView } from "../lib/server/cart";
import { ButtonLink, Eyebrow, Heading, ProductMedia, Text } from "./ui";

type CheckoutDict = StorefrontDictionary["checkout"];

/**
 * Sunucu-tarafi order onay gorunumu (F3B.2). Order olusumundan sonra kullanici
 * SUNUCU-TARAFI redirect ile /checkout/success'e gelir; bu bilesen onayi sepetten
 * BAGIMSIZ olarak (kisa omurlu imzali cookie'den) render eder. Provider yoksa
 * gosterilen UNPAID/onay ekranidir; uygun TEST/MOCK provider varsa kullanici
 * bunun yerine /checkout/payment adimina yonlendirilir.
 *
 * Görsel katman vitrin DS'ine göçtü (yerel components/ui barrel + ink/surface/line/
 * accent token'lari, PLP/PDP/cart/checkout dili). "Başarı" rengi (emerald) NÖTR
 * ink'e indirildi; onay sinyali dolu ink disk + ✓ ikonuyla ayrisir. Aksan (menekse)
 * YALNIZCA tekil CTA'da ("Alışverişe devam et"). Cookie okuma/imza dogrulama,
 * order-özeti verisinin cookie'den okunma mantigi ve redirect/routing DEGISMEDI —
 * yalniz palet/tipografi.
 */
export function CheckoutSuccess({
  confirmation,
  t,
}: {
  confirmation: OrderConfirmationView;
  t: CheckoutDict;
}) {
  return (
    <div className="mx-auto max-w-xl border border-line bg-surface p-8 text-center">
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-base text-surface">
        ✓
      </div>
      <Heading as="h2" className="text-2xl sm:text-2xl">
        {t.success.title}
      </Heading>
      <Text className="mt-2">{t.success.subtitle}</Text>

      <div className="mt-6 border border-line bg-surface-muted p-4 text-left">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">{t.success.orderNumberLabel}</span>
          <span className="font-semibold text-ink">{confirmation.orderNumber}</span>
        </div>
        <ul className="mt-3 space-y-2.5 border-t border-line pt-3 text-sm">
          {confirmation.lines.map((line, index) => (
            <li key={`${line.title}-${index}`} className="flex items-center gap-3">
              {/* Dilim 6a — Onay satiri kapak thumbnail'i (drop-in ProductMedia).
                  handle=title: confirmation satirinda productSlug YOK (bilincli
                  pragmatik) — yer tutucu yine deterministik kalir. */}
              <div className="h-12 w-12 shrink-0 overflow-hidden border border-line bg-surface">
                <ProductMedia handle={line.title} title={line.title} imageUrl={line.imageUrl} />
              </div>
              <span className="min-w-0 flex-1 truncate text-ink-muted">
                {line.title} · {line.variantTitle} · {line.quantity}×
              </span>
              <span className="shrink-0 font-medium text-ink">{line.lineTotalLabel}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
          <Row label={t.subtotal} value={confirmation.subtotalLabel} />
          {confirmation.discountLabel ? (
            <Row label={t.discount} value={`−${confirmation.discountLabel}`} />
          ) : null}
          <Row
            label={t.shipping}
            value={confirmation.shippingIsFree ? t.shippingFree : confirmation.shippingLabel}
          />
          <div className="flex items-center justify-between border-t border-line pt-2">
            <dt className="font-semibold text-ink">{t.grandTotal}</dt>
            <dd className="text-base font-semibold text-ink">{confirmation.totalLabel}</dd>
          </div>
        </dl>
      </div>

      {confirmation.shippingOption ? (
        <div className="mt-4 border border-line p-4 text-left text-sm">
          <Eyebrow className="mb-1.5">{t.success.shippingOptionTitle}</Eyebrow>
          <p className="text-ink">
            {confirmation.shippingOption.providerName ?? confirmation.shippingOption.serviceName}
          </p>
          <p className="text-ink-muted">
            {confirmation.shippingOption.serviceName ?? ""}
            {confirmation.shippingOption.estimatedDelivery
              ? ` · ${confirmation.shippingOption.estimatedDelivery}`
              : ""}
          </p>
        </div>
      ) : null}

      {confirmation.shippingAddress ? (
        <div className="mt-4 border border-line p-4 text-left text-sm">
          <Eyebrow className="mb-1.5">{t.success.shippingTitle}</Eyebrow>
          <p className="text-ink">{confirmation.shippingAddress.fullName}</p>
          <p className="text-ink-muted">
            {confirmation.shippingAddress.addressLine1}
            {confirmation.shippingAddress.addressLine2
              ? `, ${confirmation.shippingAddress.addressLine2}`
              : ""}
          </p>
          <p className="text-ink-muted">
            {confirmation.shippingAddress.district ? `${confirmation.shippingAddress.district}, ` : ""}
            {confirmation.shippingAddress.city} {confirmation.shippingAddress.postalCode ?? ""}
          </p>
        </div>
      ) : null}

      {confirmation.billing ? (
        <div className="mt-4 border border-line p-4 text-left text-sm">
          <Eyebrow className="mb-1.5">{t.success.billingTitle}</Eyebrow>
          <p className="text-ink">
            {confirmation.billing.type === "CORPORATE"
              ? t.success.billingCorporate
              : t.success.billingIndividual}
          </p>
          {confirmation.billing.type === "CORPORATE" ? (
            <>
              {confirmation.billing.companyName ? (
                <p className="text-ink-muted">{confirmation.billing.companyName}</p>
              ) : null}
              {confirmation.billing.taxOffice || confirmation.billing.taxNumber ? (
                <p className="text-ink-muted">
                  {confirmation.billing.taxOffice} {confirmation.billing.taxNumber}
                </p>
              ) : null}
            </>
          ) : confirmation.billing.name ? (
            <p className="text-ink-muted">{confirmation.billing.name}</p>
          ) : null}
        </div>
      ) : null}

      {confirmation.paymentPending ? (
        <div
          role="status"
          className="mt-4 border border-line bg-surface-muted px-4 py-3 text-left text-sm text-ink"
        >
          {t.success.paymentPendingNote}
        </div>
      ) : null}

      <ButtonLink href="/products" variant="cta" className="mt-6 w-full">
        {t.success.continueShopping}
      </ButtonLink>
    </div>
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
