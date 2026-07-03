// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderShipmentSummary } from "../app/(app)/orders/[id]/order-shipment-summary.js";

const { storeApiMock, pushMock, UiErrorMock } = vi.hoisted(() => {
  // Gerçek UiError ile aynı sözleşme (code alanı); component instanceof kontrolü yapar.
  class UiErrorMock extends Error {
    constructor(public code: string) {
      super(code);
      this.name = "UiError";
    }
  }
  return {
    storeApiMock: {
      listShippingProviders: vi.fn(),
      getOrderShipping: vi.fn(),
      prepareDhlShipment: vi.fn(),
      createOrderShipment: vi.fn(),
      createShipmentDraft: vi.fn(),
    },
    pushMock: vi.fn(),
    UiErrorMock,
  };
});

vi.mock("../lib/client/api.js", () => ({ storeApi: storeApiMock, UiError: UiErrorMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

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
    allowRecipientCreate: true,
    allowOrderCreate: true,
    allowBarcodeCreate: true,
    allowLabelPurchase: false,
    lastTestedAt: null,
    lastTestStatus: null,
    lastErrorCode: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    credentials: [],
    capabilities: {
      canTestConnection: true,
      canCalculateRate: true,
      canCreateTestShipment: false,
      canCreateOrder: true,
      canCreateBarcode: true,
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

describe("order detail shipment summary card (F3C.5 online-first)", () => {
  it("renders empty state when no provider is configured", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [] });
    storeApiMock.getOrderShipping.mockResolvedValue({ shipments: [] });
    render(<OrderShipmentSummary order={ORDER} locale="tr" />);
    expect(await screen.findByText(/yapılandırılmış kargo sağlayıcı yok/)).toBeTruthy();
  });

  it("online success: 'Gönderi Oluştur' tries provider then routes to shipment detail", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [provider()] });
    storeApiMock.getOrderShipping.mockResolvedValue({ shipments: [] });
    storeApiMock.prepareDhlShipment.mockResolvedValue({ shipment: { id: "shp_new" } });
    const user = userEvent.setup();
    render(<OrderShipmentSummary order={ORDER} locale="tr" />);

    await user.click(await screen.findByRole("button", { name: "Gönderi Oluştur" }));
    // Form açıldı → submit (online birincil akış).
    await user.click(await screen.findByRole("button", { name: "Gönderi Oluştur" }));

    await waitFor(() => expect(storeApiMock.prepareDhlShipment).toHaveBeenCalledTimes(1));
    expect(pushMock).toHaveBeenCalledWith("/shipping/shipments/shp_new");
    // Online başarılıyken manuel fallback kullanılmaz.
    expect(storeApiMock.createShipmentDraft).not.toHaveBeenCalled();
  });

  it("provider error: user-friendly fallback message + 'Manuel Gönderi Hazırla' CTA (no raw error)", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [provider()] });
    storeApiMock.getOrderShipping.mockResolvedValue({ shipments: [] });
    storeApiMock.prepareDhlShipment.mockRejectedValue(new Error("401 no valid subscription"));
    const user = userEvent.setup();
    render(<OrderShipmentSummary order={ORDER} locale="tr" />);

    await user.click(await screen.findByRole("button", { name: "Gönderi Oluştur" }));
    await user.click(await screen.findByRole("button", { name: "Gönderi Oluştur" }));

    // Ham 401 patlamaz → net mesaj + ikincil CTA.
    expect(await screen.findByText(/Geçici bir sağlayıcı hatası oluştu/)).toBeTruthy();
    expect(screen.queryByText(/401|no valid subscription/)).toBeNull();
    expect(await screen.findByRole("button", { name: "Manuel Gönderi Hazırla" })).toBeTruthy();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("TODO-132: RECIPIENT_EMAIL_REQUIRED → generic yerine SPESİFİK e-posta mesajı + manuel CTA", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [provider()] });
    storeApiMock.getOrderShipping.mockResolvedValue({ shipments: [] });
    storeApiMock.prepareDhlShipment.mockRejectedValue(new UiErrorMock("RECIPIENT_EMAIL_REQUIRED"));
    const user = userEvent.setup();
    render(<OrderShipmentSummary order={ORDER} locale="tr" />);

    await user.click(await screen.findByRole("button", { name: "Gönderi Oluştur" }));
    await user.click(await screen.findByRole("button", { name: "Gönderi Oluştur" }));

    // Aksiyon alınabilir mesaj: alıcı e-postası gerekli (i18n sözlüğünden).
    expect(await screen.findByText(/alıcı e-posta adresi gerekli/i)).toBeTruthy();
    expect(screen.queryByText(/Geçici bir sağlayıcı hatası oluştu/)).toBeNull();
    // Manuel gönderi yine de mümkün (provider'a istek atmaz).
    expect(await screen.findByRole("button", { name: "Manuel Gönderi Hazırla" })).toBeTruthy();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("manual fallback creates a local draft (NO provider call) and routes to detail", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [provider()] });
    storeApiMock.getOrderShipping.mockResolvedValue({ shipments: [] });
    storeApiMock.prepareDhlShipment.mockRejectedValue(new Error("provider down"));
    storeApiMock.createShipmentDraft.mockResolvedValue({ shipment: { id: "shp_manual" } });
    const user = userEvent.setup();
    render(<OrderShipmentSummary order={ORDER} locale="tr" />);

    await user.click(await screen.findByRole("button", { name: "Gönderi Oluştur" }));
    await user.click(await screen.findByRole("button", { name: "Gönderi Oluştur" }));
    await user.click(await screen.findByRole("button", { name: "Manuel Gönderi Hazırla" }));

    await waitFor(() => expect(storeApiMock.createShipmentDraft).toHaveBeenCalledTimes(1));
    // Manuel fallback provider'a İSTEK ATMAZ (yalnız draft ucu).
    const draftArgs = storeApiMock.createShipmentDraft.mock.calls[0];
    expect(draftArgs[0]).toBe("o1");
    expect(pushMock).toHaveBeenCalledWith("/shipping/shipments/shp_manual");
  });

  it("active shipment: summary + 'Kargo Detayına Git'; tracking fallback 'Henüz oluşmadı'; no auto 'Kargoya verildi'", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [provider()] });
    storeApiMock.getOrderShipping.mockResolvedValue({ shipments: [shipment()] });
    render(<OrderShipmentSummary order={ORDER} locale="tr" />);

    const link = (await screen.findByRole("link", { name: /Kargo Detayına Git/ })) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/shipping/shipments/shp_1");
    expect(screen.getByText("Gönderi kaydı oluşturuldu")).toBeTruthy();
    expect(screen.queryByText(/Kargoya verildi/)).toBeNull();
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
