import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@commerce-os/ui";
import { format } from "@commerce-os/i18n";
import type { CustomerOrderDetail } from "@commerce-os/api-client";
import { getRequestLocale, getStorefrontDict } from "../../../../lib/i18n";
import { formatMinor } from "../../../../lib/money";
import { getCurrentCustomer, getCustomerOrderDetail } from "../../../../lib/server/customer";
import { canWriteReview, isReorderable, returnEligibility } from "../../../../lib/orders";
import { OrderStatusBadges } from "../../../../components/account/order-badges";
import { OrderActions } from "../../../../components/account/order-actions";
import { ShipmentTracking } from "../../../../components/account/shipment-tracking";

export const dynamic = "force-dynamic";

type OrdersDict = Awaited<ReturnType<typeof getStorefrontDict>>["account"]["orders"];

/**
 * TODO-079 — Müşteri-facing sipariş detayı (dedicated route). Oturum zorunlu;
 * yoksa /auth/login?next=... Gateway YALNIZ kendi siparişini döner (başka
 * müşteri/yok → null → notFound() → 404). Ödeme yalnız GÜVENLİ alanlarla
 * gösterilir (PAN/CVC/token YOK). Gerçek iade/destek/yorum akışı placeholder.
 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const customer = await getCurrentCustomer();
  const { orderNumber } = await params;
  if (!customer) {
    redirect(`/auth/login?next=/account/orders/${encodeURIComponent(orderNumber)}`);
  }
  const t = (await getStorefrontDict()).account;
  const locale = await getRequestLocale();
  const order = await getCustomerOrderDetail(orderNumber);
  if (!order) {
    notFound();
  }
  const o = t.orders;

  return (
    <Container className="py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/account?section=orders" className="text-sm text-brand-700 hover:underline">
          ← {o.detail.backToList}
        </Link>

        <header className="space-y-2">
          <h1 className="text-xl font-semibold text-slate-900">
            {o.orderNumber}: {order.orderNumber}
          </h1>
          <p className="text-sm text-slate-500">
            {new Date(order.createdAt).toLocaleDateString()} ·{" "}
            {format(o.items, { count: order.itemCount })}
          </p>
          <OrderStatusBadges
            t={o}
            status={order.status}
            paymentStatus={order.paymentStatus}
            fulfillmentStatus={order.fulfillmentStatus}
            shipmentStatus={order.shipment?.status ?? null}
          />
        </header>

        <section className="rounded-xl border border-slate-200 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{o.detail.productsTitle}</h2>
          <ul className="space-y-3">
            {order.lines.map((line) => (
              <li key={line.variantId} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm font-semibold text-slate-400"
                >
                  {line.title.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 text-sm text-slate-700">
                  <Link href={`/products/${line.productSlug}`} className="hover:underline">
                    {line.title}
                  </Link>
                  {line.variantTitle ? (
                    <span className="text-slate-400"> · {line.variantTitle}</span>
                  ) : null}
                  <span className="block text-xs text-slate-400">
                    {line.sku} · ×{line.quantity}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-slate-900">
                  {formatMinor(line.lineTotalMinor, order.currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <OrderSummary o={o} order={order} />

        {order.shipment ? (
          <ShipmentTracking shipment={order.shipment} t={o.detail.tracking} locale={locale} />
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ShippingBlock o={o} order={order} />
          <PaymentBlock o={o} order={order} />
        </div>

        <BillingBlock o={o} order={order} />

        <section className="rounded-xl border border-slate-200 p-4">
          <OrderActions
            orderNumber={order.orderNumber}
            t={o}
            reorderable={isReorderable(order)}
            returnState={returnEligibility(order)}
            canReview={canWriteReview(order)}
            layout="detail"
          />
        </section>
      </div>
    </Container>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={strong ? "font-semibold text-slate-900" : "text-slate-700"}>{value}</span>
    </div>
  );
}

function OrderSummary({ o, order }: { o: OrdersDict; order: CustomerOrderDetail }) {
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{o.detail.summary}</h2>
      <div className="space-y-2">
        <Row label={o.detail.subtotal} value={formatMinor(order.subtotalMinor, order.currency)} />
        {order.discountMinor > 0 ? (
          <Row
            label={o.detail.discount}
            value={`- ${formatMinor(order.discountMinor, order.currency)}`}
          />
        ) : null}
        <Row
          label={o.detail.shipping}
          value={
            order.shippingMinor === 0
              ? o.detail.freeShipping
              : formatMinor(order.shippingMinor, order.currency)
          }
        />
        <Row label={o.detail.tax} value={formatMinor(order.taxMinor, order.currency)} />
        <div className="border-t border-slate-100 pt-2">
          <Row label={o.detail.total} value={formatMinor(order.totalMinor, order.currency)} strong />
        </div>
      </div>
    </section>
  );
}

function ShippingBlock({ o, order }: { o: OrdersDict; order: CustomerOrderDetail }) {
  const a = order.shippingAddress;
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">{o.detail.shippingAddress}</h2>
      {a ? (
        <address className="text-sm not-italic leading-relaxed text-slate-600">
          {a.fullName}
          <br />
          {a.addressLine1}
          {a.addressLine2 ? (
            <>
              <br />
              {a.addressLine2}
            </>
          ) : null}
          <br />
          {[a.district, a.city, a.postalCode].filter(Boolean).join(", ")}
          {a.phone ? (
            <>
              <br />
              {a.phone}
            </>
          ) : null}
        </address>
      ) : (
        <p className="text-sm text-slate-400">—</p>
      )}
    </section>
  );
}

function PaymentBlock({ o, order }: { o: OrdersDict; order: CustomerOrderDetail }) {
  const p = order.payment;
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">{o.detail.paymentInfo}</h2>
      {p ? (
        <div className="space-y-1.5">
          <Row label={o.detail.provider} value={p.provider} />
          {p.cardBrand || p.cardLast4 ? (
            <Row
              label={o.detail.card}
              value={`${p.cardBrand ?? ""} •••• ${p.cardLast4 ?? "----"}`.trim()}
            />
          ) : null}
          <Row
            label={o.detail.installment}
            value={
              p.installmentCount > 1
                ? format(o.detail.installmentCount, { count: p.installmentCount })
                : o.detail.singlePayment
            }
          />
          {p.transactionId ? <Row label={o.detail.transaction} value={p.transactionId} /> : null}
          {p.paidAt ? (
            <Row label={o.detail.paidAt} value={new Date(p.paidAt).toLocaleDateString()} />
          ) : null}
          {p.threeDsApplied ? (
            <p className="text-xs text-slate-400">{o.detail.threeDs}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-400">{o.detail.noPayment}</p>
      )}
    </section>
  );
}

function BillingBlock({ o, order }: { o: OrdersDict; order: CustomerOrderDetail }) {
  const b = order.billing;
  if (!b) return null;
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">{o.detail.billing}</h2>
      <div className="space-y-1.5 text-sm text-slate-600">
        <p>{b.type === "CORPORATE" ? o.detail.corporate : o.detail.individual}</p>
        {b.companyName ? <p>{b.companyName}</p> : null}
        {b.name ? <p>{b.name}</p> : null}
        {b.taxOffice ? <p>{b.taxOffice}</p> : null}
        {b.taxId ? <p className="text-slate-400">{b.taxId}</p> : null}
      </div>
    </section>
  );
}
