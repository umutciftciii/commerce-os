/**
 * TODO-169 (ADR-269) — Store Admin iade operasyon uçları. Tümü requireStoreAdmin (platform admin +
 * store scope) ile korunur; store-scoped 404 (cross-store görünmez). Her durum geçişi state-machine +
 * yetki + optimistic version'dan geçer (service). adminNote müşteriye SIZDIRILMAZ (bu yüzey admin).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@commerce-os/db";
import type { AuditAction, OrderRefundStatus, RefundIntentStatus, PlatformUserRole } from "@prisma/client";
import { z } from "zod";
import {
  adminReturnDetailResponseSchema,
  adminReturnListQuerySchema,
  adminRefundVisibilityListResponseSchema,
  adminReturnApproveRequestSchema,
  adminReturnInspectRequestSchema,
  adminReturnRejectRequestSchema,
  adminReturnTransitionRequestSchema,
  adminReturnFastRefundRequestSchema,
  adminReturnFastRefundContextResponseSchema,
  adminOrderReturnsResponseSchema,
  adminReturnDispositionCreateRequestSchema,
  adminReturnDispositionCancelRequestSchema,
  adminReverseShipmentCreateRequestSchema,
  adminReverseShipmentStatusRequestSchema,
  adminReverseShipmentTrackingRequestSchema,
  type AdminReturnRefundSummary,
} from "@commerce-os/contracts";
import {
  setReturnItemDisposition,
  cancelReturnItemDisposition,
  createReverseShipment,
  updateReverseShipmentStatus,
  updateReverseShipmentTracking,
} from "./reverse-shipment.js";
import { sumCapturedMinor } from "../payments/payment-state.js";
import { computeRefundableRemainingMinor, sumSucceededRefundMinor } from "../refunds/cap-calc.js";
import { resolveRefundSummaryStatus } from "../refunds/summary-status.js";
import { initiateRefund } from "../refunds/service.js";
import { createRefundProviderPort } from "../refunds/mock-refund.js";
// TD-FR-7 Faz 1 / Task 4 fix round 1 (Important) — initiateRefund'ün RefundResult'ını admin'e
// AYNI HTTP eşlemesiyle yansıtmak için manuel `/refund` endpoint'inin otoritesini REUSE eder
// (kopyalanmış bir tablo DEĞİL — tek kaynak refunds/routes-admin.ts).
import { HTTP_BY_CODE as REFUND_HTTP_BY_CODE } from "../refunds/routes-admin.js";
import {
  advanceInspectedToRefundPending,
  applyInspectionDecisions,
  applyReturnTransition,
  buildFastRefundContext,
  getHeldReturnedQtyByLine,
  loadFastRefundSettings,
  resolveStoreReturnPolicy,
  startFastRefundToRefundPending,
  upsertRefundIntentForReturn,
} from "./service.js";
import { serializeAdminReturnDetail, serializeAdminReturnListItem } from "./serialize.js";
import {
  isAdminRowOverdue,
  mapAdminCancellationRow,
  mapAdminReturnRow,
  mergeVisibilityRows,
  type AdminCancellationRowSource,
  type AdminReturnRowSource,
} from "../refunds/visibility.js";
import { resolveReturnItemCovers } from "./covers.js";
import { computeReturnOrderSummaries } from "./projection.js";
import { evaluateReturnTransition } from "./status-map.js";
import { writeReviewStartedEvent } from "./review-event.js";

export interface ReturnAdminRoutesDeps {
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string; role: PlatformUserRole } | null>;
  // TODO-172 (ADR-273) — Fast Refund AYRI güçlü yetki: SUPER_ADMIN. Backend-enforced; UI gizlemesi
  // tek başına yeterli değil. requireStoreAdmin (herhangi platform admin) İLE PARALEL değil, refund
  // manual-complete deseninin BİREBİR mirror'ı (server.ts wiring); yeni yetki tablosu kurulmaz.
  requireStoreSuperAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  recordAudit: (input: {
    action: AuditAction;
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => void | Promise<void>;
  // TODO-169 (blocker #3) — iade kalemi kapak görseli URL türetimi (storefront ile aynı helper).
  mediaBaseUrl: string | undefined;
}

function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

const storeParam = z.object({ storeId: z.string().min(1) });
const returnParam = z.object({ storeId: z.string().min(1), returnId: z.string().min(1) });

// TD-FR-7 Faz 1 / Task 4 — inspect-decision orchestration için MOCK-yürütülen refund provider port.
// refunds/routes-admin.ts'teki modül-seviyesi singleton'la AYNI factory (createRefundProviderPort);
// stateless olduğundan ayrı bir örnek üretmek davranışı değiştirmez.
const refundProviderPort = createRefundProviderPort();

// TODO-172 (ADR-273) — Fast Refund uygunluk/guard kodları → HTTP. Hepsi 409 (çakışan durum/limit);
// RETURN_NOT_FOUND yalnız 404. initiateRefund'ın kendi hata eşlemesi ayrı (REFUND_HTTP_BY_CODE).
const FAST_REFUND_HTTP_BY_CODE: Record<string, { status: number; message: string }> = {
  RETURN_NOT_FOUND: { status: 404, message: "İade bulunamadı." },
  FAST_REFUND_DISABLED: { status: 409, message: "Bu mağazada hızlı iade kapalı." },
  FAST_REFUND_LIMIT_NOT_SET: { status: 409, message: "Hızlı iade limiti tanımlı değil (kapalı)." },
  FAST_REFUND_INVALID_STATE: {
    status: 409,
    message: "Hızlı iade yalnız onaylanmış veya teslim alınmış iadelerde yapılabilir.",
  },
  NOT_REFUND_RESOLUTION: { status: 409, message: "Bu iade orijinal ödemeye iade çözümünde değil." },
  FAST_REFUND_INTENT_NOT_PENDING: {
    status: 409,
    message: "İade tutarı hazır değil (bekleyen iade kaydı yok).",
  },
  FAST_REFUND_CURRENCY_MISMATCH: {
    status: 409,
    message: "Limit para birimi sipariş para birimiyle eşleşmiyor; normal iade akışını kullanın.",
  },
  FAST_REFUND_LIMIT_EXCEEDED: {
    status: 409,
    message: "İade tutarı hızlı iade limitini aşıyor; normal iade akışını kullanın.",
  },
  VERSION_CONFLICT: { status: 409, message: "İade bu sırada değişti; yenileyin." },
};

export function registerReturnAdminRoutes(app: FastifyInstance, deps: ReturnAdminRoutesDeps): void {
  // Liste — TODO-174A: BİRLEŞİK iade talepleri + sipariş iptali geri ödemeleri (source filtreli).
  // ReturnRequest ve OrderRefund AYRI domain'ler; yalnız projeksiyon birleşimi. Cancellation satırı
  // için "return request" copy'si yok (source ile etiketlenir). Sıralama birleşik createdAt (requestedAt).
  app.get("/stores/:storeId/returns", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const query = adminReturnListQuerySchema.parse(request.query);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;
    const order: "asc" | "desc" = query.sortOrder ?? "desc";
    const now = Date.now();

    // Return-özel filtre aktifse cancellation satırları hariç tutulur (return status/çözüm/neden/SLA
    // cancellation'a uygulanamaz). Kaynak (source) filtresi kaynağı doğrudan seçer.
    const returnOnlyFilter = Boolean(
      query.status || query.resolutionType || query.reason || query.overdue === "true",
    );
    const includeReturns = query.source !== "ORDER_CANCELLATION";
    const includeCancellations = query.source !== "RETURN_REQUEST" && !returnOnlyFilter;

    const returnWhere = {
      storeId: params.storeId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.resolutionType ? { resolutionType: query.resolutionType } : {}),
      ...(query.reason ? { items: { some: { reason: query.reason } } } : {}),
      ...(query.orderNumber ? { order: { orderNumber: { contains: query.orderNumber } } } : {}),
    };
    const cancelWhere = {
      storeId: params.storeId,
      origin: "ORDER_CANCELLATION" as const,
      ...(query.orderNumber ? { order: { orderNumber: { contains: query.orderNumber } } } : {}),
    };

    const returnSelect = {
      id: true,
      returnNumber: true,
      status: true,
      resolutionType: true,
      refundDestination: true,
      requestedAt: true,
      returnWindowEndsAt: true,
      order: { select: { orderNumber: true } },
      customer: { select: { firstName: true, lastName: true, email: true } },
      items: { select: { quantity: true } },
    };
    const cancelSelect = {
      id: true,
      status: true,
      currency: true,
      totalRefundMinor: true,
      requestedAt: true,
      completedAt: true,
      refundDestination: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          cancelReasonCode: true,
          customer: { select: { firstName: true, lastName: true, email: true } },
        },
      },
      paymentAttempt: {
        select: { method: true, cardBrand: true, cardLast4: true, manualMethod: true },
      },
    };

    // Tek kaynak → DB skip/take doğrudan (verimli, doğru pagination). Birleşik → her kaynaktan
    // (skip+take) çekilip merge + slice (doğru sayfa dilimi garantisi).
    const merging = includeReturns && includeCancellations;
    const fetchTake = merging ? skip + pageSize : pageSize;
    const fetchSkip = merging ? 0 : skip;

    const [returnRowsRaw, returnTotal] = includeReturns
      ? await Promise.all([
          prisma.returnRequest.findMany({
            where: returnWhere,
            orderBy: { requestedAt: order },
            skip: fetchSkip,
            take: fetchTake,
            select: returnSelect,
          }),
          prisma.returnRequest.count({ where: returnWhere }),
        ])
      : [[], 0];
    const [cancelRowsRaw, cancelTotal] = includeCancellations
      ? await Promise.all([
          prisma.orderRefund.findMany({
            where: cancelWhere,
            orderBy: { requestedAt: order },
            skip: fetchSkip,
            take: fetchTake,
            select: cancelSelect,
          }),
          prisma.orderRefund.count({ where: cancelWhere }),
        ])
      : [[], 0];

    let returnRows = (returnRowsRaw as AdminReturnRowSource[]).map((r) => mapAdminReturnRow(r, now));
    if (query.overdue === "true") returnRows = returnRows.filter(isAdminRowOverdue);
    const cancelRows = (cancelRowsRaw as AdminCancellationRowSource[]).map(mapAdminCancellationRow);

    const total = returnTotal + cancelTotal;
    const data = merging
      ? mergeVisibilityRows([...returnRows, ...cancelRows], { skip, take: pageSize, order })
      : [...returnRows, ...cancelRows];

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return adminRefundVisibilityListResponseSchema.parse({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalItems: total,
        totalPages,
        limit: pageSize,
        offset: skip,
      },
    });
  });

  // Detay
  app.get("/stores/:storeId/returns/:returnId", async (request, reply) => {
    const params = returnParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const detail = await loadAdminDetail(params.storeId, params.returnId, deps.mediaBaseUrl);
    if (!detail) return reply.code(404).send(errorBody("RETURN_NOT_FOUND", "İade bulunamadı."));
    return adminReturnDetailResponseSchema.parse({ return: detail });
  });

  // TODO-169 (blocker #6) — Sipariş detayına iade entegrasyonu: bir siparişin ORTAK iade özeti
  // (projection) + o siparişe ait iade talepleri (liste kartları). React ayrı hesap yapmaz.
  app.get("/stores/:storeId/orders/:orderId/return-summary", async (request, reply) => {
    const params = z.object({ storeId: z.string().min(1), orderId: z.string().min(1) }).parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const order = await prisma.order.findFirst({
      where: { id: params.orderId, storeId: params.storeId },
      select: { id: true, currency: true },
    });
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Sipariş bulunamadı."));

    const policy = await resolveStoreReturnPolicy(prisma, params.storeId);
    const summaries = await computeReturnOrderSummaries(prisma, params.storeId, [order], policy, new Date());
    const summary = summaries.get(order.id)!;

    const rows = await prisma.returnRequest.findMany({
      where: { storeId: params.storeId, orderId: order.id },
      orderBy: { requestedAt: "desc" },
      select: {
        id: true,
        returnNumber: true,
        status: true,
        resolutionType: true,
        requestedAt: true,
        returnWindowEndsAt: true,
        order: { select: { orderNumber: true } },
        customer: { select: { firstName: true, lastName: true, email: true } },
        items: { select: { quantity: true } },
      },
    });
    const now = Date.now();
    return adminOrderReturnsResponseSchema.parse({
      summary,
      returns: rows.map((r) => serializeAdminReturnListItem(r, now)),
    });
  });

  // İncelemeye al / teslim alındı / refund|replacement pending / kapat (basit geçişler)
  app.post("/stores/:storeId/returns/:returnId/transition", async (request, reply) => {
    const params = returnParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = adminReturnTransitionRequestSchema.parse(request.body);

    const timestampField = TRANSITION_TIMESTAMP[input.targetStatus];
    const result = await applyReturnTransition(
      params.storeId,
      params.returnId,
      input.targetStatus,
      { type: "ADMIN", id: access.actorUserId },
      {
        note: input.adminNote,
        expectedVersion: input.expectedVersion,
        ...(timestampField ? { timestampField } : {}),
        // R4 — adminNote + refundShipping TEK extraData'da birleştirilir (eski çift-spread
        // ikinci anahtarla ilkini eziyordu → ikisi birlikte verilince adminNote düşüyordu).
        ...(input.adminNote !== undefined || input.refundShipping !== undefined
          ? {
              extraData: {
                ...(input.adminNote !== undefined ? { adminNote: input.adminNote } : {}),
                ...(input.refundShipping !== undefined ? { refundShipping: input.refundShipping } : {}),
              },
            }
          : {}),
        onCommit: async (tx) => {
          // REFUND_PENDING'e geçişte refund intent tazele (adet/kargo kararı güncel olsun).
          if (input.targetStatus === "REFUND_PENDING") {
            await upsertRefundIntentForReturn(tx, params.storeId, params.returnId);
          }
        },
      },
    );
    return finishTransition(reply, result, deps, params.storeId, params.returnId, access.actorUserId, "transition");
  });

  // Reddet (zorunlu neden)
  app.post("/stores/:storeId/returns/:returnId/reject", async (request, reply) => {
    const params = returnParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = adminReturnRejectRequestSchema.parse(request.body);
    const result = await applyReturnTransition(
      params.storeId,
      params.returnId,
      "REJECTED",
      { type: "ADMIN", id: access.actorUserId },
      {
        note: input.rejectionReason,
        expectedVersion: input.expectedVersion,
        timestampField: "rejectedAt",
        extraData: { rejectionReason: input.rejectionReason, ...(input.adminNote ? { adminNote: input.adminNote } : {}) },
        onCommit: async (tx, current) => {
          // TD-FR-7 (K2) — ilk gerçek admin kararı (reject): idempotent RETURN_REVIEW_STARTED izi.
          await writeReviewStartedEvent(tx, {
            storeId: params.storeId,
            returnRequestId: params.returnId,
            sourceStatus: current.status,
            decisionType: "REJECT",
            platformUserId: access.actorUserId,
          });
        },
      },
    );
    return finishTransition(reply, result, deps, params.storeId, params.returnId, access.actorUserId, "reject");
  });

  // Onayla (tam veya kısmi). items verilmezse tüm kalemler istenen adetle onaylanır.
  app.post("/stores/:storeId/returns/:returnId/approve", async (request, reply) => {
    const params = returnParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = adminReturnApproveRequestSchema.parse(request.body);

    const rr = await prisma.returnRequest.findFirst({
      where: { id: params.returnId, storeId: params.storeId },
      select: { id: true, status: true, items: { select: { id: true, quantity: true } } },
    });
    if (!rr) return reply.code(404).send(errorBody("RETURN_NOT_FOUND", "İade bulunamadı."));

    const approvalByItem = new Map((input.items ?? []).map((i) => [i.returnItemId, i.approvedQuantity]));
    // Doğrulama: verilen approvedQuantity kalem quantity'sini aşamaz.
    let anyPartial = false;
    for (const item of rr.items) {
      const approved = approvalByItem.has(item.id) ? approvalByItem.get(item.id)! : item.quantity;
      if (approved > item.quantity) {
        return reply.code(400).send(errorBody("INVALID_APPROVED_QUANTITY", "Onaylanan adet satın alınan adedi aşamaz."));
      }
      if (approved < item.quantity) anyPartial = true;
    }
    const target = anyPartial ? "PARTIALLY_APPROVED" : "APPROVED";

    const result = await applyReturnTransition(
      params.storeId,
      params.returnId,
      target,
      { type: "ADMIN", id: access.actorUserId },
      {
        note: input.adminNote,
        expectedVersion: input.expectedVersion,
        timestampField: "approvedAt",
        ...(input.adminNote ? { extraData: { adminNote: input.adminNote } } : {}),
        onCommit: async (tx, current) => {
          // TD-FR-7 (K2) — ilk gerçek admin kararı (approve): idempotent RETURN_REVIEW_STARTED izi.
          // Bu blok, aşağıdaki asıl onCommit yan-etkilerinden (item update, refund intent, otomatik
          // AWAITING_SHIPMENT geçişi) ÖNCE çalışır.
          await writeReviewStartedEvent(tx, {
            storeId: params.storeId,
            returnRequestId: params.returnId,
            sourceStatus: current.status,
            decisionType: "APPROVE",
            platformUserId: access.actorUserId,
          });
          for (const item of rr.items) {
            const approved = approvalByItem.has(item.id) ? approvalByItem.get(item.id)! : item.quantity;
            await tx.returnItem.update({
              where: { id: item.id },
              data: { approvedQuantity: approved, rejectedQuantity: item.quantity - approved },
            });
          }
          // Onaylanan REFUND talebi için refund intent (PENDING) oluştur.
          await upsertRefundIntentForReturn(tx, params.storeId, params.returnId);
          // BUG-RETURN-DEEPLINK / TODO-169 recovery — onaydan sonra müşteriyi çıkmazda bırakma:
          // ilk-faz çözümlerinin (REFUND/REPLACEMENT) ikisi de ürünün geri gönderilmesini gerektirir,
          // bu yüzden onay AYNI tx'te otomatik AWAITING_SHIPMENT'e ilerler (ADMIN aktör; state-machine
          // guard'ı korunur; history append-only iki kayıt: APPROVED → AWAITING_SHIPMENT). Müşterinin
          // "Ürünü kargoya verdim" akışı böylece ekstra bir admin adımı beklemeden erişilebilir olur.
          if (evaluateReturnTransition(target, "AWAITING_SHIPMENT", "ADMIN").ok) {
            await tx.returnRequest.update({
              where: { id: params.returnId },
              data: { status: "AWAITING_SHIPMENT", version: { increment: 1 } },
            });
            await tx.returnStatusHistory.create({
              data: {
                storeId: params.storeId,
                returnRequestId: params.returnId,
                fromStatus: target,
                toStatus: "AWAITING_SHIPMENT",
                actorType: "ADMIN",
                actorId: access.actorUserId,
                note: null,
              },
            });
          }
        },
      },
    );
    return finishTransition(reply, result, deps, params.storeId, params.returnId, access.actorUserId, "approve");
  });

  // İnceleme sonucu + stok kararı → INSPECTED. RESTOCK_AS_SELLABLE kalemler için idempotent restock.
  app.post("/stores/:storeId/returns/:returnId/inspect", async (request, reply) => {
    const params = returnParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = adminReturnInspectRequestSchema.parse(request.body);

    const rr = await prisma.returnRequest.findFirst({
      where: { id: params.returnId, storeId: params.storeId },
      select: { id: true, items: { select: { id: true } } },
    });
    if (!rr) return reply.code(404).send(errorBody("RETURN_NOT_FOUND", "İade bulunamadı."));
    const itemIds = new Set(rr.items.map((i) => i.id));
    for (const decision of input.items) {
      if (!itemIds.has(decision.returnItemId)) {
        return reply.code(400).send(errorBody("RETURN_ITEM_NOT_FOUND", "İade kalemi bu talebe ait değil."));
      }
    }

    const result = await applyReturnTransition(
      params.storeId,
      params.returnId,
      "INSPECTED",
      { type: "ADMIN", id: access.actorUserId },
      {
        note: input.adminNote,
        expectedVersion: input.expectedVersion,
        timestampField: "inspectedAt",
        ...(input.adminNote ? { extraData: { adminNote: input.adminNote } } : {}),
        onCommit: async (tx) => {
          await applyInspectionDecisions(tx, params.storeId, access.actorUserId, input.items);
        },
      },
    );
    return finishTransition(reply, result, deps, params.storeId, params.returnId, access.actorUserId, "inspect");
  });

  // TD-FR-7 Faz 1 / Task 4 — "İadeyi yap": TEK admin aksiyonunda inceleme kararı + (kabul varsa)
  // refund başlatma orchestration. Mevcut parçaları REUSE eder: applyInspectionDecisions (kalem
  // condition/sonuç/stok kararı — approvedQuantity'ye DOKUNMAZ, o approve aşamasında zaten
  // sabitlenmiştir), advanceInspectedToRefundPending (kabul varsa AYNI tx'te INSPECTED→REFUND_PENDING
  // + upsertRefundIntentForReturn), initiateRefund (tx COMMIT SONRASI çağrılır — provider I/O asla
  // DB transaction içinde değildir; mevcut iki-aşamalı initiateRefund/executeAutomatic yapısı korunur).
  // Kabul yoksa (Σ approvedQuantity=0) orchestration no-op kalır (refund başlatılmaz, REFUND_PENDING'e
  // geçilmez) — tam-red akışı mevcut /reject route'undadır.
  app.post("/stores/:storeId/returns/:returnId/inspect-decision", async (request, reply) => {
    const params = returnParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = adminReturnInspectRequestSchema.parse(request.body);

    const rr = await prisma.returnRequest.findFirst({
      where: { id: params.returnId, storeId: params.storeId },
      select: { id: true, items: { select: { id: true } } },
    });
    if (!rr) return reply.code(404).send(errorBody("RETURN_NOT_FOUND", "İade bulunamadı."));
    const itemIds = new Set(rr.items.map((i) => i.id));
    for (const decision of input.items) {
      if (!itemIds.has(decision.returnItemId)) {
        return reply.code(400).send(errorBody("RETURN_ITEM_NOT_FOUND", "İade kalemi bu talebe ait değil."));
      }
    }

    // Box'lanmış mutable state: onCommit closure'ı içinde set edilir, tx sonrası okunur. Düz bir
    // `let` reassign edilse TS closure-narrowing sınırlaması yüzünden dış okumada `never`'a daralır
    // (doğrulanmış TS davranışı) — obje alanı mutasyonu bunu bypass eder.
    const refundOrchestration: { value: { refundIntentId: string; expectedReturnVersion: number } | null } = {
      value: null,
    };

    const result = await applyReturnTransition(
      params.storeId,
      params.returnId,
      "INSPECTED",
      { type: "ADMIN", id: access.actorUserId },
      {
        note: input.adminNote,
        expectedVersion: input.expectedVersion,
        timestampField: "inspectedAt",
        ...(input.adminNote ? { extraData: { adminNote: input.adminNote } } : {}),
        onCommit: async (tx) => {
          await applyInspectionDecisions(tx, params.storeId, access.actorUserId, input.items);
          const advance = await advanceInspectedToRefundPending(tx, params.storeId, params.returnId, {
            type: "ADMIN",
            id: access.actorUserId,
          });
          if (advance.advanced && advance.refundIntentId && advance.expectedReturnVersion !== undefined) {
            refundOrchestration.value = {
              refundIntentId: advance.refundIntentId,
              expectedReturnVersion: advance.expectedReturnVersion,
            };
          }
        },
      },
    );

    if (result.ok && refundOrchestration.value) {
      // Provider I/O tx DIŞINDA (MOCK PROVIDER_AUTOMATIC ise otomatik yürütülür; FAILED olsa dahi
      // inceleme kararı + REFUND_PENDING geçişi az önce commit edildi — decision SİLİNMEZ).
      const refundResult = await initiateRefund(
        {
          storeId: params.storeId,
          refundIntentId: refundOrchestration.value.refundIntentId,
          expectedReturnVersion: refundOrchestration.value.expectedReturnVersion,
          actorUserId: access.actorUserId,
        },
        { providerPort: refundProviderPort },
      );
      // Fix round 1 (Important) — initiateRefund BAŞARISIZ olursa (ör. EXCEEDS_REFUNDABLE,
      // CURRENCY_MISMATCH, VERSION_CONFLICT, REFUND_ALREADY_ACTIVE — yarışan bir başka iade cap'i
      // tüketmiş olabilir) inceleme kararı + REFUND_PENDING geçişi ZATEN commit edilmiştir (ayrı tx)
      // — GERİ ALINMAZ (manuel/retry mümkün kalsın). Ama admin'e SESSİZ-BAŞARI (200) DÖNÜLMEZ: aynı
      // hata kodu/HTTP eşlemesi manuel `/refund` endpoint'inden REUSE edilerek açık 4xx döner.
      if (!refundResult.ok) {
        const mapped = REFUND_HTTP_BY_CODE[refundResult.code];
        await deps.recordAudit({
          action: "UPDATE",
          platformUserId: access.actorUserId,
          storeId: params.storeId,
          entityType: "ReturnRequest",
          entityId: params.returnId,
          metadata: {
            action: "return.inspect-decision.refund_initiate_failed",
            refundErrorCode: refundResult.code,
          },
        });
        return reply.code(mapped.status).send(
          errorBody(
            "REFUND_INITIATE_FAILED",
            `İade başlatılamadı: ${mapped.message} İnceleme kararı kaydedildi; İade panelinden tekrar deneyebilirsiniz.`,
            { refundErrorCode: refundResult.code },
          ),
        );
      }
    }

    return finishTransition(
      reply,
      result,
      deps,
      params.storeId,
      params.returnId,
      access.actorUserId,
      "inspect-decision",
    );
  });

  // TODO-172 (ADR-273) — Fast Refund onay modalı için bounded risk/uygunluk özeti (salt-okunur).
  // requireStoreAdmin ile korunur (herhangi platform admin okuyabilir); `permitted` viewer'ın
  // SUPER_ADMIN olup olmadığından türetilir. Böylece CTA görünürlüğü sunucu-otoriter belirlenir.
  app.get("/stores/:storeId/returns/:returnId/fast-refund-context", async (request, reply) => {
    const params = returnParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const settings = await loadFastRefundSettings(prisma, params.storeId);
    const context = await buildFastRefundContext(params.storeId, params.returnId, {
      permitted: access.role === "SUPER_ADMIN",
      settings,
    });
    if (!context) return reply.code(404).send(errorBody("RETURN_NOT_FOUND", "İade bulunamadı."));
    return adminReturnFastRefundContextResponseSchema.parse({ context });
  });

  // TODO-172 (ADR-273) — Fast Refund: teslim alma + inceleme atlanarak doğrudan para iadesi.
  // AYRI güçlü yetki (requireStoreSuperAdmin — backend-enforced). Akış: permission → eligibility
  // (kaynak/limit/currency/intent, tx içinde version-guard'lı REFUND_PENDING + skippedSteps history)
  // → audit (return.fast_refund.started) → initiateRefund (tx DIŞINDA; provider I/O asla tx içinde).
  // Idempotent: çift tıklama INVALID_STATE/VERSION_CONFLICT + initiateRefund advisory-lock ile deduped.
  app.post("/stores/:storeId/returns/:returnId/fast-refund", async (request, reply) => {
    const params = returnParam.parse(request.params);
    const access = await deps.requireStoreSuperAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = adminReturnFastRefundRequestSchema.parse(request.body);

    const settings = await loadFastRefundSettings(prisma, params.storeId);
    const started = await startFastRefundToRefundPending(params.storeId, params.returnId, {
      actorUserId: access.actorUserId,
      expectedVersion: input.expectedVersion,
      reason: input.reason,
      settings,
    });
    if (!started.ok) {
      const mapped = FAST_REFUND_HTTP_BY_CODE[started.code] ?? {
        status: 409,
        message: "Hızlı iade reddedildi.",
      };
      return reply.code(mapped.status).send(errorBody(started.code, mapped.message));
    }

    // REFUND_PENDING geçişi + skippedSteps history az önce COMMIT edildi. Audit (provider sonucundan
    // BAĞIMSIZ): hızlı iade başlatıldı — kim, hangi kaynak, hangi adımlar atlandı, tutar/limit, gerekçe.
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ReturnRequest",
      entityId: params.returnId,
      metadata: {
        action: "return.fast_refund.started",
        sourceStatus: started.sourceStatus,
        skippedSteps: started.skippedSteps,
        amountMinor: started.amountMinor,
        limitMinor: started.limitMinor,
        reason: input.reason,
      },
    });

    // Provider I/O tx DIŞINDA (inspect-decision ile AYNI otorite). Başarısızlıkta geçiş GERİ ALINMAZ
    // (retry/manuel mümkün kalır) ama admin'e SESSİZ-BAŞARI dönülmez: initiateRefund'ın HTTP eşlemesi
    // REUSE edilerek açık 4xx döner.
    const refundResult = await initiateRefund(
      {
        storeId: params.storeId,
        refundIntentId: started.refundIntentId,
        expectedReturnVersion: started.expectedReturnVersion,
        actorUserId: access.actorUserId,
      },
      { providerPort: refundProviderPort },
    );
    if (!refundResult.ok) {
      const mapped = REFUND_HTTP_BY_CODE[refundResult.code];
      await deps.recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "ReturnRequest",
        entityId: params.returnId,
        metadata: {
          action: "return.fast_refund.refund_initiate_failed",
          refundErrorCode: refundResult.code,
        },
      });
      return reply.code(mapped.status).send(
        errorBody(
          "REFUND_INITIATE_FAILED",
          `İade başlatılamadı: ${mapped.message} İade panelinden tekrar deneyebilirsiniz.`,
          { refundErrorCode: refundResult.code },
        ),
      );
    }

    const detail = await loadAdminDetail(params.storeId, params.returnId, deps.mediaBaseUrl);
    if (!detail) return reply.code(404).send(errorBody("RETURN_NOT_FOUND", "İade bulunamadı."));
    return adminReturnDetailResponseSchema.parse({ return: detail });
  });

  // ── TODO-173 (ADR-274) — Reddedilen adet disposition + reverse shipment (STORE_RETURN_TO_CUSTOMER).
  // Tümü requireStoreAdmin (K3; refund/payment yetkisinden AYRI). expectedVersion + cap/duplicate
  // backend-enforce. Reverse shipment OrderRefund/RefundIntent/envanter/paymentStatus ÜRETMEZ.
  async function refreshDetail(reply: FastifyReply, storeId: string, returnId: string) {
    const detail = await loadAdminDetail(storeId, returnId, deps.mediaBaseUrl);
    if (!detail) return reply.code(404).send(errorBody("RETURN_NOT_FOUND", "İade bulunamadı."));
    return adminReturnDetailResponseSchema.parse({ return: detail });
  }

  // Disposition oluştur (reddedilen adet üzerinde).
  app.post("/stores/:storeId/returns/:returnId/dispositions", async (request, reply) => {
    const params = returnParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = adminReturnDispositionCreateRequestSchema.parse(request.body);
    const result = await setReturnItemDisposition(params.storeId, params.returnId, input, {
      type: "ADMIN",
      id: access.actorUserId,
    });
    if (!result.ok) return replyReverseError(reply, result.code);
    await deps.recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ReturnItemDisposition",
      entityId: result.dispositionId,
      metadata: {
        action: "return.disposition.set",
        returnId: params.returnId,
        returnItemId: input.returnItemId,
        type: input.type,
        quantity: input.quantity,
      },
    });
    return refreshDetail(reply, params.storeId, params.returnId);
  });

  // Disposition iptal (quantity serbest).
  app.post("/stores/:storeId/returns/:returnId/dispositions/:dispositionId/cancel", async (request, reply) => {
    const params = z
      .object({ storeId: z.string().min(1), returnId: z.string().min(1), dispositionId: z.string().min(1) })
      .parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = adminReturnDispositionCancelRequestSchema.parse({
      ...(request.body as Record<string, unknown>),
      dispositionId: params.dispositionId,
    });
    const result = await cancelReturnItemDisposition(params.storeId, params.returnId, body, {
      type: "ADMIN",
      id: access.actorUserId,
    });
    if (!result.ok) return replyReverseError(reply, result.code);
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ReturnItemDisposition",
      entityId: params.dispositionId,
      metadata: { action: "return.disposition.cancel", returnId: params.returnId },
    });
    return refreshDetail(reply, params.storeId, params.returnId);
  });

  // Reverse shipment oluştur (yalnız RETURN_TO_CUSTOMER disposition kapasitesi kadar).
  app.post("/stores/:storeId/returns/:returnId/reverse-shipments", async (request, reply) => {
    const params = returnParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = adminReverseShipmentCreateRequestSchema.parse(request.body);
    const result = await createReverseShipment(params.storeId, params.returnId, input, {
      type: "ADMIN",
      id: access.actorUserId,
    });
    if (!result.ok) return replyReverseError(reply, result.code);
    await deps.recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ReverseShipment",
      entityId: result.shipmentId,
      metadata: {
        action: "return.reverse_shipment.create",
        returnId: params.returnId,
        returnItemId: input.returnItemId,
        quantity: input.quantity,
      },
    });
    return refreshDetail(reply, params.storeId, params.returnId);
  });

  // Reverse shipment durum aksiyonu (kargoya verildi/teslim/iptal).
  app.post("/stores/:storeId/returns/:returnId/reverse-shipments/:shipmentId/status", async (request, reply) => {
    const params = z
      .object({ storeId: z.string().min(1), returnId: z.string().min(1), shipmentId: z.string().min(1) })
      .parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = adminReverseShipmentStatusRequestSchema.parse(request.body);
    const result = await updateReverseShipmentStatus(
      params.storeId,
      params.shipmentId,
      input.status,
      input.note,
      { type: "ADMIN", id: access.actorUserId },
    );
    if (!result.ok) return replyReverseError(reply, result.code);
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ReverseShipment",
      entityId: params.shipmentId,
      metadata: { action: "return.reverse_shipment.status", returnId: params.returnId, status: input.status },
    });
    return refreshDetail(reply, params.storeId, params.returnId);
  });

  // Reverse shipment carrier/tracking güncelle.
  app.post("/stores/:storeId/returns/:returnId/reverse-shipments/:shipmentId/tracking", async (request, reply) => {
    const params = z
      .object({ storeId: z.string().min(1), returnId: z.string().min(1), shipmentId: z.string().min(1) })
      .parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = adminReverseShipmentTrackingRequestSchema.parse(request.body);
    const result = await updateReverseShipmentTracking(params.storeId, params.shipmentId, input, {
      type: "ADMIN",
      id: access.actorUserId,
    });
    if (!result.ok) return replyReverseError(reply, result.code);
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ReverseShipment",
      entityId: params.shipmentId,
      metadata: { action: "return.reverse_shipment.tracking", returnId: params.returnId },
    });
    return refreshDetail(reply, params.storeId, params.returnId);
  });
}

// TODO-173 (ADR-274) — reverse/disposition domain kodları → HTTP eşlemesi (fail-closed).
const REVERSE_HTTP_BY_CODE: Record<string, { status: number; message: string }> = {
  RETURN_NOT_FOUND: { status: 404, message: "İade bulunamadı." },
  RETURN_ITEM_NOT_FOUND: { status: 404, message: "İade kalemi bu talebe ait değil." },
  DISPOSITION_NOT_FOUND: { status: 404, message: "Disposition kaydı bulunamadı." },
  SHIPMENT_NOT_FOUND: { status: 404, message: "Ters gönderi bulunamadı." },
  VERSION_CONFLICT: { status: 409, message: "Kayıt güncellendi; sayfayı yenileyip tekrar deneyin." },
  NO_REJECTED_QUANTITY: { status: 409, message: "Bu kalemde reddedilmiş adet yok." },
  DISPOSITION_QUANTITY_EXCEEDED: { status: 409, message: "Disposition adedi reddedilen adedi aşamaz." },
  DISPOSITION_NOT_CANCELLABLE: { status: 409, message: "Yalnız beklemedeki disposition iptal edilebilir." },
  DISPOSITION_CONSUMED: { status: 409, message: "Bu disposition için ters gönderi oluşturulmuş; iptal edilemez." },
  REVERSE_NO_DISPOSITION: { status: 409, message: "Önce 'Müşteriye geri gönder' disposition'ı seçin." },
  REVERSE_QUANTITY_EXCEEDED: { status: 409, message: "Ters gönderi adedi kalan gönderilebilir adedi aşamaz." },
  MISSING_SHIPPING_ADDRESS: { status: 409, message: "Müşteri teslimat adresi bulunamadı." },
  SHIPMENT_TERMINAL: { status: 409, message: "Gönderi terminal durumda; güncellenemez." },
  STATUS_REGRESSION: { status: 409, message: "Gönderi durumu geriye alınamaz." },
  INVALID_TARGET: { status: 409, message: "Geçersiz durum hedefi." },
  NO_CHANGE: { status: 409, message: "Durum zaten bu değerde." },
};

function replyReverseError(reply: FastifyReply, code: string) {
  const m = REVERSE_HTTP_BY_CODE[code] ?? { status: 409, message: "İşlem reddedildi." };
  return reply.code(m.status).send(errorBody(code, m.message));
}

const TRANSITION_TIMESTAMP: Partial<Record<string, "reviewedAt" | "receivedAt" | "shippedAt" | "completedAt">> = {
  UNDER_REVIEW: "reviewedAt",
  RECEIVED: "receivedAt",
  RETURN_SHIPPED: "shippedAt",
  COMPLETED: "completedAt",
};

async function finishTransition(
  reply: FastifyReply,
  result: Awaited<ReturnType<typeof applyReturnTransition>>,
  deps: ReturnAdminRoutesDeps,
  storeId: string,
  returnId: string,
  actorUserId: string,
  action: string,
) {
  if (!result.ok) {
    const map: Record<string, { code: number; msg: string }> = {
      RETURN_NOT_FOUND: { code: 404, msg: "İade bulunamadı." },
      ILLEGAL_TRANSITION: { code: 409, msg: "Bu durumdan bu geçiş yapılamaz." },
      TERMINAL: { code: 409, msg: "İade terminal durumda; değiştirilemez." },
      ACTOR_NOT_ALLOWED: { code: 403, msg: "Bu geçiş için yetkiniz yok." },
      NO_CHANGE: { code: 409, msg: "İade zaten bu durumda." },
      VERSION_CONFLICT: { code: 409, msg: "İade bu sırada değişti; yenileyin." },
      COMPLETION_NOT_ALLOWED: {
        code: 409,
        msg: "İade tamamlanamaz: gerçek iade/değişim sonucu henüz oluşmadı.",
      },
      // TD-FR-7 (returns-flow-simplification) — "no silent close": admin artık REFUND_PENDING/
      // COMPLETED durumundan doğrudan CLOSED'a geçemez; para iadesi yapılmadan talebin sessizce
      // kapanmasını engeller. Refund settle yolu COMPLETED'tir. REPLACEMENT_PENDING → CLOSED ise
      // bir refund-settle değildir (bu fazda replacement sonucu doğrulanmıyor) ve admin arşivlemesi
      // için serbest bırakılır — aksi halde replacement talepleri kalıcı çıkmaza girer.
      REFUND_UNSETTLED: {
        code: 409,
        msg: "Bu iade, para iadesi tamamlanmadan kapatılamaz. 'İadeyi yap' ile iadeyi tamamlayın.",
      },
    };
    const m = map[result.code] ?? { code: 409, msg: "Geçiş reddedildi." };
    return reply.code(m.code).send(errorBody(result.code, m.msg));
  }
  await deps.recordAudit({
    action: "UPDATE",
    platformUserId: actorUserId,
    storeId,
    entityType: "ReturnRequest",
    entityId: returnId,
    metadata: { action: `return.${action}`, toStatus: result.status },
  });
  const detail = await loadAdminDetail(storeId, returnId, deps.mediaBaseUrl);
  return adminReturnDetailResponseSchema.parse({ return: detail });
}

async function loadAdminDetail(storeId: string, returnId: string, mediaBaseUrl: string | undefined) {
  const rr = await prisma.returnRequest.findFirst({
    where: { id: returnId, storeId },
    include: {
      order: {
        select: {
          orderNumber: true,
          paymentStatus: true,
          currency: true,
          addresses: true,
        },
      },
      customer: { select: { firstName: true, lastName: true, email: true } },
      // TODO-170 (ADR-272) — ledger-otoriteli refund özeti için bu talebin refund satırları.
      orderRefunds: {
        orderBy: { createdAt: "asc" },
        select: {
          status: true,
          totalRefundMinor: true,
          completedAt: true,
          providerReference: true,
          manualReference: true,
        },
      },
      items: {
        include: {
          orderLine: {
            select: {
              id: true,
              productId: true,
              variantId: true,
              // BUG-CART-005 — varyant-farkında iade kalemi thumbnail'i (snapshot + renk ekseni).
              mediaStorageKey: true,
              title: true,
              variantTitle: true,
              sku: true,
              quantity: true,
              unitPriceAmount: true,
              product: { select: { mediaDefiningAttributeId: true } },
            },
          },
          attachments: { select: { id: true, type: true } },
          // TODO-173 (ADR-274) — reddedilen adet disposition'ları + bu kalemin reverse shipment'ları.
          dispositions: { orderBy: { createdAt: "asc" } },
          shipments: {
            where: { direction: "STORE_RETURN_TO_CUSTOMER" },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      history: { orderBy: { createdAt: "asc" } },
      refundIntent: true,
    },
  });
  if (!rr) return null;
  // Bu satırların (bu talep HARİÇ) daha önce tutulan iade adedi — "kalan iade edilebilir" için.
  const priorHeld = await getHeldReturnedQtyByLine(prisma, storeId, rr.orderId, returnId);
  // TODO-169 (blocker #3) — kalem kapak görselleri (store-scoped; storefront ile aynı semantik).
  const covers = await resolveReturnItemCovers(
    storeId,
    rr.items.map((i) => ({
      lineId: i.orderLine.id,
      productId: i.orderLine.productId,
      variantId: i.orderLine.variantId,
      mediaStorageKey: i.orderLine.mediaStorageKey,
      mediaDefiningAttributeId: i.orderLine.product?.mediaDefiningAttributeId ?? null,
    })),
    mediaBaseUrl,
  );
  const refundSummary = await buildReturnRefundSummary(storeId, rr.orderId, rr);
  return serializeAdminReturnDetail(rr, priorHeld, covers, refundSummary);
}

/**
 * TODO-170 (ADR-272) — İade talebi refund ÖZETİ (ledger-otoriteli). intent yoksa null. status ortak
 * çözümleyiciden (ledger > intent > return). realized = Σ SUCCEEDED (bu talep); remaining = sipariş düzeyi.
 */
