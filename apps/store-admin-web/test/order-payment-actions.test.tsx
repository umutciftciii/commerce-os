// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import { OrderPaymentActions } from "../app/(app)/orders/[id]/order-payment-actions.js";

const { storeApiMock } = vi.hoisted(() => ({
  storeApiMock: {
    getOrderPayment: vi.fn(),
    createOrderPaymentLink: vi.fn(),
    regenerateOrderPaymentLink: vi.fn(),
    emailOrderPaymentLink: vi.fn(),
    recordManualPayment: vi.fn(),
  },
}));

vi.mock("../lib/client/api.js", () => ({ storeApi: storeApiMock }));

const d = getDictionary("tr").storeAdmin.orders.detail.recovery;

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "o1",
    orderNumber: "OS-000001",
    currency: "TRY",
    paymentStatus: "UNPAID",
    payableMinor: 50000,
    capturedMinor: 0,
    remainingMinor: 50000,
    canStartCollection: true,
    providersConfigured: false,
    emailDeliveryConfigured: false,
    availableProviders: [],
    manualMethods: ["BANK_TRANSFER", "CASH", "POS", "OTHER"],
    activeAttempt: null,
    attempts: [],
    ...overrides,
  };
}

function renderPanel() {
  return render(
    <LocaleProvider locale="tr">
      <OrderPaymentActions orderId="o1" d={d} locale="tr" onChanged={() => {}} />
    </LocaleProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OrderPaymentActions", () => {
  it("aktif sağlayıcı yoksa 'sağlayıcı tanımlayın' mesajını gösterir", async () => {
    storeApiMock.getOrderPayment.mockResolvedValue(baseState());
    renderPanel();
    await waitFor(() => expect(screen.getByText(d.noProvider)).toBeTruthy());
  });

  it("uygun sağlayıcı varken 'Ödeme bağlantısı oluştur' aksiyonunu gösterir", async () => {
    storeApiMock.getOrderPayment.mockResolvedValue(
      baseState({
        providersConfigured: true,
        availableProviders: [
          {
            providerConfigId: "ppc1",
            provider: "MOCK",
            displayName: "Mock",
            mode: "TEST",
            supportedMethods: ["CARD"],
            installmentEnabled: false,
          },
        ],
      }),
    );
    renderPanel();
    await waitFor(() => expect(screen.getByText(d.createLink)).toBeTruthy());
  });

  it("e-posta teslimatı yapılandırılmamışsa 'Gönder' butonu disabled + açıklama gösterir (sahte gönderim yok)", async () => {
    storeApiMock.getOrderPayment.mockResolvedValue(
      baseState({
        providersConfigured: true,
        emailDeliveryConfigured: false,
        activeAttempt: {
          id: "pa1",
          type: "ONLINE",
          provider: "MOCK",
          mode: "TEST",
          method: "CARD",
          amount: 50000,
          currency: "TRY",
          status: "CREATED",
          threeDsApplied: false,
          scenario: null,
          installmentCount: 1,
          cardBrand: null,
          cardLast4: null,
          providerReference: null,
          failureCode: null,
          failureMessage: null,
          paidAt: null,
          failedAt: null,
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          hasActiveLink: true,
          manualMethod: null,
          manualReference: null,
          manualNote: null,
          collectedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          paymentLinkUrl: "http://localhost:3001/pay/tok123",
          initiatedBy: null,
        },
      }),
    );
    renderPanel();
    await waitFor(() => expect(screen.getByText(d.emailNotConfigured)).toBeTruthy());
    const sendBtn = screen.getByRole("button", { name: d.sendEmail });
    expect((sendBtn as HTMLButtonElement).disabled).toBe(true);
    expect(storeApiMock.emailOrderPaymentLink).not.toHaveBeenCalled();
  });

  it("terminal (PAID) siparişte tahsilat aksiyonu göstermez, tahsil edildi mesajı verir", async () => {
    storeApiMock.getOrderPayment.mockResolvedValue(
      baseState({
        paymentStatus: "PAID",
        capturedMinor: 50000,
        remainingMinor: 0,
        canStartCollection: false,
      }),
    );
    renderPanel();
    await waitFor(() => expect(screen.getByText(d.settled)).toBeTruthy());
    expect(screen.queryByText(d.createLink)).toBeNull();
  });
});
