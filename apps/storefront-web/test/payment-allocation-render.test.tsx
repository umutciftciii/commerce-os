import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import type { CustomerOrderDetail } from "@commerce-os/api-client";
import { PaymentBlock } from "../app/account/orders/[orderNumber]/page.js";

// BUG-CART-005 (Part 2) — Ödeme bilgisi kartı mixed-payment allocation'ı gösterir:
// tek "Yöntem" satırı yerine her başarılı ödeme kaynağı ayrı satır (mağaza bakiyesi + kart).
function order(overrides: Partial<CustomerOrderDetail> = {}): CustomerOrderDetail {
  return {
    currency: "TRY",
    totalMinor: 852064,
    payment: {
      provider: "IYZICO",
      method: "CARD",
      cardBrand: "VISA",
      cardLast4: "1234",
      installmentCount: 1,
      transactionId: null,
      threeDsApplied: false,
      paidAt: null,
    },
    paymentAllocations: [],
    ...overrides,
  } as CustomerOrderDetail;
}

describe("PaymentBlock ödeme dağılımı (BUG-CART-005)", () => {
  const o = getDictionary("tr").storefront.account.orders;

  it("mixed payment → mağaza bakiyesi + kart satırları ayrı tutarlarla", () => {
    const html = renderToStaticMarkup(
      <PaymentBlock
        o={o}
        locale="tr"
        order={order({
          paymentAllocations: [
            { sourceType: "STORE_CREDIT", amountMinor: 200000, currency: "TRY", cardBrand: null, cardLast4: null, provider: null, installmentCount: 1, paidAt: null },
            { sourceType: "CARD", amountMinor: 652064, currency: "TRY", cardBrand: "VISA", cardLast4: "1234", provider: "IYZICO", installmentCount: 1, paidAt: null },
          ],
        })}
      />,
    );
    expect(html).toContain("Mağaza bakiyesi");
    expect(html).toContain("₺2.000,00");
    expect(html).toContain("Kredi kartı •••• 1234");
    expect(html).toContain("₺6.520,64");
  });

  it("credit-only → yalnız mağaza bakiyesi satırı, tam tutar", () => {
    const html = renderToStaticMarkup(
      <PaymentBlock
        o={o}
        locale="tr"
        order={order({
          payment: { provider: null, method: "STORE_CREDIT", cardBrand: null, cardLast4: null, installmentCount: 1, transactionId: null, threeDsApplied: false, paidAt: null },
          paymentAllocations: [
            { sourceType: "STORE_CREDIT", amountMinor: 852064, currency: "TRY", cardBrand: null, cardLast4: null, provider: null, installmentCount: 1, paidAt: null },
          ],
        })}
      />,
    );
    expect(html).toContain("Mağaza bakiyesi");
    expect(html).toContain("₺8.520,64");
    expect(html).not.toContain("Kredi kartı");
  });

  it("card-only → yalnız kart satırı maskeli", () => {
    const html = renderToStaticMarkup(
      <PaymentBlock
        o={o}
        locale="tr"
        order={order({
          paymentAllocations: [
            { sourceType: "CARD", amountMinor: 852064, currency: "TRY", cardBrand: "VISA", cardLast4: "4242", provider: "IYZICO", installmentCount: 1, paidAt: null },
          ],
        })}
      />,
    );
    expect(html).toContain("Kredi kartı •••• 4242");
    expect(html).toContain("₺8.520,64");
    expect(html).not.toContain("Mağaza bakiyesi");
  });

  it("no payment / no allocations → 'ödeme kaydı bulunmuyor'", () => {
    const html = renderToStaticMarkup(
      <PaymentBlock o={o} locale="tr" order={order({ payment: null, paymentAllocations: [] })} />,
    );
    expect(html).toContain(o.detail.noPayment);
  });

  it("EN mixed payment → localized labels", () => {
    const en = getDictionary("en").storefront.account.orders;
    const html = renderToStaticMarkup(
      <PaymentBlock
        o={en}
        locale="en"
        order={order({
          paymentAllocations: [
            { sourceType: "STORE_CREDIT", amountMinor: 200000, currency: "TRY", cardBrand: null, cardLast4: null, provider: null, installmentCount: 1, paidAt: null },
            { sourceType: "CARD", amountMinor: 652064, currency: "TRY", cardBrand: "VISA", cardLast4: "1234", provider: "IYZICO", installmentCount: 1, paidAt: null },
          ],
        })}
      />,
    );
    expect(html).toContain("Store credit");
    expect(html).toContain("Credit card •••• 1234");
  });
});
