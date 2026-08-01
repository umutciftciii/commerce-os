// TODO-163 (ADR-208…ADR-210 · Faz 2 ADR-211…213) — Tenant Module & Capability HTTP katmanı.
//
// Admin (platform-admin + store-scope, tenant-izole):
//   GET  /stores/:storeId/modules                        → effective modül matrisi
//   GET  /stores/:storeId/modules/:moduleKey/disable-preview → DISABLE'ın kapatacağı dependent'lar
//   PUT  /stores/:storeId/modules/:moduleKey              → override (INHERIT/ENABLED/DISABLED[/cascade])
// Public (storefront hot-path):
//   GET  /public/stores/:storeSlug/modules               → moduleKey→boolean projeksiyonu (cache'li)
//
// moduleKey allowlist gateway registry'sine karşı doğrulanır. core → 409 CORE_MODULE_IMMUTABLE.
// Aktif dependent varken DISABLE → 409 DEPENDENTS_ACTIVE (cascade onayı gerekir; sessiz cascade YOK).
// Effective durum YALNIZ sunucuda türetilir; istemci override state DIŞINDA yetki gönderemez.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  publicStoreCapabilitiesResponseSchema,
  storeModuleDisablePreviewResponseSchema,
  storeModulesResponseSchema,
  updateStoreModuleRequestSchema,
  type StoreModuleMatrixEntry,
} from "@commerce-os/contracts";
import type { EffectiveStoreModule, StoreModuleData } from "./data.js";
import type { CapabilityCache } from "./cache.js";
import type { ModuleOverrideState } from "./resolver.js";

const FASHION_VERTICAL_KEY = "FASHION_VERTICAL";

