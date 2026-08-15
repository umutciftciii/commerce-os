/**
 * TODO-165A (ADR-165A) — Brand (Marka) HTTP route entegrasyon testleri.
 *
 * Saf servis/veri-erişim mantığı `brand-service.test.ts`'te kapsandı (Task 5). Bu dosya HTTP
 * katmanını doğrular: `createServer` + gerçek `registerBrandRoutes` wiring (CATALOG capability
 * gate) + `app.inject`. `BrandDataAccess` yerine hafif in-memory double `dependencies.brandDataAccess`
 * üzerinden enjekte edilir (CATALOG core/always-on olduğundan capability her zaman geçer — fail-closed
 * dahi core=açık). Kapsanan: create→list→get→patch→archive→restore mutlu yol, 409 dup slug, 403
 * cross-store media, tenant izolasyonu (cross-store id → 404), selector `?ids=` sıra + cross-store
 * düşürme, 401 unauthenticated, `/products` sayaç ucu.
 */
import { describe, expect, it } from "vitest";
import { type AppDataAccess, createServer } from "../src/server.js";
import { createStoreAuthDataFake } from "./helpers/store-auth-fixture.js";
import type {
  BrandCreateData,
  BrandDataAccess,
  BrandListCriteria,
  BrandProductRecord,
  BrandRecord,
  BrandSelectorCriteria,
  BrandStatus,
  BrandUpdateData,
} from "../src/brand/brand-data.js";

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
  MEDIA_PUBLIC_BASE_URL: "",
};

const STORE_A = "store_a";
const STORE_B = "store_b";

