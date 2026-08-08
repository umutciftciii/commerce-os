/**
 * TODO-170 (ADR-272) — Refund Ledger & Payment Reversal · domain servisi.
 *
 * Framework-agnostik (prisma doğrudan). Beklenen domain hataları THROW EDİLMEZ — `{ ok:false, code }`
 * sentinel döner; route katmanı HTTP'ye eşler (fail-closed). Tüm sorgular storeId-first scoped. Para
 * hareketi OrderRefund LEDGER'ında (append-only) tutulur; yalnız SUCCEEDED finansa/projeksiyona yansır.
 *
 * Concurrency: refund oluşturma order başına `pg_advisory_xact_lock` ile serialize edilir; cap invariant
 * (Σ SUCCEEDED + Σ active ≤ captured) kilit altında yeniden hesaplanır. Idempotency: OrderRefund
 * @@unique([storeId, idempotencyKey]) (server-üretimi key) — aynı key ikinci refund üretmez.
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type { OrderRefundActorType, OrderRefundEventType, PrismaClient, RefundDestination } from "@prisma/client";
import { sumCapturedMinor, resolveRefundedPaymentStatus } from "../payments/payment-state.js";
import { evaluateReturnTransition, isRefundResolution, resolveEffectiveRefundDestination } from "../returns/status-map.js";
import { resolveRefundCapability, type RefundCapability } from "./capability.js";
import { computeRefundSourceSplit, resolveDestinationEligibility } from "./destination-calc.js";
import {
  issueCreditInTx,
  getOrderCreditRestorableMinor,
  restoreCreditAmountForOrderInTx,
} from "../customer-credit/service.js";
import {
  computeRefundableRemainingMinor,
  isWithinRefundable,
  sumActiveRefundMinor,
  sumSucceededRefundMinor,
  type RefundLedgerRow,
} from "./cap-calc.js";
import {
  RefundProviderTimeoutError,
  normalizeRefundError,
  type RefundExecutionResult,
  type RefundProviderPort,
} from "./provider-port.js";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface RefundServiceDeps {
  providerPort: RefundProviderPort;
}

export type RefundErrorCode =
  | "INTENT_NOT_FOUND"
  | "STALE_INTENT"
  | "RETURN_NOT_REFUND_PENDING"
  | "NOT_REFUND_RESOLUTION"
  | "NO_PAYMENT_ATTEMPT"
  | "PAYMENT_NOT_CAPTURED"
  | "CURRENCY_MISMATCH"
  | "REFUND_ALREADY_ACTIVE"
  | "EXCEEDS_REFUNDABLE"
  | "VERSION_CONFLICT"
  | "REFUND_NOT_FOUND"
  | "INVALID_STATE"
  | "MANUAL_ONLY"
  | "AUTOMATIC_ONLY"
  | "MISSING_MANUAL_DETAILS"
  | "RETRY_NOT_ALLOWED";

export type RefundResult = { ok: true; refundId: string } | { ok: false; code: RefundErrorCode };

const ACTOR_ADMIN: OrderRefundActorType = "ADMIN";
const ACTOR_SYSTEM: OrderRefundActorType = "SYSTEM";
const ACTOR_PROVIDER: OrderRefundActorType = "PROVIDER";

async function lockOrder(tx: Tx, storeId: string, orderId: string): Promise<void> {
  // $executeRaw ($queryRaw DEĞİL): pg_advisory_xact_lock void döner. Order başına serialize.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`refund:${storeId}:${orderId}`}))`;
}

async function writeEvent(
  tx: Tx,
  storeId: string,
  orderRefundId: string,
  type: OrderRefundEventType,
  actorType: OrderRefundActorType,
  actorId: string | null,
  amountMinor: number,
  extra?: { providerReference?: string | null; metadata?: Prisma.InputJsonValue },
): Promise<void> {
  await tx.orderRefundEvent.create({
    data: {
      storeId,
      orderRefundId,
      type,
      actorType,
      actorId,
      amountMinor,
      providerReference: extra?.providerReference ?? null,
      metadata: extra?.metadata,
    },
  });
}

/** Bir order için tahsil edilmiş (captured) toplam — order.currency ile eşleşen settled attempt'ler. */
async function loadCapturedMinor(
  tx: Tx,
  storeId: string,
  orderId: string,
  currency: string,
  opts?: { excludeStoreCredit?: boolean },
): Promise<number> {
  // TODO-174B (ADR-282) — İptal PSP-refund'unda STORE_CREDIT tahsilatı HÂRİÇ tutulur: alışveriş
  // bakiyesiyle ödenen kısım sağlayıcıya iade EDİLMEZ, bakiyeye geri yüklenir (ayrı ledger). Diğer
  // çağrılarda (return refund cap) davranış DEĞİŞMEZ (excludeStoreCredit=false varsayılan).
  const attempts = await tx.paymentAttempt.findMany({
    where: { storeId, orderId, currency, ...(opts?.excludeStoreCredit ? { method: { not: "STORE_CREDIT" } } : {}) },
    select: { status: true, amount: true },
  });
  return sumCapturedMinor(attempts);
}

