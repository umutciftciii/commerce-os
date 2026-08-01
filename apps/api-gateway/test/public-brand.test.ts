/**
 * TODO-165A (ADR-165A) Task 11 — Sub-part A: public marka (Brand) uçları + ürün DTO `brandRef`
 * projeksiyonu.
 *
 * Kapsanan:
 *  - `GET /public/stores/:storeSlug/brands` — yalnız ACTIVE + >=1 GÖRÜNÜR (status ACTIVE) ürünü
 *    olan markaları listeler; ARCHIVED + boş (0 görünür ürünlü) marka DIŞLANIR; cross-store izole.
 *  - `GET /public/stores/:storeSlug/brands/:brandSlug` — bilinmeyen/ARCHIVED/cross-store slug → 404
 *    BRAND_NOT_FOUND (sızıntı yok); geçerli slug → publicBrandDetailSchema + doğru productCount.
 *  - `buildPublicProduct` (server.ts, artık export edilir) — `brandRef` yalnız `product.brandId` set
 *    edilmiş VE haritada bulunmuşsa dolu; aksi halde null (additive; legacy `brand` string bozulmaz).
 *  - `parseSearchQuery` — `brand=<slug>` query param'ını `SearchQuery.brand`'e ayrıştırır (Sub-part B
 *    ile ortak parser; PLP marka filtresi bu ucun üzerinden akar).
 */
import { describe, expect, it } from "vitest";
import { type AppDataAccess, buildPublicProduct, createServer } from "../src/server.js";
import { parseSearchQuery } from "../src/search/query-parser.js";
import type {
  BrandCreateData,
  BrandDataAccess,
  BrandListCriteria,
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
    systemPurpose: null,
    metadata: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

const STORES = new Map([
  [STORE_A, store(STORE_A)],
  [STORE_B, store(STORE_B)],
]);

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

/** brand-routes.test.ts ile aynı desen — hafif in-memory `BrandDataAccess` fake'i + `visibleCounts` düğmesi. */
function createFakeBrandDataAccess(): BrandDataAccess & {
  rows: Map<string, BrandRecord>;
  visibleCounts: Map<string, number>;
} {
  const rows = new Map<string, BrandRecord>();
  const visibleCounts = new Map<string, number>();

  function matches(row: BrandRecord, criteria: { search?: string; status?: BrandStatus }): boolean {
    if (criteria.status && row.status !== criteria.status) return false;
    if (criteria.search) {
      const needle = criteria.search.toLowerCase();
      if (!row.name.toLowerCase().includes(needle) && !row.slug.toLowerCase().includes(needle)) return false;
    }
    return true;
  }

  async function list(storeId: string, criteria: BrandListCriteria) {
    const all = [...rows.values()].filter((r) => r.storeId === storeId && matches(r, criteria));
    const sorted = [...all].sort((a, b) => a.name.localeCompare(b.name));
    return { data: sorted.slice(criteria.offset, criteria.offset + criteria.limit), total: sorted.length };
  }

  return {
    rows,
    visibleCounts,
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
        logoStorageKey: null,
        coverMediaId: input.coverMediaId,
        coverStorageKey: null,
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
      const next: BrandRecord = { ...row, ...patch, updatedAt: new Date() } as BrandRecord;
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
        map.set(id, row && row.storeId === storeId ? visibleCounts.get(id) ?? 0 : 0);
      }
      return map;
    },
    async mediaBelongsToStore() {
      return false;
    },
    async listProducts() {
      // Bu test dosyasi listProducts'i EGZERSIZ ETMEZ (brand-routes.test.ts kapsar).
      return { data: [], total: 0 };
    },
  };
}