function store(id: string) {
  return {
    id,
    name: `Demo ${id}`,
    slug: id,
    status: "ACTIVE" as const,
    metadata: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

const STORES = new Map([
  [STORE_A, store(STORE_A)],
  [STORE_B, store(STORE_B)],
]);

const AUTH = { authorization: "Bearer admin-token" };
// Faz E2 — StoreUser oturumu tek-mağazalıdır. store_b'ye yapılan HTTP istekleri (kurulum
// create'leri + store_b'den store_a markasının GÖRÜNMEZLİĞİ) için store_b'nin KENDİ OWNER
// token'ı; böylece guard mağaza kapısını geçer ve izolasyon handler katmanında (BRAND_NOT_FOUND)
// kanıtlanır (eski PlatformUser SUPER_ADMIN'in tüm-mağaza erişimini birebir modeller).
const AUTH_B = { authorization: "Bearer admin-token-b" };

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

/** TODO-159B (ADR-090) desenini mirror eden hafif in-memory `BrandDataAccess` fake'i. */
function createFakeBrandDataAccess(): BrandDataAccess & {
  mediaByStore: Map<string, string>;
  productsByBrandId: Map<string, BrandProductRecord[]>;
} {
  const rows = new Map<string, BrandRecord>();
  // mediaId -> storeId (cross-tenant baglama reddi testi icin).
  const mediaByStore = new Map<string, string>();
  // TODO-165A (ADR-165A) Task 15/16 gap — brandId -> urun listesi (testin seedledigi sabit veri).
  const productsByBrandId = new Map<string, BrandProductRecord[]>();

  function matches(row: BrandRecord, criteria: { search?: string; status?: BrandStatus }): boolean {
    if (criteria.status && row.status !== criteria.status) return false;
    if (criteria.search) {
      const needle = criteria.search.toLowerCase();
      if (!row.name.toLowerCase().includes(needle) && !row.slug.toLowerCase().includes(needle)) return false;
    }
    return true;
  }

  function sortRows(list: BrandRecord[], sortBy: string | undefined, sortOrder: "asc" | "desc" | undefined) {
    const order = sortOrder === "desc" ? -1 : 1;
    const key = sortBy ?? "createdAt";
    return [...list].sort((a, b) => {
      const av = key === "productCount" ? a.productCount : key === "name" ? a.name : a.createdAt.getTime();
      const bv = key === "productCount" ? b.productCount : key === "name" ? b.name : b.createdAt.getTime();
      if (av < bv) return -1 * order;
      if (av > bv) return 1 * order;
      return 0;
    });
  }

  async function list(storeId: string, criteria: BrandListCriteria) {
    const all = [...rows.values()].filter((r) => r.storeId === storeId && matches(r, criteria));
    const sorted = sortRows(all, criteria.sortBy, criteria.sortOrder);
    return { data: sorted.slice(criteria.offset, criteria.offset + criteria.limit), total: sorted.length };
  }

  return {
    mediaByStore,
    productsByBrandId,
    list,
    async get(storeId, id) {
      const row = rows.get(id);
      return row && row.storeId === storeId ? row : null;
    },
    async findBySlug(storeId, slug) {
      return [...rows.values()].find((r) => r.storeId === storeId && r.slug === slug) ?? null;
    },
    async create(input: BrandCreateData) {
      const now = new Date();
      const row: BrandRecord = {
        id: nextId("brand"),
        storeId: input.storeId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        logoMediaId: input.logoMediaId,
        logoStorageKey: input.logoMediaId ? `stores/${input.storeId}/brands/${input.logoMediaId}.webp` : null,
        coverMediaId: input.coverMediaId,
        coverStorageKey: input.coverMediaId ? `stores/${input.storeId}/brands/${input.coverMediaId}.webp` : null,
        websiteUrl: input.websiteUrl,
        status: input.status,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        productCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(row.id, row);
      return row;
    },
    async update(storeId, id, patch: BrandUpdateData) {
      const row = rows.get(id);
      if (!row) throw new Error("not found");
      const next: BrandRecord = {
        ...row,
        name: patch.name !== undefined ? patch.name : row.name,
        slug: patch.slug !== undefined ? patch.slug : row.slug,
        description: patch.description !== undefined ? patch.description : row.description,
        logoMediaId: patch.logoMediaId !== undefined ? patch.logoMediaId : row.logoMediaId,
        logoStorageKey:
          patch.logoMediaId !== undefined
            ? patch.logoMediaId
              ? `stores/${storeId}/brands/${patch.logoMediaId}.webp`
              : null
            : row.logoStorageKey,
        coverMediaId: patch.coverMediaId !== undefined ? patch.coverMediaId : row.coverMediaId,
        coverStorageKey:
          patch.coverMediaId !== undefined
            ? patch.coverMediaId
              ? `stores/${storeId}/brands/${patch.coverMediaId}.webp`
              : null
            : row.coverStorageKey,
        websiteUrl: patch.websiteUrl !== undefined ? patch.websiteUrl : row.websiteUrl,
        status: patch.status !== undefined ? patch.status : row.status,
        seoTitle: patch.seoTitle !== undefined ? patch.seoTitle : row.seoTitle,
        seoDescription: patch.seoDescription !== undefined ? patch.seoDescription : row.seoDescription,
        updatedAt: new Date(),
      };
      rows.set(id, next);
      return next;
    },
    async setStatus(storeId, id, status) {
      const row = rows.get(id);
      if (!row) throw new Error("not found");
      const next = { ...row, status, updatedAt: new Date() };
      rows.set(id, next);
      return next;
    },
    async selector(storeId: string, criteria: BrandSelectorCriteria) {
      if (criteria.ids && criteria.ids.length > 0) {
        const data = criteria.ids
          .map((id) => rows.get(id))
          .filter((row): row is BrandRecord => !!row && row.storeId === storeId);
        return { data, total: data.length };
      }
      return list(storeId, criteria);
    },
    async productCount(storeId, brandId) {
      const row = rows.get(brandId);
      return row && row.storeId === storeId ? row.productCount : 0;
    },
    async productsByBrand(storeId, brandIds) {
      const map = new Map<string, number>();
      for (const id of brandIds) {
        const row = rows.get(id);
        map.set(id, row && row.storeId === storeId ? row.productCount : 0);
      }
      return map;
    },
    async visibleProductCounts(storeId, brandIds) {
      const map = new Map<string, number>();
      for (const id of brandIds) {
        const row = rows.get(id);
        map.set(id, row && row.storeId === storeId ? row.productCount : 0);
      }
      return map;
    },
    async mediaBelongsToStore(storeId, mediaId) {
      return mediaByStore.get(mediaId) === storeId;
    },
    async listProducts(storeId, brandId, criteria) {
      const brand = rows.get(brandId);
      // Cross-store id icin bos liste (route zaten oncesinde service.get() ile 404 uretir;
      // burasi savunma katmanidir).
      if (!brand || brand.storeId !== storeId) return { data: [], total: 0 };
      const all = productsByBrandId.get(brandId) ?? [];
      const filtered = criteria.search
        ? all.filter((p) => p.title.toLowerCase().includes(criteria.search!.toLowerCase()))
        : all;
      return {
        data: filtered.slice(criteria.offset, criteria.offset + criteria.limit),
        total: filtered.length,
      };
    },
  };
}

function buildApp() {
  const brandDataAccess = createFakeBrandDataAccess();
  const auditLogs: Array<{ action: string; storeId?: string; entityType: string; entityId?: string }> = [];

  const dataAccess = {
    async findPlatformSessionByTokenHash() {
      return {
        id: "sess_1",
        expiresAt: new Date(Date.now() + 3_600_000),
        // ADR-271 — iki-kapili omur alanlari (gecerli/taze oturum fake'i).
        lastActivityAt: new Date(),
        absoluteExpiresAt: new Date(Date.now() + 3_600_000),
        rememberMe: false,
        revokedAt: null,
        platformUser: {
          id: "pu_1",
          email: "admin@commerce-os.dev",
          name: "Admin",
          passwordHash: "x",
          role: "SUPER_ADMIN" as const,
        },
      };
    },
    async findStoreById(id: string) {
      return STORES.get(id) ?? null;
    },
    async createAuditLog(input: { action: string; storeId?: string; entityType: string; entityId?: string }) {
      auditLogs.push(input);
    },
  } as unknown as AppDataAccess;

  const app = createServer(config, {
    dataAccess,
    brandDataAccess,
    storeAuthData: createStoreAuthDataFake(
      [
        { token: "admin-token", storeId: STORE_A, role: "OWNER" },
        { token: "admin-token-b", storeId: STORE_B, role: "OWNER" },
      ],
      config.SESSION_SECRET,
    ),
  });
  return { app, brandDataAccess, auditLogs };
}

function brandBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Nike",
    ...overrides,
  };
}

describe("Brand routes — mutlu yol (create → list → get → patch → archive → restore)", () => {
  it("marka olusturur, listeler, tekil getirir, gunceller, arsivler ve geri yukler", async () => {
    const { app, auditLogs } = buildApp();

    const createRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/brands`,
      headers: AUTH,
      payload: brandBody(),
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json().data;
    expect(created.name).toBe("Nike");
    expect(created.slug).toBe("nike");
    expect(created.status).toBe("ACTIVE");
    expect(created.productCount).toBe(0);
    expect(auditLogs).toContainEqual(
      expect.objectContaining({ action: "CREATE", entityType: "Brand", entityId: created.id }),
    );

    const listRes = await app.inject({ method: "GET", url: `/stores/${STORE_A}/brands`, headers: AUTH });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data).toHaveLength(1);
    expect(listRes.json().pagination.totalItems).toBe(1);

    const getRes = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/brands/${created.id}`,
      headers: AUTH,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().data.id).toBe(created.id);

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE_A}/brands/${created.id}`,
      headers: AUTH,
      payload: { name: "Nike Inc." },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().data.name).toBe("Nike Inc.");
    expect(auditLogs).toContainEqual(
      expect.objectContaining({ action: "UPDATE", entityType: "Brand", entityId: created.id }),
    );

    const archiveRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/brands/${created.id}/archive`,
      headers: AUTH,
    });
    expect(archiveRes.statusCode).toBe(200);
    expect(archiveRes.json().data.status).toBe("ARCHIVED");

    const restoreRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/brands/${created.id}/restore`,
      headers: AUTH,
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().data.status).toBe("ACTIVE");
  });
});

describe("Brand routes — 409 slug catismasi", () => {
  it("ayni magazada ayni slug ikinci kez olusturulamaz (BRAND_SLUG_TAKEN)", async () => {
    const { app } = buildApp();
    await app.inject({ method: "POST", url: `/stores/${STORE_A}/brands`, headers: AUTH, payload: brandBody() });
    const dupRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/brands`,
      headers: AUTH,
      payload: brandBody(),
    });
    expect(dupRes.statusCode).toBe(409);
    expect(dupRes.json().error.code).toBe("BRAND_SLUG_TAKEN");
  });
});