async function loadLedgerRows(tx: Tx, storeId: string, orderId: string): Promise<RefundLedgerRow[]> {
  const rows = await tx.orderRefund.findMany({
    where: { storeId, orderId },
    select: { status: true, totalRefundMinor: true, currency: true },
  });
  return rows;
}

/**
 * TODO-175 — Order'ın EXTERNAL (STORE_CREDIT hariç) refund edilebilir KALAN tutarı (minor):
 * captured(non-credit) − Σ reserved refund (SUCCEEDED + active). INTERNAL_CREDIT legleri de external
 * cap'e sayılır (aynı OrderRefund ledger'ında). Refund destination split'inin external havuzu (Re cap).
 */
export async function getOrderExternalRefundableMinor(
  tx: Tx,
  storeId: string,
  orderId: string,
  currency: string,
): Promise<number> {
  const captured = await loadCapturedMinor(tx, storeId, orderId, currency, { excludeStoreCredit: true });
  const ledger = await loadLedgerRows(tx, storeId, orderId);
  return computeRefundableRemainingMinor(captured, ledger, currency);
}

/**
 * Refund SUCCEEDED sonrası sipariş ödeme durumu PROJEKSİYONU (monotonic). Attempt REFUNDED'a çevrilmez
 * (captured otoritesi korunur). Yalnız Order.paymentStatus (display) güncellenir.
 */
async function reprojectOrderPaymentStatus(tx: Tx, storeId: string, orderId: string): Promise<void> {
  const order = await tx.order.findFirst({
    where: { id: orderId, storeId },
    select: { id: true, currency: true, paymentStatus: true },
  });
  if (!order) return;
  const captured = await loadCapturedMinor(tx, storeId, orderId, order.currency);
  const succeeded = await tx.orderRefund.aggregate({
    where: { storeId, orderId, status: "SUCCEEDED", currency: order.currency },
    _sum: { totalRefundMinor: true },
  });
  const target = resolveRefundedPaymentStatus(
    order.paymentStatus,
    captured,
    succeeded._sum.totalRefundMinor ?? 0,
  );
  if (target) {
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: target } });
  }
}

/**
 * Refund SUCCEEDED olunca bağlı ReturnRequest'i (REFUND_PENDING) COMPLETED'a ilerletir — Σ SUCCEEDED
 * OrderRefund intent totalını karşılıyorsa. State machine + version guard inline (nested tx yok).
 */
async function tryCompleteReturn(tx: Tx, storeId: string, refundId: string): Promise<void> {
  const refund = await tx.orderRefund.findFirst({
    where: { id: refundId, storeId },
    select: { returnRequestId: true },
  });
  if (!refund?.returnRequestId) return;
  const rr = await tx.returnRequest.findFirst({
    where: { id: refund.returnRequestId, storeId },
    select: {
      id: true,
      status: true,
      version: true,
      resolutionType: true,
      refundIntent: { select: { totalRefundMinor: true } },
    },
  });
  if (!rr || rr.status !== "REFUND_PENDING" || rr.resolutionType !== "REFUND_TO_ORIGINAL_PAYMENT") return;
  // REFUND_PENDING→COMPLETED ADMIN-yetki sınıfı geçiştir (admin refund'u başlattı); sistem admin adına
  // otomatik tamamlar. History'de actorType SYSTEM kalır (dürüst: gerçek refund sonucu tetikledi).
  if (!evaluateReturnTransition("REFUND_PENDING", "COMPLETED", "ADMIN").ok) return;
  const intentTotal = rr.refundIntent?.totalRefundMinor ?? null;
  if (intentTotal === null) return;
  const agg = await tx.orderRefund.aggregate({
    where: { storeId, returnRequestId: rr.id, status: "SUCCEEDED" },
    _sum: { totalRefundMinor: true },
  });
  if ((agg._sum.totalRefundMinor ?? 0) < intentTotal) return;
  const updated = await tx.returnRequest.updateMany({
    where: { id: rr.id, storeId, version: rr.version },
    data: { status: "COMPLETED", version: { increment: 1 }, completedAt: new Date() },
  });
  if (updated.count === 0) return; // yarış kaybı — güvenli no-op
  await tx.returnStatusHistory.create({
    data: {
      storeId,
      returnRequestId: rr.id,
      fromStatus: "REFUND_PENDING",
      toStatus: "COMPLETED",
      actorType: "SYSTEM",
      actorId: null,
      note: "Refund succeeded → COMPLETED (ADR-272).",
    },
  });
}

/**
 * Provider sonucunu (SUCCEEDED/PROCESSING/FAILED/UNKNOWN) refund satırına uygular. SUCCEEDED'de sipariş
 * ödeme durumu + return tamamlanması türetilir. Duplicate providerRefundId (unique çakışması) idempotent
 * ele alınır (ikinci para hareketi ÜRETİLMEZ → DUPLICATE_CALLBACK).
 */
