"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  PageHeader,
  SectionCard,
  SkeletonRows,
  useLocale,
} from "@commerce-os/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type { Order } from "@commerce-os/api-client";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../../lib/client/format";
import {
  canCancel,
  canPlace,
  FULFILLMENT_STATUS_TONES,
  ORDER_STATUS_TONES,
  PAYMENT_STATUS_TONES,
  RESERVATION_STATUS_TONES,
  type FulfillmentStatus,
  type OrderStatus,
  type PaymentStatus,
  type ReservationStatus,
} from "../order-shared";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; order: Order };

function MoneyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}

/**
 * Sipariş detayi: modal degil, kendi route'unda (`/orders/[id]`) tam sayfa.
 * Uzun icerik (kalemler, tutar, adresler, rezervasyonlar, olaylar) dogal sayfa
 * scroll'u ile akar; yasam dongusu aksiyonlari PageHeader'da yer alir.
 */
export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.orders;
  const c = dict.common;
  const d = t.detail;
  const statusLabels = t.statusLabels as Record<OrderStatus, string>;
  const paymentLabels = t.paymentLabels as Record<PaymentStatus, string>;
  const fulfillmentLabels = t.fulfillmentLabels as Record<FulfillmentStatus, string>;
  const reservationLabels = t.reservationStatusLabels as Record<ReservationStatus, string>;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [acting, setActing] = useState<null | "place" | "cancel">(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", order: await storeApi.getOrder(orderId) });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [orderId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const order = state.status === "ready" ? state.order : null;

  const runAction = useCallback(
    async (type: "place" | "cancel") => {
      setActionError(null);
      setActing(type);
      try {
        const updated =
          type === "place"
            ? await storeApi.placeOrder(orderId)
            : await storeApi.cancelOrder(orderId);
        setState({ status: "ready", order: updated });
      } catch (error) {
        setActionError(messageForError(error, locale));
      } finally {
        setActing(null);
      }
    },
    [orderId, locale],
  );

  const title = order ? format(d.title, { number: order.orderNumber }) : t.title;

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={title}
        description={d.subtitle}
        breadcrumb={
          <Link href="/orders" className="text-brand-600 hover:text-brand-700 hover:underline">
            ← {d.backToList}
          </Link>
        }
        actions={
          order ? (
            <div className="flex gap-2">
              {canPlace(order) ? (
                <Button disabled={acting !== null} onClick={() => void runAction("place")}>
                  {acting === "place" ? t.placing : t.placeAction}
                </Button>
              ) : null}
              {canCancel(order) ? (
                <Button
                  variant="secondary"
                  disabled={acting !== null}
                  onClick={() => void runAction("cancel")}
                >
                  {acting === "cancel" ? t.cancelling : t.cancelAction}
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />

      {state.status === "loading" ? <SkeletonRows rows={6} /> : null}

      {state.status === "error" ? (
        <Alert
          tone="error"
          title={t.loadError}
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              {c.actions.retry}
            </Button>
          }
        >
          {state.message}
        </Alert>
      ) : null}

      {order ? (
        <div className="space-y-5">
          {actionError ? <Alert tone="error">{actionError}</Alert> : null}

          {order.status === "CANCELLED" ? <Alert tone="info">{d.cancelledNotice}</Alert> : null}
          {order.status === "FULFILLED" ? <Alert tone="info">{d.fulfilledNotice}</Alert> : null}

          <div className="flex flex-wrap gap-2">
            <Badge tone={ORDER_STATUS_TONES[order.status]}>{statusLabels[order.status]}</Badge>
            <Badge tone={PAYMENT_STATUS_TONES[order.paymentStatus]}>
              {paymentLabels[order.paymentStatus]}
            </Badge>
            <Badge tone={FULFILLMENT_STATUS_TONES[order.fulfillmentStatus]}>
              {fulfillmentLabels[order.fulfillmentStatus]}
            </Badge>
          </div>

          <SectionCard title={d.customerLabel}>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">{d.customerLabel}</dt>
                <dd className="text-slate-700">{order.customerEmail}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">{d.placedAtLabel}</dt>
                <dd className="text-slate-700">
                  {order.placedAt ? formatDate(order.placedAt) : d.notPlacedYet}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">{d.createdAtLabel}</dt>
                <dd className="text-slate-700">{formatDate(order.createdAt)}</dd>
              </div>
              {order.cancelledAt ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">
                    {d.cancelledAtLabel}
                  </dt>
                  <dd className="text-slate-700">{formatDate(order.cancelledAt)}</dd>
                </div>
              ) : null}
              {order.cancelReason ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">
                    {d.cancelReasonLabel}
                  </dt>
                  <dd className="text-slate-700">{order.cancelReason}</dd>
                </div>
              ) : null}
            </dl>
          </SectionCard>

          <SectionCard title={d.linesTitle}>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">{d.lineProduct}</th>
                    <th className="px-3 py-2 text-right font-medium">{d.lineQuantity}</th>
                    <th className="px-3 py-2 text-right font-medium">{d.lineUnitPrice}</th>
                    <th className="px-3 py-2 text-right font-medium">{d.lineTotal}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-800">{line.title}</p>
                        <p className="text-xs text-slate-400">
                          {line.variantTitle} · <span className="font-mono">{line.sku}</span>
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{line.quantity}</td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {formatMinor(line.unitPriceAmount, line.currency)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-800">
                        {formatMinor(line.totalAmount, line.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title={d.summaryTitle}>
            <MoneyRow label={d.subtotal} value={formatMinor(order.subtotalAmount, order.currency)} />
            <MoneyRow label={d.discount} value={formatMinor(order.discountAmount, order.currency)} />
            <MoneyRow label={d.shipping} value={formatMinor(order.shippingAmount, order.currency)} />
            <MoneyRow label={d.tax} value={formatMinor(order.taxAmount, order.currency)} />
            <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
              <span className="font-semibold text-slate-900">{d.total}</span>
              <span className="font-semibold text-slate-900">
                {formatMinor(order.totalAmount, order.currency)}
              </span>
            </div>
          </SectionCard>

          <SectionCard title={d.addressesTitle}>
            {order.addresses.length === 0 ? (
              <p className="text-sm text-slate-400">{d.noAddresses}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {order.addresses.map((address) => (
                  <div
                    key={address.id}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      {address.type === "SHIPPING" ? d.shippingAddress : d.billingAddress}
                    </p>
                    <p className="font-medium text-slate-700">{address.fullName}</p>
                    <p className="text-slate-500">
                      {address.addressLine1}
                      {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                    </p>
                    <p className="text-slate-500">
                      {address.district ? `${address.district}, ` : ""}
                      {address.city} {address.postalCode ?? ""} · {address.countryCode}
                    </p>
                    {address.phone ? <p className="text-slate-500">{address.phone}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title={d.reservationsTitle}>
            {order.reservations.length === 0 ? (
              <p className="text-sm text-slate-400">{d.noReservations}</p>
            ) : (
              <ul className="space-y-1">
                {order.reservations.map((reservation) => (
                  <li
                    key={reservation.id}
                    className="flex items-center gap-2 text-sm text-slate-600"
                  >
                    <Badge tone={RESERVATION_STATUS_TONES[reservation.status]}>
                      {reservationLabels[reservation.status]}
                    </Badge>
                    <span>
                      {format(d.reservationLine, {
                        quantity: reservation.quantity,
                        status: reservationLabels[reservation.status],
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={d.eventsTitle}>
            {order.events.length === 0 ? (
              <p className="text-sm text-slate-400">{d.noEvents}</p>
            ) : (
              <ul className="space-y-2">
                {order.events.map((event) => (
                  <li key={event.id} className="text-sm">
                    <span className="font-mono text-xs text-slate-500">{event.type}</span>
                    {event.message ? (
                      <span className="text-slate-600"> — {event.message}</span>
                    ) : null}
                    <span className="ml-1 text-xs text-slate-400">
                      {formatDate(event.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      ) : null}
    </>
  );
}
