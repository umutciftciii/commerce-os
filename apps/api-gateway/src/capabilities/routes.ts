// TODO-163 (ADR-208…ADR-210) — Tenant Module & Capability HTTP route katmanı.
//
// Admin uçları (platform-admin + store-scope, tenant-izole):
//   GET  /stores/:storeId/modules            → effective modül matrisi
//   PUT  /stores/:storeId/modules/:moduleKey  → açık override set (INHERIT/ENABLED/DISABLED)
//
// moduleKey allowlist gateway registry'sine karşı doğrulanır (serbest string DEĞİL). core
// modüller override edilemez (409 CORE_MODULE_IMMUTABLE). Effective durum + source YALNIZ
// sunucuda türetilir; istemci override state DIŞINDA hiçbir yetki gönderemez.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  storeModulesResponseSchema,
  updateStoreModuleRequestSchema,
  type StoreModuleMatrixEntry,
} from "@commerce-os/contracts";
import type { EffectiveStoreModule, StoreModuleData } from "./data.js";

export interface CapabilityRoutesDeps {
  data: StoreModuleData;
  /** Admin guard (platform SUPER_ADMIN/SUPPORT_ADMIN + store scope). null → guard yanıtladı. */
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  logger?: { warn: (m: string, meta?: Record<string, unknown>) => void };
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

function toMatrixEntry(m: EffectiveStoreModule): StoreModuleMatrixEntry {
  return {
    key: m.key,
    group: m.group,
    labelTr: m.labelTr,
    labelEn: m.labelEn,
    descriptionTr: m.descriptionTr,
    core: m.core,
    effectiveEnabled: m.enabled,
    source: m.source,
    overrideState: m.overrideState,
    blockedBy: m.blockedBy ?? null,
  };
}

export function registerCapabilityRoutes(app: FastifyInstance, deps: CapabilityRoutesDeps): void {
  const { data } = deps;

  app.get("/stores/:storeId/modules", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await deps.requireStoreAdmin(request, reply, storeId);
    if (!access) return reply;

    const modules = await data.resolveEffective(storeId);
    return reply.send(
      storeModulesResponseSchema.parse({
        data: { storeId, modules: modules.map(toMatrixEntry) },
      }),
    );
  });

  app.put("/stores/:storeId/modules/:moduleKey", async (request, reply) => {
    const { storeId, moduleKey } = request.params as { storeId: string; moduleKey: string };
    const access = await deps.requireStoreAdmin(request, reply, storeId);
    if (!access) return reply;

    const parsed = updateStoreModuleRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(errorBody("INVALID_BODY", "state must be INHERIT|ENABLED|DISABLED."));
    }

    const result = await data.setOverride(storeId, moduleKey, parsed.data.state, access.actorUserId);
    if (!result.ok) {
      if (result.reason === "UNKNOWN_MODULE") {
        return reply.code(404).send(errorBody("UNKNOWN_MODULE", `Unknown module: ${moduleKey}`));
      }
      // CORE_IMMUTABLE
      return reply
        .code(409)
        .send(errorBody("CORE_MODULE_IMMUTABLE", `Core module cannot be overridden: ${moduleKey}`));
    }

    const modules = await data.resolveEffective(storeId);
    return reply.send(
      storeModulesResponseSchema.parse({
        data: { storeId, modules: modules.map(toMatrixEntry) },
      }),
    );
  });
}

/**
 * Enforcement helper: bir modülü gerektiren route'lar için. requireStorePlatformAdmin (veya
 * public store çözümü) SONRASINDA çağrılır. Modül effective KAPALIysa 403 CAPABILITY_DISABLED
 * yollar ve false döner (route erken çıkmalı). Bilinmeyen key → fail-closed (kapalı sayılır).
 */
export function createRequireCapability(data: StoreModuleData) {
  return async function requireCapability(
    reply: FastifyReply,
    storeId: string,
    moduleKey: string,
  ): Promise<boolean> {
    const enabled = await data.isEnabled(storeId, moduleKey);
    if (!enabled) {
      reply
        .code(403)
        .send(errorBody("CAPABILITY_DISABLED", `Module '${moduleKey}' is disabled for this store.`));
      return false;
    }
    return true;
  };
}
