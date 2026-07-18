import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import { deriveProductCommerceView } from "../lib/sales-model";
import type { StorefrontProductDetail } from "../lib/catalog-types";

const cookie = { value: undefined as string | undefined };
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "commerce_os_locale" && cookie.value ? { value: cookie.value } : undefined,
  }),
}));

// BuyBox (client) artik useRouter + add-to-cart Server Action kullanir; statik
// markup smoke'unda router/aksiyon davranisi calistirilmaz, yalniz mount edilir.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("../lib/server/cart-actions", () => ({
  addToCartAction: vi.fn(),
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
    coverUrl: null,
    price: { mode: "amount", amountLabel: "₺1.299,00", compareAtLabel: "₺1.499,00", lowestRecentLabel: null },
    commerce: deriveProductCommerceView(onlineSales),
    badgeKind: "discount",
    campaign: null,
    secondaryCoupon: null,
    description: "Cozy hoodie for everyday wear",
    sku: "DEMO-HOODIE-BLK-M",
    variants: [
      {
        id: "v1",
        title: "Black / M",
        sku: "DEMO-HOODIE-BLK-M",
        priceLabel: "₺1.299,00",
        compareAtLabel: "₺1.499,00",
        priceMinor: 129900,
        compareAtMinor: 149900,
        currency: "TRY",
        available: 15,
        inStock: true,
        mediaOptionId: null,
      },
    ],
    callToActionLabel: null,
    whatsappMessageTemplate: null,
    inquiryFormTitle: null,
    appointmentNote: null,
    images: [],
    mediaDefiningAttributeId: null,
    related: [
      {
        handle: "demo-tote",
        title: "Demo Tote Bag",
        brand: "Commerce OS",
        categoryLabel: "Accessories",
        coverUrl: null,
        price: { mode: "amount", amountLabel: "₺399,00", compareAtLabel: null, lowestRecentLabel: null },
        commerce: deriveProductCommerceView(onlineSales),
        badgeKind: null,
        campaign: null,
        secondaryCoupon: null,
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
        price: { mode: "hidden", amountLabel: null, compareAtLabel: null, lowestRecentLabel: null },
        badgeKind: null,
        campaign: null,
        variants: [
          {
            id: "v1",
            title: "Standart",
            sku: "CAT-1",
            priceLabel: null,
            compareAtLabel: null,
            priceMinor: null,
            compareAtMinor: null,
            currency: "TRY",
            available: null,
            inStock: true,
            mediaOptionId: null,
          },
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

  it("disables add-to-cart and shows an out-of-stock message for a sold-out variant", async () => {
    byHandle.mockResolvedValue({
      ok: true,
      data: detail({
        variants: [
          {
            id: "v1",
            title: "Black / M",
            sku: "DEMO-HOODIE-BLK-M",
            priceLabel: "₺1.299,00",
            compareAtLabel: null,
            priceMinor: 129900,
            compareAtMinor: null,
            currency: "TRY",
            available: 0,
            inStock: false,
            mediaOptionId: null,
          },
        ],
        related: [],
      }),
    });
    const html = renderToStaticMarkup(await render());
    // Stokta yok mesaji + tukenmis rozeti; sepete ekle butonu disabled.
    expect(html).toContain("Bu ürün şu an stokta yok.");
    expect(html).toContain("Tükendi");
    expect(html).toContain("disabled");
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

// F4A.1 — Buy box kampanya bilgi kutusu: etiket + "Sepette uygulanır" +
// kupon/min-sepet kosul satirlari sunucu projeksiyonundan gelen hazir
// metinlerle gosterilir; kampanya yoksa kutu hic render edilmez.
describe("storefront · product detail campaign info (F4A.1/F4A.3)", () => {
  it("automatic discount shows 'Kod gerekmez' + min-order, not a coupon requirement", async () => {
    byHandle.mockResolvedValue({
      ok: true,
      data: detail({
        campaign: {
          displayKind: "AUTOMATIC_CART_DISCOUNT",
          badgeText: "Sepette %10 indirim",
          label: "Sepette %10 indirim",
          discountText: "%10",
          discountType: "PERCENT",
          discountValue: 10,
          maxDiscountAmountMinor: null,
          // Birim fiyat (₺1.299) alt-limitin (₺2.000) ALTINDA → tek birim guvenli
          // tahmin uretmez (motorla ayni kural); fallback kutu (etiket + not) gosterilir.
          minOrderAmountMinor: 200000,
          requiresCoupon: false,
          couponCode: null,
          couponAction: "MANUAL_ONLY",
          minOrderLabel: "₺2.000",
          endsAt: null,
          estimatedFinalLabel: null,
          displayTitle: null,
          shortDescription: null,
          badgeLabel: null,
          terms: null,
        },
        related: [],
      }),
    });
    const html = renderToStaticMarkup(await render());
    expect(html).toContain("Sepette %10 indirim");
    expect(html).toContain("Kod gerekmez");
    expect(html).toContain("₺2.000 üzeri geçerli");
    expect(html).not.toContain("Kupon kodu gerektirir");
  });

  it("F4A.6: automatic discount with a safe estimate shows a prominent 'Sepette' price block", async () => {
    byHandle.mockResolvedValue({
      ok: true,
      data: detail({
        campaign: {
          displayKind: "AUTOMATIC_CART_DISCOUNT",
          badgeText: "Sepette %10 indirim",
          label: "Sepette %10 indirim",
          discountText: "%10",
          discountType: "PERCENT",
          discountValue: 10,
          maxDiscountAmountMinor: null,
          minOrderAmountMinor: null,
          requiresCoupon: false,
          couponCode: null,
          couponAction: "MANUAL_ONLY",
          minOrderLabel: null,
          endsAt: null,
          estimatedFinalLabel: "₺1.169,10",
          displayTitle: null,
          shortDescription: null,
          badgeLabel: null,
          terms: null,
        },
        related: [],
      }),
    });
    const html = renderToStaticMarkup(await render());
    expect(html).toContain("Sepette");
    // Per-varyant tahmin: secili varyant fiyati 129900 × %10 → ₺1.169,10 (reaktif).
    expect(html).toContain("₺1.169,10"); // güvenli nihai fiyat
    expect(html).toContain("Kod gerekmez");
    expect(html).not.toContain("Kupon kodu gerektirir");
  });

  it("public coupon shows a coupon card with the code and add-to-wallet action", async () => {
    byHandle.mockResolvedValue({
      ok: true,
      data: detail({
        campaign: {
          displayKind: "PUBLIC_COUPON",
          badgeText: "Kuponlu ürün",
          label: "₺250 kupon",
          discountText: "₺250",
          discountType: "FIXED_AMOUNT",
          discountValue: 25000,
          maxDiscountAmountMinor: null,
          minOrderAmountMinor: 100000,
          requiresCoupon: true,
          couponCode: "TEST250",
          couponAction: "CLAIM",
          minOrderLabel: "₺1.000",
          endsAt: null,
          estimatedFinalLabel: null,
          displayTitle: null,
          shortDescription: null,
          badgeLabel: null,
          terms: null,
        },
        related: [],
      }),
    });
    const html = renderToStaticMarkup(await render());
    const tr = getDictionary("tr").storefront.detail;
    expect(html).toContain("TEST250"); // visible coupon code
    expect(html).toContain("₺250");
    expect(html).toContain(tr.couponCardTitle); // "Kupon" card, not just text
    expect(html).toContain(tr.couponAddToWallet); // action path exists
    expect(html).toContain("₺1.000"); // alt limit
  });

  it("renders no campaign box when there is no campaign", async () => {
    byHandle.mockResolvedValue({ ok: true, data: detail({ related: [] }) });
    const html = renderToStaticMarkup(await render());
    expect(html).not.toContain("Kod gerekmez");
  });
});
