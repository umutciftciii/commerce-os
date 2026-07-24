/**
 * TODO-160A (ADR-109…113) — SKU Generation & Governance · HTTP UÇLARI.
 *
 *  POST /stores/:storeId/products/:productId/sku/preview     (salt-okuma; deterministik öneri + collision)
 *  POST /stores/:storeId/products/:productId/sku/regenerate  (server-authoritative; tek tx + AuditLog)
 *  POST /stores/:storeId/sku/validate                        (manuel override doğrulama + benzersizlik)
 *  GET  /stores/:storeId/sku/audit                           (salt-okuma governance raporu; limitli)
 *
 * Yetki sunucuda (requireStoreAdmin); tenant isolation storeId→store çözümü + tüm sorgularda storeId
 * scope. Regenerate SKU/reindex tetikler (searchText türetimi; ADR-079). Client final SKU otoritesi
 * DEĞİLDİR (regenerate preview'i sunucuda yeniden hesaplar).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  skuAuditResponseSchema,
  skuPreviewResponseSchema,
  skuRegenerateRequestSchema,
  skuRegenerateResponseSchema,
  skuValidateRequestSchema,
  skuValidateResponseSchema,
} from "@commerce-os/contracts";
import {
  skuErrorStatus,
  type SkuAuditResult,
  type SkuError,
  type SkuPreviewResult,
  type SkuRegenerateResult,
  type SkuService,
} from "./service.js";

type Actor = { actorUserId: string };

export interface SkuRoutesDeps {
  service: SkuService;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<Actor | null>;
  // ADR-079 — SKU değişince searchText projeksiyonu etkilenir → reindex.
  onProductChanged?: (storeId: string, productId: string) => void;
}

const productParam = z.object({ storeId: z.string().min(1), productId: z.string().min(1) });
const storeParam = z.object({ storeId: z.string().min(1) });
const auditQuery = z.object({ limit: z.coerce.number().int().min(1).max(1000).optional() });

const DEFAULT_AUDIT_LIMIT = 500;

async function sendServiceError(reply: FastifyReply, error: SkuError) {
  await reply.code(skuErrorStatus(error.code)).send({
    error: { code: error.code, message: error.message },
  });
}

function serializePreview(result: SkuPreviewResult) {
  return { rows: result.rows, counts: result.counts };
}

function serializeRegenerate(result: SkuRegenerateResult) {
  return {
    batchId: result.batchId,
    updated: result.updated,
    skipped: result.skipped,
    rows: result.rows,
  };
}

function serializeAudit(result: SkuAuditResult) {
  return {
    storeId: result.storeId,
    scanned: result.scanned,
    flagged: result.flagged,
    summary: result.summary,
    rows: result.rows,
    truncated: result.truncated,
  };
}

export function registerSkuRoutes(app: FastifyInstance, deps: SkuRoutesDeps) {
  const { service, requireStoreAdmin } = deps;

  app.post("/stores/:storeId/products/:productId/sku/preview", async (request, reply) => {
    const params = productParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const body = skuRegenerateRequestSchema.parse(request.body ?? {});
    const result = await service.preview({
      storeId: params.storeId,
      productId: params.productId,
      force: body.force,
      onlyAutoSource: body.onlyAutoSource,
      variantIds: body.variantIds,
    });
    if (!result.ok) return sendServiceError(reply, result.error);
    return skuPreviewResponseSchema.parse(serializePreview(result.result));
  });

  app.post("/stores/:storeId/products/:productId/sku/regenerate", async (request, reply) => {
    const params = productParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const body = skuRegenerateRequestSchema.parse(request.body ?? {});
    const result = await service.regenerate({
      storeId: params.storeId,
      productId: params.productId,
      actorUserId: actor.actorUserId,
      force: body.force,
      onlyAutoSource: body.onlyAutoSource,
      variantIds: body.variantIds,
    });
    if (!result.ok) return sendServiceError(reply, result.error);
    if (result.result.updated > 0) deps.onProductChanged?.(params.storeId, params.productId);
    return skuRegenerateResponseSchema.parse(serializeRegenerate(result.result));
  });

  app.post("/stores/:storeId/sku/validate", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const body = skuValidateRequestSchema.parse(request.body ?? {});
    const result = await service.validate({
      storeId: params.storeId,
      sku: body.sku,
      variantId: body.variantId,
    });
    return skuValidateResponseSchema.parse(result);
  });

  app.get("/stores/:storeId/sku/audit", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const query = auditQuery.parse(request.query);
    const result = await service.audit({
      storeId: params.storeId,
      limit: query.limit ?? DEFAULT_AUDIT_LIMIT,
    });
    return skuAuditResponseSchema.parse(serializeAudit(result));
  });
}
