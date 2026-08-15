/**
 * TODO-178 (Faz B) — Store Admin Platform-Request rotaları. `/stores/:storeId/platform-requests/*`.
 * Guard: requireStoreAdmin (capability PLATFORM_REQUESTS). Her read/write storeId-scoped; cross-store
 * detail/action → 404 (requestId tek başına yetmez, servis storeId ile filtreler). visibility client'tan
 * ALINMAZ (store reply daima STORE_VISIBLE). INTERNAL içerik store DTO'suna asla girmez (serializer).
 */

import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createStorePlatformRequestRequestSchema,
  storePlatformRequestMessageCreateRequestSchema,
  storePlatformRequestVersionedActionRequestSchema,
  storePlatformRequestListResponseSchema,
  storePlatformRequestDetailResponseSchema,
  storePlatformRequestCategoryListResponseSchema,
  storePlatformRequestAttachmentResponseSchema,
} from "@commerce-os/contracts";
import type { StorageDriver } from "../media/storage.js";
import type { StoreAuditActor } from "../store-auth/guard.js";
import type { PlatformRequestNotificationDispatcher } from "./notification.js";
import {
  createRequest,
  listStoreRequests,
  getStoreRequestDetail,
  listActiveStoreRequestCategories,
  addStoreVisibleMessage,
  withdrawRequest,
  confirmClose,
  reopenRequest,
} from "./service.js";
import { addStoreRequestAttachment, getStoreAttachmentForStream } from "./attachments.js";

