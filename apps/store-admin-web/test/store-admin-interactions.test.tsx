// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "../app/(app)/page.js";
import CategoriesPage from "../app/(app)/categories/page.js";
import ProductsPage from "../app/(app)/products/page.js";
import InventoryPage from "../app/(app)/inventory/page.js";

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
      dashboardSummary: vi.fn(),
      listCategories: vi.fn(),
      createCategory: vi.fn(),
      updateCategory: vi.fn(),
      listProducts: vi.fn(),
      createProduct: vi.fn(),
      updateProduct: vi.fn(),
      listVariants: vi.fn(),
      createVariant: vi.fn(),
      updateVariant: vi.fn(),
      listInventory: vi.fn(),
      adjustInventory: vi.fn(),
    },
  };
});

vi.mock("../lib/client/api.js", () => ({
  storeApi: storeApiMock,
  UiError: MockUiError,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "p1" }),
}));

function page(total: number, data: unknown[]) {
  return { data, pagination: { limit: 50, offset: 0, total } };
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    storeId: "s1",
    title: "Sweatshirt",
    slug: "sweatshirt",
    description: null,
    status: "ACTIVE",
    type: "PHYSICAL",
    vendor: null,
    brand: null,
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
    categoryIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("store-admin dashboard", () => {
  it("renders live catalogue/stock summary in Turkish without invalid DOM nesting", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    storeApiMock.dashboardSummary.mockResolvedValue({
      store: { id: "s1", name: "Demo Mağaza", slug: "demo-store", status: "ACTIVE" },
      products: { total: 7, active: 4 },
      categories: { total: 2 },
      inventory: { records: 3, lowStock: 1, totalOnHand: 42 },
    });

    render(<DashboardPage />);

    expect(await screen.findByText("Toplam ürün")).toBeTruthy();
    await screen.findByText("7");
    await screen.findByText("Demo Mağaza");
    expect(screen.getByText("42")).toBeTruthy();

    const nesting = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes("validateDOMNesting"),
    );
    expect(nesting).toEqual([]);
    consoleError.mockRestore();
  });

  it("shows a Turkish error state when the summary fails", async () => {
    storeApiMock.dashboardSummary.mockRejectedValue(new MockUiError("NETWORK"));
    render(<DashboardPage />);
    expect(await screen.findByText("Panel verileri yüklenemedi.")).toBeTruthy();
    expect(
      screen.getByText("Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin."),
    ).toBeTruthy();
  });
});

