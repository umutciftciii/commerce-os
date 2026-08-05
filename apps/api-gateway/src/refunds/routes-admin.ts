/**
 * TODO-170 (ADR-272) — Refund Ledger Store-Admin route'ları. Tüm sorgular storeId-first scoped; cross-store
 * 404. Mutating aksiyonlar expectedVersion (optimistic) taşır. Manuel iade tamamlama AYRI güçlü yetki
 * (requireStoreSuperAdmin). Ham provider hata kodu müşteriye sızmaz (admin yüzeyinde kontrollü).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "@commerce-os/db";
import type { AuditAction } from "@prisma/client";
import {
  adminCancelRefundRequestSchema,
  adminInitiateRefundRequestSchema,
  adminManualCompleteRefundRequestSchema,
  adminRefundContextResponseSchema,
  adminRefundResponseSchema,
  adminRefundVersionActionRequestSchema,
} from "@commerce-os/contracts";
import { resolveRefundCapability } from "./capability.js";
import {
  computeRefundableRemainingMinor,
  sumActiveRefundMinor,
  sumSucceededRefundMinor,
  type RefundLedgerRow,
} from "./cap-calc.js";
import { createRefundProviderPort } from "./mock-refund.js";
import { sumCapturedMinor } from "../payments/payment-state.js";
import {
  cancelRefund,
  completeManualRefund,
  initiateRefund,
  refreshRefundStatus,
  retryRefund,
  type RefundErrorCode,
} from "./service.js";
import { buildAdminRefundContext, serializeAdminRefund } from "./serialize.js";
import { resolveRefundSummaryStatus } from "./summary-status.js";

interface StoreAdminAccess {
  actorUserId: string;
}

export interface RefundAdminRoutesDeps {
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<StoreAdminAccess | null>;
  // Manuel iade için AYRI güçlü yetki (ör. SUPER_ADMIN). Yetersizse 403 gönderip null döner.
  requireStoreSuperAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<StoreAdminAccess | null>;
  recordAudit: (input: {
    storeId: string;
    platformUserId: string;
    action: AuditAction;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void> | void;
}

const providerPort = createRefundProviderPort();

const errorBody = (code: string, message: string) => ({ error: { code, message } });

const returnParam = z.object({ storeId: z.string().min(1), returnId: z.string().min(1) });
const orderParam = z.object({ storeId: z.string().min(1), orderId: z.string().min(1) });
const refundParam = z.object({ storeId: z.string().min(1), refundId: z.string().min(1) });

const HTTP_BY_CODE: Record<RefundErrorCode, { status: number; message: string }> = {
  INTENT_NOT_FOUND: { status: 404, message: "İade niyeti bulunamadı." },
  REFUND_NOT_FOUND: { status: 404, message: "İade kaydı bulunamadı." },
  VERSION_CONFLICT: { status: 409, message: "Kayıt bu sırada değişti; yenileyin." },
  STALE_INTENT: { status: 409, message: "İade niyeti artık işlenebilir durumda değil." },
  RETURN_NOT_REFUND_PENDING: { status: 409, message: "İade talebi para iadesi aşamasında değil." },
  NOT_REFUND_RESOLUTION: { status: 409, message: "Bu talebin çözümü orijinal ödemeye iade değil." },
  NO_PAYMENT_ATTEMPT: { status: 409, message: "İlişkili başarılı ödeme bulunamadı." },
  PAYMENT_NOT_CAPTURED: { status: 409, message: "Ödeme tahsil edilmemiş; iade yapılamaz." },
  CURRENCY_MISMATCH: { status: 409, message: "Para birimi uyuşmuyor." },
  REFUND_ALREADY_ACTIVE: { status: 409, message: "Bu talep için zaten aktif/başarılı bir iade var." },
  EXCEEDS_REFUNDABLE: { status: 409, message: "Talep iade edilebilir kalan tutarı aşıyor." },
  INVALID_STATE: { status: 409, message: "İade bu durumda bu işleme uygun değil." },
  MANUAL_ONLY: { status: 409, message: "Bu iade yalnız manuel tamamlanabilir." },
  AUTOMATIC_ONLY: { status: 409, message: "Bu iade otomatik yürütülür; manuel işlem geçersiz." },
  MISSING_MANUAL_DETAILS: { status: 400, message: "Banka/referans ve açıklama zorunludur." },
  RETRY_NOT_ALLOWED: { status: 409, message: "Yalnız başarısız iade tekrar denenebilir." },
};

function sendRefundError(reply: FastifyReply, code: RefundErrorCode): void {
  const mapped = HTTP_BY_CODE[code];
  void reply.code(mapped.status).send(errorBody(code, mapped.message));
}

/** Order-level captured + ledger rows (cap hesabı için). */
async function loadOrderMoney(storeId: string, orderId: string, currency: string) {
  const attempts = await prisma.paymentAttempt.findMany({
    where: { storeId, orderId, currency },
    select: { status: true, amount: true },
  });
  const ledger: RefundLedgerRow[] = await prisma.orderRefund.findMany({
    where: { storeId, orderId },
    select: { status: true, totalRefundMinor: true, currency: true },
  });
  const capturedMinor = sumCapturedMinor(attempts);
  return {
    capturedMinor,
    succeededRefundMinor: sumSucceededRefundMinor(ledger, currency),
    activeRefundMinor: sumActiveRefundMinor(ledger, currency),
    refundableRemainingMinor: computeRefundableRemainingMinor(capturedMinor, ledger, currency),
  };
}

