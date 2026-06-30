import { describe, expect, it } from "vitest";
import type { Shipment, ShippingProviderConfig } from "@prisma/client";
import {
  buildShipmentProviderInfo,
  computeShipmentActionCapabilities,
  manualTrackingNextStatus,
  serializeShippingProviderConfig,
  shipmentKpiBucket,
  type ShippingEnvGuards,
} from "../src/shipping/serialize.js";

/**
 * F3C.5 (TODO-121) — provider-agnostic shipment operasyon projeksiyonları.
 * Generic aksiyon yetkileri, KPI kovaları, provider gorunum DTO'su + logo serialize.
 */

const ENV_ON: ShippingEnvGuards = { orderCreate: true, barcodeCreate: true, labelPurchase: true, cancel: true };
const ENV_OFF: ShippingEnvGuards = { orderCreate: false, barcodeCreate: false, labelPurchase: false, cancel: false };

function config(overrides: Partial<ShippingProviderConfig> = {}): ShippingProviderConfig & { credentials: [] } {
  return {
    id: "spc_1",
    storeId: "store_1",
    provider: "DHL_ECOMMERCE",
    mode: "TEST",
    status: "ENABLED",
    displayName: "DHL eCommerce",
    logoUrl: null,
    logoAlt: null,
    allowRecipientCreate: false,
    allowOrderCreate: true,
    allowBarcodeCreate: true,
    allowLabelPurchase: false,
    lastTestedAt: null,
    lastTestStatus: null,
    lastErrorCode: null,
    lastProviderHttpStatus: null,
    lastProviderTestType: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
    credentials: [],
  };
}

function shipment(overrides: Partial<Shipment> = {}): Pick<Shipment, "status" | "externalShipmentId" | "provider"> {
  return {
    status: "ORDER_CREATED",
    externalShipmentId: null,
    provider: "DHL_ECOMMERCE",
    ...overrides,
  } as Pick<Shipment, "status" | "externalShipmentId" | "provider">;
}

describe("computeShipmentActionCapabilities (generic projection)", () => {
  it("DHL with guards on: label + sync available; cancel needs shipmentId", () => {
    const caps = computeShipmentActionCapabilities(config(), shipment(), ENV_ON);
    expect(caps.canCreateLabel).toBe(true);
    expect(caps.canSync).toBe(true);
    expect(caps.canManualTracking).toBe(true);
    expect(caps.canCancel).toBe(false); // externalShipmentId yok
    expect(caps.disabledReason).toBeNull();
  });

  it("DHL cancel becomes available once a shipmentId exists (+ env cancel)", () => {
    const caps = computeShipmentActionCapabilities(config(), shipment({ externalShipmentId: "SHIP-9", status: "LABEL_CREATED" }), ENV_ON);
    expect(caps.canCancel).toBe(true);
  });

  it("guards off disables live label/cancel but manual tracking stays available", () => {
    const caps = computeShipmentActionCapabilities(config(), shipment({ externalShipmentId: "SHIP-9" }), ENV_OFF);
    expect(caps.canCreateLabel).toBe(false);
    expect(caps.canCancel).toBe(false);
    expect(caps.canManualTracking).toBe(true);
  });

  it("MOCK supports label but not sync (provider-specific support, generic surface)", () => {
    const caps = computeShipmentActionCapabilities(config({ provider: "MOCK" }), shipment({ provider: "MOCK" }), ENV_ON);
    expect(caps.canCreateLabel).toBe(true);
    expect(caps.canSync).toBe(false);
  });

  it("cancelled shipment: no actions, SHIPMENT_INACTIVE reason", () => {
    const caps = computeShipmentActionCapabilities(config(), shipment({ status: "CANCELLED", externalShipmentId: "SHIP-9" }), ENV_ON);
    expect(caps.canCreateLabel).toBe(false);
    expect(caps.canSync).toBe(false);
    expect(caps.canCancel).toBe(false);
    expect(caps.canManualTracking).toBe(false);
    expect(caps.disabledReason).toBe("SHIPMENT_INACTIVE");
  });

  it("null provider config (deleted): only manual tracking on active shipment", () => {
    const caps = computeShipmentActionCapabilities(null, shipment(), ENV_ON);
    expect(caps.canCreateLabel).toBe(false);
    expect(caps.canSync).toBe(false);
    expect(caps.canManualTracking).toBe(true);
  });
});

