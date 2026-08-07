/**
 * TODO-173 (ADR-274) — Reverse Shipment + reddedilen-adet disposition domain servisi.
 *
 * İnceleme sonrası REDDEDİLEN (rejectedQuantity) ürünün mağazadan müşteriye güvenli geri gönderimi.
 * Normal fulfillment'tan (OUTBOUND_TO_CUSTOMER), müşteri→mağaza iade kargosundan (CUSTOMER_RETURN_TO_STORE,
 * bu fazda RESERVED) ve refund ledger'dan AYRIKTIR. Framework-agnostik (returns/service.ts deseni):
 * domain hataları THROW EDİLMEZ → `{ ok:false, code }`; route katmanı HTTP'ye eşler (fail-closed).
 *
 * KURALLAR (K1–K5, ADR-274):
 *  - Disposition yalnız rejectedQuantity üzerinde; Σ(aktif quantity) ≤ rejectedQuantity (cap invariant).
 *  - RETURN_TO_CUSTOMER disposition reverse shipment üretebilir; diğerleri lojistik/audit no-op.
 *  - Reverse shipment: direction=STORE_RETURN_TO_CUSTOMER; provider YOK (manuel); OrderRefund/RefundIntent/
 *    envanter ÜRETMEZ; order fulfillment/paymentStatus DEĞİŞTİRMEZ.
 *  - Concurrency: returnItem başına `pg_advisory_xact_lock` + ReturnRequest.version optimistic guard.
 *  - Her mutation append-only ReturnStatusHistory (eventType/metadata) üretir; AuditLog route'ta yazılır.
 */
import { prisma } from "@commerce-os/db";
import type { Prisma, ShipmentStatus, ReturnStatus, ReturnActorType } from "@prisma/client";
import { TERMINAL_SHIPMENT_STATUSES } from "../shipping/status-map.js";

// ── Yapısal history event tipleri (ADR-273 deseni: exact-query edilebilir eventType) ──────────────
export const REVERSE_DISPOSITION_SET_EVENT = "RETURN_DISPOSITION_SET";
export const REVERSE_DISPOSITION_CANCELLED_EVENT = "RETURN_DISPOSITION_CANCELLED";
export const REVERSE_SHIPMENT_CREATED_EVENT = "REVERSE_SHIPMENT_CREATED";
export const REVERSE_SHIPMENT_STATUS_EVENT = "REVERSE_SHIPMENT_STATUS_CHANGED";
export const REVERSE_SHIPMENT_TRACKING_EVENT = "REVERSE_SHIPMENT_TRACKING_UPDATED";

export type ReverseActor = { type: ReturnActorType; id: string | null };

// ── Reverse shipment manuel durum makinesi (mevcut ShipmentStatus REUSE; CANCELLED eklenir) ───────
// Outbound `evaluateManualStatusChange` CANCELLED'ı hedef olarak KABUL ETMEZ; reverse'de "İptal et"
// quantity'yi serbest bırakan meşru bir aksiyondur. Ayrı SAHTE makine kurulmaz — yalnız yön-özel kural.
const REVERSE_STATUS_RANK: Record<string, number> = {
  DRAFT: 0,
  IN_TRANSIT: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
};
export type ReverseStatusTarget = "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
export type ReverseStatusRejection =
  | "INVALID_TARGET"
  | "SHIPMENT_TERMINAL"
  | "STATUS_REGRESSION"
  | "NO_CHANGE";

