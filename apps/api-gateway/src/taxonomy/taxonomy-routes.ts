// TODO-165A (ADR-165A) — Task 10: Governed Product Taxonomy HTTP uclari.
//
// Guvenlik: tum uclar requireStoreAdmin (platform admin + store scope) ile korunur ve
// FASHION_VERTICAL capability-gate'li gecirilir (server.ts requireStoreAdminForModule).
// FASHION_VERTICAL opt-in (baselineEnabled=false) → kapaliyken 403 MODULE_DISABLED (gate
// katmani, bu dosyada YOK). Tenant izolasyonu servis katmanindan gelir (TAXONOMY_CROSS_STORE
// → 403; TAXONOMY_NOT_FOUND → 404).
//
// LAZY BOOTSTRAP KARARI (Task 10 → Task 10b ilk tur → Task 10b reviewer düzeltmesi):
// Task 10 BILEREK list/create'e lazy bootstrap eklemedi (performans + o zamanki regresyon
// testleri gerekcesiyle). Task 10b'nin ilk turu da ayni gerekceyle bunu eklemedi CUNKU
// birincil (ve o an TEK sanılan) bootstrap noktasi capability-transition hook'uydu
// (`capabilities/routes.ts`, `ensureFashionTaxonomyDefaults` — store-level DISABLED→ENABLED
// override PUT'unda tetiklenir).
//
// REVIEWER'IN BULDUGU MISSED-FIRE: `PUT /admin/plans/:id/capabilities` (plan-routes.ts) plan
// default'unu degistirerek, override'i INHERIT olan (hic dokunulmamis) TUM magazalarda
// FASHION_VERTICAL'i effective ENABLED'a çevirebilir — store-level PUT hic calismadigindan
// bu yol capability-transition hook'unu TAMAMEN BYPASS eder. Bu magazalar "enabled ama
// default'suz" kalirdi (ADR-165A invariant ihlali). Eager per-store fail-closed bootstrap'i
// plan-wide bu PUT'a baglamak PRATIK DEGIL (bir plana bagli COK SAYIDA magaza + kismi hata
// semantigi: bir magaza bootstrap'i patlarsa plan degisikligi geri mi alinir, digerleri nasil
// etkilenir — bkz. plan-routes.ts'teki TECH DEBT notu). Bunun yerine BURADA (GET list) LAZY
// idempotent bir "safety net" eklenir:
//   - Bu route ZATEN FASHION_VERTICAL capability-gate'li (`requireStoreAdminForModule`) — bu
//     handler'a ulasilmasi capability'nin ACIK oldugunu KANITLAR, yani bootstrap HER ZAMAN
//     guvenlidir (kapaliyken hic cagrilmaz).
//   - `ensureStoreTaxonomyDefaults` idempotent'tir (Task 9) — zaten dolu magazada no-op
//     (yalniz `findBySlug` taramasi; ekstra yazim yok).
//   - Bu, YALNIZ plan-level yolu degil, capability'nin ACILDIGI HERHANGI BIR yolu (bugun
//     store-level + plan-level; yarin baska bir yol eklenirse onu da) kendi-kendini-iyilestiren
//     (self-healing) sekilde kapatir — ilk sözlük erisiminde bootstrap garanti calisir.
//   - Performans: `list` zaten mevcut degerleri okumak icin bir tarama yapiyordu; bootstrap'in
//     ek `findBySlug` taramasi (tip basina ~50) kabul edilebilir bir tek-seferlik maliyet
//     (ilk cagridan SONRA hepsi mevcut → sonraki her cagri no-op'tur, sadece platform tanim
//     lookup + no-op findBySlug taramasi kalir).
//
// Store-level eager fail-closed hook (`capabilities/routes.ts`) OLDUGU GIBI KALIR — o hala
// birincil, senkron, hata-kontrollu yoldur (store-level PUT'ta bootstrap patlarsa PUT
// BASARISIZ olur ve override geri alinir). Bu lazy net SADECE onun bypass edildigi yollar
// icin bir GUVENLIK AGIDIR (defense-in-depth), onun yerine gecmez.
//
// TEST NOTU: bu degisiklik, bir magaza icin FASHION_VERTICAL acikken YAPILAN ILK `GET list`
// cagrisinin store+tum-tipler icin kanonik degerleri de dondurecegi anlamina gelir — mevcut
// `taxonomy-routes.test.ts` testleri bunu yansitacak sekilde guncellendi (bkz. o dosyanin
// basindaki not).
//
// REORDER TAM-KUME KURALI: `productTaxonomyReorderRequestSchema` artik `type` tasir (Task 10
// contract eklentisi). Taxonomy servisi `reorder(storeId, type, orderedIds)` her id'nin
// store+type'a ait oldugunu dogrular ama KISMI kume (bir alt kumeyi sessizce yeniden
// siralayip digerlerini oldugu gibi birakma) reddetmez — bu, "sirali" olmayan bir kalinti
// birakabilir. Route katmani bu yuzden `orderedIds`'in store+type icin TUM ACTIVE degerleri
// (ne eksik ne fazla) kapsadigini dogrular; kismi kume → 400 TAXONOMY_REORDER_INCOMPLETE.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  buildAdminListPagination,
  productTaxonomyCreateRequestSchema,
  productTaxonomyListResponseSchema,
  productTaxonomyQuerySchema,
  productTaxonomyReorderRequestSchema,
  productTaxonomyResponseSchema,
  productTaxonomyUpdateRequestSchema,
  resolveAdminListPage,
} from "@commerce-os/contracts";
import { z } from "zod";
import type { StoreAuditActor } from "../store-auth/guard.js";
import { TaxonomyError, taxonomyErrorStatus, type TaxonomyService } from "./taxonomy-service.js";
import type { TaxonomyValueRecord } from "./taxonomy-data.js";

