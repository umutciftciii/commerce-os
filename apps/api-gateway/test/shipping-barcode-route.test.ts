import Fastify from "fastify";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AppConfig } from "@commerce-os/config";

/**
 * TODO-123 — Manuel "Barkod/Etiket Oluştur" ucu, paylaşılan barcode-service çekirdeğini
 * kullanır. Bu test route WIRING'ini doğrular: manuel barkod hatası retry metadata'sını
 * yazar (BARCODE_CREATE_DISABLED → TERMINAL blok) ve mevcut HTTP mapping'i (409) korur.
 * Sağlayıcı HTTP'si kapalı; guard reddi transport'tan ÖNCE deterministik hata üretir.
 */

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    shipment: { findFirst: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },
    shipmentEvent: { create: vi.fn() },
    shippingProviderConfig: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@commerce-os/db", () => ({ prisma: prismaMock }));

const { registerShippingAdminRoutes } = await import("../src/shipping/routes.js");

const CONFIG = {
  DHL_ECOMMERCE_ALLOW_ORDER_CREATE: false,
  DHL_ECOMMERCE_ALLOW_BARCODE_CREATE: false, // guard KAPALI → BARCODE_CREATE_DISABLED (TERMINAL)
  GELIVER_ALLOW_LABEL_PURCHASE: false,
  DHL_ECOMMERCE_ALLOW_CANCEL: false,
  SHIPPING_SANDBOX_HTTP_ENABLED: false,
  DHL_ECOMMERCE_HTTP_TIMEOUT_MS: 1000,
  DHL_ECOMMERCE_TEST_BASE_URL: "https://test.example",
  DHL_ECOMMERCE_LIVE_BASE_URL: "https://live.example",
  DHL_ECOMMERCE_API_VERSION: "1",
  SHIPPING_ENCRYPTION_KEY: "a".repeat(64),
  BARCODE_RETRY_STALE_AFTER_MINUTES: 15,
  BARCODE_RETRY_MAX_ATTEMPTS: 5,
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

const SHIPMENT = {
  id: "sh1",
  storeId: "s1",
  orderId: "o1",
  providerConfigId: "spc_1",
  provider: "DHL_ECOMMERCE",
  referenceId: "OS-1",
  status: "ORDER_CREATED",
  packagingType: null,
  pieceCount: 1,
  totalKg: 1,
  totalDesi: 1,
  externalShipmentId: null,
  externalInvoiceId: null,
  trackingNumber: null,
  lastBarcodeErrorCode: null,
  barcodeRetryCount: 0,
  barcodeRetryBlockedReason: null,
  events: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.shipment.findFirst.mockResolvedValue(SHIPMENT);
  prismaMock.shippingProviderConfig.findFirst.mockResolvedValue({
    id: "spc_1",
    storeId: "s1",
    provider: "DHL_ECOMMERCE",
    status: "ENABLED",
    credentials: [],
  });
  // recordBarcodeFailure prisma.$transaction ile yazar → cb'yi prismaMock ile calistir.
  prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prismaMock));
  prismaMock.shipment.update.mockResolvedValue({ ...SHIPMENT });
});

describe("TODO-123 — manuel create-label route", () => {
  it("guard kapalı: 409 BARCODE_CREATE_DISABLED + retry metadata TERMINAL yazılır", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/shipping/shipments/sh1/create-label",
      payload: { explicitConfirm: true },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("BARCODE_CREATE_DISABLED");
    // Manuel hata → retry metadata yazıldı (barcode-service TERMINAL blok).
    expect(prismaMock.shipment.update).toHaveBeenCalledTimes(1);
    const data = prismaMock.shipment.update.mock.calls[0]![0].data;
    expect(data.lastBarcodeErrorCode).toBe("BARCODE_CREATE_DISABLED");
    expect(data.barcodeRetryBlockedReason).toBe("TERMINAL");
    expect(data.barcodeNextRetryAt).toBeNull();
    // BARCODE_FAILED event yazıldı (ilk hata).
    expect(prismaMock.shipmentEvent.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.shipmentEvent.create.mock.calls[0]![0].data.eventType).toBe("BARCODE_FAILED");
    await app.close();
  });

  it("locked status (LABEL_CREATED): 409 LABEL_NOT_APPLICABLE (barkod denenmez)", async () => {
    prismaMock.shipment.findFirst.mockResolvedValue({ ...SHIPMENT, status: "LABEL_CREATED" });
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/shipping/shipments/sh1/create-label",
      payload: { explicitConfirm: true },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("LABEL_NOT_APPLICABLE");
    expect(prismaMock.shipment.update).not.toHaveBeenCalled();
    await app.close();
  });
});
