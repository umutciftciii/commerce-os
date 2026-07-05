import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import { ProductCard } from "../components/product-card";
import { deriveProductCommerceView } from "../lib/sales-model";
import type { StorefrontPrice, StorefrontProductSummary } from "../lib/catalog-types";

const tr = getDictionary("tr").storefront;
const en = getDictionary("en").storefront;

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
    price,
    commerce: deriveProductCommerceView(salesOverrides),
    badgeKind: price.compareAtLabel ? "discount" : null,
    campaign: null,
    ...extra,
  };
}

const sales = {
  online: { salesMode: "ONLINE", priceVisibility: "VISIBLE", primaryAction: "ADD_TO_CART", purchasable: true, whatsappEnabled: false, inquiryEnabled: false, appointmentRequired: false, minOrderQuantity: 1, maxOrderQuantity: null },
  inquiry: { salesMode: "INQUIRY", priceVisibility: "ON_REQUEST", primaryAction: "REQUEST_PRICE", purchasable: false, whatsappEnabled: false, inquiryEnabled: true, appointmentRequired: false, minOrderQuantity: 1, maxOrderQuantity: null },
  appointment: { salesMode: "APPOINTMENT", priceVisibility: "HIDDEN", primaryAction: "BOOK_APPOINTMENT", purchasable: false, whatsappEnabled: false, inquiryEnabled: false, appointmentRequired: true, minOrderQuantity: 1, maxOrderQuantity: null },
  whatsapp: { salesMode: "WHATSAPP", priceVisibility: "ON_REQUEST", primaryAction: "WHATSAPP", purchasable: false, whatsappEnabled: true, inquiryEnabled: false, appointmentRequired: false, minOrderQuantity: 1, maxOrderQuantity: null },
  catalog: { salesMode: "CATALOG_ONLY", priceVisibility: "HIDDEN", primaryAction: "CONTACT_FORM", purchasable: false, whatsappEnabled: false, inquiryEnabled: false, appointmentRequired: false, minOrderQuantity: 1, maxOrderQuantity: null },
} as const;

const amount: StorefrontPrice = { mode: "amount", amountLabel: "₺1.299,00", compareAtLabel: "₺1.499,00" };
const onRequest: StorefrontPrice = { mode: "onRequest", amountLabel: null, compareAtLabel: null };
const hidden: StorefrontPrice = { mode: "hidden", amountLabel: null, compareAtLabel: null };

describe("ProductCard · sales-mode CTA", () => {
  it("ONLINE shows add-to-cart and the price with compare-at", () => {
    const html = renderToStaticMarkup(<ProductCard product={summary(sales.online, amount)} t={tr} />);
    expect(html).toContain("Sepete ekle");
    expect(html).toContain("₺1.299,00");
    expect(html).toContain("₺1.499,00");
    expect(html).toContain("line-through");
    expect(html).toContain(tr.badges.discount);
  });

  it("INQUIRY shows request-price and the on-request message instead of a number", () => {
    const html = renderToStaticMarkup(<ProductCard product={summary(sales.inquiry, onRequest)} t={tr} />);
    expect(html).toContain("Fiyat sor");
    expect(html).toContain(tr.price.onRequest);
    expect(html).not.toContain("₺");
  });

  it("APPOINTMENT shows book-appointment and hides price", () => {
    const html = renderToStaticMarkup(<ProductCard product={summary(sales.appointment, hidden)} t={tr} />);
    expect(html).toContain("Randevu al");
    expect(html).toContain(tr.price.hidden);
  });

  it("WHATSAPP shows whatsapp CTA", () => {
    const html = renderToStaticMarkup(<ProductCard product={summary(sales.whatsapp, onRequest)} t={tr} />);
    expect(html).toContain("WhatsApp ile sor");
  });

  it("CATALOG_ONLY shows the info CTA, never add-to-cart", () => {
    const html = renderToStaticMarkup(<ProductCard product={summary(sales.catalog, hidden)} t={tr} />);
    expect(html).toContain("Bilgi al");
    expect(html).not.toContain("Sepete ekle");
  });

  it("renders English copy with the en dictionary", () => {
    const html = renderToStaticMarkup(<ProductCard product={summary(sales.online, amount)} t={en} />);
    expect(html).toContain("Add to cart");
    expect(html).not.toContain("Sepete ekle");
  });
});

// F4A.1 — Kampanya rozeti: kampanya varsa oncelikli gosterilir; compareAt
// indirim rozetinin yerini alir. Metin sunucu projeksiyonundan turetilmis
// hazir badgeText'tir (istemci hesap yapmaz).
describe("ProductCard · campaign badge (F4A.1/F4A.3)", () => {
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
  };

  it("automatic discount shows 'Sepette' badge, not 'Kuponlu ürün'", () => {
    const html = renderToStaticMarkup(
      <ProductCard product={summary(sales.online, amount, { campaign, badgeKind: null })} t={tr} />,
    );
    expect(html).toContain("Sepette %10 indirim");
    expect(html).not.toContain("Kuponlu ürün");
  });

  it("campaign badge takes precedence over the compare-at discount badge", () => {
    const html = renderToStaticMarkup(
      <ProductCard product={summary(sales.online, amount, { campaign })} t={tr} />,
    );
    expect(html).toContain("Sepette %10 indirim");
    expect(html).not.toContain(`>${tr.badges.discount}<`);
  });

  it("public coupon campaign shows the coupon badge text", () => {
    const html = renderToStaticMarkup(
      <ProductCard
        product={summary(sales.online, amount, {
          campaign: {
            ...campaign,
            displayKind: "PUBLIC_COUPON" as const,
            badgeText: "Kuponlu ürün",
            requiresCoupon: true,
            couponCode: "TEST250",
            couponAction: "CLAIM" as const,
          },
        })}
        t={tr}
      />,
    );
    expect(html).toContain("Kuponlu ürün");
  });
});
