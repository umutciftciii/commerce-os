// TODO-166 (ADR-265) — Admin Slug & Redirect Management store-admin uçları.
//
// Güvenlik: tüm uçlar requireStoreAdmin (platform admin + store scope) ile korunur ve CATALOG
// capability-gate'li geçirilir (server.ts requireStoreAdminForModule("CATALOG")). CATALOG
// core/always-on → SEO yüzeyi her yetkili store-admin için görünür (ayrı capability GEREKMEZ).
// Store izolasyonu: tüm sorgular storeId-scoped (cross-store id → 404). Yeni redirect motoru
// kurulmaz; mevcut Redirect/SlugHistory yönetilir.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  adminRedirectCreateRequestSchema,
  adminRedirectDetailResponseSchema,
  adminRedirectListQuerySchema,
  adminRedirectListResponseSchema,
  adminRedirectResponseSchema,
  adminRedirectUpdateRequestSchema,
  adminSlugDetailResponseSchema,
  adminSlugListQuerySchema,
  adminSlugListResponseSchema,
  buildAdminListPagination,
  resolveAdminListPage,
} from "@commerce-os/contracts";
import { z } from "zod";
import { RedirectError, redirectErrorStatus, type RedirectService } from "./redirect-service.js";
import type {
  RedirectDataAccess,
  SlugEntityTypeValue,
  SlugRecordRow,
  SlugHistoryRow,
} from "./redirect-data.js";

export interface SeoRoutesDeps {
  service: RedirectService;
  data: RedirectDataAccess;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  recordAudit: (input: {
    action: "CREATE" | "UPDATE" | "DELETE";
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

const storeParam = z.object({ storeId: z.string().min(1) });
const redirectParam = z.object({ storeId: z.string().min(1), redirectId: z.string().min(1) });
const slugParam = z.object({
  storeId: z.string().min(1),
  entityType: z.enum(["PRODUCT", "CATEGORY", "BRAND"]),
  entityId: z.string().min(1),
});

function errorBody(code: string, message: string, details?: Record<string, unknown>) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

function serializeSlugRecord(row: SlugRecordRow) {
  return {
    entityType: row.entityType,
    entityId: row.entityId,
    name: row.name,
    slug: row.slug,
    canonicalUrl: row.canonicalUrl,
    status: row.status,
    previousSlugCount: row.previousSlugCount,
    redirectCount: row.redirectCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeHistory(row: SlugHistoryRow) {
  return { oldSlug: row.oldSlug, oldPath: row.oldPath, createdAt: row.createdAt.toISOString() };
}

export function registerSeoRoutes(app: FastifyInstance, deps: SeoRoutesDeps) {
  const { service, data, requireStoreAdmin, recordAudit } = deps;

  async function handle(reply: FastifyReply, fn: () => Promise<unknown>) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof RedirectError) {
        await reply.code(redirectErrorStatus(err.code)).send(errorBody(err.code, err.message, err.details));
        return;
      }
      throw err;
    }
  }

  // ---- Redirect'ler ---------------------------------------------------------

  app.get("/stores/:storeId/seo/redirects", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const query = adminRedirectListQuerySchema.parse(request.query);
    const { page, pageSize, limit, offset } = resolveAdminListPage(query);
    const result = await service.list(params.storeId, {
      limit,
      offset,
      search: query.search,
      origin: query.origin,
      type: query.type,
      // entityType türetilmiş; veri katmanı kaynak-path deseniyle DB'de filtreler (sayfalama-doğru).
      entityType: query.entityType,
      enabled: query.enabled === undefined ? undefined : query.enabled === "true",
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    return adminRedirectListResponseSchema.parse({
      data: result.data,
      pagination: buildAdminListPagination({ page, pageSize, totalItems: result.total }),
    });
  });

  app.post("/stores/:storeId/seo/redirects", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = adminRedirectCreateRequestSchema.parse(request.body);
    return handle(reply, async () => {
      const record = await service.create(params.storeId, body);
      await recordAudit({
        action: "CREATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Redirect",
        entityId: record.id,
        metadata: { origin: "MANUAL", sourcePath: record.sourcePath },
      });
      return reply.code(201).send(adminRedirectResponseSchema.parse({ data: record }));
    });
  });

  app.get("/stores/:storeId/seo/redirects/:redirectId", async (request, reply) => {
    const params = redirectParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    return handle(reply, async () => {
      const detail = await service.getDetail(params.storeId, params.redirectId);
      return adminRedirectDetailResponseSchema.parse({ data: detail });
    });
  });

  app.patch("/stores/:storeId/seo/redirects/:redirectId", async (request, reply) => {
    const params = redirectParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = adminRedirectUpdateRequestSchema.parse(request.body);
    return handle(reply, async () => {
      const record = await service.update(params.storeId, params.redirectId, body);
      await recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Redirect",
        entityId: record.id,
      });
      return adminRedirectResponseSchema.parse({ data: record });
    });
  });

  app.delete("/stores/:storeId/seo/redirects/:redirectId", async (request, reply) => {
    const params = redirectParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    return handle(reply, async () => {
      await service.remove(params.storeId, params.redirectId);
      await recordAudit({
        action: "DELETE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Redirect",
        entityId: params.redirectId,
      });
      return reply.code(204).send();
    });
  });

  // ---- Slug'lar (ürün/kategori/marka projeksiyonu) --------------------------

  app.get("/stores/:storeId/seo/slugs", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const query = adminSlugListQuerySchema.parse(request.query);
    const { page, pageSize, limit, offset } = resolveAdminListPage(query);
    const result = await data.listSlugRecords(params.storeId, {
      limit,
      offset,
      search: query.search,
      entityType: query.entityType,
      status: query.status,
      hasRedirects: query.hasRedirects === undefined ? undefined : query.hasRedirects === "true",
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    return adminSlugListResponseSchema.parse({
      data: result.data.map(serializeSlugRecord),
      pagination: buildAdminListPagination({ page, pageSize, totalItems: result.total }),
    });
  });

  app.get("/stores/:storeId/seo/slugs/:entityType/:entityId", async (request, reply) => {
    const params = slugParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    return handle(reply, async () => {
      const record = await data.getSlugRecord(
        params.storeId,
        params.entityType as SlugEntityTypeValue,
        params.entityId,
      );
      if (!record) {
        return reply.code(404).send(errorBody("SLUG_ENTITY_NOT_FOUND", "Slug entity not found."));
      }
      const history = await data.slugHistory(
        params.storeId,
        params.entityType as SlugEntityTypeValue,
        params.entityId,
      );
      return adminSlugDetailResponseSchema.parse({
        data: { ...serializeSlugRecord(record), history: history.map(serializeHistory) },
      });
    });
  });
}
