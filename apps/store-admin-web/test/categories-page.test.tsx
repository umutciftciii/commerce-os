// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CategoriesPage from "../app/(app)/categories/page.js";

// ADR-065 (Faz 2/Dilim 3) — CategoryEditor'a MediaUpload entegrasyonu: edit'te
// mevcut görselin value'ya dolması, kütüphane seçiminin submit payload'ına imageId
// olarak gitmesi, kaldırmanın imageId: null göndermesi ve görselsiz create akışı.
const { storeApiMock } = vi.hoisted(() => ({
  storeApiMock: {
    listCategories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    listMedia: vi.fn(),
    uploadMedia: vi.fn(),
    deleteMedia: vi.fn(),
  },
}));

// TODO-159A (ADR-089) — Kategoriler ekranı Data Grid URL state motorunu kullanır.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../lib/client/api.js", () => ({
  storeApi: storeApiMock,
  // messageForError, UiError instanceof kontrolu yapar; happy-path'te tetiklenmez
  // ama modul yuklenirken import'un cozulmesi icin minimal stub yeterli.
  UiError: class UiError extends Error {},
}));

const IMAGE_URL = "/media/stores/store_demo/categories/aaa.webp";

function category(overrides: Record<string, unknown> = {}) {
  return {
    id: "cat_1",
    storeId: "store_demo",
    name: "Kışlık",
    slug: "kislik",
    parentId: null,
    sortOrder: 0,
    status: "ACTIVE",
    imageId: null,
    imageUrl: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    ...overrides,
  };
}

const CATEGORY_ASSET = {
  id: "media_cat",
  context: "CATEGORY",
  url: IMAGE_URL,
  mimeType: "image/webp",
  byteSize: 1,
  width: 10,
  height: 10,
  altText: null,
  createdAt: "2026-07-12T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CategoriesPage görsel bağlama (ADR-065 Faz 2 / Dilim 3)", () => {
  it("edit modunda mevcut kategori görselini MediaUpload value'suna dolu getirir", async () => {
    storeApiMock.listCategories.mockResolvedValue({
      data: [category({ imageId: "media_cat", imageUrl: IMAGE_URL })],
      pagination: { limit: 20, offset: 0, total: 1, page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    render(<CategoriesPage />);

    await userEvent.click(await screen.findByText("Düzenle"));
    const dialog = await screen.findByRole("dialog");

    // Seçili görsel <img> value'dan geldi (altText null → alt="", dekoratif rol;
    // querySelector ile hedeflenir); boş-durum ipucu YOK; "Kaldır" mevcut.
    const img = dialog.querySelector("img");
    expect(img?.getAttribute("src")).toBe(IMAGE_URL);
    expect(within(dialog).queryByText("Henüz görsel eklenmedi.")).toBeNull();
    expect(within(dialog).getByLabelText("Kaldır")).toBeTruthy();
  });

  it("kütüphaneden seçilen görsel create submit payload'ında imageId olarak gider", async () => {
    storeApiMock.listCategories.mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0, page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });
    storeApiMock.listMedia.mockResolvedValue({
      data: [CATEGORY_ASSET],
      pagination: { limit: 100, offset: 0, total: 1, page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
    });
    storeApiMock.createCategory.mockResolvedValue(category({ id: "cat_new", imageId: "media_cat", imageUrl: IMAGE_URL }));
    render(<CategoriesPage />);

    await userEvent.click(await screen.findByText("Kategori ekle"));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByPlaceholderText("Örn. Tişörtler"), "Yazlık");
    await userEvent.type(within(dialog).getByPlaceholderText("tisortler"), "yazlik");

    // Kütüphaneyi aç → listMedia(CATEGORY) → "Seç".
    await userEvent.click(within(dialog).getByText("Kütüphaneden seç"));
    await waitFor(() => expect(storeApiMock.listMedia).toHaveBeenCalledWith("CATEGORY"));
    await userEvent.click(await screen.findByText("Seç"));

    await userEvent.click(within(dialog).getByText("Kategori oluştur"));

    await waitFor(() => expect(storeApiMock.createCategory).toHaveBeenCalled());
    expect(storeApiMock.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ imageId: "media_cat", slug: "yazlik", name: "Yazlık" }),
    );
  });

  it("görseli kaldırıp kaydetince update payload'ında imageId: null gider", async () => {
    storeApiMock.listCategories.mockResolvedValue({
      data: [category({ imageId: "media_cat", imageUrl: IMAGE_URL })],
      pagination: { limit: 20, offset: 0, total: 1, page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    storeApiMock.updateCategory.mockResolvedValue(category({ imageId: null, imageUrl: null }));
    render(<CategoriesPage />);

    await userEvent.click(await screen.findByText("Düzenle"));
    const dialog = await screen.findByRole("dialog");

    // Kaldır → görsel value'dan çıkar (boş-durum ipucu görünür).
    await userEvent.click(within(dialog).getByLabelText("Kaldır"));
    expect(within(dialog).getByText("Henüz görsel eklenmedi.")).toBeTruthy();

    await userEvent.click(within(dialog).getByText("Değişiklikleri kaydet"));

    await waitFor(() => expect(storeApiMock.updateCategory).toHaveBeenCalled());
    expect(storeApiMock.updateCategory).toHaveBeenCalledWith("cat_1", expect.objectContaining({ imageId: null }));
  });

  it("görsel eklenmeden create yapılınca payload imageId: null ile gider ve akış tamamlanır", async () => {
    storeApiMock.listCategories.mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0, page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });
    storeApiMock.createCategory.mockResolvedValue(category({ id: "cat_new" }));
    render(<CategoriesPage />);

    await userEvent.click(await screen.findByText("Kategori ekle"));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByPlaceholderText("Örn. Tişörtler"), "Aksesuar");
    await userEvent.type(within(dialog).getByPlaceholderText("tisortler"), "aksesuar");

    await userEvent.click(within(dialog).getByText("Kategori oluştur"));

    await waitFor(() =>
      expect(storeApiMock.createCategory).toHaveBeenCalledWith(
        expect.objectContaining({ imageId: null, slug: "aksesuar", name: "Aksesuar" }),
      ),
    );
    // Akış tamamlandı: başarı toast'u + liste yeniden yüklendi.
    expect(await screen.findByText("Kategori oluşturuldu.")).toBeTruthy();
    // TODO-159A (ADR-089) — ekran iki kaynak yükler: sayfalanmış liste + ebeveyn
    // seçicisinin sayfadan bağımsız kümesi. Create sonrası ikisi de tazelenir (2 → 4).
    expect(storeApiMock.listCategories).toHaveBeenCalledTimes(4);
  });
});
