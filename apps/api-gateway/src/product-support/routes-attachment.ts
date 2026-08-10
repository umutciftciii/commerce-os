/**
 * TODO-177 (ADR-289) — Ürün Desteği attachment private serve rotaları (returns deseni).
 * storageKey/mimeType DTO'ya SIZMAZ; yalnız auth-gate'li stream. Cross-store/cross-customer → 404.
 */

import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@commerce-os/db";
import type { StorageDriver } from "../media/storage.js";

export interface SupportAttachmentServeDeps {
  storage: StorageDriver;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  resolveCustomer: (request: FastifyRequest, storeId: string) => Promise<{ id: string } | null>;
  resolvePublicStore: (slug: string) => Promise<{ id: string; slug: string } | null>;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

async function streamAttachment(
  reply: FastifyReply,
  storage: StorageDriver,
  attachment: { mediaAsset: { storageKey: string; mimeType: string } },
) {
  const bytes = await storage.read(attachment.mediaAsset.storageKey);
  if (!bytes) return reply.code(404).send(errorBody("ATTACHMENT_FILE_MISSING", "Dosya bulunamadı."));
  return reply
    .header("Cache-Control", "private, no-store")
    .header("X-Content-Type-Options", "nosniff")
    .header("Content-Disposition", "inline")
    .type(attachment.mediaAsset.mimeType)
    .send(bytes);
}

const adminParam = z.object({
  storeId: z.string().min(1),
  ticketId: z.string().min(1),
  attachmentId: z.string().min(1),
});
const customerParam = z.object({
  storeSlug: z.string().min(1),
  ticketNumber: z.string().min(1),
  attachmentId: z.string().min(1),
});

export function registerSupportAttachmentServeRoutes(app: FastifyInstance, deps: SupportAttachmentServeDeps): void {
  // admin: scoped by storeId + ticketId
  app.get("/stores/:storeId/support/tickets/:ticketId/attachments/:attachmentId", async (request, reply) => {
    const params = adminParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const attachment = await prisma.supportTicketAttachment.findFirst({
      where: { id: params.attachmentId, storeId: params.storeId, ticketId: params.ticketId },
      select: { mediaAsset: { select: { storageKey: true, mimeType: true } } },
    });
    if (!attachment) return reply.code(404).send(errorBody("ATTACHMENT_NOT_FOUND", "Ek bulunamadı."));
    return streamAttachment(reply, deps.storage, attachment);
  });

  // customer: scoped by storeId + customerId + ticketNumber
  app.get(
    "/public/stores/:storeSlug/customer/support/tickets/:ticketNumber/attachments/:attachmentId",
    async (request, reply) => {
      const params = customerParam.parse(request.params);
      const store = await deps.resolvePublicStore(params.storeSlug);
      if (!store) return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
      const customer = await deps.resolveCustomer(request, store.id);
      if (!customer) return reply.code(401).send(errorBody("CUSTOMER_UNAUTHORIZED", "Oturum gerekli."));
      const attachment = await prisma.supportTicketAttachment.findFirst({
        where: {
          id: params.attachmentId,
          storeId: store.id,
          ticket: { ticketNumber: params.ticketNumber, storeId: store.id, customerId: customer.id },
        },
        select: { mediaAsset: { select: { storageKey: true, mimeType: true } } },
      });
      if (!attachment) return reply.code(404).send(errorBody("ATTACHMENT_NOT_FOUND", "Ek bulunamadı."));
      return streamAttachment(reply, deps.storage, attachment);
    },
  );
}
