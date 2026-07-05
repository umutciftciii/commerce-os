import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getDictionary } from "@commerce-os/i18n";

// F4A — Kupon UI'i Server Action'lara bagli; render testinde ag/cookie yok.
vi.mock("../lib/server/cart-actions", () => ({
  applyCouponAction: vi.fn(),
  reconcileCartAction: vi.fn(),
  removeCartItemAction: vi.fn(),
  removeCouponAction: vi.fn(),
  updateCartItemAction: vi.fn(),
}));

import { CartView } from "../components/cart-view.js";
import type { CartView as CartViewModel } from "../lib/server/cart.js";

const t = getDictionary("tr").storefront.cart;

function view(summaryOverrides: Partial<CartViewModel["summary"]> = {}): CartViewModel {
  return {
    currency: "TRY",
    itemCount: 1,
    checkoutReady: true,
    isEmpty: false,
    subtotalLabel: "₺1.299,00",
    shippingOptions: [],
    selectedShippingOptionId: null,
    lines: [
      {
        variantId: "v1",
        productSlug: "demo-hoodie",
        title: "Demo Hoodie",
        variantTitle: "Black / M",
        sku: "SKU-1",
        quantity: 1,
        availableQuantity: 1,
        unitPriceLabel: "₺1.299,00",
        lineTotalLabel: "₺1.299,00",
        minQuantity: 1,
        maxQuantity: null,
        inStock: true,
        status: "OK",
      },
    ],
    summary: {
      subtotalLabel: "₺1.299,00",
      shippingLabel: "₺49,90",
      shippingIsFree: false,
      shippingStatus: "OK",
      freeShippingThresholdLabel: "₺750,00",
      discountLabel: null,
      taxIncludedLabel: "₺216,50",
      taxRatePercent: 20,
      grandTotalLabel: "₺1.348,90",
      couponCode: null,
      couponStatus: "NONE",
      couponReason: null,
      discountLines: [],
      ...summaryOverrides,
    },
  };
}

function render(model: CartViewModel): string {
  return renderToStaticMarkup(
    <CartView view={model} canonicalItems={[]} reconcileNeeded={false} t={t} />,
  );
}

describe("storefront-web · F4A coupon UI", () => {
  it("renders the coupon input and apply button when no coupon is applied", () => {
    const html = render(view());
    expect(html).toContain(t.couponPlaceholder);
    expect(html).toContain(t.couponApply);
  });

  it("shows the applied coupon with a server-authoritative discount line and remove button", () => {
    const html = render(
      view({
        couponCode: "KUPON10",
        couponStatus: "APPLIED",
        discountLabel: "₺129,90",
        discountLines: [{ label: "Kupon Kampanyası", code: "KUPON10", amountLabel: "₺129,90" }],
      }),
    );
    expect(html).toContain("KUPON10");
    expect(html).toContain(t.couponRemove);
    expect(html).toContain("−₺129,90");
  });

  it("shows a clear, reason-specific error for an invalid coupon", () => {
    const notApplicable = render(
      view({ couponCode: "YOK10", couponStatus: "INVALID", couponReason: "NOT_APPLICABLE" }),
    );
    expect(notApplicable).toContain(t.couponReasonNotApplicable);

    const minOrder = render(
      view({ couponCode: "MIN500", couponStatus: "INVALID", couponReason: "MIN_ORDER_NOT_MET" }),
    );
    expect(minOrder).toContain(t.couponReasonMinOrder);

    // NOT_FOUND genel kopyaya duser (kupon varligi detayi sizdirilmaz).
    const notFound = render(
      view({ couponCode: "BILINMEZ", couponStatus: "INVALID", couponReason: "NOT_FOUND" }),
    );
    expect(notFound).toContain("geçerli bir kod değil");
  });

  it("renders server totals (grand total) without any client-side recalculation", () => {
    const html = render(
      view({
        couponCode: "KUPON10",
        couponStatus: "APPLIED",
        discountLabel: "₺129,90",
        discountLines: [{ label: "Kupon Kampanyası", code: "KUPON10", amountLabel: "₺129,90" }],
        grandTotalLabel: "₺1.219,00",
      }),
    );
    expect(html).toContain("₺1.219,00");
  });
});