async function applyOutcome(
  storeId: string,
  refundId: string,
  outcome: RefundExecutionResult,
  actorType: OrderRefundActorType,
  actorId: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const refund = await tx.orderRefund.findFirst({
      where: { id: refundId, storeId },
      select: {
        id: true,
        orderId: true,
        status: true,
        version: true,
        totalRefundMinor: true,
        provider: true,
        providerRefundId: true,
      },
    });
    if (!refund) return;
    // Terminal refund'a geç gelen sonuç: yalnız FAILED sonrası eşleşen providerRefundId ile SUCCEEDED kabul.
    if (refund.status === "SUCCEEDED" || refund.status === "CANCELLED") return;

    const now = new Date();
    if (outcome.outcome === "SUCCEEDED") {
      // Duplicate providerRefundId koruması: aynı (storeId,provider,providerRefundId) başka satırda varsa
      // ikinci para hareketi kaydetme → bu satırı FAILED(DUPLICATE) yap + DUPLICATE_CALLBACK.
      if (outcome.providerRefundId && refund.provider) {
        const existing = await tx.orderRefund.findFirst({
          where: {
            storeId,
            provider: refund.provider,
            providerRefundId: outcome.providerRefundId,
            NOT: { id: refund.id },
          },
          select: { id: true },
        });
        if (existing) {
          await tx.orderRefund.update({
            where: { id: refund.id },
            data: {
              status: "FAILED",
              failedAt: now,
              failureCode: "DUPLICATE_REFUND",
              failureMessage: "Aynı sağlayıcı iade referansı zaten kaydedildi.",
              version: { increment: 1 },
            },
          });
          await writeEvent(tx, storeId, refund.id, "DUPLICATE_CALLBACK", ACTOR_PROVIDER, null, refund.totalRefundMinor, {
            providerReference: outcome.providerRefundId,
          });
          return;
        }
      }
      await tx.orderRefund.update({
        where: { id: refund.id },
        data: {
          status: "SUCCEEDED",
          completedAt: now,
          providerRefundId: outcome.providerRefundId ?? undefined,
          providerReference: outcome.providerReference ?? undefined,
          version: { increment: 1 },
        },
      });
      await writeEvent(tx, storeId, refund.id, "SUCCEEDED", actorType, actorId, refund.totalRefundMinor, {
        providerReference: outcome.providerReference ?? outcome.providerRefundId ?? null,
      });
      await reprojectOrderPaymentStatus(tx, storeId, refund.orderId);
      await tryCompleteReturn(tx, storeId, refund.id);
      return;
    }
    if (outcome.outcome === "PROCESSING" || outcome.outcome === "UNKNOWN") {
      await tx.orderRefund.update({
        where: { id: refund.id },
        data: {
          status: "PROCESSING",
          processingStartedAt: refund.status === "PROCESSING" ? undefined : now,
          providerRefundId: outcome.providerRefundId ?? undefined,
          providerReference: outcome.providerReference ?? undefined,
          version: { increment: 1 },
        },
      });
      await writeEvent(
        tx,
        storeId,
        refund.id,
        outcome.outcome === "UNKNOWN" ? "STATUS_QUERIED" : "PROCESSING",
        actorType,
        actorId,
        refund.totalRefundMinor,
        {
          providerReference: outcome.providerReference ?? null,
          metadata: outcome.outcome === "UNKNOWN" ? { unknown: true } : undefined,
        },
      );
      return;
    }
    // FAILED
    await tx.orderRefund.update({
      where: { id: refund.id },
      data: {
        status: "FAILED",
        failedAt: now,
        failureCode: outcome.failureCode ?? "REFUND_FAILED",
        failureMessage: outcome.failureMessage ?? null,
        version: { increment: 1 },
      },
    });
    await writeEvent(tx, storeId, refund.id, "FAILED", actorType, actorId, refund.totalRefundMinor, {
      metadata: outcome.failureCode ? { failureCode: outcome.failureCode } : undefined,
    });
  });
}

/** PROVIDER_AUTOMATIC refund'u yürütür (tx DIŞINDA provider çağrısı; sonra applyOutcome). */
async function executeAutomatic(
  storeId: string,
  refundId: string,
  deps: RefundServiceDeps,
  actorId: string | null,
): Promise<void> {
  const refund = await prisma.orderRefund.findFirst({
    where: { id: refundId, storeId },
    select: {
      id: true,
      provider: true,
      paymentAttemptId: true,
      totalRefundMinor: true,
      currency: true,
      idempotencyKey: true,
      paymentAttempt: { select: { providerReference: true, scenario: true } },
    },
  });
  if (!refund || !refund.provider) return;
  await prisma.orderRefund.update({
    where: { id: refund.id },
    data: { status: "PROCESSING", processingStartedAt: new Date() },
  });
  await prisma.orderRefundEvent.create({
    data: {
      storeId,
      orderRefundId: refund.id,
      type: "PROVIDER_SUBMITTED",
      actorType: ACTOR_SYSTEM,
      actorId,
      amountMinor: refund.totalRefundMinor,
    },
  });
  let outcome: RefundExecutionResult;
  try {
    outcome = await deps.providerPort.createRefund({
      provider: refund.provider,
      paymentAttemptId: refund.paymentAttemptId,
      providerReference: refund.paymentAttempt?.providerReference ?? null,
      amountMinor: refund.totalRefundMinor,
      currency: refund.currency,
      idempotencyKey: refund.idempotencyKey,
      scenario: refund.paymentAttempt?.scenario ?? null,
    });
  } catch (err) {
    if (err instanceof RefundProviderTimeoutError) {
      // Timeout → sonuç bilinmiyor → UNKNOWN (PROCESSING kalır; kör retry YOK, reconcile bekler).
      outcome = { outcome: "UNKNOWN" };
    } else {
      const norm = normalizeRefundError(err);
      outcome = { outcome: "FAILED", failureCode: norm.failureCode, failureMessage: norm.failureMessage };
    }
  }
  await applyOutcome(storeId, refund.id, outcome, ACTOR_SYSTEM, actorId);
}

