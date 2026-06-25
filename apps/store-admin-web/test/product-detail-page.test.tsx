// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@commerce-os/ui";
import ProductDetailPage from "../app/(app)/products/[id]/page.js";

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
      getProduct: vi.fn(),
      listCategories: vi.fn(),
      updateProduct: vi.fn(),
      listVariants: vi.fn(),
      createVariant: vi.fn(),
      updateVariant: vi.fn(),
    },
  };
});

vi.mock("../lib/client/api.js", () => ({
  storeApi: storeApiMock,
  UiError: MockUiError,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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
    purchasable: true,
    inquiryEnabled: false,
    appointmentRequired: false,
    whatsappEnabled: false,
    minOrderQuantity: 1,
    maxOrderQuantity: null,
    callToActionLabel: null,
    whatsappMessageTemplate: null,
    inquiryFormTitle: null,
    appointmentNote: null,
    categoryIds: [],
    createdAt: new Date("2026-06-01T10:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-06-01T10:00:00.000Z").toISOString(),
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("store-admin product detail — dedicated route page", () => {
  it("renders the edit form with sales-behavior fields and a variants section, no modal", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    storeApiMock.getProduct.mockResolvedValue(makeProduct());
    storeApiMock.listCategories.mockResolvedValue(page(0, []));
    storeApiMock.listVariants.mockResolvedValue(page(0, []));

    render(<ProductDetailPage />);

    await screen.findByText("Temel bilgiler");
    expect(screen.getByText("Satış davranışı")).toBeTruthy();
    expect(screen.getByLabelText("Satış tipi")).toBeTruthy();
    expect(screen.getByLabelText("Min. sipariş adedi")).toBeTruthy();
    expect(screen.getAllByText("Varyantlar").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Ürünlere dön/ }).getAttribute("href")).toBe(
      "/products",
    );

    // Premium DetailHero: durum rozeti + kaydet aksiyonu basligin icinde.
    expect(screen.getByRole("button", { name: "Değişiklikleri kaydet" })).toBeTruthy();
    // Sag baglam rayi: satis profili, kunye ve yonetim notu kartlari.
    expect(screen.getByText("Satış profili")).toBeTruthy();
    expect(screen.getByText("Künye")).toBeTruthy();
    expect(screen.getByText("Yönetim notu")).toBeTruthy();

    // Edit detay sayfasi modal degildir.
    expect(screen.queryByRole("dialog")).toBeNull();

    const nesting = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes("validateDOMNesting"),
    );
    expect(nesting).toEqual([]);
    consoleError.mockRestore();
  });

  it("saves the product with the F2D/F2F sales fields in the update body", async () => {
    storeApiMock.getProduct.mockResolvedValue(makeProduct());
    storeApiMock.listCategories.mockResolvedValue(page(0, []));
    storeApiMock.listVariants.mockResolvedValue(page(0, []));
    storeApiMock.updateProduct.mockResolvedValue(makeProduct({ title: "Sweatshirt XL" }));
    const user = userEvent.setup();

    render(<ProductDetailPage />);
    await screen.findByText("Temel bilgiler");

    const titleInput = screen.getByLabelText("Ürün adı");
    await user.clear(titleInput);
    await user.type(titleInput, "Sweatshirt XL");
    await user.click(screen.getByRole("button", { name: "Değişiklikleri kaydet" }));

    await waitFor(() => expect(storeApiMock.updateProduct).toHaveBeenCalledTimes(1));
    expect(storeApiMock.updateProduct).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({
        title: "Sweatshirt XL",
        salesMode: "ONLINE",
        priceVisibility: "VISIBLE",
        primaryAction: "ADD_TO_CART",
        purchasable: true,
        minOrderQuantity: 1,
        maxOrderQuantity: null,
      }),
    );
    expect(await screen.findByText("Ürün bilgileri kaydedildi.")).toBeTruthy();
  });

  it("maps a backend validation guard error to a localized message", async () => {
    storeApiMock.getProduct.mockResolvedValue(makeProduct());
    storeApiMock.listCategories.mockResolvedValue(page(0, []));
    storeApiMock.listVariants.mockResolvedValue(page(0, []));
    storeApiMock.updateProduct.mockRejectedValue(new MockUiError("PRODUCT_NOT_PURCHASABLE"));
    const user = userEvent.setup();

    render(<ProductDetailPage />);
    await screen.findByText("Temel bilgiler");

    await user.click(screen.getByRole("button", { name: "Değişiklikleri kaydet" }));

    expect(await screen.findByText("Bu ürün doğrudan satın alınamaz.")).toBeTruthy();
  });

  it("creates a variant inline from the variants section (short modal flow)", async () => {
    storeApiMock.getProduct.mockResolvedValue(makeProduct());
    storeApiMock.listCategories.mockResolvedValue(page(0, []));
    storeApiMock.listVariants.mockResolvedValue(page(0, []));
    storeApiMock.createVariant.mockResolvedValue({ id: "v1" });
    const user = userEvent.setup();

    render(<ProductDetailPage />);
    await screen.findByText("Temel bilgiler");

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

  it("renders the product detail page in English under an en locale", async () => {
    storeApiMock.getProduct.mockResolvedValue(makeProduct());
    storeApiMock.listCategories.mockResolvedValue(page(0, []));
    storeApiMock.listVariants.mockResolvedValue(page(0, []));

    render(
      <LocaleProvider locale="en">
        <ProductDetailPage />
      </LocaleProvider>,
    );

    await screen.findByText("Basic information");
    expect(screen.getByText("Sales behavior")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to products/ })).toBeTruthy();
  });
});
