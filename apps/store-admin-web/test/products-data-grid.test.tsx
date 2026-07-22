// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TODO-159A (ADR-089) — Ürünler ekranı Data Grid davranışı.
 *
 * Doğrulananlar: URL durumundan istek query'sinin türetilmesi (arama / filtre /
 * sıralama / sayfa / sayfa boyutu), filtre veya arama değişiminde sayfanın 1'e
 * dönmesi, loading / empty / error durumları, sayfalama görünümü ve toplam kayıt.
 * İstemcide yeniden filtreleme YAPILMADIĞI da örtük olarak doğrulanır: ekran her
 * durumda sunucudan ne geldiyse onu gösterir.
 */

const { storeApiMock, routerMock, searchParamsRef } = vi.hoisted(() => ({
  storeApiMock: {
    listProducts: vi.fn(),
    listCategories: vi.fn(),
    listProductFilterOptions: vi.fn(),
  },
  routerMock: { push: vi.fn(), replace: vi.fn() },
  searchParamsRef: { current: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useSearchParams: () => searchParamsRef.current,
  useParams: () => ({}),
}));

vi.mock("../lib/client/api.js", () => ({
  storeApi: storeApiMock,
  UiError: class UiError extends Error {},
}));

import ProductsPage from "../app/(app)/products/page.js";

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    storeId: "store_1",
    title: "Sweatshirt",
    slug: "sweatshirt",
    description: null,
    status: "ACTIVE",
    type: "PHYSICAL",
    vendor: null,
    brand: "Acme",
    seoTitle: null,
    seoDescription: null,
    salesMode: "ONLINE",
    priceVisibility: "VISIBLE",
    primaryAction: "ADD_TO_CART",
    inquiryEnabled: false,
    appointmentRequired: false,
    whatsappEnabled: false,
    purchasable: true,
    minOrderQuantity: 1,
    maxOrderQuantity: null,
    callToActionLabel: null,
    whatsappMessageTemplate: null,
    inquiryFormTitle: null,
    appointmentNote: null,
    shippingWeightKg: null,
    shippingDesi: null,
    primaryCategoryId: null,
    mediaDefiningAttributeId: null,
    categoryIds: [],
    images: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function pageResult(items: unknown[], totalItems: number, page = 1, pageSize = 25) {
  return {
    data: items,
    pagination: {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      total: totalItems,
      page,
      pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
    },
  };
}

beforeEach(() => {
  searchParamsRef.current = new URLSearchParams();
  storeApiMock.listCategories.mockResolvedValue(pageResult([], 0));
  storeApiMock.listProductFilterOptions.mockResolvedValue({ brands: ["Acme"], vendors: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Ürünler Data Grid — URL durumundan istek query'si", () => {
  it("varsayılan durumda sayfa 1 / 25 kayıt ve createdAt DESC ile ister", async () => {
    storeApiMock.listProducts.mockResolvedValue(pageResult([product()], 1));

    render(<ProductsPage />);

    await screen.findByText("Sweatshirt");
    expect(storeApiMock.listProducts).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("URL'deki arama, filtre, sıralama ve sayfa isteğe birebir taşınır", async () => {
    searchParamsRef.current = new URLSearchParams(
      "search=sweat&status=DRAFT&stockStatus=IN_STOCK&priceMin=1000&sortBy=price&sortOrder=asc&page=2&pageSize=50",
    );
    storeApiMock.listProducts.mockResolvedValue(pageResult([product()], 60, 2, 50));

    render(<ProductsPage />);

    await screen.findByText("Sweatshirt");
    expect(storeApiMock.listProducts).toHaveBeenCalledWith({
      page: 2,
      pageSize: 50,
      sortBy: "price",
      sortOrder: "asc",
      search: "sweat",
      status: "DRAFT",
      stockStatus: "IN_STOCK",
      priceMin: "1000",
    });
  });

  it("URL'deki tanınmayan sortBy sessizce varsayılana düşer (sunucuya gitmez)", async () => {
    searchParamsRef.current = new URLSearchParams("sortBy=DROP+TABLE&sortOrder=asc");
    storeApiMock.listProducts.mockResolvedValue(pageResult([product()], 1));

    render(<ProductsPage />);

    await screen.findByText("Sweatshirt");
    expect(storeApiMock.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: "createdAt" }),
    );
  });

  it("URL'deki geçersiz pageSize varsayılana düşer", async () => {
    searchParamsRef.current = new URLSearchParams("pageSize=999");
    storeApiMock.listProducts.mockResolvedValue(pageResult([product()], 1));

    render(<ProductsPage />);

    await screen.findByText("Sweatshirt");
    expect(storeApiMock.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 25 }),
    );
  });
});

describe("Ürünler Data Grid — URL yazımı ve sayfa sıfırlama", () => {
  it("arama gönderilince URL'e yazılır ve sayfa parametresi düşürülür", async () => {
    searchParamsRef.current = new URLSearchParams("page=3");
    storeApiMock.listProducts.mockResolvedValue(pageResult([product()], 100, 3));
    const user = userEvent.setup();

    render(<ProductsPage />);
    await screen.findByText("Sweatshirt");

    await user.type(screen.getByRole("searchbox"), "kazak");
    await user.click(screen.getByRole("button", { name: "Ara" }));

    const target = routerMock.replace.mock.calls.at(-1)?.[0] as string;
    expect(target).toContain("search=kazak");
    expect(target).not.toContain("page=");
  });

  it("sıralama değişince URL güncellenir ve sayfa 1'e döner", async () => {
    searchParamsRef.current = new URLSearchParams("page=4");
    storeApiMock.listProducts.mockResolvedValue(pageResult([product()], 100, 4));
    const user = userEvent.setup();

    render(<ProductsPage />);
    await screen.findByText("Sweatshirt");

    await user.selectOptions(screen.getByLabelText("Sırala"), "title:asc");

    const target = routerMock.replace.mock.calls.at(-1)?.[0] as string;
    expect(target).toContain("sortBy=title");
    expect(target).toContain("sortOrder=asc");
    expect(target).not.toContain("page=");
  });

  it("sayfa boyutu değişince URL'e yazılır ve sayfa 1'e döner", async () => {
    searchParamsRef.current = new URLSearchParams("page=2");
    storeApiMock.listProducts.mockResolvedValue(pageResult([product()], 100, 2));
    const user = userEvent.setup();

    render(<ProductsPage />);
    await screen.findByText("Sweatshirt");

    await user.selectOptions(screen.getByLabelText("Sayfa başına"), "50");

    const target = routerMock.replace.mock.calls.at(-1)?.[0] as string;
    expect(target).toContain("pageSize=50");
    expect(target).not.toContain("page=");
  });

  it("sonraki sayfa düğmesi page parametresini yazar (filtreleri korur)", async () => {
    searchParamsRef.current = new URLSearchParams("status=ACTIVE");
    storeApiMock.listProducts.mockResolvedValue(pageResult([product()], 100));
    const user = userEvent.setup();

    render(<ProductsPage />);
    await screen.findByText("Sweatshirt");

    await user.click(screen.getByRole("button", { name: "Sonraki" }));

    const target = routerMock.replace.mock.calls.at(-1)?.[0] as string;
    expect(target).toContain("page=2");
    expect(target).toContain("status=ACTIVE");
  });

  it("filtre çipi kaldırılınca yalnız o filtre URL'den düşer", async () => {
    searchParamsRef.current = new URLSearchParams("status=DRAFT&search=kazak");
    storeApiMock.listProducts.mockResolvedValue(pageResult([product()], 1));
    const user = userEvent.setup();

    render(<ProductsPage />);
    await screen.findByText("Sweatshirt");

    await user.click(screen.getByRole("button", { name: /Durum: Taslak filtresini kaldır/ }));

    const target = routerMock.replace.mock.calls.at(-1)?.[0] as string;
    expect(target).not.toContain("status=");
    expect(target).toContain("search=kazak");
  });

  it("tüm filtreleri temizle arama ve filtreleri birlikte kaldırır", async () => {
    searchParamsRef.current = new URLSearchParams("status=DRAFT&search=kazak&sortBy=title");
    storeApiMock.listProducts.mockResolvedValue(pageResult([product()], 1));
    const user = userEvent.setup();

    render(<ProductsPage />);
    await screen.findByText("Sweatshirt");

    // Aktif filtre çipi şeridindeki "Filtreleri temizle" bağlantısı.
    const clearButtons = screen.getAllByRole("button", { name: "Filtreleri temizle" });
    await user.click(clearButtons[clearButtons.length - 1]);

    const target = routerMock.replace.mock.calls.at(-1)?.[0] as string;
    expect(target).not.toContain("status=");
    expect(target).not.toContain("search=");
    // Sıralama bir daraltma DEĞİLDİR; temizlemede korunur.
    expect(target).toContain("sortBy=title");
  });
});

describe("Ürünler Data Grid — durumlar ve sayfalama görünümü", () => {
  it("yükleme sırasında iskelet gösterir", async () => {
    let resolve: ((value: unknown) => void) | undefined;
    storeApiMock.listProducts.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    render(<ProductsPage />);

    expect(await screen.findByRole("status", { name: "Kayıtlar yükleniyor…" })).toBeTruthy();
    resolve?.(pageResult([product()], 1));
    await screen.findByText("Sweatshirt");
  });

  it("hata durumunda mesaj ve tekrar dene düğmesi gösterir", async () => {
    storeApiMock.listProducts.mockRejectedValue(new Error("boom"));

    render(<ProductsPage />);

    expect(await screen.findByText("Ürünler yüklenemedi.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeTruthy();
  });

  it("filtresiz boş sonuçta katalog boş mesajı gösterir", async () => {
    storeApiMock.listProducts.mockResolvedValue(pageResult([], 0));

    render(<ProductsPage />);

    expect(await screen.findByText("Kataloğunuz boş")).toBeTruthy();
  });

  it("filtreli boş sonuçta eşleşme yok mesajı gösterir", async () => {
    searchParamsRef.current = new URLSearchParams("search=yok");
    storeApiMock.listProducts.mockResolvedValue(pageResult([], 0));

    render(<ProductsPage />);

    expect(await screen.findByText("Eşleşen kayıt yok")).toBeTruthy();
  });

  it("toplam kayıt ve görünen aralık sunucu meta'sından gösterilir", async () => {
    searchParamsRef.current = new URLSearchParams("page=2");
    storeApiMock.listProducts.mockResolvedValue(
      pageResult([product()], 471, 2, 25),
    );

    render(<ProductsPage />);

    await screen.findByText("Sweatshirt");
    await waitFor(() => expect(screen.getByText("26–50 / 471 kayıt")).toBeTruthy());
    expect(screen.getByText("471 ürün")).toBeTruthy();
  });

  it("ilk sayfada önceki düğmesi, son sayfada sonraki düğmesi devre dışıdır", async () => {
    storeApiMock.listProducts.mockResolvedValue(pageResult([product()], 10));

    render(<ProductsPage />);

    await screen.findByText("Sweatshirt");
    expect(screen.getByRole("button", { name: "Önceki" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Sonraki" })).toHaveProperty("disabled", true);
  });
});
