"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Alert, Badge, Button, SkeletonRows, useLocale } from "../../../../components/ui";
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
import { OrderShipmentSummary } from "./order-shipment-summary";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; order: Order };

function MoneyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-white/45">{label}</span>
      <span className="font-medium text-white/70">{value}</span>
    </div>
  );
}

type DetailDict = ReturnType<typeof getDictionary>["storeAdmin"]["orders"]["detail"];
type AttemptStatus = Order["paymentAttempts"][number]["status"];

/** Olay tipini locale'e gore cevirir; eslesme yoksa DB mesajina dusurur (F3B.2 i18n). */
function localizedEvent(d: DetailDict, type: string, message: string | null): string | undefined {
  const map = d.eventMessages as Record<string, string>;
  return map[type] ?? message ?? undefined;
}

const ATTEMPT_STATUS_TONES: Record<AttemptStatus, "success" | "danger" | "warning" | "neutral" | "info"> = {
  CREATED: "neutral",
  PENDING: "warning",
  REQUIRES_ACTION: "warning",
  AUTHORIZED: "success",
  PAID: "success",
  FAILED: "danger",
  CANCELLED: "danger",
  REFUNDED: "info",
};

const CARD_BRAND_LABEL: Record<string, string> = {
  VISA: "Visa",
  MASTERCARD: "Mastercard",
  AMEX: "Amex",
  TROY: "Troy",
  CARD: "Kart",
};

/** 3D Secure durumu: deneme statusune gore gerekli/dogrulandi/basarisiz/bekliyor. */
function threeDsStateLabel(status: AttemptStatus, d: DetailDict): string {
  if (status === "PAID" || status === "AUTHORIZED") return d.paymentThreeDsVerified;
  if (status === "FAILED" || status === "CANCELLED") return d.paymentThreeDsFailed;
  if (status === "REQUIRES_ACTION") return d.paymentThreeDsPending;
  return d.paymentThreeDsRequired;
}

/** Maskeli kart etiketi (marka + son 4). Full PAN ASLA gosterilmez. */
function maskedCardLabel(brand: string | null, last4: string | null): string | null {
  if (!last4) return null;
  const prefix = brand && CARD_BRAND_LABEL[brand] ? `${CARD_BRAND_LABEL[brand]} ` : "";
  return `${prefix}•••• ${last4}`;
}

/**
 * F3B.2 — Ödeme gözlemlenebilirlik paneli. Provider/mod/yöntem, maskeli kart,
 * taksit, işlem (transaction) No, deneme No/durumu, ödeme/başarısızlık tarihi ve
 * başarısızlık nedeni. Deneme yoksa empty state. Full PAN/CVC ASLA gosterilmez.
 */
