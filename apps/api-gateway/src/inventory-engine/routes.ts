/**
 * TODO-152 (ADR-076) — Inventory Engine · HTTP UÇLARI.
 *
 *  GET  /stores/:storeId/warehouses                                       → depo listesi
 *  GET  /stores/:storeId/products/:productId/inventory[?warehouseId=]     → matris okuma (current)
 *  POST /stores/:storeId/products/:productId/inventory/preview            → rule/direct-edit önizleme
 *  POST /stores/:storeId/products/:productId/inventory/apply             → server-authoritative apply
 *
 * Preview salt-okuma + deterministik; apply tek transaction + advisory-lock + stale-guard. Yetki
 * sunucuda (requireStoreAdmin). Hatalar STABIL kodla döner. Commercial/identity/generation uçları
 * BOZULMAZ; bu ayrı stok katmanıdır.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  inventoryApplyRequestSchema,
  inventoryApplyResponseSchema,
  inventoryPreviewRequestSchema,
  inventoryPreviewResponseSchema,
  inventoryStoreMatrixResponseSchema,
  inventoryWarehouseListResponseSchema,
} from "@commerce-os/contracts";
import {
  inventoryErrorStatus,
  type InventoryError,
  type InventoryPreviewResult,
  type InventoryService,
} from "./service.js";

type Actor = { actorUserId: string };

export interface InventoryRoutesDeps {
  service: InventoryService;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<Actor | null>;
  // TODO-154 (ADR-079) — stok apply sonrası search read-model'i tetikler (opsiyonel; fire-and-forget).
  onProductChanged?: (storeId: string, productId: string) => void;
}

const storeParam = z.object({ storeId: z.string().min(1) });
const productParam = z.object({ storeId: z.string().min(1), productId: z.string().min(1) });
const warehouseQuery = z.object({ warehouseId: z.string().min(1).optional() });

function serializePreview(result: InventoryPreviewResult) {
  return {
    fingerprint: result.fingerprint,
    source: result.source,
    warehouse: result.warehouse,
    blocked: result.blocked,
    rows: result.rows,
    summary: result.summary,
  };
}

async function sendServiceError(reply: FastifyReply, error: InventoryError) {
  await reply.code(inventoryErrorStatus(error.code)).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.detail !== undefined ? { detail: error.detail } : {}),
    },
  });
}

export function registerInventoryRoutes(app: FastifyInstance, deps: InventoryRoutesDeps) {
  const { service, requireStoreAdmin } = deps;

  app.get("/stores/:storeId/warehouses", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const result = await service.listWarehouses(params.storeId);
    if (!result.ok) return sendServiceError(reply, result.error);
    return inventoryWarehouseListResponseSchema.parse({ data: result.warehouses });
  });

  // TODO-152A — Mağaza-geneli SALT-OKUMA matris (izleme/operasyon merkezi). Yazma YOK.
  app.get("/stores/:storeId/inventory/matrix", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const query = warehouseQuery.parse(request.query ?? {});
    const result = await service.storeMatrix({ storeId: params.storeId, warehouseId: query.warehouseId });
    if (!result.ok) return sendServiceError(reply, result.error);
    return inventoryStoreMatrixResponseSchema.parse({
      warehouse: result.result.warehouse,
      rows: result.result.rows,
    });
  });

  app.get("/stores/:storeId/products/:productId/inventory", async (request, reply) => {
    const params = productParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const query = warehouseQuery.parse(request.query ?? {});
    const result = await service.matrix({
      storeId: params.storeId,
      productId: params.productId,
      warehouseId: query.warehouseId,
    });
    if (!result.ok) return sendServiceError(reply, result.error);
    return inventoryPreviewResponseSchema.parse(serializePreview(result.result));
  });

  app.post("/stores/:storeId/products/:productId/inventory/preview", async (request, reply) => {
    const params = productParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const body = inventoryPreviewRequestSchema.parse(request.body ?? {});
    const result = await service.preview({
      storeId: params.storeId,
      productId: params.productId,
      warehouseId: body.warehouseId,
      rule: body.rule,
      edits: body.edits,
      selectedVariantIds: body.selectedVariantIds,
    });
    if (!result.ok) return sendServiceError(reply, result.error);
    return inventoryPreviewResponseSchema.parse(serializePreview(result.result));
  });

  app.post("/stores/:storeId/products/:productId/inventory/apply", async (request, reply) => {
    const params = productParam.parse(request.params);
    const actor = await requireStoreAdmin(request, reply, params.storeId);
    if (!actor) return;
    const body = inventoryApplyRequestSchema.parse(request.body ?? {});
    const result = await service.apply({
      storeId: params.storeId,
      productId: params.productId,
      actorUserId: actor.actorUserId,
      warehouseId: body.warehouseId,
      baseFingerprint: body.baseFingerprint,
      reason: body.reason,
      rule: body.rule,
      edits: body.edits,
      selectedVariantIds: body.selectedVariantIds,
    });
    if (!result.ok) return sendServiceError(reply, result.error);
    // TODO-154 (ADR-079) — stok değişti → hasStock/availability yeniden türetilsin.
    deps.onProductChanged?.(params.storeId, params.productId);
    return inventoryApplyResponseSchema.parse({
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
