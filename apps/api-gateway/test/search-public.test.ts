import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppDataAccess, createServer } from "../src/server.js";
import { SearchError, type SearchProvider, type SearchResult } from "@commerce-os/search-service";

/**
 * TODO-155 (ADR-079) — Faz 2C-8B · Public arama ucu ENTEGRASYON testleri (fake SearchProvider; DB YOK).
 * Doğrulananlar: store 404, query doğrulama (400 + tipli kod), SearchError eşleme (CATEGORY_NOT_FOUND
 * 404 / ATTRIBUTE_NOT_FILTERABLE 400), başarı DTO shape + ALLOWLIST (internal alan sızmaz) + kategori/
 * kapak hidrasyonu + tenant izolasyonu (provider doğru storeId ile çağrılır). Gerçek SQL semantiği
 * (OR/AND/count/tenant DB düzeyi) Docker gerçek-PG smoke'ta.
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

const sampleResult: SearchResult = {
  sort: "relevance",
  pagination: {
    page: 1,
    pageSize: 24,
    totalItems: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
  items: [
    {
      productId: "prod_1",
      slug: "laptop-pro",
      title: "Laptop Pro",
      brand: "Acme",
      primaryCategoryId: "cat_laptops",
      minPriceMinor: 150000,
      maxPriceMinor: 250000,
      currency: "TRY",
      availability: "IN_STOCK",
      inStock: true,
      variantCount: 3,
    },
  ],
  facets: [
    {
      attributeDefinitionId: "def_color",
      code: "renk",
      name: "Renk",
      dataType: "COLOR",
      unit: null,
      displayOrder: 1,
      selectionMode: "MULTI",
      values: [
        { optionId: "opt_black", value: "siyah", label: "Siyah", colorHex: "#000000", count: 5, selected: false },
      ],
      range: null,
    },
  ],
};

const searchFn = vi.fn();

function buildApp() {
  const dataAccess = {
    async findStoreBySlug(slug: string) {
      return slug === demoStore.slug ? demoStore : null;
    },
    async listCategories() {
      return { data: [{ id: "cat_laptops", name: "Laptoplar" }], pagination: { limit: 200, offset: 0, total: 1 } };
    },
    async listProductImages() {
      return new Map([
        [
          "prod_1",
          [{ mediaId: "m1", position: 0, storageKey: "stores/store_demo/products/a.webp", altText: "Kapak", optionId: null }],
        ],
      ]);
    },
  } as unknown as AppDataAccess;

  const searchProvider = {
    search: searchFn,
  } as unknown as SearchProvider;

  return createServer(config, { dataAccess, searchProvider });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /public/stores/:slug/search — hata yolları", () => {
  it("bilinmeyen store → 404 STORE_NOT_FOUND", async () => {
    searchFn.mockResolvedValue(sampleResult);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/public/stores/ghost/search" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("STORE_NOT_FOUND");
  });

  it("geçersiz sort → 400 INVALID_SORT (provider çağrılmaz)", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/public/stores/demo-store/search?sort=best_selling" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_SORT");
    expect(searchFn).not.toHaveBeenCalled();
  });

  it("geçersiz page → 400 INVALID_PAGINATION", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/public/stores/demo-store/search?page=0" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_PAGINATION");
  });

  it("SearchError CATEGORY_NOT_FOUND → 404", async () => {
    searchFn.mockRejectedValue(new SearchError("CATEGORY_NOT_FOUND", "Category not found."));
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/public/stores/demo-store/search?category=ghost" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("CATEGORY_NOT_FOUND");
  });

  it("SearchError ATTRIBUTE_NOT_FILTERABLE → 400", async () => {
    searchFn.mockRejectedValue(new SearchError("ATTRIBUTE_NOT_FILTERABLE", "not filterable"));
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/public/stores/demo-store/search?filter[foo]=bar" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("ATTRIBUTE_NOT_FILTERABLE");
  });
});

describe("GET /public/stores/:slug/search — başarı + ALLOWLIST", () => {
  it("DTO shape + facet passthrough + kategori/kapak hidrasyonu", async () => {
    searchFn.mockResolvedValue(sampleResult);
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/public/stores/demo-store/search?q=laptop&filter[renk]=siyah&minPrice=1000",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Tenant: provider doğru storeId + normalize query ile çağrıldı.
    expect(searchFn).toHaveBeenCalledTimes(1);
    expect(searchFn.mock.calls[0][0]).toBe("store_demo");
    expect(searchFn.mock.calls[0][1]).toMatchObject({
      q: "laptop",
      filters: [{ code: "renk", values: ["siyah"] }],
      minPrice: 1000,
    });

    // Envelope alanları.
    expect(body.query).toBe("laptop");
    expect(body.sort).toBe("relevance");
    expect(body.pagination).toEqual(sampleResult.pagination);
    expect(body.appliedFilters).toEqual({
      minPrice: 1000,
      maxPrice: null,
      inStock: false,
      attributes: [{ code: "renk", values: ["siyah"], min: null, max: null, bool: null }],
    });

    // Facet passthrough.
    expect(body.facets).toHaveLength(1);
    expect(body.facets[0].code).toBe("renk");
    expect(body.facets[0].values[0]).toMatchObject({ value: "siyah", colorHex: "#000000", count: 5 });

    // Ürün listing + kategori adı + kapak URL hidrasyonu.
    expect(body.products).toHaveLength(1);
    const p = body.products[0];
    expect(p).toMatchObject({
      id: "prod_1",
      slug: "laptop-pro",
      title: "Laptop Pro",
      brand: "Acme",
      categoryLabel: "Laptoplar",
      minPriceMinor: 150000,
      maxPriceMinor: 250000,
      currency: "TRY",
      availability: "IN_STOCK",
      inStock: true,
    });
    expect(p.image).toMatchObject({ url: "/media/stores/store_demo/products/a.webp", altText: "Kapak", position: 0 });
  });

  it("ALLOWLIST: internal alanlar (costMinor/storageKey/searchText/revision/primaryCategoryId) sızmaz", async () => {
    // Provider read-model item'ı primaryCategoryId taşır ama DTO'da product'ta HAM primaryCategoryId olmamalı.
    searchFn.mockResolvedValue(sampleResult);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/public/stores/demo-store/search" });
    const p = res.json().products[0];
    for (const leaked of [
      "costMinor",
      "netPriceMinor",
      "storageKey",
      "mediaId",
      "searchText",
      "searchVector",
      "revision",
      "primaryCategoryId",
      "variantCount",
      "hasStock",
    ]) {
      expect(p).not.toHaveProperty(leaked);
    }
    // image içinde de ham medya alanı yok.
    expect(p.image).not.toHaveProperty("mediaId");
    expect(p.image).not.toHaveProperty("storageKey");
  });
});
