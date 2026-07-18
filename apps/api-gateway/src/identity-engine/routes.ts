/**
 * TODO-150 (ADR-073) — Identity Management Engine · HTTP UÇLARI.
 *
 *  GET  /stores/:storeId/products/:productId/identity/preview   (?sku=&barcode=&title=&seqStart=&regenerateCustomTitles=)
 *  POST /stores/:storeId/products/:productId/identity/apply     (gövde: { sku?, barcode?, title?, seqStart?, regenerateCustomTitles? })
 *
 * Preview salt-okuma + deterministik; apply server-authoritative (preview'i yeniden hesaplar) + tek
 * transaction. Yetki sunucuda (requireStoreAdmin). Pattern hataları / collision blokajı STABIL kodla
 * döner. Combination/generation uçları BOZULMAZ.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  identityApplyRequestSchema,
  identityApplyResponseSchema,
  identityPreviewResponseSchema,
} from "@commerce-os/contracts";
import {
  identityErrorStatus,
  serializeIdentityApply,
  serializeIdentityPreview,
  type IdentityError,
  type IdentityService,
} from "./service.js";

type Actor = { actorUserId: string };

export interface IdentityRoutesDeps {
  service: IdentityService;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<Actor | null>;
}

const productParam = z.object({ storeId: z.string().min(1), productId: z.string().min(1) });

// GET query: pattern'lar string; seqStart sayı; regenerateCustomTitles boolean (coerce).
const previewQuery = z.object({
  sku: z.string().optional(),
  barcode: z.string().optional(),
  title: z.string().optional(),
  seqStart: z.coerce.number().int().min(0).optional(),
  regenerateCustomTitles: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

async function sendServiceError(reply: FastifyReply, error: IdentityError) {
  await reply.code(identityErrorStatus(error.code)).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.field !== undefined ? { field: error.field } : {}),
      ...(error.patternCode !== undefined ? { patternCode: error.patternCode } : {}),
      ...(error.index !== undefined ? { index: error.index } : {}),
    },
  });
}

export function registerIdentityRoutes(app: FastifyInstance, deps: IdentityRoutesDeps) {
  const { service, requireStoreAdmin } = deps;

  app.get("/stores/:storeId/products/:productId/identity/preview", async (request, reply) => {
    const params = productParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const query = previewQuery.parse(request.query);
    const result = await service.preview({
      storeId: params.storeId,
      productId: params.productId,
      sku: query.sku,
      barcode: query.barcode,
      title: query.title,
      seqStart: query.seqStart,
      regenerateCustomTitles: query.regenerateCustomTitles,
    });
    if (!result.ok) return sendServiceError(reply, result.error);
    return identityPreviewResponseSchema.parse(serializeIdentityPreview(result.result));
  });

  app.post("/stores/:storeId/products/:productId/identity/apply", async (request, reply) => {
    const params = productParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const body = identityApplyRequestSchema.parse(request.body ?? {});
    const result = await service.apply({
      storeId: params.storeId,
      productId: params.productId,
      actorUserId: actor.actorUserId,
      sku: body.sku,
      barcode: body.barcode,
      title: body.title,
      seqStart: body.seqStart,
      regenerateCustomTitles: body.regenerateCustomTitles,
    });
    if (!result.ok) return sendServiceError(reply, result.error);
    return identityApplyResponseSchema.parse(serializeIdentityApply(result.result));
  });
}