export function evaluateReverseStatusChange(
  current: ShipmentStatus,
  target: ReverseStatusTarget,
): { ok: true } | { ok: false; reason: ReverseStatusRejection } {
  if (current === (target as ShipmentStatus)) return { ok: false, reason: "NO_CHANGE" };
  if (TERMINAL_SHIPMENT_STATUSES.includes(current)) return { ok: false, reason: "SHIPMENT_TERMINAL" };
  // CANCELLED her non-terminal durumdan meşru (quantity serbest bırakır).
  if (target === "CANCELLED") return { ok: true };
  const currentRank = REVERSE_STATUS_RANK[current] ?? 0;
  const targetRank = REVERSE_STATUS_RANK[target];
  if (targetRank === undefined) return { ok: false, reason: "INVALID_TARGET" };
  if (targetRank < currentRank) return { ok: false, reason: "STATUS_REGRESSION" };
  return { ok: true };
}

// Reverse shipment'ın quantity'yi "tüketen" (tekrar kullanılamaz) durumları: CANCELLED/FAILED HARİÇ hepsi.
export const REVERSE_CONSUMING_STATUSES: ShipmentStatus[] = [
  "DRAFT",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

// ── Reverse-shippable quantity türetme (tek otorite; hem invariant hem serialize kullanır) ─────────
export interface ReverseShippableComputation {
  rejectedQuantity: number;
  returnToCustomerDispositioned: number; // Σ RETURN_TO_CUSTOMER, status != CANCELLED
  alreadyReversed: number; // Σ reverse shipment.returnQuantity, status ∈ REVERSE_CONSUMING_STATUSES
  remaining: number; // min(dispositioned, rejected) − alreadyReversed (>= 0)
}

export async function computeReverseShippable(
  tx: Prisma.TransactionClient,
  storeId: string,
  returnItemId: string,
): Promise<ReverseShippableComputation | null> {
  const item = await tx.returnItem.findFirst({
    where: { id: returnItemId, storeId },
    select: { rejectedQuantity: true },
  });
  if (!item) return null;
  const rejectedQuantity = item.rejectedQuantity ?? 0;
  const dispositionAgg = await tx.returnItemDisposition.aggregate({
    where: { storeId, returnItemId, type: "RETURN_TO_CUSTOMER", status: { not: "CANCELLED" } },
    _sum: { quantity: true },
  });
  const returnToCustomerDispositioned = dispositionAgg._sum.quantity ?? 0;
  const shipmentAgg = await tx.shipment.aggregate({
    where: {
      storeId,
      returnItemId,
      direction: "STORE_RETURN_TO_CUSTOMER",
      status: { in: REVERSE_CONSUMING_STATUSES },
    },
    _sum: { returnQuantity: true },
  });
  const alreadyReversed = shipmentAgg._sum.returnQuantity ?? 0;
  const cap = Math.min(returnToCustomerDispositioned, rejectedQuantity);
  const remaining = Math.max(0, cap - alreadyReversed);
  return { rejectedQuantity, returnToCustomerDispositioned, alreadyReversed, remaining };
}

// Σ(aktif = status != CANCELLED) tüm disposition quantity (cap invariant paydası).
async function sumActiveDispositioned(
  tx: Prisma.TransactionClient,
  storeId: string,
  returnItemId: string,
): Promise<number> {
  const agg = await tx.returnItemDisposition.aggregate({
    where: { storeId, returnItemId, status: { not: "CANCELLED" } },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

// ReturnRequest optimistic version guard + append-only history (fromStatus=toStatus; durum değişmez).
async function guardVersionAndWriteHistory(
  tx: Prisma.TransactionClient,
  args: {
    storeId: string;
    returnRequestId: string;
    expectedVersion: number;
    actor: ReverseActor;
    eventType: string;
    metadata: Prisma.InputJsonValue;
    note?: string | null;
  },
): Promise<{ ok: true; status: ReturnStatus } | { ok: false; code: "VERSION_CONFLICT" }> {
  const rr = await tx.returnRequest.findFirst({
    where: { id: args.returnRequestId, storeId: args.storeId },
    select: { status: true, version: true },
  });
  if (!rr || rr.version !== args.expectedVersion) return { ok: false, code: "VERSION_CONFLICT" };
  const updated = await tx.returnRequest.updateMany({
    where: { id: args.returnRequestId, storeId: args.storeId, version: args.expectedVersion },
    data: { version: { increment: 1 } },
  });
  if (updated.count === 0) return { ok: false, code: "VERSION_CONFLICT" };
  await tx.returnStatusHistory.create({
    data: {
      storeId: args.storeId,
      returnRequestId: args.returnRequestId,
      fromStatus: rr.status,
      toStatus: rr.status,
      actorType: args.actor.type,
      actorId: args.actor.id,
      note: args.note?.trim() || null,
      eventType: args.eventType,
      metadata: args.metadata,
    },
  });
  return { ok: true, status: rr.status };
}

const REVERSE_LOCK = (storeId: string, returnItemId: string) =>
  `reverse-shipment:${storeId}:${returnItemId}`;

// ── Disposition: oluştur ──────────────────────────────────────────────────────────────────────
export type SetDispositionInput = {
  returnItemId: string;
  type: "RETURN_TO_CUSTOMER" | "DESTROY" | "SEND_TO_VENDOR" | "KEEP_IN_STORE" | "CONTACT_CUSTOMER";
  quantity: number;
  reason?: string;
  expectedVersion: number;
};
export type SetDispositionResult =
  | { ok: true; dispositionId: string }
  | {
      ok: false;
      code:
        | "RETURN_NOT_FOUND"
        | "RETURN_ITEM_NOT_FOUND"
        | "VERSION_CONFLICT"
        | "NO_REJECTED_QUANTITY"
        | "DISPOSITION_QUANTITY_EXCEEDED";
    };

export async function setReturnItemDisposition(
  storeId: string,
  returnRequestId: string,
  input: SetDispositionInput,
  actor: ReverseActor,
): Promise<SetDispositionResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${REVERSE_LOCK(storeId, input.returnItemId)}))`;
    const item = await tx.returnItem.findFirst({
      where: { id: input.returnItemId, storeId, returnRequestId },
      select: { id: true, rejectedQuantity: true },
    });
    if (!item) return { ok: false, code: "RETURN_ITEM_NOT_FOUND" as const };
    const rejectedQuantity = item.rejectedQuantity ?? 0;
    if (rejectedQuantity <= 0) return { ok: false, code: "NO_REJECTED_QUANTITY" as const };
    const activeSum = await sumActiveDispositioned(tx, storeId, input.returnItemId);
    if (activeSum + input.quantity > rejectedQuantity) {
      return { ok: false, code: "DISPOSITION_QUANTITY_EXCEEDED" as const };
    }
    const guard = await guardVersionAndWriteHistory(tx, {
      storeId,
      returnRequestId,
      expectedVersion: input.expectedVersion,
      actor,
      eventType: REVERSE_DISPOSITION_SET_EVENT,
      metadata: {
        returnItemId: input.returnItemId,
        type: input.type,
        quantity: input.quantity,
      },
      note: input.reason,
    });
    if (!guard.ok) return { ok: false, code: "VERSION_CONFLICT" as const };
    const created = await tx.returnItemDisposition.create({
      data: {
        storeId,
        returnRequestId,
        returnItemId: input.returnItemId,
        type: input.type,
        quantity: input.quantity,
        status: "PENDING",
        reason: input.reason?.trim() || null,
        createdByPlatformUserId: actor.id,
      },
      select: { id: true },
    });
    return { ok: true as const, dispositionId: created.id };
  });
}

// ── Disposition: iptal (PENDING → CANCELLED; quantity serbest) ─────────────────────────────────
export type CancelDispositionInput = { dispositionId: string; reason?: string; expectedVersion: number };
export type CancelDispositionResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "DISPOSITION_NOT_FOUND"
        | "VERSION_CONFLICT"
        | "DISPOSITION_NOT_CANCELLABLE"
        | "DISPOSITION_CONSUMED";
    };

export async function cancelReturnItemDisposition(
  storeId: string,
  returnRequestId: string,
  input: CancelDispositionInput,
  actor: ReverseActor,
): Promise<CancelDispositionResult> {
  return prisma.$transaction(async (tx) => {
    const disposition = await tx.returnItemDisposition.findFirst({
      where: { id: input.dispositionId, storeId, returnRequestId },
      select: { id: true, returnItemId: true, type: true, quantity: true, status: true },
    });
    if (!disposition) return { ok: false, code: "DISPOSITION_NOT_FOUND" as const };
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${REVERSE_LOCK(storeId, disposition.returnItemId)}))`;
    // COMPLETED immutable; yalnız PENDING iptal edilebilir.
    if (disposition.status !== "PENDING") return { ok: false, code: "DISPOSITION_NOT_CANCELLABLE" as const };
    // RETURN_TO_CUSTOMER ise: bu disposition iptal edilince dispositioned' azalır; zaten sevk edilmiş
    // (aktif reverse shipment) quantity dispositioned'ı aşamaz — aşacaksa iptal reddedilir (veri bütünlüğü).
    if (disposition.type === "RETURN_TO_CUSTOMER") {
      const dispositionAgg = await tx.returnItemDisposition.aggregate({
        where: {
          storeId,
          returnItemId: disposition.returnItemId,
          type: "RETURN_TO_CUSTOMER",
          status: { not: "CANCELLED" },
        },
        _sum: { quantity: true },
      });
      const shipmentAgg = await tx.shipment.aggregate({
        where: {
          storeId,
          returnItemId: disposition.returnItemId,
          direction: "STORE_RETURN_TO_CUSTOMER",
          status: { in: REVERSE_CONSUMING_STATUSES },
        },
        _sum: { returnQuantity: true },
      });
      const remainingAfterCancel =
        (dispositionAgg._sum.quantity ?? 0) - disposition.quantity - (shipmentAgg._sum.returnQuantity ?? 0);
      if (remainingAfterCancel < 0) return { ok: false, code: "DISPOSITION_CONSUMED" as const };
    }
    const guard = await guardVersionAndWriteHistory(tx, {
      storeId,
      returnRequestId,
      expectedVersion: input.expectedVersion,
      actor,
      eventType: REVERSE_DISPOSITION_CANCELLED_EVENT,
      metadata: {
        dispositionId: disposition.id,
        returnItemId: disposition.returnItemId,
        type: disposition.type,
        quantity: disposition.quantity,
      },
      note: input.reason,
    });
    if (!guard.ok) return { ok: false, code: "VERSION_CONFLICT" as const };
    await tx.returnItemDisposition.update({
      where: { id: disposition.id },
      data: { status: "CANCELLED", version: { increment: 1 } },
    });
    return { ok: true as const };
  });
}