describe("Brand routes — 403 cross-store medya baglama", () => {
  it("baska magazaya ait logoMediaId ile marka olusturulamaz (BRAND_MEDIA_CROSS_STORE)", async () => {
    const { app, brandDataAccess } = buildApp();
    brandDataAccess.mediaByStore.set("media_b", STORE_B);

    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/brands`,
      headers: AUTH,
      payload: brandBody({ logoMediaId: "media_b" }),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("BRAND_MEDIA_CROSS_STORE");
  });

  it("ayni magazaya ait logoMediaId kabul edilir ve logoUrl turetilir", async () => {
    const { app, brandDataAccess } = buildApp();
    brandDataAccess.mediaByStore.set("media_a", STORE_A);

    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/brands`,
      headers: AUTH,
      payload: brandBody({ logoMediaId: "media_a" }),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.logoUrl).toBe(`/media/stores/${STORE_A}/brands/media_a.webp`);
  });
});

describe("Brand routes — tenant izolasyonu", () => {
  it("baska magazanin marka id'si icin GET/PATCH/archive 404 doner", async () => {
    const { app } = buildApp();
    const createRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/brands`,
      headers: AUTH,
      payload: brandBody(),
    });
    const brandId = createRes.json().data.id;

    const getRes = await app.inject({
      method: "GET",
      url: `/stores/${STORE_B}/brands/${brandId}`,
      headers: AUTH_B,
    });
    expect(getRes.statusCode).toBe(404);
    expect(getRes.json().error.code).toBe("BRAND_NOT_FOUND");

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE_B}/brands/${brandId}`,
      headers: AUTH_B,
      payload: { name: "Hijack" },
    });
    expect(patchRes.statusCode).toBe(404);

    const archiveRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_B}/brands/${brandId}/archive`,
      headers: AUTH_B,
    });
    expect(archiveRes.statusCode).toBe(404);

    // Store A'dan bakildiginda hala erisilebilir (yalniz cross-store engellenir).
    const ownRes = await app.inject({ method: "GET", url: `/stores/${STORE_A}/brands/${brandId}`, headers: AUTH });
    expect(ownRes.statusCode).toBe(200);
  });

  it("bilinmeyen (var olmayan) storeId icin 404 STORE_ACCESS_DENIED doner", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "GET", url: `/stores/store_unknown/brands`, headers: AUTH });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("STORE_ACCESS_DENIED");
  });
});

describe("GET /stores/:storeId/brands/selector — ids cozum modu", () => {
  it("sirayi korur ve baska magazanin id'sini sessizce dusurur", async () => {
    const { app } = buildApp();
    const nike = (
      await app.inject({ method: "POST", url: `/stores/${STORE_A}/brands`, headers: AUTH, payload: brandBody({ name: "Nike" }) })
    ).json().data;
    const adidas = (
      await app.inject({
        method: "POST",
        url: `/stores/${STORE_A}/brands`,
        headers: AUTH,
        payload: brandBody({ name: "Adidas" }),
      })
    ).json().data;
    const otherStoreBrand = (
      await app.inject({
        method: "POST",
        url: `/stores/${STORE_B}/brands`,
        headers: AUTH_B,
        payload: brandBody({ name: "Puma" }),
      })
    ).json().data;

    // Istemci sirasi: adidas, otherStoreBrand (yabanci), nike.
    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/brands/selector?ids=${adidas.id},${otherStoreBrand.id},${nike.id}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((b: { id: string }) => b.id);
    // Yabanci magazanin id'si dusurulur; kalan iki id ISTEMCI SIRASINI korur.
    expect(ids).toEqual([adidas.id, nike.id]);
    expect(res.json().pagination.totalItems).toBe(2);
  });

  it("arama+sayfalama modunda satirlar YALNIZ secim projeksiyonunu tasir (id/name/slug/status/logoUrl)", async () => {
    const { app } = buildApp();
    await app.inject({ method: "POST", url: `/stores/${STORE_A}/brands`, headers: AUTH, payload: brandBody() });
    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A}/brands/selector`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json().data[0]).sort()).toEqual(["id", "logoUrl", "name", "slug", "status"].sort());
  });
});

