/**
 * TODO-158A (ADR-086) — Home Experience Platform store-admin uçları.
 *
 * Güvenlik:
 *  - Tüm uçlar requireStoreAdmin (platform admin + store scope) ile korunur.
 *  - Store izolasyonu: tüm sorgular {storeId} scoped; başka store'un section'ı GÖRÜNMEZ (404).
 *  - Alt varlıklar {sectionId, storeId} scoped; ayrıca section.type doğrulanır (yanlış tipe
 *    yanlış çocuk eklenemez → 400 HOME_SECTION_TYPE_MISMATCH).
 *
 * config: HomeSection.config DB'de opaque JSON; bu katman section.type'a göre tip-özel
 * şema ile doğrular (parseConfigForType). Geçersiz config → 400 INVALID_SECTION_CONFIG.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  homeSectionCreateRequestSchema,
  homeSectionUpdateRequestSchema,
  homeSectionReorderRequestSchema,
  homeSectionListResponseSchema,
  homeHeroSlideCreateRequestSchema,
  homeHeroSlideUpdateRequestSchema,
  homeHeroSlideListResponseSchema,
  homeFeaturedCategoryCreateRequestSchema,
  homeFeaturedCategoryUpdateRequestSchema,
  homeFeaturedCategoryListResponseSchema,
  homeShowcaseProductSetRequestSchema,
  homeShowcaseProductListResponseSchema,
  homeHeroConfigSchema,
  homeFeaturedCategoriesConfigSchema,
  homeShowcaseConfigSchema,
  type HomeSectionType,
} from "@commerce-os/contracts";
import { z } from "zod";
import {
  serializeHomeSection,
  serializeHomeHeroSlide,
  serializeHomeFeaturedCategory,
  serializeHomeShowcaseProduct,
  parseHomeShowcaseConfig,
  type HomeDataAccess,
} from "./data.js";

export interface HomeAdminRoutesDeps {
  dataAccess: HomeDataAccess;
  mediaBaseUrl?: string;
  /** MANUAL showcase kapak URL'i çözümü için (server.ts kapak batch'ini enjekte eder). */
  resolveProductCovers: (
    storeId: string,
    productIds: string[],
  ) => Promise<Map<string, string | null>>;
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
const sectionParam = z.object({ storeId: z.string().min(1), sectionId: z.string().min(1) });
const childParam = z.object({
  storeId: z.string().min(1),
  sectionId: z.string().min(1),
  id: z.string().min(1),
});

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}

// Section.type'a göre config'i doğrula/normalleştir. Geçersizse null döner (route 400 verir).
function parseConfigForType(type: HomeSectionType, config: unknown): Record<string, unknown> | null {
  try {
    if (type === "HERO_SLIDER") return homeHeroConfigSchema.parse(config ?? {});
    if (type === "FEATURED_CATEGORIES") return homeFeaturedCategoriesConfigSchema.parse(config ?? {});
    // PRODUCT_SHOWCASE: source zorunlu; verilmezse MANUAL default.
    return homeShowcaseConfigSchema.parse(config ?? { source: { kind: "MANUAL" } });
  } catch {
    return null;
  }
}

