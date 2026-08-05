/**
 * TODO-169 (ADR-269) — Returns Management Foundation · domain servisi.
 *
 * Framework-agnostik (prisma doğrudan; shipping modülü deseni). Beklenen domain hataları
 * THROW EDİLMEZ — string-sentinel `{ ok:false, code }` döner; route katmanı 404/409/400'e eşler
 * (fail-closed). Tüm sorgular storeId-first scoped (tenant izolasyonu). State geçişleri tek
 * otoriteden (status-map) geçer; para hesabı saf refund-calc'tan gelir.
 */
import { prisma } from "@commerce-os/db";
import type { Prisma, PrismaClient, ReturnStatus, ReturnActorType } from "@prisma/client";
import type {
  ReturnReasonValue,
  ReturnResolutionTypeValue,
} from "@commerce-os/contracts";
import { returnReasonRequiresComment } from "@commerce-os/contracts";
import { evaluateReturnTransition } from "./status-map.js";
import {
  computeLineEligibility,
  resolveDeliveryAnchor,
  type LineEligibilityResult,
  type ShipmentEligibilityInput,
} from "./eligibility.js";
import { computeRefund, type RefundCalcLine } from "./refund-calc.js";

type Tx = Prisma.TransactionClient | PrismaClient;

// Held (tutulan) iade adedine SAYILMAYAN durumlar: red/iptal/expire → adet havuza geri döner.
export const RELEASING_TERMINAL_STATUSES: ReturnStatus[] = [
  "REJECTED",
  "CANCELLED_BY_CUSTOMER",
  "EXPIRED",
];

/**
 * R1 (ADR-269 hardening) — refund'a GÖTÜRMEYEN terminal durumlar. Bu durumlardan birine geçişte
 * PENDING RefundIntent AYNI tx'te CANCELLED yapılır (yetim niyet TODO-170'te gerçek refund'a
 * dönüşemesin). CLOSED buraya dahildir: yalnız PENDING (finansal sonuç oluşmamış) intent iptal
 * edilir — TODO-170 sonrası CONSUMED/PROCESSED intent'e DOKUNULMAZ (cancelPendingRefundIntent
 * yalnız PENDING'i hedefler).
 */
export const TERMINAL_NON_REFUND_STATUSES: ReturnStatus[] = [
  "REJECTED",
  "CANCELLED_BY_CUSTOMER",
  "EXPIRED",
  "CLOSED",
];

/**
 * PENDING RefundIntent'i CANCELLED yapar (append-only: SİLİNMEZ). Yalnız PENDING hedeflenir →
 * idempotent ve TODO-170'in CONSUMED/PROCESSED intent'ine dokunmaz. Iptal ani + nedeni yazılır
 * (finansal denetim izi). Intent yoksa / PENDING değilse no-op.
 */
export async function cancelPendingRefundIntent(
  tx: Prisma.TransactionClient,
  storeId: string,
  returnRequestId: string,
  reason: string,
): Promise<void> {
  await tx.refundIntent.updateMany({
    where: { storeId, returnRequestId, status: "PENDING" },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason.slice(0, 500) },
  });
}

export interface StoreReturnPolicy {
  returnWindowDays: number;
  requiresApproval: boolean;
  customerPaysReturnShipping: boolean;
  allowReplacement: boolean;
  allowOriginalPaymentRefund: boolean;
}

const DEFAULT_POLICY: StoreReturnPolicy = {
  returnWindowDays: 14,
  requiresApproval: true,
  customerPaysReturnShipping: true,
  allowReplacement: true,
  allowOriginalPaymentRefund: true,
};

/** StoreSettings iade politikası; satır yoksa güvenli default (ADR-269 §3). */
export async function resolveStoreReturnPolicy(
  db: Tx,
  storeId: string,
): Promise<StoreReturnPolicy> {
  const row = await db.storeSettings.findUnique({
    where: { storeId },
    select: {
      returnWindowDays: true,
      returnsRequireApproval: true,
      returnsCustomerPaysShipping: true,
      returnsAllowReplacement: true,
      returnsAllowOriginalPaymentRefund: true,
    },
  });
  if (!row) return { ...DEFAULT_POLICY };
  return {
    returnWindowDays: row.returnWindowDays,
    requiresApproval: row.returnsRequireApproval,
    customerPaysReturnShipping: row.returnsCustomerPaysShipping,
    allowReplacement: row.returnsAllowReplacement,
    allowOriginalPaymentRefund: row.returnsAllowOriginalPaymentRefund,
  };
}

