// TODO-165 Fashion Vertical (ADR-249) — Store-admin Size Chart uclari.
//
// Guvenlik: tum uclar requireStoreAdmin (platform admin + store scope) ile korunur ve
// bu deps FASHION_VERTICAL capability-gate'li gecirilir (server.ts requireStoreAdminForModule).
// Store izolasyonu: tum sorgular {id, storeId} scoped (cross-store 404). Icerik plain-text
// (zod + servis MARKUP kalkani). Capability kapaliyken 403 MODULE_DISABLED (gate katmani).

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ADMIN_SELECTOR_MAX_IDS,
  adminSizeChartSelectorQuerySchema,
  adminSizeChartSelectorResponseSchema,
  buildAdminListPagination,
  buildSelectorIdsPagination,
  parseSelectorIds,
  resolveAdminListPage,
  sizeChartAssignRequestSchema,
  sizeChartCreateRequestSchema,
  sizeChartListResponseSchema,
  sizeChartResponseSchema,
  sizeChartUpdateRequestSchema,
} from "@commerce-os/contracts";
import { z } from "zod";
import type { StoreAuditActor } from "../store-auth/guard.js";
import {
  SizeChartError,
  sizeChartErrorStatus,
  type SizeChartRecord,
  type SizeChartService,
} from "./size-chart-service.js";