describe("manualTrackingNextStatus (F3C.5 manuel inceleme — explicit admin aksiyonu)", () => {
  it("advances prep-stage shipments to IN_TRANSIT (operasyonel 'kargo süreci başladı')", () => {
    expect(manualTrackingNextStatus("DRAFT")).toBe("IN_TRANSIT");
    expect(manualTrackingNextStatus("ORDER_CREATED")).toBe("IN_TRANSIT");
    expect(manualTrackingNextStatus("LABEL_PENDING")).toBe("IN_TRANSIT");
    expect(manualTrackingNextStatus("LABEL_CREATED")).toBe("IN_TRANSIT");
  });

  it("does not regress already in-transit / further / terminal statuses", () => {
    expect(manualTrackingNextStatus("IN_TRANSIT")).toBe("IN_TRANSIT");
    expect(manualTrackingNextStatus("OUT_FOR_DELIVERY")).toBe("OUT_FOR_DELIVERY");
    expect(manualTrackingNextStatus("DELIVERED")).toBe("DELIVERED");
    expect(manualTrackingNextStatus("DELIVERY_FAILED")).toBe("DELIVERY_FAILED");
    expect(manualTrackingNextStatus("RETURNED")).toBe("RETURNED");
    // İptal/başarısız route'ta zaten 409 ile bloklanır; helper yine de regres etmez.
    expect(manualTrackingNextStatus("CANCELLED")).toBe("CANCELLED");
    expect(manualTrackingNextStatus("FAILED")).toBe("FAILED");
  });

  it("never produces an automatic DELIVERED ('kargoya verildi' otomatik değil)", () => {
    // Manuel tracking yalnız IN_TRANSIT'e kadar ilerletir; teslim/handoff otomatik üretilmez.
    const allPrep = ["DRAFT", "ORDER_CREATED", "LABEL_PENDING", "LABEL_CREATED"] as const;
    for (const s of allPrep) expect(manualTrackingNextStatus(s)).not.toBe("DELIVERED");
  });
});

describe("shipmentKpiBucket", () => {
  it("maps statuses to KPI buckets; DRAFT/CANCELLED uncounted", () => {
    expect(shipmentKpiBucket("ORDER_CREATED")).toBe("prepared");
    expect(shipmentKpiBucket("LABEL_CREATED")).toBe("prepared");
    expect(shipmentKpiBucket("LABEL_PENDING")).toBe("awaitingLabel");
    expect(shipmentKpiBucket("IN_TRANSIT")).toBe("inTransit");
    expect(shipmentKpiBucket("OUT_FOR_DELIVERY")).toBe("inTransit");
    expect(shipmentKpiBucket("DELIVERED")).toBe("delivered");
    expect(shipmentKpiBucket("DELIVERY_FAILED")).toBe("problem");
    expect(shipmentKpiBucket("RETURNED")).toBe("problem");
    expect(shipmentKpiBucket("FAILED")).toBe("problem");
    expect(shipmentKpiBucket("DRAFT")).toBeNull();
    expect(shipmentKpiBucket("CANCELLED")).toBeNull();
  });
});

describe("buildShipmentProviderInfo + logo serialize", () => {
  it("uses config displayName + logo when present", () => {
    const info = buildShipmentProviderInfo("DHL_ECOMMERCE", config({ logoUrl: "https://cdn.example/dhl.png", logoAlt: "DHL" }));
    expect(info.displayName).toBe("DHL eCommerce");
    expect(info.logoUrl).toBe("https://cdn.example/dhl.png");
    expect(info.logoAlt).toBe("DHL");
    expect(info.status).toBe("ENABLED");
  });

  it("falls back to provider type name when config is null", () => {
    const info = buildShipmentProviderInfo("GELIVER", null);
    expect(info.displayName).toBe("Geliver");
    expect(info.logoUrl).toBeNull();
    expect(info.configId).toBeNull();
    expect(info.status).toBeNull();
  });

  it("serializeShippingProviderConfig exposes logoUrl/logoAlt (public, not secret)", () => {
    const out = serializeShippingProviderConfig(config({ logoUrl: "https://cdn.example/x.png", logoAlt: "X" }), ENV_OFF);
    expect(out.logoUrl).toBe("https://cdn.example/x.png");
    expect(out.logoAlt).toBe("X");
  });
});