/**
 * Sipariş satırı başına TUTULAN iade adedi (açık + kabul edilmiş; releasing-terminal düşülmüş).
 * `excludeReturnRequestId` verilirse o talep hariç tutulur (aynı talebin kendini saymaması için).
 */
export async function getHeldReturnedQtyByLine(
  db: Tx,
  storeId: string,
  orderId: string,
  excludeReturnRequestId?: string,
): Promise<Map<string, number>> {
  const items = await db.returnItem.findMany({
    where: {
      storeId,
      orderLine: { orderId },
      returnRequest: {
        status: { notIn: RELEASING_TERMINAL_STATUSES },
        ...(excludeReturnRequestId ? { id: { not: excludeReturnRequestId } } : {}),
      },
    },
    select: { orderLineId: true, quantity: true },
  });
  const map = new Map<string, number>();
  for (const it of items) {
    map.set(it.orderLineId, (map.get(it.orderLineId) ?? 0) + it.quantity);
  }
  return map;
}

export interface OrderForEligibility {
  id: string;
  currency: string;
  lines: Array<{
    id: string;
    quantity: number;
    unitPriceAmount: number;
  }>;
  shipments: ShipmentEligibilityInput[];
}

export interface LineEligibilityView extends LineEligibilityResult {
  orderLineId: string;
  hasActiveReturn: boolean;
}

/** Sipariş bazında satır-satır uygunluk (pure eligibility + held-qty + aktif iade). */
export async function computeOrderEligibility(
  db: Tx,
  storeId: string,
  order: OrderForEligibility,
  policy: StoreReturnPolicy,
  now: Date,
): Promise<{ anchor: Date | null; windowEnd: Date | null; lines: LineEligibilityView[] }> {
  const held = await getHeldReturnedQtyByLine(db, storeId, order.id);
  const anchor = resolveDeliveryAnchor(order.shipments);
  const lines: LineEligibilityView[] = order.lines.map((line) => {
    const heldQty = held.get(line.id) ?? 0;
    const result = computeLineEligibility({
      orderLineQuantity: line.quantity,
      heldReturnedQty: heldQty,
      deliveryAnchor: anchor,
      returnWindowDays: policy.returnWindowDays,
      now,
    });
    return { ...result, orderLineId: line.id, hasActiveReturn: heldQty > 0 };
  });
  const windowEnd = lines[0]?.returnWindowEndsAt ?? null;
  return { anchor, windowEnd, lines };
}

// ── Talep oluşturma ─────────────────────────────────────────────────────────────

export interface CreateReturnItemInput {
  orderLineId: string;
  quantity: number;
  reason: ReturnReasonValue;
  customerComment?: string;
  attachmentMediaIds?: string[];
}

export interface CreateReturnInput {
  storeId: string;
  customerId: string;
  orderNumber: string;
  resolutionType: ReturnResolutionTypeValue;
  customerNote?: string;
  items: CreateReturnItemInput[];
}

export type CreateReturnError =
  | { ok: false; code: "ORDER_NOT_FOUND" }
  | { ok: false; code: "ORDER_NOT_DELIVERED" }
  | { ok: false; code: "RESOLUTION_NOT_ALLOWED" }
  | { ok: false; code: "COMMENT_REQUIRED"; orderLineId: string }
  | { ok: false; code: "LINE_NOT_ELIGIBLE"; orderLineId: string }
  | { ok: false; code: "QUANTITY_EXCEEDS_REMAINING"; orderLineId: string }
  | { ok: false; code: "DUPLICATE_LINE"; orderLineId: string }
  | { ok: false; code: "ATTACHMENT_NOT_FOUND"; mediaId: string };

export type CreateReturnResult = { ok: true; returnRequestId: string } | CreateReturnError;

