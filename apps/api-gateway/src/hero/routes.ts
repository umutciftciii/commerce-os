/**
 * ADR-065 (Faz 2/Dilim 5) — Store-admin hero (ana sayfa) slide yonetim uclari.
 *
 * Guvenlik:
 *  - Tum uclar requireStoreAdmin (platform admin + store scope) ile korunur.
 *  - Store izolasyonu: tum sorgular {id, storeId} scoped; baska store'un slide'i
 *    GORUNMEZ (404). mediaId ayni store'da + HERO context'te dogrulanir.
 *
 * Kapsam (Checkpoint A): CRUD temeli. Siralama (reorder) ve yayin gecisi
 * (publish/unpublish) ayri checkpoint'lerdir; status daima DRAFT ile create edilir.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  heroSlideCreateRequestSchema,
  heroSlideListResponseSchema,
  heroSlideReorderRequestSchema,
  heroSlideSchema,
  heroSlideStatusActionResponseSchema,
  heroSlideUpdateRequestSchema,
} from "@commerce-os/contracts";
import { z } from "zod";
import { serializeHeroSlide, type HeroDataAccess } from "./data.js";

export interface HeroAdminRoutesDeps {
  dataAccess: HeroDataAccess;
  /** MEDIA_PUBLIC_BASE_URL — mediaUrl turetimi icin (bos ise /media/<key> goreli). */
  mediaBaseUrl?: string;
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
const heroParam = z.object({ storeId: z.string().min(1), id: z.string().min(1) });

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

// Contract'ta startsAt/endsAt ISO string; Prisma DateTime ister. Route katmani tek
// noktada normalize eder (undefined=dokunma, null=temizle, string=Date).
function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}

