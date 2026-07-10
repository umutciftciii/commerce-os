import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getDictionary } from "@commerce-os/i18n";

/**
 * Checkout formu (F3B.1) — DS göçü öncesi GÜVENLIK AĞI smoke render testi.
 * Amaç: görsel/DS refactor'u sırasında ticaret akışının iskeletinin (submit,
 * fatura "farklı" toggle'ı, kargo seçim radyo grubu) sessizce kaybolmadığını
 * yakalamak. Server Action'lar bağlıdır; render'da ağ/cookie yok — mock'lanır.
 * Not: renderToStaticMarkup STATIK'tir; toggle/seçim ETKİLEŞIMI değil, doğru
 * varsayılan iskeletin BASILDIĞI doğrulanır (kapsam bilinçli; bkz. TODO.md).
 */
vi.mock("../lib/server/cart-actions", () => ({
  submitCheckoutAction: vi.fn(),
  selectShippingOptionAction: vi.fn(),
}));

import { CheckoutForm } from "../components/checkout-form.js";
import type { CartView, ShippingOptionView } from "../lib/server/cart.js";

const t = getDictionary("tr").storefront.checkout;

function shippingOption(overrides: Partial<ShippingOptionView> = {}): ShippingOptionView {
  return {
    optionId: "opt-standard",
    providerName: "MNG Kargo",
    serviceName: "Standart Teslimat",
    priceLabel: "₺49,90",
    priceMinor: 4990,
    freeShipping: false,
    estimatedDelivery: "1–3 iş günü",
    logoUrl: null,
    logoAlt: null,
    available: true,
    ...overrides,
  };
}

function view(overrides: Partial<CartView> = {}): CartView {
  return {
    currency: "TRY",
    itemCount: 1,
    checkoutReady: true,
    isEmpty: false,
    subtotalLabel: "₺1.299,00",
    shippingOptions: [shippingOption()],
    selectedShippingOptionId: "opt-standard",
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
      availableCoupons: [],
    },
    ...overrides,
  };
}

function render(model: CartView, extra: Partial<Parameters<typeof CheckoutForm>[0]> = {}): string {
  return renderToStaticMarkup(<CheckoutForm view={model} t={t} {...extra} />);
}

describe("storefront-web · checkout form smoke render", () => {
  it("renders the form skeleton without throwing (contact + address + submit)", () => {
    const html = render(view());
    expect(html).toContain(t.contactTitle); // "İletişim bilgileri"
    expect(html).toContain(t.addressTitle); // "Teslimat adresi"
    // Sunucu-otoriter akış: kargo OK iken submit "Siparişi oluştur" basar.
    expect(html).toContain(t.submit);
  });

  it("shows the payment MOCK badge (mock-first faz kararı) by default", () => {
    const html = render(view());
    expect(html).toContain(t.paymentMock); // "Demo"
    expect(html).not.toContain(t.paymentTestBadge);
  });

  it("switches submit copy to 'Ödeme adımına ilerle' when a test provider is active", () => {
    const html = render(view(), { paymentTestEnabled: true });
    expect(html).toContain(t.submitContinue);
    expect(html).toContain(t.paymentTestBadge);
  });

  it("renders the billing 'fatura farklı' toggle CLOSED by default (no TCKN field)", () => {
    const html = render(view());
    expect(html).toContain(t.billing.differentToggle); // "Fatura bilgilerim farklı"
    // Kapalı varsayilan: aciklama notu gorunur, TCKN alani DEGIL.
    expect(html).toContain(t.billing.defaultNote);
    expect(html).not.toContain(t.billing.tcknLabel);
    // billingDifferent hidden input "false" ile baslar (server bunu okur).
    expect(html).toContain('name="billingDifferent"');
    expect(html).toContain('value="false"');
  });

  it("renders a selectable shipping radiogroup when options are available", () => {
    const html = render(view());
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain("MNG Kargo");
    expect(html).toContain('type="radio"');
    // Sunucu-otoriter seçim: seçili optionId hidden input olarak yayılır.
    expect(html).toContain('name="shippingOptionId"');
    expect(html).toContain('value="opt-standard"');
  });

  it("shows the 'no shipping option' notice instead of a radiogroup when none are available", () => {
    const html = render(view({ shippingOptions: [], selectedShippingOptionId: null }));
    expect(html).toContain(t.shippingOptions.noneTitle);
    expect(html).not.toContain('role="radiogroup"');
  });
});
