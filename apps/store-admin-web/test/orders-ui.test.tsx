// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@commerce-os/ui";
import OrdersPage from "../app/(app)/orders/page.js";

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
      listOrders: vi.fn(),
      getOrder: vi.fn(),
      createOrder: vi.fn(),
      placeOrder: vi.fn(),
      cancelOrder: vi.fn(),
      listInventory: vi.fn(),
    },
  };
});

vi.mock("../lib/client/api.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/client/api.js")>("../lib/client/api.js");
  return {
    storeApi: storeApiMock,
    UiError: MockUiError,
    // orderListQueryString gercek implementasyon; filtre query'si dogru uretilsin.
    orderListQueryString: actual.orderListQueryString,
  };
});

const { routerMock, searchParamsRef } = vi.hoisted(() => ({
  routerMock: { push: vi.fn(), replace: vi.fn() },
  searchParamsRef: { current: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useSearchParams: () => searchParamsRef.current,
  useParams: () => ({ id: "o1" }),
}));

function page(total: number, data: unknown[]) {
  return { data, pagination: { limit: 50, offset: 0, total } };
}

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
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  searchParamsRef.current = new URLSearchParams();
  cleanup();
});

describe("store-admin orders — list states", () => {
  it("shows a loading skeleton then the empty state in Turkish", async () => {
    storeApiMock.listOrders.mockResolvedValue(page(0, []));
    render(<OrdersPage />);
    expect(await screen.findByText("Henüz sipariş yok")).toBeTruthy();
    expect(screen.getByRole("button", { name: "İlk siparişi oluştur" })).toBeTruthy();
  });

  it("shows a localized error state with a retry action when the list fails", async () => {
    storeApiMock.listOrders.mockRejectedValue(new MockUiError("NETWORK"));
    render(<OrdersPage />);
    expect(await screen.findByText("Siparişler yüklenemedi.")).toBeTruthy();
    expect(
      screen.getByText("Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeTruthy();
  });

  it("renders the operations summary tiles computed from the live list", async () => {
    storeApiMock.listOrders.mockResolvedValue(
      page(2, [
        makeOrder({ status: "DRAFT" }),
        makeOrder({ id: "o2", orderNumber: "ORD-1002", status: "PLACED" }),
      ]),
    );
    render(<OrdersPage />);

    await screen.findByText("ORD-1001");
    expect(screen.getByText("Toplam sipariş")).toBeTruthy();
    expect(screen.getByText("İşlemde")).toBeTruthy();
    expect(screen.getByText("Toplam ciro")).toBeTruthy();
    // "Taslak" hem tile etiketi hem satir rozeti olabilir; en az bir kez gorunur.
    expect(screen.getAllByText("Taslak").length).toBeGreaterThan(0);
  });

  it("renders order/payment/fulfillment status badges in Turkish without invalid DOM nesting", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    storeApiMock.listOrders.mockResolvedValue(
      page(1, [makeOrder({ status: "PLACED", paymentStatus: "PAID", fulfillmentStatus: "PARTIAL" })]),
    );
    render(<OrdersPage />);

    await screen.findByText("ORD-1001");
    // Filtre dropdown'ları aynı etiketleri <option> olarak da taşır; rozetler <span>.
    expect(screen.getByText("Sipariş verildi", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Ödendi", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Kısmi", { selector: "span" })).toBeTruthy();

    const nesting = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes("validateDOMNesting"),
    );
    expect(nesting).toEqual([]);
    consoleError.mockRestore();
  });

  it("renders status badges in English under an en locale", async () => {
    storeApiMock.listOrders.mockResolvedValue(
      page(1, [makeOrder({ status: "PLACED", paymentStatus: "PAID", fulfillmentStatus: "FULFILLED" })]),
    );
    render(
      <LocaleProvider locale="en">
        <OrdersPage />
      </LocaleProvider>,
    );
    await screen.findByText("ORD-1001");
    // Rozetler <span>; aynı etiketler filtre <option>'larında da bulunur.
    expect(screen.getByText("Placed", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Paid", { selector: "span" })).toBeTruthy();
    // En az bir "Fulfilled" rozeti (karşılama) görünür.
    expect(screen.getAllByText("Fulfilled", { selector: "span" }).length).toBeGreaterThan(0);
  });

  // TODO-136 — Kargo kaydı (ORDER_CREATED) oluşturulmuş sipariş, karşılama rozetinde
  // "Hazırlanıyor"/eski metin DEĞİL "Kargonun Alınması Bekleniyor" göstermeli.
  it("renders prepared-shipment (ORDER_CREATED) fulfillment badge as 'Kargonun Alınması Bekleniyor'", async () => {
    storeApiMock.listOrders.mockResolvedValue(
      page(1, [makeOrder({ fulfillmentStatus: "UNFULFILLED", shipmentStatus: "ORDER_CREATED" })]),
    );
    render(<OrdersPage />);
    await screen.findByText("ORD-1001");
    expect(screen.getByText("Kargonun Alınması Bekleniyor", { selector: "span" })).toBeTruthy();
    // Eski yanıltıcı rozet metni ORDER_CREATED için gösterilmemeli.
    expect(screen.queryByText("Gönderi oluşturuldu", { selector: "span" })).toBeNull();
    expect(screen.queryByText("Hazırlanıyor", { selector: "span" })).toBeNull();
  });

  // TODO-136 — Barkod/etiket hazır (LABEL_CREATED) sipariş "Kargo İçin Paketlendi".
  it("renders label-ready (LABEL_CREATED) fulfillment badge as 'Kargo İçin Paketlendi'", async () => {
    storeApiMock.listOrders.mockResolvedValue(
      page(1, [makeOrder({ fulfillmentStatus: "UNFULFILLED", shipmentStatus: "LABEL_CREATED" })]),
    );
    render(<OrdersPage />);
    await screen.findByText("ORD-1001");
    expect(screen.getByText("Kargo İçin Paketlendi", { selector: "span" })).toBeTruthy();
  });

  // TODO-136 — Kargo kaydı olmayan sipariş rozeti "Hazırlanıyor" göstermeli.
  it("renders 'Hazırlanıyor' when the order has no shipment", async () => {
    storeApiMock.listOrders.mockResolvedValue(
      page(1, [makeOrder({ fulfillmentStatus: "UNFULFILLED", shipmentStatus: null })]),
    );
    render(<OrdersPage />);
    await screen.findByText("ORD-1001");
    expect(screen.getByText("Hazırlanıyor", { selector: "span" })).toBeTruthy();
    expect(screen.queryByText("Kargonun Alınması Bekleniyor", { selector: "span" })).toBeNull();
  });

  // TODO-135/136 — Yolda (IN_TRANSIT) durumu değişmeden yansımalı ("Yolda").
  it("renders IN_TRANSIT shipment as 'Yolda'", async () => {
    storeApiMock.listOrders.mockResolvedValue(
      page(1, [makeOrder({ fulfillmentStatus: "UNFULFILLED", shipmentStatus: "IN_TRANSIT" })]),
    );
    render(<OrdersPage />);
    await screen.findByText("ORD-1001");
    expect(screen.getByText("Yolda", { selector: "span" })).toBeTruthy();
    expect(screen.queryByText("Hazırlanıyor", { selector: "span" })).toBeNull();
  });
});

describe("store-admin orders — filters (TODO-073)", () => {
  it("loads with an empty query by default and shows all orders", async () => {
    storeApiMock.listOrders.mockResolvedValue(page(1, [makeOrder()]));
    render(<OrdersPage />);
    await screen.findByText("ORD-1001");
    expect(storeApiMock.listOrders).toHaveBeenCalledWith({});
  });

  it("drives the API query and the active summary from URL params on mount", async () => {
    searchParamsRef.current = new URLSearchParams("paymentStatus=PAID");
    storeApiMock.listOrders.mockResolvedValue(page(1, [makeOrder({ paymentStatus: "PAID" })]));
    render(<OrdersPage />);
    await screen.findByText("ORD-1001");
    expect(storeApiMock.listOrders).toHaveBeenCalledWith({ paymentStatus: "PAID" });
    expect(screen.getByText("1 filtre etkin")).toBeTruthy();
  });

  it("applies the payment status filter to the URL via Filtrele", async () => {
    storeApiMock.listOrders.mockResolvedValue(page(1, [makeOrder()]));
    const user = userEvent.setup();
    render(<OrdersPage />);
    await screen.findByText("ORD-1001");

    await user.selectOptions(screen.getByLabelText("Ödeme durumu"), "PAID");
    await user.click(screen.getByRole("button", { name: "Filtrele" }));
    expect(routerMock.replace).toHaveBeenCalledWith("/orders?paymentStatus=PAID");
  });

  it("searches by customer/email/order number via Filtrele", async () => {
    storeApiMock.listOrders.mockResolvedValue(page(1, [makeOrder()]));
    const user = userEvent.setup();
    render(<OrdersPage />);
    await screen.findByText("ORD-1001");

    await user.type(screen.getByLabelText("Ara"), "ahmet");
    await user.click(screen.getByRole("button", { name: "Filtrele" }));
    expect(routerMock.replace).toHaveBeenCalledWith("/orders?search=ahmet");
  });

  it("combines multiple filters into the URL query", async () => {
    storeApiMock.listOrders.mockResolvedValue(page(1, [makeOrder()]));
    const user = userEvent.setup();
    render(<OrdersPage />);
    await screen.findByText("ORD-1001");

    await user.selectOptions(screen.getByLabelText("Sipariş durumu"), "PLACED");
    await user.selectOptions(screen.getByLabelText("Ödeme durumu"), "PAID");
    await user.click(screen.getByRole("button", { name: "Filtrele" }));
    expect(routerMock.replace).toHaveBeenCalledWith("/orders?status=PLACED&paymentStatus=PAID");
  });

  it("clears filters and navigates back to /orders", async () => {
    searchParamsRef.current = new URLSearchParams("status=CANCELLED");
    // Dolu sonuç: yalnız filtre bar'daki "Temizle" görünür (boş durum CTA'sı değil).
    storeApiMock.listOrders.mockResolvedValue(page(1, [makeOrder({ status: "CANCELLED" })]));
    const user = userEvent.setup();
    render(<OrdersPage />);
    await screen.findByText("ORD-1001");

    await user.click(screen.getByRole("button", { name: "Temizle" }));
    expect(routerMock.replace).toHaveBeenCalledWith("/orders");
  });

  it("shows a filter-aware empty state when no order matches", async () => {
    searchParamsRef.current = new URLSearchParams("status=CANCELLED");
    storeApiMock.listOrders.mockResolvedValue(page(0, []));
    render(<OrdersPage />);
    expect(await screen.findByText("Bu filtrelere uyan sipariş bulunamadı.")).toBeTruthy();
    // Filtresiz "ilk siparişi oluştur" boş durumu burada GÖRÜNMEMELI.
    expect(screen.queryByText("Henüz sipariş yok")).toBeNull();
  });
});

describe("store-admin orders — lifecycle actions", () => {
  it("shows Place for a DRAFT order and triggers placeOrder", async () => {
    storeApiMock.listOrders.mockResolvedValue(page(1, [makeOrder({ status: "DRAFT" })]));
    storeApiMock.placeOrder.mockResolvedValue(makeOrder({ status: "PLACED", placedAt: new Date().toISOString() }));
    const user = userEvent.setup();

    render(<OrdersPage />);
    await screen.findByText("ORD-1001");
    expect(screen.queryByRole("button", { name: "İptal et" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Siparişi ver" }));
    await waitFor(() => expect(storeApiMock.placeOrder).toHaveBeenCalledWith("o1"));
  });

  it("shows Cancel for a PLACED order and triggers cancelOrder", async () => {
    storeApiMock.listOrders.mockResolvedValue(
      page(1, [makeOrder({ status: "PLACED", placedAt: new Date().toISOString() })]),
    );
    storeApiMock.cancelOrder.mockResolvedValue(makeOrder({ status: "CANCELLED" }));
    const user = userEvent.setup();

    render(<OrdersPage />);
    await screen.findByText("ORD-1001");
    expect(screen.queryByRole("button", { name: "Siparişi ver" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "İptal et" }));
    await waitFor(() => expect(storeApiMock.cancelOrder).toHaveBeenCalledWith("o1"));
  });

  it("hides both place and cancel actions for a CANCELLED order", async () => {
    storeApiMock.listOrders.mockResolvedValue(
      page(1, [makeOrder({ status: "CANCELLED", cancelledAt: new Date().toISOString() })]),
    );
    render(<OrdersPage />);
    await screen.findByText("ORD-1001");
    expect(screen.queryByRole("button", { name: "Siparişi ver" })).toBeNull();
    expect(screen.queryByRole("button", { name: "İptal et" })).toBeNull();
    expect(screen.getByRole("link", { name: "Detay" })).toBeTruthy();
  });

  it("shows a localized error when a place action fails", async () => {
    storeApiMock.listOrders.mockResolvedValue(page(1, [makeOrder({ status: "DRAFT" })]));
    storeApiMock.placeOrder.mockRejectedValue(new MockUiError("ORDER_INSUFFICIENT_STOCK"));
    const user = userEvent.setup();

    render(<OrdersPage />);
    await screen.findByText("ORD-1001");
    await user.click(screen.getByRole("button", { name: "Siparişi ver" }));

    expect(
      await screen.findByText("Yeterli stok yok. Sipariş için stok ayrılamadı."),
    ).toBeTruthy();
  });
});

describe("store-admin orders — detail is a route, not a modal", () => {
  it("renders a Details link to /orders/[id] and never opens a detail modal", async () => {
    storeApiMock.listOrders.mockResolvedValue(page(1, [makeOrder()]));

    render(<OrdersPage />);
    await screen.findByText("ORD-1001");

    const link = screen.getByRole("link", { name: "Detay" });
    expect(link.getAttribute("href")).toBe("/orders/o1");

    // Detay artik modal degil; liste hicbir dialog acmamali.
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("store-admin orders — create draft", () => {
  it("creates a draft order from a stocked variant and opens its detail", async () => {
    storeApiMock.listOrders.mockResolvedValue(page(0, []));
    storeApiMock.listInventory.mockResolvedValue(
      page(1, [
        {
          id: "i1",
          storeId: "s1",
          variantId: "v1",
          productId: "p1",
          sku: "TSH-BLK-M",
          title: "Siyah / M",
          quantityOnHand: 10,
          quantityReserved: 0,
          quantityAvailable: 10,
          lowStockThreshold: null,
          updatedAt: new Date().toISOString(),
        },
      ]),
    );
    storeApiMock.createOrder.mockResolvedValue(makeOrder({ id: "o9", orderNumber: "ORD-9" }));
    storeApiMock.getOrder.mockResolvedValue(makeOrder({ id: "o9", orderNumber: "ORD-9" }));
    const user = userEvent.setup();

    render(<OrdersPage />);
    await user.click(await screen.findByRole("button", { name: "İlk siparişi oluştur" }));

    await user.type(screen.getByLabelText("Müşteri e-postası"), "buyer@example.local");
    await user.selectOptions(screen.getByLabelText("Varyant"), "v1");
    await user.click(screen.getByRole("button", { name: "Taslak oluştur" }));

    await waitFor(() => expect(storeApiMock.createOrder).toHaveBeenCalledTimes(1));
    expect(storeApiMock.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: "buyer@example.local",
        currency: "TRY",
        lines: [{ variantId: "v1", quantity: 1 }],
        addresses: [],
      }),
    );
  });

  it("blocks submit and shows a localized message when no variant is selected", async () => {
    storeApiMock.listOrders.mockResolvedValue(page(0, []));
    storeApiMock.listInventory.mockResolvedValue(
      page(1, [
        {
          id: "i1",
          storeId: "s1",
          variantId: "v1",
          productId: "p1",
          sku: "TSH-BLK-M",
          title: "Siyah / M",
          quantityOnHand: 10,
          quantityReserved: 0,
          quantityAvailable: 10,
          lowStockThreshold: null,
          updatedAt: new Date().toISOString(),
        },
      ]),
    );
    const user = userEvent.setup();

    render(<OrdersPage />);
    await user.click(await screen.findByRole("button", { name: "İlk siparişi oluştur" }));
    await user.type(screen.getByLabelText("Müşteri e-postası"), "buyer@example.local");
    await user.click(screen.getByRole("button", { name: "Taslak oluştur" }));

    expect(await screen.findByText("Her kalem için bir varyant seçin.")).toBeTruthy();
    expect(storeApiMock.createOrder).not.toHaveBeenCalled();
  });
});
