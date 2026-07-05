"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Alert, Badge, Button, SkeletonRows, useLocale } from "../../../../components/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type { Order, OrderFulfillmentDisplay } from "@commerce-os/api-client";
import { getOrderFulfillmentDisplay } from "@commerce-os/api-client";
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
  FULFILLMENT_DISPLAY_TONES,
  ORDER_STATUS_TONES,
  PAYMENT_STATUS_TONES,
  RESERVATION_STATUS_TONES,
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
 * F4A.2 — Kampanya/Kupon paneli. KAYNAK DOĞRUSU sipariş anındaki OrderDiscount
 * SNAPSHOT satırlarıdır; kampanya sonradan düzenlense/arşivlense bile buradaki
 * değerler tarihsel doğruluğunu korur (güncel kampanya kurallarından yeniden
 * hesaplanmaz). İndirim yoksa nötr metin gösterilir. Ham scopeSummary/iç
 * metadata bu yüzeye TAŞINMAZ.
 */
function CampaignPanel({ order, d }: { order: Order; d: DetailDict }) {
  const discounts = order.discounts ?? [];
  if (discounts.length === 0) {
    return (
      <SurfaceCard title={d.campaignTitle}>
        <p className="text-sm text-white/30">{d.campaignNone}</p>
      </SurfaceCard>
    );
  }
  const totalDiscount = discounts.reduce((sum, line) => sum + line.discountAmountMinor, 0);
  const subtotalAfter = Math.max(order.subtotalAmount - order.discountAmount, 0);
  return (
    <SurfaceCard title={d.campaignTitle}>
      <div className="space-y-3">
        {discounts.map((line) => (
          <div key={line.id} className="rounded-xl border border-white/[0.09] bg-white/[0.04] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-white/80">{line.label}</span>
              <Badge tone={line.code ? "info" : "success"}>
                {line.code ? d.campaignTypeCoupon : d.campaignTypeAutomatic}
              </Badge>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {line.code ? (
                <RailRow
                  label={d.campaignCouponCodeLabel}
                  value={<span className="font-mono text-xs">{line.code}</span>}
                />
              ) : null}
              <RailRow
                label={d.campaignDiscountTypeLabel}
                value={
                  line.discountType === "PERCENT"
                    ? d.campaignDiscountTypePercent
                    : d.campaignDiscountTypeFixed
                }
              />
              <RailRow
                label={d.campaignDiscountValueLabel}
                value={
                  line.discountType === "PERCENT"
                    ? `%${line.discountValue}`
                    : formatMinor(line.discountValue, order.currency)
                }
              />
              <RailRow
                label={d.campaignAppliedLabel}
                value={formatMinor(line.discountAmountMinor, order.currency)}
              />
              <RailRow label={d.campaignRedeemedAtLabel} value={formatDate(line.createdAt)} />
            </div>
          </div>
        ))}

        <div className="rounded-xl border border-white/[0.09] bg-white/[0.04] p-3">
          <MoneyRow
            label={d.campaignSubtotalBeforeLabel}
            value={formatMinor(order.subtotalAmount, order.currency)}
          />
          <MoneyRow
            label={d.campaignTotalDiscountLabel}
            value={`−${formatMinor(totalDiscount, order.currency)}`}
          />
          <MoneyRow
            label={d.campaignSubtotalAfterLabel}
            value={formatMinor(subtotalAfter, order.currency)}
          />
          <MoneyRow
            label={d.campaignShippingLabel}
            value={formatMinor(order.shippingAmount, order.currency)}
          />
          <div className="mt-1 flex items-center justify-between border-t border-white/[0.09] pt-2 text-sm">
            <span className="font-semibold text-white/90">{d.campaignGrandTotalLabel}</span>
            <span className="font-semibold text-white/90">
              {formatMinor(order.totalAmount, order.currency)}
            </span>
          </div>
        </div>

        <p className="text-xs text-white/30">{d.campaignSnapshotNote}</p>
      </div>
    </SurfaceCard>
  );
}

