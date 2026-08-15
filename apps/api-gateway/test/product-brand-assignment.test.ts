/**
 * TODO-165A (ADR-165A) Task 7 — Ürün create/update uçlarında `brandId` kabulü + legacy
 * `brand` metniyle dual-write testleri.
 *
 * Kapsanan: gecerli brandId → brandId + brand=marka.adi (istemcinin gonderdigi bare `brand`
 * metni EZILIR); brandId cross-store/mevcut-olmayan → 400 PRODUCT_BRAND_INVALID (sizinti
 * yok — 403 degil); brandId ARCHIVED marka → 409 PRODUCT_BRAND_ARCHIVED; brandId: null →
 * brandId temizlenir (legacy `brand` metnine DOKUNULMAZ); brandId absent → eski davranis
 * (bare legacy `brand` metni gecer yol). `BrandDataAccess`/`AppDataAccess` hafif in-memory
 * fake'lerle enjekte edilir (brand-routes.test.ts deseniyle simetrik).
 */
import { describe, expect, it } from "vitest";
import { type AppDataAccess, createServer } from "../src/server.js";
import { createNoopSearchIndexEmitter } from "../src/search-index/emitter.js";
import { createStoreAuthDataFake } from "./helpers/store-auth-fixture.js";
import type { BrandDataAccess, BrandRecord, BrandStatus } from "../src/brand/brand-data.js";

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

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

/** Yalniz `get()` (brandService.get storeId-scoped okur) ihtiyaci icin minimal fake. */
function createFakeBrandDataAccess(): BrandDataAccess & { rows: Map<string, BrandRecord> } {
  const rows = new Map<string, BrandRecord>();
  return {
    rows,
    async list() {
      return { data: [...rows.values()], total: rows.size };
    },
    async get(storeId, id) {
      const row = rows.get(id);
      return row && row.storeId === storeId ? row : null;
    },
    async findBySlug() {
      return null;
    },
    async create() {
      throw new Error("not used in this test");
    },
    async update() {
      throw new Error("not used in this test");
    },
    async setStatus() {
      throw new Error("not used in this test");
    },
    async selector() {
      return { data: [], total: 0 };
    },
    async productCount() {
      return 0;
    },
    async productsByBrand() {
      return new Map();
    },
    async visibleProductCounts() {
      return new Map();
    },
    async mediaBelongsToStore() {
      return false;
    },
    async listProducts() {
      throw new Error("not used in this test");
    },
  };
}