export interface CapabilityRoutesDeps {
  data: StoreModuleData;
  cache: CapabilityCache;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  /** Public projeksiyon için store slug çözümü (yalnız ACTIVE). */
  resolvePublicStore: (slug: string) => Promise<{ id: string; slug: string } | null>;
  /** TODO-164 — modül override değişince bağlı türev cache'leri (ör. tema resolver) geçersiz kıl. */
  onModuleChange?: (storeId: string) => void;
  /**
   * TODO-165A (ADR-165A) Task 10b — FASHION_VERTICAL DISABLED→ENABLED capability-transition
   * hook. Çağrılır YALNIZ override yazımı BAŞARILI olduktan ve bu store için FASHION_VERTICAL
   * effective durumu disabled→enabled kenarını geçtikten SONRA (başka modüllerde ASLA, zaten
   * enabled iken tekrar ENABLED yazılmasında ASLA tetiklenmez). `ensureStoreTaxonomyDefaults`
   * kendisi idempotent'tir (Task 9) ama biz yine de kenar-tetikli çağırırız (brief: gereksiz
   * çağrı yok).
   *
   * FAIL-CLOSED SÖZLEŞMESİ: fırlatırsa, override EN SON bilinen önceki duruma (INHERIT/
   * ENABLED/DISABLED) geri yazılır (compensating write — `upsertStoreModuleOverride` tek
   * başına atomik bir Prisma çağrısıdır, bootstrap'i saran bir $transaction YOKTUR, o yüzden
   * aynı-tx rollback yerine telafi edici yazım kullanılır) ve uç 500 TAXONOMY_BOOTSTRAP_FAILED
   * döner — mağaza ASLA "enabled ama default'suz" sessizce bırakılmaz.
   */
  ensureFashionTaxonomyDefaults?: (storeId: string) => Promise<void>;
  logger?: { warn: (m: string, meta?: Record<string, unknown>) => void };
}

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
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
  const { data, cache } = deps;

  app.get("/stores/:storeId/modules", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await deps.requireStoreAdmin(request, reply, storeId);
    if (!access) return reply;
    const modules = await data.resolveEffective(storeId);
    return reply.send(
      storeModulesResponseSchema.parse({ data: { storeId, modules: modules.map(toMatrixEntry) } }),
    );
  });

  app.get("/stores/:storeId/modules/:moduleKey/disable-preview", async (request, reply) => {
    const { storeId, moduleKey } = request.params as { storeId: string; moduleKey: string };
    const access = await deps.requireStoreAdmin(request, reply, storeId);
    if (!access) return reply;
    const dependents = await data.previewDisable(storeId, moduleKey);
    return reply.send(
      storeModuleDisablePreviewResponseSchema.parse({ data: { moduleKey, dependents } }),
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

    // TODO-165A Task 10b — yazımdan ÖNCE FASHION_VERTICAL'ın effective/override durumunu
    // yakala (yalnız bu modül için; diğer modüllerin PUT'unda ekstra okuma YOK). Bootstrap
    // hatasında EXACT önceki override'a (INHERIT/ENABLED/DISABLED) geri dönebilmek için gerekli
    // — yalnızca satırı silmek (INHERIT varsayımı) önceden explicit DISABLED override'ı olan
    // bir mağazayı yanlışlıkla INHERIT'e taşırdı.
    const isFashionModule = moduleKey === FASHION_VERTICAL_KEY;
    let wasFashionEnabledBefore = false;
    let previousFashionOverrideState: ModuleOverrideState = "INHERIT";
    if (isFashionModule) {
      const before = await data.resolveEffective(storeId);
      const entry = before.find((m) => m.key === FASHION_VERTICAL_KEY);
      wasFashionEnabledBefore = entry?.enabled ?? false;
      previousFashionOverrideState = entry?.overrideState ?? "INHERIT";
    }

    const result = await data.setOverride(storeId, moduleKey, parsed.data.state, access.actorUserId, {
      cascade: parsed.data.cascade,
    });
    if (!result.ok) {
      if (result.reason === "UNKNOWN_MODULE") {
        return reply.code(404).send(errorBody("UNKNOWN_MODULE", `Unknown module: ${moduleKey}`));
      }
      if (result.reason === "CORE_IMMUTABLE") {
        return reply
          .code(409)
          .send(errorBody("CORE_MODULE_IMMUTABLE", `Core module cannot be overridden: ${moduleKey}`));
      }
      // DEPENDENTS_ACTIVE — sessiz cascade yok; explicit onay (cascade:true) gerekir.
      return reply.code(409).send(
        errorBody(
          "DEPENDENTS_ACTIVE",
          `Disabling '${moduleKey}' would also disable active dependents. Retry with cascade to confirm.`,
          { dependents: result.reason === "DEPENDENTS_ACTIVE" ? result.dependents : [] },
        ),
      );
    }

    // TODO-165A Task 10b — FASHION_VERTICAL DISABLED→ENABLED bootstrap (fail-closed).
    // Yalnız gerçek kenarda tetiklenir: önceden effective KAPALIYDI ve yazımdan SONRA
    // effective AÇIK. Başka modüllerde ve "zaten enabled" tekrar-yazımlarında ASLA çalışmaz.
    if (isFashionModule && deps.ensureFashionTaxonomyDefaults) {
      const nowFashionEnabled = await data.isEnabled(storeId, FASHION_VERTICAL_KEY);
      if (!wasFashionEnabledBefore && nowFashionEnabled) {
        try {
          await deps.ensureFashionTaxonomyDefaults(storeId);
        } catch (error) {
          // Fail-closed: aynı-tx rollback mümkün değil (upsertStoreModuleOverride tek başına
          // atomik bir yazım, bootstrap'i saran bir $transaction YOK) — bu yüzden telafi edici
          // yazım (compensating write) ile override EXACT önceki duruma geri alınır ve uç
          // kontrollü bir hata döner; mağaza "enabled ama default'suz" sessizce KALMAZ.
          //
          // BİLİNEN SINIR (reviewer notu, minör): bu bir compare-and-swap DEĞİL, KÖR bir
          // geri-yazımdır — "önceki durumu oku, bootstrap dene, (fail ise) önceki durumu geri
          // yaz" arasında başka bir eşzamanlı PUT araya girip override'ı değiştirmiş olabilir;
          // o durumda bu revert o ARADAKİ yazımın üzerine yazar (dar bir concurrent-duplicate-
          // PUT yarışı — StoreModule şu an satır-seviyesi bir versiyon/updatedAt alanı
          // taşımadığından CAS burada mevcut altyapıyla yapılamaz). Tek-admin-aynı-anda
          // senaryosunda pratik etkisi yok; çoklu eşzamanlı admin PUT'u nadir bir üründür.
          //
          // `cascade: true` burada YALNIZ `previousFashionOverrideState === "DISABLED"` iken
          // anlamlıdır (setOverride'ın DISABLED-guard'ını, aktif dependent kontrolünü atlaması
          // için) — ENABLED/INHERIT'e dönüşte cascade parametresi zaten kullanılmaz (bkz.
          // data.ts `setOverride`), bu yüzden burada koşulsuz geçmek zararsızdır.
          try {
            await data.setOverride(storeId, moduleKey, previousFashionOverrideState, access.actorUserId, {
              cascade: true,
            });
          } catch (revertError) {
            deps.logger?.warn(
              "FASHION_VERTICAL taxonomy bootstrap revert failed after bootstrap error; module may be left enabled without defaults",
              { storeId, error: revertError instanceof Error ? revertError.message : String(revertError) },
            );
          }
          cache.invalidate(storeId);
          deps.onModuleChange?.(storeId);
          deps.logger?.warn(
            "FASHION_VERTICAL enable reverted: ensureStoreTaxonomyDefaults threw",
            { storeId, error: error instanceof Error ? error.message : String(error) },
          );
          return reply
            .code(500)
            .send(
              errorBody(
                "TAXONOMY_BOOTSTRAP_FAILED",
                `Could not bootstrap taxonomy defaults for FASHION_VERTICAL on store ${storeId}; the module was not enabled.`,
              ),
            );
        }
      }
    }

    // Mutation → bu store'un cache'ini geçersiz kıl (admin + public hot-path tutarlılığı).
    cache.invalidate(storeId);
    // TODO-164 — THEME_STUDIO gibi modül değişimi tema resolver projeksiyonunu etkiler;
    // türev cache'i de anında geçersiz kıl (yoksa storefront TTL'e kadar eski temayı verir).
    deps.onModuleChange?.(storeId);

    const modules = await data.resolveEffective(storeId);
    return reply.send(
      storeModulesResponseSchema.parse({ data: { storeId, modules: modules.map(toMatrixEntry) } }),
    );
  });

  // PUBLIC projeksiyon — storefront hot-path. Cache'li; yalnız moduleKey→boolean (source/plan
  // sızmaz). Store yoksa/ACTIVE değilse 404 (tenant leak yok).
  app.get("/public/stores/:storeSlug/modules", async (request, reply) => {
    const { storeSlug } = request.params as { storeSlug: string };
    const store = await deps.resolvePublicStore(storeSlug);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }
    const effective = await cache.getEffective(store.id);
    const modules: Record<string, boolean> = {};
    for (const m of effective) modules[m.key] = m.enabled;
    return reply.send(publicStoreCapabilitiesResponseSchema.parse({ data: { modules } }));
  });
}

/**
 * Enforcement helper: bir modülü gerektiren route'lar için. Store çözümünden SONRA çağrılır.
 * Modül effective KAPALIysa 403 MODULE_DISABLED yollar ve false döner. Cache üzerinden okur
 * (hot-path; N+1 yok). Bilinmeyen key → fail-closed. Tenant bilgisi sızdırmaz.
 */
export function createRequireCapability(cache: CapabilityCache) {
  return async function requireCapability(
    reply: FastifyReply,
    storeId: string,
    moduleKey: string,
  ): Promise<boolean> {
    const enabled = await cache.isEnabled(storeId, moduleKey);
    if (!enabled) {
      reply.code(403).send(errorBody("MODULE_DISABLED", `Module '${moduleKey}' is disabled for this store.`));
      return false;
    }
    return true;
  };
}