describe("store-admin categories", () => {
  it("lists categories and creates one through the form", async () => {
    storeApiMock.listCategories.mockResolvedValue(
      page(1, [
        {
          id: "c1",
          storeId: "s1",
          name: "Giyim",
          slug: "giyim",
          parentId: null,
          sortOrder: 10,
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    );
    storeApiMock.createCategory.mockResolvedValue({ id: "c2" });
    const user = userEvent.setup();

    render(<CategoriesPage />);

    await screen.findByText("Giyim");
    await user.click(screen.getByRole("button", { name: "Kategori ekle" }));

    await user.type(screen.getByLabelText("Kategori adı"), "Aksesuar");
    await user.type(screen.getByLabelText("Kısa ad (slug)"), "aksesuar");
    await user.click(screen.getByRole("button", { name: "Kategori oluştur" }));

    await waitFor(() => expect(storeApiMock.createCategory).toHaveBeenCalledTimes(1));
    expect(storeApiMock.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Aksesuar", slug: "aksesuar" }),
    );
  });

  it("maps a duplicate-slug error to a friendly Turkish message", async () => {
    storeApiMock.listCategories.mockResolvedValue(page(0, []));
    storeApiMock.createCategory.mockRejectedValue(new MockUiError("CATEGORY_SLUG_EXISTS"));
    const user = userEvent.setup();

    render(<CategoriesPage />);

    await user.click(await screen.findByRole("button", { name: "İlk kategoriyi oluştur" }));
    await user.type(screen.getByLabelText("Kategori adı"), "Giyim");
    await user.type(screen.getByLabelText("Kısa ad (slug)"), "giyim");
    await user.click(screen.getByRole("button", { name: "Kategori oluştur" }));

    expect(
      await screen.findByText("Bu kategori kısa adı (slug) zaten kullanılıyor."),
    ).toBeTruthy();
  });
});

describe("store-admin products & variants", () => {
  it("creates a product through the form", async () => {
    storeApiMock.listProducts.mockResolvedValue(page(0, []));
    storeApiMock.listCategories.mockResolvedValue(page(0, []));
    storeApiMock.createProduct.mockResolvedValue({ id: "p1" });
    const user = userEvent.setup();

    render(<ProductsPage />);

    await user.click(await screen.findByRole("button", { name: "İlk ürünü ekle" }));
    await user.type(screen.getByLabelText("Ürün adı"), "Sweatshirt");
    await user.type(screen.getByLabelText("Kısa ad (slug)"), "sweatshirt");
    await user.click(screen.getByRole("button", { name: "Ürün oluştur" }));

    await waitFor(() => expect(storeApiMock.createProduct).toHaveBeenCalledTimes(1));
    expect(storeApiMock.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Sweatshirt",
        slug: "sweatshirt",
        // ONLINE varsayilan satis davranisi gonderilmeli.
        salesMode: "ONLINE",
        priceVisibility: "VISIBLE",
        primaryAction: "ADD_TO_CART",
        purchasable: true,
        minOrderQuantity: 1,
        maxOrderQuantity: null,
      }),
    );
  });

  it("renders the premium summary tiles computed from the live list", async () => {
    storeApiMock.listProducts.mockResolvedValue(
      page(2, [
        makeProduct(),
        makeProduct({
          id: "p2",
          slug: "katalog",
          title: "Katalog",
          status: "DRAFT",
          salesMode: "CATALOG_ONLY",
          purchasable: false,
        }),
      ]),
    );
    storeApiMock.listCategories.mockResolvedValue(page(0, []));

    render(<ProductsPage />);

    await screen.findByText("Sweatshirt");
    // Ozet tile etiketleri (canli listeden hesaplanir).
    expect(screen.getByText("Toplam ürün")).toBeTruthy();
    expect(screen.getByText("Aktif ürünler")).toBeTruthy();
    expect(screen.getByText("Satın alınabilir ürünler")).toBeTruthy();
    expect(screen.getByText("Katalog ürünleri")).toBeTruthy();
  });

  it("links each product row to its detail/edit route instead of opening a modal", async () => {
    storeApiMock.listProducts.mockResolvedValue(page(1, [makeProduct()]));
    storeApiMock.listCategories.mockResolvedValue(page(0, []));

    render(<ProductsPage />);

    await screen.findByText("Sweatshirt");
    const link = screen.getByRole("link", { name: "Detay" });
    expect(link.getAttribute("href")).toBe("/products/p1");

    // Edit artik liste modal'i degil; liste hicbir dialog acmamali.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Düzenle" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Varyantlar" })).toBeNull();
  });
});

describe("store-admin product sales model", () => {
  it("renders the sales-mode badge and purchasable hint for a default ONLINE product", async () => {
    storeApiMock.listProducts.mockResolvedValue(page(1, [makeProduct()]));
    storeApiMock.listCategories.mockResolvedValue(page(0, []));

    render(<ProductsPage />);

    await screen.findByText("Sweatshirt");
    expect(screen.getByText("Online satış")).toBeTruthy();
    expect(screen.getByText("Sepete eklenebilir")).toBeTruthy();
  });

  it("renders distinct badges for INQUIRY, APPOINTMENT, WHATSAPP and CATALOG_ONLY rows", async () => {
    storeApiMock.listProducts.mockResolvedValue(
      page(4, [
        makeProduct({
          id: "p2",
          slug: "danisma",
          title: "Danışma",
          salesMode: "INQUIRY",
          priceVisibility: "ON_REQUEST",
          primaryAction: "REQUEST_PRICE",
          purchasable: false,
          inquiryEnabled: true,
        }),
        makeProduct({
          id: "p3",
          slug: "randevu",
          title: "Randevu",
          salesMode: "APPOINTMENT",
          primaryAction: "BOOK_APPOINTMENT",
          purchasable: false,
          appointmentRequired: true,
        }),
        makeProduct({
          id: "p4",
          slug: "wp",
          title: "WP",
          salesMode: "WHATSAPP",
          primaryAction: "WHATSAPP",
          purchasable: false,
          whatsappEnabled: true,
        }),
        makeProduct({
          id: "p5",
          slug: "katalog",
          title: "Katalog",
          salesMode: "CATALOG_ONLY",
          primaryAction: "NONE",
          purchasable: false,
        }),
      ]),
    );
    storeApiMock.listCategories.mockResolvedValue(page(0, []));

    render(<ProductsPage />);

    await screen.findByText("Danışma");
    expect(screen.getByText("Fiyat sor")).toBeTruthy();
    expect(screen.getByText("Randevu al")).toBeTruthy();
    expect(screen.getByText("WhatsApp ile sor")).toBeTruthy();
    expect(screen.getByText("Sadece katalog")).toBeTruthy();
    // Satis dışı urunlerde net uyari.
    expect(screen.getAllByText("Sepete eklenemez").length).toBe(4);
  });

  it("applies safe defaults and reveals helper fields when sales mode changes to INQUIRY", async () => {
    storeApiMock.listProducts.mockResolvedValue(page(0, []));
    storeApiMock.listCategories.mockResolvedValue(page(0, []));
    storeApiMock.createProduct.mockResolvedValue({ id: "p9" });
    const user = userEvent.setup();

    render(<ProductsPage />);

    await user.click(await screen.findByRole("button", { name: "İlk ürünü ekle" }));
    expect(screen.getByText("Satış davranışı")).toBeTruthy();

    await user.type(screen.getByLabelText("Ürün adı"), "Danışmanlık");
    await user.type(screen.getByLabelText("Kısa ad (slug)"), "danismanlik");
    await user.selectOptions(screen.getByLabelText("Satış tipi"), "INQUIRY");

    // INQUIRY secimi fiyat sorma formu basligini gosterir.
    expect(await screen.findByLabelText("Fiyat sorma formu başlığı (opsiyonel)")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Ürün oluştur" }));

    await waitFor(() => expect(storeApiMock.createProduct).toHaveBeenCalledTimes(1));
    expect(storeApiMock.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        salesMode: "INQUIRY",
        primaryAction: "REQUEST_PRICE",
        purchasable: false,
        inquiryEnabled: true,
      }),
    );
  });

  it("blocks an invalid max-order-quantity client side with a localized message", async () => {
    storeApiMock.listProducts.mockResolvedValue(page(0, []));
    storeApiMock.listCategories.mockResolvedValue(page(0, []));
    const user = userEvent.setup();

    render(<ProductsPage />);

    await user.click(await screen.findByRole("button", { name: "İlk ürünü ekle" }));
    await user.type(screen.getByLabelText("Ürün adı"), "Sweatshirt");
    await user.type(screen.getByLabelText("Kısa ad (slug)"), "sweatshirt");
    await user.clear(screen.getByLabelText("Min. sipariş adedi"));
    await user.type(screen.getByLabelText("Min. sipariş adedi"), "5");
    await user.type(screen.getByLabelText("Maks. sipariş adedi (opsiyonel)"), "2");
    await user.click(screen.getByRole("button", { name: "Ürün oluştur" }));

    expect(
      await screen.findByText("Maks. sipariş adedi min. sipariş adedinden küçük olamaz."),
    ).toBeTruthy();
    expect(storeApiMock.createProduct).not.toHaveBeenCalled();
  });

  it("maps a backend sales-model guard error to a localized message", async () => {
    storeApiMock.listProducts.mockResolvedValue(page(0, []));
    storeApiMock.listCategories.mockResolvedValue(page(0, []));
    storeApiMock.createProduct.mockRejectedValue(new MockUiError("PRODUCT_NOT_PURCHASABLE"));
    const user = userEvent.setup();

    render(<ProductsPage />);

    await user.click(await screen.findByRole("button", { name: "İlk ürünü ekle" }));
    await user.type(screen.getByLabelText("Ürün adı"), "Sweatshirt");
    await user.type(screen.getByLabelText("Kısa ad (slug)"), "sweatshirt");
    await user.click(screen.getByRole("button", { name: "Ürün oluştur" }));

    expect(await screen.findByText("Bu ürün doğrudan satın alınamaz.")).toBeTruthy();
  });
});

