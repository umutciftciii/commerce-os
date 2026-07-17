/**
 * Faz 2C-2 (ADR-071) — Combination Engine ÖNİZLEME dedike (internal) HTTP ucu.
 *
 * Yalnız OKUMA. Bir ürünün kalıcı varyant eksen reçetesinden "oluşacak kombinasyonlar" önizlemesini
 * döndürür. WRITE ENDPOINT DEĞİLDİR: ProductVariant / combinationKey / SKU OLUŞTURULMAZ. Legacy
 * variant-selections uçları (GET/PUT) BOZULMAZ — bu ayrı bir salt-okunur uçtur.
 *
 * Uç:
 *  GET /stores/:storeId/products/:productId/variant-combinations/preview
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { variantCombinationPreviewResponseSchema } from "@commerce-os/contracts";
import {
  serializeCombinationPreview,
  variantCombinationErrorStatus,
  type VariantCombinationError,
  type VariantCombinationPreviewService,
} from "./service.js";

type Actor = { actorUserId: string };

export interface VariantCombinationRoutesDeps {
  service: VariantCombinationPreviewService;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<Actor | null>;
}

async function sendServiceError(reply: FastifyReply, error: VariantCombinationError) {
  await reply.code(variantCombinationErrorStatus(error.code)).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.totalCombinations !== undefined
        ? { totalCombinations: error.totalCombinations }
        : {}),
      ...(error.limit !== undefined ? { limit: error.limit } : {}),
    },
  });
}

const productParam = z.object({ storeId: z.string().min(1), productId: z.string().min(1) });

export function registerVariantCombinationRoutes(
  app: FastifyInstance,
  deps: VariantCombinationRoutesDeps,
) {
  const { service, requireStoreAdmin } = deps;

  app.get(
    "/stores/:storeId/products/:productId/variant-combinations/preview",
    async (request, reply) => {
      const params = productParam.parse(request.params);
      const actor = await requireStoreAdmin(request, reply, params.storeId);
      if (!actor) return;
      const result = await service.previewCombinations({
        storeId: params.storeId,
        productId: params.productId,
      });
      if (!result.ok) return sendServiceError(reply, result.error);
      return variantCombinationPreviewResponseSchema.parse(
        serializeCombinationPreview(result.preview),
      );
    },
  );
}
