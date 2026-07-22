import { describe, expect, it, vi } from "vitest";
import { type AppDataAccess, createServer } from "../src/server.js";

/**
 * TODO-159B (ADR-090) — Admin Searchable Selector uçlarının ENTEGRASYON testleri.
 *
 * Doğrulananlar: varsayılan sayfalama, page/pageSize, pageSize üst sınırı, arama,
 * sıralama allowlist'i (tanınmayan değer 400), tenant izolasyonu (storeId her
 * çağrıda), boş sonuç, son sayfa, totalItems/totalPages, `ids` çözüm modu
 * (seçili kaydın sayfadan bağımsız gelmesi), başka mağazanın id'sinin
 * ÇÖZÜLMEMESİ ve kategori hiyerarşi yolunun N+1'siz (seviye başına tek sorgu)
 * kurulması.
 *
 * Data-access in-memory'dir: burada doğrulanan ROUTE sözleşmesidir. Gerçek SQL
 * semantiği (LATERAL aggregate, ILIKE escape, NULLS LAST) Docker gerçek-PG
 * smoke'unda doğrulanır.
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
  MEDIA_PUBLIC_BASE_URL: "",
};

const store = {
  id: "store_1",
  name: "Demo",
  slug: "demo",
  status: "ACTIVE" as const,
  metadata: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const AUTH = { authorization: "Bearer admin-token" };

/** 120 ürünlük katalog: "ilk sayfada olmayan kayıt" senaryolarını mümkün kılar. */
function selectorProduct(index: number) {
  return {
    id: `prod_${index}`,
    title: `Ürün ${index}`,
    slug: `urun-${index}`,
    status: "ACTIVE" as const,
    sku: index % 2 === 0 ? `SKU-${index}` : null,
    coverStorageKey: index === 1 ? "stores/store_1/products/cover.webp" : null,
    priceMinor: 1000 + index,
    currency: "TRY",
    stockAvailable: index,
    variantCount: 1,
  };
}

function category(id: string, name: string, parentId: string | null) {
  return {
    id,
    storeId: store.id,
    name,
    // slugSchema alt çizgi kabul etmez; fixture gerçek slug biçimini kullanır.
    slug: id.replace(/_/g, "-"),
    parentId,
    sortOrder: 0,
    status: "ACTIVE" as const,
    imageId: null,
    image: null,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
  };
}

/**
 * Ağaç: Elektronik → Bilgisayar → Ekran Kartı (3 seviye) + kökte Giyim.
 * Yol çözümü bu ağacın SEVİYE SEVİYE gezilmesini gerektirir.
 */
const CATEGORIES = [
  category("c_root", "Elektronik", null),
  category("c_mid", "Bilgisayar", "c_root"),
  category("c_leaf", "Ekran Kartı", "c_mid"),
  category("c_other", "Giyim", null),
];