interface InitiateInput {
  storeId: string;
  refundIntentId: string;
  expectedReturnVersion?: number;
  actorUserId: string | null;
  isRetry?: boolean;
}

/**
 * Refund attempt oluşturur (ilk başlatma VEYA FAILED sonrası retry). Tek tx: advisory lock → doğrulama →
 * cap hesabı → OrderRefund PENDING → RefundIntent atomik consume (PENDING→CONSUMED) → REQUESTED/RETRY event.
 * PROVIDER_AUTOMATIC ise commit sonrası provider yürütülür.
 */
export async function initiateRefund(input: InitiateInput, deps: RefundServiceDeps): Promise<RefundResult> {
  const pre = await prisma.refundIntent.findFirst({
    where: { id: input.refundIntentId, storeId: input.storeId },
    select: { id: true, orderId: true },
  });
  if (!pre) return { ok: false, code: "INTENT_NOT_FOUND" };

  const created = await prisma.$transaction(async (tx) => {
    await lockOrder(tx, input.storeId, pre.orderId);

    const intent = await tx.refundIntent.findFirst({
      where: { id: input.refundIntentId, storeId: input.storeId },
      select: {
        id: true,
        orderId: true,
        returnRequestId: true,
        paymentAttemptId: true,
        currency: true,
        totalRefundMinor: true,
        productRefundMinor: true,
        shippingRefundMinor: true,
        taxRefundMinor: true,
        status: true,
        returnRequest: { select: { status: true, resolutionType: true, version: true } },
        paymentAttempt: {
          select: { id: true, status: true, currency: true, provider: true, method: true, type: true, manualMethod: true },
        },
      },
    });
    if (!intent) return { ok: false as const, code: "INTENT_NOT_FOUND" as RefundErrorCode };
    if (intent.status === "CANCELLED" || intent.status === "PROCESSED") {
      return { ok: false as const, code: "STALE_INTENT" as RefundErrorCode };
    }
    const rr = intent.returnRequest;
    if (!rr || rr.status !== "REFUND_PENDING") return { ok: false as const, code: "RETURN_NOT_REFUND_PENDING" as RefundErrorCode };
    if (input.expectedReturnVersion !== undefined && rr.version !== input.expectedReturnVersion) {
      return { ok: false as const, code: "VERSION_CONFLICT" as RefundErrorCode };
    }
    if (rr.resolutionType !== "REFUND_TO_ORIGINAL_PAYMENT") return { ok: false as const, code: "NOT_REFUND_RESOLUTION" as RefundErrorCode };
    if (!intent.paymentAttemptId || !intent.paymentAttempt) return { ok: false as const, code: "NO_PAYMENT_ATTEMPT" as RefundErrorCode };
    const attempt = intent.paymentAttempt;
    if (attempt.status !== "PAID" && attempt.status !== "AUTHORIZED") {
      return { ok: false as const, code: "PAYMENT_NOT_CAPTURED" as RefundErrorCode };
    }
    if (attempt.currency !== intent.currency) return { ok: false as const, code: "CURRENCY_MISMATCH" as RefundErrorCode };

    // Aktif/gerçekleşmiş refund varsa yeni attempt YASAK (intent tek obligation; retry yalnız FAILED sonrası).
    const activeExisting = await tx.orderRefund.findFirst({
      where: { storeId: input.storeId, returnRequestId: intent.returnRequestId, status: { in: ["PENDING", "PROCESSING", "SUCCEEDED"] } },
      select: { id: true },
    });
    if (activeExisting) return { ok: false as const, code: "REFUND_ALREADY_ACTIVE" as RefundErrorCode };

    // Cap invariant (order+currency): captured − reserved ≥ istenen.
    const captured = await loadCapturedMinor(tx, input.storeId, intent.orderId, intent.currency);
    const ledger = await loadLedgerRows(tx, input.storeId, intent.orderId);
    const remaining = computeRefundableRemainingMinor(captured, ledger, intent.currency);
    if (!isWithinRefundable(intent.totalRefundMinor, remaining)) {
      return { ok: false as const, code: "EXCEEDS_REFUNDABLE" as RefundErrorCode };
    }

    const capability: RefundCapability = resolveRefundCapability({
      type: attempt.type,
      provider: attempt.provider,
      method: attempt.method,
      manualMethod: attempt.manualMethod,
    });

    const seq = await tx.orderRefund.count({ where: { storeId: input.storeId, refundIntentId: intent.id } });
    const idempotencyKey = seq === 0 ? `order-refund:${intent.id}` : `order-refund:${intent.id}:retry:${seq}`;

    let refundId: string;
    try {
      const refund = await tx.orderRefund.create({
        data: {
          storeId: input.storeId,
          orderId: intent.orderId,
          // TODO-174A (ADR-280) — pozitif menşe: iade talebi akışı.
          origin: "RETURN_REQUEST",
          returnRequestId: intent.returnRequestId,
          refundIntentId: intent.id,
          paymentAttemptId: attempt.id,
          provider: capability.provider,
          executionMode: capability.mode,
          method: capability.method,
          status: "PENDING",
          currency: intent.currency,
          productRefundMinor: intent.productRefundMinor,
          shippingRefundMinor: intent.shippingRefundMinor,
          taxRefundMinor: intent.taxRefundMinor,
          totalRefundMinor: intent.totalRefundMinor,
          manualMethod: capability.mode === "MANUAL_OFFLINE" ? capability.manualMethod : null,
          idempotencyKey,
          requestedByPlatformUserId: input.actorUserId,
        },
        select: { id: true },
      });
      refundId = refund.id;
    } catch (err) {
      // Idempotent: aynı key ikinci refund üretmez → mevcut satırı döndür.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await tx.orderRefund.findFirst({
          where: { storeId: input.storeId, idempotencyKey },
          select: { id: true },
        });
        if (existing) return { ok: true as const, refundId: existing.id, mode: capability.mode, deduped: true as const };
      }
      throw err;
    }

    // RefundIntent atomik consume (yalnız PENDING → CONSUMED; CONSUMED ise retry → no-op).
    if (intent.status === "PENDING") {
      await tx.refundIntent.updateMany({
        where: { id: intent.id, storeId: input.storeId, status: "PENDING" },
        data: { status: "CONSUMED" },
      });
    }

    await writeEvent(
      tx,
      input.storeId,
      refundId,
      input.isRetry ? "RETRY" : "REQUESTED",
      ACTOR_ADMIN,
      input.actorUserId,
      intent.totalRefundMinor,
    );

    return { ok: true as const, refundId, mode: capability.mode, deduped: false as const };
  });

  if (!created.ok) return created;
  // Otomatik yürütme yalnız tazece oluşturulan PROVIDER_AUTOMATIC refund için (deduped ise tekrar yürütme).
  if (created.mode === "PROVIDER_AUTOMATIC" && !created.deduped) {
    await executeAutomatic(input.storeId, created.refundId, deps, input.actorUserId);
  }
  return { ok: true, refundId: created.refundId };
}

