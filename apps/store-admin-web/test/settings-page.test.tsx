// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import StoreSettingsPage from "../app/(app)/settings/page.js";

// ADR-065 (Faz 2/Dilim 4) — Ayarlar sayfasının canlı hali: GET ile logo/favicon
// yüklenir, iki bağımsız BRANDING/single MediaUpload (libraryEnabled=false) ile
// düzenlenir, PATCH ile upsert edilir. contactEmail alanı tamamen kaldırıldı (R8).
const { storeApiMock } = vi.hoisted(() => ({
  storeApiMock: {
    getStoreSettings: vi.fn(),
    updateStoreSettings: vi.fn(),
    listMedia: vi.fn(),
    uploadMedia: vi.fn(),
    deleteMedia: vi.fn(),
  },
}));

vi.mock("../lib/client/api.js", () => ({
  storeApi: storeApiMock,
  // messageForError, UiError instanceof kontrolu yapar; happy-path'te tetiklenmez.
  UiError: class UiError extends Error {},
}));

const LOGO_URL = "/media/stores/store_demo/branding/logo.webp";

function settings(overrides: Record<string, unknown> = {}) {
  return {
    storeId: "store_demo",
    storeName: "Demo Store",
    logoMediaId: null,
    logoUrl: null,
    faviconMediaId: null,
    faviconUrl: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StoreSettingsPage (ADR-065 Faz 2 / Dilim 4)", () => {
  it("loading → ready: mağaza adını ve iki marka yükleyicisini gösterir; contactEmail YOK", async () => {
    storeApiMock.getStoreSettings.mockResolvedValue(settings());
    render(<StoreSettingsPage />);

    // Salt-okunur mağaza adı echo'su (R8).
    expect(await screen.findByText("Demo Store")).toBeTruthy();
    // Logo + favicon etiketleri.
    expect(screen.getByText("Logo")).toBeTruthy();
    expect(screen.getByText("Favicon")).toBeTruthy();
    // İki MediaUpload → iki "Görsel yükle".
    expect(screen.getAllByText("Görsel yükle")).toHaveLength(2);

    // contactEmail alanı tamamen kaldırıldı — ne etiket ne mock değer render edilir.
    expect(screen.queryByText("İletişim e-postası")).toBeNull();
    expect(screen.queryByDisplayValue("sahip@demo-magaza.dev")).toBeNull();
  });

  it("libraryEnabled={false}: iki slotta da 'Kütüphaneden seç' render EDİLMEZ", async () => {
    storeApiMock.getStoreSettings.mockResolvedValue(settings());
    render(<StoreSettingsPage />);
    await screen.findByText("Demo Store");
    // Marka slotları yalnız-yükleme → kütüphane butonu hiç yok (context karışması önlenir).
    expect(screen.queryByText("Kütüphaneden seç")).toBeNull();
  });

  it("edit'te mevcut logo MediaUpload value'suna dolar; Kaydet doğru payload'ı gönderir", async () => {
    storeApiMock.getStoreSettings.mockResolvedValue(
      settings({ logoMediaId: "media_logo", logoUrl: LOGO_URL }),
    );
    storeApiMock.updateStoreSettings.mockResolvedValue(
      settings({ logoMediaId: "media_logo", logoUrl: LOGO_URL }),
    );
    render(<StoreSettingsPage />);

    // Mevcut logo <img> value'dan geldi (favicon boş).
    const logoImg = await waitFor(() => {
      const img = document.querySelector(`img[src="${LOGO_URL}"]`);
      if (!img) throw new Error("logo img not yet rendered");
      return img;
    });
    expect(logoImg.getAttribute("src")).toBe(LOGO_URL);

    // Kaydet → logo korunur (id), favicon null (bağlanmadı).
    await userEvent.click(screen.getByText("Kaydet"));
    await waitFor(() =>
      expect(storeApiMock.updateStoreSettings).toHaveBeenCalledWith({
        logoMediaId: "media_logo",
        faviconMediaId: null,
      }),
    );
    // Başarı bildirimi.
    expect(await screen.findByText("Ayarlar kaydedildi.")).toBeTruthy();
  });

  it("yükleme hatası → Alert + 'Tekrar dene'; retry yeniden yükler", async () => {
    storeApiMock.getStoreSettings
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(settings());
    render(<StoreSettingsPage />);

    // Hata durumu.
    expect(await screen.findByText("Ayarlar yüklenemedi.")).toBeTruthy();
    const retry = screen.getByText("Tekrar dene");

    // Retry → ikinci çağrı başarılı → ready.
    await userEvent.click(retry);
    expect(await screen.findByText("Demo Store")).toBeTruthy();
    expect(storeApiMock.getStoreSettings).toHaveBeenCalledTimes(2);
  });
});
