/**
 * TODO-151 (ADR-074) — Commercial Engine · HTTP UÇLARI.
 *
 *  GET  /stores/:storeId/products/:productId/commercial            → matris okuma (current değerler)
 *  POST /stores/:storeId/products/:productId/commercial/preview    → rule/direct-edit önizleme
 *  POST /stores/:storeId/products/:productId/commercial/apply      → server-authoritative apply
 *
 * Preview salt-okuma + deterministik; apply tek transaction + advisory-lock + stale-guard. Yetki
 * sunucuda (requireStoreAdmin). Hatalar STABIL kodla döner. Identity/combination/generation uçları
 * BOZULMAZ; bu ayrı ticari katmandır.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  commercialApplyRequestSchema,
  commercialApplyResponseSchema,
  commercialPreviewRequestSchema,
  commercialPreviewResponseSchema,
} from "@commerce-os/contracts";
import {
  commercialErrorStatus,
  type CommercialError,
  type CommercialPreviewResult,
  type CommercialService,
} from "./service.js";

type Actor = { actorUserId: string };

export interface CommercialRoutesDeps {
  service: CommercialService;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<Actor | null>;
}

const productParam = z.object({ storeId: z.string().min(1), productId: z.string().min(1) });

function serializePreview(result: CommercialPreviewResult) {
  return {
    fingerprint: result.fingerprint,
    source: result.source,
    blocked: result.blocked,
    rows: result.rows,
    summary: result.summary,
  };
}

async function sendServiceError(reply: FastifyReply, error: CommercialError) {
  await reply.code(commercialErrorStatus(error.code)).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.detail !== undefined ? { detail: error.detail } : {}),
    },
  });
}

export function registerCommercialRoutes(app: FastifyInstance, deps: CommercialRoutesDeps) {
  const { service, requireStoreAdmin } = deps;

  app.get("/stores/:storeId/products/:productId/commercial", async (request, reply) => {
    const params = productParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const result = await service.matrix({ storeId: params.storeId, productId: params.productId });
    if (!result.ok) return sendServiceError(reply, result.error);
    return commercialPreviewResponseSchema.parse(serializePreview(result.result));
  });

  app.post("/stores/:storeId/products/:productId/commercial/preview", async (request, reply) => {
    const params = productParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const body = commercialPreviewRequestSchema.parse(request.body ?? {});
    const result = await service.preview({
      storeId: params.storeId,
      productId: params.productId,
      rule: body.rule,
      edits: body.edits,
      selectedVariantIds: body.selectedVariantIds,
    });
    if (!result.ok) return sendServiceError(reply, result.error);
    return commercialPreviewResponseSchema.parse(serializePreview(result.result));
  });

  app.post("/stores/:storeId/products/:productId/commercial/apply", async (request, reply) => {
    const params = productParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const body = commercialApplyRequestSchema.parse(request.body ?? {});
    const result = await service.apply({
      storeId: params.storeId,
      productId: params.productId,
      actorUserId: actor.actorUserId,
      baseFingerprint: body.baseFingerprint,
      rule: body.rule,
      edits: body.edits,
      selectedVariantIds: body.selectedVariantIds,
    });
    if (!result.ok) return sendServiceError(reply, result.error);
    return commercialApplyResponseSchema.parse({
      batchId: result.result.batchId,
      updatedVariants: result.result.updatedVariants,
      updatedFields: result.result.updatedFields,
      skippedVariants: result.result.skippedVariants,
      auditCount: result.result.auditCount,
      source: result.result.source,
      preview: serializePreview(result.result.preview),
    });
  });
}
