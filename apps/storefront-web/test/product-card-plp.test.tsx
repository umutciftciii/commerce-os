import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import { ProductCard } from "../components/ui/product-card";
import { deriveProductCommerceView } from "../lib/sales-model";
import type { StorefrontPrice, StorefrontProductSummary } from "../lib/catalog-types";

// Adim 3 (PLP) — Yeni minimal/editoryel kart. Home kartinin aksine wishlist/
// quick-view/rating TASIMAZ; ancak GERCEK ticaret semantigini (satis-modu CTA,
// fiyat gorunurlugu, F4A kampanya rozeti, F4B Omnibus) korur.

const tr = getDictionary("tr").storefront;
const en = getDictionary("en").storefront;

const sales = {
  online: { salesMode: "ONLINE", priceVisibility: "VISIBLE", primaryAction: "ADD_TO_CART", purchasable: true, whatsappEnabled: false, inquiryEnabled: false, appointmentRequired: false, minOrderQuantity: 1, maxOrderQuantity: null },
  inquiry: { salesMode: "INQUIRY", priceVisibility: "ON_REQUEST", primaryAction: "REQUEST_PRICE", purchasable: false, whatsappEnabled: false, inquiryEnabled: true, appointmentRequired: false, minOrderQuantity: 1, maxOrderQuantity: null },
} as const;

function summary(
  salesOverrides: Parameters<typeof deriveProductCommerceView>[0],
  price: StorefrontPrice,
  extra: Partial<StorefrontProductSummary> = {},
): StorefrontProductSummary {
  return {
    handle: "p",
    title: "Test Ürün",
    brand: "Marka",
    categoryLabel: "Giyim",
    coverUrl: null,
    price,
    commerce: deriveProductCommerceView(salesOverrides),
    badgeKind: price.compareAtLabel ? "discount" : null,
    campaign: null,
    secondaryCoupon: null,
    ...extra,
  };
}

const amount: StorefrontPrice = { mode: "amount", amountLabel: "₺1.299,00", compareAtLabel: "₺1.499,00", lowestRecentLabel: "₺1.199,00" };
const onRequest: StorefrontPrice = { mode: "onRequest", amountLabel: null, compareAtLabel: null, lowestRecentLabel: null };

describe("PLP ProductCard · commerce semantics", () => {
  it("ONLINE shows the price, strike-through compare-at, discount badge and add-to-cart hint", () => {
    const html = renderToStaticMarkup(<ProductCard product={summary(sales.online, amount)} t={tr} />);
    expect(html).toContain("₺1.299,00");
    expect(html).toContain("₺1.499,00");
    expect(html).toContain("line-through");
    expect(html).toContain(tr.badges.discount);
    expect(html).toContain(tr.cta.addToCart); // "Sepete ekle"
    expect(html).toContain('href="/products/p"');
  });

  it("renders the EU Omnibus lowest-price note when a discount is active", () => {
    const html = renderToStaticMarkup(<ProductCard product={summary(sales.online, amount)} t={tr} />);
    expect(html).toContain("₺1.199,00");
  });

  it("INQUIRY hides the number and shows the request-price CTA hint", () => {
    const html = renderToStaticMarkup(<ProductCard product={summary(sales.inquiry, onRequest)} t={tr} />);
    expect(html).toContain(tr.cta.requestPrice); // "Fiyat sor"
    expect(html).toContain(tr.price.onRequest);
    expect(html).not.toContain("₺");
  });

  it("does not use the accent colour inside the card", () => {
    const html = renderToStaticMarkup(<ProductCard product={summary(sales.online, amount)} t={tr} />);
    // Aksan (#735389) yalniz ust-seviye tekil CTA icin; kart notr `ink` kullanir.
    expect(html).not.toContain("text-accent");
    expect(html).not.toContain("bg-accent");
  });

  it("campaign badge takes precedence over the compare-at discount badge", () => {
    const campaign = {
      displayKind: "AUTOMATIC_CART_DISCOUNT" as const,
      badgeText: "Sepette %10 indirim",
      label: "Sepette %10 indirim",
      discountText: "%10",
      requiresCoupon: false,
      couponCode: null,
      couponAction: "MANUAL_ONLY" as const,
      minOrderLabel: null,
      endsAt: null,
      estimatedFinalLabel: "₺1.169,10",
      displayTitle: null,
      shortDescription: null,
      badgeLabel: null,
      terms: null,
    };
    const html = renderToStaticMarkup(
      <ProductCard
        product={summary(sales.online, { mode: "amount", amountLabel: "₺1.299,00", compareAtLabel: null, lowestRecentLabel: null }, { campaign, badgeKind: null })}
        t={tr}
      />,
    );
    expect(html).toContain("Sepette %10 indirim");
    expect(html).toContain(tr.badges.inCart);
    expect(html).toContain("₺1.169,10");
    expect(html).not.toContain(`>${tr.badges.discount}<`);
  });

  it("renders English CTA copy with the en dictionary", () => {
    const html = renderToStaticMarkup(<ProductCard product={summary(sales.online, amount)} t={en} />);
    expect(html).toContain("Add to cart");
    expect(html).not.toContain("Sepete ekle");
  });

  // ADR-065 (Faz 3/Dilim 1) — Kapak gorseli: coverUrl dolu → gercek <img> (object-cover);
  // yoksa deterministik yer tutucu (monogram). productImageSrc fallback'i DEGISMEZ.
  it("renders the real cover image when coverUrl is set", () => {
    const html = renderToStaticMarkup(
      <ProductCard
        product={summary(sales.online, amount, { coverUrl: "/media/stores/s1/products/cover.webp" })}
        t={tr}
      />,
    );
    expect(html).toContain('src="/media/stores/s1/products/cover.webp"');
    expect(html).toContain("object-cover");
  });

  it("falls back to the deterministic placeholder when coverUrl is null (regression gate)", () => {
    const html = renderToStaticMarkup(
      <ProductCard product={summary(sales.online, amount, { coverUrl: null })} t={tr} />,
    );
    // Gercek <img src> YOK; yer tutucu role="img" + aria-label (urun basligi).
    expect(html).not.toContain("<img");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Test Ürün"');
  });

  it("prefers the explicit imageUrl prop over product.coverUrl", () => {
    const html = renderToStaticMarkup(
      <ProductCard
        product={summary(sales.online, amount, { coverUrl: "/media/from-cover.webp" })}
        t={tr}
        imageUrl="/media/from-prop.webp"
      />,
    );
    expect(html).toContain('src="/media/from-prop.webp"');
    expect(html).not.toContain("/media/from-cover.webp");
  });
});
