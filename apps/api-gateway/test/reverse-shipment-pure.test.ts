/**
 * TODO-173 (ADR-274) — Reverse shipment SAF birim testleri (DB YOK): manuel durum makinesi +
 * disposition/reverse serileştirme türetmeleri.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateReverseStatusChange,
  REVERSE_CONSUMING_STATUSES,
} from "../src/returns/reverse-shipment.js";
import { serializeReverseForItem } from "../src/returns/reverse-serialize.js";

describe("evaluateReverseStatusChange", () => {
  it("DRAFT → IN_TRANSIT ileri geçiş izinli", () => {
    expect(evaluateReverseStatusChange("DRAFT", "IN_TRANSIT")).toEqual({ ok: true });
  });
  it("IN_TRANSIT → DELIVERED izinli", () => {
    expect(evaluateReverseStatusChange("IN_TRANSIT", "DELIVERED")).toEqual({ ok: true });
  });
  it("CANCELLED her non-terminal durumdan izinli (quantity serbest)", () => {
    expect(evaluateReverseStatusChange("DRAFT", "CANCELLED")).toEqual({ ok: true });
    expect(evaluateReverseStatusChange("IN_TRANSIT", "CANCELLED")).toEqual({ ok: true });
  });
  it("DELIVERED terminal → değiştirilemez", () => {
    expect(evaluateReverseStatusChange("DELIVERED", "CANCELLED")).toEqual({
      ok: false,
      reason: "SHIPMENT_TERMINAL",
    });
  });
  it("regresyon reddedilir (DELIVERED hedefinden IN_TRANSIT değil ama IN_TRANSIT'ten DRAFT hedefi yok)", () => {
    // OUT_FOR_DELIVERY → IN_TRANSIT geri gidiş
    expect(evaluateReverseStatusChange("OUT_FOR_DELIVERY", "IN_TRANSIT")).toEqual({
      ok: false,
      reason: "STATUS_REGRESSION",
    });
  });
  it("aynı duruma geçiş NO_CHANGE", () => {
    expect(evaluateReverseStatusChange("IN_TRANSIT", "IN_TRANSIT")).toEqual({
      ok: false,
      reason: "NO_CHANGE",
    });
  });
  it("consuming statuses CANCELLED/FAILED içermez", () => {
    expect(REVERSE_CONSUMING_STATUSES).toContain("DRAFT");
    expect(REVERSE_CONSUMING_STATUSES).toContain("DELIVERED");
    expect(REVERSE_CONSUMING_STATUSES).not.toContain("CANCELLED");
    expect(REVERSE_CONSUMING_STATUSES).not.toContain("FAILED");
  });
});

const t0 = new Date("2026-08-07T10:00:00.000Z");
function disp(over: Partial<Parameters<typeof serializeReverseForItem>[0]["dispositions"][number]> = {}) {
  return {
    id: "d1",
    returnItemId: "ri1",
    type: "RETURN_TO_CUSTOMER" as const,
    quantity: 2,
    status: "PENDING" as const,
    reason: null,
    version: 0,
    createdAt: t0,
    updatedAt: t0,
    ...over,
  };
}
function ship(over: Partial<Parameters<typeof serializeReverseForItem>[0]["reverseShipments"][number]> = {}) {
  return {
    id: "s1",
    direction: "STORE_RETURN_TO_CUSTOMER" as const,
    returnRequestId: "rr1",
    returnItemId: "ri1",
    returnQuantity: 1,
    status: "IN_TRANSIT" as const,
    carrierName: "Yurtiçi",
    trackingNumber: "TRK1",
    trackingUrl: null,
    reverseShipmentReason: "internal reason",
    recipientName: "Müşteri",
    recipientCityName: "İstanbul",
    recipientDistrictName: "Kadıköy",
    recipientAddress: "Adres 1",
    estimatedDeliveryAt: null,
    deliveredAt: null,
    createdAt: t0,
    updatedAt: t0,
    ...over,
  };
}

describe("serializeReverseForItem", () => {
  it("undispositionedRejectedQuantity = rejected − Σ aktif disposition", () => {
    const r = serializeReverseForItem({
      rejectedQuantity: 3,
      dispositions: [disp({ quantity: 2 }), disp({ id: "d2", status: "CANCELLED", quantity: 1 })],
      reverseShipments: [],
    });
    // aktif = 2 (d2 cancelled sayılmaz) → 3 − 2 = 1
    expect(r.undispositionedRejectedQuantity).toBe(1);
  });

  it("reverseShipped greedy dağıtılır; remaining doğru", () => {
    const r = serializeReverseForItem({
      rejectedQuantity: 3,
      dispositions: [disp({ id: "d1", quantity: 2 }), disp({ id: "d2", quantity: 1 })],
      reverseShipments: [ship({ returnQuantity: 2, status: "DELIVERED" })],
    });
    const d1 = r.dispositions.find((d) => d.id === "d1")!;
    const d2 = r.dispositions.find((d) => d.id === "d2")!;
    // 2 sevk → önce d1 (2) dolar, d2 (0)
    expect(d1.reverseShippedQuantity).toBe(2);
    expect(d1.reverseShippableRemaining).toBe(0);
    expect(d2.reverseShippedQuantity).toBe(0);
    expect(d2.reverseShippableRemaining).toBe(1);
  });

  it("CANCELLED reverse shipment quantity tüketmez (remaining geri döner)", () => {
    const r = serializeReverseForItem({
      rejectedQuantity: 2,
      dispositions: [disp({ quantity: 2 })],
      reverseShipments: [ship({ returnQuantity: 2, status: "CANCELLED" })],
    });
    const d1 = r.dispositions[0];
    expect(d1.reverseShippedQuantity).toBe(0);
    expect(d1.reverseShippableRemaining).toBe(2);
  });

  it("non-RETURN_TO_CUSTOMER disposition reverse alanları 0", () => {
    const r = serializeReverseForItem({
      rejectedQuantity: 2,
      dispositions: [disp({ type: "DESTROY", quantity: 2 })],
      reverseShipments: [],
    });
    expect(r.dispositions[0].reverseShippedQuantity).toBe(0);
    expect(r.dispositions[0].reverseShippableRemaining).toBe(0);
  });
});
