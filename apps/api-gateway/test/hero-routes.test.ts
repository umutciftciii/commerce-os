import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

// hero/data.js -> @commerce-os/db (prisma) import eder; testte gercek prisma
// init'ini engellemek icin bos stub yeter (dataAccess'i mock obje olarak geciriyoruz,
// prisma hic cagrilmaz).
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const { registerHeroAdminRoutes } = await import("../src/hero/routes.js");
type HeroAdminRoutesDeps = Parameters<typeof registerHeroAdminRoutes>[1];

type DataAccessMock = {
  listHeroSlides: ReturnType<typeof vi.fn>;
  findHeroSlideById: ReturnType<typeof vi.fn>;
  findMediaAssetById: ReturnType<typeof vi.fn>;
  createHeroSlide: ReturnType<typeof vi.fn>;
  updateHeroSlide: ReturnType<typeof vi.fn>;
  deleteHeroSlide: ReturnType<typeof vi.fn>;
  reorderHeroSlides: ReturnType<typeof vi.fn>;
  setHeroSlideStatus: ReturnType<typeof vi.fn>;
};

// media.storageKey serialize'da mediaUrl'e turetilir (mediaBaseUrl verilmez → /media/<key>).
const SLIDE = {
  id: "hero_1",
  mediaId: "media_1",
  position: 0,
  status: "DRAFT" as const,
  headline: "Yaz koleksiyonu",
  subtext: null,
  ctaLabel: null,
  ctaHref: null,
  startsAt: null,
  endsAt: null,
  createdAt: new Date("2026-07-11T00:00:00.000Z"),
  updatedAt: new Date("2026-07-11T00:00:00.000Z"),
  media: { storageKey: "stores/store_123/hero/abc.webp" },
};

const HERO_MEDIA = { id: "media_1", context: "HERO" };

