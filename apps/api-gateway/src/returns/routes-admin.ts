/**
 * TODO-169 (ADR-269) — Store Admin iade operasyon uçları. Tümü requireStoreAdmin (platform admin +
 * store scope) ile korunur; store-scoped 404 (cross-store görünmez). Her durum geçişi state-machine +
 * yetki + optimistic version'dan geçer (service). adminNote müşteriye SIZDIRILMAZ (bu yüzey admin).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@commerce-os/db";
import type { AuditAction } from "@prisma/client";
import { z } from "zod";
import {
  adminReturnDetailResponseSchema,
  adminReturnListQuerySchema,
  adminReturnListResponseSchema,
  adminReturnApproveRequestSchema,
  adminReturnInspectRequestSchema,
  adminReturnRejectRequestSchema,
  adminReturnTransitionRequestSchema,
} from "@commerce-os/contracts";
import {
  applyReturnTransition,
  applyRestockForItem,
  getHeldReturnedQtyByLine,
  upsertRefundIntentForReturn,
} from "./service.js";
import { serializeAdminReturnDetail, serializeAdminReturnListItem } from "./serialize.js";

export interface ReturnAdminRoutesDeps {
  requireStoreAdmin: (
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
}

function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

const storeParam = z.object({ storeId: z.string().min(1) });
const returnParam = z.object({ storeId: z.string().min(1), returnId: z.string().min(1) });

export function registerReturnAdminRoutes(app: FastifyInstance, deps: ReturnAdminRoutesDeps): void {
  // Liste
  app.get("/stores/:storeId/returns", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const query = adminReturnListQuerySchema.parse(request.query);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    const where = {
      storeId: params.storeId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.resolutionType ? { resolutionType: query.resolutionType } : {}),
      ...(query.reason ? { items: { some: { reason: query.reason } } } : {}),
      ...(query.orderNumber ? { order: { orderNumber: { contains: query.orderNumber } } } : {}),
    };

    const sortBy = query.sortBy ?? "requestedAt";
    const dir = query.sortOrder ?? (sortBy === "requestedAt" ? "desc" : "asc");
    const orderBy =
      sortBy === "status"
        ? { status: dir }
        : sortBy === "returnWindowEndsAt"
          ? { returnWindowEndsAt: dir }
          : { requestedAt: dir };

    const [rows, total] = await Promise.all([
      prisma.returnRequest.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
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
      }),
      prisma.returnRequest.count({ where }),
    ]);

    const now = Date.now();
    let data = rows.map((r) => serializeAdminReturnListItem(r, now));
    if (query.overdue === "true") data = data.filter((r) => r.ageDays >= 3 && !isSettled(r.status));

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return adminReturnListResponseSchema.parse({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalItems: total,
        totalPages,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      },
    });
  });

  // Detay
  app.get("/stores/:storeId/returns/:returnId", async (request, reply) => {
    const params = returnParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const detail = await loadAdminDetail(params.storeId, params.returnId);
    if (!detail) return reply.code(404).send(errorBody("RETURN_NOT_FOUND", "İade bulunamadı."));
    return adminReturnDetailResponseSchema.parse({ return: detail });
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
        ...(input.adminNote ? { extraData: { adminNote: input.adminNote } } : {}),
        ...(timestampField ? { timestampField } : {}),
        ...(input.refundShipping !== undefined
          ? { extraData: { refundShipping: input.refundShipping } }
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
        timestampField: "rejectedAt",
        extraData: { rejectionReason: input.rejectionReason, ...(input.adminNote ? { adminNote: input.adminNote } : {}) },
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
        timestampField: "approvedAt",
        ...(input.adminNote ? { extraData: { adminNote: input.adminNote } } : {}),
        onCommit: async (tx) => {
          for (const item of rr.items) {
            const approved = approvalByItem.has(item.id) ? approvalByItem.get(item.id)! : item.quantity;
            await tx.returnItem.update({
              where: { id: item.id },
              data: { approvedQuantity: approved, rejectedQuantity: item.quantity - approved },
            });
          }
          // Onaylanan REFUND talebi için refund intent (PENDING) oluştur.
          await upsertRefundIntentForReturn(tx, params.storeId, params.returnId);
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
        timestampField: "inspectedAt",
        ...(input.adminNote ? { extraData: { adminNote: input.adminNote } } : {}),
        onCommit: async (tx) => {
          for (const decision of input.items) {
            await tx.returnItem.update({
              where: { id: decision.returnItemId },
              data: {
                conditionStatus: decision.conditionStatus,
                inspectionResult: decision.inspectionResult,
                restockDecision: decision.restockDecision,
              },
            });
          }
          // Yalnız RESTOCK_AS_SELLABLE kararı sonrası idempotent stok artışı.
          for (const decision of input.items) {
            if (decision.restockDecision === "RESTOCK_AS_SELLABLE") {
              await applyRestockForItem(tx, params.storeId, decision.returnItemId, access.actorUserId);
            }
          }
        },
      },
    );
    return finishTransition(reply, result, deps, params.storeId, params.returnId, access.actorUserId, "inspect");
  });
}

const TRANSITION_TIMESTAMP: Partial<Record<string, "reviewedAt" | "receivedAt" | "shippedAt" | "completedAt">> = {
  UNDER_REVIEW: "reviewedAt",
  RECEIVED: "receivedAt",
  RETURN_SHIPPED: "shippedAt",
  COMPLETED: "completedAt",
};

function isSettled(status: string): boolean {
  return ["COMPLETED", "REJECTED", "CANCELLED_BY_CUSTOMER", "EXPIRED", "CLOSED"].includes(status);
}

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
  const detail = await loadAdminDetail(storeId, returnId);
  return adminReturnDetailResponseSchema.parse({ return: detail });
}

async function loadAdminDetail(storeId: string, returnId: string) {
  const rr = await prisma.returnRequest.findFirst({
    where: { id: returnId, storeId },
    include: {
      order: {
        select: {
          orderNumber: true,
          paymentStatus: true,
          addresses: true,
        },
      },
      customer: { select: { firstName: true, lastName: true, email: true } },
      items: {
        include: {
          orderLine: {
            select: {
              id: true,
              productId: true,
              title: true,
              variantTitle: true,
              sku: true,
              quantity: true,
              unitPriceAmount: true,
            },
          },
          attachments: { select: { id: true, type: true } },
        },
      },
      history: { orderBy: { createdAt: "asc" } },
      refundIntent: true,
    },
  });
  if (!rr) return null;
  // Bu satırların (bu talep HARİÇ) daha önce tutulan iade adedi — "kalan iade edilebilir" için.
  const priorHeld = await getHeldReturnedQtyByLine(prisma, storeId, rr.orderId, returnId);
  return serializeAdminReturnDetail(rr, priorHeld);
}