// ── Reverse shipment: oluştur ──────────────────────────────────────────────────────────────────
export type CreateReverseShipmentInput = {
  returnItemId: string;
  quantity: number;
  carrierName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDeliveryAt?: string;
  reason: string;
  expectedVersion: number;
};
export type CreateReverseShipmentResult =
  | { ok: true; shipmentId: string }
  | {
      ok: false;
      code:
        | "RETURN_ITEM_NOT_FOUND"
        | "VERSION_CONFLICT"
        | "NO_REJECTED_QUANTITY"
        | "REVERSE_NO_DISPOSITION"
        | "REVERSE_QUANTITY_EXCEEDED"
        | "MISSING_SHIPPING_ADDRESS";
    };

export async function createReverseShipment(
  storeId: string,
  returnRequestId: string,
  input: CreateReverseShipmentInput,
  actor: ReverseActor,
): Promise<CreateReverseShipmentResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${REVERSE_LOCK(storeId, input.returnItemId)}))`;
    const item = await tx.returnItem.findFirst({
      where: { id: input.returnItemId, storeId, returnRequestId },
      select: {
        id: true,
        rejectedQuantity: true,
        returnRequest: { select: { orderId: true } },
      },
    });
    if (!item) return { ok: false, code: "RETURN_ITEM_NOT_FOUND" as const };
    if ((item.rejectedQuantity ?? 0) <= 0) return { ok: false, code: "NO_REJECTED_QUANTITY" as const };
    const shippable = await computeReverseShippable(tx, storeId, input.returnItemId);
    if (!shippable) return { ok: false, code: "RETURN_ITEM_NOT_FOUND" as const };
    if (shippable.returnToCustomerDispositioned <= 0) {
      return { ok: false, code: "REVERSE_NO_DISPOSITION" as const };
    }
    if (input.quantity > shippable.remaining) {
      return { ok: false, code: "REVERSE_QUANTITY_EXCEEDED" as const };
    }
    const orderId = item.returnRequest.orderId;
    const order = await tx.order.findFirst({
      where: { id: orderId, storeId },
      select: { orderNumber: true },
    });
    // Reverse shipment MANUEL'dir ama Shipment.provider/providerConfigId NOT NULL: siparişin mevcut
    // OUTBOUND gönderisinin config'ini REUSE eder (sourceShipmentId de bu olur). İade uygunluğu teslim
    // edilmiş bir OUTBOUND gönderi gerektirdiğinden bu her zaman mevcuttur (fail-closed: yoksa reddet).
    const sourceShipment = await tx.shipment.findFirst({
      where: { storeId, orderId, direction: "OUTBOUND_TO_CUSTOMER" },
      orderBy: { createdAt: "desc" },
      select: { id: true, providerConfigId: true, provider: true },
    });
    const address = await tx.orderAddress.findFirst({
      where: { orderId, storeId, type: "SHIPPING" },
      select: {
        fullName: true,
        phone: true,
        city: true,
        district: true,
        addressLine1: true,
        addressLine2: true,
        postalCode: true,
      },
    });
    if (!order || !address || !sourceShipment) {
      return { ok: false, code: "MISSING_SHIPPING_ADDRESS" as const };
    }

    const guard = await guardVersionAndWriteHistory(tx, {
      storeId,
      returnRequestId,
      expectedVersion: input.expectedVersion,
      actor,
      eventType: REVERSE_SHIPMENT_CREATED_EVENT,
      metadata: {
        returnItemId: input.returnItemId,
        quantity: input.quantity,
        carrierName: input.carrierName ?? null,
        trackingNumber: input.trackingNumber ?? null,
      },
      note: input.reason,
    });
    if (!guard.ok) return { ok: false, code: "VERSION_CONFLICT" as const };

    const addressLine = [address.addressLine1, address.addressLine2].filter(Boolean).join(" ");
    const referenceId = `${order.orderNumber}-RTC-${randomSuffix()}`;
    const shipment = await tx.shipment.create({
      data: {
        storeId,
        orderId,
        direction: "STORE_RETURN_TO_CUSTOMER",
        // NOT NULL kolonlar: siparişin outbound gönderisinin config'ini REUSE et (provider çağrısı YAPILMAZ;
        // direction filtreleriyle sync/webhook/barcode worker'larından dışlanır).
        provider: sourceShipment.provider,
        providerConfigId: sourceShipment.providerConfigId,
        sourceShipmentId: sourceShipment.id,
        referenceId,
        status: "DRAFT",
        returnRequestId,
        returnItemId: input.returnItemId,
        returnQuantity: input.quantity,
        reverseShipmentReason: input.reason.trim(),
        createdByPlatformUserId: actor.id,
        carrierName: input.carrierName?.trim() || null,
        trackingNumber: input.trackingNumber?.trim() || null,
        trackingUrl: input.trackingUrl?.trim() || null,
        estimatedDeliveryAt: input.estimatedDeliveryAt ? new Date(input.estimatedDeliveryAt) : null,
        recipientName: address.fullName,
        recipientPhone: address.phone,
        recipientCityName: address.city,
        recipientDistrictName: address.district,
        recipientAddress: [addressLine, address.postalCode].filter(Boolean).join(", "),
      },
      select: { id: true },
    });
    await tx.shipmentEvent.create({
      data: {
        storeId,
        shipmentId: shipment.id,
        provider: "MOCK",
        eventType: "CREATED",
        statusText: "Reverse shipment created",
        rawSafeJson: { direction: "STORE_RETURN_TO_CUSTOMER", quantity: input.quantity },
      },
    });
    return { ok: true as const, shipmentId: shipment.id };
  });
}

// ── Reverse shipment: durum aksiyonu (kargoya verildi/teslim/iptal) ────────────────────────────
export type ReverseStatusResult =
  | { ok: true; status: ShipmentStatus }
  | {
      ok: false;
      code: "SHIPMENT_NOT_FOUND" | ReverseStatusRejection;
    };

export async function updateReverseShipmentStatus(
  storeId: string,
  shipmentId: string,
  target: ReverseStatusTarget,
  note: string | undefined,
  actor: ReverseActor,
): Promise<ReverseStatusResult> {
  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findFirst({
      where: { id: shipmentId, storeId, direction: "STORE_RETURN_TO_CUSTOMER" },
      select: {
        id: true,
        status: true,
        deliveredAt: true,
        returnRequestId: true,
        returnItemId: true,
        returnQuantity: true,
      },
    });
    if (!shipment) return { ok: false, code: "SHIPMENT_NOT_FOUND" as const };
    if (shipment.returnItemId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${REVERSE_LOCK(storeId, shipment.returnItemId)}))`;
    }
    const verdict = evaluateReverseStatusChange(shipment.status, target);
    if (!verdict.ok) return { ok: false, code: verdict.reason };

    const now = new Date();
    await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        status: target as ShipmentStatus,
        ...(target === "DELIVERED" && !shipment.deliveredAt ? { deliveredAt: now } : {}),
      },
    });
    await tx.shipmentEvent.create({
      data: {
        storeId,
        shipmentId: shipment.id,
        provider: "MOCK",
        eventType: "MANUAL_STATUS",
        statusText: `Reverse shipment → ${target}`,
        occurredAt: now,
        rawSafeJson: { manual: true, statusFrom: shipment.status, statusTo: target, notePresent: !!note },
      },
    });
    // DELIVERED (terminal) → kapsanan RETURN_TO_CUSTOMER disposition(lar)ını COMPLETED (immutable) yap.
    if (target === "DELIVERED" && shipment.returnItemId) {
      await completeCoveredDispositions(tx, storeId, shipment.returnItemId);
    }
    if (shipment.returnRequestId) {
      await appendReverseHistory(tx, {
        storeId,
        returnRequestId: shipment.returnRequestId,
        actor,
        eventType: REVERSE_SHIPMENT_STATUS_EVENT,
        metadata: {
          shipmentId: shipment.id,
          returnItemId: shipment.returnItemId,
          statusFrom: shipment.status,
          statusTo: target,
        },
        note,
      });
    }
    return { ok: true as const, status: target as ShipmentStatus };
  });
}

