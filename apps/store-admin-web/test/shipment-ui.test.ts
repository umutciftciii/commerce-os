import { describe, expect, it } from "vitest";
import {
  SHIPMENT_STATUS_DESC,
  SHIPMENT_STATUS_LABEL,
  isAwaitingPickupStatus,
  shipmentStepIndex,
} from "../lib/client/shipment-ui";

/**
 * TODO-127 — Store-admin kargo durum sözlüğü. createOrder/prepare başarısı = "Gönderi
 * oluşturuldu" (fiziksel teslim DEĞİL). ORDER_CREATED helper metni "Kargonun alımı
 * bekleniyor." olmalı; hiçbir prepare-başarısı durumu shipped/in-transit/delivered
 * göstermemeli (ADR-045/049).
 */
describe("store-admin · shipment status dictionary (TODO-127)", () => {
  // TODO-136 — ORDER_CREATED = kargo kaydı açıldı, kurye henüz almadı.
  it("labels ORDER_CREATED as 'Kargonun Alınması Bekleniyor' / 'Awaiting carrier pickup'", () => {
    expect(SHIPMENT_STATUS_LABEL.tr.ORDER_CREATED).toBe("Kargonun Alınması Bekleniyor");
    expect(SHIPMENT_STATUS_LABEL.en.ORDER_CREATED).toBe("Awaiting carrier pickup");
  });

  // TODO-136 — LABEL_CREATED = barkod/etiket hazır, paket teslim için hazır.
  it("labels LABEL_CREATED as 'Kargo İçin Paketlendi' / 'Packed for carrier'", () => {
    expect(SHIPMENT_STATUS_LABEL.tr.LABEL_CREATED).toBe("Kargo İçin Paketlendi");
    expect(SHIPMENT_STATUS_LABEL.en.LABEL_CREATED).toBe("Packed for carrier");
  });

  it("uses the awaiting-pickup helper copy for ORDER_CREATED", () => {
    expect(SHIPMENT_STATUS_DESC.tr.ORDER_CREATED).toContain("Kargonun alımı bekleniyor.");
    expect(SHIPMENT_STATUS_DESC.en.ORDER_CREATED).toContain("Waiting for carrier pickup.");
  });

  it("does not use shipped/in-transit/delivered wording for ORDER_CREATED", () => {
    expect(SHIPMENT_STATUS_LABEL.tr.ORDER_CREATED).not.toMatch(/kargoya verildi|yolda|teslim/i);
    expect(SHIPMENT_STATUS_DESC.tr.ORDER_CREATED).not.toMatch(/kargoya verildi|yolda|teslim edildi/i);
  });

  it("treats prepare/pre-handover states as awaiting pickup, but not transit/delivery", () => {
    expect(isAwaitingPickupStatus("ORDER_CREATED")).toBe(true);
    expect(isAwaitingPickupStatus("LABEL_PENDING")).toBe(true);
    expect(isAwaitingPickupStatus("LABEL_CREATED")).toBe(true);
    expect(isAwaitingPickupStatus("IN_TRANSIT")).toBe(false);
    expect(isAwaitingPickupStatus("OUT_FOR_DELIVERY")).toBe(false);
    expect(isAwaitingPickupStatus("DELIVERED")).toBe(false);
  });

  it("keeps ORDER_CREATED at the preparation step (below in-transit/delivered)", () => {
    expect(shipmentStepIndex("ORDER_CREATED")).toBe(0);
    expect(shipmentStepIndex("ORDER_CREATED")).toBeLessThan(shipmentStepIndex("IN_TRANSIT"));
    expect(shipmentStepIndex("ORDER_CREATED")).toBeLessThan(shipmentStepIndex("DELIVERED"));
  });
});
