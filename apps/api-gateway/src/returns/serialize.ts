/**
 * TODO-169 (ADR-269) — İade DTO serileştiricileri (allowlist). Admin yüzeyi adminNote + actorId
 * görür; müşteri yüzeyi GÖRMEZ. Attachment URL'leri auth-gate'li route yollarıdır (public /media DEĞİL).
 */
import type {
  ReturnStatus,
  ReturnActorType,
  ReturnReason,
  ReturnResolutionType,
  ReturnItemConditionStatus,
  ReturnInspectionResult,
  ReturnRestockDecision,
  RefundIntentStatus,
  PaymentStatus,
  AddressType,
} from "@prisma/client";
import type { AdminReturnRefundSummary } from "@commerce-os/contracts";
import {
  serializeReverseForItem,
  type DispositionRow,
  type ReverseShipmentRow,
} from "./reverse-serialize.js";

const DAY = 24 * 60 * 60 * 1000;

function ageDaysFrom(requestedAt: Date, now: number): number {
  return Math.max(0, Math.floor((now - requestedAt.getTime()) / DAY));
}

// ── Admin liste ──────────────────────────────────────────────────────────────────
export interface AdminReturnListRow {
  id: string;
  returnNumber: string;
  status: ReturnStatus;
  resolutionType: ReturnResolutionType;
  requestedAt: Date;
  returnWindowEndsAt: Date;
  order: { orderNumber: string };
  customer: { firstName: string | null; lastName: string | null; email: string | null } | null;
  items: Array<{ quantity: number }>;
}

export function serializeAdminReturnListItem(row: AdminReturnListRow, now: number) {
  const name = row.customer
    ? [row.customer.firstName, row.customer.lastName].filter(Boolean).join(" ").trim() || null
    : null;
  return {
    id: row.id,
    returnNumber: row.returnNumber,
    orderNumber: row.order.orderNumber,
    customerName: name,
    customerEmail: row.customer?.email ?? null,
    itemCount: row.items.length,
    totalQuantity: row.items.reduce((a, b) => a + b.quantity, 0),
    resolutionType: row.resolutionType,
    status: row.status,
    requestedAt: row.requestedAt.toISOString(),
    returnWindowEndsAt: row.returnWindowEndsAt.toISOString(),
    ageDays: ageDaysFrom(row.requestedAt, now),
  };
}

// ── Admin detay ────────────────────────────────────────────────────────────────
export interface AdminReturnDetailRow {
  id: string;
  storeId: string;
  returnNumber: string;
  status: ReturnStatus;
  resolutionType: ReturnResolutionType;
  customerNote: string | null;
  adminNote: string | null;
  rejectionReason: string | null;
  returnCarrier: string | null;
  returnTrackingNumber: string | null;
  refundShipping: boolean;
  returnWindowEndsAt: Date;
  requestedAt: Date;
  version: number;
  order: {
    orderNumber: string;
    paymentStatus: PaymentStatus;
    addresses: Array<{
      type: AddressType;
      fullName: string;
      phone: string | null;
      countryCode: string;
      city: string;
      district: string | null;
      addressLine1: string;
      addressLine2: string | null;
      postalCode: string | null;
    }>;
  };
  customer: { firstName: string | null; lastName: string | null; email: string | null } | null;
  items: Array<{
    id: string;
    orderLineId: string;
    quantity: number;
    approvedQuantity: number | null;
    rejectedQuantity: number | null;
    reason: ReturnReason;
    customerComment: string | null;
    conditionStatus: ReturnItemConditionStatus | null;
    inspectionResult: ReturnInspectionResult | null;
    restockDecision: ReturnRestockDecision | null;
    restockedAt: Date | null;
    orderLine: {
      id: string;
      productId: string;
      title: string;
      variantTitle: string;
      sku: string;
      quantity: number;
      unitPriceAmount: number;
    };
    attachments: Array<{ id: string; type: string }>;
    // TODO-173 (ADR-274) — reddedilen adet disposition'ları + bu kalemin reverse shipment'ları.
    dispositions: DispositionRow[];
    shipments: ReverseShipmentRow[];
  }>;
  history: Array<{
    fromStatus: ReturnStatus | null;
    toStatus: ReturnStatus;
    actorType: ReturnActorType;
    actorId: string | null;
    note: string | null;
    createdAt: Date;
  }>;
  refundIntent: {
    currency: string;
    productRefundMinor: number;
    shippingRefundMinor: number;
    taxRefundMinor: number;
    totalRefundMinor: number;
    status: RefundIntentStatus;
  } | null;
}

