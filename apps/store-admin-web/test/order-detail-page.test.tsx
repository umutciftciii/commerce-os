// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@commerce-os/ui";
import OrderDetailPage from "../app/(app)/orders/[id]/page.js";

const { storeApiMock, MockUiError } = vi.hoisted(() => {
  class MockUiError extends Error {
    readonly code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    MockUiError,
    storeApiMock: {
      getOrder: vi.fn(),
      placeOrder: vi.fn(),
      cancelOrder: vi.fn(),
    },
  };
});

vi.mock("../lib/client/api.js", () => ({
  storeApi: storeApiMock,
  UiError: MockUiError,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "o1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "l1",
    storeId: "s1",
    orderId: "o1",
    productId: "p1",
    variantId: "v1",
    sku: "TSH-BLK-M",
    title: "Pamuklu Tişört",
    variantTitle: "Siyah / M",
    quantity: 2,
    unitPriceAmount: 19990,
    totalAmount: 39980,
    currency: "TRY",
    createdAt: new Date("2026-06-01T10:00:00.000Z").toISOString(),
    ...overrides,
  };
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    storeId: "s1",
    orderNumber: "ORD-1001",
    customerId: null,
    customerEmail: "buyer@example.local",
    currency: "TRY",
    status: "DRAFT",
    paymentStatus: "UNPAID",
    fulfillmentStatus: "UNFULFILLED",
    subtotalAmount: 39980,
    discountAmount: 0,
    shippingAmount: 0,
    taxAmount: 0,
    totalAmount: 39980,
    placedAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: new Date("2026-06-01T10:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-06-01T10:00:00.000Z").toISOString(),
    lines: [makeLine()],
    addresses: [],
    reservations: [],
    events: [],
    paymentAttempts: [],
    billing: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("store-admin order detail — dedicated route page", () => {
  it("renders lines, the money summary and an event timeline without a modal dialog", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    storeApiMock.getOrder.mockResolvedValue(
      makeOrder({
        events: [
          {
            id: "e1",
            storeId: "s1",
            orderId: "o1",
            type: "ORDER_CREATED",
            message: null,
            metadata: null,
            actorUserId: null,
            createdAt: new Date("2026-06-01T10:00:00.000Z").toISOString(),
          },
        ],
      }),
    );

    render(<OrderDetailPage />);

    await screen.findByText("Sipariş ORD-1001");
    expect(screen.getByText("Sipariş kalemleri")).toBeTruthy();
    expect(screen.getByText("Pamuklu Tişört")).toBeTruthy();
    expect(screen.getByText("TSH-BLK-M")).toBeTruthy();
    expect(screen.getByText("Tutar özeti")).toBeTruthy();
    expect(screen.getByText("ORDER_CREATED")).toBeTruthy();

    // Operasyon ozeti tile'lari (ust serit).
    expect(screen.getByText("Kalem sayısı")).toBeTruthy();
    expect(screen.getByText("Rezervasyon durumu")).toBeTruthy();
    // Sag baglam rayi: musteri bilgileri + kunye kartlari.
    expect(screen.getByText("Müşteri bilgileri")).toBeTruthy();
    expect(screen.getByText("Künye")).toBeTruthy();

    // Detay artik route; modal acilmamali.
    expect(screen.queryByRole("dialog")).toBeNull();
    // Listeye don linki bulunmali.
    expect(screen.getByRole("link", { name: /Siparişlere dön/ }).getAttribute("href")).toBe(
      "/orders",
    );

    const nesting = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes("validateDOMNesting"),
    );
    expect(nesting).toEqual([]);
    consoleError.mockRestore();
  });

  it("shows the payment observability panel and localizes order-history events in Turkish", async () => {
    storeApiMock.getOrder.mockResolvedValue(
      makeOrder({
        paymentStatus: "PAID",
        events: [
          {
            id: "e1",
            storeId: "s1",
            orderId: "o1",
            type: "ORDER_PLACED",
            // DB'de İngilizce saklı; UI render'da TR'ye çevrilmeli.
            message: "Order placed and inventory reserved.",
            metadata: null,
            actorUserId: null,
            createdAt: new Date("2026-06-01T10:00:00.000Z").toISOString(),
          },
        ],
        paymentAttempts: [
          {
            id: "pa1",
            provider: "MOCK",
            mode: "TEST",
            method: "CARD",
            amount: 39980,
            currency: "TRY",
            status: "PAID",
            threeDsApplied: false,
            scenario: "success",
            installmentCount: 3,
            cardBrand: "MASTERCARD",
            cardLast4: "0008",
            providerReference: "mock_pa1",
            failureCode: null,
            failureMessage: null,
            paidAt: new Date("2026-06-01T10:05:00.000Z").toISOString(),
            failedAt: null,
            createdAt: new Date("2026-06-01T10:05:00.000Z").toISOString(),
            updatedAt: new Date("2026-06-01T10:05:00.000Z").toISOString(),
          },
        ],
      }),
    );

    render(<OrderDetailPage />);
    await screen.findByText("Sipariş ORD-1001");

    // Ödeme paneli: maskeli kart (son 4), işlem (transaction) no, taksit.
    expect(screen.getByText("Ödeme")).toBeTruthy();
    expect(screen.getByText(/0008/)).toBeTruthy();
    expect(screen.getByText("mock_pa1")).toBeTruthy();
    expect(screen.getByText("3 taksit")).toBeTruthy();

    // Olay açıklaması TR'ye çevrilmiş; ham İngilizce DB mesajı görünmemeli.
    expect(screen.getByText("Sipariş verildi ve stok rezerve edildi.")).toBeTruthy();
    expect(screen.queryByText("Order placed and inventory reserved.")).toBeNull();

    // Full PAN hiçbir yerde görünmemeli.
    expect(document.body.textContent ?? "").not.toContain("5528790000000008");
  });

  it("shows Place for a DRAFT order and triggers placeOrder", async () => {
    storeApiMock.getOrder.mockResolvedValue(makeOrder({ status: "DRAFT" }));
    storeApiMock.placeOrder.mockResolvedValue(makeOrder({ status: "PLACED" }));
    const user = userEvent.setup();

    render(<OrderDetailPage />);
    await screen.findByText("Sipariş ORD-1001");
    expect(screen.queryByRole("button", { name: "İptal et" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Siparişi ver" }));
    await waitFor(() => expect(storeApiMock.placeOrder).toHaveBeenCalledWith("o1"));
  });

  it("shows Cancel for a PLACED order and triggers cancelOrder", async () => {
    storeApiMock.getOrder.mockResolvedValue(
      makeOrder({ status: "PLACED", placedAt: new Date().toISOString() }),
    );
    storeApiMock.cancelOrder.mockResolvedValue(makeOrder({ status: "CANCELLED" }));
    const user = userEvent.setup();

    render(<OrderDetailPage />);
    await screen.findByText("Sipariş ORD-1001");
    expect(screen.queryByRole("button", { name: "Siparişi ver" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "İptal et" }));
    await waitFor(() => expect(storeApiMock.cancelOrder).toHaveBeenCalledWith("o1"));
  });

  it("hides both lifecycle actions for a CANCELLED order", async () => {
    storeApiMock.getOrder.mockResolvedValue(
      makeOrder({ status: "CANCELLED", cancelledAt: new Date().toISOString() }),
    );

    render(<OrderDetailPage />);
    await screen.findByText("Sipariş ORD-1001");
    expect(screen.queryByRole("button", { name: "Siparişi ver" })).toBeNull();
    expect(screen.queryByRole("button", { name: "İptal et" })).toBeNull();
  });

  it("renders the detail page in English under an en locale", async () => {
    storeApiMock.getOrder.mockResolvedValue(makeOrder({ status: "DRAFT" }));

    render(
      <LocaleProvider locale="en">
        <OrderDetailPage />
      </LocaleProvider>,
    );

    await screen.findByText("Order ORD-1001");
    expect(screen.getByText("Order lines")).toBeTruthy();
    expect(screen.getByText("Amount summary")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Place order" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to orders/ })).toBeTruthy();
  });
});
