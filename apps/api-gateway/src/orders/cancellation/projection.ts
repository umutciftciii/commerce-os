/**
 * TODO-174 (ADR-275/276) — Sipariş iptal uygunluğu ÖZETİ projeksiyonu (server-authoritative; TEK otorite).
 * Müşteri sipariş listesi/detayı AYNI özeti kullanır (React'te yeniden hesap YOK). Store-admin de reuse edebilir.
 *
 * Her sipariş için: eligibility state (carrier-handoff sınırı) + isPaid + estimatedRefund (captured − aktif/
 * succeeded ledger) + iptal provenance (source/reason) + iptal refund'unun MASKELİ durumu. Batched sorgular
 * (shipment/paymentAttempt/orderRefund) → N+1 yok.
 */
import type {
  OrderCancellationReason,
  OrderCancellationReasonCategory,
  OrderCancellationSource,
  OrderStatus,
  PaymentAttemptStatus,
  Prisma,
  PrismaClient,
  ShipmentDirection,
  ShipmentStatus,
} from "@prisma/client";
import type { CancellationOrderSummary, CancellationRefundStatus } from "@commerce-os/contracts";
import { sumCapturedMinor } from "../../payments/payment-state.js";
import { computeRefundableRemainingMinor, type RefundLedgerRow } from "../../refunds/cap-calc.js";
import { computeCancellationEligibility } from "./eligibility.js";

type Db = Prisma.TransactionClient | PrismaClient;

export interface CancellationProjectionOrder {
  id: string;
  currency: string;
  status: OrderStatus;
  version: number;
  cancelSource: OrderCancellationSource | null;
  cancelledAt: Date | null;
  cancelReasonCode: OrderCancellationReason | null;
  cancelReasonCategory: OrderCancellationReasonCategory | null;
  cancelReasonNote: string | null;
}

/** OrderRefund → vitrin MASKELİ refund durumu (teknik provider kodu YOK). CANCELLED ledger → NONE. */
function maskRefundStatus(status: string): CancellationRefundStatus {
  switch (status) {
    case "PENDING":
      return "PENDING";
    case "PROCESSING":
      return "PROCESSING";
    case "SUCCEEDED":
      return "SUCCEEDED";
    case "FAILED":
      return "FAILED";
    default:
      return "NONE";
  }
}

export async function computeCancellationOrderSummaries(
  db: Db,
  storeId: string,
  orders: CancellationProjectionOrder[],
  now: Date,
): Promise<Map<string, CancellationOrderSummary>> {
  void now;
  const byId = new Map<string, CancellationOrderSummary>();
  if (orders.length === 0) return byId;
  const orderIds = orders.map((o) => o.id);

  const [shipments, attempts, refunds] = await Promise.all([
    db.shipment.findMany({
      where: { storeId, orderId: { in: orderIds }, direction: "OUTBOUND_TO_CUSTOMER" },
      select: { orderId: true, status: true },
    }),
    db.paymentAttempt.findMany({
      where: { storeId, orderId: { in: orderIds } },
      select: { orderId: true, status: true, amount: true, currency: true },
    }),
    db.orderRefund.findMany({
      where: { storeId, orderId: { in: orderIds } },
      select: {
        orderId: true,
        status: true,
        totalRefundMinor: true,
        currency: true,
        returnRequestId: true,
        refundIntentId: true,
      },
    }),
  ]);

  const shipmentsByOrder = new Map<string, Array<{ status: ShipmentStatus }>>();
  for (const s of shipments) {
    const list = shipmentsByOrder.get(s.orderId) ?? [];
    list.push({ status: s.status });
    shipmentsByOrder.set(s.orderId, list);
  }
  const attemptsByOrder = new Map<string, Array<{ status: string; amount: number; currency: string }>>();
  for (const a of attempts) {
    const list = attemptsByOrder.get(a.orderId) ?? [];
    list.push({ status: a.status, amount: a.amount, currency: a.currency });
    attemptsByOrder.set(a.orderId, list);
  }
  const refundsByOrder = new Map<
    string,
    Array<{ status: string; totalRefundMinor: number; currency: string; returnRequestId: string | null; refundIntentId: string | null }>
  >();
  for (const r of refunds) {
    const list = refundsByOrder.get(r.orderId) ?? [];
    list.push(r);
    refundsByOrder.set(r.orderId, list);
  }

  for (const order of orders) {
    const orderShipments = (shipmentsByOrder.get(order.id) ?? []).map((s) => ({
      direction: "OUTBOUND_TO_CUSTOMER" as ShipmentDirection,
      status: s.status,
    }));
    const eligibility = computeCancellationEligibility({ orderStatus: order.status, shipments: orderShipments });

    const orderAttempts = (attemptsByOrder.get(order.id) ?? []).filter((a) => a.currency === order.currency);
    const captured = sumCapturedMinor(orderAttempts as Array<{ status: PaymentAttemptStatus; amount: number }>);
    const ledger: RefundLedgerRow[] = (refundsByOrder.get(order.id) ?? []).map((r) => ({
      status: r.status as RefundLedgerRow["status"],
      totalRefundMinor: r.totalRefundMinor,
      currency: r.currency,
    }));
    const estimatedRefundMinor = computeRefundableRemainingMinor(captured, ledger, order.currency);

    // İptal refund'u (intent'siz + return'süz OrderRefund) → MASKELİ durum.
    const cancellationRefund = (refundsByOrder.get(order.id) ?? []).find(
      (r) => r.returnRequestId === null && r.refundIntentId === null,
    );
    const refundStatus: CancellationRefundStatus | null =
      order.status === "CANCELLED"
        ? cancellationRefund
          ? maskRefundStatus(cancellationRefund.status)
          : "NONE"
        : null;

    byId.set(order.id, {
      eligibility,
      currency: order.currency,
      version: order.version,
      isPaid: captured > 0,
      estimatedRefundMinor,
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      cancelSource: order.cancelSource,
      reasonCode: order.cancelReasonCode,
      reasonCategory: order.cancelReasonCategory,
      reasonNote: order.cancelReasonNote,
      refundStatus,
    });
  }

  return byId;
}
