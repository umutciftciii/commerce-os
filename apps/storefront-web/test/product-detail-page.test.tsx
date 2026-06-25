import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveProductCommerceView } from "../lib/sales-model";
import type { StorefrontProductDetail } from "../lib/catalog-types";

const cookie = { value: undefined as string | undefined };
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "commerce_os_locale" && cookie.value ? { value: cookie.value } : undefined,
  }),
}));

const byHandle = vi.fn();
vi.mock("../lib/server/catalog", () => ({
  getStorefrontProductByHandle: (handle: string) => byHandle(handle),
}));

import ProductDetailPage from "../app/products/[handle]/page.js";

const onlineSales = {
  salesMode: "ONLINE",
  priceVisibility: "VISIBLE",
  primaryAction: "ADD_TO_CART",
  purchasable: true,
  whatsappEnabled: false,
  inquiryEnabled: false,
  appointmentRequired: false,
  minOrderQuantity: 1,
  maxOrderQuantity: null,
} as const;

const catalogSales = {
  salesMode: "CATALOG_ONLY",
  priceVisibility: "HIDDEN",
  primaryAction: "CONTACT_FORM",
  purchasable: false,
  whatsappEnabled: false,
  inquiryEnabled: false,
  appointmentRequired: false,
  minOrderQuantity: 1,
  maxOrderQuantity: null,
} as const;

function detail(overrides: Partial<StorefrontProductDetail> = {}): StorefrontProductDetail {
  return {
    handle: "demo-hoodie",
    title: "Demo Hoodie",
    brand: "Commerce OS",
    categoryLabel: "Apparel",
    price: { mode: "amount", amountLabel: "₺1.299,00", compareAtLabel: "₺1.499,00" },
    commerce: deriveProductCommerceView(onlineSales),
    badgeKind: "discount",
    description: "Cozy hoodie for everyday wear",
    sku: "DEMO-HOODIE-BLK-M",
    variants: [
      { id: "v1", title: "Black / M", sku: "DEMO-HOODIE-BLK-M", priceLabel: "₺1.299,00", compareAtLabel: "₺1.499,00", available: 15, inStock: true },
    ],
    callToActionLabel: null,
    whatsappMessageTemplate: null,
    inquiryFormTitle: null,
    appointmentNote: null,
    related: [
      {
        handle: "demo-tote",
        title: "Demo Tote Bag",
        brand: "Commerce OS",
        categoryLabel: "Accessories",
        price: { mode: "amount", amountLabel: "₺399,00", compareAtLabel: null },
        commerce: deriveProductCommerceView(onlineSales),
        badgeKind: null,
      },
    ],
    ...overrides,
  };
}

function render(handle = "demo-hoodie") {
  return ProductDetailPage({ params: Promise.resolve({ handle }) });
}

afterEach(() => {
  cookie.value = undefined;
  vi.clearAllMocks();
});

describe("storefront · product detail (decision center)", () => {
  it("renders the full ONLINE decision center", async () => {
    byHandle.mockResolvedValue({ ok: true, data: detail() });
    const html = renderToStaticMarkup(await render());

    // Baslik / SKU / fiyat
    expect(html).toContain("Demo Hoodie");
    expect(html).toContain("DEMO-HOODIE-BLK-M");
    expect(html).toContain("₺1.299,00");
    expect(html).toContain("₺1.499,00");
    // Galeri + buy box CTA + adet
    expect(html).toContain("Sepete ekle");
    expect(html).toContain("Hemen al");
    expect(html).toContain("Adet");
    // Varyant + stok
    expect(html).toContain("Black / M");
    expect(html).toContain("Stokta");
    // Guven / teslimat / satici yer tutuculari
    expect(html).toContain("Tahmini teslimat");
    expect(html).toContain("Satıcı");
    // Yorumlar / soru-cevap yer tutuculari
    expect(html).toContain("Değerlendirmeler");
    expect(html).toContain("Henüz soru sorulmamış");
    // Benzer urunler (canli)
    expect(html).toContain("Benzer ürünler");
    expect(html).toContain("Demo Tote Bag");
  });

  it("CATALOG_ONLY hides the numeric price and never shows add-to-cart", async () => {
    byHandle.mockResolvedValue({
      ok: true,
      data: detail({
        commerce: deriveProductCommerceView(catalogSales),
        price: { mode: "hidden", amountLabel: null, compareAtLabel: null },
        badgeKind: null,
        variants: [
          { id: "v1", title: "Standart", sku: "CAT-1", priceLabel: null, compareAtLabel: null, available: null, inStock: true },
        ],
        // Benzer urunler bos: sayfa-duzeyi "Sepete ekle"/"₺" kontrolu yalniz bu
        // urunun buy box'ina bakar (ONLINE benzer urun karti kirletmesin).
        related: [],
      }),
    });
    const html = renderToStaticMarkup(await render());
    expect(html).toContain("Bilgi al");
    expect(html).not.toContain("Sepete ekle");
    expect(html).not.toContain("Adet"); // adet secici yok
    expect(html).not.toContain("₺"); // numerik fiyat yok
  });

  it("renders a friendly not-found state for an unknown handle", async () => {
    byHandle.mockResolvedValue({ ok: true, data: null });
    const html = renderToStaticMarkup(await render("nope"));
    expect(html).toContain("Ürün bulunamadı");
  });

  it("renders English copy with a locale=en cookie", async () => {
    cookie.value = "en";
    byHandle.mockResolvedValue({ ok: true, data: detail() });
    const html = renderToStaticMarkup(await render());
    expect(html).toContain("Add to cart");
    expect(html).toContain("Related products");
  });
});