export function registerHeroAdminRoutes(app: FastifyInstance, deps: HeroAdminRoutesDeps) {
  const { dataAccess, mediaBaseUrl, requireStoreAdmin, recordAudit } = deps;

  // ADR-065 — hero gorseli baglanabilirlik guard'i: mediaId ayni store'a ait +
  // HERO context'te mi? Degilse 400 INVALID_IMAGE_REFERENCE (server.ts kategori/
  // urun/branding guard'inin HERO context'li ozdesi). Yazimdan ONCE cagrilir.
  async function assertHeroMediaAttachable(
    reply: FastifyReply,
    storeId: string,
    mediaId: string,
  ): Promise<boolean> {
    const asset = await dataAccess.findMediaAssetById(storeId, mediaId);
    if (!asset || asset.context !== "HERO") {
      await reply.code(400).send(errorBody("INVALID_IMAGE_REFERENCE", "Image not found for this store."));
      return false;
    }
    return true;
  }

  app.get("/stores/:storeId/hero-slides", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const slides = await dataAccess.listHeroSlides(params.storeId);
    return heroSlideListResponseSchema.parse({
      data: slides.map((slide) => serializeHeroSlide(slide, mediaBaseUrl)),
    });
  });

  app.post("/stores/:storeId/hero-slides", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = heroSlideCreateRequestSchema.parse(request.body);
    // R6: mediaId zorunlu (sema garanti eder) + HERO context dogrulamasi.
    if (!(await assertHeroMediaAttachable(reply, params.storeId, body.mediaId))) return;
    const slide = await dataAccess.createHeroSlide(params.storeId, {
      mediaId: body.mediaId,
      status: body.status,
      headline: body.headline,
      subtext: body.subtext,
      ctaLabel: body.ctaLabel,
      ctaHref: body.ctaHref,
      startsAt: toDate(body.startsAt),
      endsAt: toDate(body.endsAt),
    });
    await recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HeroSlide",
      entityId: slide.id,
      metadata: { fields: Object.keys(body) },
    });
    return reply.code(201).send(heroSlideSchema.parse(serializeHeroSlide(slide, mediaBaseUrl)));
  });

  app.get("/stores/:storeId/hero-slides/:id", async (request, reply) => {
    const params = heroParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const slide = await dataAccess.findHeroSlideById(params.storeId, params.id);
    if (!slide) return reply.code(404).send(errorBody("HERO_SLIDE_NOT_FOUND", "Hero slide not found."));
    return serializeHeroSlide(slide, mediaBaseUrl);
  });

  app.patch("/stores/:storeId/hero-slides/:id", async (request, reply) => {
    const params = heroParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = heroSlideUpdateRequestSchema.parse(request.body ?? {});
    // mediaId gonderildiyse (null'a cekilemez, R6) yeniden HERO context dogrula.
    if (body.mediaId !== undefined && !(await assertHeroMediaAttachable(reply, params.storeId, body.mediaId))) {
      return;
    }
    const slide = await dataAccess.updateHeroSlide(params.storeId, params.id, {
      mediaId: body.mediaId,
      status: body.status,
      headline: body.headline,
      subtext: body.subtext,
      ctaLabel: body.ctaLabel,
      ctaHref: body.ctaHref,
      startsAt: toDate(body.startsAt),
      endsAt: toDate(body.endsAt),
    });
    if (!slide) return reply.code(404).send(errorBody("HERO_SLIDE_NOT_FOUND", "Hero slide not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HeroSlide",
      entityId: slide.id,
      metadata: { fields: Object.keys(body) },
    });
    return serializeHeroSlide(slide, mediaBaseUrl);
  });

  app.delete("/stores/:storeId/hero-slides/:id", async (request, reply) => {
    const params = heroParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    // R5: yalniz slide kaydi silinir; bagli MediaAsset'e dokunulmaz.
    const deleted = await dataAccess.deleteHeroSlide(params.storeId, params.id);
    if (!deleted) return reply.code(404).send(errorBody("HERO_SLIDE_NOT_FOUND", "Hero slide not found."));
    await recordAudit({
      action: "DELETE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HeroSlide",
      entityId: params.id,
    });
    return reply.code(204).send();
  });

  // Checkpoint B — siralama. Sirali id listesi gonderilir; sunucu position=index
  // yazar. id-seti mevcut slide setiyle birebir eslesmezse 400 HERO_REORDER_MISMATCH
  // (galeri diff'inin aksine burada silme YOK). Statik "/reorder" segmenti "/:id"
  // ile cakismaz (Fastify statik onceligi).
  app.post("/stores/:storeId/hero-slides/reorder", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = heroSlideReorderRequestSchema.parse(request.body);
    const result = await dataAccess.reorderHeroSlides(params.storeId, body.orderedIds);
    if (result === "MISMATCH") {
      return reply
        .code(400)
        .send(errorBody("HERO_REORDER_MISMATCH", "orderedIds must match the current slide set exactly."));
    }
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "HeroSlide",
      metadata: { reorder: body.orderedIds.length },
    });
    return heroSlideListResponseSchema.parse({
      data: result.map((slide) => serializeHeroSlide(slide, mediaBaseUrl)),
    });
  });

  // Checkpoint C — yayin durumu gecisleri: publish (PUBLISHED) / unpublish (DRAFT).
  // Kampanya activate/pause/archive dongu deseni; hafif {id,status} yaniti.
  for (const [action, status] of [
    ["publish", "PUBLISHED"],
    ["unpublish", "DRAFT"],
  ] as const) {
    app.post(`/stores/:storeId/hero-slides/:id/${action}`, async (request, reply) => {
      const params = heroParam.parse(request.params);
      const access = await requireStoreAdmin(request, reply, params.storeId);
      if (!access) return;
      const slide = await dataAccess.setHeroSlideStatus(params.storeId, params.id, status);
      if (!slide) return reply.code(404).send(errorBody("HERO_SLIDE_NOT_FOUND", "Hero slide not found."));
      await recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "HeroSlide",
        entityId: slide.id,
        metadata: { statusAction: action },
      });
      return heroSlideStatusActionResponseSchema.parse({ id: slide.id, status: slide.status });
    });
  }
}