/** İade numarası üretimi (store-scoped counter; transaction içinde atomik). */
async function nextReturnNumber(tx: Prisma.TransactionClient, storeId: string): Promise<string> {
  const counter = await tx.returnNumberCounter.upsert({
    where: { storeId },
    create: { storeId, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
    select: { lastValue: true },
  });
  return `R${String(counter.lastValue).padStart(6, "0")}`;
}

/**
 * Müşteri iade talebi oluşturur. Yetki: order müşteriye + store'a ait olmalı (yoksa 404).
 * Eligibility, adet limiti, açıklama zorunluluğu, çözüm izni server-side doğrulanır (fail-closed).
 * Attachment media id'leri bu müşteriye/store'a ait RETURN_ATTACHMENT olmalı ve henüz bağlı olmamalı.
 */
export async function createReturnRequest(
  input: CreateReturnInput,
  now: Date,
): Promise<CreateReturnResult> {
  return prisma.$transaction(async (tx) => {
    // R2 — aynı sipariş için eşzamanlı iade taleplerini SERİLEŞTİR (over-claim savunması). Held/remaining
    // adet okuması bu kilit ALTINDA yapılır; iki paralel create aynı satın alınan adedi ayrı ayrı claim
    // edemez. tx-scoped advisory lock (commit/rollback'te otomatik bırakılır); repo deseni (variant-gen).
    // $executeRaw ($queryRaw DEĞİL): pg_advisory_xact_lock void döner.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`return:${input.storeId}:${input.orderNumber}`}))`;

    const order = await tx.order.findFirst({
      where: { storeId: input.storeId, orderNumber: input.orderNumber, customerId: input.customerId },
      select: {
        id: true,
        currency: true,
        lines: { select: { id: true, quantity: true, unitPriceAmount: true } },
        shipments: { select: { status: true, deliveredAt: true, updatedAt: true } },
      },
    });
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };

    const policy = await resolveStoreReturnPolicy(tx, input.storeId);

    // Çözüm izni (politika).
    if (input.resolutionType === "REPLACEMENT" && !policy.allowReplacement) {
      return { ok: false, code: "RESOLUTION_NOT_ALLOWED" };
    }
    if (input.resolutionType === "REFUND_TO_ORIGINAL_PAYMENT" && !policy.allowOriginalPaymentRefund) {
      return { ok: false, code: "RESOLUTION_NOT_ALLOWED" };
    }

    const elig = await computeOrderEligibility(tx, input.storeId, order, policy, now);
    if (elig.anchor === null || elig.windowEnd === null) {
      return { ok: false, code: "ORDER_NOT_DELIVERED" };
    }
    const eligByLine = new Map(elig.lines.map((l) => [l.orderLineId, l]));

    const seen = new Set<string>();
    for (const item of input.items) {
      if (seen.has(item.orderLineId)) return { ok: false, code: "DUPLICATE_LINE", orderLineId: item.orderLineId };
      seen.add(item.orderLineId);

      const lineElig = eligByLine.get(item.orderLineId);
      if (!lineElig || lineElig.status !== "ELIGIBLE") {
        return { ok: false, code: "LINE_NOT_ELIGIBLE", orderLineId: item.orderLineId };
      }
      if (item.quantity > lineElig.remainingReturnableQty) {
        return { ok: false, code: "QUANTITY_EXCEEDS_REMAINING", orderLineId: item.orderLineId };
      }
      if (returnReasonRequiresComment(item.reason) && !item.customerComment?.trim()) {
        return { ok: false, code: "COMMENT_REQUIRED", orderLineId: item.orderLineId };
      }
    }

    // Attachment media doğrulama (bu müşteri/store'a ait RETURN_ATTACHMENT, henüz bağlı değil).
    const allMediaIds = input.items.flatMap((i) => i.attachmentMediaIds ?? []);
    if (allMediaIds.length > 0) {
      const assets = await tx.mediaAsset.findMany({
        where: { id: { in: allMediaIds }, storeId: input.storeId, context: "RETURN_ATTACHMENT" },
        select: { id: true, createdBy: true, returnAttachments: { select: { id: true } } },
      });
      const byId = new Map(assets.map((a) => [a.id, a]));
      const owner = `customer:${input.customerId}`;
      for (const mediaId of allMediaIds) {
        const asset = byId.get(mediaId);
        if (!asset || asset.createdBy !== owner || asset.returnAttachments.length > 0) {
          return { ok: false, code: "ATTACHMENT_NOT_FOUND", mediaId };
        }
      }
    }

    const returnNumber = await nextReturnNumber(tx, input.storeId);
    const created = await tx.returnRequest.create({
      data: {
        storeId: input.storeId,
        orderId: order.id,
        customerId: input.customerId,
        returnNumber,
        status: "REQUESTED",
        resolutionType: input.resolutionType,
        returnWindowEndsAt: elig.windowEnd,
        customerNote: input.customerNote?.trim() || null,
        refundShipping: false,
        items: {
          create: input.items.map((item) => ({
            storeId: input.storeId,
            orderLineId: item.orderLineId,
            quantity: item.quantity,
            reason: item.reason,
            customerComment: item.customerComment?.trim() || null,
          })),
        },
        history: {
          create: {
            storeId: input.storeId,
            fromStatus: null,
            toStatus: "REQUESTED",
            actorType: "CUSTOMER",
            actorId: input.customerId,
          },
        },
      },
      select: { id: true, items: { select: { id: true, orderLineId: true } } },
    });

    // Attachment bağlama (her media'yı ilgili item'e).
    for (const item of input.items) {
      if (!item.attachmentMediaIds?.length) continue;
      const returnItem = created.items.find((ri) => ri.orderLineId === item.orderLineId);
      if (!returnItem) continue;
      await tx.returnAttachment.createMany({
        data: item.attachmentMediaIds.map((mediaId) => ({
          storeId: input.storeId,
          returnItemId: returnItem.id,
          mediaAssetId: mediaId,
          type: "PHOTO",
        })),
      });
    }

    return { ok: true, returnRequestId: created.id };
  });
}

