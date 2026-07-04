import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "@commerce-os/config";

/**
 * TODO-139 — Sipariş teslimat adresi SNAPSHOT düzenleme (store-admin).
 *
 * Kapsam: OrderAddress SHIPPING snapshot'ı + (güvenli durumda) Shipment alıcı snapshot'ı
 * güncellenir; MÜŞTERİ adres defteri (customerAddress) ASLA mutasyona uğramaz; gönderi
 * kargoya verilmiş/teslim aşamasındaysa SHIPMENT_ADDRESS_LOCKED (409); duplicate shipment
 * guard bozulmaz (shipment.create çağrılmaz). CBS kod doğrulama/0-persist guarantee'leri
 * ayrıca shipping-cbs-mapping.test.ts'te (validateCodes/isValidGeoCode) birim düzeyinde
 * doğrulanır ve bu uç AYNI validateCodes'u kullanır.
 */

const { prismaMock } = vi.hoisted(() => {
  return {
    prismaMock: {
      order: { findFirst: vi.fn() },
      orderAddress: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
      orderEvent: { create: vi.fn() },
      shipment: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn() },
      shipmentEvent: { create: vi.fn() },
      shippingProviderConfig: { findFirst: vi.fn() },
      // Müşteri adres defteri — bu uç ASLA dokunmamalı (çağrılırsa test patlar).
      customerAddress: { update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("@commerce-os/db", () => ({ prisma: prismaMock }));

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

function buildApp(opts?: { denyAdmin?: boolean }) {
  const app = Fastify();
  registerShippingAdminRoutes(app, {
    config: CONFIG,
    requireStoreAdmin: async (_req, reply) => {
      if (opts?.denyAdmin) {
        reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "no" } });
        return null;
      }
      return { actorUserId: "u1" };
    },
    recordAudit: async () => {},
  });
  return app;
}

const BODY = {
  recipientName: "Yeni Alıcı",
  recipientPhone: "5550001122",
  cityName: "İstanbul",
  districtName: "Kadıköy",
  addressLine1: "Yeni Mah. 1 Sk No 2",
  postalCode: "34710",
  explicitConfirm: true,
};

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    storeId: "s1",
    orderNumber: "ORD-1",
    paymentStatus: "PAID",
    customerEmail: "a@b.local",
    customerId: "c1",
    ...overrides,
  };
}

function shipmentRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "sh1",
    storeId: "s1",
    orderId: "o1",
    providerConfigId: "spc_1",
    provider: "GELIVER",
    referenceId: "ORD-1",
    status: "ORDER_CREATED",
    externalOrderId: null,
    externalShipmentId: null,
    externalInvoiceId: null,
    trackingNumber: null,
    trackingUrl: null,
    labelUrl: null,
    shipmentStatusCode: null,
    barcodeJsonSafe: null,
    pieceCount: 1,
    totalKg: 1,
    totalDesi: 1,
    recipientName: "Eski Alıcı",
    recipientEmail: "a@b.local",
    recipientPhone: "5550000000",
    recipientCityCode: null,
    recipientDistrictCode: null,
    recipientCityName: "İstanbul",
    recipientDistrictName: "Üsküdar",
    recipientAddress: "Eski adres",
    lastBarcodeErrorCode: null,
    barcodeRetryCount: 0,
    barcodeNextRetryAt: null,
    barcodeLastAttemptAt: null,
    barcodeRetryBlockedReason: null,
    lastSyncAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    events: [],
    ...overrides,
  };
}

function providerConfig(provider: "GELIVER" | "DHL_ECOMMERCE" = "GELIVER") {
  return { id: "spc_1", storeId: "s1", provider, status: "ENABLED", credentials: [] };
}

beforeEach(() => {
  Object.values(prismaMock).forEach((entity) => {
    if (typeof entity === "function") return;
    Object.values(entity as Record<string, ReturnType<typeof vi.fn>>).forEach((fn) => fn.mockReset());
  });
  (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockReset();
  // tx === prismaMock (aynı mock metotları hem tx içi hem dışı).
  (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(prismaMock),
  );
  prismaMock.orderAddress.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    id: "oa1",
    storeId: "s1",
    orderId: "o1",
    type: "SHIPPING",
    ...data,
  }));
  prismaMock.orderAddress.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    id: "oa1",
    ...data,
  }));
  prismaMock.shipment.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    shipmentRecord(data),
  );
  prismaMock.shipment.findUniqueOrThrow.mockImplementation(() => shipmentRecord());
});

afterEach(() => vi.clearAllMocks());

function inject(app: ReturnType<typeof buildApp>, payload: Record<string, unknown> = BODY, url = "/stores/s1/orders/o1/shipping/address") {
  return app.inject({ method: "PATCH", url, payload });
}