function seedBrand(
  brandDataAccess: ReturnType<typeof createFakeBrandDataAccess>,
  storeId: string,
  overrides: Partial<BrandRecord> & { visibleProducts?: number } = {},
): BrandRecord {
  const now = new Date("2026-08-01T00:00:00.000Z");
  const { visibleProducts, ...rest } = overrides;
  const brand: BrandRecord = {
    id: nextId("brand"),
    storeId,
    name: "Nike",
    slug: "nike",
    description: "Spor giyim markası",
    logoMediaId: null,
    logoStorageKey: "stores/store_a/brands/logo.webp",
    coverMediaId: null,
    coverStorageKey: null,
    websiteUrl: "https://nike.example",
    status: "ACTIVE" as BrandStatus,
    seoTitle: null,
    seoDescription: null,
    productCount: 0,
    createdAt: now,
    updatedAt: now,
    ...rest,
  };
  brandDataAccess.rows.set(brand.id, brand);
  brandDataAccess.visibleCounts.set(brand.id, visibleProducts ?? 1);
  return brand;
}

function buildApp() {
  const brandDataAccess = createFakeBrandDataAccess();
  const dataAccess = {
    async findStoreBySlug(slug: string) {
      return [...STORES.values()].find((s) => s.slug === slug) ?? null;
    },
  } as unknown as AppDataAccess;

  const app = createServer(config, { dataAccess, brandDataAccess });
  return { app, brandDataAccess };
}