// ── Durum geçişleri (admin + müşteri) ─────────────────────────────────────────────

export type TransitionError =
  | { ok: false; code: "RETURN_NOT_FOUND" }
  | { ok: false; code: "ILLEGAL_TRANSITION" }
  | { ok: false; code: "TERMINAL" }
  | { ok: false; code: "ACTOR_NOT_ALLOWED" }
  | { ok: false; code: "NO_CHANGE" }
  | { ok: false; code: "VERSION_CONFLICT" }
  | { ok: false; code: "COMPLETION_NOT_ALLOWED" };

/**
 * R5 (ADR-269 hardening) — COMPLETED (gerçek/doğrulanmış sonuç) yalnız finansal/fulfillment sonucu
 * OLUŞTUKTAN sonra. TODO-170 (gerçek refund yürütme) gelene kadar hiçbir REFUND intent PROCESSED
 * olmaz → COMPLETED erişilemez; en ileri finansal durum REFUND_PENDING'dir. REPLACEMENT için
 * fulfillment doğrulama altyapısı yok → REPLACEMENT_PENDING'de kalır. Guard YORUM değil KOD.
 */
async function isCompletionAllowed(
  tx: Prisma.TransactionClient,
  storeId: string,
  returnRequestId: string,
): Promise<boolean> {
  const rr = await tx.returnRequest.findFirst({
    where: { id: returnRequestId, storeId },
    select: { resolutionType: true, refundIntent: { select: { totalRefundMinor: true } } },
  });
  if (!rr) return false;
  if (rr.resolutionType === "REFUND_TO_ORIGINAL_PAYMENT") {
    // TODO-170 (ADR-272) — Gerçek refund tamamlanmadan COMPLETED YASAK: SUCCEEDED OrderRefund toplamı
    // intent totalını karşılamalı (ledger gerçek para hareketi otoritesi; intent status'e bakılmaz).
    const intentTotal = rr.refundIntent?.totalRefundMinor ?? null;
    if (intentTotal === null) return false;
    const agg = await tx.orderRefund.aggregate({
      where: { storeId, returnRequestId, status: "SUCCEEDED" },
      _sum: { totalRefundMinor: true },
    });
    return (agg._sum.totalRefundMinor ?? 0) >= intentTotal;
  }
  // REPLACEMENT: fulfillment doğrulanamaz (altyapı yok) → COMPLETED YASAK.
  return false;
}

export type TransitionResult = { ok: true; status: ReturnStatus } | TransitionError;

interface TransitionActor {
  type: ReturnActorType;
  id: string | null;
}

/**
 * Genel durum geçişi (state-machine + yetki + optimistic version). onCommit içinde ek yan-etkiler
 * (refund intent, restock, alan güncellemesi) aynı tx'te uygulanır. History append-only yazılır.
 */
