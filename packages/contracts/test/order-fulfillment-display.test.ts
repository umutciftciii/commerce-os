import { describe, expect, it } from "vitest";
import {
  customerOrderSummarySchema,
  getOrderFulfillmentDisplay,
  isOrderPaidForShipment,
  orderSchema,
  pickOrderShipmentStatus,
} from "../src/index";

/**
 * TODO-135 — Sipariş listesi/başlık karşılama rozetinin, kargo (shipment) durumu
 * VARSA ondan türetilmesini doğrular. Kök kural (ADR-045): ORDER_CREATED = "Gönderi
 * oluşturuldu" (fiziksel "kargoya verildi" DEĞİL) → asla SHIPPED/IN_TRANSIT/DELIVERED
 * sayılmaz. Order.fulfillmentStatus MUTATE EDİLMEZ; bu yalnız gösterim eşlemesidir.
 */
describe("getOrderFulfillmentDisplay", () => {
  // TODO-136 — Hazırlık aşaması iki gösterim durumuna ayrıldı: ORDER_CREATED/LABEL_PENDING
  // → AWAITING_PICKUP ("Kargonun Alınması Bekleniyor"), LABEL_CREATED → PACKED ("Kargo İçin
  // Paketlendi"). Kargo kaydı yoksa NOT_SHIPPED ("Hazırlanıyor").
  it("maps ORDER_CREATED/LABEL_PENDING to AWAITING_PICKUP (not NOT_SHIPPED, not shipped)", () => {
    expect(getOrderFulfillmentDisplay("UNFULFILLED", "ORDER_CREATED")).toBe("AWAITING_PICKUP");
    expect(getOrderFulfillmentDisplay("UNFULFILLED", "LABEL_PENDING")).toBe("AWAITING_PICKUP");
  });

  it("maps a barcode/label-ready shipment (LABEL_CREATED) to PACKED", () => {
    expect(getOrderFulfillmentDisplay("UNFULFILLED", "LABEL_CREATED")).toBe("PACKED");
  });

  it("treats a DRAFT shipment (no provider record yet) as NOT_SHIPPED / order-level", () => {
    expect(getOrderFulfillmentDisplay("UNFULFILLED", "DRAFT")).toBe("NOT_SHIPPED");
  });

  it("falls back to NOT_SHIPPED when there is no shipment", () => {
    expect(getOrderFulfillmentDisplay("UNFULFILLED", null)).toBe("NOT_SHIPPED");
    expect(getOrderFulfillmentDisplay("UNFULFILLED", undefined)).toBe("NOT_SHIPPED");
  });

  it("keeps IN_TRANSIT/OUT_FOR_DELIVERY/DELIVERED derived from provider-proven states", () => {
    expect(getOrderFulfillmentDisplay("UNFULFILLED", "IN_TRANSIT")).toBe("IN_TRANSIT");
    expect(getOrderFulfillmentDisplay("UNFULFILLED", "OUT_FOR_DELIVERY")).toBe("OUT_FOR_DELIVERY");
    expect(getOrderFulfillmentDisplay("UNFULFILLED", "DELIVERED")).toBe("DELIVERED");
  });

  it("does NOT promote ORDER_CREATED to a shipped/transit/delivered state (ADR-045)", () => {
    const display = getOrderFulfillmentDisplay("UNFULFILLED", "ORDER_CREATED");
    expect(display).not.toBe("IN_TRANSIT");
    expect(display).not.toBe("OUT_FOR_DELIVERY");
    expect(display).not.toBe("DELIVERED");
  });

  it("prefers a cancelled ORDER over any shipment state", () => {
    expect(getOrderFulfillmentDisplay("CANCELLED", "DELIVERED")).toBe("CANCELLED");
    expect(getOrderFulfillmentDisplay("CANCELLED", "ORDER_CREATED")).toBe("CANCELLED");
  });

  it("falls back to order-level fulfillment for terminal-negative shipment states", () => {
    // İptal/iade/başarısız gönderi → rozet sipariş seviyesine düşer.
    expect(getOrderFulfillmentDisplay("UNFULFILLED", "CANCELLED")).toBe("NOT_SHIPPED");
    expect(getOrderFulfillmentDisplay("UNFULFILLED", "RETURNED")).toBe("NOT_SHIPPED");
    expect(getOrderFulfillmentDisplay("FULFILLED", "FAILED")).toBe("FULFILLED");
    expect(getOrderFulfillmentDisplay("PARTIAL", null)).toBe("PARTIAL");
  });
});