function buildApp(opts?: {
  storeAdmin?: HeroAdminRoutesDeps["requireStoreAdmin"];
  dataAccess?: Partial<DataAccessMock>;
}) {
  const dataAccess: DataAccessMock = {
    listHeroSlides: vi.fn().mockResolvedValue([SLIDE]),
    findHeroSlideById: vi.fn().mockResolvedValue(SLIDE),
    findMediaAssetById: vi.fn().mockResolvedValue(HERO_MEDIA),
    createHeroSlide: vi.fn().mockResolvedValue(SLIDE),
    updateHeroSlide: vi.fn().mockResolvedValue(SLIDE),
    deleteHeroSlide: vi.fn().mockResolvedValue(true),
    reorderHeroSlides: vi.fn().mockResolvedValue([SLIDE]),
    setHeroSlideStatus: vi.fn().mockResolvedValue({ ...SLIDE, status: "PUBLISHED" as const }),
    ...opts?.dataAccess,
  };
  const recordAudit = vi.fn(async () => {});
  const app = Fastify();
  registerHeroAdminRoutes(app, {
    dataAccess: dataAccess as unknown as HeroAdminRoutesDeps["dataAccess"],
    requireStoreAdmin: opts?.storeAdmin ?? (async () => ({ actorUserId: "user_1" })),
    recordAudit,
  });
  return { app, dataAccess, recordAudit };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("hero-slides admin routes", () => {
  describe("GET /stores/:storeId/hero-slides", () => {
    it("liste 200; mediaUrl storageKey'den turetilir", async () => {
      const { app, dataAccess } = buildApp();
      const res = await app.inject({ method: "GET", url: "/stores/store_123/hero-slides" });

      expect(res.statusCode).toBe(200);
      expect(dataAccess.listHeroSlides).toHaveBeenCalledWith("store_123");
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        id: "hero_1",
        mediaId: "media_1",
        mediaUrl: "/media/stores/store_123/hero/abc.webp",
        status: "DRAFT",
        headline: "Yaz koleksiyonu",
      });
    });
  });

  describe("POST /stores/:storeId/hero-slides", () => {
    it("gecerli HERO media → 201; createHeroSlide + audit cagrildi", async () => {
      const { app, dataAccess, recordAudit } = buildApp();
      const res = await app.inject({
        method: "POST",
        url: "/stores/store_123/hero-slides",
        payload: { mediaId: "media_1", headline: "Yaz koleksiyonu" },
      });

      expect(res.statusCode).toBe(201);
      expect(dataAccess.findMediaAssetById).toHaveBeenCalledWith("store_123", "media_1");
      expect(dataAccess.createHeroSlide).toHaveBeenCalledTimes(1);
      // status gonderilmedi → data access default DRAFT ile create eder.
      expect(dataAccess.createHeroSlide.mock.calls[0][1]).toMatchObject({
        mediaId: "media_1",
        headline: "Yaz koleksiyonu",
      });
      expect(recordAudit).toHaveBeenCalledTimes(1);
      expect(recordAudit.mock.calls[0][0]).toMatchObject({
        action: "CREATE",
        entityType: "HeroSlide",
        entityId: "hero_1",
        storeId: "store_123",
      });
    });

    it("media context HERO degil → 400 INVALID_IMAGE_REFERENCE; create yok", async () => {
      const { app, dataAccess, recordAudit } = buildApp({
        dataAccess: { findMediaAssetById: vi.fn().mockResolvedValue({ id: "media_1", context: "PRODUCT" }) },
      });
      const res = await app.inject({
        method: "POST",
        url: "/stores/store_123/hero-slides",
        payload: { mediaId: "media_1" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_IMAGE_REFERENCE");
      expect(dataAccess.createHeroSlide).not.toHaveBeenCalled();
      expect(recordAudit).not.toHaveBeenCalled();
    });

    it("media baska store'a ait / bulunamadi (null) → 400; create yok", async () => {
      const { app, dataAccess } = buildApp({
        dataAccess: { findMediaAssetById: vi.fn().mockResolvedValue(null) },
      });
      const res = await app.inject({
        method: "POST",
        url: "/stores/store_123/hero-slides",
        payload: { mediaId: "media_x" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_IMAGE_REFERENCE");
      expect(dataAccess.createHeroSlide).not.toHaveBeenCalled();
    });
  });

  describe("GET /stores/:storeId/hero-slides/:id", () => {
    it("bulundu → 200", async () => {
      const { app } = buildApp();
      const res = await app.inject({ method: "GET", url: "/stores/store_123/hero-slides/hero_1" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: "hero_1", mediaUrl: "/media/stores/store_123/hero/abc.webp" });
    });

    it("baska store / bulunamadi → 404 (tenant izolasyonu)", async () => {
      const { app, dataAccess } = buildApp({
        dataAccess: { findHeroSlideById: vi.fn().mockResolvedValue(null) },
      });
      const res = await app.inject({ method: "GET", url: "/stores/store_999/hero-slides/hero_1" });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("HERO_SLIDE_NOT_FOUND");
      expect(dataAccess.findHeroSlideById).toHaveBeenCalledWith("store_999", "hero_1");
    });
  });

  describe("PATCH /stores/:storeId/hero-slides/:id", () => {
    it("gecerli guncelleme → 200 + audit", async () => {
      const { app, dataAccess, recordAudit } = buildApp();
      const res = await app.inject({
        method: "PATCH",
        url: "/stores/store_123/hero-slides/hero_1",
        payload: { headline: "Kis" },
      });
      expect(res.statusCode).toBe(200);
      expect(dataAccess.updateHeroSlide).toHaveBeenCalledTimes(1);
      expect(recordAudit.mock.calls[0][0]).toMatchObject({ action: "UPDATE", entityType: "HeroSlide" });
    });

    it("mediaId gonderilir ve HERO degil → 400; update yok", async () => {
      const { app, dataAccess } = buildApp({
        dataAccess: { findMediaAssetById: vi.fn().mockResolvedValue({ id: "m", context: "BRANDING" }) },
      });
      const res = await app.inject({
        method: "PATCH",
        url: "/stores/store_123/hero-slides/hero_1",
        payload: { mediaId: "m" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_IMAGE_REFERENCE");
      expect(dataAccess.updateHeroSlide).not.toHaveBeenCalled();
    });

    it("slide bulunamadi → 404", async () => {
      const { app } = buildApp({
        dataAccess: { updateHeroSlide: vi.fn().mockResolvedValue(null) },
      });
      const res = await app.inject({
        method: "PATCH",
        url: "/stores/store_123/hero-slides/nope",
        payload: { headline: "x" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("HERO_SLIDE_NOT_FOUND");
    });
  });

  describe("DELETE /stores/:storeId/hero-slides/:id", () => {
    it("silme → 204; deleteHeroSlide + audit; media'ya dokunulmaz (R5)", async () => {
      const { app, dataAccess, recordAudit } = buildApp();
      const res = await app.inject({ method: "DELETE", url: "/stores/store_123/hero-slides/hero_1" });

      expect(res.statusCode).toBe(204);
      expect(res.body).toBe("");
      expect(dataAccess.deleteHeroSlide).toHaveBeenCalledWith("store_123", "hero_1");
      // R5: slide silme akisi media silme metodu icermez (dataAccess'te boyle bir metod yok).
      expect(recordAudit.mock.calls[0][0]).toMatchObject({
        action: "DELETE",
        entityType: "HeroSlide",
        entityId: "hero_1",
      });
    });

    it("bulunamadi (false) → 404; audit yok", async () => {
      const { app, recordAudit } = buildApp({
        dataAccess: { deleteHeroSlide: vi.fn().mockResolvedValue(false) },
      });
      const res = await app.inject({ method: "DELETE", url: "/stores/store_123/hero-slides/nope" });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("HERO_SLIDE_NOT_FOUND");
      expect(recordAudit).not.toHaveBeenCalled();
    });
  });

  describe("POST /stores/:storeId/hero-slides/reorder", () => {
    it("gecerli sirali liste → 200 + audit; reorderHeroSlides cagrildi", async () => {
      const { app, dataAccess, recordAudit } = buildApp();
      const res = await app.inject({
        method: "POST",
        url: "/stores/store_123/hero-slides/reorder",
        payload: { orderedIds: ["hero_1"] },
      });

      expect(res.statusCode).toBe(200);
      expect(dataAccess.reorderHeroSlides).toHaveBeenCalledWith("store_123", ["hero_1"]);
      expect(res.json().data).toHaveLength(1);
      expect(recordAudit.mock.calls[0][0]).toMatchObject({ action: "UPDATE", entityType: "HeroSlide" });
    });

    it("id-set uyumsuz (MISMATCH) → 400 HERO_REORDER_MISMATCH; audit yok", async () => {
      const { app, recordAudit } = buildApp({
        dataAccess: { reorderHeroSlides: vi.fn().mockResolvedValue("MISMATCH") },
      });
      const res = await app.inject({
        method: "POST",
        url: "/stores/store_123/hero-slides/reorder",
        payload: { orderedIds: ["hero_1", "ghost"] },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("HERO_REORDER_MISMATCH");
      expect(recordAudit).not.toHaveBeenCalled();
    });
  });

  describe("publish / unpublish", () => {
    it("publish → 200, status PUBLISHED; setHeroSlideStatus(...,'PUBLISHED') + audit", async () => {
      const { app, dataAccess, recordAudit } = buildApp();
      const res = await app.inject({ method: "POST", url: "/stores/store_123/hero-slides/hero_1/publish" });

      expect(res.statusCode).toBe(200);
      expect(dataAccess.setHeroSlideStatus).toHaveBeenCalledWith("store_123", "hero_1", "PUBLISHED");
      expect(res.json()).toEqual({ id: "hero_1", status: "PUBLISHED" });
      expect(recordAudit.mock.calls[0][0]).toMatchObject({ metadata: { statusAction: "publish" } });
    });

    it("unpublish → 200, status DRAFT; setHeroSlideStatus(...,'DRAFT')", async () => {
      const { app, dataAccess } = buildApp({
        dataAccess: { setHeroSlideStatus: vi.fn().mockResolvedValue({ ...SLIDE, status: "DRAFT" }) },
      });
      const res = await app.inject({ method: "POST", url: "/stores/store_123/hero-slides/hero_1/unpublish" });

      expect(res.statusCode).toBe(200);
      expect(dataAccess.setHeroSlideStatus).toHaveBeenCalledWith("store_123", "hero_1", "DRAFT");
      expect(res.json().status).toBe("DRAFT");
    });

    it("publish: slide bulunamadi → 404", async () => {
      const { app } = buildApp({
        dataAccess: { setHeroSlideStatus: vi.fn().mockResolvedValue(null) },
      });
      const res = await app.inject({ method: "POST", url: "/stores/store_123/hero-slides/nope/publish" });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("HERO_SLIDE_NOT_FOUND");
    });
  });

  it("requireStoreAdmin reddi → guard kodu; hicbir dataAccess cagrisi yok", async () => {
    const { app, dataAccess } = buildApp({
      storeAdmin: async (_req, reply) => {
        await reply.code(403).send({ error: { code: "FORBIDDEN", message: "Forbidden." } });
        return null;
      },
    });
    const res = await app.inject({ method: "GET", url: "/stores/store_123/hero-slides" });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
    expect(dataAccess.listHeroSlides).not.toHaveBeenCalled();
  });
});