export function registerHomeAdminRoutes(app: FastifyInstance, deps: HomeAdminRoutesDeps) {
  const { dataAccess, mediaBaseUrl, resolveProductCovers, requireStoreAdmin, recordAudit } = deps;

  // Medya bağlanabilirlik guard'ı: mediaId aynı store'a ait + beklenen context'te mi?
  async function assertMediaAttachable(
    reply: FastifyReply,
    storeId: string,
    mediaId: string,
    expectedContext: "HERO" | "CATEGORY",
  ): Promise<boolean> {
    const asset = await dataAccess.findMediaAssetById(storeId, mediaId);
    if (!asset || asset.context !== expectedContext) {
      await reply
        .code(400)
        .send(errorBody("INVALID_IMAGE_REFERENCE", "Image not found for this store."));
      return false;
    }
    return true;
  }

  // Section'ı yükle + beklenen tipte mi doğrula. Değilse reply gönderir, null döner.
  async function loadTypedSection(
    reply: FastifyReply,
    storeId: string,
    sectionId: string,
    expectedType: HomeSectionType,
  ) {
    const section = await dataAccess.findSection(storeId, sectionId);
    if (!section) {
      await reply.code(404).send(errorBody("HOME_SECTION_NOT_FOUND", "Home section not found."));
      return null;
    }
    if (section.type !== expectedType) {
      await reply
        .code(400)
        .send(errorBody("HOME_SECTION_TYPE_MISMATCH", `Section is not a ${expectedType}.`));
      return null;
    }
    return section;
  }

  // ─────────────────────── Section CRUD ───────────────────────

  app.get("/stores/:storeId/home/sections", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const sections = await dataAccess.listSections(params.storeId);
    return homeSectionListResponseSchema.parse({ data: sections.map(serializeHomeSection) });
  });

  app.post("/stores/:storeId/home/sections", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = homeSectionCreateRequestSchema.parse(request.body);
    const config = parseConfigForType(body.type, body.config);
    if (!config) {
      return reply
        .code(400)
        .send(errorBody("INVALID_SECTION_CONFIG", "Section config is invalid for its type."));
    }
    const section = await dataAccess.createSection(params.storeId, {
      type: body.type,
      title: body.title,
      subtitle: body.subtitle,
      enabled: body.enabled,
      desktopVisible: body.desktopVisible,
      mobileVisible: body.mobileVisible,
      publishStart: toDate(body.publishStart) ?? null,
      publishEnd: toDate(body.publishEnd) ?? null,
      config,
    });
    await recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HomeSection",
      entityId: section.id,
      metadata: { type: body.type },
    });
    return reply.code(201).send(serializeHomeSection(section));
  });

  app.get("/stores/:storeId/home/sections/:sectionId", async (request, reply) => {
    const params = sectionParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const section = await dataAccess.findSection(params.storeId, params.sectionId);
    if (!section) return reply.code(404).send(errorBody("HOME_SECTION_NOT_FOUND", "Home section not found."));
    return serializeHomeSection(section);
  });

  app.patch("/stores/:storeId/home/sections/:sectionId", async (request, reply) => {
    const params = sectionParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const existing = await dataAccess.findSection(params.storeId, params.sectionId);
    if (!existing) return reply.code(404).send(errorBody("HOME_SECTION_NOT_FOUND", "Home section not found."));
    const body = homeSectionUpdateRequestSchema.parse(request.body ?? {});
    // config verilmişse mevcut type'a göre doğrula (type IMMUTABLE).
    let normalizedConfig: Record<string, unknown> | undefined;
    if (body.config !== undefined) {
      const parsed = parseConfigForType(existing.type as HomeSectionType, body.config);
      if (!parsed) {
        return reply
          .code(400)
          .send(errorBody("INVALID_SECTION_CONFIG", "Section config is invalid for its type."));
      }
      normalizedConfig = parsed;
    }
    const section = await dataAccess.updateSection(params.storeId, params.sectionId, {
      title: body.title,
      subtitle: body.subtitle,
      enabled: body.enabled,
      desktopVisible: body.desktopVisible,
      mobileVisible: body.mobileVisible,
      publishStart: toDate(body.publishStart),
      publishEnd: toDate(body.publishEnd),
      config: normalizedConfig,
    });
    if (!section) return reply.code(404).send(errorBody("HOME_SECTION_NOT_FOUND", "Home section not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HomeSection",
      entityId: section.id,
      metadata: { fields: Object.keys(body) },
    });
    return serializeHomeSection(section);
  });

  app.delete("/stores/:storeId/home/sections/:sectionId", async (request, reply) => {
    const params = sectionParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const deleted = await dataAccess.deleteSection(params.storeId, params.sectionId);
    if (!deleted) return reply.code(404).send(errorBody("HOME_SECTION_NOT_FOUND", "Home section not found."));
    await recordAudit({
      action: "DELETE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HomeSection",
      entityId: params.sectionId,
    });
    return reply.code(204).send();
  });

  app.post("/stores/:storeId/home/sections/reorder", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = homeSectionReorderRequestSchema.parse(request.body);
    const result = await dataAccess.reorderSections(params.storeId, body.orderedIds);
    if (result === "MISMATCH") {
      return reply
        .code(400)
        .send(errorBody("HOME_SECTION_REORDER_MISMATCH", "orderedIds must match the current section set exactly."));
    }
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HomeSection",
      metadata: { reorder: body.orderedIds.length },
    });
    return homeSectionListResponseSchema.parse({ data: result.map(serializeHomeSection) });
  });

  // ─────────────────────── HERO_SLIDER alt varlığı ───────────────────────

  app.get("/stores/:storeId/home/sections/:sectionId/hero-slides", async (request, reply) => {
    const params = sectionParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    if (!(await loadTypedSection(reply, params.storeId, params.sectionId, "HERO_SLIDER"))) return;
    const slides = await dataAccess.listHeroSlides(params.storeId, params.sectionId);
    return homeHeroSlideListResponseSchema.parse({
      data: slides.map((s) => serializeHomeHeroSlide(s, mediaBaseUrl)),
    });
  });

  // Hero slide hedef (product/category/campaign) var-olma doğrulaması.
  async function assertHeroTargets(
    reply: FastifyReply,
    storeId: string,
    body: { targetProductId?: string | null; targetCategoryId?: string | null; targetCampaignId?: string | null },
  ): Promise<boolean> {
    if (body.targetProductId && !(await dataAccess.productExists(storeId, body.targetProductId))) {
      await reply.code(400).send(errorBody("INVALID_TARGET_REFERENCE", "Target product not found."));
      return false;
    }
    if (body.targetCategoryId && !(await dataAccess.categoryExists(storeId, body.targetCategoryId))) {
      await reply.code(400).send(errorBody("INVALID_TARGET_REFERENCE", "Target category not found."));
      return false;
    }
    if (body.targetCampaignId && !(await dataAccess.campaignExists(storeId, body.targetCampaignId))) {
      await reply.code(400).send(errorBody("INVALID_TARGET_REFERENCE", "Target campaign not found."));
      return false;
    }
    return true;
  }

  app.post("/stores/:storeId/home/sections/:sectionId/hero-slides", async (request, reply) => {
    const params = sectionParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    if (!(await loadTypedSection(reply, params.storeId, params.sectionId, "HERO_SLIDER"))) return;
    const body = homeHeroSlideCreateRequestSchema.parse(request.body);
    if (!(await assertMediaAttachable(reply, params.storeId, body.mediaId, "HERO"))) return;
    if (body.mobileMediaId && !(await assertMediaAttachable(reply, params.storeId, body.mobileMediaId, "HERO"))) {
      return;
    }
    if (!(await assertHeroTargets(reply, params.storeId, body))) return;
    const slide = await dataAccess.createHeroSlide(params.storeId, params.sectionId, {
      mediaId: body.mediaId,
      mobileMediaId: body.mobileMediaId,
      videoUrl: body.videoUrl,
      headline: body.headline,
      subtext: body.subtext,
      ctaLabel: body.ctaLabel,
      ctaHref: body.ctaHref,
      targetProductId: body.targetProductId,
      targetCategoryId: body.targetCategoryId,
      targetCampaignId: body.targetCampaignId,
      enabled: body.enabled,
      publishStart: toDate(body.publishStart),
      publishEnd: toDate(body.publishEnd),
    });
    await recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HomeHeroSlide",
      entityId: slide.id,
    });
    return reply.code(201).send(serializeHomeHeroSlide(slide, mediaBaseUrl));
  });

  app.patch("/stores/:storeId/home/sections/:sectionId/hero-slides/:id", async (request, reply) => {
    const params = childParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    if (!(await loadTypedSection(reply, params.storeId, params.sectionId, "HERO_SLIDER"))) return;
    const body = homeHeroSlideUpdateRequestSchema.parse(request.body ?? {});
    if (body.mediaId !== undefined && !(await assertMediaAttachable(reply, params.storeId, body.mediaId, "HERO"))) {
      return;
    }
    if (body.mobileMediaId && !(await assertMediaAttachable(reply, params.storeId, body.mobileMediaId, "HERO"))) {
      return;
    }
    if (!(await assertHeroTargets(reply, params.storeId, body))) return;
    const slide = await dataAccess.updateHeroSlide(params.storeId, params.sectionId, params.id, {
      mediaId: body.mediaId,
      mobileMediaId: body.mobileMediaId,
      videoUrl: body.videoUrl,
      headline: body.headline,
      subtext: body.subtext,
      ctaLabel: body.ctaLabel,
      ctaHref: body.ctaHref,
      targetProductId: body.targetProductId,
      targetCategoryId: body.targetCategoryId,
      targetCampaignId: body.targetCampaignId,
      enabled: body.enabled,
      publishStart: toDate(body.publishStart),
      publishEnd: toDate(body.publishEnd),
    });
    if (!slide) return reply.code(404).send(errorBody("HOME_HERO_SLIDE_NOT_FOUND", "Hero slide not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HomeHeroSlide",
      entityId: slide.id,
    });
    return serializeHomeHeroSlide(slide, mediaBaseUrl);
  });

  app.delete("/stores/:storeId/home/sections/:sectionId/hero-slides/:id", async (request, reply) => {
    const params = childParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const deleted = await dataAccess.deleteHeroSlide(params.storeId, params.sectionId, params.id);
    if (!deleted) return reply.code(404).send(errorBody("HOME_HERO_SLIDE_NOT_FOUND", "Hero slide not found."));
    await recordAudit({
      action: "DELETE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HomeHeroSlide",
      entityId: params.id,
    });
    return reply.code(204).send();
  });

  app.post("/stores/:storeId/home/sections/:sectionId/hero-slides/reorder", async (request, reply) => {
    const params = sectionParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    if (!(await loadTypedSection(reply, params.storeId, params.sectionId, "HERO_SLIDER"))) return;
    const body = homeSectionReorderRequestSchema.parse(request.body);
    const result = await dataAccess.reorderHeroSlides(params.storeId, params.sectionId, body.orderedIds);
    if (result === "MISMATCH") {
      return reply
        .code(400)
        .send(errorBody("HOME_HERO_REORDER_MISMATCH", "orderedIds must match the current slide set exactly."));
    }
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HomeHeroSlide",
      metadata: { reorder: body.orderedIds.length },
    });
    return homeHeroSlideListResponseSchema.parse({
      data: result.map((s) => serializeHomeHeroSlide(s, mediaBaseUrl)),
    });
  });

  // ─────────────────────── FEATURED_CATEGORIES alt varlığı ───────────────────────

  app.get("/stores/:storeId/home/sections/:sectionId/featured-categories", async (request, reply) => {
    const params = sectionParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    if (!(await loadTypedSection(reply, params.storeId, params.sectionId, "FEATURED_CATEGORIES"))) return;
    const rows = await dataAccess.listFeaturedCategories(params.storeId, params.sectionId);
    return homeFeaturedCategoryListResponseSchema.parse({
      data: rows.map((r) => serializeHomeFeaturedCategory(r, mediaBaseUrl)),
    });
  });

  app.post("/stores/:storeId/home/sections/:sectionId/featured-categories", async (request, reply) => {
    const params = sectionParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    if (!(await loadTypedSection(reply, params.storeId, params.sectionId, "FEATURED_CATEGORIES"))) return;
    const body = homeFeaturedCategoryCreateRequestSchema.parse(request.body);
    if (!(await dataAccess.categoryExists(params.storeId, body.categoryId))) {
      return reply.code(400).send(errorBody("INVALID_CATEGORY_REFERENCE", "Category not found for this store."));
    }
    if (body.imageMediaId && !(await assertMediaAttachable(reply, params.storeId, body.imageMediaId, "CATEGORY"))) {
      return;
    }
    const created = await dataAccess.createFeaturedCategory(params.storeId, params.sectionId, {
      categoryId: body.categoryId,
      imageMediaId: body.imageMediaId,
      titleOverride: body.titleOverride,
      descriptionOverride: body.descriptionOverride,
      enabled: body.enabled,
    });
    if (created === "DUPLICATE") {
      return reply
        .code(409)
        .send(errorBody("FEATURED_CATEGORY_DUPLICATE", "Category is already featured in this section."));
    }
    await recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HomeFeaturedCategory",
      entityId: created.id,
    });
    return reply.code(201).send(serializeHomeFeaturedCategory(created, mediaBaseUrl));
  });

  app.patch("/stores/:storeId/home/sections/:sectionId/featured-categories/:id", async (request, reply) => {
    const params = childParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    if (!(await loadTypedSection(reply, params.storeId, params.sectionId, "FEATURED_CATEGORIES"))) return;
    const body = homeFeaturedCategoryUpdateRequestSchema.parse(request.body ?? {});
    if (body.imageMediaId && !(await assertMediaAttachable(reply, params.storeId, body.imageMediaId, "CATEGORY"))) {
      return;
    }
    const updated = await dataAccess.updateFeaturedCategory(params.storeId, params.sectionId, params.id, {
      imageMediaId: body.imageMediaId,
      titleOverride: body.titleOverride,
      descriptionOverride: body.descriptionOverride,
      enabled: body.enabled,
    });
    if (!updated) {
      return reply.code(404).send(errorBody("FEATURED_CATEGORY_NOT_FOUND", "Featured category not found."));
    }
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HomeFeaturedCategory",
      entityId: updated.id,
    });
    return serializeHomeFeaturedCategory(updated, mediaBaseUrl);
  });

  app.delete("/stores/:storeId/home/sections/:sectionId/featured-categories/:id", async (request, reply) => {
    const params = childParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const deleted = await dataAccess.deleteFeaturedCategory(params.storeId, params.sectionId, params.id);
    if (!deleted) {
      return reply.code(404).send(errorBody("FEATURED_CATEGORY_NOT_FOUND", "Featured category not found."));
    }
    await recordAudit({
      action: "DELETE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HomeFeaturedCategory",
      entityId: params.id,
    });
    return reply.code(204).send();
  });

  app.post("/stores/:storeId/home/sections/:sectionId/featured-categories/reorder", async (request, reply) => {
    const params = sectionParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    if (!(await loadTypedSection(reply, params.storeId, params.sectionId, "FEATURED_CATEGORIES"))) return;
    const body = homeSectionReorderRequestSchema.parse(request.body);
    const result = await dataAccess.reorderFeaturedCategories(params.storeId, params.sectionId, body.orderedIds);
    if (result === "MISMATCH") {
      return reply
        .code(400)
        .send(errorBody("FEATURED_CATEGORY_REORDER_MISMATCH", "orderedIds must match the current set exactly."));
    }
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HomeFeaturedCategory",
      metadata: { reorder: body.orderedIds.length },
    });
    return homeFeaturedCategoryListResponseSchema.parse({
      data: result.map((r) => serializeHomeFeaturedCategory(r, mediaBaseUrl)),
    });
  });

  // ─────────────────────── PRODUCT_SHOWCASE (MANUAL) alt varlığı ───────────────────────

  async function serializeShowcaseList(storeId: string, sectionId: string) {
    const rows = await dataAccess.listShowcaseProducts(storeId, sectionId);
    const covers = await resolveProductCovers(storeId, rows.map((r) => r.productId));
    return homeShowcaseProductListResponseSchema.parse({
      data: rows.map((r) => serializeHomeShowcaseProduct(r, covers.get(r.productId) ?? null)),
    });
  }

  app.get("/stores/:storeId/home/sections/:sectionId/showcase-products", async (request, reply) => {
    const params = sectionParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    if (!(await loadTypedSection(reply, params.storeId, params.sectionId, "PRODUCT_SHOWCASE"))) return;
    return serializeShowcaseList(params.storeId, params.sectionId);
  });

  app.put("/stores/:storeId/home/sections/:sectionId/showcase-products", async (request, reply) => {
    const params = sectionParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const section = await loadTypedSection(reply, params.storeId, params.sectionId, "PRODUCT_SHOWCASE");
    if (!section) return;
    // Manuel ürün listesi yalnız MANUAL kaynaklı showcase'te anlamlıdır.
    const config = parseHomeShowcaseConfig(section.config);
    if (config.source.kind !== "MANUAL") {
      return reply
        .code(400)
        .send(errorBody("SHOWCASE_NOT_MANUAL", "Manual products apply only to MANUAL-source showcases."));
    }
    const body = homeShowcaseProductSetRequestSchema.parse(request.body);
    const result = await dataAccess.setShowcaseProducts(params.storeId, params.sectionId, body.productIds);
    if (result === "INVALID_PRODUCT") {
      return reply.code(400).send(errorBody("INVALID_PRODUCT_REFERENCE", "One or more products not found for this store."));
    }
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HomeShowcaseProduct",
      entityId: params.sectionId,
      metadata: { count: body.productIds.length },
    });
    return serializeShowcaseList(params.storeId, params.sectionId);
  });
}
