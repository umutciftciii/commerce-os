/**
 * TODO-173 (ADR-274) — Reverse shipment + disposition SAF serileştiricileri (DB YOK; in-memory türetme).
 * Admin DTO internal reason'ı taşır (yalnız store-admin yüzeyi). Müşteri DTO'su teknik disposition
 * kodu / internal reason / recipient PII TAŞIMAZ (refund'dan ayrık, sade tracking).
 */
import type { ShipmentStatus } from "@prisma/client";
import type {
  AdminReturnDisposition,
  ReverseShipment,
  CustomerReverseShipment,
  ReturnRejectedDispositionValue,
  ReturnDispositionStatusValue,
} from "@commerce-os/contracts";
import { REVERSE_CONSUMING_STATUSES } from "./reverse-shipment.js";

export interface DispositionRow {
  id: string;
  returnItemId: string;
  type: ReturnRejectedDispositionValue;
  quantity: number;
  status: ReturnDispositionStatusValue;
  reason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReverseShipmentRow {
  id: string;
  direction: "OUTBOUND_TO_CUSTOMER" | "CUSTOMER_RETURN_TO_STORE" | "STORE_RETURN_TO_CUSTOMER";
  returnRequestId: string | null;
  returnItemId: string | null;
  returnQuantity: number | null;
  status: ShipmentStatus;
  carrierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  reverseShipmentReason: string | null;
  recipientName: string | null;
  recipientCityName: string | null;
  recipientDistrictName: string | null;
  recipientAddress: string | null;
  estimatedDeliveryAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReverseItemInput {
  rejectedQuantity: number | null;
  dispositions: DispositionRow[];
  reverseShipments: ReverseShipmentRow[];
}

function isConsuming(status: ShipmentStatus): boolean {
  return REVERSE_CONSUMING_STATUSES.includes(status);
}

export function serializeReverseShipment(row: ReverseShipmentRow): ReverseShipment {
  return {
    id: row.id,
    direction: row.direction,
    returnRequestId: row.returnRequestId,
    returnItemId: row.returnItemId,
    returnQuantity: row.returnQuantity,
    status: row.status,
    carrierName: row.carrierName,
    trackingNumber: row.trackingNumber,
    trackingUrl: row.trackingUrl,
    reason: row.reverseShipmentReason,
    recipientName: row.recipientName,
    recipientCityName: row.recipientCityName,
    recipientDistrictName: row.recipientDistrictName,
    recipientAddress: row.recipientAddress,
    estimatedDeliveryAt: row.estimatedDeliveryAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Bir ReturnItem'ın disposition'ları + reverse shipment'larından admin görünüm alanlarını türetir.
 * Per-disposition reverseShipped/remaining, RETURN_TO_CUSTOMER dispositionlarına en-eski-önce greedy
 * dağıtımla hesaplanır (shipment'lar tek bir disposition satırına bağlı değildir).
 */
export function serializeReverseForItem(item: ReverseItemInput): {
  dispositions: AdminReturnDisposition[];
  reverseShipments: ReverseShipment[];
  undispositionedRejectedQuantity: number;
} {
  const rejected = item.rejectedQuantity ?? 0;
  const activeDispositions = item.dispositions.filter((d) => d.status !== "CANCELLED");
  const sumActive = activeDispositions.reduce((a, d) => a + d.quantity, 0);
  const undispositionedRejectedQuantity = Math.max(0, rejected - sumActive);

  // RETURN_TO_CUSTOMER dispositionlarına greedy dağıtılacak toplam sevk edilmiş (tüketen) adet.
  let unallocatedReversed = item.reverseShipments
    .filter((s) => isConsuming(s.status))
    .reduce((a, s) => a + (s.returnQuantity ?? 0), 0);

  const rtcOrdered = [...item.dispositions]
    .filter((d) => d.type === "RETURN_TO_CUSTOMER" && d.status !== "CANCELLED")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const shippedByDisposition = new Map<string, number>();
  for (const d of rtcOrdered) {
    const alloc = Math.min(d.quantity, Math.max(0, unallocatedReversed));
    shippedByDisposition.set(d.id, alloc);
    unallocatedReversed -= alloc;
  }

  const dispositions: AdminReturnDisposition[] = item.dispositions.map((d) => {
    const shipped = d.type === "RETURN_TO_CUSTOMER" ? shippedByDisposition.get(d.id) ?? 0 : 0;
    const remaining =
      d.type === "RETURN_TO_CUSTOMER" && d.status !== "CANCELLED"
        ? Math.max(0, d.quantity - shipped)
        : 0;
    return {
      id: d.id,
      returnItemId: d.returnItemId,
      type: d.type,
      quantity: d.quantity,
      status: d.status,
      reason: d.reason,
      version: d.version,
      reverseShippedQuantity: shipped,
      reverseShippableRemaining: remaining,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  });

  return {
    dispositions,
    reverseShipments: item.reverseShipments.map(serializeReverseShipment),
    undispositionedRejectedQuantity,
  };
}

/** Müşteri sade reverse tracking görünümü (internal reason / disposition kodu / PII YOK). */
export function serializeCustomerReverseShipment(
  row: ReverseShipmentRow,
  product: { title: string; variantTitle: string | null },
): CustomerReverseShipment {
  // "shippedAt" = ilk kargoya-veriliş (IN_TRANSIT+) anlamı; createdAt DRAFT'tır. Basit türetme:
  // DELIVERED/consuming ise createdAt'i shippedAt say (manuel akış), aksi halde null.
  const shipped = row.status !== "DRAFT" ? row.createdAt.toISOString() : null;
  return {
    productTitle: product.title,
    variantTitle: product.variantTitle,
    quantity: row.returnQuantity ?? 0,
    carrierName: row.carrierName,
    trackingNumber: row.trackingNumber,
    trackingUrl: row.trackingUrl,
    status: row.status,
    shippedAt: shipped,
    estimatedDeliveryAt: row.estimatedDeliveryAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
  };
}
