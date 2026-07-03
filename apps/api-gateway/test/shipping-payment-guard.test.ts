import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "@commerce-os/config";

/**
 * TODO-136 — Gönderi oluşturma ödeme guard'ı (backend NİHAİ otorite). Ödemesi ALINMAMIŞ
 * sipariş kargoya VERİLEMEZ: sağlayıcıya İSTEK ATILMADAN, Shipment/ShipmentEvent kaydı
 * OLUŞTURULMADAN 409 ORDER_PAYMENT_REQUIRED döner. PAID/AUTHORIZED sipariş guard'ı geçer.
 */

const { prismaMock } = vi.hoisted(() => {
  return {
    prismaMock: {
      order: { findFirst: vi.fn() },
      shipment: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
      shipmentEvent: { create: vi.fn() },
      shippingProviderConfig: { findFirst: vi.fn() },
    },
  };
});

vi.mock("@commerce-os/db", () => ({ prisma: prismaMock }));

// registerShippingAdminRoutes db mock kurulduktan SONRA import edilmeli.
const { registerShippingAdminRoutes } = await import("../src/shipping/routes.js");

const CONFIG = {
  DHL_ECOMMERCE_ALLOW_ORDER_CREATE: false,
  DHL_ECOMMERCE_ALLOW_BARCODE_CREATE: false,
  GELIVER_ALLOW_LABEL_PURCHASE: false,
  DHL_ECOMMERCE_ALLOW_CANCEL: false,
  SHIPPING_SANDBOX_HTTP_ENABLED: false,
  DHL_ECOMMERCE_HTTP_TIMEOUT_MS: 1000,
  DHL_ECOMMERCE_TEST_BASE_URL: "https://test.example",
  DHL_ECOMMERCE_LIVE_BASE_URL: "https://live.example",
  DHL_ECOMMERCE_API_VERSION: "1",
  SHIPPING_ENCRYPTION_KEY: "a".repeat(64),
} as unknown as AppConfig;

function buildApp() {
  const app = Fastify();
  registerShippingAdminRoutes(app, {
    config: CONFIG,
    requireStoreAdmin: async () => ({ actorUserId: "u1" }),
    recordAudit: async () => {},
  });
  return app;
}

const PREPARE_BODY = {
  providerConfigId: "spc_1",
  recipient: { fullName: "Alıcı" },
  pieces: [{ desi: 1, kg: 1 }],
  explicitConfirm: true,
};

function providerConfig() {
  return { id: "spc_1", storeId: "s1", provider: "DHL_ECOMMERCE", status: "ENABLED", credentials: [] };
}

beforeEach(() => {
  prismaMock.order.findFirst.mockReset();
  prismaMock.shipment.create.mockReset();
  prismaMock.shipment.findFirst.mockReset();
  prismaMock.shipment.findMany.mockReset();
  prismaMock.shipmentEvent.create.mockReset();
  prismaMock.shippingProviderConfig.findFirst.mockReset();
  prismaMock.shipment.findFirst.mockResolvedValue(null);
});

afterEach(() => vi.clearAllMocks());

describe("shipping prepare — unpaid order guard (TODO-136)", () => {
  it("create-order: UNPAID order is rejected with 409 ORDER_PAYMENT_REQUIRED before any provider/config/shipment work", async () => {
    prismaMock.order.findFirst.mockResolvedValue({
      id: "o1",
      storeId: "s1",
      orderNumber: "ORD-1",
      paymentStatus: "UNPAID",
      customerEmail: "a@b.local",
      customerId: null,
    });
    const app = buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/orders/o1/shipping/create-order",
      payload: { ...PREPARE_BODY, referenceId: "ORD-1" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ORDER_PAYMENT_REQUIRED");
    // Guard sağlayıcı config'inden ÖNCE çalışır; Shipment/ShipmentEvent OLUŞMAZ.
    expect(prismaMock.shippingProviderConfig.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.shipment.create).not.toHaveBeenCalled();
    expect(prismaMock.shipmentEvent.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("dhl/prepare: UNPAID order is rejected with 409 ORDER_PAYMENT_REQUIRED and no shipment is persisted", async () => {
    prismaMock.order.findFirst.mockResolvedValue({
      id: "o1",
      storeId: "s1",
      orderNumber: "ORD-1",
      paymentStatus: "UNPAID",
      customerEmail: "a@b.local",
      customerId: null,
    });
    prismaMock.shippingProviderConfig.findFirst.mockResolvedValue(providerConfig());
    const app = buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/orders/o1/shipping/dhl/prepare",
      payload: PREPARE_BODY,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ORDER_PAYMENT_REQUIRED");
    expect(prismaMock.shipment.create).not.toHaveBeenCalled();
    expect(prismaMock.shipmentEvent.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("shipment-draft: UNPAID order cannot create even a manual local draft", async () => {
    prismaMock.order.findFirst.mockResolvedValue({
      id: "o1",
      storeId: "s1",
      orderNumber: "ORD-1",
      paymentStatus: "REFUNDED",
      customerEmail: "a@b.local",
      customerId: null,
    });
    prismaMock.shippingProviderConfig.findFirst.mockResolvedValue(providerConfig());
    const app = buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/orders/o1/shipping/shipment-draft",
      payload: PREPARE_BODY,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ORDER_PAYMENT_REQUIRED");
    expect(prismaMock.shipment.create).not.toHaveBeenCalled();
    expect(prismaMock.shipmentEvent.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("create-order: a PAID order passes the payment guard (fails later on missing provider config, not on payment)", async () => {
    prismaMock.order.findFirst.mockResolvedValue({
      id: "o1",
      storeId: "s1",
      orderNumber: "ORD-1",
      paymentStatus: "PAID",
      customerEmail: "a@b.local",
      customerId: null,
    });
    // Config yok → guard'ı GEÇTİKTEN sonra 404 SHIPPING_PROVIDER_NOT_FOUND (ödeme engeli DEĞİL).
    prismaMock.shippingProviderConfig.findFirst.mockResolvedValue(null);
    const app = buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/orders/o1/shipping/create-order",
      payload: { ...PREPARE_BODY, referenceId: "ORD-1" },
    });

    expect(res.json().error.code).not.toBe("ORDER_PAYMENT_REQUIRED");
    expect(res.json().error.code).toBe("SHIPPING_PROVIDER_NOT_FOUND");
    expect(prismaMock.shippingProviderConfig.findFirst).toHaveBeenCalled();
    expect(prismaMock.shipment.create).not.toHaveBeenCalled();
    await app.close();
  });
});