function seedBrand(
  brandDataAccess: BrandDataAccess & { rows: Map<string, BrandRecord> },
  storeId: string,
  overrides: Partial<BrandRecord> = {},
): BrandRecord {
  const now = new Date("2026-08-01T00:00:00.000Z");
  const brand: BrandRecord = {
    id: nextId("brand"),
    storeId,
    name: "Nike",
    slug: "nike",
    description: null,
    logoMediaId: null,
    logoStorageKey: null,
    coverMediaId: null,
    coverStorageKey: null,
    websiteUrl: null,
    status: "ACTIVE" as BrandStatus,
    seoTitle: null,
    seoDescription: null,
    productCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  brandDataAccess.rows.set(brand.id, brand);
  return brand;
}

/** Route katmaninin `ProductRecord` alanlarini karsilayan hafif in-memory kayit. */
type FakeProduct = Record<string, unknown> & { id: string; storeId: string; slug: string };

/**
 * Task 17 — `governedBrand` relation ozetini brandId'den turetir (gercek Prisma
 * `productDetailSelect`'in { id, name, slug } join'ini simule eder).
 */
function brandRefFor(
  brandDataAccess: BrandDataAccess & { rows: Map<string, BrandRecord> },
  brandId: unknown,
): { id: string; name: string; slug: string } | null {
  if (typeof brandId !== "string") return null;
  const brand = brandDataAccess.rows.get(brandId);
  return brand ? { id: brand.id, name: brand.name, slug: brand.slug } : null;
}

function buildApp() {
  const brandDataAccess = createFakeBrandDataAccess();
  const products = new Map<string, FakeProduct>();
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
    async findProductBySlug(storeId: string, slug: string) {
      return [...products.values()].find((p) => p.storeId === storeId && p.slug === slug) ?? null;
    },
    async findProductById(storeId: string, productId: string) {
      const row = products.get(productId);
      return row && row.storeId === storeId ? row : null;
    },
    async createProduct(storeId: string, input: Record<string, unknown>) {
      const id = nextId("prod");
      const now = new Date("2026-08-01T00:00:00.000Z");
      const record: FakeProduct = {
        id,
        storeId,
        images: [],
        createdAt: now,
        updatedAt: now,
        ...input,
        // Task 17 — gercek Prisma `productDetailSelect` reload'unu simule eder:
        // brandId'den governedBrand relation OZETI turer (route ayri bir cagri YAPMAZ).
        governedBrand: brandRefFor(brandDataAccess, input.brandId),
      };
      products.set(id, record);
      return record;
    },
    async updateProduct(storeId: string, productId: string, input: Record<string, unknown>) {
      const row = products.get(productId);
      if (!row || row.storeId !== storeId) return null;
      const next: FakeProduct = { ...row, ...input, updatedAt: new Date("2026-08-02T00:00:00.000Z") };
      // Task 17 — brandId bu istekte DOKUNULDUYSA (set veya null'a temizlendiyse)
      // governedBrand ozetini yeniden turet; dokunulmadiysa mevcut ozet KORUNUR.
      if ("brandId" in input) {
        next.governedBrand = brandRefFor(brandDataAccess, input.brandId);
      }
      products.set(productId, next);
      return next;
    },
  } as unknown as AppDataAccess;

  const app = createServer(config, {
    dataAccess,
    brandDataAccess,
    searchIndexEmitter: createNoopSearchIndexEmitter(),
    storeAuthData: createStoreAuthDataFake(
      [{ token: "admin-token", storeId: STORE_A, role: "OWNER" }],
      config.SESSION_SECRET,
    ),
  });
  return { app, brandDataAccess, products, auditLogs };
}

let productSlugSeq = 0;
function productBody(overrides: Record<string, unknown> = {}) {
  productSlugSeq += 1;
  return {
    title: "Air Max",
    // slugSchema alt cizgi kabul etmez (nextId "prefix_n" doner) — dash-only sayac kullanilir.
    slug: `air-max-${productSlugSeq}`,
    ...overrides,
  };
}

