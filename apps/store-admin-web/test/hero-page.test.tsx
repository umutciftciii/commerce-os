// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import HeroPage from "../app/(app)/hero/page.js";

// ADR-065 (Faz 2/Dilim 5) — HeroPage CRUD temeli: liste render, modal create (görsel
// ZORUNLU — R6), kütüphaneden seçim → mediaId payload'ı, edit'te mevcut görselin
// value'ya dolması ve silme onayı (window.confirm).
const { storeApiMock } = vi.hoisted(() => ({
  storeApiMock: {
    listHeroSlides: vi.fn(),
    createHeroSlide: vi.fn(),
    updateHeroSlide: vi.fn(),
    deleteHeroSlide: vi.fn(),
    reorderHeroSlides: vi.fn(),
    publishHeroSlide: vi.fn(),
    unpublishHeroSlide: vi.fn(),
    listMedia: vi.fn(),
    uploadMedia: vi.fn(),
    deleteMedia: vi.fn(),
  },
}));

vi.mock("../lib/client/api.js", () => ({
  storeApi: storeApiMock,
  UiError: class UiError extends Error {},
}));

const IMAGE_URL = "/media/stores/store_demo/hero/aaa.webp";

function slide(overrides: Record<string, unknown> = {}) {
  return {
    id: "hero_1",
    mediaId: "media_hero",
    mediaUrl: IMAGE_URL,
    position: 0,
    status: "DRAFT",
    headline: "Yaz koleksiyonu",
    subtext: null,
    ctaLabel: null,
    ctaHref: null,
    startsAt: null,
    endsAt: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    ...overrides,
  };
}

const HERO_ASSET = {
  id: "media_hero",
  context: "HERO",
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
  vi.restoreAllMocks();
});

