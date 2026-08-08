/**
 * TODO-174 (ADR-275/276/277/278) — Customer Self-Service Order Cancellation · domain servisi.
 *
 * Framework-agnostik (prisma doğrudan). Beklenen domain hataları THROW EDİLMEZ — `{ ok:false, code }`
 * sentinel döner; route katmanı HTTP'ye eşler (fail-closed). Tüm sorgular storeId + customerId scoped
 * (cross-store/cross-customer → ORDER_NOT_FOUND, enumeration sızıntısı yok).
 *
 * Tek transaction (advisory-locked): eligibility re-check (shipment FOR UPDATE) → version-guarded
 * CANCELLED geçişi → reservation release (paylaşılan helper) → pre-handoff outbound shipment CANCELLED →
 * coupon/campaign rollback → refund PENDING ledger (intent'siz) → OrderEvent + AuditLog. Provider refund
 * yürütmesi commit SONRASI (ADR-276: provider sonucu iptalle ATOMİK DEĞİL). Idempotent: zaten CANCELLED
 * sipariş no-op (alreadyCancelled:true). Concurrency: advisory lock cancel-vs-cancel + cancel-vs-refund'ı
 * serialize eder; shipment FOR UPDATE cancel-vs-handoff'u serialize eder (yalnız biri kazanır).
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type { OrderStatus, RefundDestination, ShipmentDirection, ShipmentStatus, ShippingProviderType } from "@prisma/client";
import {
  isActiveCancellationReason,
  cancellationReasonCategory,
  cancellationReasonRequiresNote,
  type OrderCancellationReasonValue,
} from "@commerce-os/contracts";
import { releaseOrderReservations } from "@commerce-os/inventory";
import {
  getOrderExternalRefundableMinor,
  prepareCancellationRefund,
  runCancellationRefundExecution,
  type CancellationRefundPrep,
  type RefundServiceDeps,
} from "../../refunds/service.js";
import { getOrderCreditRestorableMinor, restoreCreditForOrderInTx } from "../../customer-credit/service.js";
import { resolveDestinationEligibility } from "../../refunds/destination-calc.js";
import { releaseOrderCampaignConsumption } from "../../campaigns/cancellation-rollback.js";
import {
  computeCancellationEligibility,
  isPreHandoffOutbound,
  type CancellationShipmentInput,
} from "./eligibility.js";

type Tx = Prisma.TransactionClient;

export type CancelOrderErrorCode =
  | "ORDER_NOT_FOUND"
  | "NOT_CANCELLABLE"
  | "BLOCKED_IN_TRANSIT"
  | "BLOCKED_DELIVERED"
  | "INVALID_REASON"
  | "NOTE_REQUIRED"
  | "INVALID_DESTINATION"
  | "CANCEL_CONFLICT";

export interface CancelOrderInput {
  storeId: string;
  customerId: string;
  orderNumber: string;
  reasonCode: OrderCancellationReasonValue;
  reasonNote?: string | null;
  /** TODO-175 — external refundable'ın hedefi (opsiyonel; unpaid/credit-only akışta gönderilmez). */
  refundDestination?: RefundDestination;
  /** Optimistic concurrency (opsiyonel; verilirse guard'lanır). */
  expectedVersion?: number;
}

export type CancelOrderResult =
  | { ok: true; orderId: string; alreadyCancelled: boolean; refund: CancellationRefundPrep }
  | { ok: false; code: CancelOrderErrorCode };

const PRE_HANDOFF_OUTBOUND_STATUSES: readonly ShipmentStatus[] = [
  "DRAFT",
  "ORDER_CREATED",
  "LABEL_PENDING",
  "LABEL_CREATED",
];

const NOOP_REFUND: CancellationRefundPrep = { status: "SKIPPED_NO_CAPTURE", refundId: null, mode: null };