/** Bir iade talebi için tam refund bağlamı (intent + capability + refunds + canInitiate). */
async function buildReturnContext(storeId: string, returnId: string) {
  const rr = await prisma.returnRequest.findFirst({
    where: { id: returnId, storeId },
    select: {
      id: true,
      orderId: true,
      status: true,
      resolutionType: true,
      refundIntent: {
        select: {
          id: true,
          currency: true,
          status: true,
          productRefundMinor: true,
          shippingRefundMinor: true,
          taxRefundMinor: true,
          totalRefundMinor: true,
          paymentAttempt: {
            select: { type: true, provider: true, method: true, manualMethod: true, status: true },
          },
        },
      },
      orderRefunds: {
        orderBy: { createdAt: "asc" },
        include: { events: true },
      },
    },
  });
  if (!rr) return null;
  const intent = rr.refundIntent;
  const currency = intent?.currency ?? "TRY";
  const money = await loadOrderMoney(storeId, rr.orderId, currency);
  const capability = intent?.paymentAttempt
    ? resolveRefundCapability({
        type: intent.paymentAttempt.type,
        provider: intent.paymentAttempt.provider,
        method: intent.paymentAttempt.method,
        manualMethod: intent.paymentAttempt.manualMethod,
      })
    : null;
  const hasActiveOrSucceeded = rr.orderRefunds.some(
    (r) => r.status === "PENDING" || r.status === "PROCESSING" || r.status === "SUCCEEDED",
  );
  const canInitiate =
    rr.status === "REFUND_PENDING" &&
    rr.resolutionType === "REFUND_TO_ORIGINAL_PAYMENT" &&
    !!intent &&
    (intent.status === "PENDING" || intent.status === "CONSUMED") &&
    !!intent.paymentAttempt &&
    (intent.paymentAttempt.status === "PAID" || intent.paymentAttempt.status === "AUTHORIZED") &&
    !hasActiveOrSucceeded &&
    intent.totalRefundMinor <= money.refundableRemainingMinor;

  const summaryStatus = resolveRefundSummaryStatus({
    refunds: rr.orderRefunds.map((r) => ({ status: r.status })),
    intentStatus: intent?.status ?? null,
    orderCapturedMinor: money.capturedMinor,
    orderSucceededRefundMinor: money.succeededRefundMinor,
  });
  const context = buildAdminRefundContext({
    currency,
    capturedMinor: money.capturedMinor,
    succeededRefundMinor: money.succeededRefundMinor,
    activeRefundMinor: money.activeRefundMinor,
    refundableRemainingMinor: money.refundableRemainingMinor,
    summaryStatus,
    intent: intent
      ? {
          currency: intent.currency,
          productRefundMinor: intent.productRefundMinor,
          shippingRefundMinor: intent.shippingRefundMinor,
          taxRefundMinor: intent.taxRefundMinor,
          totalRefundMinor: intent.totalRefundMinor,
          status: intent.status,
        }
      : null,
    capability,
    canInitiate,
    refunds: rr.orderRefunds,
  });
  return { rr, intent, context };
}

