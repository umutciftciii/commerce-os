// TODO-163 Faz 3 (TD-154 · ADR-215) — Plan → Capability editörü HTTP katmanı (platform-admin).
//
// Enjekte edilen dar deps (findPlan/updatePlanMetadata/countActiveSubscriptions/recordAudit) →
// AppDataAccess'e YENİ metod eklemeden standalone test edilebilir (store-module route deseniyle simetrik).
//   GET  /admin/plans/:id/capabilities          → plan capability matrisi (durum + effective + dependency)
//   POST /admin/plans/:id/capabilities/preview   → önerilen durum haritasının etkisi (uygulamadan)
//   PUT  /admin/plans/:id/capabilities           → doğrula + MERGE (metadata.modules) + audit + cache invalidate
//
// Güvenlik: YALNIZ platform-admin (store-admin kendi planını/capability'sini değiştiremez). Doğrulama
// SAF çekirdekte (core kapatılamaz · bilinmeyen anahtar · invalid dependency). Plan default'u yazmak
// StoreModule override'larına DOKUNMAZ (resolver'da override plan'ı yener) ve veri SİLMEZ.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  planCapabilitiesResponseSchema,
  planCapabilitiesUpdateRequestSchema,
  planCapabilityPreviewResponseSchema,
} from "@commerce-os/contracts";
import {
  derivePlanCapabilityMatrix,
  mergePlanModulesIntoMetadata,
  previewPlanCapabilities,
  type PlanCapabilityStatus,
} from "./plan-capabilities.js";

export interface PlanCapabilityRoutesDeps {
  /** Platform-admin doğrulaması (store-scope YOK; platform-geneli). Yetkisiz → reply gönderir + null. */
  requirePlatformAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<{ actorUserId: string } | null>;
  findPlan: (planId: string) => Promise<{ id: string; metadata: unknown } | null>;
  /** metadata'yı (birleştirilmiş) yazar; güncel planı döner. Plan yoksa null. */
  updatePlanMetadata: (
    planId: string,
    metadata: Record<string, unknown>,
  ) => Promise<{ id: string; metadata: unknown } | null>;
  /** Plana bağlı ACTIVE/TRIALING mağaza sayısı (etki özeti). */
  countActiveSubscriptions: (planId: string) => Promise<number>;
  recordAudit: (input: {
    actorUserId: string;
    planId: string;
    changedModules: string[];
  }) => Promise<void>;
  /** Plan default değişince effective capability tüm mağazalarda değişebilir → cache temizle. */
  invalidateCache?: () => void;
}

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

function parseStatuses(body: unknown):
  | { ok: true; statuses: Record<string, PlanCapabilityStatus> }
  | { ok: false } {
  const parsed = planCapabilitiesUpdateRequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false };
  return { ok: true, statuses: parsed.data.statuses as Record<string, PlanCapabilityStatus> };
}

export function registerPlanCapabilityRoutes(
  app: FastifyInstance,
  deps: PlanCapabilityRoutesDeps,
): void {
  app.get("/admin/plans/:id/capabilities", async (request, reply) => {
    const access = await deps.requirePlatformAdmin(request, reply);
    if (!access) return reply;
    const { id } = request.params as { id: string };
    const plan = await deps.findPlan(id);
    if (!plan) return reply.code(404).send(errorBody("PLAN_NOT_FOUND", "Plan not found."));
    const modules = derivePlanCapabilityMatrix(plan.metadata);
    return reply.send(planCapabilitiesResponseSchema.parse({ data: { planId: plan.id, modules } }));
  });

  app.post("/admin/plans/:id/capabilities/preview", async (request, reply) => {
    const access = await deps.requirePlatformAdmin(request, reply);
    if (!access) return reply;
    const { id } = request.params as { id: string };
    const plan = await deps.findPlan(id);
    if (!plan) return reply.code(404).send(errorBody("PLAN_NOT_FOUND", "Plan not found."));

    const body = parseStatuses(request.body);
    if (!body.ok) {
      return reply.code(400).send(errorBody("INVALID_BODY", "statuses must map module keys to required|optional|unavailable."));
    }
    const preview = previewPlanCapabilities(plan.metadata, body.statuses);
    const subscriberCount = await deps.countActiveSubscriptions(plan.id);
    return reply.send(
      planCapabilityPreviewResponseSchema.parse({ data: { ...preview, subscriberCount } }),
    );
  });

  app.put("/admin/plans/:id/capabilities", async (request, reply) => {
    const access = await deps.requirePlatformAdmin(request, reply);
    if (!access) return reply;
    const { id } = request.params as { id: string };
    const plan = await deps.findPlan(id);
    if (!plan) return reply.code(404).send(errorBody("PLAN_NOT_FOUND", "Plan not found."));

    const body = parseStatuses(request.body);
    if (!body.ok) {
      return reply.code(400).send(errorBody("INVALID_BODY", "statuses must map module keys to required|optional|unavailable."));
    }

    // SAF doğrulama + MERGE (metadata.modules; diğer metadata korunur). Hata → 400 (yazma yok).
    const merged = mergePlanModulesIntoMetadata(plan.metadata, body.statuses);
    if ("errors" in merged) {
      return reply.code(400).send(
        errorBody("INVALID_PLAN_CAPABILITIES", "Plan capability payload is invalid.", { errors: merged.errors }),
      );
    }

    // Etki özeti (audit + response) — hangi modül default'u değişti.
    const preview = previewPlanCapabilities(plan.metadata, body.statuses);

    const updated = await deps.updatePlanMetadata(plan.id, merged.metadata);
    if (!updated) return reply.code(404).send(errorBody("PLAN_NOT_FOUND", "Plan not found."));

    await deps.recordAudit({
      actorUserId: access.actorUserId,
      planId: plan.id,
      changedModules: preview.changedModules,
    });
    // Plan default değişti → effective capability tüm mağazalarda etkilenebilir; cache'i temizle.
    deps.invalidateCache?.();

    const modules = derivePlanCapabilityMatrix(updated.metadata);
    return reply.send(planCapabilitiesResponseSchema.parse({ data: { planId: updated.id, modules } }));
  });
}
