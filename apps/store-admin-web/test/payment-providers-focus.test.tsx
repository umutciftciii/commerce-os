// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import PaymentProvidersPage from "../app/(app)/payment-providers/page.js";

const { storeApiMock } = vi.hoisted(() => ({
  storeApiMock: {
    listPaymentProviders: vi.fn(),
    createPaymentProvider: vi.fn(),
    updatePaymentProvider: vi.fn(),
    setPaymentProviderStatus: vi.fn(),
    testPaymentProviderConnection: vi.fn(),
  },
}));

vi.mock("../lib/client/api.js", () => ({ storeApi: storeApiMock }));

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("payment providers — new provider modal", () => {
  it("keeps focus on the display-name input while typing (no focus loss regression)", async () => {
    storeApiMock.listPaymentProviders.mockResolvedValue({ data: [] });
    const user = userEvent.setup();

    render(<PaymentProvidersPage />);

    // Liste yüklendikten sonra "Yeni sağlayıcı" ile modalı aç.
    const addButton = await screen.findByRole("button", { name: "Yeni sağlayıcı" });
    await user.click(addButton);

    const input = (await screen.findByLabelText("Görünen ad")) as HTMLInputElement;
    input.focus();
    await user.type(input, "Iyzico Test");

    // Tüm metin kesintisiz yazıldı (focus kaybolsaydı ilk karakterden sonrası gitmezdi).
    expect(input.value).toBe("Iyzico Test");
    // Focus hâlâ aynı input'ta; modal dışında bir yere fırlamadı.
    expect(document.activeElement).toBe(input);
  });
});
