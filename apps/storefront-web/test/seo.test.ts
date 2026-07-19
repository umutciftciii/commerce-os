import { afterEach, describe, expect, it } from "vitest";
import { absoluteUrl, siteOrigin } from "../lib/seo/site-url";
import {
  categoryPath,
  homePath,
  productPath,
  productsPath,
  searchActionTemplate,
} from "../lib/seo/routes";
import {
  buildCategoryBreadcrumb,
  buildProductBreadcrumb,
  buildProductsBreadcrumb,
} from "../lib/seo/breadcrumb";
import {
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
  buildOrganizationJsonLd,
  buildProductJsonLd,
  buildWebSiteJsonLd,
  minorToDecimalString,
  SCHEMA_IN_STOCK,
  SCHEMA_OUT_OF_STOCK,
} from "../lib/seo/json-ld";
import {
  deriveProductOffer,
  productMetaDescription,
  productMetaTitle,
  truncateForMeta,
} from "../lib/seo/product-seo";
import { buildMetadata } from "../lib/seo/metadata";
import type { StorefrontVariantView } from "../lib/catalog-types";

const ORIGIN_KEY = "STOREFRONT_SITE_URL";

afterEach(() => {
  delete process.env[ORIGIN_KEY];
});

describe("site-url — mutlak URL otoritesi", () => {
  it("env yoksa localhost fallback (sondaki / yok)", () => {
    expect(siteOrigin()).toBe("http://localhost:3000");
  });
  it("env geçerli origin → path/query düşer, sondaki / kırpılır", () => {
    process.env[ORIGIN_KEY] = "https://magaza.example/base/";
    expect(siteOrigin()).toBe("https://magaza.example");
  });
  it("boş/whitespace env → fallback (TD-036)", () => {
    process.env[ORIGIN_KEY] = "   ";
    expect(siteOrigin()).toBe("http://localhost:3000");
  });
  it("absoluteUrl göreli path'i mutlaklar (tek slash)", () => {
    process.env[ORIGIN_KEY] = "https://m.example";
    expect(absoluteUrl("/products/x")).toBe("https://m.example/products/x");
    expect(absoluteUrl("products/x")).toBe("https://m.example/products/x");
  });
  it("absoluteUrl zaten mutlaksa dokunmaz", () => {
    expect(absoluteUrl("https://cdn.example/a.jpg")).toBe("https://cdn.example/a.jpg");
  });
});

describe("routes — URL governance (deterministik)", () => {
  it("temel path'ler", () => {
    expect(homePath()).toBe("/");
    expect(productsPath()).toBe("/products");
    expect(productPath("kirmizi-tisort")).toBe("/products/kirmizi-tisort");
  });
  it("productPath handle'ı encode eder", () => {
    expect(productPath("a b")).toBe("/products/a%20b");
  });
  it("categoryPath = PLP + category (kanonik)", () => {
    expect(categoryPath("ayakkabi")).toBe("/products?category=ayakkabi");
    expect(categoryPath("ayakkabi", { page: 3 })).toBe("/products?category=ayakkabi&page=3");
    expect(categoryPath("  ")).toBe("/products");
  });
  it("searchAction şablonu ham yer tutucu içerir", () => {
    expect(searchActionTemplate()).toBe("/products?q={search_term_string}");
  });
});

describe("breadcrumb — tek kaynak trail", () => {
  const labels = { home: "Ana sayfa", products: "Ürünler" };
  it("PDP trail: home › ürünler › kategori › başlık(current)", () => {
    const trail = buildProductBreadcrumb({
      labels,
      title: "Kırmızı Tişört",
      categoryLabel: "Giyim",
      categorySlug: "giyim",
    });
    expect(trail).toEqual([
      { label: "Ana sayfa", path: "/" },
      { label: "Ürünler", path: "/products" },
      { label: "Giyim", path: "/products?category=giyim" },
      { label: "Kırmızı Tişört", path: null },
    ]);
  });
  it("kategori slug yoksa etiket link'siz (uydurma URL yok)", () => {
    const trail = buildProductBreadcrumb({ labels, title: "X", categoryLabel: "Giyim", categorySlug: null });
    expect(trail[2]).toEqual({ label: "Giyim", path: null });
  });
  it("kategori landing trail: home › ürünler › kategori(current)", () => {
    expect(buildCategoryBreadcrumb({ labels, categoryLabel: "Giyim" })).toEqual([
      { label: "Ana sayfa", path: "/" },
      { label: "Ürünler", path: "/products" },
      { label: "Giyim", path: null },
    ]);
  });
  it("düz PLP trail: ürünler current", () => {
    expect(buildProductsBreadcrumb(labels)).toEqual([
      { label: "Ana sayfa", path: "/" },
      { label: "Ürünler", path: null },
    ]);
  });
});

