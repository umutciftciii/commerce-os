/**
 * Faz 2A (ADR-068) — Urun/varyant attribute DEGER dedike (internal) HTTP uclari.
 *
 * Urun/varyant create-update GOMULU akisi (server.ts) ayni attributeValueService'i cagirir;
 * bu modul yalniz DEGERI dogrudan okumak/replace etmek isteyen internal uclari saglar (dinamik
 * urun formu HENUZ YOK — bu API onu bekler). Tum yazimlar service'ten gecer (route Prisma'ya
 * yazmaz). Store admin yetkisi (requireStoreAdmin adaptoru) server.ts'te baglanir.
 *
 * Uclar:
 *  GET  /stores/:storeId/products/:productId/attribute-values
 *  PUT  /stores/:storeId/products/:productId/attribute-values
 *  GET  /stores/:storeId/products/:productId/variants/:variantId/attribute-values
 *  PUT  /stores/:storeId/products/:productId/variants/:variantId/attribute-values
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  productAttributeValueListResponseSchema,
  productAttributeValuesReplaceRequestSchema,
  variantAttributeValueListResponseSchema,
  variantAttributeValuesReplaceRequestSchema,
} from "@commerce-os/contracts";
import {
  attributeValueErrorStatus,
  serializeProductAttributeValue,
  serializeVariantAttributeValue,
  type AttributeValueError,
  type AttributeValueService,
} from "./service.js";

type Actor = { actorUserId: string };

export interface AttributeValueRoutesDeps {
  service: AttributeValueService;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<Actor | null>;
  recordAudit: (input: {
    action: "CREATE" | "UPDATE" | "DELETE";
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

async function sendServiceError(reply: FastifyReply, error: AttributeValueError) {
  await reply
    .code(attributeValueErrorStatus(error.code))
    .send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.attributeDefinitionId ? { attributeDefinitionId: error.attributeDefinitionId } : {}),
      },
    });
}

const productParam = z.object({ storeId: z.string().min(1), productId: z.string().min(1) });
const variantParam = z.object({
  storeId: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().min(1),
});

export function registerAttributeValueRoutes(app: FastifyInstance, deps: AttributeValueRoutesDeps) {
  const { service, requireStoreAdmin, recordAudit } = deps;

  // ── Urun attribute degerleri ──
  app.get("/stores/:storeId/products/:productId/attribute-values", async (request, reply) => {
    const params = productParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const result = await service.getProductValues(params.storeId, params.productId);
    if (!result.ok) return sendServiceError(reply, result.error);
    return productAttributeValueListResponseSchema.parse({
      data: result.values.map(serializeProductAttributeValue),
    });
  });

  app.put("/stores/:storeId/products/:productId/attribute-values", async (request, reply) => {
    const params = productParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const input = productAttributeValuesReplaceRequestSchema.parse(request.body);
    const result = await service.setProductValues({
      storeId: params.storeId,
      productId: params.productId,
      values: input.values,
    });
    if (!result.ok) return sendServiceError(reply, result.error);
    await recordAudit({
      action: "UPDATE",
      platformUserId: actor.actorUserId,
      storeId: params.storeId,
      entityType: "ProductAttributeValue",
      entityId: params.productId,
      metadata: { count: result.values.length },
    });
    return productAttributeValueListResponseSchema.parse({
      data: result.values.map(serializeProductAttributeValue),
    });
  });

  // ── Varyant attribute degerleri ──
  app.get(
    "/stores/:storeId/products/:productId/variants/:variantId/attribute-values",
    async (request, reply) => {
      const params = variantParam.parse(request.params);
      const actor = await requireStoreAdmin(request, reply, params.storeId);
      if (!actor) return;
      const result = await service.getVariantValues(params.storeId, params.variantId);
      if (!result.ok) return sendServiceError(reply, result.error);
      return variantAttributeValueListResponseSchema.parse({
        data: result.values.map(serializeVariantAttributeValue),
      });
    },
  );

  app.put(
    "/stores/:storeId/products/:productId/variants/:variantId/attribute-values",
    async (request, reply) => {
      const params = variantParam.parse(request.params);
      const actor = await requireStoreAdmin(request, reply, params.storeId);
      if (!actor) return;
      const input = variantAttributeValuesReplaceRequestSchema.parse(request.body);
      const result = await service.setVariantValues({
        storeId: params.storeId,
        variantId: params.variantId,
        values: input.values,
      });
      if (!result.ok) return sendServiceError(reply, result.error);
      await recordAudit({
        action: "UPDATE",
        platformUserId: actor.actorUserId,
        storeId: params.storeId,
        entityType: "VariantAttributeValue",
        entityId: params.variantId,
        metadata: { count: result.values.length },
      });
      return variantAttributeValueListResponseSchema.parse({
        data: result.values.map(serializeVariantAttributeValue),
      });
    },
  );
}
