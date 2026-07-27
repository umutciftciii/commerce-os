/**
 * TD-131 (ADR-149…155) — Customer Data Erasure HTTP uçları (store-admin).
 *
 * Guard: requireStorePlatformAdmin (server.ts'ten enjekte). storeId path'ten alınır
 * ama guard mağaza erişimini doğrular; tüm sorgular storeId+customerId scoped
 * (cross-store yapısal olarak imkânsız → bulunamayan müşteri 404). PII response'a
 * çıkmaz (yalnız sayaç + alan adları + durum).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  storeAdminCustomerDeactivateResponseSchema,
  storeAdminCustomerErasureApplyRequestSchema,
  storeAdminCustomerErasureApplyResponseSchema,
  storeAdminCustomerErasurePreviewResponseSchema,
  storeAdminCustomerErasureStatusResponseSchema,
} from "@commerce-os/contracts";
import { ANONYMIZED_CUSTOMER_FIELDS, totalDeleted } from "./core.js";
import type { CustomerErasureData } from "./data.js";
import type { CustomerErasureService } from "./service.js";

export interface CustomerErasureRoutesDeps {
  service: CustomerErasureService;
  data: CustomerErasureData;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
}

interface Params {
  storeId: string;
  customerId: string;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export function registerCustomerErasureRoutes(app: FastifyInstance, deps: CustomerErasureRoutesDeps): void {
  const { service, data, requireStoreAdmin } = deps;

  function params(request: FastifyRequest): Params {
    return request.params as Params;
  }

  // --- Erasure status (opsiyonel; UI durum rozeti) --------------------------
  app.get("/stores/:storeId/customers/:customerId/erasure/status", async (request, reply) => {
    const { storeId, customerId } = params(request);
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const state = await data.findState(storeId, customerId);
    if (!state) {
      return reply.code(404).send(errorBody("CUSTOMER_NOT_FOUND", "Müşteri bulunamadı."));
    }
    return storeAdminCustomerErasureStatusResponseSchema.parse({
      customerId,
      status: state.status,
      erased: state.status === "ERASED",
      erasedAt: state.erasedAt?.toISOString() ?? null,
      erasedByUserId: state.erasedByUserId,
      eraseReason: state.eraseReason,
    });
  });

  // --- Erasure dry-run (YAZMA YOK) ------------------------------------------
  app.post("/stores/:storeId/customers/:customerId/erasure/preview", async (request, reply) => {
    const { storeId, customerId } = params(request);
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const result = await service.preview(storeId, customerId, access.actorUserId);
    if (result.kind === "NOT_FOUND") {
      return reply.code(404).send(errorBody("CUSTOMER_NOT_FOUND", "Müşteri bulunamadı."));
    }
    const r = result.report;
    const warnings: string[] = [];
    if (r.status === "ERASED") warnings.push("ALREADY_ERASED");
    if (r.activeSessionCount > 0) warnings.push("ACTIVE_SESSIONS");
    if (r.openOrderCount > 0) warnings.push("OPEN_ORDERS");
    return storeAdminCustomerErasurePreviewResponseSchema.parse({
      customerId,
      status: r.status,
      alreadyErased: r.status === "ERASED",
      erasedAt: r.erasedAt?.toISOString() ?? null,
      confirmationPhrase: r.confirmationPhrase,
      activeSessionCount: r.activeSessionCount,
      openOrderCount: r.openOrderCount,
      delete: r.deleteCounts,
      deleteTotal: totalDeleted(r.deleteCounts),
      anonymize: r.anonymizeCounts,
      preserve: r.preserveCounts,
      reviewsAnonymized: r.reviewAnonymizeCount,
      anonymizedCustomerFields: [...ANONYMIZED_CUSTOMER_FIELDS],
      warnings,
    });
  });

  // --- Erasure apply (geri alınamaz) ----------------------------------------
  app.post("/stores/:storeId/customers/:customerId/erasure/apply", async (request, reply) => {
    const { storeId, customerId } = params(request);
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const body = storeAdminCustomerErasureApplyRequestSchema.parse(request.body);
    const result = await service.apply(storeId, customerId, {
      actorUserId: access.actorUserId,
      reason: body.reason,
      confirmationPhrase: body.confirmationPhrase,
    });

    switch (result.kind) {
      case "CONFIRMATION_REQUIRED":
        return reply
          .code(400)
          .send(errorBody("CONFIRMATION_REQUIRED", "Onay ifadesini birebir yazmanız gerekir."));
      case "REASON_REQUIRED":
        return reply.code(400).send(errorBody("REASON_REQUIRED", "Silme nedeni zorunlu."));
      case "IN_PROGRESS":
        return reply
          .code(409)
          .send(errorBody("ERASURE_IN_PROGRESS", "Bu müşteri için silme işlemi zaten sürüyor."));
      case "NOT_FOUND":
        return reply.code(404).send(errorBody("CUSTOMER_NOT_FOUND", "Müşteri bulunamadı."));
      case "ALREADY_ERASED":
        return reply
          .code(409)
          .send(errorBody("CUSTOMER_ALREADY_ERASED", "Bu müşterinin kişisel verileri zaten silinmiş."));
      case "ERASED": {
        const e = result.result;
        return storeAdminCustomerErasureApplyResponseSchema.parse({
          customerId,
          status: "ERASED",
          erasedAt: e.erasedAt.toISOString(),
          alreadyErased: false,
          deleted: e.deleted,
          deleteTotal: totalDeleted(e.deleted),
          anonymized: e.anonymized,
          reviewsAnonymized: e.reviewAnonymizeCount,
        });
      }
    }
  });

  // --- Deactivate (PASSIVE + oturumları sonlandır; geri alınabilir) ----------
  app.post("/stores/:storeId/customers/:customerId/deactivate", async (request, reply) => {
    const { storeId, customerId } = params(request);
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const result = await service.deactivate(storeId, customerId, access.actorUserId);
    if (result.kind === "NOT_FOUND") {
      return reply.code(404).send(errorBody("CUSTOMER_NOT_FOUND", "Müşteri bulunamadı."));
    }
    if (result.kind === "ALREADY_ERASED") {
      return reply
        .code(409)
        .send(errorBody("CUSTOMER_ALREADY_ERASED", "Silinmiş müşteri pasifleştirilemez."));
    }
    return storeAdminCustomerDeactivateResponseSchema.parse({
      customerId,
      status: "PASSIVE",
      revokedCount: result.revokedCount,
    });
  });
}