async function loadRefundWithEvents(storeId: string, refundId: string) {
  return prisma.orderRefund.findFirst({ where: { id: refundId, storeId }, include: { events: true } });
}

export function registerRefundAdminRoutes(app: FastifyInstance, deps: RefundAdminRoutesDeps): void {
  // İade talebi refund bağlamı (admin iade/ sipariş detayı action surface).
  app.get("/stores/:storeId/returns/:returnId/refund-context", async (request, reply) => {
    const params = returnParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const built = await buildReturnContext(params.storeId, params.returnId);
    if (!built) return reply.code(404).send(errorBody("RETURN_NOT_FOUND", "İade bulunamadı."));
    return reply.send(adminRefundContextResponseSchema.parse({ context: built.context }));
  });

  // Sipariş-seviyesi refund bağlamı (order detayı; tüm refund'lar + captured/remaining).
  app.get("/stores/:storeId/orders/:orderId/refund-context", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const order = await prisma.order.findFirst({
      where: { id: params.orderId, storeId: params.storeId },
      select: { id: true, currency: true },
    });
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Sipariş bulunamadı."));
    const money = await loadOrderMoney(params.storeId, order.id, order.currency);
    const refunds = await prisma.orderRefund.findMany({
      where: { storeId: params.storeId, orderId: order.id },
      orderBy: { createdAt: "asc" },
      include: { events: true },
    });
    const context = buildAdminRefundContext({
      currency: order.currency,
      capturedMinor: money.capturedMinor,
      succeededRefundMinor: money.succeededRefundMinor,
      activeRefundMinor: money.activeRefundMinor,
      refundableRemainingMinor: money.refundableRemainingMinor,
      summaryStatus: resolveRefundSummaryStatus({
        refunds: refunds.map((r) => ({ status: r.status })),
        intentStatus: null,
        orderCapturedMinor: money.capturedMinor,
        orderSucceededRefundMinor: money.succeededRefundMinor,
      }),
      intent: null,
      capability: null,
      canInitiate: false,
      refunds,
    });
    return reply.send(adminRefundContextResponseSchema.parse({ context }));
  });

  // Para iadesini başlat (intent iade talebinden türetilir).
  app.post("/stores/:storeId/returns/:returnId/refund", async (request, reply) => {
    const params = returnParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = adminInitiateRefundRequestSchema.parse(request.body ?? {});
    const rr = await prisma.returnRequest.findFirst({
      where: { id: params.returnId, storeId: params.storeId },
      select: { id: true, refundIntent: { select: { id: true } } },
    });
    if (!rr) return reply.code(404).send(errorBody("RETURN_NOT_FOUND", "İade bulunamadı."));
    if (!rr.refundIntent) return sendRefundError(reply, "INTENT_NOT_FOUND");
    const result = await initiateRefund(
      {
        storeId: params.storeId,
        refundIntentId: rr.refundIntent.id,
        expectedReturnVersion: body.expectedReturnVersion,
        actorUserId: access.actorUserId,
      },
      { providerPort },
    );
    if (!result.ok) return sendRefundError(reply, result.code);
    await deps.recordAudit({
      storeId: params.storeId,
      platformUserId: access.actorUserId,
      action: "CREATE",
      entityType: "OrderRefund",
      entityId: result.refundId,
      metadata: { action: "refund.initiated" },
    });
    return replyRefund(reply, params.storeId, params.returnId, result.refundId);
  });

  // Durumu yenile (PROCESSING/UNKNOWN reconciliation).
  app.post("/stores/:storeId/refunds/:refundId/refresh", async (request, reply) => {
    const params = refundParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const result = await refreshRefundStatus(
      { storeId: params.storeId, refundId: params.refundId, actorUserId: access.actorUserId },
      { providerPort },
    );
    if (!result.ok) return sendRefundError(reply, result.code);
    return replyRefundById(reply, params.storeId, params.refundId);
  });

  // Tekrar dene (yalnız FAILED sonrası; yeni attempt).
  app.post("/stores/:storeId/refunds/:refundId/retry", async (request, reply) => {
    const params = refundParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = adminRefundVersionActionRequestSchema.parse(request.body ?? {});
    const result = await retryRefund(
      { storeId: params.storeId, refundId: params.refundId, expectedVersion: body.expectedVersion, actorUserId: access.actorUserId },
      { providerPort },
    );
    if (!result.ok) return sendRefundError(reply, result.code);
    await deps.recordAudit({
      storeId: params.storeId,
      platformUserId: access.actorUserId,
      action: "UPDATE",
      entityType: "OrderRefund",
      entityId: result.refundId,
      metadata: { action: "refund.retried" },
    });
    return replyRefundById(reply, params.storeId, result.refundId);
  });

  // Manuel iade tamamlandı — AYRI güçlü yetki; banka/referans + açıklama zorunlu.
  app.post("/stores/:storeId/refunds/:refundId/manual-complete", async (request, reply) => {
    const params = refundParam.parse(request.params);
    const access = await deps.requireStoreSuperAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = adminManualCompleteRefundRequestSchema.parse(request.body ?? {});
    const result = await completeManualRefund({
      storeId: params.storeId,
      refundId: params.refundId,
      expectedVersion: body.expectedVersion,
      manualReference: body.manualReference,
      manualNote: body.manualNote,
      actorUserId: access.actorUserId,
    });
    if (!result.ok) return sendRefundError(reply, result.code);
    await deps.recordAudit({
      storeId: params.storeId,
      platformUserId: access.actorUserId,
      action: "UPDATE",
      entityType: "OrderRefund",
      entityId: result.refundId,
      metadata: { action: "refund.manual_completed", manualReference: body.manualReference },
    });
    return replyRefundById(reply, params.storeId, result.refundId);
  });

  // İadeyi iptal et (PENDING/PROCESSING → CANCELLED; rezervasyon serbest).
  app.post("/stores/:storeId/refunds/:refundId/cancel", async (request, reply) => {
    const params = refundParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = adminCancelRefundRequestSchema.parse(request.body ?? {});
    const result = await cancelRefund({
      storeId: params.storeId,
      refundId: params.refundId,
      expectedVersion: body.expectedVersion,
      reason: body.reason ?? "Admin tarafından iptal edildi.",
      actorUserId: access.actorUserId,
    });
    if (!result.ok) return sendRefundError(reply, result.code);
    await deps.recordAudit({
      storeId: params.storeId,
      platformUserId: access.actorUserId,
      action: "UPDATE",
      entityType: "OrderRefund",
      entityId: result.refundId,
      metadata: { action: "refund.cancelled" },
    });
    return replyRefundById(reply, params.storeId, result.refundId);
  });

  async function replyRefund(reply: FastifyReply, storeId: string, returnId: string, refundId: string) {
    const refund = await loadRefundWithEvents(storeId, refundId);
    const built = await buildReturnContext(storeId, returnId);
    if (!refund || !built) return reply.code(404).send(errorBody("REFUND_NOT_FOUND", "İade kaydı bulunamadı."));
    return reply.send(
      adminRefundResponseSchema.parse({ refund: serializeAdminRefund(refund), context: built.context }),
    );
  }

  async function replyRefundById(reply: FastifyReply, storeId: string, refundId: string) {
    const refund = await loadRefundWithEvents(storeId, refundId);
    if (!refund) return reply.code(404).send(errorBody("REFUND_NOT_FOUND", "İade kaydı bulunamadı."));
    const built = refund.returnRequestId ? await buildReturnContext(storeId, refund.returnRequestId) : null;
    const context =
      built?.context ??
      (
        await (async () => {
          const money = await loadOrderMoney(storeId, refund.orderId, refund.currency);
          const refunds = await prisma.orderRefund.findMany({
            where: { storeId, orderId: refund.orderId },
            orderBy: { createdAt: "asc" },
            include: { events: true },
          });
          return buildAdminRefundContext({
            currency: refund.currency,
            capturedMinor: money.capturedMinor,
            succeededRefundMinor: money.succeededRefundMinor,
            activeRefundMinor: money.activeRefundMinor,
            refundableRemainingMinor: money.refundableRemainingMinor,
            summaryStatus: resolveRefundSummaryStatus({
              refunds: refunds.map((r) => ({ status: r.status })),
              intentStatus: null,
              orderCapturedMinor: money.capturedMinor,
              orderSucceededRefundMinor: money.succeededRefundMinor,
            }),
            intent: null,
            capability: null,
            canInitiate: false,
            refunds,
          });
        })()
      );
    return reply.send(adminRefundResponseSchema.parse({ refund: serializeAdminRefund(refund), context }));
  }
}
