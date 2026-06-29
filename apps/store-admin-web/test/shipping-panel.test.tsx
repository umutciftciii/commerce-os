// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShippingPanel } from "../app/(app)/orders/[id]/shipping-panel.js";

const { storeApiMock } = vi.hoisted(() => ({
  storeApiMock: {
    listShippingProviders: vi.fn(),
    getOrderShipping: vi.fn(),
    calculateOrderShippingRate: vi.fn(),
    createOrderShipment: vi.fn(),
    createOrderShipmentBarcode: vi.fn(),
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

function geliverConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: "spc_gel",
    provider: "GELIVER",
    mode: "TEST",
    status: "ENABLED",
    displayName: "Geliver",
    allowOrderCreate: false,
    allowBarcodeCreate: false,
    allowLabelPurchase: false,
    lastTestedAt: null,
    lastTestStatus: "OK",
    lastErrorCode: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    credentials: [{ type: "DEFAULT", configured: true, maskedKey: "••••aaaa", secretSet: false, customerNumberSet: false, customerPasswordSet: false, identityType: null, lastTestedAt: null, lastTestStatus: null, lastErrorCode: null }],
    capabilities: {
      canTestConnection: true,
      canCalculateRate: false,
      canCreateTestShipment: true,
      canCreateOrder: false,
      canCreateBarcode: false,
      canPurchaseLabel: false,
      destructiveActionsDisabledReason: "LABEL_PURCHASE_DISABLED",
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("order detail shipping panel — capability-aware (F3C.1)", () => {
  it("disables 'Ücret hesapla' and shows 'Test gönderi oluştur' for Geliver (rate unsupported)", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [geliverConfig()] });
    storeApiMock.getOrderShipping.mockResolvedValue({ shipments: [] });
    render(<ShippingPanel order={ORDER} locale="tr" />);

    const calc = (await screen.findByRole("button", { name: "Ücret hesapla" })) as HTMLButtonElement;
    expect(calc.disabled).toBe(true);
    expect(screen.getByText("Bu sağlayıcı için ücret hesaplama desteklenmiyor.")).toBeTruthy();
    // Geliver için generic "Sipariş oluştur" yerine "Test gönderi oluştur" CTA'sı.
    const testBtn = screen.getByRole("button", { name: "Test gönderi oluştur" }) as HTMLButtonElement;
    expect(testBtn.disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Sipariş oluştur" })).toBeNull();
  });

  it("shows the activation warning and disables actions for a DISABLED provider", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({
      data: [
        geliverConfig({
          status: "DISABLED",
          capabilities: {
            canTestConnection: true,
            canCalculateRate: false,
            canCreateTestShipment: false,
            canCreateOrder: false,
            canCreateBarcode: false,
            canPurchaseLabel: false,
            destructiveActionsDisabledReason: "LABEL_PURCHASE_DISABLED",
          },
        }),
      ],
    });
    storeApiMock.getOrderShipping.mockResolvedValue({ shipments: [] });
    render(<ShippingPanel order={ORDER} locale="tr" />);

    expect(await screen.findByText(/Bu sağlayıcı aktif değil/)).toBeTruthy();
    const calc = screen.getByRole("button", { name: "Ücret hesapla" }) as HTMLButtonElement;
    expect(calc.disabled).toBe(true);
    const testBtn = screen.getByRole("button", { name: "Test gönderi oluştur" }) as HTMLButtonElement;
    expect(testBtn.disabled).toBe(true);
  });

  it("renders the empty state when no provider is configured", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [] });
    storeApiMock.getOrderShipping.mockResolvedValue({ shipments: [] });
    render(<ShippingPanel order={ORDER} locale="tr" />);
    expect(await screen.findByText(/yapılandırılmış kargo sağlayıcı yok/)).toBeTruthy();
  });
});