describe("json-ld — builder'lar (boş alan yok, mutlak URL)", () => {
  const abs = (p: string) => `https://m.example${p}`;

  it("minorToDecimalString: kuruş → 2 basamak decimal", () => {
    expect(minorToDecimalString(129900)).toBe("1299.00");
    expect(minorToDecimalString(50)).toBe("0.50");
  });

  it("Organization: logo yoksa alan düşer", () => {
    expect(buildOrganizationJsonLd({ name: "M", url: "https://m.example" })).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "M",
      url: "https://m.example",
    });
    expect(buildOrganizationJsonLd({ name: "M", url: "https://m.example", logoUrl: "https://m.example/l.png" })).toHaveProperty(
      "logo",
      "https://m.example/l.png",
    );
  });

  it("WebSite: SearchAction + query-input", () => {
    const ld = buildWebSiteJsonLd({ name: "M", url: "https://m.example", searchUrlTemplate: "https://m.example/products?q={search_term_string}" });
    expect((ld.potentialAction as Record<string, unknown>)["@type"]).toBe("SearchAction");
    expect((ld.potentialAction as Record<string, unknown>)["query-input"]).toBe("required name=search_term_string");
  });

  it("BreadcrumbList: current(path=null) leafUrl alır, ara düğümler mutlak", () => {
    const trail = [
      { label: "Ana sayfa", path: "/" },
      { label: "Ürünler", path: null },
    ];
    const ld = buildBreadcrumbJsonLd(trail, abs, "https://m.example/products");
    const items = ld.itemListElement as Array<Record<string, unknown>>;
    expect(items[0]).toEqual({ "@type": "ListItem", position: 1, name: "Ana sayfa", item: "https://m.example/" });
    expect(items[1]).toEqual({ "@type": "ListItem", position: 2, name: "Ürünler", item: "https://m.example/products" });
  });

  it("ItemList: sıralı position + url", () => {
    const ld = buildItemListJsonLd({ items: [{ url: "https://m.example/products/a" }, { url: "https://m.example/products/b" }] });
    const items = ld.itemListElement as Array<Record<string, unknown>>;
    expect(items.map((i) => i.position)).toEqual([1, 2]);
  });

  it("Product: tek fiyat → Offer, InStock", () => {
    const ld = buildProductJsonLd({
      name: "X",
      url: "https://m.example/products/x",
      brand: "B",
      sku: "SKU1",
      images: ["https://m.example/a.jpg"],
      offer: { currency: "TRY", lowPriceMinor: 129900, highPriceMinor: 129900, offerCount: 1, inStock: true, url: "https://m.example/products/x" },
    });
    expect(ld.brand).toEqual({ "@type": "Brand", name: "B" });
    expect(ld.offers).toEqual({
      "@type": "Offer",
      priceCurrency: "TRY",
      price: "1299.00",
      availability: SCHEMA_IN_STOCK,
      url: "https://m.example/products/x",
    });
  });

  it("Product: çoklu farklı fiyat → AggregateOffer, OutOfStock", () => {
    const ld = buildProductJsonLd({
      name: "X",
      url: "https://m.example/products/x",
      offer: { currency: "TRY", lowPriceMinor: 100000, highPriceMinor: 150000, offerCount: 3, inStock: false, url: "https://m.example/products/x" },
    });
    expect(ld.offers).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: "1000.00",
      highPrice: "1500.00",
      offerCount: 3,
      availability: SCHEMA_OUT_OF_STOCK,
    });
  });

  it("Product: fiyat yoksa offers alanı düşer + boş image/description yazılmaz", () => {
    const ld = buildProductJsonLd({ name: "X", url: "https://m.example/products/x", description: "", images: [], offer: null });
    expect(ld).not.toHaveProperty("offers");
    expect(ld).not.toHaveProperty("image");
    expect(ld).not.toHaveProperty("description");
    expect(ld).not.toHaveProperty("brand");
  });
});

