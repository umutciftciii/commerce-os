"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Alert, Badge, Button, SkeletonRows, useLocale } from "@commerce-os/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type { Order } from "@commerce-os/api-client";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../../lib/client/format";
import {
  DetailHero,
  DetailLayout,
  MetricGrid,
  MetricTile,
  RailCard,
  RailRow,
  SurfaceCard,
  Timeline,
  TimelineItem,
} from "../../../components/premium";
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
 * Sipariş detayı: modal değil, kendi route'unda (`/orders/[id]`) tam sayfa.
 * Üstte kimlik başlığı (DetailHero) + operasyon özeti tile'ları; altında iki kolon:
 * solda kalemler, tutar özeti ve olay zaman çizelgesi; sağda müşteri, adres,
 * rezervasyon ve künye bağlam rayı. Doğal sayfa scroll'u ile akar.
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

  const activeReservations = useMemo(
    () => (order ? order.reservations.filter((r) => r.status === "ACTIVE").length : 0),
    [order],
  );

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
      <DetailHero
        eyebrow={t.eyebrow}
        title={title}
        subtitle={order ? order.customerEmail : null}
        description={d.subtitle}
        backHref="/orders"
        backLabel={d.backToList}
        badges={
          order ? (
            <>
              <Badge tone={ORDER_STATUS_TONES[order.status]} dot>
                {statusLabels[order.status]}
              </Badge>
              <Badge tone={PAYMENT_STATUS_TONES[order.paymentStatus]}>
                {paymentLabels[order.paymentStatus]}
              </Badge>
              <Badge tone={FULFILLMENT_STATUS_TONES[order.fulfillmentStatus]}>
                {fulfillmentLabels[order.fulfillmentStatus]}
              </Badge>
            </>
          ) : null
        }
        actions={
          order ? (
            <>
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
            </>
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

          <MetricGrid columns={4}>
            <MetricTile
              label={d.tiles.total}
              value={formatMinor(order.totalAmount, order.currency)}
              tone="brand"
            />
            <MetricTile label={d.tiles.lines} value={order.lines.length} />
            <MetricTile
              label={d.tiles.reservation}
              value={activeReservations}
              hint={activeReservations > 0 ? undefined : d.reservationNone}
              tone={activeReservations > 0 ? "success" : "neutral"}
            />
            <MetricTile
              label={d.tiles.created}
              value={
                <span className="text-base font-semibold">{formatDate(order.createdAt)}</span>
              }
            />
          </MetricGrid>

          <DetailLayout
            main={
              <>
                <SurfaceCard title={d.linesTitle}>
                  <div className="overflow-hidden rounded-xl border border-slate-200/70">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50/80 text-left text-xs text-slate-500">
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
                            <td className="px-3 py-2.5">
                              <p className="font-medium text-slate-800">{line.title}</p>
                              <p className="text-xs text-slate-400">
                                {line.variantTitle} · <span className="font-mono">{line.sku}</span>
                              </p>
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-600">
                              {line.quantity}
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-600">
                              {formatMinor(line.unitPriceAmount, line.currency)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium text-slate-800">
                              {formatMinor(line.totalAmount, line.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SurfaceCard>

                <SurfaceCard title={d.summaryTitle}>
                  <MoneyRow
                    label={d.subtotal}
                    value={formatMinor(order.subtotalAmount, order.currency)}
                  />
                  <MoneyRow
                    label={d.discount}
                    value={formatMinor(order.discountAmount, order.currency)}
                  />
                  <MoneyRow
                    label={d.shipping}
                    value={formatMinor(order.shippingAmount, order.currency)}
                  />
                  <MoneyRow label={d.tax} value={formatMinor(order.taxAmount, order.currency)} />
                  <div className="mt-1 flex items-center justify-between border-t border-slate-200/70 pt-2 text-sm">
                    <span className="font-semibold text-slate-900">{d.total}</span>
                    <span className="font-semibold text-slate-900">
                      {formatMinor(order.totalAmount, order.currency)}
                    </span>
                  </div>
                </SurfaceCard>

                <SurfaceCard title={d.eventsTitle}>
                  {order.events.length === 0 ? (
                    <p className="text-sm text-slate-400">{d.noEvents}</p>
                  ) : (
                    <Timeline>
                      {order.events.map((event, index) => (
                        <TimelineItem
                          key={event.id}
                          last={index === order.events.length - 1}
                          title={<span className="font-mono text-xs">{event.type}</span>}
                          meta={formatDate(event.createdAt)}
                          description={event.message ?? undefined}
                        />
                      ))}
                    </Timeline>
                  )}
                </SurfaceCard>
              </>
            }
            rail={
              <>
                <RailCard title={d.customerInfoTitle}>
                  <div className="divide-y divide-slate-100">
                    <RailRow label={d.customerLabel} value={order.customerEmail} />
                    <RailRow
                      label={d.placedAtLabel}
                      value={order.placedAt ? formatDate(order.placedAt) : d.notPlacedYet}
                    />
                    <RailRow label={d.createdAtLabel} value={formatDate(order.createdAt)} />
                    {order.cancelledAt ? (
                      <RailRow
                        label={d.cancelledAtLabel}
                        value={formatDate(order.cancelledAt)}
                      />
                    ) : null}
                    {order.cancelReason ? (
                      <RailRow label={d.cancelReasonLabel} value={order.cancelReason} />
                    ) : null}
                  </div>
                </RailCard>

                <RailCard title={d.addressesTitle}>
                  {order.addresses.length === 0 ? (
                    <p className="text-sm text-slate-400">{d.noAddresses}</p>
                  ) : (
                    <div className="space-y-3">
                      {order.addresses.map((address) => (
                        <div
                          key={address.id}
                          className="rounded-xl border border-slate-200/70 bg-white/50 px-3 py-2.5 text-sm"
                        >
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
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
                </RailCard>

                <RailCard title={d.reservationsTitle}>
                  {order.reservations.length === 0 ? (
                    <p className="text-sm text-slate-400">{d.noReservations}</p>
                  ) : (
                    <ul className="space-y-2">
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
                </RailCard>

                <RailCard title={d.metadataTitle}>
                  <div className="divide-y divide-slate-100">
                    <RailRow
                      label={d.orderIdLabel}
                      value={<span className="font-mono text-xs">{order.orderNumber}</span>}
                    />
                    <RailRow label={d.createdAtLabel} value={formatDate(order.createdAt)} />
                  </div>
                </RailCard>
              </>
            }
          />
        </div>
      ) : null}
    </>
  );
}