export function serializeAdminReturnDetail(
  row: AdminReturnDetailRow,
  priorHeld: Map<string, number>,
  // TODO-169 (blocker #3) / BUG-CART-005 — OrderLine.id → kapak URL'i (store-scoped; varyant-farkında,
  // snapshot öncelikli). Kapaksız → null (placeholder).
  covers: Map<string, string> = new Map(),
  // TODO-170 (ADR-272) — ledger-otoriteli refund özeti (route'ta hesaplanır; yoksa null).
  refundSummary: AdminReturnRefundSummary | null = null,
) {
  const name = row.customer
    ? [row.customer.firstName, row.customer.lastName].filter(Boolean).join(" ").trim() || null
    : null;
  const shipping = row.order.addresses.find((a) => a.type === "SHIPPING");
  const currency = row.refundIntent?.currency ?? "TRY";
  return {
    id: row.id,
    returnNumber: row.returnNumber,
    orderNumber: row.order.orderNumber,
    status: row.status,
    resolutionType: row.resolutionType,
    currency,
    customerName: name,
    customerEmail: row.customer?.email ?? null,
    shippingAddress: shipping
      ? {
          fullName: shipping.fullName,
          phone: shipping.phone,
          countryCode: shipping.countryCode,
          city: shipping.city,
          district: shipping.district,
          addressLine1: shipping.addressLine1,
          addressLine2: shipping.addressLine2,
          postalCode: shipping.postalCode,
        }
      : null,
    customerNote: row.customerNote,
    adminNote: row.adminNote,
    rejectionReason: row.rejectionReason,
    returnCarrier: row.returnCarrier,
    returnTrackingNumber: row.returnTrackingNumber,
    refundShipping: row.refundShipping,
    returnWindowEndsAt: row.returnWindowEndsAt.toISOString(),
    requestedAt: row.requestedAt.toISOString(),
    version: row.version,
    orderPaymentStatus: mapCustomerPaymentStatus(row.order.paymentStatus),
    items: row.items.map((item) => ({
      id: item.id,
      orderLineId: item.orderLineId,
      title: item.orderLine.title,
      variantTitle: item.orderLine.variantTitle,
      sku: item.orderLine.sku,
      // TODO-169 (blocker #3) — önce store-scoped ürün kapak görseli; yoksa null → ortak placeholder.
      // cross-store medya ASLA (covers store-scoped sorgudan gelir). BUG-CART-005 — satır-bazlı.
      imageUrl: covers.get(item.orderLine.id) ?? null,
      quantity: item.quantity,
      approvedQuantity: item.approvedQuantity,
      rejectedQuantity: item.rejectedQuantity,
      reason: item.reason,
      customerComment: item.customerComment,
      conditionStatus: item.conditionStatus,
      inspectionResult: item.inspectionResult,
      restockDecision: item.restockDecision,
      restockedAt: item.restockedAt?.toISOString() ?? null,
      unitPriceMinor: item.orderLine.unitPriceAmount,
      purchasedQuantity: item.orderLine.quantity,
      priorReturnedQuantity: priorHeld.get(item.orderLineId) ?? 0,
      attachments: item.attachments.map((att) => ({
        id: att.id,
        type: att.type,
        // Auth-gate'li admin attachment stream yolu (store-admin BFF proxy'ler).
        url: `/stores/${row.storeId}/returns/${row.id}/attachments/${att.id}`,
      })),
      // TODO-173 (ADR-274) — disposition + reverse shipment türetmeleri (in-memory; ek sorgu yok).
      ...serializeReverseForItem({
        rejectedQuantity: item.rejectedQuantity,
        dispositions: item.dispositions,
        reverseShipments: item.shipments,
      }),
    })),
    history: row.history.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      actorType: h.actorType,
      actorId: h.actorId,
      note: h.note,
      createdAt: h.createdAt.toISOString(),
    })),
    refundIntent: row.refundIntent
      ? {
          currency: row.refundIntent.currency,
          productRefundMinor: row.refundIntent.productRefundMinor,
          shippingRefundMinor: row.refundIntent.shippingRefundMinor,
          taxRefundMinor: row.refundIntent.taxRefundMinor,
          totalRefundMinor: row.refundIntent.totalRefundMinor,
          status: row.refundIntent.status,
        }
      : null,
    refundSummary,
  };
}

// customerOrderPaymentStatusSchema yalnız UNPAID/AUTHORIZED/PAID/REFUNDED taşır (allowlist);
// order paymentStatus'ün geri kalanı en yakın müşteri-güvenli değere eşlenir.
function mapCustomerPaymentStatus(status: PaymentStatus): "UNPAID" | "AUTHORIZED" | "PAID" | "REFUNDED" {
  switch (status) {
    case "PAID":
      return "PAID";
    case "AUTHORIZED":
      return "AUTHORIZED";
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "REFUNDED";
    default:
      return "UNPAID";
  }
}
