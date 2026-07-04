import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import type { CustomerOrderShipment } from "@commerce-os/api-client";
import { ShipmentTracking } from "../components/account/shipment-tracking";

/**
 * Kargo takip kartı UI cilası (Shipping UI polish). Hareket tarihleri Türkçe
 * vitrinde 24 saat `dd.MM.yyyy HH:mm` biçiminde gösterilir (AM/PM ve saniye YOK);
 * durum yardımcı metni source-of-truth Shipment.status'tan türer. ADR-045 korunur:
 * IN_TRANSIT "Yolda" gösterir ve "Kargonun alımı bekleniyor." ipucu göstermez.
 */
const t = getDictionary("tr").storefront.account.orders.detail.tracking;

function baseShipment(
  overrides: Partial<CustomerOrderShipment> = {},
): CustomerOrderShipment {
  return {
    providerName: "DHL eCommerce",
    logoUrl: null,
    logoAlt: null,
    status: "IN_TRANSIT",
    trackingNumber: "TRK-123",
    trackingUrl: null,
    lastLocation: null,
    updatedAt: "2026-07-04T15:00:00.000Z",
    events: [],
    ...overrides,
  };
}

function markup(shipment: CustomerOrderShipment): string {
  return renderToStaticMarkup(
    <ShipmentTracking shipment={shipment} t={t} locale="tr" />,
  );
}

describe("storefront · shipment tracking kartı (UI cilası)", () => {
  it("hareket tarihini Türkçe 24 saat dd.MM.yyyy HH:mm biçiminde render eder", () => {
    const html = markup(
      baseShipment({
        events: [
          { eventType: "STATUS_CHANGED", statusText: "SMOKE AKTARMADA", location: null, occurredAt: "2026-07-04T15:00:00.000Z" },
        ],
      }),
    );
    // dd.MM.yyyy HH:mm — saniyesiz, noktalı tarih.
    expect(html).toMatch(/\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}/);
    // Saniye içermez (…:mm:ss deseni olmamalı).
    expect(html).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it("tarih gösteriminde AM/PM kullanmaz", () => {
    const html = markup(
      baseShipment({
        events: [
          { eventType: "STATUS_CHANGED", statusText: "SMOKE AKTARMADA", location: null, occurredAt: "2026-07-04T04:19:51.000Z" },
        ],
      }),
    );
    expect(html).not.toMatch(/\bAM\b|\bPM\b/);
  });

  it("IN_TRANSIT durumunu 'Yolda' rozetiyle gösterir", () => {
    const html = markup(baseShipment({ status: "IN_TRANSIT" }));
    expect(html).toContain("Yolda");
  });

  it("IN_TRANSIT yardımcı metni 'Kargonun alımı bekleniyor.' demez (ADR-045)", () => {
    const html = markup(baseShipment({ status: "IN_TRANSIT" }));
    expect(html).not.toContain("Kargonun alımı bekleniyor");
    // Pozitif, tutarlı yardımcı metin gösterilir.
    expect(html).toContain("Kargonuz taşıma sürecinde.");
  });

  it("konumu olan hareketi temiz biçimde (İşlem noktası etiketiyle) render eder", () => {
    const html = markup(
      baseShipment({
        events: [
          { eventType: "STATUS_CHANGED", statusText: "SMOKE TRANSFER MERKEZİNDE", location: "İstanbul Aktarma", occurredAt: "2026-07-04T15:00:00.000Z" },
        ],
      }),
    );
    expect(html).toContain("İşlem noktası");
    expect(html).toContain("İstanbul Aktarma");
  });

  it("konumu olmayan hareket bozuk ayraç/etiket göstermez", () => {
    const html = markup(
      baseShipment({
        events: [
          { eventType: "STATUS_CHANGED", statusText: "SMOKE AKTARMADA", location: null, occurredAt: "2026-07-04T15:00:00.000Z" },
        ],
      }),
    );
    // Konum yoksa "İşlem noktası:" etiketi hiç render edilmez (boş ayraç kalmaz).
    expect(html).not.toContain("İşlem noktası:");
  });

  it("ham sağlayıcı payload'ı / secret sızdırmaz (DTO allowlist güvenli)", () => {
    const html = markup(
      baseShipment({
        events: [
          { eventType: "WEBHOOK_RECEIVED", statusText: "SMOKE AKTARMADA", location: null, occurredAt: "2026-07-04T15:00:00.000Z" },
        ],
      }),
    );
    // Güvenli hareket metni görünür; ham JSON/imza/token görünmez.
    expect(html).toContain("SMOKE AKTARMADA");
    expect(html).not.toMatch(/signature|token|"payload"|secret/i);
  });
});
