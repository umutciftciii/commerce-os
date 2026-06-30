import { describe, expect, it } from "vitest";
import {
  SHIPMENT_STATUS_TONE,
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
});
