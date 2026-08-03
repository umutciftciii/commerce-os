/**
 * TODO-169 (ADR-269 §8) — İade attachment PRIVATE stream uçları. Public /media static bu dosyaları
 * 404'ler (server.ts onRequest guard); erişim yalnız buradan: sahip müşteri (kendi iadesinin eki) ya
 * da store admin. Dosya bytes'ı StorageDriver.read ile okunur; storageKey/mimeType DTO'da SIZMAZ.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@commerce-os/db";
import { z } from "zod";
import type { StorageDriver } from "../media/storage.js";

export interface ReturnAttachmentServeDeps {
  storage: StorageDriver;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  resolveCustomer: (
    request: FastifyRequest,
    storeId: string,
  ) => Promise<{ id: string } | null>;
  resolvePublicStore: (slug: string) => Promise<{ id: string; slug: string } | null>;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

const adminParam = z.object({
  storeId: z.string().min(1),
  returnId: z.string().min(1),
  attachmentId: z.string().min(1),
});
const customerParam = z.object({
  storeSlug: z.string().min(1),
  returnNumber: z.string().min(1),
  attachmentId: z.string().min(1),
});

async function streamAttachment(
  reply: FastifyReply,
  storage: StorageDriver,
  attachment: { mediaAsset: { storageKey: string; mimeType: string } },
) {
  const bytes = await storage.read(attachment.mediaAsset.storageKey);
  if (!bytes) return reply.code(404).send(errorBody("ATTACHMENT_FILE_MISSING", "Dosya bulunamadı."));
  return reply
    .header("Cache-Control", "private, no-store")
    .type(attachment.mediaAsset.mimeType)
    .send(bytes);
}

export function registerReturnAttachmentServeRoutes(
  app: FastifyInstance,
  deps: ReturnAttachmentServeDeps,
): void {
  // Admin: store-scoped attachment stream.
  app.get(
    "/stores/:storeId/returns/:returnId/attachments/:attachmentId",
    async (request, reply) => {
      const params = adminParam.parse(request.params);
      const access = await deps.requireStoreAdmin(request, reply, params.storeId);
      if (!access) return;
      const attachment = await prisma.returnAttachment.findFirst({
        where: {
          id: params.attachmentId,
          storeId: params.storeId,
          returnItem: { returnRequest: { id: params.returnId, storeId: params.storeId } },
        },
        select: { mediaAsset: { select: { storageKey: true, mimeType: true } } },
      });
      if (!attachment) return reply.code(404).send(errorBody("ATTACHMENT_NOT_FOUND", "Ek bulunamadı."));
      return streamAttachment(reply, deps.storage, attachment);
    },
  );

  // Müşteri: yalnız kendi iadesinin eki.
  app.get(
    "/public/stores/:storeSlug/customer/returns/:returnNumber/attachments/:attachmentId",
    async (request, reply) => {
      const params = customerParam.parse(request.params);
      const store = await deps.resolvePublicStore(params.storeSlug);
      if (!store) return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
      const customer = await deps.resolveCustomer(request, store.id);
      if (!customer) return reply.code(401).send(errorBody("CUSTOMER_UNAUTHORIZED", "Oturum gerekli."));
      const attachment = await prisma.returnAttachment.findFirst({
        where: {
          id: params.attachmentId,
          storeId: store.id,
          returnItem: {
            returnRequest: { returnNumber: params.returnNumber, storeId: store.id, customerId: customer.id },
          },
        },
        select: { mediaAsset: { select: { storageKey: true, mimeType: true } } },
      });
      if (!attachment) return reply.code(404).send(errorBody("ATTACHMENT_NOT_FOUND", "Ek bulunamadı."));
      return streamAttachment(reply, deps.storage, attachment);
    },
  );
}