export interface SizeChartRoutesDeps {
  service: SizeChartService;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string; audit: StoreAuditActor } | null>;
  recordAudit: (input: StoreAuditActor & {
    action: "CREATE" | "UPDATE" | "DELETE";
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

const storeParam = z.object({ storeId: z.string().min(1) });
const chartParam = z.object({ storeId: z.string().min(1), id: z.string().min(1) });
const chartAssignmentParam = z.object({
  storeId: z.string().min(1),
  id: z.string().min(1),
  assignmentId: z.string().min(1),
});
const rollbackBody = z.object({ revisionId: z.string().min(1) });

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export function serializeSizeChart(chart: SizeChartRecord) {
  return {
    id: chart.id,
    name: chart.name,
    sizeSystemKey: chart.sizeSystemKey,
    measurementUnit: chart.measurementUnit,
    gender: chart.gender,
    locale: chart.locale,
    status: chart.status,
    publishedRevisionId: chart.publishedRevisionId,
    publishedRevision: chart.publishedRevision
      ? {
          id: chart.publishedRevision.id,
          revision: chart.publishedRevision.revision,
          columns: chart.publishedRevision.columns,
          rows: chart.publishedRevision.rows,
          locale: chart.publishedRevision.locale,
          createdAt: chart.publishedRevision.createdAt.toISOString(),
        }
      : null,
    draftColumns: chart.draftColumns,
    draftRows: chart.draftRows,
    assignments: (chart.assignments ?? []).map((a) => ({
      id: a.id,
      scope: a.scope,
      categoryId: a.categoryId,
      productId: a.productId,
    })),
    createdAt: chart.createdAt.toISOString(),
    updatedAt: chart.updatedAt.toISOString(),
  };
}

export function registerSizeChartRoutes(app: FastifyInstance, deps: SizeChartRoutesDeps) {
  const { service, requireStoreAdmin, recordAudit } = deps;

  async function handle(reply: FastifyReply, fn: () => Promise<unknown>) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof SizeChartError) {
        await reply.code(sizeChartErrorStatus(err.code)).send(errorBody(err.code, err.message));
        return;
      }
      throw err;
    }
  }

  app.get("/stores/:storeId/size-charts", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const charts = await service.list(params.storeId);
    return sizeChartListResponseSchema.parse({ data: charts.map(serializeSizeChart) });
  });

  /**
   * TODO-165A Task 13 (ADR-090 desenini mirror eder) — Beden Tablosu SEÇİCİ ucu.
   * `/selector` STATİK'tir; `/:id` parametreli route'undan ÖNCE register edilir
   * (product/category/brand seçicileriyle AYNI desen — bkz. `server.ts` ürün seçicisi).
   */
  app.get("/stores/:storeId/size-charts/selector", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const query = adminSizeChartSelectorQuerySchema.parse(request.query);

    const serialize = (chart: SizeChartRecord) => {
      const columns = chart.publishedRevision?.columns ?? chart.draftColumns;
      const rows = chart.publishedRevision?.rows ?? chart.draftRows;
      return {
        id: chart.id,
        name: chart.name,
        sizeSystemKey: chart.sizeSystemKey,
        gender: chart.gender,
        measurementUnit: chart.measurementUnit,
        status: chart.status,
        revision: chart.publishedRevision?.revision ?? 0,
        publishedRevisionId: chart.publishedRevisionId,
        previewSummary: `${columns.length} sütun × ${rows.length} satır`,
      };
    };

    if (query.ids !== undefined) {
      const ids = parseSelectorIds(query.ids);
      const resolved = await service.selector(params.storeId, {
        limit: ADMIN_SELECTOR_MAX_IDS,
        offset: 0,
        ids,
      });
      // İstemcinin verdiği SIRA korunur (seçim sırası anlamlıdır).
      const byId = new Map(resolved.data.map((chart) => [chart.id, chart]));
      const ordered = ids
        .map((id) => byId.get(id))
        .filter((chart): chart is SizeChartRecord => chart !== undefined);
      return adminSizeChartSelectorResponseSchema.parse({
        data: ordered.map(serialize),
        pagination: buildSelectorIdsPagination(ordered.length),
      });
    }

    const { page, pageSize, limit, offset } = resolveAdminListPage(query);
    const result = await service.selector(params.storeId, {
      limit,
      offset,
      search: query.search,
      status: query.status,
      // Seçicinin anlamlı varsayılanı alfabetiktir.
      sortBy: query.sortBy ?? "name",
      sortOrder: query.sortOrder ?? "asc",
    });
    return adminSizeChartSelectorResponseSchema.parse({
      data: result.data.map(serialize),
      pagination: buildAdminListPagination({ page, pageSize, totalItems: result.total }),
    });
  });

  app.get("/stores/:storeId/size-charts/:id", async (request, reply) => {
    const params = chartParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    return handle(reply, async () => {
      const chart = await service.get(params.storeId, params.id);
      return sizeChartResponseSchema.parse({ data: serializeSizeChart(chart) });
    });
  });

  app.post("/stores/:storeId/size-charts", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = sizeChartCreateRequestSchema.parse(request.body);
    return handle(reply, async () => {
      const chart = await service.create(params.storeId, body);
      await recordAudit({
        action: "CREATE",
        ...access.audit,
        storeId: params.storeId,
        entityType: "SizeChart",
        entityId: chart.id,
      });
      return reply.code(201).send(sizeChartResponseSchema.parse({ data: serializeSizeChart(chart) }));
    });
  });

  app.patch("/stores/:storeId/size-charts/:id", async (request, reply) => {
    const params = chartParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = sizeChartUpdateRequestSchema.parse(request.body);
    return handle(reply, async () => {
      const chart = await service.update(params.storeId, params.id, body);
      await recordAudit({
        action: "UPDATE",
        ...access.audit,
        storeId: params.storeId,
        entityType: "SizeChart",
        entityId: chart.id,
      });
      return sizeChartResponseSchema.parse({ data: serializeSizeChart(chart) });
    });
  });

  app.post("/stores/:storeId/size-charts/:id/publish", async (request, reply) => {
    const params = chartParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    return handle(reply, async () => {
      const chart = await service.publish(params.storeId, params.id);
      await recordAudit({
        action: "UPDATE",
        ...access.audit,
        storeId: params.storeId,
        entityType: "SizeChart",
        entityId: chart.id,
        metadata: { op: "publish", revisionId: chart.publishedRevisionId },
      });
      return sizeChartResponseSchema.parse({ data: serializeSizeChart(chart) });
    });
  });

  app.post("/stores/:storeId/size-charts/:id/rollback", async (request, reply) => {
    const params = chartParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = rollbackBody.parse(request.body);
    return handle(reply, async () => {
      const chart = await service.rollback(params.storeId, params.id, body.revisionId);
      await recordAudit({
        action: "UPDATE",
        ...access.audit,
        storeId: params.storeId,
        entityType: "SizeChart",
        entityId: chart.id,
        metadata: { op: "rollback", revisionId: body.revisionId },
      });
      return sizeChartResponseSchema.parse({ data: serializeSizeChart(chart) });
    });
  });

  app.post("/stores/:storeId/size-charts/:id/archive", async (request, reply) => {
    const params = chartParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    return handle(reply, async () => {
      const chart = await service.archive(params.storeId, params.id);
      await recordAudit({
        action: "UPDATE",
        ...access.audit,
        storeId: params.storeId,
        entityType: "SizeChart",
        entityId: chart.id,
        metadata: { op: "archive" },
      });
      return sizeChartResponseSchema.parse({ data: serializeSizeChart(chart) });
    });
  });

  app.post("/stores/:storeId/size-charts/:id/assignments", async (request, reply) => {
    const params = chartParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = sizeChartAssignRequestSchema.parse(request.body);
    return handle(reply, async () => {
      await service.assign(params.storeId, params.id, body);
      const chart = await service.get(params.storeId, params.id);
      await recordAudit({
        action: "UPDATE",
        ...access.audit,
        storeId: params.storeId,
        entityType: "SizeChart",
        entityId: params.id,
        metadata: { op: "assign", scope: body.scope },
      });
      return sizeChartResponseSchema.parse({ data: serializeSizeChart(chart) });
    });
  });

  app.delete("/stores/:storeId/size-charts/:id/assignments/:assignmentId", async (request, reply) => {
    const params = chartAssignmentParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    return handle(reply, async () => {
      await service.unassign(params.storeId, params.id, params.assignmentId);
      const chart = await service.get(params.storeId, params.id);
      return sizeChartResponseSchema.parse({ data: serializeSizeChart(chart) });
    });
  });
}