describe("GET /public/stores/:storeSlug/brands — liste", () => {
  it("yalnız ACTIVE + >=1 görünür ürünlü markaları döner; ARCHIVED + boş marka dışlanır", async () => {
    const { app, brandDataAccess } = buildApp();
    const nike = seedBrand(brandDataAccess, STORE_A, { name: "Nike", slug: "nike", visibleProducts: 3 });
    seedBrand(brandDataAccess, STORE_A, { name: "Archived Co", slug: "archived-co", status: "ARCHIVED", visibleProducts: 5 });
    seedBrand(brandDataAccess, STORE_A, { name: "Empty Brand", slug: "empty-brand", visibleProducts: 0 });

    const res = await app.inject({ method: "GET", url: `/public/stores/${STORE_A}/brands` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toEqual({
      id: nike.id,
      name: "Nike",
      slug: "nike",
      logoUrl: "/media/stores/store_a/brands/logo.webp",
      description: "Spor giyim markası",
    });
  });

  it("cross-store izole: başka mağazanın markası listeye sızmaz", async () => {
    const { app, brandDataAccess } = buildApp();
    seedBrand(brandDataAccess, STORE_A, { name: "Nike A", slug: "nike-a" });
    seedBrand(brandDataAccess, STORE_B, { name: "Nike B", slug: "nike-b" });

    const res = await app.inject({ method: "GET", url: `/public/stores/${STORE_A}/brands` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((b: { slug: string }) => b.slug)).toEqual(["nike-a"]);
  });

  it("bilinmeyen mağaza slug'ı → 404 STORE_NOT_FOUND", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "GET", url: `/public/stores/unknown-store/brands` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("STORE_NOT_FOUND");
  });
});

describe("GET /public/stores/:storeSlug/brands/:brandSlug — detay", () => {
  it("geçerli marka → publicBrandDetailSchema + doğru productCount", async () => {
    const { app, brandDataAccess } = buildApp();
    seedBrand(brandDataAccess, STORE_A, {
      name: "Nike",
      slug: "nike",
      visibleProducts: 7,
      websiteUrl: "https://nike.example",
      seoTitle: "Nike Mağazası",
      seoDescription: "Nike ürünleri",
    });

    const res = await app.inject({ method: "GET", url: `/public/stores/${STORE_A}/brands/nike` });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.name).toBe("Nike");
    expect(data.slug).toBe("nike");
    expect(data.productCount).toBe(7);
    expect(data.websiteUrl).toBe("https://nike.example");
    expect(data.seoTitle).toBe("Nike Mağazası");
  });

  it("boş (0 görünür ürünlü) marka detayı YİNE 200 döner (yalnız LİSTEDEN dışlanır)", async () => {
    const { app, brandDataAccess } = buildApp();
    seedBrand(brandDataAccess, STORE_A, { name: "Empty", slug: "empty", visibleProducts: 0 });
    const res = await app.inject({ method: "GET", url: `/public/stores/${STORE_A}/brands/empty` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.productCount).toBe(0);
  });

  it("bilinmeyen slug → 404 BRAND_NOT_FOUND", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "GET", url: `/public/stores/${STORE_A}/brands/unknown-brand` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("BRAND_NOT_FOUND");
  });

  it("ARCHIVED marka → 404 BRAND_NOT_FOUND (sızıntı yok)", async () => {
    const { app, brandDataAccess } = buildApp();
    seedBrand(brandDataAccess, STORE_A, { name: "Old", slug: "old", status: "ARCHIVED" });
    const res = await app.inject({ method: "GET", url: `/public/stores/${STORE_A}/brands/old` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("BRAND_NOT_FOUND");
  });

  it("başka mağazanın marka slug'ı → 404 BRAND_NOT_FOUND (cross-store sızıntı yok)", async () => {
    const { app, brandDataAccess } = buildApp();
    seedBrand(brandDataAccess, STORE_B, { name: "Foreign", slug: "foreign" });
    const res = await app.inject({ method: "GET", url: `/public/stores/${STORE_A}/brands/foreign` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("BRAND_NOT_FOUND");
  });

  it("bilinmeyen mağaza slug'ı → 404 STORE_NOT_FOUND", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "GET", url: `/public/stores/unknown-store/brands/nike` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("STORE_NOT_FOUND");
  });
});

// ── buildPublicProduct — brandRef projeksiyonu (SAF birim test; HTTP yok) ───────────────────────

const CATEGORY_NAMES = new Map<string, string>();
const STOCK_MAP = new Map<string, number>();

function baseProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod_1",
    storeId: STORE_A,
    title: "Air Max",
    slug: "air-max",
    description: null,
    status: "ACTIVE",
    type: "PHYSICAL",
    vendor: null,
    brand: "Legacy Vendor Text",
    brandId: null,
    seoTitle: null,
    seoDescription: null,
    salesMode: "ONLINE",
    priceVisibility: "VISIBLE",
    primaryAction: "ADD_TO_CART",
    inquiryEnabled: false,
    appointmentRequired: false,
    whatsappEnabled: false,
    purchasable: true,
    minOrderQuantity: 1,
    maxOrderQuantity: null,
    callToActionLabel: null,
    whatsappMessageTemplate: null,
    inquiryFormTitle: null,
    appointmentNote: null,
    shippingWeightKg: null,
    shippingDesi: null,
    primaryCategoryId: null,
    mediaDefiningAttributeId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    categoryIds: [] as string[],
    images: [] as Array<{ mediaId: string; storageKey: string; altText: string | null; position: number; optionId: string | null }>,
    ...overrides,
  };
}

describe("buildPublicProduct — brandRef projeksiyonu (ADDITIVE; legacy brand bozulmaz)", () => {
  it("product.brandId set + haritada varsa brandRef doludur, legacy brand string DEĞİŞMEZ", () => {
    const brandRef = { id: "brand_1", name: "Nike", slug: "nike", logoUrl: "/media/nike.webp", description: null };
    const product = baseProduct({ brandId: "brand_1", brand: "Legacy Vendor Text" });
    const dto = buildPublicProduct(
      // @ts-expect-error — test fixture; ProductRecord dışa aktarılmıyor (duck-typed).
      product,
      [],
      CATEGORY_NAMES,
      STOCK_MAP,
      [],
      new Date(),
      new Map(),
      "",
      new Map(),
      new Map([["brand_1", brandRef]]),
    );
    expect(dto.brand).toBe("Legacy Vendor Text");
    expect(dto.brandRef).toEqual(brandRef);
  });

  it("product.brandId null → brandRef null (governed marka atanmamış)", () => {
    const product = baseProduct({ brandId: null });
    const dto = buildPublicProduct(
      // @ts-expect-error — test fixture; ProductRecord dışa aktarılmıyor (duck-typed).
      product,
      [],
      CATEGORY_NAMES,
      STOCK_MAP,
    );
    expect(dto.brandRef).toBeNull();
  });

  it("product.brandId set ama harita boş (map miss) → brandRef null (defansif; sızıntı yok)", () => {
    const product = baseProduct({ brandId: "brand_missing" });
    const dto = buildPublicProduct(
      // @ts-expect-error — test fixture; ProductRecord dışa aktarılmıyor (duck-typed).
      product,
      [],
      CATEGORY_NAMES,
      STOCK_MAP,
    );
    expect(dto.brandRef).toBeNull();
  });
});

// ── GET /public/stores/:storeSlug/products — brandRef hidrasyonu ARCHIVED marka gate'i (Task 11 review) ──
//
// `buildPublicProduct`'a haritayı sağlayan gerçek `loadPublicBrandMap` yolu (server.ts) yalnız
// ACTIVE markaları hidratlar (§review item 2 — ARCHIVED marka için `/brands/:slug` zaten 404 döner;
// kart üzerinde kırık link oluşmasın diye brandRef de null olmalı). Bu, tam HTTP yolu (gerçek
// `loadPublicBrandMap` çağrılır) üzerinden doğrulanır — yalnız `buildPublicProduct`'ı doğrudan
// çağıran yukarıdaki testler bu ACTIVE-gate'i EGZERSİZ ETMEZ (harita zaten hazır verilir).
describe("GET /public/stores/:storeSlug/products — brandRef ACTIVE-marka gate'i", () => {
  function fullProductRecord(overrides: Record<string, unknown> = {}) {
    return {
      ...baseProduct(overrides),
      assignments: [],
    };
  }

  function buildFullApp(brandDataAccess: ReturnType<typeof createFakeBrandDataAccess>, product: unknown) {
    const dataAccess = {
      async findStoreBySlug(slug: string) {
        return [...STORES.values()].find((s) => s.slug === slug) ?? null;
      },
      async listProducts() {
        return { data: [product], total: 1 };
      },
      async listCategories() {
        return { data: [], total: 0 };
      },
      async listInventory() {
        return { data: [], total: 0 };
      },
      async findExpiredReservedByVariant() {
        return new Map<string, number>();
      },
      async listPublicActiveCampaigns() {
        return [];
      },
      async lowestRecentPriceByStore() {
        return new Map<string, number>();
      },
      async listProductImages() {
        return new Map<string, unknown[]>();
      },
      async listVariants() {
        return { data: [], total: 0 };
      },
    } as unknown as AppDataAccess;
    return createServer(config, { dataAccess, brandDataAccess });
  }

  it("brandId ARCHIVED bir markaya işaret ediyorsa kartta brandRef null döner (kırık link olmaz)", async () => {
    const brandDataAccess = createFakeBrandDataAccess();
    const archived = seedBrand(brandDataAccess, STORE_A, { name: "Old Co", slug: "old-co", status: "ARCHIVED" });
    const product = fullProductRecord({ id: "prod_1", storeId: STORE_A, brandId: archived.id });

    const app = buildFullApp(brandDataAccess, product);
    const res = await app.inject({ method: "GET", url: `/public/stores/${STORE_A}/products` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].brandRef).toBeNull();
    // Aynı marka için detay ucu da 404 verir — brandRef null ile TUTARLI (kırık link yok).
    const detailRes = await app.inject({ method: "GET", url: `/public/stores/${STORE_A}/brands/old-co` });
    expect(detailRes.statusCode).toBe(404);
  });

  it("brandId ACTIVE bir markaya işaret ediyorsa kartta brandRef doludur", async () => {
    const brandDataAccess = createFakeBrandDataAccess();
    const active = seedBrand(brandDataAccess, STORE_A, { name: "Nike", slug: "nike" });
    const product = fullProductRecord({ id: "prod_1", storeId: STORE_A, brandId: active.id });

    const app = buildFullApp(brandDataAccess, product);
    const res = await app.inject({ method: "GET", url: `/public/stores/${STORE_A}/products` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].brandRef).toMatchObject({ id: active.id, name: "Nike", slug: "nike" });
  });
});

// ── parseSearchQuery — brand=<slug> (Sub-part B ile ortak parser) ──────────────────────────────

describe("parseSearchQuery — brand=<slug> query param", () => {
  it("brand parametresini SearchQuery.brand'e ayrıştırır", () => {
    const result = parseSearchQuery({ brand: "nike" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("beklenmedik parse hatası");
    expect(result.value.brand).toBe("nike");
  });

  it("brand verilmezse undefined kalır (mevcut PLP davranışı bozulmaz)", () => {
    const result = parseSearchQuery({});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("beklenmedik parse hatası");
    expect(result.value.brand).toBeUndefined();
  });
});