export interface TaxonomyRoutesDeps {
  service: TaxonomyService;
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
const valueParam = z.object({ storeId: z.string().min(1), valueId: z.string().min(1) });

function errorBody(code: string, message: string, details?: Record<string, unknown>) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

// Task 24 — `usageCount` (kaç ürün/varyant ataması bu değeri kullanıyor) EKLENDİ. Liste ucu
// TOPLU (`service.usageCountForOptions`, tek turda N item) hesaplar (N+1 YOK); tekil
// mutasyon uçları (create/get/patch/archive/restore) tek elemanlı toplu çağrı kullanır (aynı
// kod yolu, ekstra dallanma yok). `create()` her zaman TAZE bir AttributeOption ürettiğinden
// (bkz. taxonomy-service.ts) yeni oluşan kayıt asla önceden kullanımda olamaz — orada 0 sabitlenir
// (gereksiz sorgu atlanır).
export function serializeTaxonomyValue(value: TaxonomyValueRecord, usageCount: number) {
  return {
    id: value.id,
    storeId: value.storeId,
    type: value.type,
    name: value.name,
    slug: value.slug,
    status: value.status,
    displayOrder: value.displayOrder,
    metadata: value.metadata,
    parentId: value.parentId,
    attributeOptionId: value.attributeOptionId,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
    usageCount,
  };
}

/** Tek kayit icin usageCount cozer (tekil mutasyon uclari — get/create/patch/archive/restore). */
async function resolveUsageCount(service: TaxonomyService, value: TaxonomyValueRecord): Promise<number> {
  const map = await service.usageCountForOptions([value.attributeOptionId]);
  return map[value.attributeOptionId] ?? 0;
}

export function registerTaxonomyRoutes(app: FastifyInstance, deps: TaxonomyRoutesDeps) {
  const { service, requireStoreAdmin, recordAudit } = deps;

  async function handle(reply: FastifyReply, fn: () => Promise<unknown>) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof TaxonomyError) {
        await reply.code(taxonomyErrorStatus(err.code)).send(errorBody(err.code, err.message, err.details));
        return;
      }
      throw err;
    }
  }

  // ─────────────────────────── GET list (static; before /:valueId) ───────────────────────────
  app.get("/stores/:storeId/product-taxonomy", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const query = productTaxonomyQuerySchema.parse(request.query);

    return handle(reply, async () => {
      // TODO-165A Task 10b (reviewer follow-up) — LAZY idempotent safety-net (bkz. dosya
      // basi not). Bu handler'a ulasilmasi FASHION_VERTICAL'in ACIK oldugunu kanitlar
      // (`requireStoreAdmin` yukarida capability-gate'li), yani bootstrap HER ZAMAN guvenli.
      // Store-level PUT'un (capabilities/routes.ts) BYPASS edildigi yollari (ör. plan-level
      // `PUT /admin/plans/:id/capabilities`) kendi-kendini-iyilestiren sekilde kapatir.
      await service.ensureStoreTaxonomyDefaults(params.storeId);
      const all = await service.list(params.storeId, query.type);
      const filtered = all.filter((v) => {
        if (query.status && v.status !== query.status) return false;
        if (query.search) {
          const needle = query.search.toLowerCase();
          if (!v.name.toLowerCase().includes(needle) && !v.slug.toLowerCase().includes(needle)) return false;
        }
        return true;
      });
      const { page, pageSize, limit, offset } = resolveAdminListPage(query);
      const pageItems = filtered.slice(offset, offset + limit);
      // Task 24 — TOPLU usageCount: sayfa basina TEK tur (N+1 YOK), sayfalanmamis `filtered`
      // veya `all` DEGIL yalniz `pageItems` icin (gorunmeyen satirlar icin sorgu israf edilmez).
      const usageMap = await service.usageCountForOptions(pageItems.map((v) => v.attributeOptionId));
      return productTaxonomyListResponseSchema.parse({
        data: pageItems.map((v) => serializeTaxonomyValue(v, usageMap[v.attributeOptionId] ?? 0)),
        pagination: buildAdminListPagination({ page, pageSize, totalItems: filtered.length }),
      });
    });
  });

  // ─────────────────────────── POST create (quick-create) ───────────────────────────
  app.post("/stores/:storeId/product-taxonomy", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = productTaxonomyCreateRequestSchema.parse(request.body);

    return handle(reply, async () => {
      const created = await service.create(params.storeId, body);
      await recordAudit({
        action: "CREATE",
        ...access.audit,
        storeId: params.storeId,
        entityType: "ProductTaxonomyValue",
        entityId: created.id,
        metadata: { type: created.type },
      });
      // Task 24 — yeni olusturulan deger HER ZAMAN TAZE bir AttributeOption'a baglanir
      // (taxonomy-service.ts create()), bu yuzden onceden hicbir atama olamaz: usageCount
      // sorgusuz 0 sabitlenir.
      return reply
        .code(201)
        .send(productTaxonomyResponseSchema.parse({ data: serializeTaxonomyValue(created, 0) }));
    });
  });

  // ─────────────────────────── POST reorder (static; before /:valueId) ───────────────────────────
  app.post("/stores/:storeId/product-taxonomy/reorder", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = productTaxonomyReorderRequestSchema.parse(request.body);

    return handle(reply, async () => {
      const existing = await service.list(params.storeId, body.type);
      const activeIds = existing.filter((v) => v.status === "ACTIVE").map((v) => v.id);
      const activeIdSet = new Set(activeIds);
      const providedIdSet = new Set(body.orderedIds);
      const coversFullActiveSet =
        providedIdSet.size === body.orderedIds.length &&
        activeIds.length === body.orderedIds.length &&
        activeIds.every((id) => providedIdSet.has(id)) &&
        body.orderedIds.every((id) => activeIdSet.has(id));

      if (!coversFullActiveSet) {
        return reply
          .code(400)
          .send(
            errorBody(
              "TAXONOMY_REORDER_INCOMPLETE",
              `orderedIds must contain exactly the full ACTIVE set of ${body.type} values for this store (no partial reorder).`,
            ),
          );
      }

      const reordered = await service.reorder(params.storeId, body.type, body.orderedIds);
      await recordAudit({
        action: "UPDATE",
        ...access.audit,
        storeId: params.storeId,
        entityType: "ProductTaxonomyValue",
        metadata: { op: "reorder", type: body.type, orderedIds: body.orderedIds },
      });
      // Task 24 — reorder de TOPLU usageCount (reordered.length item, tek turda).
      const usageMap = await service.usageCountForOptions(reordered.map((v) => v.attributeOptionId));
      return productTaxonomyListResponseSchema.parse({
        data: reordered.map((v) => serializeTaxonomyValue(v, usageMap[v.attributeOptionId] ?? 0)),
        pagination: buildAdminListPagination({
          page: 1,
          pageSize: Math.max(1, reordered.length),
          totalItems: reordered.length,
        }),
      });
    });
  });

  // ─────────────────────────── GET /:valueId ───────────────────────────
  app.get("/stores/:storeId/product-taxonomy/:valueId", async (request, reply) => {
    const params = valueParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;

    return handle(reply, async () => {
      const value = await service.get(params.storeId, params.valueId);
      return productTaxonomyResponseSchema.parse({
        data: serializeTaxonomyValue(value, await resolveUsageCount(service, value)),
      });
    });
  });

  // ─────────────────────────── PATCH /:valueId ───────────────────────────
  app.patch("/stores/:storeId/product-taxonomy/:valueId", async (request, reply) => {
    const params = valueParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = productTaxonomyUpdateRequestSchema.parse(request.body);
    // `status` servisin update()'i tarafindan desteklenmez (Task 9: status archive()/restore()
    // ile degisir) — route burada translate eder ki `status` alani PATCH kontratindan
    // KALDIRILMASIN (tek istekte hem alan hem durum degisimi mumkun olsun).
    const { status, ...patch } = body;

    return handle(reply, async () => {
      let value: TaxonomyValueRecord =
        Object.keys(patch).length > 0
          ? await service.update(params.storeId, params.valueId, patch)
          : await service.get(params.storeId, params.valueId);

      if (status !== undefined && status !== value.status) {
        value =
          status === "ARCHIVED"
            ? await service.archive(params.storeId, params.valueId)
            : await service.restore(params.storeId, params.valueId);
      }

      await recordAudit({
        action: "UPDATE",
        ...access.audit,
        storeId: params.storeId,
        entityType: "ProductTaxonomyValue",
        entityId: params.valueId,
      });
      return productTaxonomyResponseSchema.parse({
        data: serializeTaxonomyValue(value, await resolveUsageCount(service, value)),
      });
    });
  });

  // ─────────────────────────── POST /:valueId/archive ───────────────────────────
  app.post("/stores/:storeId/product-taxonomy/:valueId/archive", async (request, reply) => {
    const params = valueParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;

    return handle(reply, async () => {
      const value = await service.archive(params.storeId, params.valueId);
      await recordAudit({
        action: "UPDATE",
        ...access.audit,
        storeId: params.storeId,
        entityType: "ProductTaxonomyValue",
        entityId: value.id,
        metadata: { op: "archive" },
      });
      return productTaxonomyResponseSchema.parse({
        data: serializeTaxonomyValue(value, await resolveUsageCount(service, value)),
      });
    });
  });

  // ─────────────────────────── POST /:valueId/restore ───────────────────────────
  app.post("/stores/:storeId/product-taxonomy/:valueId/restore", async (request, reply) => {
    const params = valueParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;

    return handle(reply, async () => {
      const value = await service.restore(params.storeId, params.valueId);
      await recordAudit({
        action: "UPDATE",
        ...access.audit,
        storeId: params.storeId,
        entityType: "ProductTaxonomyValue",
        entityId: value.id,
        metadata: { op: "restore" },
      });
      return productTaxonomyResponseSchema.parse({
        data: serializeTaxonomyValue(value, await resolveUsageCount(service, value)),
      });
    });
  });

  // ─────────────────────────── DELETE /:valueId ───────────────────────────
  app.delete("/stores/:storeId/product-taxonomy/:valueId", async (request, reply) => {
    const params = valueParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;

    return handle(reply, async () => {
      await service.delete(params.storeId, params.valueId);
      await recordAudit({
        action: "DELETE",
        ...access.audit,
        storeId: params.storeId,
        entityType: "ProductTaxonomyValue",
        entityId: params.valueId,
      });
      return reply.code(204).send();
    });
  });
}
