import { Badge } from "@commerce-os/ui";
import type {
  CustomerOrderSummary,
  OrderFulfillmentDisplay,
  OrderSummaryShipmentStatus,
} from "@commerce-os/api-client";
import { getOrderFulfillmentDisplay } from "@commerce-os/api-client";
import type { StorefrontDictionary } from "@commerce-os/i18n";

/**
 * TODO-079 — Müşteri-facing sipariş durum rozetleri. Etiketler i18n'den (dürüst,
 * mevcut enum'a birebir).
 *
 * TODO-135 — Karşılama rozeti, kargo kaydı VARSA hazırlık durumunu yansıtır
 * (getOrderFulfillmentDisplay). ADR-045: ORDER_CREATED "Gönderi oluşturuldu"dur,
 * fiziksel "kargoya verildi" DEĞİL → asla "yolda/teslim" olarak gösterilmez. Order
 * fulfillmentStatus MUTATE EDİLMEZ; bu yalnız gösterim eşlemesidir.
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

// TODO-135 — GÖSTERİM durumundan (kargo hazırlık dahil) rozet tonu.
const FULFILLMENT_DISPLAY_TONE: Record<OrderFulfillmentDisplay, Tone> = {
  NOT_SHIPPED: "warning",
  SHIPMENT_CREATED: "info",
  IN_TRANSIT: "info",
  DELIVERED: "success",
  FULFILLED: "success",
  PARTIAL: "info",
  CANCELLED: "danger",
};

export function OrderStatusBadges({
  t,
  status,
  paymentStatus,
  fulfillmentStatus,
  shipmentStatus,
}: {
  t: OrdersDict;
  status: CustomerOrderSummary["status"];
  paymentStatus: CustomerOrderSummary["paymentStatus"];
  fulfillmentStatus: CustomerOrderSummary["fulfillmentStatus"];
  // Kargo kaydı varsa temsili durum; yoksa null/undefined (rozet sipariş seviyesine düşer).
  shipmentStatus?: OrderSummaryShipmentStatus | null;
}) {
  const fulfillmentDisplay = getOrderFulfillmentDisplay(fulfillmentStatus, shipmentStatus ?? null);
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge tone={STATUS_TONE[status]} dot>
        {t.statusValues[status]}
      </Badge>
      <Badge tone={PAYMENT_TONE[paymentStatus]} dot>
        {t.paymentValues[paymentStatus]}
      </Badge>
      <Badge tone={FULFILLMENT_DISPLAY_TONE[fulfillmentDisplay]} dot>
        {t.fulfillmentDisplay[fulfillmentDisplay]}
      </Badge>
    </div>
  );
}