describe("isOrderPaidForShipment (TODO-136)", () => {
  it("treats PAID and AUTHORIZED as eligible (existing domain 'succeeded' semantics)", () => {
    expect(isOrderPaidForShipment("PAID")).toBe(true);
    expect(isOrderPaidForShipment("AUTHORIZED")).toBe(true);
  });

  it("blocks UNPAID and REFUNDED orders from shipment creation", () => {
    expect(isOrderPaidForShipment("UNPAID")).toBe(false);
    expect(isOrderPaidForShipment("REFUNDED")).toBe(false);
  });
});

describe("pickOrderShipmentStatus", () => {
  it("returns null for no shipments", () => {
    expect(pickOrderShipmentStatus([])).toBeNull();
  });

  it("picks the most advanced positive-progress shipment status", () => {
    expect(pickOrderShipmentStatus(["ORDER_CREATED", "IN_TRANSIT"])).toBe("IN_TRANSIT");
    expect(pickOrderShipmentStatus(["DRAFT", "ORDER_CREATED"])).toBe("ORDER_CREATED");
    expect(pickOrderShipmentStatus(["IN_TRANSIT", "DELIVERED"])).toBe("DELIVERED");
  });

  it("ignores terminal-negative statuses, returning null when they are the only ones", () => {
    expect(pickOrderShipmentStatus(["CANCELLED", "FAILED", "RETURNED"])).toBeNull();
    // Aktif bir kayıt varsa olumsuz olan görmezden gelinir.
    expect(pickOrderShipmentStatus(["CANCELLED", "ORDER_CREATED"])).toBe("ORDER_CREATED");
  });
});

describe("order summary DTOs — shipmentStatus allowlist (customer-safe)", () => {
  it("customerOrderSummary carries only the shipment STATUS enum, never internal statusText", () => {
    const parsed = customerOrderSummarySchema.parse({
      orderNumber: "OS-000054",
      status: "CONFIRMED",
      paymentStatus: "PAID",
      fulfillmentStatus: "UNFULFILLED",
      currency: "TRY",
      totalMinor: 1000,
      itemCount: 1,
      lines: [
        { variantId: "v1", productSlug: "p", sku: "S", title: "T", variantTitle: "M", quantity: 1 },
      ],
      createdAt: "2026-07-01T00:00:00.000Z",
      shipmentStatus: "ORDER_CREATED",
      // İç/admin alanları (statusText, referenceId, externalShipmentId) allowlist dışı → düşürülür.
      statusText: "MNG: kayıt açıldı",
      referenceId: "REF-123",
      externalShipmentId: "EXT-999",
    } as Record<string, unknown>);
    expect(parsed.shipmentStatus).toBe("ORDER_CREATED");
    expect(parsed).not.toHaveProperty("statusText");
    expect(parsed).not.toHaveProperty("referenceId");
    expect(parsed).not.toHaveProperty("externalShipmentId");
  });

  it("admin orderSchema defaults shipmentStatus to null for legacy/no-shipment orders", () => {
    const parsed = orderSchema.parse({
      id: "o1",
      storeId: "s1",
      orderNumber: "ORD-1",
      customerId: null,
      customerEmail: "b@example.local",
      currency: "TRY",
      status: "DRAFT",
      paymentStatus: "UNPAID",
      fulfillmentStatus: "UNFULFILLED",
      subtotalAmount: 0,
      discountAmount: 0,
      shippingAmount: 0,
      taxAmount: 0,
      totalAmount: 0,
      placedAt: null,
      cancelledAt: null,
      cancelReason: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(parsed.shipmentStatus).toBeNull();
  });
});
