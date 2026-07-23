import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import type { CustomerOrderSummary, ReviewEligibleOrderLine } from "@commerce-os/api-client";

import { OrdersSection } from "../components/account/sections/orders-section.js";

// Faz 3/Dilim 6b — Hesabım > Siparişlerim liste satırı thumbnail'i (ProductMedia;
// güncel kapak imageUrl'i gateway'den gelir, yoksa deterministik yer tutucu).
const t = getDictionary("tr").storefront.account;
const reviewsT = getDictionary("tr").storefront.reviews;

function order(lines: CustomerOrderSummary["lines"]): CustomerOrderSummary {
  return {
    orderNumber: "OS-1",
    status: "PLACED",
    paymentStatus: "PAID",
    fulfillmentStatus: "UNFULFILLED",
    currency: "TRY",
    totalMinor: 129900,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    lines,
    createdAt: "2026-07-01T10:00:00.000Z",
    shipmentStatus: null,
  };
}

function render(model: CustomerOrderSummary): string {
  return renderToStaticMarkup(
    <OrdersSection t={t} orders={[model]} locale="tr" tab="all" query="" reviewsT={reviewsT} />,
  );
}

describe("storefront-web · Dilim 6b orders-section thumbnail", () => {
  it("renders a real thumbnail <img> when the line has an imageUrl", () => {
    const html = render(
      order([
        {
          variantId: "var_1",
          productSlug: "hoodie",
          sku: "HD-M",
          title: "Hoodie",
          variantTitle: "M",
          quantity: 1,
          imageUrl: "/media/stores/s1/products/hoodie-cover.webp",
        },
      ]),
    );
    expect(html).toContain('src="/media/stores/s1/products/hoodie-cover.webp"');
    expect(html).toContain('alt="Hoodie"');
    expect(html).toContain("object-cover");
    // Gerçek görsel modunda ProductMedia placeholder (role="img") RENDER EDİLMEZ →
    // eski monogram yer tutucusu tamamen gitti (img yolu). (bg-slate-100 sayfanın
    // başka yerlerinde — buton/hover — meşru; DS göçü kapsam dışı, ona dokunulmadı.)
    expect(html).not.toContain('role="img"');
  });

  it("falls back to the deterministic placeholder when imageUrl is null", () => {
    const html = render(
      order([
        {
          variantId: "var_2",
          productSlug: "mug",
          sku: "MG-1",
          title: "Mug",
          variantTitle: "Std",
          quantity: 1,
          imageUrl: null,
        },
      ]),
    );
    // Gerçek görsel yok → ProductMedia placeholder (role=img + aria-label + monogram).
    expect(html).not.toContain("src=\"/media");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Mug"');
    // TODO-158C — Placeholder artık ham hex gradient DEĞİL, token'lı `bg-surface-muted` (tema-override edilebilir).
    expect(html).toContain("bg-surface-muted");
  });
});

// TODO-159E hotfix — "Ürün yorumu yaz" aksiyonu placeholder değil, gerçek akıştır.
describe("storefront-web · TODO-159E order review action", () => {
  function delivered(eligible: ReviewEligibleOrderLine[]): string {
    const model: CustomerOrderSummary = {
      ...order([
        { variantId: "v1", productSlug: "tablet", sku: "TB-1", title: "Tablet", variantTitle: "Yeşil", quantity: 1, imageUrl: null },
      ]),
      status: "FULFILLED",
      paymentStatus: "PAID",
      fulfillmentStatus: "FULFILLED",
    };
    return renderToStaticMarkup(
      <OrdersSection
        t={t}
        orders={[model]}
        locale="tr"
        tab="all"
        query=""
        reviewsT={reviewsT}
        eligible={eligible}
        reviews={[]}
      />,
    );
  }

  it("eski 'yakında aktif olacak' placeholder metni ARTIK render edilmez", () => {
    const html = delivered([]);
    expect(html).not.toContain("yakında aktif olacak");
  });

  it("yorumlanabilir kalem varsa gerçek 'Ürün yorumu yaz' butonu render edilir", () => {
    const html = delivered([
      {
        orderLineId: "ol-1",
        orderId: "ord-1",
        orderNumber: "OS-1",
        productId: "p-tablet",
        productTitle: "Tablet",
        productSlug: "tablet",
        productImageUrl: null,
        variantLabel: "Yeşil / 1 TB",
        purchasedAt: "2026-07-01T10:00:00.000Z",
      },
    ]);
    expect(html).toContain("Ürün yorumu yaz");
    expect(html).not.toContain("yakında aktif olacak");
  });
});
