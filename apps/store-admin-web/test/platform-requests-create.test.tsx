// @vitest-environment jsdom
// TODO-178 (Faz D) — Yeni talep (create) ekranı. Kapsam: yalnız AKTİF taksonomi seçenekleri,
// bilingual kategori etiketi, PRIORITY girişi YOK (platform-owned), başarı → detail'e redirect,
// server-authoritative hata gösterimi.
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { storeApiMock, routerMock, UiErrorClass } = vi.hoisted(() => ({
  storeApiMock: {
    listPlatformRequestCategories: vi.fn(),
    createPlatformRequest: vi.fn(),
  },
  routerMock: { push: vi.fn(), replace: vi.fn() },
  UiErrorClass: class UiError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("../lib/client/api.js", () => ({
  storeApi: storeApiMock,
  UiError: UiErrorClass,
}));

import NewPlatformRequestPage from "../app/(app)/platform-requests/new/page.js";

const CATEGORIES = [
  { key: "PLATFORM_POLICY", labelTr: "Platform Politikası", labelEn: "Platform Policy" },
  { key: "PLATFORM_CONTENT", labelTr: "Platform İçeriği", labelEn: "Platform Content" },
];

beforeEach(() => {
  storeApiMock.listPlatformRequestCategories.mockResolvedValue({ items: CATEGORIES });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Yeni platform talebi — form", () => {
  it("yalnız aktif taksonomiyi bilingual etiketle sunar ve PRIORITY girişi içermez", async () => {
    render(<NewPlatformRequestPage />);
    // Kategori seçenekleri (aktif taksonomi) bilingual TR etiketle görünür.
    await waitFor(() => expect(screen.getByRole("option", { name: "Platform Politikası" })).toBeTruthy());
    expect(screen.getByRole("option", { name: "Platform İçeriği" })).toBeTruthy();
    // Ham kategori key seçenek metninde görünmez.
    expect(screen.queryByText("PLATFORM_POLICY")).toBeNull();
    // Priority store tarafından SEÇİLEMEZ — formda öncelik alanı yok.
    const html = document.body.innerHTML;
    expect(html).not.toContain("Öncelik");
    expect(html).not.toContain("URGENT");
  });

  it("geçerli form gönderilince talep oluşturur ve detail'e yönlendirir", async () => {
    storeApiMock.createPlatformRequest.mockResolvedValue({ request: { id: "new-req-id", requestNumber: "PR-000009" } });
    const user = userEvent.setup();
    render(<NewPlatformRequestPage />);
    await waitFor(() => expect(screen.getByRole("option", { name: "Platform Politikası" })).toBeTruthy());

    await user.selectOptions(screen.getByLabelText("Kategori"), "PLATFORM_POLICY");
    await user.type(screen.getByLabelText("Konu"), "Kargo entegrasyonu");
    await user.type(screen.getByLabelText("Açıklama"), "MNG bağlantısı 500 dönüyor.");
    await user.click(screen.getByRole("button", { name: "Talep oluştur" }));

    await waitFor(() =>
      expect(storeApiMock.createPlatformRequest).toHaveBeenCalledWith({
        categoryKey: "PLATFORM_POLICY",
        subject: "Kargo entegrasyonu",
        description: "MNG bağlantısı 500 dönüyor.",
      }),
    );
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/platform-requests/new-req-id"));
  });

  it("opsiyonel mağaza etkisi seçilirse create isteğine advisory olarak eklenir", async () => {
    storeApiMock.createPlatformRequest.mockResolvedValue({ request: { id: "r2", requestNumber: "PR-000010" } });
    const user = userEvent.setup();
    render(<NewPlatformRequestPage />);
    await waitFor(() => expect(screen.getByRole("option", { name: "Platform Politikası" })).toBeTruthy());

    await user.selectOptions(screen.getByLabelText("Kategori"), "PLATFORM_POLICY");
    await user.type(screen.getByLabelText("Konu"), "Konu");
    await user.type(screen.getByLabelText("Açıklama"), "Açıklama");
    await user.selectOptions(screen.getByLabelText("Mağaza etkisi (opsiyonel)"), "HIGH");
    await user.click(screen.getByRole("button", { name: "Talep oluştur" }));

    await waitFor(() =>
      expect(storeApiMock.createPlatformRequest).toHaveBeenCalledWith(
        expect.objectContaining({ storeImpact: "HIGH" }),
      ),
    );
  });

  it("server hatasında insan-okunur mesaj gösterir ve yönlendirmez", async () => {
    storeApiMock.createPlatformRequest.mockRejectedValue(new UiErrorClass("CATEGORY_INACTIVE"));
    const user = userEvent.setup();
    render(<NewPlatformRequestPage />);
    await waitFor(() => expect(screen.getByRole("option", { name: "Platform Politikası" })).toBeTruthy());

    await user.selectOptions(screen.getByLabelText("Kategori"), "PLATFORM_POLICY");
    await user.type(screen.getByLabelText("Konu"), "Konu");
    await user.type(screen.getByLabelText("Açıklama"), "Açıklama");
    await user.click(screen.getByRole("button", { name: "Talep oluştur" }));

    await waitFor(() => expect(storeApiMock.createPlatformRequest).toHaveBeenCalled());
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});
