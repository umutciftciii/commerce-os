// TODO-165A (ADR-165A) — Product Data Governance: Brand (Marka) store-admin uclari.
//
// Guvenlik: tum uclar requireStoreAdmin (platform admin + store scope) ile korunur ve CATALOG
// capability-gate'li gecirilir (server.ts requireStoreAdminForModule). CATALOG core/always-on
// (bkz. capabilities/registry.ts) → tenant guard her zaman calisir, capability kontrolu her
// zaman gecer (fail-closed dahi core=acik). Store izolasyonu: tum sorgular {id, storeId}
// scoped (cross-store id → 404). logoMediaId/coverMediaId cross-tenant baglama BrandService
// icinde reddedilir (403). storageKey ASLA response'a sizmaz — yalniz toPublicMediaUrl ile
// turetilmis url (ProductCategory imageUrl / SizeChart deseniyle ayni tek-cikis noktasi).
//
// Secici (`/brands/selector`) STATIK yoldur; `/:brandId` parametreli route'undan ONCE
// register edilir (TODO-159B/ADR-090 desenini mirror eder — ids cozum modu, sira korunur,
// baska magazanin id'si sessizce dusurulur).

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ADMIN_SELECTOR_MAX_IDS,
  adminBrandListQuerySchema,
  adminBrandSelectorQuerySchema,
  adminBrandSelectorResponseSchema,
  adminListQueryBaseSchema,
  brandCreateRequestSchema,
  brandListResponseSchema,
  brandProductsResponseSchema,
  brandResponseSchema,
  brandUpdateRequestSchema,
  buildAdminListPagination,
  buildSelectorIdsPagination,
  parseSelectorIds,
  resolveAdminListPage,
} from "@commerce-os/contracts";
import { z } from "zod";
import { BrandError, brandErrorStatus, type BrandService } from "./brand-service.js";
import type { BrandRecord } from "./brand-data.js";

export interface BrandRoutesDeps {
  service: BrandService;
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
  /** storageKey → public URL (server.ts: resolveMediaUrl(config.MEDIA_PUBLIC_BASE_URL, key)). */
  toPublicMediaUrl: (storageKey: string) => string;
  /**
   * TODO-165B — Marka adı/slug'ı değişince search read-model'deki brandSlug/brandName snapshot'ı
   * bayatlar (PLP marka filtresi + kart marka etiketi eski değeri gösterir). Markanın ürünlerini
   * yeniden indeksle (mağaza-seviyesi; marka rename seyrek). Opsiyonel (test DI'da atlanabilir).
   */
  onBrandChanged?: (storeId: string) => void;
}

const storeParam = z.object({ storeId: z.string().min(1) });
const brandParam = z.object({ storeId: z.string().min(1), brandId: z.string().min(1) });

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export function serializeBrand(brand: BrandRecord, toPublicMediaUrl: (storageKey: string) => string) {
  return {
    id: brand.id,
    storeId: brand.storeId,
    name: brand.name,
    slug: brand.slug,
    description: brand.description,
    logoMediaId: brand.logoMediaId,
    logoUrl: brand.logoStorageKey ? toPublicMediaUrl(brand.logoStorageKey) : null,
    coverMediaId: brand.coverMediaId,
    coverUrl: brand.coverStorageKey ? toPublicMediaUrl(brand.coverStorageKey) : null,
    websiteUrl: brand.websiteUrl,
    status: brand.status,
    seoTitle: brand.seoTitle,
    seoDescription: brand.seoDescription,
    productCount: brand.productCount,
    createdAt: brand.createdAt.toISOString(),
    updatedAt: brand.updatedAt.toISOString(),
  };
}

function serializeBrandOption(brand: BrandRecord, toPublicMediaUrl: (storageKey: string) => string) {
  return {
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    status: brand.status,
    logoUrl: brand.logoStorageKey ? toPublicMediaUrl(brand.logoStorageKey) : null,
  };
}

