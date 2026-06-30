// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderShipmentSummary } from "../app/(app)/orders/[id]/order-shipment-summary.js";

const { storeApiMock } = vi.hoisted(() => ({
  storeApiMock: {
    listShippingProviders: vi.fn(),
    getOrderShipping: vi.fn(),
    prepareDhlShipment: vi.fn(),
    createOrderShipment: vi.fn(),
  },
}));

vi.mock("../lib/client/api.js", () => ({ storeApi: storeApiMock }));

const ORDER = {
  id: "o1",
  orderNumber: "OS-000001",
  currency: "TRY",
  addresses: [
    {
      id: "a1",
      type: "SHIPPING",
      fullName: "Umut ÇİFTCİ",
      addressLine1: "Cennet Mah.",
      addressLine2: null,
      district: "Küçükçekmece",
      city: "İstanbul",
      postalCode: null,
      countryCode: "TR",
      phone: "+905322222323",
    },
  ],
} as never;

function provider(overrides: Record<string, unknown> = {}) {
  return {
    id: "spc_dhl",
    provider: "DHL_ECOMMERCE",
    mode: "TEST",
    status: "ENABLED",
    displayName: "DHL eCommerce",
    logoUrl: null,
    logoAlt: null,
    allowRecipientCreate: false,
    allowOrderCreate: false,
    allowBarcodeCreate: false,
    allowLabelPurchase: false,
    lastTestedAt: null,
    lastTestStatus: null,
    lastErrorCode: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    credentials: [],
    capabilities: {
      canTestConnection: true,
      canCalculateRate: false,
      canCreateTestShipment: false,
      canCreateOrder: false,
      canCreateBarcode: false,
      canPurchaseLabel: false,
      destructiveActionsDisabledReason: null,
    },
    ...overrides,
  };
}

function shipment(overrides: Record<string, unknown> = {}) {
  return {
    id: "shp_1",
    orderId: "o1",
    provider: "DHL_ECOMMERCE",
    referenceId: "OS-000001",
    status: "ORDER_CREATED",
    externalOrderId: "EXT-1",
    externalShipmentId: null,
    externalInvoiceId: null,
    trackingNumber: null,
    trackingUrl: null,
    labelUrl: null,
    shipmentStatusCode: null,
    barcodeHasLabel: false,
    recipientName: "Umut ÇİFTCİ",
    lastSyncedAt: null,
    lastProviderStatus: null,
    events: [],
    createdAt: "2026-06-30T10:00:00.000Z",
    updatedAt: "2026-06-30T10:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("order detail shipment summary card (F3C.5)", () => {
  it("renders empty state when no provider is configured", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [] });
    storeApiMock.getOrderShipping.mockResolvedValue({ shipments: [] });
    render(<OrderShipmentSummary order={ORDER} locale="tr" />);
    expect(await screen.findByText(/yapılandırılmış kargo sağlayıcı yok/)).toBeTruthy();
  });

  it("no shipment: safe summary only, NO destructive provider call, routes to Shipments screen", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [provider()] });
    storeApiMock.getOrderShipping.mockResolvedValue({ shipments: [] });
    render(<OrderShipmentSummary order={ORDER} locale="tr" />);

    expect(await screen.findByText("Bu sipariş için henüz kargo kaydı oluşturulmadı.")).toBeTruthy();
    // Güvenli yönlendirme: "Kargo Gönderileri" linki; destructive create butonu YOK.
    const link = screen.getByRole("link", { name: /Kargo Gönderileri/ }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/shipping/shipments");
    expect(screen.queryByRole("button", { name: "Gönderi Kaydı Oluştur" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Oluştur" })).toBeNull();
    // Order detay kartı dış sağlayıcıya İSTEK ATMAZ (createOrder/prepare çağrısı yok).
    expect(storeApiMock.prepareDhlShipment).not.toHaveBeenCalled();
    expect(storeApiMock.createOrderShipment).not.toHaveBeenCalled();
    // Operasyon paneli order detayında DEĞİL.
    expect(screen.queryByText("Hareketler")).toBeNull();
    expect(screen.queryByRole("button", { name: "Durumu Güncelle" })).toBeNull();
  });

  it("lock copy uses security-lock framing, no misleading 'Canlı X oluşturma' wording", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [provider()] });
    storeApiMock.getOrderShipping.mockResolvedValue({ shipments: [] });
    render(<OrderShipmentSummary order={ORDER} locale="tr" />);

    const lock = await screen.findByText(/güvenlik kilidiyle kapalı/);
    expect((lock.textContent ?? "").match(/Canlı (alıcı|gönderi|barkod)/)).toBeNull();
  });

  it("shows summary + 'Kargo Detayına Git' link; tracking fallback 'Henüz oluşmadı'; no auto 'Kargoya verildi'", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [provider()] });
    storeApiMock.getOrderShipping.mockResolvedValue({ shipments: [shipment()] });
    render(<OrderShipmentSummary order={ORDER} locale="tr" />);

    const link = (await screen.findByRole("link", { name: /Kargo Detayına Git/ })) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/shipping/shipments/shp_1");
    // ORDER_CREATED generic etiketi "Gönderi kaydı oluşturuldu"; "Kargoya verildi" OTOMATİK kullanılmaz.
    expect(screen.getByText("Gönderi kaydı oluşturuldu")).toBeTruthy();
    expect(screen.queryByText(/Kargoya verildi/)).toBeNull();
    // Takip no yoksa açık fallback gösterilir (liste/detay/özet tutarlı).
    expect(screen.getByText("Henüz oluşmadı")).toBeTruthy();
  });

  it("manual-tracked shipment surfaces IN_TRANSIT status + tracking number in the order summary", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [provider()] });
    storeApiMock.getOrderShipping.mockResolvedValue({
      shipments: [shipment({ status: "IN_TRANSIT", trackingNumber: "TRK-123456" })],
    });
    render(<OrderShipmentSummary order={ORDER} locale="tr" />);

    expect(await screen.findByText("Taşıma sürecinde")).toBeTruthy();
    expect(screen.getByText("TRK-123456")).toBeTruthy();
  });
});
