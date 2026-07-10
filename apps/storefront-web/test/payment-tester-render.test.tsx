import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import type { PublicPaymentState } from "@commerce-os/api-client";

/**
 * Test ödeme ekranı (F3B.2) — DS göçü öncesi GÜVENLIK AĞI smoke render testi.
 * EN KRİTİK davranış: MOCK-first faz kararının GUARD'ı — yalnız `provider === "MOCK"`
 * iken kart formu/ödeme butonu render edilir; gerçek sağlayıcı (IYZICO/STRIPE/PAYTR)
 * seçiliyse form GİZLENİR ve "test çalıştırılamıyor" bilgisi + mağazaya dönüş gösterilir.
 * Görsel/DS refactor'u bu koşullu render'ı sessizce bozarsa bu test kırmızı olur.
 */
vi.mock("../lib/server/cart-actions", () => ({
  submitTestPaymentAction: vi.fn(),
}));

import { PaymentTester } from "../components/payment-tester.js";

const t = getDictionary("tr").storefront.payment;
const c = getDictionary("tr").storefront.checkout;

function state(overrides: Partial<PublicPaymentState> = {}): PublicPaymentState {
  return {
    orderNumber: "ORD-1001",
    paymentStatus: "UNPAID",
    currency: "TRY",
    totalMinor: 134890,
    subtotalMinor: 129900,
    shippingMinor: 4990,
    discountMinor: 0,
    taxIncludedMinor: 21650,
    contactEmail: "musteri@example.com",
    provider: "MOCK",
    mode: "TEST",
    method: "CARD",
    threeDsMode: "OPTIONAL",
    installmentEnabled: false,
    installmentOptions: [1],
    attempt: { id: "att-1", status: "PENDING", threeDsApplied: false },
    scenarios: ["success", "failure"],
    lines: [
      {
        title: "Demo Hoodie",
        variantTitle: "Black / M",
        quantity: 1,
        unitPriceMinor: 129900,
        lineTotalMinor: 129900,
        currency: "TRY",
      },
    ],
    shippingAddress: null,
    billing: null,
    ...overrides,
  } as PublicPaymentState;
}

function render(model: PublicPaymentState): string {
  return renderToStaticMarkup(
    <PaymentTester state={model} orderId="order-1" token="tok-1" t={t} c={c} />,
  );
}

describe("storefront-web · payment tester smoke render (MOCK guard)", () => {
  it("MOCK provider → renders the card form and the pay button", () => {
    const html = render(state());
    expect(html).toContain(t.cardSectionTitle); // "Kart bilgileri"
    expect(html).toContain(t.cardHolderLabel); // "Kart üzerindeki ad"
    expect(html).toContain(t.pay); // "Ödemeyi tamamla"
    expect(html).toContain(t.testCardsTitle); // test kartları paneli
  });

  it("non-MOCK provider (IYZICO) → HIDES the form and shows the not-configured notice", () => {
    const html = render(state({ provider: "IYZICO" }));
    expect(html).toContain(t.providerNotConfiguredTitle); // "Test ödeme çalıştırılamıyor"
    expect(html).toContain(t.backToStore); // "Mağazaya dön"
    // Guard: kart formu ve ödeme butonu GÖRÜNMEZ (boşuna submit engellenir).
    expect(html).not.toContain(t.cardSectionTitle);
    expect(html).not.toContain(t.pay);
  });

  it("already PAID state → renders the success screen instead of the form", () => {
    const html = render(state({ paymentStatus: "PAID" }));
    expect(html).toContain(c.success.paidTitle);
    expect(html).not.toContain(t.cardSectionTitle);
  });
});
