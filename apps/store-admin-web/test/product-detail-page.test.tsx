// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
    // F3C.2 — Kargo ölçüleri bölümü ve alanları render edilir.
    expect(screen.getByText("Kargo ölçüleri")).toBeTruthy();
    expect(screen.getByLabelText("Kargo ağırlığı (kg)")).toBeTruthy();
    expect(screen.getByLabelText("Kargo desisi")).toBeTruthy();
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
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText("Başlık"), "Siyah / M");
    await user.type(dialog.getByLabelText("SKU"), "SWT-SYH-M");
    // F4C — Fiyat alanı artık KDV HARİÇ nettir; net + oran gönderilir, KDV
    // tutarı/brüt SUNUCUDA hesaplanır (payload'da priceMinor YOK).
    await user.type(dialog.getByLabelText("KDV hariç fiyat (₺)"), "199,90");
    // F3C.2 — Varyant kargo desisi girilir; payload'a yansır (modal'a scope edilir,
    // çünkü ürün formunda da aynı etiket var).
    await user.type(dialog.getByLabelText("Kargo desisi"), "4");
    await user.click(screen.getByRole("button", { name: "Varyant oluştur" }));

    await waitFor(() => expect(storeApiMock.createVariant).toHaveBeenCalledTimes(1));
    expect(storeApiMock.createVariant).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({
        sku: "SWT-SYH-M",
        netPriceMinor: 19990,
        vatRateBps: 2000,
        currency: "TRY",
        shippingDesi: 4,
      }),
    );
    expect(
      (storeApiMock.createVariant.mock.calls[0][1] as Record<string, unknown>).priceMinor,
    ).toBeUndefined();
  });

  // F4C — KDV önizleme UI: helper metni, oran seçimi, salt-okunur KDV tutarı ve
  // KDV dahil fiyat önizlemesi (sunucu yine de yeniden hesaplar).
  it("F4C: variant modal shows VAT-exclusive helper, rate select and live VAT/gross preview", async () => {
    storeApiMock.getProduct.mockResolvedValue(makeProduct());
    storeApiMock.listCategories.mockResolvedValue(page(0, []));
    storeApiMock.listVariants.mockResolvedValue(page(0, []));
    const user = userEvent.setup();

    render(<ProductDetailPage />);
    await screen.findByText("Temel bilgiler");
    await user.click(await screen.findByRole("button", { name: "İlk varyantı ekle" }));
    const dialog = within(screen.getByRole("dialog"));

    // Helper: KDV hariç tutar girilmesi istenir.
    expect(dialog.getByText(/KDV hariç tutarı girin/)).toBeTruthy();
    expect(dialog.getByLabelText("KDV oranı")).toBeTruthy();

    // Net 100,00 + %20 → KDV 20,00 / brüt 120,00.
    await user.type(dialog.getByLabelText("KDV hariç fiyat (₺)"), "100");
    expect(dialog.getByTestId("variant-vat-amount").textContent).toContain("20,00");
    expect(dialog.getByTestId("variant-vat-gross").textContent).toContain("120,00");

    // Oran %10'a inince önizleme güncellenir.
    await user.selectOptions(dialog.getByLabelText("KDV oranı"), "1000");
    expect(dialog.getByTestId("variant-vat-amount").textContent).toContain("10,00");
    expect(dialog.getByTestId("variant-vat-gross").textContent).toContain("110,00");
  });

  // F4C bugfix — Kaydet CTA takılması: başarıda ve hatada loading sıfırlanır,
  // kaydetme sırasında double-submit engellenir.
  it("F4C: save button returns from 'Kaydediliyor...' to normal on success (no stuck CTA)", async () => {
    storeApiMock.getProduct.mockResolvedValue(makeProduct());
    storeApiMock.listCategories.mockResolvedValue(page(0, []));
    storeApiMock.listVariants.mockResolvedValue(page(0, []));
    let resolveUpdate: (value: unknown) => void = () => {};
    storeApiMock.updateProduct.mockImplementation(
      () => new Promise((resolve) => { resolveUpdate = resolve; }),
    );
    const user = userEvent.setup();

    render(<ProductDetailPage />);
    await screen.findByText("Temel bilgiler");

    await user.click(screen.getByRole("button", { name: "Değişiklikleri kaydet" }));
    // Beklemede: buton "Kaydediliyor…" ve disabled (double-submit koruması).
    const savingButton = await screen.findByRole("button", { name: "Kaydediliyor…" });
    expect((savingButton as HTMLButtonElement).disabled).toBe(true);
    await user.click(savingButton);
    expect(storeApiMock.updateProduct).toHaveBeenCalledTimes(1);

    resolveUpdate(makeProduct({ title: "Sweatshirt" }));
    // Başarı: bilgi görünür VE buton normal etikete döner, tekrar tıklanabilir.
    expect(await screen.findByText("Ürün bilgileri kaydedildi.")).toBeTruthy();
    const normalButton = await screen.findByRole("button", { name: "Değişiklikleri kaydet" });
    expect((normalButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("F4C: save button resets after an error as well", async () => {
    storeApiMock.getProduct.mockResolvedValue(makeProduct());
    storeApiMock.listCategories.mockResolvedValue(page(0, []));
    storeApiMock.listVariants.mockResolvedValue(page(0, []));
    storeApiMock.updateProduct.mockRejectedValue(new MockUiError("PRODUCT_NOT_PURCHASABLE"));
    const user = userEvent.setup();

    render(<ProductDetailPage />);
    await screen.findByText("Temel bilgiler");

    await user.click(screen.getByRole("button", { name: "Değişiklikleri kaydet" }));
    expect(await screen.findByText("Bu ürün doğrudan satın alınamaz.")).toBeTruthy();
    const normalButton = await screen.findByRole("button", { name: "Değişiklikleri kaydet" });
    expect((normalButton as HTMLButtonElement).disabled).toBe(false);
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