// ── Reverse shipment: carrier/tracking güncelle (terminal olmayan) ─────────────────────────────
export type ReverseTrackingInput = {
  carrierName?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  estimatedDeliveryAt?: string | null;
};
export type ReverseTrackingResult =
  | { ok: true }
  | { ok: false; code: "SHIPMENT_NOT_FOUND" | "SHIPMENT_TERMINAL" };

export async function updateReverseShipmentTracking(
  storeId: string,
  shipmentId: string,
  input: ReverseTrackingInput,
  actor: ReverseActor,
): Promise<ReverseTrackingResult> {
  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findFirst({
      where: { id: shipmentId, storeId, direction: "STORE_RETURN_TO_CUSTOMER" },
      select: { id: true, status: true, returnRequestId: true, returnItemId: true },
    });
    if (!shipment) return { ok: false, code: "SHIPMENT_NOT_FOUND" as const };
    if (TERMINAL_SHIPMENT_STATUSES.includes(shipment.status)) {
      return { ok: false, code: "SHIPMENT_TERMINAL" as const };
    }
    const data: Prisma.ShipmentUpdateInput = {};
    if (input.carrierName !== undefined) data.carrierName = input.carrierName?.trim() || null;
    if (input.trackingNumber !== undefined) data.trackingNumber = input.trackingNumber?.trim() || null;
    if (input.trackingUrl !== undefined) data.trackingUrl = input.trackingUrl?.trim() || null;
    if (input.estimatedDeliveryAt !== undefined) {
      data.estimatedDeliveryAt = input.estimatedDeliveryAt ? new Date(input.estimatedDeliveryAt) : null;
    }
    await tx.shipment.update({ where: { id: shipment.id }, data });
    await tx.shipmentEvent.create({
      data: {
        storeId,
        shipmentId: shipment.id,
        provider: "MOCK",
        eventType: "MANUAL_TRACKING",
        statusText: "Reverse tracking updated",
        rawSafeJson: { manual: true },
      },
    });
    if (shipment.returnRequestId) {
      await appendReverseHistory(tx, {
        storeId,
        returnRequestId: shipment.returnRequestId,
        actor,
        eventType: REVERSE_SHIPMENT_TRACKING_EVENT,
        metadata: { shipmentId: shipment.id, returnItemId: shipment.returnItemId },
        note: null,
      });
    }
    return { ok: true as const };
  });
}

