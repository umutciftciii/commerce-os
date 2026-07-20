import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

// home/data.js -> @commerce-os/db (prisma) import eder; testte gerçek prisma init'ini
// engellemek için boş stub yeter (dataAccess mock obje olarak geçirilir; prisma çağrılmaz).
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const { registerHomeAdminRoutes } = await import("../src/home/routes.js");
type HomeAdminRoutesDeps = Parameters<typeof registerHomeAdminRoutes>[1];

function sectionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "sec_1",
    type: "HERO_SLIDER",
    title: null,
    subtitle: null,
    enabled: true,
    sortOrder: 0,
    desktopVisible: true,
    mobileVisible: true,
    publishStart: null,
    publishEnd: null,
    config: {},
    createdAt: new Date("2026-07-20T00:00:00.000Z"),
    updatedAt: new Date("2026-07-20T00:00:00.000Z"),
    ...overrides,
  };
}

const HERO_SLIDE_RECORD = {
  id: "slide_1",
  sectionId: "sec_1",
  mediaId: "media_1",
  mobileMediaId: null,
  videoUrl: null,
  headline: "Yaz",
  subtext: null,
  ctaLabel: null,
  ctaHref: null,
  targetProductId: null,
  targetCategoryId: null,
  targetCampaignId: null,
  enabled: true,
  sortOrder: 0,
  publishStart: null,
  publishEnd: null,
  createdAt: new Date("2026-07-20T00:00:00.000Z"),
  updatedAt: new Date("2026-07-20T00:00:00.000Z"),
  media: { storageKey: "enterprise-demo/hero/a.webp" },
  mobileMedia: null,
};

const FEATURED_RECORD = {
  id: "feat_1",
  sectionId: "sec_2",
  categoryId: "cat_1",
  imageMediaId: null,
  titleOverride: null,
  descriptionOverride: null,
  enabled: true,
  sortOrder: 0,
  createdAt: new Date("2026-07-20T00:00:00.000Z"),
  updatedAt: new Date("2026-07-20T00:00:00.000Z"),
  category: { slug: "elektronik", name: "Elektronik", status: "ACTIVE", image: null },
  image: null,
};

function buildApp(over?: { dataAccess?: Record<string, unknown> }) {
  const dataAccess = {
    listSections: vi.fn().mockResolvedValue([sectionRecord()]),
    findSection: vi.fn().mockResolvedValue(sectionRecord()),
    createSection: vi.fn().mockResolvedValue(sectionRecord()),
    updateSection: vi.fn().mockResolvedValue(sectionRecord()),
    deleteSection: vi.fn().mockResolvedValue(true),
    reorderSections: vi.fn().mockResolvedValue([sectionRecord()]),
    findMediaAssetById: vi.fn().mockResolvedValue({ id: "media_1", context: "HERO" }),
    categoryExists: vi.fn().mockResolvedValue(true),
    productExists: vi.fn().mockResolvedValue(true),
    campaignExists: vi.fn().mockResolvedValue(true),
    listHeroSlides: vi.fn().mockResolvedValue([HERO_SLIDE_RECORD]),
    createHeroSlide: vi.fn().mockResolvedValue(HERO_SLIDE_RECORD),
    updateHeroSlide: vi.fn().mockResolvedValue(HERO_SLIDE_RECORD),
    deleteHeroSlide: vi.fn().mockResolvedValue(true),
    reorderHeroSlides: vi.fn().mockResolvedValue([HERO_SLIDE_RECORD]),
    listFeaturedCategories: vi.fn().mockResolvedValue([FEATURED_RECORD]),
    createFeaturedCategory: vi.fn().mockResolvedValue(FEATURED_RECORD),
    updateFeaturedCategory: vi.fn().mockResolvedValue(FEATURED_RECORD),
    deleteFeaturedCategory: vi.fn().mockResolvedValue(true),
    reorderFeaturedCategories: vi.fn().mockResolvedValue([FEATURED_RECORD]),
    listShowcaseProducts: vi.fn().mockResolvedValue([]),
    setShowcaseProducts: vi.fn().mockResolvedValue([]),
    ...over?.dataAccess,
  };
  const recordAudit = vi.fn(async () => {});
  const app = Fastify();
  registerHomeAdminRoutes(app, {
    dataAccess: dataAccess as unknown as HomeAdminRoutesDeps["dataAccess"],
    resolveProductCovers: async () => new Map(),
    requireStoreAdmin: async () => ({ actorUserId: "user_1" }),
    recordAudit,
  });
  return { app, dataAccess, recordAudit };
}

afterEach(() => vi.clearAllMocks());

