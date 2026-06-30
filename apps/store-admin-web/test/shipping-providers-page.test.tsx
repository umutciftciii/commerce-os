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

  it("shows 'not tested yet' for a configured provider that was never connection-tested", async () => {
    // DHL_CONFIG: credential dolu ama connectionStatus yok → UNTESTED.
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [DHL_CONFIG] });
    render(<ShippingProvidersPage />);
    expect(await screen.findByText("Henüz test edilmedi")).toBeTruthy();
  });

  it("shows 'no real API call was made' copy when the last test is HTTP_DISABLED", async () => {
    const httpDisabled = {
      ...DHL_CONFIG,
      lastTestStatus: "HTTP_DISABLED",
      lastTestedAt: "2026-06-29T10:00:00.000Z",
      credentialStatus: "CONFIGURED",
      connectionStatus: "HTTP_DISABLED",
      lastProviderHttpStatus: null,
      lastProviderTestType: "IDENTITY_TOKEN",
      lastProviderTestAt: "2026-06-29T10:00:00.000Z",
      lastProviderErrorCode: null,
    };
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [httpDisabled] });
    render(<ShippingProvidersPage />);
    // "Gercek API cagrisi yapilmadi" uyarisi + "Test edilmedi (HTTP kapalı)" rozeti.
    expect(await screen.findByText("Kimlik bilgileri kayıtlı; gerçek API çağrısı yapılmadı.")).toBeTruthy();
    expect(screen.getByText("Test edilmedi (HTTP kapalı)")).toBeTruthy();
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

  it("shows the provider-operation-permission-disabled warning (security-lock framing, no 'Canlı')", async () => {
    storeApiMock.listShippingProviders.mockResolvedValue({ data: [DHL_CONFIG] });
    const user = userEvent.setup();
    render(<ShippingProvidersPage />);
    await user.click(await screen.findByRole("button", { name: "Kimlik bilgileri" }));
    const dialog = await screen.findByRole("dialog");
    const note = within(dialog).getByText(/oluşturma izni kapalı/);
    expect(note).toBeTruthy();
    // Yanıltıcı "Canlı X oluşturma" çerçevesi kullanılmaz.
    expect((note.textContent ?? "").match(/Canlı (gönderi|barkod|alıcı)/)).toBeNull();
  });
});