describe("Brand routes — 401 unauthenticated", () => {
  it("Authorization basligi yoksa 401 doner", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A}/brands` });
    expect(res.statusCode).toBe(401);
  });

  it("selector ucu da 401 doner", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A}/brands/selector` });
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /stores/:storeId/brands/:brandId/products", () => {
  it("marka icin GERCEK (sayfalanmis) urun listesi doner ve cross-store id icin 404 uretir", async () => {
    const { app, brandDataAccess } = buildApp();
    const created = (
      await app.inject({ method: "POST", url: `/stores/${STORE_A}/brands`, headers: AUTH, payload: brandBody() })
    ).json().data;

    // Bos liste — hic urun baglanmamis.
    const emptyRes = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/brands/${created.id}/products`,
      headers: AUTH,
    });
    expect(emptyRes.statusCode).toBe(200);
    expect(emptyRes.json().data).toEqual([]);
    expect(emptyRes.json().pagination.totalItems).toBe(0);

    brandDataAccess.productsByBrandId.set(created.id, [
      { id: "prod_1", title: "Air Max", status: "ACTIVE", sku: "AIRMAX-1", coverStorageKey: "stores/store_a/products/prod_1.webp" },
      { id: "prod_2", title: "Air Force", status: "DRAFT", sku: null, coverStorageKey: null },
    ]);

    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/brands/${created.id}/products`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual([
      { id: "prod_1", title: "Air Max", status: "ACTIVE", sku: "AIRMAX-1", imageUrl: `/media/stores/${STORE_A}/products/prod_1.webp` },
      { id: "prod_2", title: "Air Force", status: "DRAFT", sku: null, imageUrl: null },
    ]);
    expect(body.pagination.totalItems).toBe(2);

    // Arama filtresi sunucuda uygulanir.
    const searchRes = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/brands/${created.id}/products?search=force`,
      headers: AUTH,
    });
    expect(searchRes.statusCode).toBe(200);
    expect(searchRes.json().data).toHaveLength(1);
    expect(searchRes.json().data[0].id).toBe("prod_2");

    const crossRes = await app.inject({
      method: "GET",
      url: `/stores/${STORE_B}/brands/${created.id}/products`,
      headers: AUTH,
    });
    expect(crossRes.statusCode).toBe(404);
  });
});
