/**
 * Faz 2C-3 (ADR-072) — ProductVariant üretim (persistence) WRITE ucu.
 *
 *  POST /stores/:storeId/products/:productId/variant-combinations/generate
 *
 * İstek gövdesizdir: authoritative kaynak DB'deki kalıcı variant selection reçetesidir. Reçeteden
 * hedef kombinasyonlar üretilir ve mevcut varyantlarla diff'lenerek create/keep/restore/archive
 * uygulanır (tek transaction). Preview ucu (GET .../preview) BOZULMAZ; bu ayrı bir write ucudur.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { variantGenerationResponseSchema } from "@commerce-os/contracts";
import {
  serializeGenerationSummary,
  variantGenerationErrorStatus,
  type VariantGenerationError,
  type VariantGenerationService,
} from "./service.js";

type Actor = { actorUserId: string };

export interface VariantGenerationRoutesDeps {
  service: VariantGenerationService;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<Actor | null>;
  // TODO-154 (ADR-079) — kombinasyon üretimi varyantları değiştirir → search read-model'i tetikler.
  onProductChanged?: (storeId: string, productId: string) => void;
}

async function sendServiceError(reply: FastifyReply, error: VariantGenerationError) {
  await reply.code(variantGenerationErrorStatus(error.code)).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.totalCombinations !== undefined ? { totalCombinations: error.totalCombinations } : {}),
      ...(error.limit !== undefined ? { limit: error.limit } : {}),
    },
  });
}

const productParam = z.object({ storeId: z.string().min(1), productId: z.string().min(1) });

export function registerVariantGenerationRoutes(
  app: FastifyInstance,
  deps: VariantGenerationRoutesDeps,
) {
  const { service, requireStoreAdmin } = deps;

  app.post(
    "/stores/:storeId/products/:productId/variant-combinations/generate",
    async (request, reply) => {
      const params = productParam.parse(request.params);
      const actor = await requireStoreAdmin(request, reply, params.storeId);
      if (!actor) return;
      const result = await service.generate({
        storeId: params.storeId,
        productId: params.productId,
      });
      if (!result.ok) return sendServiceError(reply, result.error);
      // TODO-154 (ADR-079) — varyantlar üretildi/arşivlendi → ürün dokümanı/facet'lerini yenile.
      deps.onProductChanged?.(params.storeId, params.productId);
      return variantGenerationResponseSchema.parse(serializeGenerationSummary(result.summary));
    },
  );
}
