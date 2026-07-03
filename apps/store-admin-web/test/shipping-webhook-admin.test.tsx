// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ShippingProvidersPage from "../app/(app)/shipping/providers/page.js";

/**
 * TODO-128 — Webhook yönetim modalı testleri: URL/uyarı gösterimi, kopyala butonu,
 * rotate ile secret'ın YALNIZ BİR KEZ gösterilmesi + uyarı, rotate ÖNCESİ secret'ın
 * gösterilmemesi ve son olayların yalnız GÜVENLİ alanlarla render'ı.
 */

const { storeApiMock } = vi.hoisted(() => ({
  storeApiMock: {
    listShippingProviders: vi.fn(),
    createShippingProvider: vi.fn(),
    updateShippingProvider: vi.fn(),
    upsertShippingCredential: vi.fn(),
    deleteShippingCredential: vi.fn(),
    testShippingProvider: vi.fn(),
    getShippingWebhookInfo: vi.fn(),
    rotateShippingWebhook: vi.fn(),
  },
}));

vi.mock("../lib/client/api.js", () => ({ storeApi: storeApiMock }));

const CONFIG = {
  id: "spc_dhl",
  provider: "DHL_ECOMMERCE",
  mode: "TEST",
  status: "ENABLED",
  displayName: "DHL Kargo Test",
  logoUrl: null,
  logoAlt: null,
  allowRecipientCreate: false,
  allowOrderCreate: false,
  allowBarcodeCreate: false,
  allowLabelPurchase: false,
  lastTestedAt: null,
  lastTestStatus: null,
  lastErrorCode: null,
  webhookConfigured: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  credentials: [],
};

const WEBHOOK_URL = "https://api.example.com/public/shipping/webhooks/whk_token_abc";

const INFO_WITH_URL = {
  webhookConfigured: true,
  webhookUrl: WEBHOOK_URL,
  webhookBaseUrlConfigured: true,
  events: [
    {
      id: "wbi_1",
      provider: "DHL_ECOMMERCE",
      eventKey: "evt:abc-123",
      outcome: "ACCEPTED",
      shipmentId: "shp_1",
      statusCode: 5,
      statusText: "Teslim edildi",
      receivedAt: "2026-07-03T10:00:00.000Z",
    },
  ],
};

const clipboardWrite = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  storeApiMock.listShippingProviders.mockResolvedValue({ data: [CONFIG] });
  storeApiMock.getShippingWebhookInfo.mockResolvedValue(INFO_WITH_URL);
  Object.assign(navigator, { clipboard: { writeText: clipboardWrite } });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

async function openWebhookModal() {
  render(<ShippingProvidersPage />);
  const webhookBtn = await screen.findByRole("button", { name: "Webhook" });
  await userEvent.click(webhookBtn);
  return await screen.findByText("Webhook URL");
}

describe("shipping webhook admin modal (TODO-128)", () => {
  it("renders the webhook URL and a copy button when token + base URL exist", async () => {
    await openWebhookModal();
    expect(screen.getByText(WEBHOOK_URL)).toBeTruthy();
    expect(screen.getByRole("button", { name: "URL'yi Kopyala" })).toBeTruthy();
  });

  it("copies the URL to clipboard", async () => {
    await openWebhookModal();
    await userEvent.click(screen.getByRole("button", { name: "URL'yi Kopyala" }));
    expect(clipboardWrite).toHaveBeenCalledWith(WEBHOOK_URL);
  });

  it("shows a warning when public base URL is not configured (no URL)", async () => {
    storeApiMock.getShippingWebhookInfo.mockResolvedValue({
      webhookConfigured: true,
      webhookUrl: null,
      webhookBaseUrlConfigured: false,
      events: [],
    });
    render(<ShippingProvidersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Webhook" }));
    expect(
      await screen.findByText("Public base URL ayarlanmadığı için webhook URL oluşturulamıyor."),
    ).toBeTruthy();
    expect(screen.queryByText("Webhook URL")).toBeNull();
  });

  it("does NOT reveal a secret before rotation", async () => {
    await openWebhookModal();
    expect(screen.queryByText("Yeni Secret")).toBeNull();
    expect(screen.queryByText(/yalnızca bir kez gösterilir/)).toBeNull();
  });

  it("rotates the secret and displays it once with a one-time warning", async () => {
    storeApiMock.rotateShippingWebhook.mockResolvedValue({
      webhookPath: "/public/shipping/webhooks/whk_new",
      webhookSecret: "SECRET_SHOWN_ONCE_123",
      rotatedAt: "2026-07-04T00:00:00.000Z",
    });
    await openWebhookModal();
    await userEvent.click(screen.getByRole("button", { name: "Secret'ı Yenile" }));

    await waitFor(() => expect(storeApiMock.rotateShippingWebhook).toHaveBeenCalledWith("spc_dhl"));
    expect(await screen.findByText("SECRET_SHOWN_ONCE_123")).toBeTruthy();
    expect(screen.getByText("Yeni Secret")).toBeTruthy();
    expect(
      screen.getByText("Bu secret yalnızca bir kez gösterilir. Kaydetmeden kapatırsanız tekrar görüntülenemez."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Secret'ı Kopyala" })).toBeTruthy();
  });

  it("renders recent webhook events with only safe fields (no payload hash / secret)", async () => {
    const { container } = render(<ShippingProvidersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Webhook" }));
    expect(await screen.findByText("Son Webhook Olayları")).toBeTruthy();
    // Güvenli alanlar görünür: outcome badge + eventKey.
    expect(screen.getByText("Başarılı")).toBeTruthy();
    expect(screen.getByText(/evt:abc-123/)).toBeTruthy();
    // Hassas alanlar hiçbir yerde yok.
    expect(container.innerHTML).not.toContain("payloadHash");
    expect(container.innerHTML).not.toContain("webhookSecret");
    expect(container.innerHTML).not.toContain("signature");
  });
});