async function buildReturnRefundSummary(
  storeId: string,
  orderId: string,
  rr: {
    order: { currency: string };
    refundIntent: {
      currency: string;
      productRefundMinor: number;
      shippingRefundMinor: number;
      taxRefundMinor: number;
      totalRefundMinor: number;
      status: RefundIntentStatus;
    } | null;
    orderRefunds: Array<{
      status: OrderRefundStatus;
      totalRefundMinor: number;
      completedAt: Date | null;
      providerReference: string | null;
      manualReference: string | null;
    }>;
  },
): Promise<AdminReturnRefundSummary | null> {
  const intent = rr.refundIntent;
  if (!intent) return null;
  const currency = intent.currency;
  const attempts = await prisma.paymentAttempt.findMany({
    where: { storeId, orderId, currency },
    select: { status: true, amount: true },
  });
  const orderLedger = await prisma.orderRefund.findMany({
    where: { storeId, orderId },
    select: { status: true, totalRefundMinor: true, currency: true },
  });
  const capturedMinor = sumCapturedMinor(attempts);
  const orderSucceeded = sumSucceededRefundMinor(orderLedger, currency);
  const refundableRemainingMinor = computeRefundableRemainingMinor(capturedMinor, orderLedger, currency);
  const status = resolveRefundSummaryStatus({
    refunds: rr.orderRefunds.map((r) => ({ status: r.status })),
    intentStatus: intent.status,
    orderCapturedMinor: capturedMinor,
    orderSucceededRefundMinor: orderSucceeded,
  });
  const succeeded = rr.orderRefunds.filter((r) => r.status === "SUCCEEDED");
  const realizedRefundMinor = succeeded.reduce((s, r) => s + r.totalRefundMinor, 0);
  const latest = succeeded.reduce<(typeof succeeded)[number] | null>(
    (a, b) => ((a?.completedAt?.getTime() ?? 0) >= (b.completedAt?.getTime() ?? 0) ? a : b),
    null,
  );
  return {
    status,
    currency,
    productRefundMinor: intent.productRefundMinor,
    shippingRefundMinor: intent.shippingRefundMinor,
    taxRefundMinor: intent.taxRefundMinor,
    intentTotalMinor: intent.totalRefundMinor,
    realizedRefundMinor,
    refundableRemainingMinor,
    completedAt: latest?.completedAt?.toISOString() ?? null,
    reference: latest ? latest.providerReference ?? latest.manualReference ?? null : null,
  };
}