describe("POST /stores/:storeId/products — brandId kabulü + dual-write", () => {
  it("gecerli brandId ile brandId set edilir ve legacy brand metni marka adiyla ezilir (dual-write)", async () => {
    const { app, brandDataAccess, products } = buildApp();
    const brand = seedBrand(brandDataAccess, STORE_A, { name: "Nike" });

    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/products`,
      headers: AUTH,
      // Istemci ayrica farkli bir `brand` serbest metni gonderiyor — brandId GECERLIYSE
      // bu metin marka adiyla EZILMELI (dual-write kurali).
      payload: productBody({ brandId: brand.id, brand: "Should Be Overridden" }),
    });

    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created.brand).toBe("Nike");
    // Task 17 (REQUIRED backend addition) — admin cikisi artik brandId + kucuk marka
    // OZETini (brandRef) tasir; edit formu bu sayede secili markayi ON-SECEBILIR.
    expect(created.brandId).toBe(brand.id);
    expect(created.brandRef).toEqual({ id: brand.id, name: "Nike", slug: brand.slug });

    const stored = products.get(created.id);
    expect(stored?.brandId).toBe(brand.id);
    expect(stored?.brand).toBe("Nike");
  });

  it("brandId absent iken eski davranis korunur (bare legacy brand metni gecer)", async () => {
    const { app, products } = buildApp();

    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/products`,
      headers: AUTH,
      payload: productBody({ brand: "Custom Vendor Text" }),
    });

    expect(res.statusCode).toBe(201);
    const created = res.json();
    // Task 17 — governed brandId yoksa cikis brandId/brandRef null doner (legacy
    // serbest-metin `brand` alani ETKILENMEZ).
    expect(created.brandId).toBeNull();
    expect(created.brandRef).toBeNull();
    const stored = products.get(created.id);
    expect(stored?.brandId ?? null).toBeNull();
    expect(stored?.brand).toBe("Custom Vendor Text");
  });

  it("baska magazanin brandId'si → 400 PRODUCT_BRAND_INVALID (sizinti yok, 403 degil)", async () => {
    const { app, brandDataAccess } = buildApp();
    const otherStoreBrand = seedBrand(brandDataAccess, STORE_B);

    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/products`,
      headers: AUTH,
      payload: productBody({ brandId: otherStoreBrand.id }),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("PRODUCT_BRAND_INVALID");
  });

  it("var olmayan brandId → 400 PRODUCT_BRAND_INVALID", async () => {
    const { app } = buildApp();

    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/products`,
      headers: AUTH,
      payload: productBody({ brandId: "brand_unknown" }),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("PRODUCT_BRAND_INVALID");
  });

  it("ARCHIVED brandId → 409 PRODUCT_BRAND_ARCHIVED", async () => {
    const { app, brandDataAccess, products } = buildApp();
    const archived = seedBrand(brandDataAccess, STORE_A, { status: "ARCHIVED" });

    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/products`,
      headers: AUTH,
      payload: productBody({ brandId: archived.id }),
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("PRODUCT_BRAND_ARCHIVED");
    // Reddedilen istekte HICBIR YAZIM olmamali.
    expect(products.size).toBe(0);
  });
});

describe("PATCH /stores/:storeId/products/:productId — brandId kabulü + dual-write", () => {
  async function createBaseProduct(app: ReturnType<typeof buildApp>["app"]) {
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/products`,
      headers: AUTH,
      payload: productBody(),
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  it("gecerli brandId set eder ve legacy brand metnini marka adiyla ezer", async () => {
    const { app, brandDataAccess, products } = buildApp();
    const productId = await createBaseProduct(app);
    const brand = seedBrand(brandDataAccess, STORE_A, { name: "Adidas" });

    const res = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE_A}/products/${productId}`,
      headers: AUTH,
      payload: { brandId: brand.id },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().brand).toBe("Adidas");
    const stored = products.get(productId);
    expect(stored?.brandId).toBe(brand.id);
    expect(stored?.brand).toBe("Adidas");
  });

  it("baska magazanin brandId'si → 400 PRODUCT_BRAND_INVALID, hicbir yazim yapilmaz", async () => {
    const { app, brandDataAccess, products } = buildApp();
    const productId = await createBaseProduct(app);
    const otherStoreBrand = seedBrand(brandDataAccess, STORE_B);
    const before = { ...products.get(productId) };

    const res = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE_A}/products/${productId}`,
      headers: AUTH,
      payload: { brandId: otherStoreBrand.id },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("PRODUCT_BRAND_INVALID");
    expect(products.get(productId)).toEqual(before);
  });

  it("ARCHIVED brandId → 409 PRODUCT_BRAND_ARCHIVED, hicbir yazim yapilmaz", async () => {
    const { app, brandDataAccess, products } = buildApp();
    const productId = await createBaseProduct(app);
    const archived = seedBrand(brandDataAccess, STORE_A, { status: "ARCHIVED" });
    const before = { ...products.get(productId) };

    const res = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE_A}/products/${productId}`,
      headers: AUTH,
      payload: { brandId: archived.id },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("PRODUCT_BRAND_ARCHIVED");
    expect(products.get(productId)).toEqual(before);
  });

  it("brandId: null → brandId temizlenir, legacy brand metni DOKUNULMADAN kalir", async () => {
    const { app, brandDataAccess, products } = buildApp();
    const productId = await createBaseProduct(app);
    const brand = seedBrand(brandDataAccess, STORE_A, { name: "Puma" });

    const setRes = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE_A}/products/${productId}`,
      headers: AUTH,
      payload: { brandId: brand.id },
    });
    expect(setRes.statusCode).toBe(200);
    expect(products.get(productId)?.brand).toBe("Puma");

    const clearRes = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE_A}/products/${productId}`,
      headers: AUTH,
      payload: { brandId: null },
    });
    expect(clearRes.statusCode).toBe(200);
    // Task 17 — PATCH cikisi da brandId/brandRef temizligini yansitir (yeniden
    // GET yapmaya gerek yok; ayni response body zaten guncel).
    expect(clearRes.json().brandId).toBeNull();
    expect(clearRes.json().brandRef).toBeNull();
    const stored = products.get(productId);
    expect(stored?.brandId).toBeNull();
    // Istemci ayrica `brand` gondermedi → legacy metin (onceki mirror'dan kalan "Puma")
    // DOKUNULMADAN kalir (belgelenmis gecici davranis).
    expect(stored?.brand).toBe("Puma");
  });

  it("brandId: null + brand: null ayni istekte gonderilirse ikisi de temizlenir", async () => {
    const { app, brandDataAccess, products } = buildApp();
    const productId = await createBaseProduct(app);
    const brand = seedBrand(brandDataAccess, STORE_A, { name: "Reebok" });
    await app.inject({
      method: "PATCH",
      url: `/stores/${STORE_A}/products/${productId}`,
      headers: AUTH,
      payload: { brandId: brand.id },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE_A}/products/${productId}`,
      headers: AUTH,
      payload: { brandId: null, brand: null },
    });

    expect(res.statusCode).toBe(200);
    const stored = products.get(productId);
    expect(stored?.brandId).toBeNull();
    expect(stored?.brand).toBeNull();
  });

  it("brandId absent iken mevcut brandId/brand DOKUNULMADAN korunur", async () => {
    const { app, brandDataAccess, products } = buildApp();
    const productId = await createBaseProduct(app);
    const brand = seedBrand(brandDataAccess, STORE_A, { name: "New Balance" });
    await app.inject({
      method: "PATCH",
      url: `/stores/${STORE_A}/products/${productId}`,
      headers: AUTH,
      payload: { brandId: brand.id },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE_A}/products/${productId}`,
      headers: AUTH,
      payload: { title: "Air Max Updated" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe("Air Max Updated");
    const stored = products.get(productId);
    expect(stored?.brandId).toBe(brand.id);
    expect(stored?.brand).toBe("New Balance");
  });
});

/**
 * Task 17 (REQUIRED backend addition) — admin GET/detail cikisi brandId + kucuk marka
 * OZETini (brandRef) tasimaliydi ama Task 7 bunu disaridaydi (yalniz create/update
 * kabulunu ele almisti); bu yuzden store-admin edit formu secili markayi ON-SECEMIYORDU.
 * Bu blok GERIYE GIT (RED) senaryosunu dogrudan ele alir: urunu olustur → getir → alan var mi.
 */
describe("GET /stores/:storeId/products/:productId — brandId + brand özeti (edit ön-seçim)", () => {
  it("governed markali urunde brandId + brandRef {id,name,slug} doner", async () => {
    const { app, brandDataAccess } = buildApp();
    const brand = seedBrand(brandDataAccess, STORE_A, { name: "Nike", slug: "nike" });

    const createRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/products`,
      headers: AUTH,
      payload: productBody({ brandId: brand.id }),
    });
    expect(createRes.statusCode).toBe(201);
    const productId = createRes.json().id as string;

    const getRes = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/products/${productId}`,
      headers: AUTH,
    });

    expect(getRes.statusCode).toBe(200);
    const body = getRes.json();
    expect(body.brandId).toBe(brand.id);
    expect(body.brandRef).toEqual({ id: brand.id, name: "Nike", slug: "nike" });
  });

  it("markasiz urunde brandId + brandRef null doner", async () => {
    const { app } = buildApp();

    const createRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/products`,
      headers: AUTH,
      payload: productBody(),
    });
    expect(createRes.statusCode).toBe(201);
    const productId = createRes.json().id as string;

    const getRes = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/products/${productId}`,
      headers: AUTH,
    });

    expect(getRes.statusCode).toBe(200);
    const body = getRes.json();
    expect(body.brandId).toBeNull();
    expect(body.brandRef).toBeNull();
  });
});
