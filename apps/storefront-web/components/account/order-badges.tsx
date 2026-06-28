import { Badge } from "@commerce-os/ui";
import type { CustomerOrderSummary } from "@commerce-os/api-client";
import type { StorefrontDictionary } from "@commerce-os/i18n";

/**
 * TODO-079 — Müşteri-facing sipariş durum rozetleri. Etiketler i18n'den (dürüst,
 * mevcut enum'a birebir). Gerçek kargo takibi YOK; "Henüz kargoya verilmedi" gibi
 * fulfillment durumları enum'dan türetilir (takip no üretilmez).
 */
type OrdersDict = StorefrontDictionary["account"]["orders"];
type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const STATUS_TONE: Record<CustomerOrderSummary["status"], Tone> = {
  DRAFT: "neutral",
  PLACED: "info",
  CONFIRMED: "info",
  CANCELLED: "danger",
  FULFILLED: "success",
};

const PAYMENT_TONE: Record<CustomerOrderSummary["paymentStatus"], Tone> = {
  UNPAID: "warning",
  AUTHORIZED: "info",
  PAID: "success",
  REFUNDED: "neutral",
};

const FULFILLMENT_TONE: Record<CustomerOrderSummary["fulfillmentStatus"], Tone> = {
  UNFULFILLED: "warning",
  PARTIAL: "info",
  FULFILLED: "success",
  CANCELLED: "danger",
};

export function OrderStatusBadges({
  t,
  status,
  paymentStatus,
  fulfillmentStatus,
}: {
  t: OrdersDict;
  status: CustomerOrderSummary["status"];
  paymentStatus: CustomerOrderSummary["paymentStatus"];
  fulfillmentStatus: CustomerOrderSummary["fulfillmentStatus"];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge tone={STATUS_TONE[status]} dot>
        {t.statusValues[status]}
      </Badge>
      <Badge tone={PAYMENT_TONE[paymentStatus]} dot>
        {t.paymentValues[paymentStatus]}
      </Badge>
      <Badge tone={FULFILLMENT_TONE[fulfillmentStatus]} dot>
        {t.fulfillmentValues[fulfillmentStatus]}
      </Badge>
    </div>
  );
}