describe("store-admin inventory", () => {
  function inventoryRow() {
    return page(1, [
      {
        id: "i1",
        storeId: "s1",
        variantId: "v1",
        productId: "p1",
        sku: "SWT-SYH-M",
        title: "Siyah / M",
        quantityOnHand: 2,
        quantityReserved: 0,
        quantityAvailable: 2,
        lowStockThreshold: 5,
        updatedAt: new Date().toISOString(),
      },
    ]);
  }

  it("renders a low-stock badge and submits an adjustment", async () => {
    storeApiMock.listInventory.mockResolvedValue(inventoryRow());
    storeApiMock.adjustInventory.mockResolvedValue({ item: {}, movement: {} });
    const user = userEvent.setup();

    render(<InventoryPage />);

    await screen.findByText("Siyah / M");
    expect(screen.getByText("Kritik")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Stok düzelt" }));
    await user.type(screen.getByLabelText("Değişim miktarı"), "10");
    await user.click(screen.getByRole("button", { name: "Düzeltmeyi uygula" }));

    await waitFor(() => expect(storeApiMock.adjustInventory).toHaveBeenCalledTimes(1));
    expect(storeApiMock.adjustInventory).toHaveBeenCalledWith("v1", { quantityDelta: 10 });
  });

  it("shows a Turkish message when an adjustment would make stock negative", async () => {
    storeApiMock.listInventory.mockResolvedValue(inventoryRow());
    storeApiMock.adjustInventory.mockRejectedValue(new MockUiError("INVALID_INVENTORY_ADJUSTMENT"));
    const user = userEvent.setup();

    render(<InventoryPage />);

    await user.click(await screen.findByRole("button", { name: "Stok düzelt" }));
    await user.type(screen.getByLabelText("Değişim miktarı"), "-999");
    await user.click(screen.getByRole("button", { name: "Düzeltmeyi uygula" }));

    expect(
      await screen.findByText("Bu düzeltme stoğu eksiye düşürür. Daha küçük bir değer girin."),
    ).toBeTruthy();
  });
});
