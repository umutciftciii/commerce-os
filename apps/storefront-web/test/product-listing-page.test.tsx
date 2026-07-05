import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveProductCommerceView } from "../lib/sales-model";
import type { StorefrontProductSummary } from "../lib/catalog-types";

// Locale cookie sahtelemesi (sunucu sayfalari cookie'den dil cozer).
const cookie = { value: undefined as string | undefined };
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "commerce_os_locale" && cookie.value ? { value: cookie.value } : undefined,
  }),
}));

const listing = vi.fn();
vi.mock("../lib/server/catalog", () => ({
  getStorefrontListing: () => listing(),
}));

import ProductListingPage from "../app/products/page.js";

const online = {
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

function summary(handle: string, title: string): StorefrontProductSummary {
  return {
    handle,
    title,
    brand: "Marka",
    categoryLabel: "Giyim",
    price: { mode: "amount", amountLabel: "₺1.299,00", compareAtLabel: null },
    commerce: deriveProductCommerceView(online),
    badgeKind: null,
    campaign: null,
  };
}

afterEach(() => {
  cookie.value = undefined;
  vi.clearAllMocks();
});

describe("storefront · product listing page", () => {
  it("renders live product cards with detail links", async () => {
    listing.mockResolvedValue({ ok: true, data: [summary("demo-hoodie", "Demo Hoodie")] });
    const html = renderToStaticMarkup(await ProductListingPage());
    expect(html).toContain("Demo Hoodie");
    expect(html).toContain('href="/products/demo-hoodie"');
    expect(html).toContain("Sepete ekle");
  });

  it("renders the empty state when the catalogue has no products", async () => {
    listing.mockResolvedValue({ ok: true, data: [] });
    const html = renderToStaticMarkup(await ProductListingPage());
    expect(html).toContain("Mağazada henüz ürün yok");
  });

  it("renders the error state when the catalogue fails to load", async () => {
    listing.mockResolvedValue({ ok: false, reason: "error" });
    const html = renderToStaticMarkup(await ProductListingPage());
    expect(html).toContain("Ürünler yüklenemedi");
  });

  it("renders English copy with a locale=en cookie", async () => {
    cookie.value = "en";
    listing.mockResolvedValue({ ok: true, data: [summary("demo-hoodie", "Demo Hoodie")] });
    const html = renderToStaticMarkup(await ProductListingPage());
    expect(html).toContain("All products");
    expect(html).toContain("Add to cart");
  });
});
