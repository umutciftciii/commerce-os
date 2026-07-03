import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import type { OrderSummaryShipmentStatus } from "@commerce-os/api-client";
import { OrderStatusBadges } from "../components/account/order-badges";

/**
 * TODO-135 — Hesabım > Siparişlerim listesi karşılama rozeti. Kargo kaydı VARSA
 * (ORDER_CREATED) rozet "Gönderi oluşturuldu" gösterir; "Henüz kargoya verilmedi"
 * GÖSTERMEZ. ADR-045: hazırlık aşaması fiziksel teslim/"kargoya verildi" değildir.
 */
const o = getDictionary("tr").storefront.account.orders;

function markup(shipmentStatus: OrderSummaryShipmentStatus | null) {
  return renderToStaticMarkup(
    <OrderStatusBadges
      t={o}
      status={shipmentStatus === "DELIVERED" ? "FULFILLED" : "CONFIRMED"}
      paymentStatus="PAID"
      fulfillmentStatus={shipmentStatus === "DELIVERED" ? "FULFILLED" : "UNFULFILLED"}
      shipmentStatus={shipmentStatus}
    />,
  );
}

describe("storefront · account orders — fulfillment badge (TODO-135)", () => {
  it("renders a prepared shipment (ORDER_CREATED) as 'Gönderi oluşturuldu', not 'Henüz kargoya verilmedi'", () => {
    const html = markup("ORDER_CREATED");
    expect(html).toContain("Gönderi oluşturuldu");
    expect(html).not.toContain("Henüz kargoya verilmedi");
  });

  it("renders 'Henüz kargoya verilmedi' when there is no shipment", () => {
    const html = markup(null);
    expect(html).toContain("Henüz kargoya verilmedi");
    expect(html).not.toContain("Gönderi oluşturuldu");
  });

  it("keeps IN_TRANSIT/DELIVERED provider-proven states unchanged", () => {
    expect(markup("IN_TRANSIT")).toContain("Yolda");
    expect(markup("DELIVERED")).toContain("Teslim edildi");
  });
});