/**
 * F4C (ADR-064) — Bölüm A: Ödeme/tutar özeti. KAYNAK: sunucunun snapshot-türevi
 * `order.salesSummary` projeksiyonu (ara toplam / indirim+etiket / kargo /
 * ödenmesi gereken / net ödenen / kalan bakiye). Sunucu özet dönmezse (eski
 * yanıt) çağıran taraf legacy tutar kartına düşer.
 */
function PaymentSummaryPanel({ order, d }: { order: Order; d: DetailDict }) {
  const summary = order.salesSummary!;
  const currency = summary.currency;
  return (
    <SurfaceCard title={d.paymentSummaryTitle}>
      <MoneyRow label={d.paymentSubtotal} value={formatMinor(summary.subtotalGrossMinor, currency)} />
      <div className="flex items-center justify-between py-1 text-sm">
        <span className="text-white/45">
          {d.paymentDiscount}
          {summary.discountLabel ? (
            <span className="ml-2 text-xs text-emerald-300/80">{summary.discountLabel}</span>
          ) : null}
        </span>
        <span className="font-medium text-white/70">
          {summary.discountGrossMinor > 0
            ? `−${formatMinor(summary.discountGrossMinor, currency)}`
            : formatMinor(0, currency)}
        </span>
      </div>
      <MoneyRow label={d.paymentShipping} value={formatMinor(summary.shippingGrossMinor, currency)} />
      {order.shippingSelection ? (
        <div className="flex items-center justify-between text-xs text-white/40">
          <span>{d.shippingProvider}</span>
          <span className="text-right text-white/60">
            {order.shippingSelection.providerName ?? order.shippingSelection.serviceName}
          </span>
        </div>
      ) : null}
      <div className="mt-1 flex items-center justify-between border-t border-white/[0.09] pt-2 text-sm">
        <span className="font-semibold text-white/90">{d.paymentPayable}</span>
        <span className="font-semibold text-white/90">
          {formatMinor(summary.payableGrossMinor, currency)}
        </span>
      </div>
      <MoneyRow label={d.paymentPaid} value={formatMinor(summary.paidGrossMinor, currency)} />
      <MoneyRow label={d.paymentRemaining} value={formatMinor(summary.remainingGrossMinor, currency)} />
    </SurfaceCard>
  );
}

/** KDV oran etiketi: 2000 bps → "20"; tam bölünemeyen oranlarda 1 ondalık. */
function vatRateText(rateBps: number): string {
  return rateBps % 100 === 0 ? String(rateBps / 100) : (rateBps / 100).toFixed(1);
}

/**
 * F4C (ADR-064) — Bölüm B: Satış/vergi/kâr özeti. YALNIZ sipariş anındaki
 * snapshot'lardan türetilen `salesSummary.sales` gösterilir; snapshot'sız
 * (F4C öncesi) siparişte yanıltıcı sıfır yerine "eski format" bilgisi verilir.
 * Maliyet snapshot'ı yoksa kâr satırları "—" kalır. "Net kâr" vurgulanır.
 */