/** FAILED refund sonrası güvenli retry — yeni attempt (aynı intent; intent zaten CONSUMED). */
export async function retryRefund(
  input: { storeId: string; refundId: string; expectedVersion?: number; actorUserId: string | null },
  deps: RefundServiceDeps,
): Promise<RefundResult> {
  const refund = await prisma.orderRefund.findFirst({
    where: { id: input.refundId, storeId: input.storeId },
    select: { id: true, status: true, version: true, refundIntentId: true },
  });
  if (!refund) return { ok: false, code: "REFUND_NOT_FOUND" };
  if (input.expectedVersion !== undefined && refund.version !== input.expectedVersion) {
    return { ok: false, code: "VERSION_CONFLICT" };
  }
  if (refund.status !== "FAILED") return { ok: false, code: "RETRY_NOT_ALLOWED" };
  if (!refund.refundIntentId) return { ok: false, code: "INTENT_NOT_FOUND" };
  return initiateRefund(
    { storeId: input.storeId, refundIntentId: refund.refundIntentId, actorUserId: input.actorUserId, isRetry: true },
    deps,
  );
}

/** PROCESSING/UNKNOWN refund için status reconciliation (provider getRefundStatus → applyOutcome). */
export async function refreshRefundStatus(
  input: { storeId: string; refundId: string; actorUserId: string | null },
  deps: RefundServiceDeps,
): Promise<RefundResult> {
  const refund = await prisma.orderRefund.findFirst({
    where: { id: input.refundId, storeId: input.storeId },
    select: {
      id: true,
      status: true,
      executionMode: true,
      provider: true,
      paymentAttemptId: true,
      providerRefundId: true,
      idempotencyKey: true,
      paymentAttempt: { select: { scenario: true } },
    },
  });
  if (!refund) return { ok: false, code: "REFUND_NOT_FOUND" };
  if (refund.status !== "PROCESSING" && refund.status !== "PENDING") return { ok: false, code: "INVALID_STATE" };
  if (refund.executionMode !== "PROVIDER_AUTOMATIC" || !refund.provider) return { ok: false, code: "AUTOMATIC_ONLY" };
  let outcome: RefundExecutionResult;
  try {
    outcome = await deps.providerPort.getRefundStatus({
      provider: refund.provider,
      paymentAttemptId: refund.paymentAttemptId,
      providerRefundId: refund.providerRefundId,
      idempotencyKey: refund.idempotencyKey,
      scenario: refund.paymentAttempt?.scenario ?? null,
    });
  } catch (err) {
    if (err instanceof RefundProviderTimeoutError) return { ok: false, code: "INVALID_STATE" };
    const norm = normalizeRefundError(err);
    outcome = { outcome: "FAILED", failureCode: norm.failureCode, failureMessage: norm.failureMessage };
  }
  await applyOutcome(input.storeId, refund.id, outcome, ACTOR_SYSTEM, input.actorUserId);
  return { ok: true, refundId: refund.id };
}