describe("TODO-139 — order shipping address snapshot edit", () => {
  it("no shipment: updates ONLY OrderAddress snapshot + writes order event; no shipment mutation", async () => {
    prismaMock.order.findFirst.mockResolvedValue(order());
    prismaMock.shipment.findFirst.mockResolvedValue(null); // findActiveShipment
    prismaMock.orderAddress.findFirst.mockResolvedValue({
      id: "oa1",
      storeId: "s1",
      orderId: "o1",
      type: "SHIPPING",
      countryCode: "TR",
    });
    const app = buildApp();

    const res = await inject(app);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.shippingAddress.city).toBe("İstanbul");
    expect(body.shippingAddress.fullName).toBe("Yeni Alıcı");
    expect(body.shipment).toBeNull();
    expect(prismaMock.orderAddress.update).toHaveBeenCalled();
    expect(prismaMock.orderEvent.create).toHaveBeenCalled();
    // Gönderi yok → hiçbir shipment mutasyonu; müşteri adres defteri dokunulmaz.
    expect(prismaMock.shipment.update).not.toHaveBeenCalled();
    expect(prismaMock.shipment.create).not.toHaveBeenCalled();
    expect(prismaMock.customerAddress.update).not.toHaveBeenCalled();
    expect(prismaMock.customerAddress.updateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("editable shipment (ORDER_CREATED): updates BOTH order + shipment snapshot, writes DESTINATION_REPAIRED event", async () => {
    prismaMock.order.findFirst.mockResolvedValue(order());
    prismaMock.shipment.findFirst.mockResolvedValue(shipmentRecord({ status: "ORDER_CREATED" }));
    prismaMock.shippingProviderConfig.findFirst.mockResolvedValue(providerConfig("GELIVER"));
    prismaMock.orderAddress.findFirst.mockResolvedValue({
      id: "oa1", storeId: "s1", orderId: "o1", type: "SHIPPING", countryCode: "TR",
    });
    const app = buildApp();

    const res = await inject(app);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.shipment).not.toBeNull();
    expect(prismaMock.orderAddress.update).toHaveBeenCalled();
    expect(prismaMock.shipment.update).toHaveBeenCalled();
    // Non-DHL sağlayıcı → repair desteklenmez, provider'a yeniden iletim YOK, snapshot yine kaydedilir.
    expect(body.providerRepairSupported).toBe(false);
    expect(body.providerResent).toBe(false);
    // Gönderi olayı DESTINATION_REPAIRED olarak yazılır (yeni enum/migration yok).
    const evt = prismaMock.shipmentEvent.create.mock.calls[0]?.[0]?.data;
    expect(evt?.eventType).toBe("DESTINATION_REPAIRED");
    // Duplicate guard bozulmaz — yeni gönderi OLUŞTURULMAZ.
    expect(prismaMock.shipment.create).not.toHaveBeenCalled();
    // Müşteri adres defteri ASLA mutasyona uğramaz.
    expect(prismaMock.customerAddress.update).not.toHaveBeenCalled();
    expect(prismaMock.customerAddress.updateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("no SHIPPING OrderAddress yet: creates one (does not require pre-existing snapshot)", async () => {
    prismaMock.order.findFirst.mockResolvedValue(order());
    prismaMock.shipment.findFirst.mockResolvedValue(null);
    prismaMock.orderAddress.findFirst.mockResolvedValue(null);
    const app = buildApp();

    const res = await inject(app);

    expect(res.statusCode).toBe(200);
    expect(prismaMock.orderAddress.create).toHaveBeenCalled();
    expect(prismaMock.orderAddress.update).not.toHaveBeenCalled();
    await app.close();
  });

  it("IN_TRANSIT shipment: 409 SHIPMENT_ADDRESS_LOCKED, no snapshot mutation", async () => {
    prismaMock.order.findFirst.mockResolvedValue(order());
    prismaMock.shipment.findFirst.mockResolvedValue(shipmentRecord({ status: "IN_TRANSIT" }));
    const app = buildApp();

    const res = await inject(app);

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("SHIPMENT_ADDRESS_LOCKED");
    expect(prismaMock.orderAddress.update).not.toHaveBeenCalled();
    expect(prismaMock.shipment.update).not.toHaveBeenCalled();
    await app.close();
  });

  it("DELIVERED shipment: 409 SHIPMENT_ADDRESS_LOCKED", async () => {
    prismaMock.order.findFirst.mockResolvedValue(order());
    prismaMock.shipment.findFirst.mockResolvedValue(shipmentRecord({ status: "DELIVERED" }));
    const app = buildApp();

    const res = await inject(app);

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("SHIPMENT_ADDRESS_LOCKED");
    await app.close();
  });

  it("LABEL_CREATED shipment: locked (etiket basılı = taşıyıcıya devir varsayımı)", async () => {
    prismaMock.order.findFirst.mockResolvedValue(order());
    prismaMock.shipment.findFirst.mockResolvedValue(shipmentRecord({ status: "LABEL_CREATED" }));
    const app = buildApp();

    const res = await inject(app);

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("SHIPMENT_ADDRESS_LOCKED");
    await app.close();
  });

  it("LABEL_PENDING shipment: editable (barkod boş 200 retry edilebilir durum)", async () => {
    prismaMock.order.findFirst.mockResolvedValue(order());
    prismaMock.shipment.findFirst.mockResolvedValue(shipmentRecord({ status: "LABEL_PENDING" }));
    prismaMock.shippingProviderConfig.findFirst.mockResolvedValue(providerConfig("GELIVER"));
    prismaMock.orderAddress.findFirst.mockResolvedValue({
      id: "oa1", storeId: "s1", orderId: "o1", type: "SHIPPING", countryCode: "TR",
    });
    const app = buildApp();

    const res = await inject(app);

    expect(res.statusCode).toBe(200);
    expect(prismaMock.shipment.update).toHaveBeenCalled();
    await app.close();
  });

  it("store ownership: order not found in store → 404 ORDER_NOT_FOUND (no mutation)", async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);
    const app = buildApp();

    const res = await inject(app);

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("ORDER_NOT_FOUND");
    expect(prismaMock.orderAddress.update).not.toHaveBeenCalled();
    await app.close();
  });

  it("non-admin/customer session: requireStoreAdmin denies → 401, no order lookup or mutation", async () => {
    const app = buildApp({ denyAdmin: true });

    const res = await inject(app);

    expect(res.statusCode).toBe(401);
    expect(prismaMock.order.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.orderAddress.update).not.toHaveBeenCalled();
    await app.close();
  });
});