export interface PlatformRequestStoreRoutesDeps {
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string; audit: StoreAuditActor } | null>;
  recordAudit: (input: StoreAuditActor & {
    action: "CREATE" | "UPDATE" | "DELETE" | "SYSTEM";
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

const storeParam = z.object({ storeId: z.string().min(1) });
const reqParam = z.object({ storeId: z.string().min(1), id: z.string().min(1) });
const listQuery = z.object({
  status: z
    .enum(["OPEN", "TRIAGED", "IN_PROGRESS", "WAITING_STORE", "RESOLVED", "CLOSED"])
    .optional(),
  categoryKey: z.string().optional(),
  slaRisk: z.enum(["true", "false"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

const CODE_STATUS: Record<string, number> = {
  REQUEST_NOT_FOUND: 404,
  CATEGORY_NOT_FOUND: 404,
  CATEGORY_INACTIVE: 409,
  REQUEST_CLOSED: 409,
  CANNOT_WITHDRAW: 409,
  CANNOT_CONFIRM_CLOSE: 409,
  VERSION_CONFLICT: 409,
  REOPEN_WINDOW_EXPIRED: 409,
  CLOSED_CANNOT_REOPEN: 409,
  INVALID_TRANSITION: 409,
  NOT_OWNER: 403,
  FILE_REQUIRED: 400,
  UNSUPPORTED_MEDIA_TYPE: 415,
  FILE_TOO_LARGE: 413,
  INVALID_IMAGE: 422,
  ATTACHMENT_NOT_FOUND: 404,
  ATTACHMENT_FILE_MISSING: 404,
};
const CODE_MESSAGE: Record<string, string> = {
  REQUEST_NOT_FOUND: "Talep bulunamadı.",
  CATEGORY_NOT_FOUND: "Kategori bulunamadı.",
  CATEGORY_INACTIVE: "Kategori pasif.",
  REQUEST_CLOSED: "Kapatılmış talep düzenlenemez.",
  CANNOT_WITHDRAW: "Bu durumda talep geri çekilemez.",
  CANNOT_CONFIRM_CLOSE: "Bu talep onaylanıp kapatılamaz.",
  VERSION_CONFLICT: "Talep bu sırada değişti; yenileyin.",
  REOPEN_WINDOW_EXPIRED: "Yeniden açma süresi doldu.",
  CLOSED_CANNOT_REOPEN: "Kapatılmış talep yeniden açılamaz.",
  INVALID_TRANSITION: "Bu işlem yapılamaz.",
  NOT_OWNER: "Bu talep bu mağazaya ait değil.",
  FILE_REQUIRED: "Dosya gerekli.",
  UNSUPPORTED_MEDIA_TYPE: "Yalnız JPEG/PNG/WebP/PDF yüklenebilir.",
  FILE_TOO_LARGE: "Dosya çok büyük.",
  INVALID_IMAGE: "Görsel işlenemedi.",
  ATTACHMENT_NOT_FOUND: "Ek bulunamadı.",
  ATTACHMENT_FILE_MISSING: "Ek dosyası bulunamadı.",
};
const fail = (reply: FastifyReply, code: string) =>
  reply.code(CODE_STATUS[code] ?? 400).send(errorBody(code, CODE_MESSAGE[code] ?? "İşlem reddedildi."));

export function registerPlatformRequestStoreRoutes(
  app: FastifyInstance,
  deps: PlatformRequestStoreRoutesDeps,
): void {
  async function sendDetail(reply: FastifyReply, storeId: string, id: string) {
    const detail = await getStoreRequestDetail(storeId, id, new Date());
    if (!detail) return reply.code(404).send(errorBody("REQUEST_NOT_FOUND", "Talep bulunamadı."));
    return reply.send(storePlatformRequestDetailResponseSchema.parse({ request: detail }));
  }

  // Store create/filtre için AKTİF taksonomi (ayrı prefix → `/:id` ile çakışmaz). Guard aynı modül.
  app.get("/stores/:storeId/platform-request-categories", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const items = await listActiveStoreRequestCategories();
    return reply.send(storePlatformRequestCategoryListResponseSchema.parse({ items }));
  });

  app.post("/stores/:storeId/platform-requests", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = createStorePlatformRequestRequestSchema.parse(request.body);
    const result = await createRequest(
      {
        storeId: params.storeId,
        categoryKey: input.categoryKey,
        subject: input.subject,
        description: input.description,
        storeImpact: input.storeImpact,
        contextKind: input.contextKind,
        contextSnapshot: input.contextSnapshot,
        actor: { kind: "PLATFORM_USER", id: access.actorUserId },
      },
      deps.notifications,
      new Date(),
    );
    if (!result.ok) return fail(reply, result.code);
    await deps.recordAudit({
      action: "CREATE",
      ...access.audit,
      storeId: params.storeId,
      entityType: "PlatformRequest",
      entityId: result.requestId,
      metadata: { action: "platform-request.create", requestNumber: result.requestNumber },
    });
    return sendDetail(reply, params.storeId, result.requestId);
  });

  app.get("/stores/:storeId/platform-requests", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const q = listQuery.parse(request.query);
    const result = await listStoreRequests(params.storeId, {
      status: q.status,
      categoryKey: q.categoryKey,
      slaRisk: q.slaRisk === "true",
      search: q.search,
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
      now: new Date(),
    });
    return reply.send(storePlatformRequestListResponseSchema.parse(result));
  });

  app.get("/stores/:storeId/platform-requests/:id", async (request, reply) => {
    const params = reqParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    return sendDetail(reply, params.storeId, params.id);
  });

  app.post("/stores/:storeId/platform-requests/:id/messages", async (request, reply) => {
    const params = reqParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = storePlatformRequestMessageCreateRequestSchema.parse(request.body);
    const result = await addStoreVisibleMessage(
      { storeId: params.storeId, requestId: params.id, actorId: access.actorUserId, body: input.body },
      deps.notifications,
      new Date(),
    );
    if (!result.ok) return fail(reply, result.code);
    await deps.recordAudit({
      action: "UPDATE",
      ...access.audit,
      storeId: params.storeId,
      entityType: "PlatformRequest",
      entityId: params.id,
      metadata: { action: "platform-request.reply" },
    });
    return sendDetail(reply, params.storeId, params.id);
  });

  // TODO-178 (Faz E) — Attachment upload (multipart; foto→webp / PDF as-is). Visibility DAİMA
  // STORE_VISIBLE (client gönderemez); storageKey server-side. Kapalı talebe eklenemez.
  app.post("/stores/:storeId/platform-requests/:id/attachments", async (request, reply) => {
    const params = reqParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const file = await (
      request as unknown as {
        file: () => Promise<{ mimetype: string; toBuffer: () => Promise<Buffer> } | undefined>;
      }
    ).file();
    if (!file) return fail(reply, "FILE_REQUIRED");
    const raw = await file.toBuffer();
    const result = await addStoreRequestAttachment(
      { storeId: params.storeId, requestId: params.id, actorId: access.actorUserId, raw, mimetype: file.mimetype },
      deps.storage,
    );
    if (!result.ok) return fail(reply, result.code);
    await deps.recordAudit({
      action: "UPDATE",
      ...access.audit,
      storeId: params.storeId,
      entityType: "PlatformRequest",
      entityId: params.id,
      metadata: { action: "platform-request.attachment.upload", attachmentId: result.attachment.id },
    });
    return reply
      .code(201)
      .send(storePlatformRequestAttachmentResponseSchema.parse({ attachment: result.attachment }));
  });

  // Private serve — YALNIZ STORE_VISIBLE + storeId-scoped. INTERNAL / cross-store (id bilinse bile) → 404.
  // Ham storageKey/path expose edilmez; private-media header konvansiyonları (inline, no-store, nosniff).
  const attParam = z.object({ storeId: z.string().min(1), attachmentId: z.string().min(1) });
  app.get("/stores/:storeId/platform-requests/attachments/:attachmentId", async (request, reply) => {
    const params = attParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const media = await getStoreAttachmentForStream(params.storeId, params.attachmentId);
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

  const versionedAction =
    (
      handler: (args: {
        storeId: string;
        requestId: string;
        actorId: string;
        expectedVersion: number;
      }) => Promise<{ ok: true } | { ok: false; code: string }>,
      auditAction: string,
    ) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = reqParam.parse(request.params);
      const access = await deps.requireStoreAdmin(request, reply, params.storeId);
      if (!access) return;
      const input = storePlatformRequestVersionedActionRequestSchema.parse(request.body);
      const result = await handler({
        storeId: params.storeId,
        requestId: params.id,
        actorId: access.actorUserId,
        expectedVersion: input.expectedVersion,
      });
      if (!result.ok) return fail(reply, result.code);
      await deps.recordAudit({
        action: "UPDATE",
        ...access.audit,
        storeId: params.storeId,
        entityType: "PlatformRequest",
        entityId: params.id,
        metadata: { action: auditAction },
      });
      return sendDetail(reply, params.storeId, params.id);
    };

  app.post(
    "/stores/:storeId/platform-requests/:id/withdraw",
    versionedAction(
      (a) => withdrawRequest(a, deps.notifications, new Date()),
      "platform-request.withdraw",
    ),
  );
  app.post(
    "/stores/:storeId/platform-requests/:id/confirm-close",
    versionedAction(
      (a) => confirmClose(a, deps.notifications, new Date()),
      "platform-request.confirm-close",
    ),
  );
  app.post(
    "/stores/:storeId/platform-requests/:id/reopen",
    versionedAction((a) => reopenRequest(a, deps.notifications, new Date()), "platform-request.reopen"),
  );
}