/** MANUAL_OFFLINE refund tamamlama (banka havalesi/manuel kart). Güçlü yetki route'ta zorunlu. */
export async function completeManualRefund(input: {
  storeId: string;
  refundId: string;
  expectedVersion?: number;
  manualReference: string;
  manualNote: string;
  actorUserId: string | null;
}): Promise<RefundResult> {
  const manualReference = input.manualReference.trim();
  const manualNote = input.manualNote.trim();
  if (manualReference.length === 0 || manualNote.length === 0) {
    return { ok: false, code: "MISSING_MANUAL_DETAILS" };
  }
  const result = await prisma.$transaction(async (tx) => {
    const refund = await tx.orderRefund.findFirst({
      where: { id: input.refundId, storeId: input.storeId },
      select: { id: true, orderId: true, status: true, version: true, executionMode: true, totalRefundMinor: true },
    });
    if (!refund) return { ok: false as const, code: "REFUND_NOT_FOUND" as RefundErrorCode };
    if (refund.executionMode !== "MANUAL_OFFLINE") return { ok: false as const, code: "MANUAL_ONLY" as RefundErrorCode };
    if (refund.status !== "PENDING") return { ok: false as const, code: "INVALID_STATE" as RefundErrorCode };
    await lockOrder(tx, input.storeId, refund.orderId);
    // İki kez tamamlanamaz: version guard'lı koşullu update.
    const updated = await tx.orderRefund.updateMany({
      where: { id: refund.id, storeId: input.storeId, status: "PENDING", version: input.expectedVersion ?? refund.version },
      data: {
        status: "SUCCEEDED",
        completedAt: new Date(),
        manualReference: manualReference.slice(0, 200),
        manualNote: manualNote.slice(0, 1000),
        manualCompletedByPlatformUserId: input.actorUserId,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) return { ok: false as const, code: "VERSION_CONFLICT" as RefundErrorCode };
    await writeEvent(tx, input.storeId, refund.id, "MANUAL_COMPLETED", ACTOR_ADMIN, input.actorUserId, refund.totalRefundMinor, {
      providerReference: manualReference.slice(0, 200),
    });
    await reprojectOrderPaymentStatus(tx, input.storeId, refund.orderId);
    await tryCompleteReturn(tx, input.storeId, refund.id);
    return { ok: true as const, refundId: refund.id };
  });
  return result;
}

/** PENDING/PROCESSING refund iptali (rezervasyonu serbest bırakır). */
export async function cancelRefund(input: {
  storeId: string;
  refundId: string;
  expectedVersion?: number;
  reason: string;
  actorUserId: string | null;
}): Promise<RefundResult> {
  return prisma.$transaction(async (tx) => {
    const refund = await tx.orderRefund.findFirst({
      where: { id: input.refundId, storeId: input.storeId },
      select: { id: true, orderId: true, status: true, version: true, totalRefundMinor: true },
    });
    if (!refund) return { ok: false as const, code: "REFUND_NOT_FOUND" as RefundErrorCode };
    if (refund.status !== "PENDING" && refund.status !== "PROCESSING") {
      return { ok: false as const, code: "INVALID_STATE" as RefundErrorCode };
    }
    await lockOrder(tx, input.storeId, refund.orderId);
    const updated = await tx.orderRefund.updateMany({
      where: { id: refund.id, storeId: input.storeId, status: { in: ["PENDING", "PROCESSING"] }, version: input.expectedVersion ?? refund.version },
      data: { status: "CANCELLED", cancelledAt: new Date(), version: { increment: 1 } },
    });
    if (updated.count === 0) return { ok: false as const, code: "VERSION_CONFLICT" as RefundErrorCode };
    await writeEvent(tx, input.storeId, refund.id, "CANCELLED", ACTOR_ADMIN, input.actorUserId, refund.totalRefundMinor, {
      metadata: { reason: input.reason.slice(0, 300) },
    });
    return { ok: true as const, refundId: refund.id };
  });
}

// ── TODO-174 (ADR-276) Cancellation Refund — intent'siz/return'süz ledger girişi ─────────────────
// Self-servis iptal, ReturnRequest/RefundIntent OLMADAN tam refundable bakiyeyi iade eder. OrderRefund
// ledger'ı (returnRequestId=null, refundIntentId=null) şema-yasaldır. Aynı executeAutomatic/applyOutcome/
// cap-calc/capability makinesi REUSE edilir; tryCompleteReturn returnRequestId null olduğu için no-op.
// Prep (ledger PENDING) iptal transaction'ı İÇİNDE çağrılır (obligation cancel ile atomik durur); provider
// yürütmesi commit SONRASI (executeAutomatic). Provider başarısızlığı order'ı CANCELLED bırakır (ADR-276).

export type CancellationRefundPrepStatus = "CREATED" | "SKIPPED_NO_CAPTURE" | "DEDUPED";

export interface CancellationRefundPrep {
  status: CancellationRefundPrepStatus;
  refundId: string | null;
  mode: import("@prisma/client").RefundExecutionMode | null;
}

/**
 * İptal refund'unu ledger'a PENDING olarak yazar (iptal tx İÇİNDE). Tam refundable bakiye (captured − aktif/
 * succeeded) iade edilir; kargo ücreti dahil. Ödeme alınmamışsa (remaining<=0) refund ÜRETİLMEZ. Idempotent:
 * `order-cancel-refund:<orderId>` unique → ikinci iptal refund'u oluşturmaz (DEDUPED). Provider ÇAĞRILMAZ.
 */
export async function prepareCancellationRefund(
  tx: Tx,
  input: {
    storeId: string;
    orderId: string;
    customerId: string;
    actorUserId: string | null;
    // TODO-175 — external refundable'ın hedefi. Yok/ORIGINAL_PAYMENT → PSP; SHOPPING_BALANCE → non-expiring credit.
    refundDestination?: RefundDestination;
  },
): Promise<CancellationRefundPrep> {
  await lockOrder(tx, input.storeId, input.orderId);
  const order = await tx.order.findFirst({
    where: { id: input.orderId, storeId: input.storeId },
    select: { id: true, currency: true, shippingAmount: true, taxAmount: true },
  });
  if (!order) return { status: "SKIPPED_NO_CAPTURE", refundId: null, mode: null };

  // TODO-174B (ADR-282) — External (STORE_CREDIT HÂRİÇ) tahsilat: yalnız kart/PSP kısmı sağlayıcıya
  // iade edilir. Alışveriş bakiyesiyle ödenen kısım restoreCreditForOrderInTx ile bakiyeye geri döner.
  const captured = await loadCapturedMinor(tx, input.storeId, order.id, order.currency, { excludeStoreCredit: true });
  const ledger = await loadLedgerRows(tx, input.storeId, order.id);
  const remaining = computeRefundableRemainingMinor(captured, ledger, order.currency);
  if (remaining <= 0) return { status: "SKIPPED_NO_CAPTURE", refundId: null, mode: null };

  // Tahsil edilmiş external attempt (PAID öncelik; yoksa AUTHORIZED). STORE_CREDIT attempt'i HÂRİÇ
  // (sağlayıcıya iade edilmez). Refund çağrısı bu attempt'i referanslar.
  const attempt =
    (await tx.paymentAttempt.findFirst({
      where: { storeId: input.storeId, orderId: order.id, currency: order.currency, status: "PAID", method: { not: "STORE_CREDIT" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, provider: true, method: true, type: true, manualMethod: true },
    })) ??
    (await tx.paymentAttempt.findFirst({
      where: { storeId: input.storeId, orderId: order.id, currency: order.currency, status: "AUTHORIZED", method: { not: "STORE_CREDIT" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, provider: true, method: true, type: true, manualMethod: true },
    }));
  if (!attempt) return { status: "SKIPPED_NO_CAPTURE", refundId: null, mode: null };

  // Split (disclosure): total = product + shipping; tax product İÇİNDE. Kargo tamamı iade (remaining ile cap).
  const shippingRefundMinor = Math.min(Math.max(0, order.shippingAmount), remaining);
  const productRefundMinor = remaining - shippingRefundMinor;
  const taxRefundMinor = Math.min(Math.max(0, order.taxAmount), productRefundMinor);

  const destination: RefundDestination = input.refundDestination ?? "ORIGINAL_PAYMENT";
  const idempotencyKey = `order-cancel-refund:${order.id}`;

  // TODO-175 — SHOPPING_BALANCE: external refundable PSP'ye GİTMEZ; non-expiring credit'e döner.
  // OrderRefund INTERNAL_CREDIT + tx-içi SUCCEEDED (finansal/audit record); credit issue ile eşleşir.
  if (destination === "SHOPPING_BALANCE") {
    try {
      const now = new Date();
      const refund = await tx.orderRefund.create({
        data: {
          storeId: input.storeId,
          orderId: order.id,
          origin: "ORDER_CANCELLATION",
          refundDestination: "SHOPPING_BALANCE",
          returnRequestId: null,
          refundIntentId: null,
          paymentAttemptId: attempt.id,
          provider: null,
          executionMode: "INTERNAL_CREDIT",
          method: attempt.method,
          status: "SUCCEEDED",
          currency: order.currency,
          productRefundMinor,
          shippingRefundMinor,
          taxRefundMinor,
          totalRefundMinor: remaining,
          idempotencyKey,
          requestedByPlatformUserId: input.actorUserId,
          processingStartedAt: now,
          completedAt: now,
        },
        select: { id: true },
      });
      await writeEvent(tx, input.storeId, refund.id, "REQUESTED", ACTOR_SYSTEM, input.actorUserId, remaining, {
        metadata: { source: "ORDER_CANCELLATION", destination: "SHOPPING_BALANCE" },
      });
      await writeEvent(tx, input.storeId, refund.id, "SUCCEEDED", ACTOR_SYSTEM, input.actorUserId, remaining, {
        metadata: { source: "ORDER_CANCELLATION", destination: "SHOPPING_BALANCE" },
      });
      // Non-expiring refund-origin credit (external→balance). Idempotent (order başına tek).
      const credit = await issueCreditInTx(tx, {
        storeId: input.storeId,
        customerId: input.customerId,
        currency: order.currency,
        amountMinor: BigInt(remaining),
        expiryDays: null,
        refundOriginSystemPath: true,
        sourceType: "ORDER_CANCELLATION",
        ledgerType: "REFUND_RESTORE",
        description: "credit.cancellationRefund",
        actor: { type: "SYSTEM", id: null },
        idempotencyKey: `order-cancel-balance-refund:${order.id}`,
      });
      if (!credit.ok) throw new Error(`cancellation shopping-balance credit failed: ${credit.code}`);
      return { status: "CREATED", refundId: refund.id, mode: "INTERNAL_CREDIT" };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await tx.orderRefund.findFirst({
          where: { storeId: input.storeId, idempotencyKey },
          select: { id: true, executionMode: true },
        });
        if (existing) return { status: "DEDUPED", refundId: existing.id, mode: existing.executionMode };
      }
      throw err;
    }
  }

  const capability: RefundCapability = resolveRefundCapability({
    type: attempt.type,
    provider: attempt.provider,
    method: attempt.method,
    manualMethod: attempt.manualMethod,
  });

  try {
    const refund = await tx.orderRefund.create({
      data: {
        storeId: input.storeId,
        orderId: order.id,
        // TODO-174A (ADR-280) — pozitif menşe: intent'siz sipariş iptali geri ödemesi.
        origin: "ORDER_CANCELLATION",
        refundDestination: "ORIGINAL_PAYMENT",
        returnRequestId: null,
        refundIntentId: null,
        paymentAttemptId: attempt.id,
        provider: capability.provider,
        executionMode: capability.mode,
        method: capability.method,
        status: "PENDING",
        currency: order.currency,
        productRefundMinor,
        shippingRefundMinor,
        taxRefundMinor,
        totalRefundMinor: remaining,
        manualMethod: capability.mode === "MANUAL_OFFLINE" ? capability.manualMethod : null,
        idempotencyKey,
        requestedByPlatformUserId: input.actorUserId,
      },
      select: { id: true },
    });
    await writeEvent(tx, input.storeId, refund.id, "REQUESTED", ACTOR_SYSTEM, input.actorUserId, remaining, {
      metadata: { source: "ORDER_CANCELLATION", destination: "ORIGINAL_PAYMENT" },
    });
    return { status: "CREATED", refundId: refund.id, mode: capability.mode };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await tx.orderRefund.findFirst({
        where: { storeId: input.storeId, idempotencyKey },
        select: { id: true, executionMode: true },
      });
      if (existing) return { status: "DEDUPED", refundId: existing.id, mode: existing.executionMode };
    }
    throw err;
  }
}

/**
 * İptal refund'unu (PROVIDER_AUTOMATIC) commit SONRASI yürütür. Var olan executeAutomatic'i sarar
 * (aynı applyOutcome/reprojectOrderPaymentStatus; tryCompleteReturn no-op). Başarısızlık order'ı
 * CANCELLED bırakır; ledger FAILED olur (admin recovery: retry/manual).
 */
export async function runCancellationRefundExecution(
  storeId: string,
  refundId: string,
  deps: RefundServiceDeps,
  actorUserId: string | null,
): Promise<void> {
  await executeAutomatic(storeId, refundId, deps, actorUserId);
}

// ── Read modeli (admin/customer bağlamları) ────────────────────────────────────────────────────

export interface OrderRefundContext {
  currency: string;
  capturedMinor: number;
  succeededRefundMinor: number;
  activeRefundMinor: number;
  refundableRemainingMinor: number;
}

/** Order için refund bağlamı (captured/refunded/remaining). storeId-scoped. */
export async function getOrderRefundContext(storeId: string, orderId: string): Promise<OrderRefundContext | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId },
    select: { id: true, currency: true },
  });
  if (!order) return null;
  const captured = await loadCapturedMinor(prisma, storeId, orderId, order.currency);
  const ledger = await loadLedgerRows(prisma, storeId, orderId);
  return {
    currency: order.currency,
    capturedMinor: captured,
    succeededRefundMinor: sumSucceededRefundMinor(ledger, order.currency),
    activeRefundMinor: sumActiveRefundMinor(ledger, order.currency),
    refundableRemainingMinor: computeRefundableRemainingMinor(captured, ledger, order.currency),
  };
}