describe("home-experience admin routes", () => {
  it("GET sections → 200 + serialize", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "GET", url: "/stores/s1/home/sections" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0]).toMatchObject({ id: "sec_1", type: "HERO_SLIDER" });
  });

  it("POST section HERO_SLIDER → 201; config normalize edilir", async () => {
    const { app, dataAccess, recordAudit } = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/home/sections",
      payload: { type: "HERO_SLIDER", config: { autoplayMs: 5000 } },
    });
    expect(res.statusCode).toBe(201);
    expect(dataAccess.createSection).toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalled();
  });

  it("POST section PRODUCT_SHOWCASE config'siz → default MANUAL kabul (201)", async () => {
    const { app } = buildApp({
      dataAccess: { createSection: vi.fn().mockResolvedValue(sectionRecord({ type: "PRODUCT_SHOWCASE" })) },
    });
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/home/sections",
      payload: { type: "PRODUCT_SHOWCASE" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("POST section PRODUCT_SHOWCASE geçersiz config → 400 INVALID_SECTION_CONFIG", async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/home/sections",
      payload: { type: "PRODUCT_SHOWCASE", config: { source: { kind: "DYNAMIC", rule: "NOPE" } } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_SECTION_CONFIG");
  });

  it("POST reorder set uyumsuz → 400 HOME_SECTION_REORDER_MISMATCH", async () => {
    const { app } = buildApp({ dataAccess: { reorderSections: vi.fn().mockResolvedValue("MISMATCH") } });
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/home/sections/reorder",
      payload: { orderedIds: ["sec_1"] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("HOME_SECTION_REORDER_MISMATCH");
  });

  it("POST hero-slide geçerli HERO media → 201", async () => {
    const { app, dataAccess } = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/home/sections/sec_1/hero-slides",
      payload: { mediaId: "media_1", headline: "Merhaba" },
    });
    expect(res.statusCode).toBe(201);
    expect(dataAccess.createHeroSlide).toHaveBeenCalled();
    expect(res.json()).toMatchObject({ id: "slide_1", mediaUrl: "/media/enterprise-demo/hero/a.webp" });
  });

  it("POST hero-slide non-HERO media → 400 INVALID_IMAGE_REFERENCE", async () => {
    const { app } = buildApp({
      dataAccess: { findMediaAssetById: vi.fn().mockResolvedValue({ id: "m", context: "CATEGORY" }) },
    });
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/home/sections/sec_1/hero-slides",
      payload: { mediaId: "m" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_IMAGE_REFERENCE");
  });

  it("POST hero-slide yanlış section tipinde → 400 HOME_SECTION_TYPE_MISMATCH", async () => {
    const { app } = buildApp({
      dataAccess: { findSection: vi.fn().mockResolvedValue(sectionRecord({ type: "FEATURED_CATEGORIES" })) },
    });
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/home/sections/sec_1/hero-slides",
      payload: { mediaId: "media_1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("HOME_SECTION_TYPE_MISMATCH");
  });

  it("POST featured-category duplicate → 409 FEATURED_CATEGORY_DUPLICATE", async () => {
    const { app } = buildApp({
      dataAccess: {
        findSection: vi.fn().mockResolvedValue(sectionRecord({ id: "sec_2", type: "FEATURED_CATEGORIES" })),
        createFeaturedCategory: vi.fn().mockResolvedValue("DUPLICATE"),
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/home/sections/sec_2/featured-categories",
      payload: { categoryId: "cat_1" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("FEATURED_CATEGORY_DUPLICATE");
  });

  it("PUT showcase-products DYNAMIC kaynakta → 400 SHOWCASE_NOT_MANUAL", async () => {
    const { app } = buildApp({
      dataAccess: {
        findSection: vi.fn().mockResolvedValue(
          sectionRecord({
            id: "sec_3",
            type: "PRODUCT_SHOWCASE",
            config: { layout: "GRID", maxItems: 12, source: { kind: "DYNAMIC", rule: "NEW_PRODUCTS" } },
          }),
        ),
      },
    });
    const res = await app.inject({
      method: "PUT",
      url: "/stores/s1/home/sections/sec_3/showcase-products",
      payload: { productIds: ["p1"] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("SHOWCASE_NOT_MANUAL");
  });

  it("PUT showcase-products MANUAL kaynakta → 200 + set çağrıldı", async () => {
    const setFn = vi.fn().mockResolvedValue([]);
    const { app } = buildApp({
      dataAccess: {
        findSection: vi.fn().mockResolvedValue(
          sectionRecord({
            id: "sec_4",
            type: "PRODUCT_SHOWCASE",
            config: { layout: "CAROUSEL", maxItems: 12, source: { kind: "MANUAL" } },
          }),
        ),
        setShowcaseProducts: setFn,
      },
    });
    const res = await app.inject({
      method: "PUT",
      url: "/stores/s1/home/sections/sec_4/showcase-products",
      payload: { productIds: ["p1", "p2"] },
    });
    expect(res.statusCode).toBe(200);
    expect(setFn).toHaveBeenCalledWith("s1", "sec_4", ["p1", "p2"]);
  });
});
