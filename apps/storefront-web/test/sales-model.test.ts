import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import { deriveProductCommerceView, derivePriceMode, type SalesModelInput } from "../lib/sales-model";
import { ctaLabel, primaryPriceText, showsNumericPrice } from "../lib/labels";
import type { StorefrontPrice } from "../lib/catalog-types";

const tr = getDictionary("tr").storefront;
const en = getDictionary("en").storefront;

function input(overrides: Partial<SalesModelInput>): SalesModelInput {
  return {
    salesMode: "ONLINE",
    priceVisibility: "VISIBLE",
    primaryAction: "ADD_TO_CART",
    purchasable: true,
    whatsappEnabled: false,
    inquiryEnabled: false,
    appointmentRequired: false,
    minOrderQuantity: 1,
    maxOrderQuantity: null,
    ...overrides,
  };
}

describe("sales-model · CTA mapping (F3A)", () => {
  it("ONLINE + purchasable -> add to cart + buy now, quantity, price visible", () => {
    const v = deriveProductCommerceView(input({ salesMode: "ONLINE" }));
    expect(v.primaryCta).toBe("ADD_TO_CART");
    expect(v.secondaryCta).toBe("BUY_NOW");
    expect(v.showQuantity).toBe(true);
    expect(v.purchasable).toBe(true);
    expect(v.primaryCtaDisabled).toBe(false);
    expect(v.priceMode).toBe("amount");
  });

  it("INQUIRY -> request price, no purchase/quantity, inquiry copy", () => {
    const v = deriveProductCommerceView(
      input({ salesMode: "INQUIRY", priceVisibility: "ON_REQUEST", primaryAction: "REQUEST_PRICE", purchasable: false, inquiryEnabled: true }),
    );
    expect(v.primaryCta).toBe("REQUEST_PRICE");
    expect(v.secondaryCta).toBeNull();
    expect(v.showQuantity).toBe(false);
    expect(v.purchasable).toBe(false);
    expect(v.showInquiry).toBe(true);
    expect(v.priceMode).toBe("onRequest");
  });

  it("APPOINTMENT -> book appointment, appointment note", () => {
    const v = deriveProductCommerceView(
      input({ salesMode: "APPOINTMENT", priceVisibility: "HIDDEN", primaryAction: "BOOK_APPOINTMENT", purchasable: false }),
    );
    expect(v.primaryCta).toBe("BOOK_APPOINTMENT");
    expect(v.showAppointmentNote).toBe(true);
    expect(v.showQuantity).toBe(false);
  });

  it("WHATSAPP -> contact whatsapp, template when enabled", () => {
    const v = deriveProductCommerceView(
      input({ salesMode: "WHATSAPP", priceVisibility: "ON_REQUEST", primaryAction: "WHATSAPP", purchasable: false, whatsappEnabled: true }),
    );
    expect(v.primaryCta).toBe("CONTACT_WHATSAPP");
    expect(v.showWhatsappTemplate).toBe(true);
    expect(v.purchasable).toBe(false);
  });

  it("CATALOG_ONLY -> request info; NONE primaryAction disables CTA, never purchasable", () => {
    const contact = deriveProductCommerceView(
      input({ salesMode: "CATALOG_ONLY", priceVisibility: "HIDDEN", primaryAction: "CONTACT_FORM", purchasable: false }),
    );
    expect(contact.primaryCta).toBe("REQUEST_INFO");
    expect(contact.primaryCtaDisabled).toBe(false);
    expect(contact.purchasable).toBe(false);

    const none = deriveProductCommerceView(
      input({ salesMode: "CATALOG_ONLY", priceVisibility: "HIDDEN", primaryAction: "NONE", purchasable: false }),
    );
    expect(none.primaryCtaDisabled).toBe(true);
    expect(none.showQuantity).toBe(false);
  });

  it("ONLINE but not purchasable -> add-to-cart disabled, no quantity, no buy now", () => {
    const v = deriveProductCommerceView(input({ salesMode: "ONLINE", purchasable: false }));
    expect(v.primaryCta).toBe("ADD_TO_CART");
    expect(v.primaryCtaDisabled).toBe(true);
    expect(v.showQuantity).toBe(false);
    expect(v.secondaryCta).toBeNull();
  });
});

describe("sales-model · price visibility", () => {
  it("maps every visibility value", () => {
    expect(derivePriceMode("VISIBLE")).toBe("amount");
    expect(derivePriceMode("STARTING_FROM")).toBe("startingFrom");
    expect(derivePriceMode("ON_REQUEST")).toBe("onRequest");
    expect(derivePriceMode("HIDDEN")).toBe("hidden");
  });
});

describe("labels · localized CTA + price text", () => {
  it("resolves CTA labels from the TR/EN dictionaries", () => {
    expect(ctaLabel("ADD_TO_CART", tr)).toBe("Sepete ekle");
    expect(ctaLabel("REQUEST_PRICE", tr)).toBe("Fiyat sor");
    expect(ctaLabel("BOOK_APPOINTMENT", tr)).toBe("Randevu al");
    expect(ctaLabel("CONTACT_WHATSAPP", tr)).toBe("WhatsApp ile sor");
    expect(ctaLabel("REQUEST_INFO", tr)).toBe("Bilgi al");
    expect(ctaLabel("ADD_TO_CART", en)).toBe("Add to cart");
  });

  it("hides the numeric price for hidden/on-request modes", () => {
    const hidden: StorefrontPrice = { mode: "hidden", amountLabel: null, compareAtLabel: null };
    const onRequest: StorefrontPrice = { mode: "onRequest", amountLabel: null, compareAtLabel: null };
    const amount: StorefrontPrice = { mode: "amount", amountLabel: "₺1.299,00", compareAtLabel: null };
    const from: StorefrontPrice = { mode: "startingFrom", amountLabel: "₺399,00", compareAtLabel: null };

    expect(showsNumericPrice(hidden)).toBe(false);
    expect(showsNumericPrice(onRequest)).toBe(false);
    expect(showsNumericPrice(amount)).toBe(true);

    expect(primaryPriceText(onRequest, tr)).toBe(tr.price.onRequest);
    expect(primaryPriceText(hidden, tr)).toBe(tr.price.hidden);
    expect(primaryPriceText(amount, tr)).toBe("₺1.299,00");
    expect(primaryPriceText(from, tr)).toContain("₺399,00");
    // gizli/talep modunda numerik tutar metni gecmemeli
    expect(primaryPriceText(hidden, tr)).not.toMatch(/\d/);
  });
});