export function registerBrandRoutes(app: FastifyInstance, deps: BrandRoutesDeps) {
  const { service, requireStoreAdmin, recordAudit, toPublicMediaUrl, onBrandChanged } = deps;

  async function handle(reply: FastifyReply, fn: () => Promise<unknown>) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof BrandError) {
        await reply.code(brandErrorStatus(err.code)).send(errorBody(err.code, err.message));
        return;
      }
      throw err;
    }
  }

  app.get("/stores/:storeId/brands", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const query = adminBrandListQuerySchema.parse(request.query);
    const { page, pageSize, limit, offset } = resolveAdminListPage(query);
    const result = await service.list(params.storeId, {
      limit,
      offset,
      search: query.search,
      status: query.status,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    return brandListResponseSchema.parse({
      data: result.data.map((brand) => serializeBrand(brand, toPublicMediaUrl)),
      pagination: buildAdminListPagination({ page, pageSize, totalItems: result.total }),
    });
  });

  /**
   * TODO-159B (ADR-090) desenini mirror eden marka SEÇİCİ ucu. `/selector` STATİK'tir;
   * `/:brandId` ile çakışmaz (bu handler'dan ÖNCE register edilir).
   */
  app.get("/stores/:storeId/brands/selector", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const query = adminBrandSelectorQuerySchema.parse(request.query);

    if (query.ids !== undefined) {
      const ids = parseSelectorIds(query.ids);
      const resolved = await service.selector(params.storeId, {
        limit: ADMIN_SELECTOR_MAX_IDS,
        offset: 0,
        ids,
      });
      // Istemcinin verdigi SIRA korunur (secim sirasi anlamlidir).
      const byId = new Map(resolved.data.map((brand) => [brand.id, brand]));
      const ordered = ids
        .map((id) => byId.get(id))
        .filter((brand): brand is BrandRecord => brand !== undefined);
      return adminBrandSelectorResponseSchema.parse({
        data: ordered.map((brand) => serializeBrandOption(brand, toPublicMediaUrl)),
        pagination: buildSelectorIdsPagination(ordered.length),
      });
    }

    const { page, pageSize, limit, offset } = resolveAdminListPage(query);
    const result = await service.selector(params.storeId, {
      limit,
      offset,
      search: query.search,
      status: query.status,
      // Secicinin anlamlı varsayılanı alfabetiktir.
      sortBy: query.sortBy ?? "name",
      sortOrder: query.sortOrder ?? "asc",
    });
    return adminBrandSelectorResponseSchema.parse({
      data: result.data.map((brand) => serializeBrandOption(brand, toPublicMediaUrl)),
      pagination: buildAdminListPagination({ page, pageSize, totalItems: result.total }),
    });
  });

  app.post("/stores/:storeId/brands", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = brandCreateRequestSchema.parse(request.body);
    return handle(reply, async () => {
      const brand = await service.create(params.storeId, body);
      await recordAudit({
        action: "CREATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Brand",
        entityId: brand.id,
      });
      return reply.code(201).send(brandResponseSchema.parse({ data: serializeBrand(brand, toPublicMediaUrl) }));
    });
  });

  app.get("/stores/:storeId/brands/:brandId", async (request, reply) => {
    const params = brandParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    return handle(reply, async () => {
      const brand = await service.get(params.storeId, params.brandId);
      return brandResponseSchema.parse({ data: serializeBrand(brand, toPublicMediaUrl) });
    });
  });

  app.patch("/stores/:storeId/brands/:brandId", async (request, reply) => {
    const params = brandParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = brandUpdateRequestSchema.parse(request.body);
    return handle(reply, async () => {
      const brand = await service.update(params.storeId, params.brandId, body);
      await recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Brand",
        entityId: brand.id,
      });
      // TODO-165B — marka adı/slug değişince ürün search read-model snapshot'ı bayatlar → reindex.
      if (body.name !== undefined || body.slug !== undefined) {
        onBrandChanged?.(params.storeId);
      }
      return brandResponseSchema.parse({ data: serializeBrand(brand, toPublicMediaUrl) });
    });
  });

  app.post("/stores/:storeId/brands/:brandId/archive", async (request, reply) => {
    const params = brandParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    return handle(reply, async () => {
      const brand = await service.archive(params.storeId, params.brandId);
      await recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Brand",
        entityId: brand.id,
        metadata: { op: "archive" },
      });
      return brandResponseSchema.parse({ data: serializeBrand(brand, toPublicMediaUrl) });
    });
  });

  app.post("/stores/:storeId/brands/:brandId/restore", async (request, reply) => {
    const params = brandParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    return handle(reply, async () => {
      const brand = await service.restore(params.storeId, params.brandId);
      await recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Brand",
        entityId: brand.id,
        metadata: { op: "restore" },
      });
      return brandResponseSchema.parse({ data: serializeBrand(brand, toPublicMediaUrl) });
    });
  });

  /**
   * TODO-165A (ADR-165A) Task 15/16 gap — marka "Bağlı ürünler" listesi. Task 6'nin
   * COUNT-ONLY govdesinden GERCEK (sayfalanmis/aranabilir) urun listesine yukseltildi.
   */
  app.get("/stores/:storeId/brands/:brandId/products", async (request, reply) => {
    const params = brandParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const query = adminListQueryBaseSchema.parse(request.query);
    const { page, pageSize, limit, offset } = resolveAdminListPage(query);
    return handle(reply, async () => {
      // Tenant/varlik dogrulamasi icin once get() (cross-store id → BRAND_NOT_FOUND/404).
      await service.get(params.storeId, params.brandId);
      const result = await service.listProducts(params.storeId, params.brandId, {
        limit,
        offset,
        search: query.search,
      });
      return brandProductsResponseSchema.parse({
        data: result.data.map((product) => ({
          id: product.id,
          title: product.title,
          status: product.status,
          sku: product.sku,
          imageUrl: product.coverStorageKey ? toPublicMediaUrl(product.coverStorageKey) : null,
        })),
        pagination: buildAdminListPagination({ page, pageSize, totalItems: result.total }),
      });
    });
  });
}
