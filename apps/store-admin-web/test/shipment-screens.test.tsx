// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShipmentsPage from "../app/(app)/shipping/shipments/page.js";
import ShipmentDetailPage from "../app/(app)/shipping/shipments/[id]/page.js";

const { storeApiMock, pushMock } = vi.hoisted(() => ({
  storeApiMock: {
    listShipments: vi.fn(),
    getShipment: vi.fn(),
    createShipmentLabel: vi.fn(),
    syncShipment: vi.fn(),
    cancelShipment: vi.fn(),
    setShipmentManualTracking: vi.fn(),
  },
  pushMock: vi.fn(),
}));

vi.mock("../lib/client/api.js", () => ({ storeApi: storeApiMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({ id: "shp_1" }),
}));

const PROVIDER_INFO = {
  configId: "c1",
  type: "DHL_ECOMMERCE",
  displayName: "DHL eCommerce",
  status: "ENABLED",
  logoUrl: null,
  logoAlt: null,
};

function listItem() {
  return {
    id: "shp_1",
    orderId: "o1",
    orderNumber: "OS-000001",
    customerName: "Umut ÇİFTCİ",
    provider: PROVIDER_INFO,
    referenceId: "OS-000001",
    status: "IN_TRANSIT",
    trackingNumber: "TRK-123",
    trackingUrl: null,
    barcodeHasLabel: true,
    lastEventType: "TRACKING_UPDATED",
    lastEventLocation: "İstanbul Aktarma",
    lastProviderStatus: "Yolda",
    lastSyncedAt: "2026-06-30T12:00:00.000Z",
    createdAt: "2026-06-30T10:00:00.000Z",
    updatedAt: "2026-06-30T12:00:00.000Z",
  };
}

function detail() {
  return {
    id: "shp_1",
    orderId: "o1",
    orderNumber: "OS-000001",
    customerName: "Umut ÇİFTCİ",
    customerEmail: "umut@example.com",
    provider: "DHL_ECOMMERCE",
    providerInfo: PROVIDER_INFO,
    referenceId: "OS-000001",
    status: "IN_TRANSIT",
    externalOrderId: "EXT-1",
    externalShipmentId: "SHIP-9",
    externalInvoiceId: null,
    trackingNumber: "TRK-123",
    trackingUrl: null,
    labelUrl: null,
    shipmentStatusCode: 2,
    barcodeHasLabel: true,
    recipientName: "Umut ÇİFTCİ",
    lastSyncedAt: "2026-06-30T12:00:00.000Z",
    lastProviderStatus: "Yolda",
    events: [
      {
        id: "ev1",
        eventType: "TRACKING_UPDATED",
        statusCode: 2,
        statusText: "Transfer merkezinde",
        location: "İstanbul Aktarma",
        occurredAt: "2026-06-30T11:00:00.000Z",
        trackingUrl: null,
        createdAt: "2026-06-30T11:00:00.000Z",
      },
    ],
    createdAt: "2026-06-30T10:00:00.000Z",
    updatedAt: "2026-06-30T12:00:00.000Z",
    actions: {
      canPrepare: false,
      canCreateLabel: false,
      canSync: true,
      canCancel: true,
      canManualTracking: true,
      disabledReason: null,
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("shipment list page (F3C.5)", () => {
  it("renders columns: order no, customer, provider name, tracking, status, last point + KPI", async () => {
    storeApiMock.listShipments.mockResolvedValue({
      data: [listItem()],
      total: 1,
      kpi: { prepared: 2, awaitingLabel: 1, inTransit: 3, delivered: 5, problem: 0 },
    });
    render(<ShipmentsPage />);

    expect(await screen.findByText("OS-000001")).toBeTruthy();
    expect(screen.getByText("Umut ÇİFTCİ")).toBeTruthy();
    expect(screen.getByText("DHL eCommerce")).toBeTruthy();
    expect(screen.getByText("TRK-123")).toBeTruthy();
    // "Taşıma sürecinde" hem durum rozetinde hem durum filtresinde geçer → en az bir eşleşme.
    expect(screen.getAllByText("Taşıma sürecinde").length).toBeGreaterThan(0);
    expect(screen.getByText("İstanbul Aktarma")).toBeTruthy();
    // KPI etiketleri (sade MVP).
    expect(screen.getByText("Transferde")).toBeTruthy();
    expect(screen.getByText("Barkod bekleyen")).toBeTruthy();
  });
});

describe("shipment detail page (F3C.5)", () => {
  it("renders generic action copy (no DHL-specific labels) + 'İşlem noktası' timeline", async () => {
    storeApiMock.getShipment.mockResolvedValue({ shipment: detail() });
    render(<ShipmentDetailPage />);

    // Generic, provider-agnostic aksiyon metinleri.
    expect(await screen.findByRole("button", { name: "Barkod/Etiket Oluştur" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Durumu Güncelle" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gönderi Kaydını İptal Et" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Manuel Takip No Gir" })).toBeTruthy();

    // Timeline konumu "İşlem noktası" olarak gösterilir (kesin varış/teslimat şubesi DEĞİL).
    expect(screen.getByText(/İşlem noktası: İstanbul Aktarma/)).toBeTruthy();

    // "Kargoya verildi" OTOMATİK durum olarak render edilmez.
    expect(screen.queryByText(/Kargoya verildi/)).toBeNull();

    // Aksiyon butonları DHL'e özel sözcük içermez.
    for (const name of ["Barkod/Etiket Oluştur", "Durumu Güncelle", "Gönderi Kaydını İptal Et", "Manuel Takip No Gir"]) {
      expect(name.includes("DHL")).toBe(false);
    }
  });
});
