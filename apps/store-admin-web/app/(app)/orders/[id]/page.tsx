"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Badge, Button, SkeletonRows, useLocale } from "../../../../components/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type {
  Order,
  OrderFulfillmentDisplay,
  OrderExperienceSummaryDto,
  AdminOrderReturnsResponse,
} from "@commerce-os/api-client";
import { getOrderFulfillmentDisplay } from "@commerce-os/api-client";
import { storeApi, type RefundContext } from "../../../../lib/client/api";
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
  cancellationReasonCategoryLabel,
  cancellationReasonLabel,
  cancellationSourceLabel,
  FULFILLMENT_DISPLAY_TONES,
  ORDER_STATUS_TONES,
  PAYMENT_STATUS_TONES,
  RESERVATION_STATUS_TONES,
  RETURN_STATUS_TONES,
  returnStatusLabel,
  returnResolutionLabel,
  // TODO-175 (ADR-285) — iptal geri ödemesi hedefi (müşteri tercihi) etiket/tonu.
  refundDestinationLabel,
  REFUND_DESTINATION_TONES,
  type OrderStatus,
  type PaymentStatus,
  type ReservationStatus,
} from "../order-shared";
import { OrderShipmentSummary } from "./order-shipment-summary";
import { OrderPaymentActions } from "./order-payment-actions";

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

type PaymentAllocation = Order["paymentAllocations"][number];

/**
 * TD-174B-1 — Ödeme dağılımı satır etiketi (ham enum GÖSTERİLMEZ). CARD → maskeli
 * kart (marka + son 4); yoksa jenerik "Kredi/banka kartı". STORE_CREDIT → "Mağaza
 * bakiyesi". Diğer yöntemler i18n key'inden.
 */
function allocationLabel(allocation: PaymentAllocation, d: DetailDict): string {
  switch (allocation.sourceType) {
    case "STORE_CREDIT":
      return d.paymentAllocationStoreCredit;
    case "CARD":
      return maskedCardLabel(allocation.cardBrand, allocation.cardLast4) ?? d.paymentAllocationCard;
    case "BANK_TRANSFER":
      return d.paymentAllocationBankTransfer;
    case "CASH_ON_DELIVERY":
      return d.paymentAllocationCod;
    case "PAYMENT_LINK":
      return d.paymentAllocationPaymentLink;
    default:
      return d.paymentAllocationCard;
  }
}

// TD-174B-1 — Recovery durum tonu/etiketi (order-experience yüzeyiyle tutarlı; ham enum yok).
const RECOVERY_STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "info" | "danger"> = {
  OPEN: "warning",
  ASSIGNED: "info",
  CONTACT_ATTEMPTED: "info",
  CUSTOMER_REACHED: "info",
  ACTION_REQUIRED: "warning",
  RESOLVED: "success",
  CLOSED: "neutral",
  UNREACHABLE: "danger",
  NO_ACTION_REQUIRED: "neutral",
};

function recoveryStatusLabel(status: string, tr: boolean): string {
  const map: Record<string, [string, string]> = {
    OPEN: ["Açık", "Open"],
    ASSIGNED: ["Atandı", "Assigned"],
    CONTACT_ATTEMPTED: ["İletişim denendi", "Contact attempted"],
    CUSTOMER_REACHED: ["Müşteriye ulaşıldı", "Customer reached"],
    ACTION_REQUIRED: ["Aksiyon gerekli", "Action required"],
    RESOLVED: ["Çözüldü", "Resolved"],
    CLOSED: ["Kapatıldı", "Closed"],
    UNREACHABLE: ["Ulaşılamadı", "Unreachable"],
    NO_ACTION_REQUIRED: ["Aksiyon gerekmez", "No action"],
  };
  const v = map[status];
  return v ? (tr ? v[0] : v[1]) : status;
}

