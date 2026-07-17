/**
 * Faz 2C-1 (ADR-070) — Urun-seviyesi varyant EKSEN secimi dedike (internal) HTTP uclari.
 *
 * Urun create-update GOMULU akisi (server.ts) ayni variantSelectionService'i cagirir; bu modul
 * yalniz secimi dogrudan okumak/replace etmek isteyen internal uclari saglar (store-admin dinamik
 * form edit round-trip'i bunu okur). Tum yazimlar service'ten gecer (route Prisma'ya yazmaz). Bu
 * uclar KOMBINASYON URETMEZ — yalniz "eksenler + option'lar" recetesini yonetir.
 *
 * Uclar:
 *  GET  /stores/:storeId/products/:productId/variant-selections
 *  PUT  /stores/:storeId/products/:productId/variant-selections
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  productVariantSelectionListResponseSchema,
  productVariantSelectionsReplaceRequestSchema,
} from "@commerce-os/contracts";
import {
  serializeProductVariantSelection,
  variantSelectionErrorStatus,
  type VariantSelectionError,
  type VariantSelectionService,
} from "./service.js";

type Actor = { actorUserId: string };

export interface VariantSelectionRoutesDeps {
  service: VariantSelectionService;
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

async function sendServiceError(reply: FastifyReply, error: VariantSelectionError) {
  await reply.code(variantSelectionErrorStatus(error.code)).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.attributeDefinitionId ? { attributeDefinitionId: error.attributeDefinitionId } : {}),
    },
  });
}

const productParam = z.object({ storeId: z.string().min(1), productId: z.string().min(1) });

export function registerVariantSelectionRoutes(app: FastifyInstance, deps: VariantSelectionRoutesDeps) {
  const { service, requireStoreAdmin, recordAudit } = deps;

  app.get("/stores/:storeId/products/:productId/variant-selections", async (request, reply) => {
    const params = productParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const result = await service.getSelections(params.storeId, params.productId);
    if (!result.ok) return sendServiceError(reply, result.error);
    return productVariantSelectionListResponseSchema.parse({
      data: result.selections.map(serializeProductVariantSelection),
    });
  });

  app.put("/stores/:storeId/products/:productId/variant-selections", async (request, reply) => {
    const params = productParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const input = productVariantSelectionsReplaceRequestSchema.parse(request.body);
    const result = await service.setSelections({
      storeId: params.storeId,
      productId: params.productId,
      selections: input.selections,
    });
    if (!result.ok) return sendServiceError(reply, result.error);
    await recordAudit({
      action: "UPDATE",
      platformUserId: actor.actorUserId,
      storeId: params.storeId,
      entityType: "ProductVariantAttribute",
      entityId: params.productId,
      metadata: { count: result.selections.length },
    });
    return productVariantSelectionListResponseSchema.parse({
      data: result.selections.map(serializeProductVariantSelection),
    });
  });
}
