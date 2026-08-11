/**
 * TODO-178 (Faz B) — Platform Admin Store-Request rotaları. `/platform/requests/*` (+ taxonomy
 * `/platform/request-categories`). Guard: requirePlatform; taxonomy YAZMA = requireSuperAdmin.
 * Cross-store inbox (tüm mağazalar). INTERNAL içerik platform DTO'sunda görünür (tam operasyonel).
 */

import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  platformRequestAssignRequestSchema,
  platformRequestPriorityRequestSchema,
  platformRequestStatusRequestSchema,
  platformRequestRecategorizeRequestSchema,
  platformRequestMessageCreateRequestSchema,
  platformRequestListResponseSchema,
  platformRequestDetailResponseSchema,
  platformRequestCategoryListResponseSchema,
  platformRequestCategoryCreateRequestSchema,
  platformRequestCategoryUpdateRequestSchema,
  platformUserDirectoryResponseSchema,
  platformRequestAttachmentResponseSchema,
} from "@commerce-os/contracts";
import type { StorageDriver } from "../media/storage.js";
import type { PlatformRequestNotificationDispatcher } from "./notification.js";
import {
  listPlatformRequests,
  getPlatformRequestDetail,
  assignRequest,
  setPriority,
  setStatus,
  recategorize,
  addPlatformMessage,
  listCategories,
  createCategory,
  updateCategory,
  listAssignablePlatformUsers,
} from "./service.js";
import { addPlatformRequestAttachment, getPlatformAttachmentForStream } from "./attachments.js";