function SalesSummaryPanel({ order, d }: { order: Order; d: DetailDict }) {
  const summary = order.salesSummary;
  if (!summary) return null;
  const sales = summary.sales;
  return (
    <SurfaceCard title={d.salesSummaryTitle} description={d.salesSummarySubtitle}>
      {sales === null ? (
        <Alert tone="info">{d.salesLegacyNotice}</Alert>
      ) : (
        <>
          <MoneyRow label={d.salesListPrice} value={formatMinor(sales.listGrossMinor, summary.currency)} />
          <MoneyRow
            label={
              sales.vatBreakdown.length === 1
                ? format(d.salesVat, { rate: vatRateText(sales.vatBreakdown[0].rateBps) })
                : d.salesVatMixed
            }
            value={formatMinor(sales.totalVatMinor, summary.currency)}
          />
          {sales.vatBreakdown.length > 1
            ? sales.vatBreakdown.map((vatLine) => (
                <div
                  key={vatLine.rateBps}
                  className="flex items-center justify-between text-xs text-white/40"
                >
                  <span>{format(d.salesVatRateLine, { rate: vatRateText(vatLine.rateBps) })}</span>
                  <span>{formatMinor(vatLine.amountMinor, summary.currency)}</span>
                </div>
              ))
            : null}
          <MoneyRow label={d.salesNetPrice} value={formatMinor(sales.subtotalNetMinor, summary.currency)} />
          <MoneyRow
            label={d.salesCost}
            value={sales.totalCostMinor !== null ? formatMinor(sales.totalCostMinor, summary.currency) : "—"}
          />
          <MoneyRow
            label={d.salesGrossProfit}
            value={
              sales.grossProfitMinor !== null ? formatMinor(sales.grossProfitMinor, summary.currency) : "—"
            }
          />
          <MoneyRow
            label={d.salesCampaignDiscount}
            value={
              sales.campaignDiscountMinor > 0
                ? `−${formatMinor(sales.campaignDiscountMinor, summary.currency)}`
                : formatMinor(0, summary.currency)
            }
          />
          <div className="mt-1 flex items-center justify-between border-t border-white/[0.09] pt-2 text-sm">
            <span className="font-semibold text-white/90">{d.salesNetProfit}</span>
            <span
              className={[
                "font-bold",
                sales.netProfitMinor === null
                  ? "text-white/40"
                  : sales.netProfitMinor >= 0
                    ? "text-emerald-300"
                    : "text-rose-300",
              ].join(" ")}
            >
              {sales.netProfitMinor !== null
                ? formatMinor(sales.netProfitMinor, summary.currency)
                : "—"}
            </span>
          </div>
          {sales.totalCostMinor === null ? (
            <p className="mt-2 text-xs text-white/30">{d.salesNoCost}</p>
          ) : null}
        </>
      )}
    </SurfaceCard>
  );
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
  // TODO-135 — Başlık/hero karşılama rozeti GÖSTERİM etiketleri (kargo hazırlık
  // durumunu yansıtır); Order.fulfillmentStatus MUTATE EDİLMEZ.
  const fulfillmentDisplayLabels = t.fulfillmentDisplayLabels as Record<
    OrderFulfillmentDisplay,
    string
  >;
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
              {(() => {
                // TODO-135 — Kargo kaydı varsa hero rozeti hazırlık durumunu yansıtır
                // (ORDER_CREATED → "Gönderi oluşturuldu"), aksi halde "Gönderilmedi".
                const display = getOrderFulfillmentDisplay(
                  order.fulfillmentStatus,
                  order.shipmentStatus ?? null,
                );
                return (
                  <Badge tone={FULFILLMENT_DISPLAY_TONES[display]}>
                    {fulfillmentDisplayLabels[display]}
                  </Badge>
                );
              })()}
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

                {/* F4C (ADR-064) — Bölüm A (ödeme özeti) + Bölüm B (satış özeti).
                    Sunucu salesSummary dönmezse legacy tutar kartına düşülür. */}
                {order.salesSummary ? (
                  <>
                    <PaymentSummaryPanel order={order} d={d} />
                    <SalesSummaryPanel order={order} d={d} />
                  </>
                ) : (
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
                    {order.shippingSelection ? (
                      <div className="flex items-center justify-between text-xs text-white/40">
                        <span>{d.shippingProvider}</span>
                        <span className="text-right text-white/60">
                          {order.shippingSelection.providerName ?? order.shippingSelection.serviceName}
                          {order.shippingSelection.serviceName &&
                          order.shippingSelection.providerName !== order.shippingSelection.serviceName
                            ? ` · ${order.shippingSelection.serviceName}`
                            : ""}
                        </span>
                      </div>
                    ) : null}
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
                )}

                <CampaignPanel order={order} d={d} />

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
