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

function page(total: number, data: unknown[]) {
  return { data, pagination: { limit: 50, offset: 0, total } };
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
      expect.objectContaining({ title: "Sweatshirt", slug: "sweatshirt" }),
    );
  });

  it("creates a variant with lira price converted to minor units", async () => {
    storeApiMock.listProducts.mockResolvedValue(
      page(1, [
        {
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
          categoryIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    );
    storeApiMock.listCategories.mockResolvedValue(page(0, []));
    storeApiMock.listVariants.mockResolvedValue(page(0, []));
    storeApiMock.createVariant.mockResolvedValue({ id: "v1" });
    const user = userEvent.setup();

    render(<ProductsPage />);

    await user.click(await screen.findByRole("button", { name: "Varyantlar" }));
    await user.click(await screen.findByRole("button", { name: "İlk varyantı ekle" }));

    await user.type(screen.getByLabelText("Başlık"), "Siyah / M");
    await user.type(screen.getByLabelText("SKU"), "SWT-SYH-M");
    await user.type(screen.getByLabelText("Fiyat (₺)"), "199,90");
    await user.click(screen.getByRole("button", { name: "Varyant oluştur" }));

    await waitFor(() => expect(storeApiMock.createVariant).toHaveBeenCalledTimes(1));
    expect(storeApiMock.createVariant).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ sku: "SWT-SYH-M", priceMinor: 19990, currency: "TRY" }),
    );
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