export async function applyReturnTransition(
  storeId: string,
  returnRequestId: string,
  target: ReturnStatus,
  actor: TransitionActor,
  opts: {
    note?: string;
    expectedVersion?: number;
    extraData?: Prisma.ReturnRequestUpdateManyMutationInput;
    onCommit?: (tx: Prisma.TransactionClient, current: { id: string; status: ReturnStatus }) => Promise<void>;
    timestampField?: keyof Prisma.ReturnRequestUpdateManyMutationInput;
  } = {},
): Promise<TransitionResult> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.returnRequest.findFirst({
      where: { id: returnRequestId, storeId },
      select: { id: true, status: true, version: true },
    });
    if (!current) return { ok: false, code: "RETURN_NOT_FOUND" };
    if (opts.expectedVersion !== undefined && current.version !== opts.expectedVersion) {
      return { ok: false, code: "VERSION_CONFLICT" };
    }

    const verdict = evaluateReturnTransition(current.status, target, actor.type);
    if (!verdict.ok) return { ok: false, code: verdict.reason };

    // R5 — COMPLETED yalnız finansal/fulfillment sonucu doğrulanınca (TODO-170). Guard fail-closed.
    if (target === "COMPLETED" && !(await isCompletionAllowed(tx, storeId, current.id))) {
      return { ok: false, code: "COMPLETION_NOT_ALLOWED" };
    }

    const now = new Date();
    // R3 — ATOMIK optimistic lock: update `version` KOŞULLU. İki eşzamanlı geçiş aynı version'ı
    // okusa bile yalnız BİRİ eşleşir (satır kilidi + WHERE version); diğeri count=0 → VERSION_CONFLICT
    // ve history/onCommit yan-etkileri (bayat approve intent'i, bayat inspect restock'u) ÇALIŞMAZ.
    const guardVersion = opts.expectedVersion ?? current.version;
    const updated = await tx.returnRequest.updateMany({
      where: { id: current.id, storeId, version: guardVersion },
      data: {
        status: target,
        version: { increment: 1 },
        ...(opts.timestampField ? { [opts.timestampField]: now } : {}),
        ...(opts.extraData ?? {}),
      },
    });
    if (updated.count === 0) return { ok: false, code: "VERSION_CONFLICT" };
    await tx.returnStatusHistory.create({
      data: {
        storeId,
        returnRequestId: current.id,
        fromStatus: current.status,
        toStatus: target,
        actorType: actor.type,
        actorId: actor.id,
        note: opts.note?.trim() || null,
      },
    });
    // R1 — refund'a götürmeyen terminal duruma geçişte yetim PENDING intent'i AYNI tx'te iptal et.
    if (TERMINAL_NON_REFUND_STATUSES.includes(target)) {
      const reason = opts.note?.trim()
        ? `Return ${target}: ${opts.note.trim()}`
        : `Return ${target}: refund not settled.`;
      await cancelPendingRefundIntent(tx, storeId, current.id, reason);
    }
    if (opts.onCommit) await opts.onCommit(tx, { id: current.id, status: current.status });
    return { ok: true, status: target };
  });
}

// ── Restock (yalnız RESTOCK_AS_SELLABLE; idempotent) ──────────────────────────────

/**
 * İade edilen satırın SATILABILIR stoğa geri alınması. Idempotent: restockedAt set ise no-op.
 * quantityOnHand += received qty (approvedQuantity ?? quantity) + InventoryMovement RETURN +
 * InventoryAdjustment(source RETURN_RESTOCK). Store-scoped (başka store'a uygulanamaz).
 */
export async function applyRestockForItem(
  tx: Prisma.TransactionClient,
  storeId: string,
  returnItemId: string,
  actorUserId: string | null,
): Promise<void> {
  const item = await tx.returnItem.findFirst({
    where: { id: returnItemId, storeId, restockDecision: "RESTOCK_AS_SELLABLE", restockedAt: null },
    select: {
      id: true,
      quantity: true,
      approvedQuantity: true,
      orderLine: { select: { productId: true, variantId: true } },
    },
  });
  if (!item) return; // idempotent / karar sellable değil / zaten restock

  const qty = item.approvedQuantity ?? item.quantity;
  if (qty <= 0) return;
  const { productId, variantId } = item.orderLine;

  const inv = await tx.inventoryItem.findFirst({ where: { storeId, variantId }, select: { id: true, quantityOnHand: true } });
  const batchId = `return-restock:${item.id}`;
  const oldValue = inv?.quantityOnHand ?? 0;
  const newValue = oldValue + qty;

  if (inv) {
    await tx.inventoryItem.update({ where: { id: inv.id }, data: { quantityOnHand: newValue } });
  } else {
    await tx.inventoryItem.create({ data: { storeId, variantId, quantityOnHand: newValue } });
  }
  // Warehouse-aware bakiye (default depo) da yansıtılır (varsa).
  const wh = await tx.warehouse.findFirst({ where: { storeId, isDefault: true }, select: { id: true } });
  if (wh) {
    await tx.inventoryBalance.upsert({
      where: { warehouseId_variantId: { warehouseId: wh.id, variantId } },
      create: { storeId, warehouseId: wh.id, variantId, onHand: newValue },
      update: { onHand: { increment: qty } },
    });
    await tx.inventoryAdjustment.create({
      data: {
        storeId,
        warehouseId: wh.id,
        productId,
        variantId,
        field: "ON_HAND",
        oldValue,
        newValue,
        delta: qty,
        reason: "İade edilen ürün satılabilir stoğa alındı.",
        source: "RETURN_RESTOCK",
        batchId,
        changedByPlatformUserId: actorUserId,
      },
    });
  }
  await tx.inventoryMovement.create({
    data: {
      storeId,
      variantId,
      type: "RETURN",
      quantityDelta: qty,
      reason: "Return restock (RESTOCK_AS_SELLABLE)",
      referenceType: "ReturnItem",
      referenceId: item.id,
      actorUserId,
    },
  });
  await tx.returnItem.update({ where: { id: item.id }, data: { restockedAt: new Date(), restockBatchId: batchId } });
}