describe("product-seo — türetme", () => {
  const variant = (over: Partial<StorefrontVariantView>): StorefrontVariantView => ({
    id: "v",
    title: "V",
    sku: "SKU",
    priceLabel: null,
    compareAtLabel: null,
    priceMinor: null,
    compareAtMinor: null,
    currency: "TRY",
    available: 0,
    inStock: false,
    mediaOptionId: null,
    ...over,
  });

  it("başlık: seoTitle > title", () => {
    expect(productMetaTitle({ seoTitle: "SEO", title: "T" })).toBe("SEO");
    expect(productMetaTitle({ seoTitle: null, title: "T" })).toBe("T");
    expect(productMetaTitle({ seoTitle: "  ", title: "T" })).toBe("T");
  });

  it("açıklama: seoDescription > description > fallback (kırpılmış)", () => {
    expect(productMetaDescription({ seoDescription: "S", description: "D" }, "F")).toBe("S");
    expect(productMetaDescription({ seoDescription: null, description: "D" }, "F")).toBe("D");
    expect(productMetaDescription({ seoDescription: null, description: null }, "F")).toBe("F");
  });

  it("truncateForMeta: uzun metni kelime sınırında keser + …", () => {
    const long = "kelime ".repeat(40).trim();
    const out = truncateForMeta(long, 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("  ");
  });

  it("deriveProductOffer: görünür fiyat yoksa null", () => {
    expect(deriveProductOffer({ variants: [variant({ priceMinor: null })] })).toBeNull();
  });

  it("deriveProductOffer: çoklu fiyat → low/high/offerCount + inStock", () => {
    expect(
      deriveProductOffer({
        variants: [
          variant({ priceMinor: 150000, inStock: false }),
          variant({ priceMinor: 100000, inStock: true }),
        ],
      }),
    ).toEqual({ currency: "TRY", lowPriceMinor: 100000, highPriceMinor: 150000, offerCount: 2, inStock: true });
  });
});

describe("buildMetadata — merkezî builder", () => {
  it("canonical göreli + OG url mutlak + robots", () => {
    process.env[ORIGIN_KEY] = "https://m.example";
    const md = buildMetadata({
      title: "T",
      description: "D",
      canonicalPath: "/products/x",
      robots: { index: true, follow: true },
      siteName: "M",
      locale: "tr",
    });
    expect(md.alternates?.canonical).toBe("/products/x");
    expect((md.openGraph as { url?: unknown }).url).toBe("https://m.example/products/x");
    expect(md.robots).toMatchObject({ index: true, follow: true });
  });

  it("noindex kararı taşınır + og:locale tr/en", () => {
    const md = buildMetadata({
      description: "D",
      canonicalPath: "/products?q=x",
      robots: { index: false, follow: true },
      siteName: "M",
      locale: "en",
    });
    expect(md.robots).toMatchObject({ index: false, follow: true });
    expect((md.openGraph as { locale?: unknown }).locale).toBe("en_US");
  });

  it("görsel yoksa twitter summary; varsa summary_large_image", () => {
    const withImg = buildMetadata({ description: "D", canonicalPath: "/", siteName: "M", locale: "tr", openGraph: { images: ["/a.jpg"] } });
    expect((withImg.twitter as { card?: unknown }).card).toBe("summary_large_image");
    const noImg = buildMetadata({ description: "D", canonicalPath: "/", siteName: "M", locale: "tr" });
    expect((noImg.twitter as { card?: unknown }).card).toBe("summary");
  });
});
