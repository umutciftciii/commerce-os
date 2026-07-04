// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    // TODO-136 — IN_TRANSIT etiketi "Yolda"; hem durum rozetinde hem filtresinde geçer.
    expect(screen.getAllByText("Yolda").length).toBeGreaterThan(0);
    expect(screen.getByText("İstanbul Aktarma")).toBeTruthy();
    // KPI etiketleri (sade MVP).
    expect(screen.getByText("Transferde")).toBeTruthy();
    expect(screen.getByText("Barkod bekleyen")).toBeTruthy();
  });

  it("shows explicit 'Henüz oluşmadı' tracking fallback when trackingNumber is null", async () => {
    storeApiMock.listShipments.mockResolvedValue({
      data: [{ ...listItem(), status: "LABEL_CREATED", trackingNumber: null }],
      total: 1,
      kpi: { prepared: 1, awaitingLabel: 0, inTransit: 0, delivered: 0, problem: 0 },
    });
    render(<ShipmentsPage />);

    expect(await screen.findByText("Henüz oluşmadı")).toBeTruthy();
    // TODO-136 — LABEL_CREATED → "Kargo İçin Paketlendi".
    expect(screen.getAllByText("Kargo İçin Paketlendi").length).toBeGreaterThan(0);
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

    // TODO-136 — Liste ile aynı normalized status helper: IN_TRANSIT → "Yolda".
    expect(screen.getAllByText("Yolda").length).toBeGreaterThan(0);

    // Timeline konumu "İşlem noktası" olarak gösterilir (kesin varış/teslimat şubesi DEĞİL).
    expect(screen.getByText(/İşlem noktası: İstanbul Aktarma/)).toBeTruthy();

    // UI cilası — timeline/son senkron tarihi 24 saat Türkçe-dostu dd.MM.yyyy HH:mm
    // (saniyesiz, AM/PM yok). lastSync + event olmak üzere birden fazla tarih alanı vardır.
    const dates = screen.getAllByText(/^30\.06\.2026 \d{2}:\d{2}$/);
    expect(dates.length).toBeGreaterThan(0);
    for (const el of dates) {
      expect(el.textContent).not.toMatch(/\d{2}:\d{2}:\d{2}/);
      expect(el.textContent).not.toMatch(/AM|PM/);
    }

    // "Kargoya verildi" OTOMATİK durum olarak render edilmez.
    expect(screen.queryByText(/Kargoya verildi/)).toBeNull();

    // Aksiyon butonları DHL'e özel sözcük içermez.
    for (const name of ["Barkod/Etiket Oluştur", "Durumu Güncelle", "Gönderi Kaydını İptal Et", "Manuel Takip No Gir"]) {
      expect(name.includes("DHL")).toBe(false);
    }
  });
});

/** TODO-123 — barkod retry/backoff durumu (barkod öncesi, güvenli durum). */
function retryDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...detail(),
    status: "ORDER_CREATED",
    barcodeHasLabel: false,
    trackingNumber: null,
    barcodeRetryCount: 0,
    barcodeNextRetryAt: null,
    barcodeLastAttemptAt: "2026-07-04T12:00:00.000Z",
    barcodeRetryBlockedReason: null,
    lastBarcodeErrorCode: null,
    actions: {
      canPrepare: false,
      canCreateLabel: true,
      canSync: true,
      canCancel: false,
      canManualTracking: true,
      canRepairDestination: false,
      disabledReason: null,
    },
    ...overrides,
  };
}

describe("shipment retry state (TODO-123)", () => {
  it("transient hata: retry durumu + 'Şimdi Tekrar Dene' butonu render edilir ve çalışır", async () => {
    storeApiMock.getShipment.mockResolvedValue({
      shipment: retryDetail({ lastBarcodeErrorCode: "BARCODE_PROVIDER_ERROR", barcodeRetryCount: 2, barcodeNextRetryAt: "2026-07-04T12:15:00.000Z" }),
    });
    storeApiMock.createShipmentLabel.mockResolvedValue({ shipment: retryDetail() });
    render(<ShipmentDetailPage />);

    expect(await screen.findByText("Barkod Deneme Durumu")).toBeTruthy();
    expect(screen.getByText(/Sistem tekrar deneyecek/)).toBeTruthy();
    expect(screen.getByText("Deneme sayısı")).toBeTruthy();

    const retryBtn = screen.getByRole("button", { name: "Şimdi Tekrar Dene" });
    fireEvent.click(retryBtn);
    expect(storeApiMock.createShipmentLabel).toHaveBeenCalledWith("shp_1", { explicitConfirm: true });
  });

  it("DATA_FIX blok: adres düzeltme mesajı render edilir", async () => {
    storeApiMock.getShipment.mockResolvedValue({
      shipment: retryDetail({ lastBarcodeErrorCode: "DESTINATION_BRANCH_NOT_FOUND", barcodeRetryBlockedReason: "DATA_FIX", canRepairDestination: true }),
    });
    render(<ShipmentDetailPage />);
    expect(await screen.findByText(/Adres düzeltmesi gerekiyor/)).toBeTruthy();
  });

  it("MAX_ATTEMPTS blok: tükenmiş deneme mesajı render edilir", async () => {
    storeApiMock.getShipment.mockResolvedValue({
      shipment: retryDetail({ lastBarcodeErrorCode: "BARCODE_PROVIDER_ERROR", barcodeRetryBlockedReason: "MAX_ATTEMPTS", barcodeRetryCount: 5 }),
    });
    render(<ShipmentDetailPage />);
    expect(await screen.findByText(/Otomatik deneme limiti doldu/)).toBeTruthy();
  });

  it("kilitli durumda (hata yok): retry bölümü render EDİLMEZ", async () => {
    storeApiMock.getShipment.mockResolvedValue({ shipment: detail() }); // IN_TRANSIT, error yok
    render(<ShipmentDetailPage />);
    await screen.findByRole("button", { name: "Durumu Güncelle" });
    expect(screen.queryByText("Barkod Deneme Durumu")).toBeNull();
    expect(screen.queryByRole("button", { name: "Şimdi Tekrar Dene" })).toBeNull();
  });
});
