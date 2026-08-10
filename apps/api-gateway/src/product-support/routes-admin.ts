/**
 * TODO-177 (ADR-289) — Ürün Desteği store-admin rotaları. `/stores/:storeId/support/*`.
 * Guard: requireStoreAdmin (capability PRODUCT_SUPPORT). Transition/assign server-authoritative +
 * optimistic version (expectedVersion). Yalnız kendi store ticket'ları (storeId-scoped).
 */

import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  adminSupportTicketListResponseSchema,
  adminSupportTicketDetailResponseSchema,
  adminSupportActionRequestSchema,
  adminSupportMessageCreateRequestSchema,
} from "@commerce-os/contracts";
import type { SupportNotificationDispatcher } from "./notification.js";
import {
  listAdminTickets,
  getAdminTicketDetail,
  addAdminMessage,
  applyAdminAction,
} from "./service.js";

export interface SupportAdminRoutesDeps {
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  recordAudit: (input: {
    action: "CREATE" | "UPDATE" | "DELETE" | "SYSTEM";
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => void | Promise<void>;
  notifications: SupportNotificationDispatcher;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

const storeParam = z.object({ storeId: z.string().min(1) });
const ticketParam = z.object({ storeId: z.string().min(1), ticketId: z.string().min(1) });
const listQuery = z.object({
  status: z.enum(["OPEN", "WAITING_STORE", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"]).optional(),
  assignee: z.string().optional(),
  topic: z
    .enum([
      "PRODUCT_NOT_WORKING",
      "DAMAGED_OR_MISSING",
      "SETUP_USAGE",
      "WARRANTY_SERVICE",
      "PRODUCT_INFO",
      "INVOICE_DOCUMENT",
      "OTHER",
    ])
    .optional(),
  slaRisk: z.enum(["true", "false"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export function registerSupportAdminRoutes(app: FastifyInstance, deps: SupportAdminRoutesDeps): void {
  const attachmentBase = (storeId: string, ticketId: string) =>
    `/stores/${storeId}/support/tickets/${ticketId}`;

  app.get("/stores/:storeId/support/tickets", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const q = listQuery.parse(request.query);
    const result = await listAdminTickets(params.storeId, {
      status: q.status,
      assigneePlatformUserId: q.assignee,
      topic: q.topic,
      slaRisk: q.slaRisk === "true",
      search: q.search,
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
      now: new Date(),
    });
    return reply.send(adminSupportTicketListResponseSchema.parse(result));
  });

  app.get("/stores/:storeId/support/tickets/:ticketId", async (request, reply) => {
    const params = ticketParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const detail = await getAdminTicketDetail(
      params.storeId,
      params.ticketId,
      attachmentBase(params.storeId, params.ticketId),
      new Date(),
    );
    if (!detail) return reply.code(404).send(errorBody("TICKET_NOT_FOUND", "Destek talebi bulunamadı."));
    return reply.send(adminSupportTicketDetailResponseSchema.parse({ ticket: detail }));
  });

  app.post("/stores/:storeId/support/tickets/:ticketId/messages", async (request, reply) => {
    const params = ticketParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = adminSupportMessageCreateRequestSchema.parse(request.body);
    const result = await addAdminMessage(
      {
        storeId: params.storeId,
        ticketId: params.ticketId,
        actorUserId: access.actorUserId,
        body: input.body,
        attachments: input.attachments,
      },
      deps.notifications,
      new Date(),
    );
    if (!result.ok) return reply.code(actionStatus(result.code)).send(errorBody(result.code, adminMessage(result.code)));
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "SupportTicket",
      entityId: params.ticketId,
      metadata: { action: "support.reply" },
    });
    return finishDetail(reply, deps, params.storeId, params.ticketId);
  });

  app.post("/stores/:storeId/support/tickets/:ticketId/actions", async (request, reply) => {
    const params = ticketParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = adminSupportActionRequestSchema.parse(request.body);
    const result =
      input.action === "ASSIGN"
        ? await applyAdminAction(
            {
              kind: "ASSIGN",
              storeId: params.storeId,
              ticketId: params.ticketId,
              actorUserId: access.actorUserId,
              expectedVersion: input.expectedVersion,
              assigneePlatformUserId: input.assigneePlatformUserId,
            },
            deps.notifications,
          )
        : await applyAdminAction(
            {
              kind: "SET_STATUS",
              storeId: params.storeId,
              ticketId: params.ticketId,
              actorUserId: access.actorUserId,
              expectedVersion: input.expectedVersion,
              toStatus: input.toStatus,
              note: input.note,
              now: new Date(),
            },
            deps.notifications,
          );
    if (!result.ok) return reply.code(actionStatus(result.code)).send(errorBody(result.code, adminMessage(result.code)));
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "SupportTicket",
      entityId: params.ticketId,
      metadata: { action: `support.${input.action.toLowerCase()}` },
    });
    return finishDetail(reply, deps, params.storeId, params.ticketId);
  });
}

async function finishDetail(reply: FastifyReply, deps: SupportAdminRoutesDeps, storeId: string, ticketId: string) {
  const detail = await getAdminTicketDetail(storeId, ticketId, `/stores/${storeId}/support/tickets/${ticketId}`, new Date());
  if (!detail) return reply.code(404).send(errorBody("TICKET_NOT_FOUND", "Destek talebi bulunamadı."));
  return reply.send(adminSupportTicketDetailResponseSchema.parse({ ticket: detail }));
}

function actionStatus(code: string): number {
  if (code === "TICKET_NOT_FOUND" || code === "ATTACHMENT_NOT_FOUND") return 404;
  return 409;
}
function adminMessage(code: string): string {
  const map: Record<string, string> = {
    TICKET_NOT_FOUND: "Destek talebi bulunamadı.",
    TICKET_CLOSED: "Kapatılmış talep düzenlenemez.",
    INVALID_TRANSITION: "Bu durum geçişi yapılamaz.",
    VERSION_CONFLICT: "Talep bu sırada değişti; yenileyin.",
    ATTACHMENT_NOT_FOUND: "Ek bulunamadı.",
  };
  return map[code] ?? "İşlem reddedildi.";
}
