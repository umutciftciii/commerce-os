// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShippingProvidersPage from "../app/(app)/shipping/providers/page.js";

const { storeApiMock } = vi.hoisted(() => ({
  storeApiMock: {
    listShippingProviders: vi.fn(),
    createShippingProvider: vi.fn(),
    updateShippingProvider: vi.fn(),
    upsertShippingCredential: vi.fn(),
    deleteShippingCredential: vi.fn(),
    testShippingProvider: vi.fn(),
  },
}));

vi.mock("../lib/client/api.js", () => ({ storeApi: storeApiMock }));

const DHL_CONFIG = {
  id: "spc_dhl",
  provider: "DHL_ECOMMERCE",
  mode: "TEST",
  status: "DISABLED",
  displayName: "DHL Kargo Test",
  allowOrderCreate: false,
  allowBarcodeCreate: false,
  allowLabelPurchase: false,
  lastTestedAt: null,
  lastTestStatus: null,
  lastErrorCode: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  credentials: [
    {
      type: "IDENTITY",
      configured: true,
      maskedKey: "••••XYZ7",
      secretSet: true,
      customerNumberSet: true,
      customerPasswordSet: true,
      identityType: 1,
      lastTestedAt: null,
      lastTestStatus: null,
      lastErrorCode: null,
    },
  ],
};

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("shipping providers page (F3C.1 Faz B)", () => {
  it("renders the empty state when no providers are configured", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [] });
    render(<ShippingProvidersPage />);
    expect(await screen.findByText("Henüz kargo sağlayıcı yok")).toBeTruthy();
  });

  it("lists configured providers with the DHL eCommerce label (never 'MNG')", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [DHL_CONFIG] });
    render(<ShippingProvidersPage />);
    expect(await screen.findByText("DHL eCommerce")).toBeTruthy();
    expect(screen.queryByText(/MNG/)).toBeNull();
  });

  it("opens the credentials modal with masked state and password-type secret inputs", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [DHL_CONFIG] });
    const user = userEvent.setup();
    render(<ShippingProvidersPage />);

    const credBtn = await screen.findByRole("button", { name: "Kimlik bilgileri" });
    await user.click(credBtn);

    // DHL credential bölümleri görünür.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Identity")).toBeTruthy();
    expect(within(dialog).getByText("Standard Command")).toBeTruthy();
    expect(within(dialog).getByText("Barcode Command")).toBeTruthy();

    // Masked gösterim + "tanımlı" durumu.
    expect(within(dialog).getByText("••••XYZ7")).toBeTruthy();
    expect(within(dialog).getAllByText("tanımlı").length).toBeGreaterThan(0);

    // Secret input'ları password tipinde (düz metin gösterilmez).
    const customerPw = within(dialog).getByLabelText("DHL Müşteri Şifresi") as HTMLInputElement;
    expect(customerPw.type).toBe("password");
    const clientSecret = within(dialog).getAllByLabelText("X-IBM Client Secret")[0] as HTMLInputElement;
    expect(clientSecret.type).toBe("password");
  });

  it("shows the live-operations-disabled warning for a DHL provider's credentials", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [DHL_CONFIG] });
    const user = userEvent.setup();
    render(<ShippingProvidersPage />);
    await user.click(await screen.findByRole("button", { name: "Kimlik bilgileri" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Canlı gönderi ve barkod oluşturma|Canlı gönderi\/barkod/)).toBeTruthy();
  });
});