function buildApp(totalProducts = 120) {
  const all = Array.from({ length: totalProducts }, (_, index) => selectorProduct(index + 1));

  const listProductSelector = vi.fn(
    async (
      storeId: string,
      criteria: { limit: number; offset: number; ids?: string[]; search?: string },
    ) => {
      if (storeId !== store.id) return { data: [], total: 0 };
      if (criteria.ids !== undefined) {
        const data = all.filter((product) => criteria.ids!.includes(product.id));
        return { data, total: data.length };
      }
      const matched = criteria.search
        ? all.filter((product) => product.title.includes(criteria.search!))
        : all;
      return {
        data: matched.slice(criteria.offset, criteria.offset + criteria.limit),
        total: matched.length,
      };
    },
  );

  const listCategories = vi.fn(
    async (storeId: string, criteria: { limit: number; offset: number; search?: string }) => {
      if (storeId !== store.id) return { data: [], total: 0 };
      const matched = criteria.search
        ? CATEGORIES.filter((row) => row.name.includes(criteria.search!))
        : CATEGORIES;
      return {
        data: matched.slice(criteria.offset, criteria.offset + criteria.limit),
        total: matched.length,
      };
    },
  );

  const findCategoriesByIds = vi.fn(async (storeId: string, ids: string[]) =>
    storeId === store.id ? CATEGORIES.filter((row) => ids.includes(row.id)) : [],
  );

  const dataAccess = {
    async findPlatformSessionByTokenHash() {
      return {
        id: "sess_1",
        expiresAt: new Date(Date.now() + 3_600_000),
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
      return id === store.id ? store : null;
    },
    listProductSelector,
    listCategories,
    findCategoriesByIds,
  } as unknown as AppDataAccess;

  return {
    app: createServer(config, { dataAccess }),
    listProductSelector,
    listCategories,
    findCategoriesByIds,
  };
}

describe("GET /stores/:storeId/products/selector — sayfalama ve projeksiyon", () => {
  it("varsayılan sayfa 1 / 25 kayıt; sıralama alfabetiktir (seçicinin anlamlı varsayılanı)", async () => {
    const { app, listProductSelector } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products/selector",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(listProductSelector.mock.calls[0]?.[1]).toMatchObject({
      limit: 25,
      offset: 0,
      sortBy: "title",
      sortOrder: "asc",
    });
    expect(res.json().pagination).toMatchObject({
      page: 1,
      pageSize: 25,
      totalItems: 120,
      totalPages: 5,
      // Legacy alanlar KORUNUR.
      limit: 25,
      offset: 0,
      total: 120,
    });
  });

  it("satır YALNIZ seçim için gerekli alanları taşır (ürün detay payload'ı sızmaz)", async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products/selector?pageSize=25",
      headers: AUTH,
    });

    const row = res.json().data[0];
    expect(Object.keys(row).sort()).toEqual(
      [
        "currency",
        "id",
        "imageUrl",
        "priceMinor",
        "sku",
        "slug",
        "status",
        "stockAvailable",
        "title",
        "variantCount",
      ].sort(),
    );
    // storageKey ASLA response'a girmez; yalnız türetilmiş URL.
    expect(row).not.toHaveProperty("coverStorageKey");
    expect(row).not.toHaveProperty("description");
    expect(row.imageUrl).toContain("stores/store_1/products/cover.webp");
  });

  it("page/pageSize offset'e çevrilir ve son sayfa doğru dilimi döner", async () => {
    const { app, listProductSelector } = buildApp(120);
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products/selector?page=5&pageSize=25",
      headers: AUTH,
    });

    expect(listProductSelector.mock.calls[0]?.[1]).toMatchObject({ limit: 25, offset: 100 });
    expect(res.json().data).toHaveLength(20);
    expect(res.json().pagination).toMatchObject({ page: 5, totalItems: 120, totalPages: 5 });
  });

  it("pageSize üst sınırı SUNUCUDA zorlanır (101 → 400)", async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products/selector?pageSize=101",
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("sıralama allowlist'i: tanınmayan sortBy 400 döner (serbest metin SQL'e girmez)", async () => {
    const { app, listProductSelector } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products/selector?sortBy=hack",
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    expect(listProductSelector).not.toHaveBeenCalled();
  });

  it("arama data-access'e taşınır ve totalItems eşleşen kümeyi yansıtır", async () => {
    const { app, listProductSelector } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products/selector?search=Ürün 119",
      headers: AUTH,
    });

    expect(listProductSelector.mock.calls[0]?.[1]).toMatchObject({ search: "Ürün 119" });
    expect(res.json().pagination).toMatchObject({ totalItems: 1, totalPages: 1 });
  });

  it("boş katalogda totalItems=0 ve totalPages=0 döner", async () => {
    const { app } = buildApp(0);
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products/selector",
      headers: AUTH,
    });
    expect(res.json().data).toEqual([]);
    expect(res.json().pagination).toMatchObject({ totalItems: 0, totalPages: 0 });
  });

  it("tenant izolasyonu: storeId HER çağrıda data-access'e geçer", async () => {
    const { app, listProductSelector } = buildApp();
    await app.inject({ method: "GET", url: "/stores/store_1/products/selector", headers: AUTH });
    expect(listProductSelector.mock.calls[0]?.[0]).toBe("store_1");
  });

  it("bilinmeyen mağaza 404 döner ve data-access'e hiç gidilmez", async () => {
    const { app, listProductSelector } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_other/products/selector",
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    expect(listProductSelector).not.toHaveBeenCalled();
  });
});

