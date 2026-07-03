import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import type { OrderSummaryShipmentStatus } from "@commerce-os/api-client";
import { OrderStatusBadges } from "../components/account/order-badges";

/**
 * TODO-135/TODO-136 — Hesabım > Siparişlerim listesi karşılama rozeti. Kargo kaydı VARSA
 * (ORDER_CREATED) rozet "Kargonun Alınması Bekleniyor" gösterir; LABEL_CREATED → "Kargo İçin
 * Paketlendi". Kargo kaydı yoksa "Hazırlanıyor". ADR-045: hazırlık aşaması fiziksel
 * teslim/"kargoya verildi" değildir; eski yanıltıcı metinler gösterilmez.
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

describe("storefront · account orders — fulfillment badge (TODO-136)", () => {
  it("renders a prepared shipment (ORDER_CREATED) as 'Kargonun Alınması Bekleniyor', not old copy", () => {
    const html = markup("ORDER_CREATED");
    expect(html).toContain("Kargonun Alınması Bekleniyor");
    expect(html).not.toContain("Henüz kargoya verilmedi");
    expect(html).not.toContain("Gönderi oluşturuldu");
  });

  it("renders a label-ready shipment (LABEL_CREATED) as 'Kargo İçin Paketlendi'", () => {
    const html = markup("LABEL_CREATED");
    expect(html).toContain("Kargo İçin Paketlendi");
  });

  it("renders 'Hazırlanıyor' when there is no shipment", () => {
    const html = markup(null);
    expect(html).toContain("Hazırlanıyor");
    expect(html).not.toContain("Kargonun Alınması Bekleniyor");
  });

  it("keeps IN_TRANSIT/DELIVERED provider-proven states unchanged", () => {
    expect(markup("IN_TRANSIT")).toContain("Yolda");
    expect(markup("DELIVERED")).toContain("Teslim edildi");
  });
});
