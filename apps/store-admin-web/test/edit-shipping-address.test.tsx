// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditShippingAddress } from "../app/(app)/orders/[id]/edit-shipping-address.js";

/**
 * TODO-139 — Sipariş teslimat adresi snapshot düzenleme paneli UI testleri.
 * Güvenli durumda düzenleme aksiyonu görünür; kilitli durumda net TR kopya; CBS dropdown'ları;
 * providerResent=false sınırlama kopyası (sahte başarı yok).
 */

const { storeApiMock, UiErrorMock } = vi.hoisted(() => {
  class UiErrorMock extends Error {
    constructor(public code: string) {
      super(code);
      this.name = "UiError";
    }
  }
  return {
    storeApiMock: {
      getCbsCities: vi.fn(),
      getCbsDistricts: vi.fn(),
      updateOrderShippingAddress: vi.fn(),
    },
    UiErrorMock,
  };
});

vi.mock("../lib/client/api.js", () => ({ storeApi: storeApiMock, UiError: UiErrorMock }));

const ORDER = {
  id: "o1",
  orderNumber: "OS-1",
  currency: "TRY",
  paymentStatus: "PAID",
  addresses: [
    {
      id: "a1",
      type: "SHIPPING",
      fullName: "Eski Alıcı",
      addressLine1: "Eski Mah.",
      addressLine2: null,
      district: "Üsküdar",
      city: "İstanbul",
      postalCode: null,
      countryCode: "TR",
      phone: "5550000000",
    },
  ],
} as never;

const DHL_PROVIDER = {
  id: "spc_dhl",
  provider: "DHL_ECOMMERCE",
  displayName: "DHL eCommerce",
  status: "ENABLED",
} as never;

function shipment(status: string) {
  return { id: "sh1", provider: "DHL_ECOMMERCE", status } as never;
}

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("TODO-139 EditShippingAddress", () => {
  it("shows edit action in safe state (ORDER_CREATED)", () => {
    render(
      <EditShippingAddress
        order={ORDER}
        activeShipment={shipment("ORDER_CREATED")}
        providers={[DHL_PROVIDER]}
        locale="tr"
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Teslimat Adresini Düzenle" })).toBeTruthy();
  });

  it("hides edit action and shows lock copy in locked state (IN_TRANSIT)", () => {
    render(
      <EditShippingAddress
        order={ORDER}
        activeShipment={shipment("IN_TRANSIT")}
        providers={[DHL_PROVIDER]}
        locale="tr"
        onSaved={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Teslimat Adresini Düzenle" })).toBeNull();
    expect(screen.getByText("Kargoya verilmiş siparişlerde adres değiştirilemez.")).toBeTruthy();
  });

  it("CBS city/district dropdowns: selecting a city loads districts", async () => {
    storeApiMock.getCbsCities.mockResolvedValue({ cities: [{ code: "34", name: "İstanbul" }] });
    storeApiMock.getCbsDistricts.mockResolvedValue({
      districts: [{ code: "1071", name: "Kadıköy", cityCode: "34" }],
    });
    const user = userEvent.setup();
    render(
      <EditShippingAddress
        order={ORDER}
        activeShipment={shipment("ORDER_CREATED")}
        providers={[DHL_PROVIDER]}
        locale="tr"
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Teslimat Adresini Düzenle" }));
    // Kapsam uyarısı görünür (müşteri adres defterini değil).
    expect(await screen.findByText(/yalnızca bu siparişin teslimat adresini günceller/)).toBeTruthy();
    await waitFor(() => expect(storeApiMock.getCbsCities).toHaveBeenCalledWith("spc_dhl"));

    const combos = await screen.findAllByRole("combobox");
    await user.selectOptions(combos[0]!, "34");
    await waitFor(() => expect(storeApiMock.getCbsDistricts).toHaveBeenCalledWith("spc_dhl", 34));
    expect(await screen.findByText(/Kadıköy \(1071\)/)).toBeTruthy();
  });

  it("successful save calls updateOrderShippingAddress + onSaved refresh", async () => {
    storeApiMock.getCbsCities.mockResolvedValue({ cities: [{ code: "34", name: "İstanbul" }] });
    storeApiMock.updateOrderShippingAddress.mockResolvedValue({
      shippingAddress: {},
      shipment: null,
      cbsMatched: false,
      providerRepairSupported: false,
      providerResent: false,
      providerErrorCode: null,
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(
      <EditShippingAddress
        order={ORDER}
        activeShipment={null}
        providers={[DHL_PROVIDER]}
        locale="tr"
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Teslimat Adresini Düzenle" }));
    await user.click(await screen.findByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(storeApiMock.updateOrderShippingAddress).toHaveBeenCalledTimes(1));
    expect(storeApiMock.updateOrderShippingAddress.mock.calls[0]![0]).toBe("o1");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("providerResent:false renders carrier limitation copy (no fake success)", async () => {
    storeApiMock.getCbsCities.mockResolvedValue({ cities: [{ code: "34", name: "İstanbul" }] });
    storeApiMock.updateOrderShippingAddress.mockResolvedValue({
      shippingAddress: {},
      shipment: { id: "sh1" },
      cbsMatched: true,
      providerRepairSupported: true,
      providerResent: false,
      providerErrorCode: "AUTH_FAILED",
    });
    const user = userEvent.setup();
    render(
      <EditShippingAddress
        order={ORDER}
        activeShipment={shipment("ORDER_CREATED")}
        providers={[DHL_PROVIDER]}
        locale="tr"
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Teslimat Adresini Düzenle" }));
    await user.click(await screen.findByRole("button", { name: "Kaydet" }));

    expect(await screen.findByText(/Kargo firması üzerindeki kayıt güncellenemedi/)).toBeTruthy();
  });
});