function PaymentPanel({ order, d }: { order: Order; d: DetailDict }) {
  const attempts = order.paymentAttempts ?? [];
  const statusLabels = d.attemptStatusLabels as Record<string, string>;
  if (attempts.length === 0) {
    return (
      <SurfaceCard title={d.paymentTitle}>
        <p className="text-sm text-white/30">{d.noPaymentAttempt}</p>
      </SurfaceCard>
    );
  }
  const ordered = [...attempts].reverse(); // en guncel deneme once
  return (
    <SurfaceCard title={d.paymentTitle}>
      <div className="space-y-3">
        {ordered.map((attempt) => {
          const card = maskedCardLabel(attempt.cardBrand, attempt.cardLast4);
          return (
            <div
              key={attempt.id}
              className="rounded-xl border border-white/[0.09] bg-white/[0.04] p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-white/80">
                  {attempt.provider} · {attempt.mode}
                </span>
                <Badge tone={ATTEMPT_STATUS_TONES[attempt.status]} dot>
                  {statusLabels[attempt.status] ?? attempt.status}
                </Badge>
              </div>
              <div className="divide-y divide-white/[0.06]">
                <RailRow label={d.paymentMethodLabel} value={attempt.method} />
                {card ? (
                  <RailRow
                    label={d.paymentCardLabel}
                    value={<span className="font-mono text-xs">{card}</span>}
                  />
                ) : null}
                {attempt.threeDsApplied ? (
                  <RailRow
                    label={d.paymentThreeDsLabel}
                    value={threeDsStateLabel(attempt.status, d)}
                  />
                ) : null}
                {attempt.installmentCount > 1 ? (
                  <>
                    <RailRow
                      label={d.paymentInstallmentLabel}
                      value={format(d.paymentInstallmentSummaryValue, {
                        count: attempt.installmentCount,
                        amount: formatMinor(
                          Math.round(attempt.amount / attempt.installmentCount),
                          attempt.currency,
                        ),
                      })}
                    />
                    <RailRow
                      label={d.paymentInstallmentTotalLabel}
                      value={`${formatMinor(attempt.amount, attempt.currency)} · ${d.paymentNoInterest}`}
                    />
                  </>
                ) : (
                  <RailRow label={d.paymentInstallmentLabel} value={d.paymentSingleShot} />
                )}
                {attempt.providerReference ? (
                  <RailRow
                    label={d.paymentTransactionLabel}
                    value={<span className="font-mono text-xs">{attempt.providerReference}</span>}
                  />
                ) : null}
                <RailRow
                  label={d.paymentAttemptLabel}
                  value={<span className="font-mono text-xs">{attempt.id}</span>}
                />
                {attempt.paidAt ? (
                  <RailRow label={d.paymentPaidAtLabel} value={formatDate(attempt.paidAt)} />
                ) : null}
                {attempt.failedAt ? (
                  <RailRow label={d.paymentFailedAtLabel} value={formatDate(attempt.failedAt)} />
                ) : null}
                {attempt.failureMessage || attempt.failureCode ? (
                  <RailRow
                    label={d.paymentFailureLabel}
                    value={attempt.failureMessage ?? attempt.failureCode ?? ""}
                  />
                ) : null}
                {attempt.scenario ? (
                  <RailRow
                    label={d.paymentScenarioLabel}
                    value={<span className="font-mono text-xs">{attempt.scenario}</span>}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </SurfaceCard>
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

  // Ödenen tutar: PAID/AUTHORIZED bir ödeme denemesi varsa onun tutari; yoksa sipariş
  // ödeme durumu PAID/AUTHORIZED ise genel toplam; aksi halde 0.
  const paidAmount = useMemo(() => {
    if (!order) return 0;
    const settled = (order.paymentAttempts ?? []).find(
      (a) => a.status === "PAID" || a.status === "AUTHORIZED",
    );
    if (settled) return settled.amount;
    return order.paymentStatus === "PAID" || order.paymentStatus === "AUTHORIZED"
      ? order.totalAmount
      : 0;
  }, [order]);

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
                  <div className="overflow-hidden rounded-xl border border-white/[0.09]">
                    <table className="w-full text-sm">
                      <thead className="bg-white/[0.03] text-left text-xs text-white/45">
                        <tr>
                          <th className="px-3 py-2 font-medium">{d.lineProduct}</th>
                          <th className="px-3 py-2 text-right font-medium">{d.lineQuantity}</th>
                          <th className="px-3 py-2 text-right font-medium">{d.lineUnitPrice}</th>
                          <th className="px-3 py-2 text-right font-medium">{d.lineTotal}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {order.lines.map((line) => (
                          <tr key={line.id}>
                            <td className="px-3 py-2.5">
                              <p className="font-medium text-white/80">{line.title}</p>
                              <p className="text-xs text-white/30">
                                {line.variantTitle} · <span className="font-mono">{line.sku}</span>
                              </p>
                            </td>
                            <td className="px-3 py-2.5 text-right text-white/60">
                              {line.quantity}
                            </td>
                            <td className="px-3 py-2.5 text-right text-white/60">
                              {formatMinor(line.unitPriceAmount, line.currency)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium text-white/80">
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
                  <div className="mt-1 flex items-center justify-between border-t border-white/[0.09] pt-2 text-sm">
                    <span className="font-semibold text-white/90">{d.total}</span>
                    <span className="font-semibold text-white/90">
                      {formatMinor(order.totalAmount, order.currency)}
                    </span>
                  </div>
                  {order.paymentStatus !== "UNPAID" || paidAmount > 0 ? (
                    <>
                      <MoneyRow label={d.paidAmount} value={formatMinor(paidAmount, order.currency)} />
                      <MoneyRow
                        label={d.remainingAmount}
                        value={formatMinor(Math.max(order.totalAmount - paidAmount, 0), order.currency)}
                      />
                    </>
                  ) : null}
                </SurfaceCard>

                <PaymentPanel order={order} d={d} />

                <OrderShipmentSummary order={order} locale={locale as "tr" | "en"} />

                <SurfaceCard title={d.eventsTitle}>
                  {order.events.length === 0 ? (
                    <p className="text-sm text-white/30">{d.noEvents}</p>
                  ) : (
                    <Timeline>
                      {order.events.map((event, index) => (
                        <TimelineItem
                          key={event.id}
                          last={index === order.events.length - 1}
                          title={<span className="font-mono text-xs">{event.type}</span>}
                          meta={formatDate(event.createdAt)}
                          description={localizedEvent(d, event.type, event.message)}
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
                  <div className="divide-y divide-white/[0.06]">
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
                    <p className="text-sm text-white/30">{d.noAddresses}</p>
                  ) : (
                    <div className="space-y-3">
                      {order.addresses.map((address) => (
                        <div
                          key={address.id}
                          className="rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 py-2.5 text-sm"
                        >
                          <p className="text-[11px] uppercase tracking-wide text-white/30">
                            {address.type === "SHIPPING" ? d.shippingAddress : d.billingAddress}
                          </p>
                          <p className="font-medium text-white/70">{address.fullName}</p>
                          <p className="text-white/45">
                            {address.addressLine1}
                            {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                          </p>
                          <p className="text-white/45">
                            {address.district ? `${address.district}, ` : ""}
                            {address.city} {address.postalCode ?? ""} · {address.countryCode}
                          </p>
                          {address.phone ? <p className="text-white/45">{address.phone}</p> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </RailCard>

                <RailCard title={d.billingTitle}>
                  {order.billing ? (
                    <div className="divide-y divide-white/[0.06]">
                      <RailRow
                        label={d.billingTypeLabel}
                        value={
                          order.billing.type === "CORPORATE"
                            ? d.billingTypeCorporate
                            : d.billingTypeIndividual
                        }
                      />
                      {order.billing.type === "CORPORATE" ? (
                        <>
                          {order.billing.companyName ? (
                            <RailRow label={d.billingCompanyLabel} value={order.billing.companyName} />
                          ) : null}
                          {order.billing.taxOffice ? (
                            <RailRow label={d.billingTaxOfficeLabel} value={order.billing.taxOffice} />
                          ) : null}
                          {order.billing.taxNumber ? (
                            <RailRow
                              label={d.billingTaxNumberLabel}
                              value={<span className="font-mono text-xs">{order.billing.taxNumber}</span>}
                            />
                          ) : null}
                        </>
                      ) : (
                        <>
                          {order.billing.name ? (
                            <RailRow label={d.billingNameLabel} value={order.billing.name} />
                          ) : null}
                          {order.billing.taxId ? (
                            <RailRow
                              label={d.billingTaxIdLabel}
                              value={<span className="font-mono text-xs">{order.billing.taxId}</span>}
                            />
                          ) : null}
                        </>
                      )}
                      {order.billing.email ? (
                        <RailRow label={d.billingEmailLabel} value={order.billing.email} />
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-white/30">{d.noBilling}</p>
                  )}
                </RailCard>

                <RailCard title={d.reservationsTitle}>
                  {order.reservations.length === 0 ? (
                    <p className="text-sm text-white/30">{d.noReservations}</p>
                  ) : (
                    <ul className="space-y-2">
                      {order.reservations.map((reservation) => (
                        <li
                          key={reservation.id}
                          className="flex items-center gap-2 text-sm text-white/60"
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
                  <div className="divide-y divide-white/[0.06]">
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
