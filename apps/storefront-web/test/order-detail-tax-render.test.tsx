import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import type { CustomerOrderDetail } from "@commerce-os/api-client";
import { OrderSummary } from "../app/account/orders/[orderNumber]/page.js";

// Final Polish — inclusive-VAT sipariş özetinde yanıltıcı "KDV dahil ₺0,00"
// gösterilmemeli. taxMinor=0 (KDV fiyata gömülü) → kullanıcı-dostu not; taxMinor>0
// (ayrı/efektif KDV) → gerçek tutar. Server-authoritative order.taxMinor okunur.
function order(overrides: Partial<CustomerOrderDetail> = {}): CustomerOrderDetail {
  return {
    subtotalMinor: 90000,
    discountMinor: 0,
    shippingMinor: 4990,
    taxMinor: 0,
    totalMinor: 94990,
    currency: "TRY",
    ...overrides,
  } as CustomerOrderDetail;
}

describe("OrderSummary KDV gösterimi", () => {
  it("inclusive-VAT (taxMinor=0) → yanıltıcı ₺0,00 yerine 'Fiyatlara KDV dahildir'", () => {
    const o = getDictionary("tr").storefront.account.orders;
    const html = renderToStaticMarkup(<OrderSummary o={o} order={order({ taxMinor: 0 })} />);
    expect(html).toContain("Fiyatlara KDV dahildir");
    expect(html).not.toContain("₺0,00");
  });

  it("gerçek taxMinor>0 → doğru KDV tutarı gösterilir (not gösterilmez)", () => {
    const o = getDictionary("tr").storefront.account.orders;
    const html = renderToStaticMarkup(<OrderSummary o={o} order={order({ taxMinor: 15000 })} />);
    expect(html).toContain("₺150,00");
    expect(html).not.toContain("Fiyatlara KDV dahildir");
  });

  it("EN inclusive-VAT → 'Prices include VAT'", () => {
    const o = getDictionary("en").storefront.account.orders;
    const html = renderToStaticMarkup(<OrderSummary o={o} order={order({ taxMinor: 0 })} />);
    expect(html).toContain("Prices include VAT");
    expect(html).not.toContain("₺0,00");
  });
});
