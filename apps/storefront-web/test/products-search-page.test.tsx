import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicSearchProduct, PublicSearchResponse } from "@commerce-os/api-client";

// next/navigation (client island'lar: SearchTransitionProvider useRouter, pagination/sort).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

// Locale cookie sahtelemesi.
const cookie = { value: undefined as string | undefined };
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "commerce_os_locale" && cookie.value ? { value: cookie.value } : undefined,
  }),
}));

const search = vi.fn();
vi.mock("../lib/server/search", () => ({
  getStorefrontSearch: (...args: unknown[]) => search(...args),
}));

// Kategori navigasyon şeridi kaynağı (FEATURED_CATEGORIES). PLP başlığı görünen adı buradan
// çözülür; testte kontrollü bir liste veririz (varsayılan: boş → slug fallback).
const navCategories = vi.fn<() => Promise<unknown[]>>(async () => []);
vi.mock("../lib/server/navigation", () => ({
  getNavCategories: () => navCategories(),
}));

import ProductsPage from "../app/products/page.js";

function productFixture(overrides: Partial<PublicSearchProduct> = {}): PublicSearchProduct {
  return {
    id: "p1",
    slug: "demo-hoodie",
    title: "Demo Hoodie",
    brand: "Marka",
    categoryLabel: "Giyim",
    minPriceMinor: 129900,
    maxPriceMinor: 149900,
    currency: "TRY",
    availability: "IN_STOCK",
    inStock: true,
    image: { url: "/media/a.webp", altText: "Ön", position: 0, variantOptionId: null },
    compareAtMinor: null,
    discountPercent: null,
    omnibusPreviousPriceMinor: null,
    secondaryImage: null,
    swatches: [],
    swatchTotalCount: 0,
    // TODO-156D (TD-056 kapatma) — kampanya rozeti alanı zorunlu (nullable); fixture'a eklendi.
    campaign: null,
    ...overrides,
  };
}

function response(
  products: PublicSearchProduct[],
  pagination: Partial<PublicSearchResponse["pagination"]> = {},
): PublicSearchResponse {
  return {
    query: null,
    category: null,
    sort: "relevance",
    appliedFilters: { minPrice: null, maxPrice: null, inStock: false, attributes: [] },
    pagination: {
      page: 1,
      pageSize: 24,
      totalItems: products.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      ...pagination,
    },
    facets: [],
    products,
  };
}

function render(sp: Record<string, string | string[] | undefined>) {
  return ProductsPage({ searchParams: Promise.resolve(sp) }).then(renderToStaticMarkup);
}

afterEach(() => {
  cookie.value = undefined;
  vi.clearAllMocks();
});

describe("storefront · products search page (SSR)", () => {
  it("normal sonuç → kartları detay linkiyle render eder", async () => {
    search.mockResolvedValue({ ok: true, data: response([productFixture()]) });
    const html = await render({});
    expect(html).toContain("Demo Hoodie");
    expect(html).toContain('href="/products/demo-hoodie"');
    expect(html).toContain("1.299,00");
  });

  it("boş katalog → mağaza boş durumu", async () => {
    search.mockResolvedValue({ ok: true, data: response([]) });
    const html = await render({});
    expect(html).toContain("Mağazada henüz ürün yok");
  });

  it("arama query → başlık + no-result", async () => {
    search.mockResolvedValue({ ok: true, data: response([]) });
    const html = await render({ q: "yokürün" });
    expect(html).toContain("“yokürün” için sonuçlar");
    expect(html).toContain("sonuç bulunamadı");
    expect(html).toContain("Aramayı temizle");
  });

  it("kategori → kategori boş durumu (q yok)", async () => {
    search.mockResolvedValue({ ok: true, data: response([]) });
    const html = await render({ category: "erkek" });
    expect(html).toContain("Bu kategoride ürün yok");
  });

  it("page 2 → pagination önceki aktif", async () => {
    search.mockResolvedValue({
      ok: true,
      data: response([productFixture()], {
        page: 2,
        totalPages: 3,
        hasPreviousPage: true,
        hasNextPage: true,
        totalItems: 60,
      }),
    });
    const html = await render({ page: "2" });
    expect(html).toContain("Sonraki");
    expect(html).toContain("Önceki");
    expect(html).toContain('aria-current="page"');
  });

  it("sort → SSR seçili değeri yansıtır", async () => {
    search.mockResolvedValue({ ok: true, data: response([productFixture()]) });
    const html = await render({ sort: "price_asc" });
    // <option value="price_asc" ... selected> kontrollü <select>
    expect(html).toContain('value="price_asc"');
  });

  it("API hata → error boundary'ye fırlatır", async () => {
    search.mockResolvedValue({ ok: false, reason: "error" });
    await expect(render({})).rejects.toThrow("STOREFRONT_SEARCH_FAILED");
  });

  it("kategori başlığı → seçili kategorinin adı (ilk ürünün yaprak etiketi DEĞİL)", async () => {
    // Ürünün birincil/yaprak kategorisi "Ekran Kartı" olsa da başlık seçili üst kategori "Elektronik" olmalı.
    navCategories.mockResolvedValueOnce([
      { key: "c-elektronik", title: "Elektronik", description: null, href: "/products?category=elektronik", imageUrl: null },
      { key: "c-moda", title: "Moda", description: null, href: "/products?category=moda", imageUrl: null },
    ]);
    search.mockResolvedValue({
      ok: true,
      data: response([productFixture({ categoryLabel: "Ekran Kartı" })]),
    });
    const html = await render({ category: "elektronik" });
    // H1 seçili kategori adını gösterir (ürün kartı yaprak etiketi "Ekran Kartı" ayrı yerde kalabilir).
    expect(html).toContain(">Elektronik</h1>");
    // Regresyon guard: ilk ürünün yaprak kategorisi H1 BAŞLIK olarak KULLANILMAZ.
    expect(html).not.toContain(">Ekran Kartı</h1>");
  });

  it("kategori başlığı → nav'da eşleşme yoksa slug'a düşer (uydurma yok)", async () => {
    navCategories.mockResolvedValueOnce([]);
    search.mockResolvedValue({
      ok: true,
      data: response([productFixture({ categoryLabel: "Ekran Kartı" })]),
    });
    const html = await render({ category: "elektronik" });
    expect(html).toContain(">elektronik</h1>");
    expect(html).not.toContain(">Ekran Kartı</h1>");
  });

  it("kategori bulunamadı → kontrollü uyarı (fırlatmaz)", async () => {
    search.mockResolvedValue({ ok: false, reason: "category-not-found" });
    const html = await render({ category: "yok" });
    expect(html).toContain("Kategori bulunamadı");
  });

  it("geçersiz/bad-request → kurtarılabilir boş durum", async () => {
    search.mockResolvedValue({ ok: false, reason: "bad-request" });
    const html = await render({ "filter[bogus]": "x" });
    expect(html).toContain("Filtreleri temizle");
  });

  it("İngilizce kopya (locale=en cookie)", async () => {
    cookie.value = "en";
    search.mockResolvedValue({ ok: true, data: response([]) });
    const html = await render({});
    expect(html).toContain("No products yet");
  });

  it("compareAt/discount/Omnibus kartta gösterilir", async () => {
    search.mockResolvedValue({
      ok: true,
      data: response([
        productFixture({ compareAtMinor: 149900, discountPercent: 13, omnibusPreviousPriceMinor: 139900 }),
      ]),
    });
    const html = await render({});
    expect(html).toContain("%13");
    expect(html).toContain("1.499,00"); // compareAt üstü çizili
    expect(html).toContain("1.399,00"); // omnibus
  });
});
