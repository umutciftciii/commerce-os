import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppDataAccess, createServer } from "../src/server.js";
import type { SearchProvider, SuggestResult } from "@commerce-os/search-service";

/**
 * TODO-156E (ADR-084) — Faz 2C-8E · Public autocomplete ucu ENTEGRASYON testleri (fake suggest; DB YOK).
 * Doğrulananlar: store 404, q doğrulama (400), başarı DTO shape + ALLOWLIST (storageKey sızmaz, url türetilir),
 * kampanya/kategori/marka grupları, cache hit/miss header + tenant izolasyonu (doğru storeId). Gerçek SQL
 * semantiği (relevance/prefix/CTE) Docker gerçek-PG smoke'ta.
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

const sampleSuggest: SuggestResult = {
  query: "iph",
  suggestions: ["iPhone", "iPhone 15 Pro"],
  products: [
    {
      productId: "prod_1",
      slug: "iphone-15-pro",
      title: "iPhone 15 Pro",
      brand: "Apple",
      primaryCategoryId: "cat_phones",
      availability: "IN_STOCK",
      inStock: true,
      image: { storageKey: "stores/store_demo/products/a.webp", altText: "Kapak", width: 800, height: 1000 },
      hasCampaign: true,
      campaignLabel: "Kampanya",
      isNew: true,
    },
  ],
  categories: [
    {
      id: "cat_phones",
      slug: "telefon",
      name: "Telefon",
      path: [
        { slug: "elektronik", name: "Elektronik" },
        { slug: "telefon", name: "Telefon" },
      ],
    },
  ],
  brands: [{ brand: "Apple", productCount: 12 }],
  total: 37,
};

const suggestFn = vi.fn();

function buildApp() {
  const dataAccess = {
    async findStoreBySlug(slug: string) {
      return slug === demoStore.slug ? demoStore : null;
    },
    // TODO-156E UX — ürün kartı kategori etiketi çözümü (loadPublicCategoryNames → listCategories).
    async listCategories() {
      return {
        data: [{ id: "cat_phones", name: "Telefon" }],
        pagination: { limit: 200, offset: 0, total: 1 },
      };
    },
  } as unknown as AppDataAccess;

  const searchProvider = {
    search: vi.fn(),
    suggest: suggestFn,
  } as unknown as SearchProvider;

  return createServer(config, { dataAccess, searchProvider });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /public/stores/:slug/autocomplete", () => {
  it("bilinmeyen store → 404 STORE_NOT_FOUND", async () => {
    suggestFn.mockResolvedValue(sampleSuggest);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/public/stores/ghost/autocomplete?q=iph" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("STORE_NOT_FOUND");
  });

  it("q yok → 400 INVALID_AUTOCOMPLETE_QUERY", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/public/stores/demo-store/autocomplete" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_AUTOCOMPLETE_QUERY");
  });

  it("başarı: 4 grup + ALLOWLIST (storageKey/fiyat sızmaz, kategori/rozet/total)", async () => {
    suggestFn.mockResolvedValue(sampleSuggest);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/public/stores/demo-store/autocomplete?q=iph" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.query).toBe("iph");
    expect(body.suggestions).toEqual(["iPhone", "iPhone 15 Pro"]);
    expect(body.products).toHaveLength(1);
    const p = body.products[0];
    expect(p.image.url).toContain("stores/store_demo/products/a.webp");
    expect(p.image.storageKey).toBeUndefined();
    // TODO-156E UX: FİYAT SIZMAZ (autocomplete satın-alma ekranı değil).
    expect(p.minPriceMinor).toBeUndefined();
    expect(p.currency).toBeUndefined();
    // Zenginleştirme: kategori etiketi (id→ad), rozetler, Yeni.
    expect(p.categoryLabel).toBe("Telefon");
    expect(p.primaryCategoryId).toBeUndefined();
    expect(p.hasCampaign).toBe(true);
    expect(p.campaignLabel).toBe("Kampanya");
    expect(p.isNew).toBe(true);
    expect(p.brand).toBe("Apple");
    expect(body.total).toBe(37);
    expect(body.categories[0].path).toHaveLength(2);
    expect(body.brands[0]).toEqual({ brand: "Apple", productCount: 12 });
    // Tenant izolasyonu: doğru storeId ile çağrıldı.
    expect(suggestFn).toHaveBeenCalledWith("store_demo", expect.objectContaining({ q: "iph" }));
  });

  it("ikinci özdeş istek cache hit (x-autocomplete-cache header)", async () => {
    suggestFn.mockResolvedValue(sampleSuggest);
    const app = buildApp();
    const first = await app.inject({ method: "GET", url: "/public/stores/demo-store/autocomplete?q=iph" });
    expect(first.headers["x-autocomplete-cache"]).toBe("miss");
    const second = await app.inject({ method: "GET", url: "/public/stores/demo-store/autocomplete?q=iph" });
    expect(second.headers["x-autocomplete-cache"]).toBe("hit");
    // Sağlayıcı yalnız bir kez çağrıldı (ikinci cache'ten).
    expect(suggestFn).toHaveBeenCalledTimes(1);
  });
});