/**
 * TD-174B-1 — Store-admin sipariş detayı "Sipariş Deneyimi" kartı. Kaynak = tek-sipariş
 * özeti ucu (review yoksa kart RENDER EDİLMEZ). Rating + yorum + recovery durumu +
 * atanan + tanımlanan iyi niyet bakiyesi; case varsa geri kazanım detayına köprü.
 * Internal note TAŞINMAZ (özet ucu zaten göndermez).
 */
function OrderExperienceCard({
  summary,
  d,
  locale,
}: {
  summary: OrderExperienceSummaryDto;
  d: DetailDict;
  locale: string;
}) {
  const tr = locale === "tr";
  const goodwillMinor = Number(summary.goodwillCreditMinor);
  return (
    <SurfaceCard title={d.experienceTitle}>
      <div className="flex items-center justify-between py-1 text-sm">
        <span className="text-white/45">{d.experienceRatingLabel}</span>
        <span className="font-medium text-amber-300/90" aria-label={`${summary.rating}/5`}>
          {"★".repeat(summary.rating)}
          <span className="text-white/20">{"★".repeat(5 - summary.rating)}</span>
        </span>
      </div>
      {summary.comment ? (
        <div className="py-1 text-sm">
          <p className="mb-1 text-white/45">{d.experienceCommentLabel}</p>
          <p className="rounded-lg bg-white/[0.03] px-3 py-2 text-white/70">{summary.comment}</p>
        </div>
      ) : null}
      {summary.recovery ? (
        <>
          <div className="flex items-center justify-between py-1 text-sm">
            <span className="text-white/45">{d.experienceRecoveryStatusLabel}</span>
            <span className="flex items-center gap-2">
              <Badge tone={RECOVERY_STATUS_TONE[summary.recovery.status] ?? "neutral"}>
                {recoveryStatusLabel(summary.recovery.status, tr)}
              </Badge>
              {summary.recovery.overdue ? <Badge tone="danger">{d.experienceOverdue}</Badge> : null}
            </span>
          </div>
          <div className="flex items-center justify-between py-1 text-sm">
            <span className="text-white/45">{d.experienceAssigneeLabel}</span>
            <span className="font-medium text-white/70">
              {summary.recovery.assigneePlatformUserId ?? d.experienceUnassigned}
            </span>
          </div>
          {goodwillMinor > 0 ? (
            <MoneyRow label={d.experienceGoodwillLabel} value={formatMinor(goodwillMinor, "TRY")} />
          ) : null}
          <div className="mt-2 border-t border-white/[0.09] pt-2">
            <Link
              href={`/order-experience/${summary.recovery.caseId}`}
              className="text-sm font-medium text-sky-300/90 hover:text-sky-200"
            >
              {d.experienceViewCase} →
            </Link>
          </div>
        </>
      ) : (
        <p className="pt-1 text-sm text-white/30">{d.experienceNoCase}</p>
      )}
    </SurfaceCard>
  );
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
 *
 * TD-FR-7 — refundContext (order-level refund-context uç noktası; fail-open, opsiyonel)
 * verilmişse ve succeededRefundMinor > 0 ise "Gerçekleşen iade" + "İade sonrası net
 * tahsilat" satırları eklenir. YALNIZ OrderRefund SUCCEEDED figürleri kullanılır
 * (refundContext.succeededRefundMinor zaten yalnız SUCCEEDED'dan türetilir — PENDING/
 * PROCESSING dahil değildir). `netCollectedMinor` SUNUCUDAN gelir (payment-state.
 * computeNetCollectedMinor — TEK server-side otorite); client'ta finansal hesap YOK.
 */
function PaymentSummaryPanel({
  order,
  d,
  refundContext,
}: {
  order: Order;
  d: DetailDict;
  refundContext: RefundContext | null;
}) {
  const summary = order.salesSummary!;
  const currency = summary.currency;
  const succeededRefundMinor = refundContext?.succeededRefundMinor ?? 0;
  const netCollectedMinor = refundContext?.netCollectedMinor ?? 0;
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
      {succeededRefundMinor > 0 ? (
        <>
          <MoneyRow
            label={d.paymentRefunded}
            value={`−${formatMinor(succeededRefundMinor, currency)}`}
          />
          <div className="mt-1 flex items-center justify-between border-t border-white/[0.09] pt-2 text-sm">
            <span className="font-semibold text-white/90">{d.paymentNetCollected}</span>
            <span className="font-semibold text-white/90">{formatMinor(netCollectedMinor, currency)}</span>
          </div>
        </>
      ) : null}
      {/* TD-174B-1 — Ödeme dağılımı (settled attempt'ler). STORE_CREDIT = "Mağaza
          bakiyesi". Toplam = captured toplamı (invariant). Ham PAN gösterilmez. */}
      {order.paymentAllocations.length > 0 ? (
        <div className="mt-2 space-y-1 border-t border-white/[0.09] pt-2">
          <p className="text-[11px] uppercase tracking-wide text-white/35">{d.paymentAllocationTitle}</p>
          {order.paymentAllocations.map((allocation, index) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <span className="text-white/45">{allocationLabel(allocation, d)}</span>
              <span className="font-medium text-white/70">
                {formatMinor(allocation.amountMinor, allocation.currency)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
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
function SalesSummaryPanel({
  order,
  d,
  pendingReturn,
  locale,
}: {
  order: Order;
  d: DetailDict;
  // TODO-169 (blocker #7) — pending iade finansal etkisi varsa kâr KESİN gerçekleşmiş gibi gösterilmez.
  pendingReturn: boolean;
  locale: string;
}) {
  const summary = order.salesSummary;
  if (!summary) return null;
  const sales = summary.sales;
  const isTr = locale === "tr";
  return (
    <SurfaceCard title={d.salesSummaryTitle} description={d.salesSummarySubtitle}>
      {pendingReturn ? (
        <div className="mb-3">
          <Alert tone="warning">
            {isTr
              ? "İade süreci devam ediyor — kâr/net değerleri provizyonel; iade tamamlanana kadar kesinleşmez."
              : "A return is in progress — profit/net figures are provisional and not final until the return settles."}
          </Alert>
        </div>
      ) : null}
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
 * TODO-169 (blocker #6/#7) — Sipariş detayında iade talepleri + pending finansal etki.
 * RefundIntent PENDING "gerçekleşen iade" DEĞİLDİR: onaylanan niyet ile gerçekleşen AYRI gösterilir;
 * gerçekleşen (SUCCEEDED) refund yoksa açıkça "henüz gerçekleşmedi" belirtilir (TD-FR-7: gerçek refund
 * artık Ücret Özeti'nde de görünür). Gross satış ASLA düşülmez.
 */
function OrderReturnsSection({
  data,
  locale,
}: {
  data: AdminOrderReturnsResponse;
  locale: string;
}) {
  const isTr = locale === "tr";
  const s = data.summary;
  const realized = s.completedRefundMinor > 0;
  return (
    <SurfaceCard title={isTr ? "İadeler" : "Returns"}>
      {/* Pending finansal etki (niyet vs gerçekleşen). */}
      {s.approvedRefundIntentMinor > 0 ? (
        <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3">
          <MoneyRow
            label={isTr ? "Onaylanan iade niyeti" : "Approved refund intent"}
            value={formatMinor(s.approvedRefundIntentMinor, s.currency)}
          />
          <MoneyRow
            label={isTr ? "Gerçekleşen iade" : "Realized refund"}
            value={realized ? formatMinor(s.completedRefundMinor, s.currency) : "—"}
          />
          {!realized ? (
            <p className="mt-2 text-xs text-amber-200/70">
              {isTr
                ? "Para iadesi bekleniyor · iade gerçekleşince (SUCCEEDED) tahsilattan düşülür ve Ücret Özeti'nde görünür."
                : "Refund pending · deducted from collection once it succeeds and reflected in the Fee Summary."}
            </p>
          ) : (
            <p className="mt-2 text-xs text-amber-200/70">
              {isTr
                ? "Gerçekleşen iade tahsilattan düşülmüştür — detay için Ücret Özeti'ne bakın."
                : "The realized refund has been deducted from the collection — see the Fee Summary for detail."}
            </p>
          )}
        </div>
      ) : null}

      <ul className="space-y-2">
        {data.returns.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/85">{r.returnNumber}</p>
              <p className="text-xs text-white/40">
                {formatDate(r.requestedAt)} · {r.itemCount} {isTr ? "kalem" : "items"} ·{" "}
                {r.totalQuantity} {isTr ? "adet" : "qty"} · {returnResolutionLabel(r.resolutionType, locale)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={RETURN_STATUS_TONES[r.status]}>{returnStatusLabel(r.status, locale)}</Badge>
              <Link
                href={`/orders/returns/${r.id}`}
                className="text-xs font-medium text-white/60 underline decoration-white/20 underline-offset-2 hover:text-white/90"
              >
                {isTr ? "Detay" : "Detail"}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </SurfaceCard>
  );
}

/**
 * TODO-174 (ADR-275/278) — İptal detay paneli (sipariş CANCELLED iken). İptal
 * provenance'ını (kaynak/kategori/neden/müşteri notu) + iptal tarihini gösterir ve
 * refund-context'ten OTOMATİK iade durumunu türetir (RefundIntent/OrderRefund
 * SUCCEEDED figürleri; client'ta finansal hesap YOK — yalnız türetilmiş durum).
 * Başarısız iade (tahsilat var, gerçekleşen/işlenen iade yok) → kurtarma uyarısı.
 */
function OrderCancellationSection({
  order,
  refundContext,
  locale,
}: {
  order: Order;
  refundContext: RefundContext | null;
  locale: string;
}) {
  const isTr = locale === "tr";
  const captured = refundContext?.capturedMinor ?? 0;
  const succeeded = refundContext?.succeededRefundMinor ?? 0;
  const active = refundContext?.activeRefundMinor ?? 0;
  const currency = refundContext?.currency ?? order.currency;
  // TODO-175 (ADR-285) — müşterinin iptal geri ödemesi hedefi (iki-defter ayrımı). Refund satırları
  // taşır (legacy null olabilir); INTERNAL_CREDIT yürütmesi = alışveriş bakiyesi (dış PSP legi yok).
  const cancellationDestination =
    refundContext?.refunds.find((r) => r.refundDestination)?.refundDestination ?? null;
  const hasInternalCredit =
    refundContext?.refunds.some((r) => r.executionMode === "INTERNAL_CREDIT") ?? false;

  // Otomatik iade durumu — refund-context'ten türetilir (sıra önemli).
  type RefundView = { tone: "success" | "info" | "warning" | "neutral"; text: string; hint?: string; failed?: boolean };
  const refundView: RefundView | null = (() => {
    if (!refundContext) return null;
    if (captured === 0) {
      return {
        tone: "neutral",
        text: isTr ? "Ödeme alınmadığı için iade yok" : "No refund — no payment was captured",
      };
    }
    if (succeeded >= captured) {
      return { tone: "success", text: isTr ? "İade tamamlandı" : "Refund completed" };
    }
    if (active > 0) {
      return { tone: "info", text: isTr ? "İade işleniyor" : "Refund processing" };
    }
    if (succeeded > 0) {
      return {
        tone: "info",
        text: isTr ? "Kısmi iade gerçekleşti" : "Partial refund completed",
        hint: isTr
          ? "Tahsil edilen tutarın bir kısmı iade edildi — kalan için Ücret Özeti / iade araçlarına bakın."
          : "Part of the captured amount was refunded — see the Fee Summary / refund tools for the remainder.",
      };
    }
    return {
      tone: "warning",
      failed: true,
      text: isTr ? "İade başarısız — kurtarma gerekli" : "Refund failed — recovery required",
      hint: isTr
        ? "Tahsilat var ancak gerçekleşen ya da işlenen iade yok. İade araçlarını (Ücret Özeti / iade paneli) kullanarak iadeyi başlatın."
        : "Payment was captured but no refund succeeded or is processing. Use the refund tools (Fee Summary / refund panel) to initiate the refund.",
    };
  })();

  return (
    <SurfaceCard title={isTr ? "İptal detayı" : "Cancellation detail"}>
      <div className="divide-y divide-white/[0.06]">
        <RailRow
          label={isTr ? "İptal kaynağı" : "Cancellation source"}
          value={order.cancelSource ? cancellationSourceLabel(order.cancelSource, locale) : "—"}
        />
        <RailRow
          label={isTr ? "İptal tarihi" : "Cancelled at"}
          value={order.cancelledAt ? formatDate(order.cancelledAt) : "—"}
        />
        <RailRow
          label={isTr ? "Neden kategorisi" : "Reason category"}
          value={
            order.cancelReasonCategory
              ? cancellationReasonCategoryLabel(order.cancelReasonCategory, locale)
              : "—"
          }
        />
        <RailRow
          label={isTr ? "Neden" : "Reason"}
          value={
            order.cancelReasonCode
              ? cancellationReasonLabel(order.cancelReasonCode, locale)
              : order.cancelReason ?? "—"
          }
        />
        {order.cancelReasonNote ? (
          <RailRow label={isTr ? "Müşteri notu" : "Customer note"} value={order.cancelReasonNote} />
        ) : null}
        {/* TODO-175 (ADR-285) — müşterinin seçtiği iade yöntemi (varsa). Ham enum değil, insani etiket. */}
        {cancellationDestination ? (
          <RailRow
            label={isTr ? "İade yöntemi" : "Refund method"}
            value={
              <Badge tone={REFUND_DESTINATION_TONES[cancellationDestination]}>
                {refundDestinationLabel(cancellationDestination, locale)}
              </Badge>
            }
          />
        ) : null}
      </div>

      {/* INTERNAL_CREDIT yürütmesi = alışveriş bakiyesi (dahili); dış ödeme sağlayıcısı kullanılmaz. */}
      {hasInternalCredit ? (
        <p className="mt-3 text-xs leading-relaxed text-white/45">
          {isTr
            ? "Bu iade alışveriş bakiyesine (dahili kredi) yapıldı — dış ödeme sağlayıcısı kullanılmadı."
            : "This refund was issued to the shopping balance (internal credit) — no external payment provider was used."}
        </p>
      ) : null}

      {/* Otomatik iade durumu (refund-context türevi). */}
      {refundView ? (
        <div className="mt-4">
          {refundView.failed ? (
            <Alert tone="warning" title={refundView.text}>
              {refundView.hint}
            </Alert>
          ) : (
            <div className="rounded-xl border border-white/[0.09] bg-white/[0.04] p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-white/70">
                  {isTr ? "Otomatik iade" : "Automatic refund"}
                </span>
                <Badge tone={refundView.tone}>{refundView.text}</Badge>
              </div>
              {captured > 0 ? (
                <div className="mt-2 divide-y divide-white/[0.06]">
                  <MoneyRow
                    label={isTr ? "Tahsil edilen" : "Captured"}
                    value={formatMinor(captured, currency)}
                  />
                  <MoneyRow
                    label={isTr ? "Gerçekleşen iade" : "Refunded"}
                    value={formatMinor(succeeded, currency)}
                  />
                </div>
              ) : null}
              {refundView.hint ? (
                <p className="mt-2 text-xs text-white/40">{refundView.hint}</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
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

  // TODO-169 (blocker #6/#7) — sipariş detayında ORTAK iade özeti + o siparişin talepleri.
  // Fail-open: iade verisi alınamazsa sipariş görünümü bozulmaz (null → bölüm gizlenir).
  const [orderReturns, setOrderReturns] = useState<AdminOrderReturnsResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    void storeApi
      .getOrderReturnSummary(orderId)
      .then((res) => {
        if (!cancelled) setOrderReturns(res);
      })
      .catch(() => {
        if (!cancelled) setOrderReturns(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // TD-FR-7 — Ücret Özeti'nde gerçekleşen (yalnız SUCCEEDED) iade + iade sonrası net
  // tahsilat gösterimi için order-level refund-context. Fail-open: alınamazsa panel
  // yalnız mevcut satırları gösterir (yeni satırlar gizlenir).
  const [refundContext, setRefundContext] = useState<RefundContext | null>(null);
  useEffect(() => {
    let cancelled = false;
    void storeApi
      .getOrderRefundContext(orderId)
      .then((res) => {
        if (!cancelled) setRefundContext(res.context);
      })
      .catch(() => {
        if (!cancelled) setRefundContext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // TD-174B-1 — Sipariş Deneyimi kartı verisi (tek-sipariş özeti). Fail-open: alınamazsa
  // veya review yoksa (null) kart gizlenir; sipariş görünümü bozulmaz.
  const [orderExperience, setOrderExperience] = useState<OrderExperienceSummaryDto | null>(null);
  useEffect(() => {
    let cancelled = false;
    void storeApi
      .getOrderExperienceForOrder(orderId)
      .then((res) => {
        if (!cancelled) setOrderExperience(res);
      })
      .catch(() => {
        if (!cancelled) setOrderExperience(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

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

                {/* TODO-169 (blocker #6/#7) — Sipariş detayına iade entegrasyonu: bu siparişin iade
                    talepleri + pending finansal etki (RefundIntent PENDING ≠ gerçekleşen iade). */}
                {orderReturns && orderReturns.returns.length > 0 ? (
                  <OrderReturnsSection data={orderReturns} locale={locale} />
                ) : null}

                {/* TODO-174 (ADR-275/278) — İptal detayı: iptal edilen siparişte provenance +
                    otomatik iade durumu (refund-context türevi). */}
                {order.status === "CANCELLED" ? (
                  <OrderCancellationSection
                    order={order}
                    refundContext={refundContext}
                    locale={locale}
                  />
                ) : null}

                {/* F4C (ADR-064) — Bölüm A (ödeme özeti) + Bölüm B (satış özeti).
                    Sunucu salesSummary dönmezse legacy tutar kartına düşülür. */}
                {order.salesSummary ? (
                  <>
                    <PaymentSummaryPanel order={order} d={d} refundContext={refundContext} />
                    <SalesSummaryPanel
                      order={order}
                      d={d}
                      locale={locale}
                      pendingReturn={Boolean(orderReturns?.summary.hasPendingFinancialImpact)}
                    />
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

                {/* TODO-159F — Ödeme tahsilat aksiyonları (kalan bakiye + link + manuel). */}
                <OrderPaymentActions
                  orderId={order.id}
                  d={d.recovery}
                  locale={locale as "tr" | "en"}
                  onChanged={load}
                />

                <PaymentPanel order={order} d={d} />

                {/* TD-174B-1 — Sipariş Deneyimi kartı (review varsa). Fail-open: null → gizli. */}
                {orderExperience ? (
                  <OrderExperienceCard summary={orderExperience} d={d} locale={locale} />
                ) : null}

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
                    {/* TODO-174A — İptal nedeni burada HAM `cancelReason` (kod) olarak render
                        ediliyordu (ör. WILL_NOT_ARRIVE_IN_TIME). Kaldırıldı: neden, iptal edilen
                        siparişte ana kolondaki "İptal detayı" kartında (OrderCancellationSection)
                        i18n/registry'den ÇÖZÜMLENMİŞ label ile zaten gösterilir. Ham kod UI'a sızmaz. */}
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
