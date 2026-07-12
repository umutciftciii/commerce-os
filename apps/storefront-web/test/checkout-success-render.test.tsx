import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";

import { CheckoutSuccess } from "../components/checkout-success.js";
import type { OrderConfirmationView } from "../lib/server/cart.js";

const t = getDictionary("tr").storefront.checkout;

// ADR-065 (Faz 3/Dilim 6a) — Success ekrani onay satiri thumbnail'i (cookie yoluyla
// gelen imageUrl). handle=title (confirmation'da productSlug yok — bilincli pragmatik).
function confirmation(lineOverrides: Partial<OrderConfirmationView["lines"][number]> = {}): OrderConfirmationView {
  return {
    orderNumber: "CO-1001",
    paymentPending: false,
    subtotalLabel: "₺1.299,00",
    shippingLabel: "₺49,90",
    shippingIsFree: false,
    discountLabel: null,
    taxIncludedLabel: "₺216,50",
    taxRatePercent: 20,
    totalLabel: "₺1.348,90",
    couponCode: null,
    couponStatus: "NONE",
    contactEmail: "ada@example.com",
    lines: [
      {
        title: "Demo Hoodie",
        variantTitle: "Black / M",
        quantity: 1,
        unitPriceLabel: "₺1.299,00",
        lineTotalLabel: "₺1.299,00",
        imageUrl: null,
        ...lineOverrides,
      },
    ],
    shippingAddress: null,
    billing: null,
    shippingOption: null,
  };
}

function render(model: OrderConfirmationView): string {
  return renderToStaticMarkup(<CheckoutSuccess confirmation={model} t={t} />);
}

describe("storefront-web · Dilim 6a checkout-success thumbnail", () => {
  it("renders a real thumbnail <img> when the confirmation line has an imageUrl", () => {
    const html = render(confirmation({ imageUrl: "/media/stores/store_demo/products/cover.webp" }));
    expect(html).toContain('src="/media/stores/store_demo/products/cover.webp"');
    expect(html).toContain('alt="Demo Hoodie"');
    // Onay verisi (satir/tutar) korunur.
    expect(html).toContain("Demo Hoodie");
    expect(html).toContain("₺1.299,00");
  });

  it("falls back to the deterministic placeholder when imageUrl is null", () => {
    const html = render(confirmation({ imageUrl: null }));
    expect(html).not.toContain('src="/media');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Demo Hoodie"');
  });
});
