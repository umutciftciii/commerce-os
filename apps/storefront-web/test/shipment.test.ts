import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import {
  SHIPMENT_STATUS_TONE,
  hasProviderLogo,
  isAwaitingPickupShipmentStatus,
  isCancelledShipmentStatus,
  isProblemShipmentStatus,
  providerInitials,
  shipmentStepIndex,
} from "../lib/shipment";

/**
 * TODO-117 — Müşteri-facing kargo takip saf yardımcı testleri. ADR-045 kuralları:
 * ORDER_CREATED hazırlık adımıdır (fiziksel teslim/"kargoya verildi" DEĞİL),
 * teslim yalnız DELIVERED'da tamamlanır; iptal/başarısız stepper dışıdır.
 */
describe("storefront · shipment tracking helpers", () => {
  it("maps statuses to a monotonic stepper index (prep → transit → delivery → delivered)", () => {
    // Hazırlık adımı: kayıt/etiket aşamaları tek adımda (0).
    expect(shipmentStepIndex("DRAFT")).toBe(0);
    expect(shipmentStepIndex("ORDER_CREATED")).toBe(0);
    expect(shipmentStepIndex("LABEL_PENDING")).toBe(0);
    expect(shipmentStepIndex("LABEL_CREATED")).toBe(0);
    expect(shipmentStepIndex("IN_TRANSIT")).toBe(1);
    expect(shipmentStepIndex("OUT_FOR_DELIVERY")).toBe(2);
    expect(shipmentStepIndex("DELIVERED")).toBe(3);
    // İptal/başarısız adım dışı (-1).
    expect(shipmentStepIndex("CANCELLED")).toBe(-1);
    expect(shipmentStepIndex("FAILED")).toBe(-1);
    expect(shipmentStepIndex("RETURNED")).toBe(-1);
  });

  it("does not treat ORDER_CREATED as delivered (ADR-045)", () => {
    expect(shipmentStepIndex("ORDER_CREATED")).toBeLessThan(shipmentStepIndex("DELIVERED"));
  });

  it("flags follow-up problem statuses and cancellation", () => {
    expect(isProblemShipmentStatus("DELIVERY_FAILED")).toBe(true);
    expect(isProblemShipmentStatus("RETURNED")).toBe(true);
    expect(isProblemShipmentStatus("FAILED")).toBe(true);
    expect(isProblemShipmentStatus("IN_TRANSIT")).toBe(false);
    expect(isProblemShipmentStatus("DELIVERED")).toBe(false);
    expect(isCancelledShipmentStatus("CANCELLED")).toBe(true);
    expect(isCancelledShipmentStatus("IN_TRANSIT")).toBe(false);
  });

  it("assigns a success tone only to DELIVERED and danger to hard failures", () => {
    expect(SHIPMENT_STATUS_TONE.DELIVERED).toBe("success");
    expect(SHIPMENT_STATUS_TONE.DELIVERY_FAILED).toBe("danger");
    expect(SHIPMENT_STATUS_TONE.FAILED).toBe("danger");
    expect(SHIPMENT_STATUS_TONE.ORDER_CREATED).not.toBe("success");
  });

  it("derives provider initials for the logo fallback", () => {
    expect(providerInitials("DHL eCommerce")).toBe("DE");
    expect(providerInitials("Geliver")).toBe("GE");
    expect(providerInitials("  ")).toBe("?");
  });

  // TODO-125 — Checkout/success kargo seçeneği kartı: logo varsa logo, yoksa initials.
  it("decides between provider logo and initials fallback", () => {
    expect(hasProviderLogo("https://cdn/dhl.png")).toBe(true);
    expect(hasProviderLogo("")).toBe(false);
    expect(hasProviderLogo("   ")).toBe(false);
    expect(hasProviderLogo(null)).toBe(false);
    expect(hasProviderLogo(undefined)).toBe(false);
  });

  // TODO-127 — Prepare başarısı (ORDER_CREATED) = "Gönderi oluşturuldu", kargonun alımı
  // bekleniyor; yolda/teslim DEĞİL. Bekleme bilgisi yalnız hazırlık aşamasında gösterilir.
  it("flags prepare/pre-handover statuses as awaiting carrier pickup only", () => {
    expect(isAwaitingPickupShipmentStatus("ORDER_CREATED")).toBe(true);
    expect(isAwaitingPickupShipmentStatus("LABEL_PENDING")).toBe(true);
    expect(isAwaitingPickupShipmentStatus("LABEL_CREATED")).toBe(true);
    expect(isAwaitingPickupShipmentStatus("IN_TRANSIT")).toBe(false);
    expect(isAwaitingPickupShipmentStatus("DELIVERED")).toBe(false);
    expect(isAwaitingPickupShipmentStatus("CANCELLED")).toBe(false);
  });

  it("uses customer-safe prepared copy (no shipped/delivered wording) in both locales", () => {
    const tr = getDictionary("tr").storefront.account.orders.detail.tracking;
    const en = getDictionary("en").storefront.account.orders.detail.tracking;
    expect(tr.statusValues.ORDER_CREATED).toBe("Gönderi oluşturuldu");
    expect(en.statusValues.ORDER_CREATED).toBe("Shipment created");
    expect(tr.preparedNote).toBe("Kargonun alımı bekleniyor.");
    expect(en.preparedNote).toBe("Waiting for carrier pickup.");
    // ORDER_CREATED müşteriye "kargoya verildi/teslim" gibi yanıltıcı ifade göstermez.
    expect(tr.statusValues.ORDER_CREATED).not.toMatch(/kargoya verildi|teslim/i);
  });
});