describe("GET /stores/:storeId/products/selector — `ids` çözüm modu", () => {
  it("100. kaydın ötesindeki seçili ürün, arama/sayfa OLMADAN çözülür (TD-093)", async () => {
    const { app, listProductSelector } = buildApp(120);
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products/selector?ids=prod_119",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(listProductSelector.mock.calls[0]?.[1]).toMatchObject({ ids: ["prod_119"] });
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].id).toBe("prod_119");
    expect(res.json().pagination).toMatchObject({ page: 1, totalItems: 1, totalPages: 1 });
  });

  it("istemcinin verdiği SIRA korunur", async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products/selector?ids=prod_3,prod_1,prod_2",
      headers: AUTH,
    });
    expect(res.json().data.map((row: { id: string }) => row.id)).toEqual([
      "prod_3",
      "prod_1",
      "prod_2",
    ]);
  });

  it("var olmayan id sessizce elenir (yanıt kısalır, hata dönmez)", async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/products/selector?ids=prod_1,silinmis",
      headers: AUTH,
    });
    expect(res.json().data.map((row: { id: string }) => row.id)).toEqual(["prod_1"]);
    expect(res.json().pagination).toMatchObject({ totalItems: 1 });
  });

  it("`ids` verilince arama ve sayfalama YOK SAYILIR (çözüm modu)", async () => {
    const { app, listProductSelector } = buildApp();
    await app.inject({
      method: "GET",
      url: "/stores/store_1/products/selector?ids=prod_1&search=zzz&page=9",
      headers: AUTH,
    });
    expect(listProductSelector.mock.calls[0]?.[1]).toMatchObject({ offset: 0, ids: ["prod_1"] });
  });

  it("`ids` sayısı üst sınırla kırpılır (sınırsız IN(...) kabul edilmez)", async () => {
    const { app, listProductSelector } = buildApp();
    const ids = Array.from({ length: 150 }, (_, index) => `prod_${index + 1}`).join(",");
    await app.inject({
      method: "GET",
      url: `/stores/store_1/products/selector?ids=${ids}`,
      headers: AUTH,
    });
    expect(listProductSelector.mock.calls[0]?.[1].ids).toHaveLength(100);
  });
});

describe("GET /stores/:storeId/categories/selector", () => {
  it("hiyerarşi yolu kökten yaprağa kurulur", async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/categories/selector?ids=c_leaf",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].path).toEqual(["Elektronik", "Bilgisayar", "Ekran Kartı"]);
  });

  it("yol çözümü SEVİYE başına TEK batched sorgu yapar (satır başına sorgu YOK)", async () => {
    const { app, findCategoriesByIds } = buildApp();
    await app.inject({ method: "GET", url: "/stores/store_1/categories/selector", headers: AUTH });

    // Sayfa 4 kategori döner; ebeveynleri 2 seviyede toplanır ve HER seviye tek
    // çağrıdır (4 satır için 4 çağrı DEĞİL).
    expect(findCategoriesByIds.mock.calls.length).toBeLessThanOrEqual(2);
    for (const call of findCategoriesByIds.mock.calls) {
      expect(call[0]).toBe("store_1");
    }
  });

  it("kök kategorinin yolu yalnız kendisidir", async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/categories/selector?ids=c_other",
      headers: AUTH,
    });
    expect(res.json().data[0].path).toEqual(["Giyim"]);
  });

  it("varsayılan sıralama alfabetiktir ve arama data-access'e taşınır", async () => {
    const { app, listCategories } = buildApp();
    await app.inject({
      method: "GET",
      url: "/stores/store_1/categories/selector?search=Bilgi",
      headers: AUTH,
    });
    expect(listCategories.mock.calls[0]?.[1]).toMatchObject({
      sortBy: "name",
      sortOrder: "asc",
      search: "Bilgi",
    });
  });

  it("başka mağazanın kategorisi çözülmez (tenant izolasyonu)", async () => {
    const { app, findCategoriesByIds } = buildApp();
    findCategoriesByIds.mockImplementationOnce(async () => []);
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/categories/selector?ids=baska_magaza_kategorisi",
      headers: AUTH,
    });
    expect(res.json().data).toEqual([]);
    expect(res.json().pagination).toMatchObject({ totalItems: 0, totalPages: 0 });
  });

  it("sıralama allowlist'i: tanınmayan sortBy 400 döner", async () => {
    const { app, listCategories } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/stores/store_1/categories/selector?sortBy=drop",
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    expect(listCategories).not.toHaveBeenCalled();
  });
});
