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

  // TODO-136 — Kargo kaydı (ORDER_CREATED) oluşturulmuş siparişin hero/başlık karşılama
  // rozeti "Hazırlanıyor"/"Gönderilmedi" DEĞİL "Kargonun Alınması Bekleniyor" göstermeli.
  it("renders the hero fulfillment badge as 'Kargonun Alınması Bekleniyor' when a shipment is prepared", async () => {
    storeApiMock.getOrder.mockResolvedValue(
      makeOrder({ fulfillmentStatus: "UNFULFILLED", shipmentStatus: "ORDER_CREATED" }),
    );
    render(<OrderDetailPage />);
    await screen.findByText("Sipariş ORD-1001");
    expect(screen.getByText("Kargonun Alınması Bekleniyor", { selector: "span" })).toBeTruthy();
    expect(screen.queryByText("Hazırlanıyor", { selector: "span" })).toBeNull();
    // Eski yanıltıcı metin ORDER_CREATED için gösterilmemeli.
    expect(screen.queryByText("Gönderi oluşturuldu", { selector: "span" })).toBeNull();
  });

  // TODO-136 — Barkod/etiket hazır (LABEL_CREATED) sipariş "Kargo İçin Paketlendi".
  it("renders the hero fulfillment badge as 'Kargo İçin Paketlendi' when the label is ready", async () => {
    storeApiMock.getOrder.mockResolvedValue(
      makeOrder({ fulfillmentStatus: "UNFULFILLED", shipmentStatus: "LABEL_CREATED" }),
    );
    render(<OrderDetailPage />);
    await screen.findByText("Sipariş ORD-1001");
    expect(screen.getByText("Kargo İçin Paketlendi", { selector: "span" })).toBeTruthy();
  });

  // TODO-136 — Kargo kaydı olmayan siparişin hero rozeti "Hazırlanıyor".
  it("renders the hero fulfillment badge as 'Hazırlanıyor' when there is no shipment", async () => {
    storeApiMock.getOrder.mockResolvedValue(
      makeOrder({ fulfillmentStatus: "UNFULFILLED", shipmentStatus: null }),
    );
    render(<OrderDetailPage />);
    await screen.findByText("Sipariş ORD-1001");
    expect(screen.getByText("Hazırlanıyor", { selector: "span" })).toBeTruthy();
    expect(screen.queryByText("Kargonun Alınması Bekleniyor", { selector: "span" })).toBeNull();
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

    // Ödeme paneli: maskeli kart (son 4), işlem (transaction) no, taksit özeti.
    expect(screen.getByText("Ödeme")).toBeTruthy();
    expect(screen.getByText(/0008/)).toBeTruthy();
    expect(screen.getByText("mock_pa1")).toBeTruthy();
    // Taksit özeti: "3 taksit × ₺…" + toplam + vade farksız (tek "3 taksit" değil).
    expect(screen.getByText(/3 taksit ×/)).toBeTruthy();
    expect(screen.getByText(/Vade farksız/)).toBeTruthy();

    // Olay açıklaması TR'ye çevrilmiş; ham İngilizce DB mesajı görünmemeli.
    expect(screen.getByText("Sipariş verildi ve stok rezerve edildi.")).toBeTruthy();
    expect(screen.queryByText("Order placed and inventory reserved.")).toBeNull();

    // Full PAN hiçbir yerde görünmemeli.
    expect(document.body.textContent ?? "").not.toContain("5528790000000008");
  });

  it("shows 3D Secure verification state in the payment panel", async () => {
    storeApiMock.getOrder.mockResolvedValue(
      makeOrder({
        status: "PLACED",
        paymentStatus: "PAID",
        paymentAttempts: [
          {
            id: "pa-3ds",
            provider: "MOCK",
            mode: "TEST",
            method: "CARD",
            amount: 39980,
            currency: "TRY",
            status: "PAID",
            threeDsApplied: true,
            scenario: "three_ds_required",
            installmentCount: 1,
            cardBrand: "MASTERCARD",
            cardLast4: "0016",
            providerReference: "mock_pa3ds",
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
    // 3DS uygulanan denemede "3D Secure" + "Doğrulandı" görünür.
    expect(screen.getByText("3D Secure")).toBeTruthy();
    expect(screen.getByText("Doğrulandı")).toBeTruthy();
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

// F4A.2 — Kampanya/Kupon paneli: OrderDiscount SNAPSHOT satirlarindan beslenir.
// Indirimsiz siparis notr metin gosterir; kupon/otomatik satirlar kampanya adi,
// tip, deger, uygulanan tutar ve oncesi/sonrasi toplamlarla listelenir.
describe("store-admin order detail — campaign/coupon panel (F4A.2)", () => {
  function renderPage() {
    return render(
      <LocaleProvider locale="tr">
        <OrderDetailPage />
      </LocaleProvider>,
    );
  }

  it("shows the neutral message when the order has no discounts", async () => {
    storeApiMock.getOrder.mockResolvedValue(makeOrder({ discounts: [] }));
    renderPage();
    expect(await screen.findByText("Kampanya / Kupon Bilgisi")).toBeTruthy();
    expect(screen.getByText("Bu siparişte kampanya veya kupon kullanılmadı.")).toBeTruthy();
  });

  it("renders coupon discount snapshot with code, amounts and totals", async () => {
    storeApiMock.getOrder.mockResolvedValue(
      makeOrder({
        subtotalAmount: 150000,
        discountAmount: 25000,
        shippingAmount: 5000,
        totalAmount: 130000,
        discounts: [
          {
            id: "d1",
            campaignId: "camp_1",
            code: "TEST250",
            label: "TEST250 Kuponu",
            discountType: "FIXED_AMOUNT",
            discountValue: 25000,
            discountAmountMinor: 25000,
            createdAt: new Date("2026-07-01T09:00:00.000Z").toISOString(),
          },
        ],
      }),
    );
    renderPage();
    expect(await screen.findByText("TEST250 Kuponu")).toBeTruthy();
    expect(screen.getByText("TEST250")).toBeTruthy();
    // "Kupon kodu" hem tip rozetinde hem kod satiri etiketinde gorunebilir.
    expect(screen.getAllByText("Kupon kodu").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("İndirim öncesi ara toplam")).toBeTruthy();
    expect(screen.getByText("İndirim sonrası ara toplam")).toBeTruthy();
    expect(screen.getByText("Bu bilgiler sipariş anındaki indirim kaydıdır.")).toBeTruthy();
    // Snapshot degerleri: −₺250 indirim, ₺1.250 sonrasi.
    expect(screen.getByText("−₺250,00")).toBeTruthy();
    expect(screen.getByText("₺1.250,00")).toBeTruthy();
  });

  it("renders automatic campaign snapshot without a coupon code row", async () => {
    storeApiMock.getOrder.mockResolvedValue(
      makeOrder({
        subtotalAmount: 100000,
        discountAmount: 10000,
        totalAmount: 90000,
        discounts: [
          {
            id: "d2",
            campaignId: "camp_2",
            code: null,
            label: "Sepette %10 İndirim",
            discountType: "PERCENT",
            discountValue: 10,
            discountAmountMinor: 10000,
            createdAt: new Date("2026-07-01T09:00:00.000Z").toISOString(),
          },
        ],
      }),
    );
    renderPage();
    expect(await screen.findByText("Sepette %10 İndirim")).toBeTruthy();
    expect(screen.getByText("Otomatik kampanya")).toBeTruthy();
    expect(screen.getByText("%10")).toBeTruthy();
    expect(screen.queryByText("TEST250")).toBeNull();
  });

  it("renders multiple discount lines with the combined total", async () => {
    storeApiMock.getOrder.mockResolvedValue(
      makeOrder({
        subtotalAmount: 200000,
        discountAmount: 35000,
        totalAmount: 165000,
        discounts: [
          {
            id: "d1",
            campaignId: "camp_1",
            code: "TEST250",
            label: "TEST250 Kuponu",
            discountType: "FIXED_AMOUNT",
            discountValue: 25000,
            discountAmountMinor: 25000,
            createdAt: new Date("2026-07-01T09:00:00.000Z").toISOString(),
          },
          {
            id: "d2",
            campaignId: "camp_2",
            code: null,
            label: "Sepette %5 İndirim",
            discountType: "PERCENT",
            discountValue: 5,
            discountAmountMinor: 10000,
            createdAt: new Date("2026-07-01T09:00:00.000Z").toISOString(),
          },
        ],
      }),
    );
    renderPage();
    expect(await screen.findByText("TEST250 Kuponu")).toBeTruthy();
    expect(screen.getByText("Sepette %5 İndirim")).toBeTruthy();
    // Toplam indirim iki satirin toplamidir (snapshot'tan; yeniden hesap yok).
    expect(screen.getByText("−₺350,00")).toBeTruthy();
  });
});