describe("HeroPage CRUD temeli (ADR-065 Faz 2 / Dilim 5)", () => {
  it("liste: slide başlığı ve DRAFT rozeti render edilir", async () => {
    storeApiMock.listHeroSlides.mockResolvedValue({ data: [slide()] });
    render(<HeroPage />);

    expect(await screen.findByText("Yaz koleksiyonu")).toBeTruthy();
    // Bu checkpoint'te durum daima taslak.
    expect(screen.getByText("Taslak")).toBeTruthy();
  });

  it("create: görsel eklenmeden kaydedince R6 hatası verir; createHeroSlide çağrılmaz", async () => {
    storeApiMock.listHeroSlides.mockResolvedValue({ data: [] });
    render(<HeroPage />);

    await userEvent.click(await screen.findByText("Slide ekle"));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByText("Slide oluştur"));

    expect(within(dialog).getByText("Slide görseli gerekli.")).toBeTruthy();
    expect(storeApiMock.createHeroSlide).not.toHaveBeenCalled();
  });

  it("create: kütüphaneden seçilen görsel + başlık payload'a mediaId olarak gider", async () => {
    storeApiMock.listHeroSlides.mockResolvedValue({ data: [] });
    storeApiMock.listMedia.mockResolvedValue({
      data: [HERO_ASSET],
      pagination: { limit: 25, offset: 0, total: 1, page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
    });
    storeApiMock.createHeroSlide.mockResolvedValue(slide({ id: "hero_new" }));
    render(<HeroPage />);

    await userEvent.click(await screen.findByText("Slide ekle"));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByPlaceholderText("Örn. Yaz koleksiyonu"), "Kış");

    // Kütüphaneyi aç → listMedia(HERO) → "Seç".
    await userEvent.click(within(dialog).getByText("Kütüphaneden seç"));
    await waitFor(() => expect(storeApiMock.listMedia).toHaveBeenCalledWith(expect.objectContaining({ context: "HERO" })));
    await userEvent.click(await screen.findByText("Seç"));

    await userEvent.click(within(dialog).getByText("Slide oluştur"));

    await waitFor(() => expect(storeApiMock.createHeroSlide).toHaveBeenCalled());
    expect(storeApiMock.createHeroSlide).toHaveBeenCalledWith(
      expect.objectContaining({ mediaId: "media_hero", headline: "Kış" }),
    );
    // Akış tamamlandı: başarı toast'u + liste yeniden yüklendi.
    expect(await screen.findByText("Slide oluşturuldu.")).toBeTruthy();
    expect(storeApiMock.listHeroSlides).toHaveBeenCalledTimes(2);
  });

  it("edit: mevcut slide görseli MediaUpload value'suna dolu getirilir", async () => {
    storeApiMock.listHeroSlides.mockResolvedValue({ data: [slide()] });
    render(<HeroPage />);

    await userEvent.click(await screen.findByText("Düzenle"));
    const dialog = await screen.findByRole("dialog");

    const img = dialog.querySelector("img");
    expect(img?.getAttribute("src")).toBe(IMAGE_URL);
    expect(within(dialog).getByLabelText("Kaldır")).toBeTruthy();
  });

  it("silme: onay verilince deleteHeroSlide çağrılır", async () => {
    storeApiMock.listHeroSlides.mockResolvedValue({ data: [slide()] });
    storeApiMock.deleteHeroSlide.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<HeroPage />);

    await userEvent.click(await screen.findByText("Sil"));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(storeApiMock.deleteHeroSlide).toHaveBeenCalledWith("hero_1"));
  });

  it("silme: onay reddedilirse deleteHeroSlide çağrılmaz", async () => {
    storeApiMock.listHeroSlides.mockResolvedValue({ data: [slide()] });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<HeroPage />);

    await userEvent.click(await screen.findByText("Sil"));

    expect(confirmSpy).toHaveBeenCalled();
    expect(storeApiMock.deleteHeroSlide).not.toHaveBeenCalled();
  });

  it("sıralama: ↓ reorderHeroSlides'ı doğru sıralı id dizisiyle çağırır; uçlarda buton disabled", async () => {
    const a = slide({ id: "hero_a", headline: "A", position: 0 });
    const b = slide({ id: "hero_b", headline: "B", position: 1 });
    storeApiMock.listHeroSlides.mockResolvedValue({ data: [a, b] });
    storeApiMock.reorderHeroSlides.mockResolvedValue({ data: [b, a] });
    render(<HeroPage />);

    await screen.findByText("A");
    const upButtons = screen.getAllByLabelText("Yukarı taşı") as HTMLButtonElement[];
    const downButtons = screen.getAllByLabelText("Aşağı taşı") as HTMLButtonElement[];
    // İlk eleman ↑ disabled, son eleman ↓ disabled.
    expect(upButtons[0].disabled).toBe(true);
    expect(downButtons[1].disabled).toBe(true);

    // İlk slide'ı (A) aşağı taşı → yeni sıra [B, A].
    await userEvent.click(downButtons[0]);
    await waitFor(() =>
      expect(storeApiMock.reorderHeroSlides).toHaveBeenCalledWith({ orderedIds: ["hero_b", "hero_a"] }),
    );
  });

  it("yayın: DRAFT slide'da 'Yayınla' publishHeroSlide çağırır; rozet 'Yayında' olur", async () => {
    storeApiMock.listHeroSlides
      .mockResolvedValueOnce({ data: [slide({ status: "DRAFT" })] })
      .mockResolvedValueOnce({ data: [slide({ status: "PUBLISHED" })] });
    storeApiMock.publishHeroSlide.mockResolvedValue({ id: "hero_1", status: "PUBLISHED" });
    render(<HeroPage />);

    await userEvent.click(await screen.findByText("Yayınla"));
    await waitFor(() => expect(storeApiMock.publishHeroSlide).toHaveBeenCalledWith("hero_1"));
    // Liste yeniden yüklendi → rozet artık dinamik olarak "Yayında".
    expect(await screen.findByText("Yayında")).toBeTruthy();
  });

  it("yayın: PUBLISHED slide'da 'Yayından kaldır' unpublishHeroSlide çağırır", async () => {
    storeApiMock.listHeroSlides.mockResolvedValue({ data: [slide({ status: "PUBLISHED" })] });
    storeApiMock.unpublishHeroSlide.mockResolvedValue({ id: "hero_1", status: "DRAFT" });
    render(<HeroPage />);

    await userEvent.click(await screen.findByText("Yayından kaldır"));
    await waitFor(() => expect(storeApiMock.unpublishHeroSlide).toHaveBeenCalledWith("hero_1"));
  });
});
