import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppDataAccess, createServer } from "../src/server.js";
import type { HeroDataAccess } from "../src/hero/data.js";

/**
 * ADR-065 (Faz 3/Site Kabuğu) — Public site-kabugu route entegrasyon testleri.
 * createServer + enjekte edilmis in-memory dataAccess/heroDataAccess ile GERCEK
 * route'lar app.inject ile cagrilir. Dogrulananlar:
 *  - store-info: storeName + logoUrl/faviconUrl (dolu/null); logoMediaId/
 *    faviconMediaId ALLOWLIST disinda (sizmaz).
 *  - hero-slides: yalniz PUBLISHED (route published-only metodu kullanir; admin
 *    tum-durum listesi CAGRILMAZ), position ASC, allowlist projeksiyon.
 *  - bilinmeyen/pasif slug → 404 STORE_NOT_FOUND (resolvePublicStore ile ayni).
 */
const config = {
  APP_ENV: "test" as const,
  SERVICE_NAME: "api-gateway-test",
  LOG_LEVEL: "error" as const,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  INTERNAL_API_TOKEN: "test-internal-token",
  SESSION_SECRET: "test-session-secret-with-enough-length",
  SESSION_TTL_SECONDS: 3600,
  PASSWORD_HASH_PEPPER: "test-pepper",
  ADMIN_AUTH_COOKIE_NAME: "commerce_os_admin_session",
  AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: 60,
  AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: 50,
  API_GATEWAY_PORT: 3000,
  WORKER_CONCURRENCY: 5,
  PAYMENT_SANDBOX_HTTP_ENABLED: false,
};

const demoStore = {
  id: "store_demo",
  name: "Demo Store",
  slug: "demo-store",
  status: "ACTIVE" as const,
  metadata: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

// PUBLISHED iki slide (position 0,1). listPublishedHeroSlides zaten position ASC
// dondugu icin (DB orderBy); mock sirasi da bunu yansitir. DRAFT slide burada YOK
// (published-only metod DB'de eler; hero-public.test.ts sorgu filtresini kanitlar).
const publishedSlides = [
  {
    id: "hero_a",
    mediaId: "media_a",
    position: 0,
    status: "PUBLISHED" as const,
    headline: "İlk",
    subtext: null,
    ctaLabel: "Keşfet",
    ctaHref: "/products",
    startsAt: null,
    endsAt: null,
    createdAt: new Date("2026-07-11T00:00:00.000Z"),
    updatedAt: new Date("2026-07-11T00:00:00.000Z"),
    media: { storageKey: "stores/store_demo/hero/a.webp" },
  },
  {
    id: "hero_b",
    mediaId: "media_b",
    position: 1,
    status: "PUBLISHED" as const,
    headline: "İkinci",
    subtext: "alt metin",
    ctaLabel: null,
    ctaHref: null,
    startsAt: null,
    endsAt: null,
    createdAt: new Date("2026-07-11T00:00:00.000Z"),
    updatedAt: new Date("2026-07-11T00:00:00.000Z"),
    media: { storageKey: "stores/store_demo/hero/b.webp" },
  },
];

const listHeroSlides = vi.fn();
const listPublishedHeroSlides = vi.fn();
const getStoreSettings = vi.fn();

function buildApp(settings: unknown) {
  getStoreSettings.mockResolvedValue(settings);
  listPublishedHeroSlides.mockResolvedValue(publishedSlides);
  const dataAccess = {
    async findStoreBySlug(slug: string) {
      return slug === demoStore.slug ? demoStore : null;
    },
    getStoreSettings,
  } as unknown as AppDataAccess;
  const heroDataAccess = {
    listHeroSlides,
    listPublishedHeroSlides,
  } as unknown as HeroDataAccess;
  return createServer(config, { dataAccess, heroDataAccess });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /public/stores/:slug/store-info", () => {
  it("logo+favicon bagli → *Url turetilir; logoMediaId/faviconMediaId SIZMAZ", async () => {
    const app = buildApp({
      storeId: "store_demo",
      logoMediaId: "media_logo",
      faviconMediaId: "media_fav",
      logo: { storageKey: "stores/store_demo/branding/logo.webp" },
      favicon: { storageKey: "stores/store_demo/branding/fav.webp" },
    });
    const res = await app.inject({ method: "GET", url: "/public/stores/demo-store/store-info" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      storeName: "Demo Store",
      logoUrl: "/media/stores/store_demo/branding/logo.webp",
      faviconUrl: "/media/stores/store_demo/branding/fav.webp",
    });
    // ALLOWLIST: ham FK'ler asla donmez.
    expect(body).not.toHaveProperty("logoMediaId");
    expect(body).not.toHaveProperty("faviconMediaId");
    expect(Object.keys(body).sort()).toEqual(["faviconUrl", "logoUrl", "storeName"]);
  });

  it("StoreSettings satiri yok (lazy null) → *Url null; storeName store.name'den", async () => {
    const app = buildApp(null);
    const res = await app.inject({ method: "GET", url: "/public/stores/demo-store/store-info" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ storeName: "Demo Store", logoUrl: null, faviconUrl: null });
  });

  it("bilinmeyen slug → 404 STORE_NOT_FOUND", async () => {
    const app = buildApp(null);
    const res = await app.inject({ method: "GET", url: "/public/stores/ghost/store-info" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("STORE_NOT_FOUND");
  });
});

describe("GET /public/stores/:slug/hero-slides", () => {
  it("yalniz PUBLISHED (published-only metod), position ASC, allowlist projeksiyon", async () => {
    const app = buildApp(null);
    const res = await app.inject({ method: "GET", url: "/public/stores/demo-store/hero-slides" });

    expect(res.statusCode).toBe(200);
    // KRITIK: route published-only metodu cagirir; admin tum-durum listesi HIC cagrilmaz
    // → DRAFT gateway'e bile gelmez (DB filtresi hero-public.test.ts'te kanitlanir).
    expect(listPublishedHeroSlides).toHaveBeenCalledWith("store_demo");
    expect(listHeroSlides).not.toHaveBeenCalled();

    const body = res.json();
    expect(body.data).toHaveLength(2);
    // position ASC sirasi korunur.
    expect(body.data.map((s: { key: string }) => s.key)).toEqual(["hero_a", "hero_b"]);
    // Allowlist: her slide yalniz public-safe alanlar; mediaId/status/zamanlama yok.
    expect(Object.keys(body.data[0]).sort()).toEqual(
      ["ctaHref", "ctaLabel", "headline", "key", "mediaUrl", "position", "subtext"].sort(),
    );
    for (const slide of body.data) {
      for (const leaked of ["mediaId", "status", "startsAt", "endsAt", "createdAt", "updatedAt"]) {
        expect(slide).not.toHaveProperty(leaked);
      }
    }
    expect(body.data[0]).toMatchObject({
      key: "hero_a",
      mediaUrl: "/media/stores/store_demo/hero/a.webp",
      headline: "İlk",
      ctaLabel: "Keşfet",
      ctaHref: "/products",
      position: 0,
    });
  });

  it("bilinmeyen slug → 404 STORE_NOT_FOUND", async () => {
    const app = buildApp(null);
    const res = await app.inject({ method: "GET", url: "/public/stores/ghost/hero-slides" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("STORE_NOT_FOUND");
    expect(listPublishedHeroSlides).not.toHaveBeenCalled();
  });
});
