// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaUpload, type MediaItem } from "../components/media-upload";

const { storeApiMock } = vi.hoisted(() => ({
  storeApiMock: {
    listMedia: vi.fn(),
    uploadMedia: vi.fn(),
    deleteMedia: vi.fn(),
  },
}));

vi.mock("../lib/client/api.js", () => ({
  storeApi: storeApiMock,
  // messageForError, UiError instanceof kontrolu yapar; testte gercek hata yolu
  // tetiklenmedigi icin minimal bir stub yeterli.
  UiError: class UiError extends Error {},
}));

const IMG_A = { id: "a", context: "PRODUCT", url: "/a.webp", mimeType: "image/webp", byteSize: 1, width: 10, height: 10, altText: null, createdAt: "2026-07-12T00:00:00.000Z" };
const IMG_B = { id: "b", context: "PRODUCT", url: "/b.webp", mimeType: "image/webp", byteSize: 1, width: 10, height: 10, altText: null, createdAt: "2026-07-12T00:00:00.000Z" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MediaUpload (ADR-065 Faz 2 / Dilim 1)", () => {
  it("boş durumda yükle + kütüphane eylemlerini gösterir", () => {
    render(
      <MediaUpload context="BRANDING" mode="single" value={[]} onAttach={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByText("Görsel yükle")).toBeTruthy();
    expect(screen.getByText("Kütüphaneden seç")).toBeTruthy();
    expect(screen.getByText("Henüz görsel eklenmedi.")).toBeTruthy();
  });

  it("çoklu modda yukarı taşıma onReorder'ı doğru sırayla çağırır", async () => {
    const onReorder = vi.fn();
    const value: MediaItem[] = [
      { id: "a", url: "/a.webp", altText: null },
      { id: "b", url: "/b.webp", altText: null },
    ];
    render(
      <MediaUpload
        context="PRODUCT"
        mode="multiple"
        value={value}
        onAttach={vi.fn()}
        onRemove={vi.fn()}
        onReorder={onReorder}
      />,
    );
    // b'yi yukarı taşı → [b, a]
    const moveUps = screen.getAllByLabelText("Yukarı taşı");
    await userEvent.click(moveUps[1]);
    expect(onReorder).toHaveBeenCalledWith(["b", "a"]);
  });

  it("kütüphaneyi açar, listMedia çağırır ve seçim upload olmadan onAttach tetikler", async () => {
    storeApiMock.listMedia.mockResolvedValue({
      data: [IMG_A, IMG_B],
      pagination: { limit: 25, offset: 0, total: 2, page: 1, pageSize: 25, totalItems: 2, totalPages: 1 },
    });
    const onAttach = vi.fn();
    // IMG_A zaten ekli → "Zaten ekli"; IMG_B seçilebilir.
    render(
      <MediaUpload
        context="PRODUCT"
        mode="multiple"
        value={[{ id: "a", url: "/a.webp", altText: null }]}
        onAttach={onAttach}
        onRemove={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("Kütüphaneden seç"));
    await waitFor(() => expect(storeApiMock.listMedia).toHaveBeenCalledWith(expect.objectContaining({ context: "PRODUCT" })));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Zaten ekli")).toBeTruthy();

    // IMG_B'nin "Seç" düğmesine tıkla → onAttach(IMG_B), upload YOK.
    const selectButtons = within(dialog).getAllByText("Seç");
    await userEvent.click(selectButtons[0]);
    expect(onAttach).toHaveBeenCalledWith(IMG_B);
    expect(storeApiMock.uploadMedia).not.toHaveBeenCalled();
  });

  // ADR-065 (Faz 2/Dilim 4) — libraryEnabled prop'u.
  it("libraryEnabled={false} iken 'Kütüphaneden seç' butonu render EDİLMEZ; yükle kalır", () => {
    render(
      <MediaUpload
        context="BRANDING"
        mode="single"
        libraryEnabled={false}
        value={[]}
        onAttach={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    // Yükleme yolu korunur.
    expect(screen.getByText("Görsel yükle")).toBeTruthy();
    // Kütüphane butonu yok → modal hiç açılamaz (context karışması önlenir).
    expect(screen.queryByText("Kütüphaneden seç")).toBeNull();
  });

  it("REGRESYON: prop verilmeden (kategori/ürün deseni) 'Kütüphaneden seç' varsayılan olarak GÖRÜNÜR", () => {
    // Mevcut çağrılar libraryEnabled geçmez → varsayılan true → buton görünür.
    render(
      <MediaUpload context="CATEGORY" mode="single" value={[]} onAttach={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByText("Kütüphaneden seç")).toBeTruthy();
  });

  /* ────────────────────── TODO-159B (ADR-090) — TD-095 ────────────────────── */

  /** 130 görsellik kütüphane: "ilk 100'ün ötesi" senaryosunu mümkün kılar. */
  const LIBRARY = Array.from({ length: 130 }, (_, index) => ({
    id: `m${index + 1}`,
    context: "PRODUCT",
    url: `/m${index + 1}.webp`,
    mimeType: "image/webp",
    byteSize: 1,
    width: 10,
    height: 10,
    altText: `Görsel ${index + 1}`,
    createdAt: "2026-07-12T00:00:00.000Z",
  }));

  function installLibrary() {
    storeApiMock.listMedia.mockImplementation(
      async (query?: Record<string, string | number | undefined>) => {
        const search = typeof query?.search === "string" ? query.search : "";
        const matched = search
          ? LIBRARY.filter((asset) => asset.altText.includes(search))
          : LIBRARY;
        const pageSize = Number(query?.pageSize ?? 25);
        const page = Number(query?.page ?? 1);
        const data = matched.slice((page - 1) * pageSize, page * pageSize);
        return {
          data,
          pagination: {
            limit: pageSize,
            offset: (page - 1) * pageSize,
            total: matched.length,
            page,
            pageSize,
            totalItems: matched.length,
            totalPages: matched.length === 0 ? 0 : Math.ceil(matched.length / pageSize),
          },
        };
      },
    );
  }

  async function openLibrary() {
    render(
      <MediaUpload context="PRODUCT" mode="multiple" value={[]} onAttach={vi.fn()} onRemove={vi.fn()} />,
    );
    await userEvent.click(screen.getByText("Kütüphaneden seç"));
    return screen.findByRole("dialog");
  }

  it("kütüphane gerçek sayfalama meta'sı gösterir (sahte {limit:100,offset:0} YOK)", async () => {
    installLibrary();
    const dialog = await openLibrary();

    await waitFor(() => expect(within(dialog).getByText("1–25 / 130 kayıt")).toBeTruthy());
    expect(storeApiMock.listMedia).toHaveBeenCalledWith(
      expect.objectContaining({ context: "PRODUCT", page: 1, pageSize: 25 }),
    );
  });

  it("100. kaydın ÖTESİNDEKİ görsel sayfalama ile erişilebilir ve seçilebilir (TD-095)", async () => {
    installLibrary();
    const onAttach = vi.fn();
    render(
      <MediaUpload context="PRODUCT" mode="multiple" value={[]} onAttach={onAttach} onRemove={vi.fn()} />,
    );
    await userEvent.click(screen.getByText("Kütüphaneden seç"));
    const dialog = await screen.findByRole("dialog");

    // Sayfa boyutunu 100'e çıkar → 130 kayıt 2 sayfa; ikinci sayfada 101+ var.
    await waitFor(() => expect(within(dialog).getByText("1–25 / 130 kayıt")).toBeTruthy());
    await userEvent.selectOptions(within(dialog).getByLabelText("Sayfa başına"), "100");
    await waitFor(() => expect(within(dialog).getByText("1–100 / 130 kayıt")).toBeTruthy());
    await userEvent.click(within(dialog).getByRole("button", { name: "Sonraki" }));
    await waitFor(() => expect(within(dialog).getByText("101–130 / 130 kayıt")).toBeTruthy());

    // Eski sürümde `take: 100` yüzünden ERİŞİLEMEYEN kayıt artık seçilebiliyor.
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Görsel 130 görselini seç" }),
    );
    expect(onAttach).toHaveBeenCalledWith(expect.objectContaining({ id: "m130" }));
  });

  it("kütüphane araması sunucuya taşınır; sonuç yoksa FİLTRELİ-BOŞ metni gösterilir", async () => {
    installLibrary();
    const dialog = await openLibrary();
    await waitFor(() => expect(within(dialog).getByText("1–25 / 130 kayıt")).toBeTruthy());

    await userEvent.type(within(dialog).getByLabelText("Görsellerde ara"), "yok-boyle");
    await waitFor(() =>
      expect(storeApiMock.listMedia).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "yok-boyle", page: 1 }),
      ),
    );
    expect(await within(dialog).findByText("Aramaya uyan görsel yok.")).toBeTruthy();
  });

  it("sıralama seçimi sunucuya sortBy/sortOrder olarak taşınır (istemcide sıralanmaz)", async () => {
    installLibrary();
    const dialog = await openLibrary();
    await waitFor(() => expect(within(dialog).getByText("1–25 / 130 kayıt")).toBeTruthy());

    await userEvent.selectOptions(within(dialog).getByLabelText("Sırala"), "altText:asc");
    await waitFor(() =>
      expect(storeApiMock.listMedia).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: "altText", sortOrder: "asc" }),
      ),
    );
  });
});