/** Advisory lock (refund işlemleriyle AYNI key → cancel-vs-refund serialize). Re-entrant (xact-level). */
async function lockOrderForCancel(tx: Tx, storeId: string, orderId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`refund:${storeId}:${orderId}`}))`;
}

function mapEligibilityToError(
  state: ReturnType<typeof computeCancellationEligibility>,
): CancelOrderErrorCode {
  switch (state) {
    case "BLOCKED_IN_TRANSIT":
      return "BLOCKED_IN_TRANSIT";
    case "BLOCKED_DELIVERED":
      return "BLOCKED_DELIVERED";
    default:
      return "NOT_CANCELLABLE";
  }
}

export async function cancelCustomerOrder(
  input: CancelOrderInput,
  deps: RefundServiceDeps,
): Promise<CancelOrderResult> {
  // 0) Neden doğrulama (server-authoritative; contract da doğrular ama guard NİHAİ otoritedir).
  if (!isActiveCancellationReason(input.reasonCode)) return { ok: false, code: "INVALID_REASON" };
  const reasonCategory = cancellationReasonCategory(input.reasonCode);
  if (!reasonCategory) return { ok: false, code: "INVALID_REASON" };
  const reasonNote = input.reasonNote?.trim() ? input.reasonNote.trim() : null;
  if (cancellationReasonRequiresNote(input.reasonCode) && !reasonNote) {
    return { ok: false, code: "NOTE_REQUIRED" };
  }

  // 1) Sahiplik + varlık (storeId + customerId scoped → cross-store/cross-customer 404). Erken 404/mesaj.
  const pre = await prisma.order.findFirst({
    where: { storeId: input.storeId, customerId: input.customerId, orderNumber: input.orderNumber },
    select: {
      id: true,
      status: true,
      currency: true,
      shipments: { select: { direction: true, status: true } },
    },
  });
  if (!pre) return { ok: false, code: "ORDER_NOT_FOUND" };
  if (pre.status === "CANCELLED") {
    return { ok: true, orderId: pre.id, alreadyCancelled: true, refund: NOOP_REFUND };
  }
  const preState = computeCancellationEligibility({
    orderStatus: pre.status,
    shipments: pre.shipments as CancellationShipmentInput[],
  });
  if (preState !== "ALLOWED") return { ok: false, code: mapEligibilityToError(preState) };

  // TODO-175 (Düzeltme A) — Refund hedefi eligibility (server-authoritative; SESSIZ fallback YOK).
  // Yalnız açıkça hedef verilmişse doğrulanır; unpaid/credit-only akışta hedef gönderilmez.
  if (input.refundDestination) {
    const externalRefundable = await getOrderExternalRefundableMinor(prisma, input.storeId, pre.id, pre.currency);
    const creditRestorable = await getOrderCreditRestorableMinor(prisma, input.storeId, pre.id);
    const elig = resolveDestinationEligibility({
      externalRefundableRemaining: externalRefundable,
      totalRefundableMinor: externalRefundable + Number(creditRestorable),
    });
    if (input.refundDestination === "ORIGINAL_PAYMENT" && !elig.offerOriginalPayment) {
      return { ok: false, code: "INVALID_DESTINATION" };
    }
    if (input.refundDestination === "SHOPPING_BALANCE" && !elig.offerShoppingBalance) {
      return { ok: false, code: "INVALID_DESTINATION" };
    }
  }

  const orderId = pre.id;
  const now = new Date();

  const txResult = await prisma.$transaction(async (tx): Promise<CancelOrderResult> => {
    await lockOrderForCancel(tx, input.storeId, orderId);

    // 2) Yetkili yeniden okuma (order) + shipment satırlarını FOR UPDATE kilitle (cancel-vs-handoff serialize).
    const order = await tx.order.findFirst({
      where: { id: orderId, storeId: input.storeId },
      select: { id: true, status: true, version: true },
    });
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (order.status === "CANCELLED") {
      return { ok: true, orderId, alreadyCancelled: true, refund: NOOP_REFUND };
    }

    const lockedShipments = await tx.$queryRaw<
      Array<{ id: string; direction: ShipmentDirection; status: ShipmentStatus; provider: ShippingProviderType }>
    >`
      SELECT "id", "direction", "status", "provider"
      FROM "Shipment"
      WHERE "storeId" = ${input.storeId} AND "orderId" = ${orderId}
      FOR UPDATE
    `;

    const state = computeCancellationEligibility({
      orderStatus: order.status as OrderStatus,
      shipments: lockedShipments.map((s) => ({ direction: s.direction, status: s.status })),
    });
    if (state !== "ALLOWED") {
      // Yarış: pre-check'ten sonra bir handoff gerçekleşti → yalnız biri kazanır (bu operasyon kaybetti).
      return { ok: false, code: "CANCEL_CONFLICT" };
    }

    // 3) Optimistic version-guarded CANCELLED geçişi (durum PLACED/CONFIRMED + version eşleşmeli).
    const guardedVersion = input.expectedVersion ?? order.version;
    const bumped = await tx.order.updateMany({
      where: {
        id: orderId,
        storeId: input.storeId,
        status: { in: ["PLACED", "CONFIRMED"] },
        version: guardedVersion,
      },
      data: {
        status: "CANCELLED",
        fulfillmentStatus: "CANCELLED",
        cancelledAt: now,
        cancelSource: "CUSTOMER",
        cancelReasonCode: input.reasonCode,
        cancelReasonCategory: reasonCategory,
        cancelReasonNote: reasonNote,
        // Legacy serbest-metin (geriye-dönük admin görüntüleme): kod + not birleşimi.
        cancelReason: reasonNote ? `${input.reasonCode}: ${reasonNote}` : input.reasonCode,
        version: { increment: 1 },
      },
    });
    if (bumped.count === 0) return { ok: false, code: "CANCEL_CONFLICT" };

    // 4) Handoff yapılmamış OUTBOUND gönderileri CANCELLED yap (kilitli satırlar; koşullu → yarış-güvenli).
    let cancelledShipments = 0;
    for (const s of lockedShipments) {
      if (!isPreHandoffOutbound({ direction: s.direction, status: s.status })) continue;
      const updated = await tx.shipment.updateMany({
        where: { id: s.id, storeId: input.storeId, status: { in: PRE_HANDOFF_OUTBOUND_STATUSES as ShipmentStatus[] } },
        data: { status: "CANCELLED" },
      });
      if (updated.count > 0) {
        cancelledShipments += 1;
        await tx.shipmentEvent.create({
          data: {
            storeId: input.storeId,
            shipmentId: s.id,
            provider: s.provider,
            eventType: "CANCELLED",
            statusText: "Sipariş müşteri tarafından iptal edildi (gönderi carrier'a devredilmemişti).",
            occurredAt: now,
            rawSafeJson: { source: "ORDER_CANCELLATION" },
          },
        });
      }
    }

    // 5) Rezervasyon release (paylaşılan toleranslı helper; expired satır → duplicate movement YOK).
    const releasedReservations = await releaseOrderReservations(tx, input.storeId, orderId, now, "ORDER_CANCELLED");

    // 6) Coupon/campaign rollback (ADR-277).
    const rollback = await releaseOrderCampaignConsumption(tx, input.storeId, orderId, now);

    // 6b) TODO-174B (ADR-282) — Store credit restore: alışveriş bakiyesiyle ödenen kısım BAKİYEYE geri
    // (canlı lot revive → ACTIVE; süresi geçmiş lot CANLANMAZ). Idempotent (duplicate restore YOK). Kart
    // kısmı bundan BAĞIMSIZ olarak (adım 7) PSP'ye iade edilir — kaynak-bazlı allocation korunur.
    const cancelOrder = await tx.order.findUnique({ where: { id: orderId }, select: { currency: true } });
    let creditRestore = { restoredMinor: 0n, skippedExpiredMinor: 0n, entriesCreated: 0 };
    if (cancelOrder && input.customerId) {
      creditRestore = await restoreCreditForOrderInTx(tx, {
        storeId: input.storeId,
        customerId: input.customerId,
        currency: cancelOrder.currency,
        orderId,
        ledgerType: "ORDER_CANCELLATION_RESTORE",
        sourceType: "ORDER_CANCELLATION",
        actor: { type: "CUSTOMER", id: input.customerId },
        description: "credit.cancellationRestore",
      });
    }

    // 7) Refund PENDING ledger (ADR-276; intent'siz). STORE_CREDIT HÂRİÇ external tahsilat iade edilir.
    // Ödeme yoksa (veya yalnız credit ödendiyse) SKIPPED. Provider commit SONRASI.
    const refund = await prepareCancellationRefund(tx, {
      storeId: input.storeId,
      orderId,
      customerId: input.customerId,
      refundDestination: input.refundDestination,
      actorUserId: null, // müşteri aktörü (platform user değil); provenance metadata'da.
    });

    // 8) OrderEvent + AuditLog (zorunlu).
    await tx.orderEvent.createMany({
      data: [
        {
          storeId: input.storeId,
          orderId,
          type: "ORDER_CANCELLED",
          message: "Sipariş müşteri tarafından iptal edildi.",
          actorUserId: null,
          metadata: {
            source: "CUSTOMER",
            reasonCode: input.reasonCode,
            reasonCategory,
            hasNote: Boolean(reasonNote),
            refundStatus: refund.status,
            refundId: refund.refundId,
          },
        },
        {
          storeId: input.storeId,
          orderId,
          type: "RESERVATION_RELEASED",
          message: "Aktif stok rezervasyonları serbest bırakıldı.",
          actorUserId: null,
          metadata: { releasedCount: releasedReservations },
        },
      ],
    });
    await tx.auditLog.create({
      data: {
        storeId: input.storeId,
        platformUserId: null,
        action: "UPDATE",
        entityType: "Order",
        entityId: orderId,
        metadata: {
          action: "order.customer-cancel",
          source: "CUSTOMER",
          customerId: input.customerId,
          reasonCode: input.reasonCode,
          reasonCategory,
          cancelledShipments,
          releasedReservations,
          couponRollback: {
            redemptionsReleased: rollback.redemptionsReleased,
            couponsReverted: rollback.couponsReverted,
            couponsRevoked: rollback.couponsRevoked,
          },
          refund: { status: refund.status, refundId: refund.refundId },
          // TODO-174B — store credit restore provenance (bakiyeye geri yüklenen + süresi geçmiş için atlanan).
          creditRestore: {
            restoredMinor: creditRestore.restoredMinor.toString(),
            skippedExpiredMinor: creditRestore.skippedExpiredMinor.toString(),
            entriesCreated: creditRestore.entriesCreated,
          },
        },
      },
    });

    return { ok: true, orderId, alreadyCancelled: false, refund };
  });

  // 9) Provider refund yürütmesi (commit SONRASI). Yalnız tazece oluşturulmuş PROVIDER_AUTOMATIC.
  if (txResult.ok && !txResult.alreadyCancelled) {
    const refund = txResult.refund;
    if (refund.status === "CREATED" && refund.refundId && refund.mode === "PROVIDER_AUTOMATIC") {
      try {
        await runCancellationRefundExecution(input.storeId, refund.refundId, deps, null);
      } catch {
        // Provider yürütme hatası order'ı CANCELLED bırakır; ledger FAILED/PROCESSING (applyOutcome).
        // Sipariş yeniden AÇILMAZ, stok yeniden REZERVE EDİLMEZ (ADR-276). Sessiz yut (durum ledger'da).
      }
    }
  }
  return txResult;
}