// Append-only history (durum değiştirmez, version bump YOK — shipment-only aksiyonlar iade terminal
// olsa bile çalışır). Yalnız audit izi.
async function appendReverseHistory(
  tx: Prisma.TransactionClient,
  args: {
    storeId: string;
    returnRequestId: string;
    actor: ReverseActor;
    eventType: string;
    metadata: Prisma.InputJsonValue;
    note?: string | null;
  },
): Promise<void> {
  const rr = await tx.returnRequest.findFirst({
    where: { id: args.returnRequestId, storeId: args.storeId },
    select: { status: true },
  });
  if (!rr) return;
  await tx.returnStatusHistory.create({
    data: {
      storeId: args.storeId,
      returnRequestId: args.returnRequestId,
      fromStatus: rr.status,
      toStatus: rr.status,
      actorType: args.actor.type,
      actorId: args.actor.id,
      note: args.note?.trim() || null,
      eventType: args.eventType,
      metadata: args.metadata,
    },
  });
}

// DELIVERED reverse shipment kapsanan quantity kadar en eski PENDING RETURN_TO_CUSTOMER disposition'ları
// COMPLETED (immutable) yapar. DELIVERED terminal olduğundan geri-alma gerekmez.
async function completeCoveredDispositions(
  tx: Prisma.TransactionClient,
  storeId: string,
  returnItemId: string,
): Promise<void> {
  const deliveredAgg = await tx.shipment.aggregate({
    where: { storeId, returnItemId, direction: "STORE_RETURN_TO_CUSTOMER", status: "DELIVERED" },
    _sum: { returnQuantity: true },
  });
  let covered = deliveredAgg._sum.returnQuantity ?? 0;
  if (covered <= 0) return;
  const pending = await tx.returnItemDisposition.findMany({
    where: { storeId, returnItemId, type: "RETURN_TO_CUSTOMER", status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { id: true, quantity: true },
  });
  for (const d of pending) {
    if (covered >= d.quantity) {
      await tx.returnItemDisposition.update({
        where: { id: d.id },
        data: { status: "COMPLETED", version: { increment: 1 } },
      });
      covered -= d.quantity;
    }
    if (covered <= 0) break;
  }
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