// ── Refund intent (approve zamanı; PENDING; finansa dokunmaz) ─────────────────────

/**
 * Onaylanan REFUND_TO_ORIGINAL_PAYMENT talebi için RefundIntent (PENDING) oluşturur/günceller.
 * Tutarlar immutable OrderLine snapshot'larından + onaylanan adetten (approvedQuantity ?? quantity)
 * hesaplanır (saf refund-calc). idempotencyKey store-scoped unique.
 */
export async function upsertRefundIntentForReturn(
  tx: Prisma.TransactionClient,
  storeId: string,
  returnRequestId: string,
): Promise<void> {
  const rr = await tx.returnRequest.findFirst({
    where: { id: returnRequestId, storeId },
    select: {
      id: true,
      orderId: true,
      resolutionType: true,
      refundShipping: true,
      items: { select: { orderLineId: true, quantity: true, approvedQuantity: true } },
    },
  });
  if (!rr || rr.resolutionType !== "REFUND_TO_ORIGINAL_PAYMENT") return;

  const order = await tx.order.findFirst({
    where: { id: rr.orderId, storeId },
    select: {
      currency: true,
      discountAmount: true,
      shippingAmount: true,
      lines: {
        select: { id: true, quantity: true, unitPriceAmount: true, totalAmount: true, lineGrossAmountMinor: true, lineVatAmountMinor: true, discountAllocatedMinor: true },
      },
    },
  });
  if (!order) return;

  const returnedByLine = new Map<string, number>();
  for (const it of rr.items) {
    returnedByLine.set(it.orderLineId, it.approvedQuantity ?? it.quantity);
  }

  const calcLines: RefundCalcLine[] = order.lines.map((line) => ({
    orderLineId: line.id,
    lineQuantity: line.quantity,
    returnedQuantity: returnedByLine.get(line.id) ?? 0,
    lineGrossMinor: line.lineGrossAmountMinor ?? line.totalAmount,
    lineVatMinor: line.lineVatAmountMinor,
    // TD-FR-7 — kalem-bazlı indirim snapshot'ı (legacy siparişte null → oransal fallback).
    discountAllocatedMinor: line.discountAllocatedMinor,
  }));

  const refund = computeRefund({
    currency: order.currency,
    orderLevelDiscountMinor: order.discountAmount,
    shippingAmountMinor: order.shippingAmount,
    refundShipping: rr.refundShipping,
    lines: calcLines,
  });

  // Refund için orijinal başarılı ödeme attempt'i (varsa; TODO-170 kullanır).
  const paidAttempt = await tx.paymentAttempt.findFirst({
    where: { storeId, orderId: rr.orderId, status: { in: ["PAID", "AUTHORIZED"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  await tx.refundIntent.upsert({
    where: { returnRequestId: rr.id },
    create: {
      storeId,
      returnRequestId: rr.id,
      orderId: rr.orderId,
      paymentAttemptId: paidAttempt?.id ?? null,
      currency: refund.currency,
      productRefundMinor: refund.productRefundMinor,
      shippingRefundMinor: refund.shippingRefundMinor,
      taxRefundMinor: refund.taxRefundMinor,
      totalRefundMinor: refund.totalRefundMinor,
      status: "PENDING",
      idempotencyKey: `refund-intent:${rr.id}`,
    },
    update: {
      paymentAttemptId: paidAttempt?.id ?? null,
      productRefundMinor: refund.productRefundMinor,
      shippingRefundMinor: refund.shippingRefundMinor,
      taxRefundMinor: refund.taxRefundMinor,
      totalRefundMinor: refund.totalRefundMinor,
    },
  });
}