export interface PlatformRequestPlatformRoutesDeps {
  requirePlatform: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<{ actorUserId: string } | null>;
  requireSuperAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<{ actorUserId: string } | null>;
  recordAudit: (input: {
    action: "CREATE" | "UPDATE" | "DELETE" | "SYSTEM";
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => void | Promise<void>;
  notifications: PlatformRequestNotificationDispatcher;
  storage: StorageDriver;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

const idParam = z.object({ id: z.string().min(1) });
const catIdParam = z.object({ id: z.string().min(1) });
const usersQuery = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(50).optional(),
});
const listQuery = z.object({
  status: z
    .enum(["OPEN", "TRIAGED", "IN_PROGRESS", "WAITING_STORE", "RESOLVED", "CLOSED"])
    .optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  categoryKey: z.string().optional(),
  assignee: z.string().optional(),
  storeId: z.string().optional(),
  slaRisk: z.enum(["true", "false"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

const CODE_STATUS: Record<string, number> = {
  REQUEST_NOT_FOUND: 404,
  ASSIGNEE_NOT_FOUND: 400,
  CATEGORY_NOT_FOUND: 404,
  CATEGORY_INACTIVE: 409,
  CATEGORY_KEY_EXISTS: 409,
  REQUEST_CLOSED: 409,
  INVALID_TRANSITION: 409,
  CLOSE_REASON_REQUIRED: 400,
  INVALID_CLOSE_REASON: 409,
  ACTOR_NOT_ALLOWED: 403,
  ALREADY_CLOSED: 409,
  VERSION_CONFLICT: 409,
  FILE_REQUIRED: 400,
  UNSUPPORTED_MEDIA_TYPE: 415,
  FILE_TOO_LARGE: 413,
  INVALID_IMAGE: 422,
  ATTACHMENT_NOT_FOUND: 404,
  ATTACHMENT_FILE_MISSING: 404,
};
const fail = (reply: FastifyReply, code: string) =>
  reply.code(CODE_STATUS[code] ?? 400).send(errorBody(code, "İşlem reddedildi."));

export function registerPlatformRequestPlatformRoutes(
  app: FastifyInstance,
  deps: PlatformRequestPlatformRoutesDeps,
): void {
  async function sendDetail(reply: FastifyReply, id: string) {
    const detail = await getPlatformRequestDetail(id, new Date());
    if (!detail) return reply.code(404).send(errorBody("REQUEST_NOT_FOUND", "Talep bulunamadı."));
    return reply.send(platformRequestDetailResponseSchema.parse({ request: detail }));
  }

  // TD-178-6 — Atama için read-only PlatformUser dizini. requirePlatform (store yüzeyine kapalı).
  app.get("/platform/users", async (request, reply) => {
    const access = await deps.requirePlatform(request, reply);
    if (!access) return;
    const q = usersQuery.parse(request.query);
    const result = await listAssignablePlatformUsers({
      search: q.search,
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
    });
    return reply.send(platformUserDirectoryResponseSchema.parse(result));
  });

  app.get("/platform/requests", async (request, reply) => {
    const access = await deps.requirePlatform(request, reply);
    if (!access) return;
    const q = listQuery.parse(request.query);
    const result = await listPlatformRequests({
      status: q.status,
      priority: q.priority,
      categoryKey: q.categoryKey,
      assigneePlatformUserId: q.assignee,
      storeId: q.storeId,
      slaRisk: q.slaRisk === "true",
      search: q.search,
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
      now: new Date(),
    });
    return reply.send(platformRequestListResponseSchema.parse(result));
  });

  app.get("/platform/requests/:id", async (request, reply) => {
    const access = await deps.requirePlatform(request, reply);
    if (!access) return;
    const { id } = idParam.parse(request.params);
    return sendDetail(reply, id);
  });

  app.post("/platform/requests/:id/assign", async (request, reply) => {
    const access = await deps.requirePlatform(request, reply);
    if (!access) return;
    const { id } = idParam.parse(request.params);
    const input = platformRequestAssignRequestSchema.parse(request.body);
    const result = await assignRequest(
      {
        requestId: id,
        actorUserId: access.actorUserId,
        expectedVersion: input.expectedVersion,
        assigneePlatformUserId: input.assigneePlatformUserId,
      },
      deps.notifications,
    );
    if (!result.ok) return fail(reply, result.code);
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      entityType: "PlatformRequest",
      entityId: id,
      metadata: { action: "platform-request.assign" },
    });
    return sendDetail(reply, id);
  });

  app.post("/platform/requests/:id/priority", async (request, reply) => {
    const access = await deps.requirePlatform(request, reply);
    if (!access) return;
    const { id } = idParam.parse(request.params);
    const input = platformRequestPriorityRequestSchema.parse(request.body);
    const result = await setPriority({
      requestId: id,
      actorUserId: access.actorUserId,
      expectedVersion: input.expectedVersion,
      priority: input.priority,
    });
    if (!result.ok) return fail(reply, result.code);
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      entityType: "PlatformRequest",
      entityId: id,
      metadata: { action: "platform-request.priority" },
    });
    return sendDetail(reply, id);
  });

  app.post("/platform/requests/:id/status", async (request, reply) => {
    const access = await deps.requirePlatform(request, reply);
    if (!access) return;
    const { id } = idParam.parse(request.params);
    const input = platformRequestStatusRequestSchema.parse(request.body);
    const result = await setStatus(
      {
        requestId: id,
        actorUserId: access.actorUserId,
        expectedVersion: input.expectedVersion,
        toStatus: input.toStatus,
        closeReason: input.closeReason,
        note: input.note,
      },
      deps.notifications,
      new Date(),
    );
    if (!result.ok) return fail(reply, result.code);
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      entityType: "PlatformRequest",
      entityId: id,
      metadata: { action: "platform-request.status", toStatus: input.toStatus },
    });
    return sendDetail(reply, id);
  });

  app.post("/platform/requests/:id/category", async (request, reply) => {
    const access = await deps.requirePlatform(request, reply);
    if (!access) return;
    const { id } = idParam.parse(request.params);
    const input = platformRequestRecategorizeRequestSchema.parse(request.body);
    const result = await recategorize({
      requestId: id,
      actorUserId: access.actorUserId,
      expectedVersion: input.expectedVersion,
      categoryKey: input.categoryKey,
    });
    if (!result.ok) return fail(reply, result.code);
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      entityType: "PlatformRequest",
      entityId: id,
      metadata: { action: "platform-request.recategorize" },
    });
    return sendDetail(reply, id);
  });

  app.post("/platform/requests/:id/messages", async (request, reply) => {
    const access = await deps.requirePlatform(request, reply);
    if (!access) return;
    const { id } = idParam.parse(request.params);
    const input = platformRequestMessageCreateRequestSchema.parse(request.body);
    const result = await addPlatformMessage(
      { requestId: id, actorUserId: access.actorUserId, body: input.body, visibility: input.visibility },
      deps.notifications,
      new Date(),
    );
    if (!result.ok) return fail(reply, result.code);
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      entityType: "PlatformRequest",
      entityId: id,
      metadata: { action: "platform-request.message", visibility: input.visibility },
    });
    return sendDetail(reply, id);
  });

  // ---- Taxonomy: read = requirePlatform; write = requireSuperAdmin ----

  // TODO-178 (Faz E) — Platform attachment upload (multipart). Visibility server-validate
  // (STORE_VISIBLE | INTERNAL; query param, default STORE_VISIBLE). storageKey server-side.
  const attVisibilityQuery = z.object({
    visibility: z.enum(["STORE_VISIBLE", "INTERNAL"]).optional(),
  });
  app.post("/platform/requests/:id/attachments", async (request, reply) => {
    const access = await deps.requirePlatform(request, reply);
    if (!access) return;
    const params = idParam.parse(request.params);
    const q = attVisibilityQuery.parse(request.query);
    const file = await (
      request as unknown as {
        file: () => Promise<{ mimetype: string; toBuffer: () => Promise<Buffer> } | undefined>;
      }
    ).file();
    if (!file) return fail(reply, "FILE_REQUIRED");
    const raw = await file.toBuffer();
    const result = await addPlatformRequestAttachment(
      {
        requestId: params.id,
        actorId: access.actorUserId,
        raw,
        mimetype: file.mimetype,
        visibility: q.visibility ?? "STORE_VISIBLE",
      },
      deps.storage,
    );
    if (!result.ok) return fail(reply, result.code);
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      entityType: "PlatformRequest",
      entityId: params.id,
      metadata: {
        action: "platform-request.attachment.upload",
        attachmentId: result.attachment.id,
        visibility: result.attachment.visibility,
      },
    });
    return reply
      .code(201)
      .send(platformRequestAttachmentResponseSchema.parse({ attachment: result.attachment }));
  });

  // Platform private serve — STORE_VISIBLE + INTERNAL (tam yüzey). Ham storageKey expose edilmez.
  app.get("/platform/requests/attachments/:attachmentId", async (request, reply) => {
    const access = await deps.requirePlatform(request, reply);
    if (!access) return;
    const params = z.object({ attachmentId: z.string().min(1) }).parse(request.params);
    const media = await getPlatformAttachmentForStream(params.attachmentId);
    if (!media) return fail(reply, "ATTACHMENT_NOT_FOUND");
    const bytes = await deps.storage.read(media.storageKey);
    if (!bytes) return fail(reply, "ATTACHMENT_FILE_MISSING");
    return reply
      .header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Disposition", "inline")
      .type(media.mimeType)
      .send(bytes);
  });

  app.get("/platform/request-categories", async (request, reply) => {
    const access = await deps.requirePlatform(request, reply);
    if (!access) return;
    const items = await listCategories();
    return reply.send(platformRequestCategoryListResponseSchema.parse({ items }));
  });

  app.post("/platform/request-categories", async (request, reply) => {
    const access = await deps.requireSuperAdmin(request, reply);
    if (!access) return;
    const input = platformRequestCategoryCreateRequestSchema.parse(request.body);
    const result = await createCategory(input);
    if (!result.ok) return fail(reply, result.code);
    await deps.recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      entityType: "PlatformRequestCategory",
      entityId: result.id,
      metadata: { action: "platform-request.category.create", key: input.key },
    });
    const items = await listCategories();
    return reply.code(201).send(platformRequestCategoryListResponseSchema.parse({ items }));
  });

  app.patch("/platform/request-categories/:id", async (request, reply) => {
    const access = await deps.requireSuperAdmin(request, reply);
    if (!access) return;
    const { id } = catIdParam.parse(request.params);
    const input = platformRequestCategoryUpdateRequestSchema.parse(request.body);
    const result = await updateCategory(id, input);
    if (!result.ok) return reply.code(404).send(errorBody(result.code, "Kategori bulunamadı."));
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      entityType: "PlatformRequestCategory",
      entityId: id,
      metadata: { action: "platform-request.category.update" },
    });
    const items = await listCategories();
    return reply.send(platformRequestCategoryListResponseSchema.parse({ items }));
  });
}
