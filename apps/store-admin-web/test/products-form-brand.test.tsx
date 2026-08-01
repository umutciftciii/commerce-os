// @vitest-environment jsdom
// TODO-165A (ADR-165A) Task 17 — ProductForm marka seçici + satır-içi hızlı-oluşturma
// component smoke'u. Kanıtlanan:
//  • serbest-metin `brand` girişi GİTTİ; alan aranabilir seçicidir (bkz. brand-field.tsx),
//  • edit'te mevcut governed marka (brandId) doğru ÖN-SEÇİLİR (chip görünür),
//  • "Yeni marka oluştur" → BrandEditor (Task 15/16) mount edilir; kaydedince yeni marka
//    OTOMATİK seçilir ve FORM REMOUNT OLMAZ (aynı anda doldurulmuş diğer alanlar — burada
//    ürün adı — KORUNUR),
//  • submit payload'ı serbest-metin `brand` DEĞİL, governed `brandId` taşır.
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@commerce-os/ui";
import { ProductForm } from "../app/(app)/products/product-form";
import { makeBrandSelectorFake, makeCategorySelectorFake } from "./selector-test-utils";

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
      listModules: vi.fn().mockResolvedValue({ data: { storeId: "s1", modules: [] } }),
      updateProduct: vi.fn(),
      createProduct: vi.fn(),
      listMedia: vi.fn(),
      listCategorySelector: vi.fn(),
      // TODO-165A (ADR-165A) Task 17 — marka ataması aranabilir seçiciden geçer.
      listBrandSelector: vi.fn(),
      createBrand: vi.fn(),
      uploadMedia: vi.fn(),
      deleteMedia: vi.fn(),
      listCategoryAttributes: vi.fn().mockResolvedValue({ data: [] }),
      listAttributes: vi.fn().mockResolvedValue({ data: [] }),
      listAttributeGroups: vi.fn().mockResolvedValue({ data: [] }),
      listAttributeOptions: vi.fn().mockResolvedValue({ data: [] }),
      getProductAttributeValues: vi.fn().mockResolvedValue({ data: [] }),
      getCommercialMatrix: vi.fn().mockResolvedValue({ rows: [] }),
    },
  };
});

vi.mock("../lib/client/api.js", () => ({ storeApi: storeApiMock, UiError: MockUiError }));

const STATUS_LABELS = { DRAFT: "Draft", ACTIVE: "Active", ARCHIVED: "Archived" } as const;

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1", storeId: "s1", title: "Sweatshirt", slug: "sweatshirt", description: null,
    status: "ACTIVE", type: "PHYSICAL", vendor: null, brand: null, brandId: null,
    brandRef: null, seoTitle: null, seoDescription: null,
    salesMode: "ONLINE", priceVisibility: "VISIBLE", primaryAction: "ADD_TO_CART", purchasable: true,
    inquiryEnabled: false, appointmentRequired: false, whatsappEnabled: false, minOrderQuantity: 1,
    maxOrderQuantity: null, callToActionLabel: null, whatsappMessageTemplate: null, inquiryFormTitle: null,
    appointmentNote: null, categoryIds: [], primaryCategoryId: null, images: [], shippingWeightKg: null,
    shippingDesi: null, createdAt: new Date("2026-06-01T10:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-06-01T10:00:00.000Z").toISOString(), ...overrides,
  };
}

function newBrandRecord() {
  return {
    id: "b-new", storeId: "s1", name: "Acme Outdoors", slug: "acme-outdoors", description: null,
    logoMediaId: null, logoUrl: null, coverMediaId: null, coverUrl: null, websiteUrl: null,
    status: "ACTIVE" as const, seoTitle: null, seoDescription: null, productCount: 0,
    createdAt: new Date("2026-08-01T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-08-01T00:00:00.000Z").toISOString(),
  };
}

function renderForm(
  product: unknown,
  brands: { id: string; name: string; slug?: string }[] = [],
) {
  storeApiMock.listCategorySelector.mockImplementation(makeCategorySelectorFake([]));
  storeApiMock.listBrandSelector.mockImplementation(makeBrandSelectorFake(brands));
  return render(
    <LocaleProvider locale="en">
      <ProductForm
        mode="edit"
        product={product as never}
        statusLabels={STATUS_LABELS}
        formId="product-form"
        onSaved={vi.fn()}
      />
      <button form="product-form" type="submit">save</button>
    </LocaleProvider>,
  );
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ProductForm marka seçici (TODO-165A Task 17)", () => {
  it("free-text marka girişi yerine aranabilir seçici gösterilir; ürünün mevcut markası ön-seçilir", async () => {
    renderForm(
      makeProduct({ brandId: "b1", brandRef: { id: "b1", name: "Nike", slug: "nike" } }),
      [{ id: "b1", name: "Nike" }],
    );

    // Eski serbest-metin input artık YOK.
    expect(screen.queryByLabelText("Brand (optional)")).toBeNull();
    // Governed marka çözülüp chip olarak görünür (ids çözüm modu).
    await waitFor(() => expect(screen.getByText("Nike")).toBeTruthy());
  });

  it("Yeni marka oluştur → BrandEditor'da kaydedince yeni marka OTOMATİK seçilir; form state (başlık) KORUNUR", async () => {
    const user = userEvent.setup();
    storeApiMock.createBrand.mockResolvedValue({ data: newBrandRecord() });
    storeApiMock.updateProduct.mockResolvedValue(makeProduct());
    // `listBrandSelector` sahtesi "b-new"yi ÇÖZEBİLİR olarak seeded — gerçek backend'de
    // marka create sonrası ids-çözüm sorgusunda zaten bulunur; test-double bunu taklit eder.
    renderForm(makeProduct(), [{ id: "b-new", name: "Acme Outdoors", slug: "acme-outdoors" }]);

    // Diğer bir alanı doldur — quick-create SONRASI bu değerin KORUNDUĞUNU kanıtlar
    // (form remount olsaydı başlangıç değerine dönerdi).
    const titleInput = screen.getByLabelText("Product name");
    await user.clear(titleInput);
    await user.type(titleInput, "Trail Runner Jacket");

    await user.click(screen.getByRole("button", { name: "Create new brand" }));

    // BrandEditor (Task 15/16) kendi (henüz i18n'e taşınmamış, hardcoded TR) formunu açar.
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Marka Adı"), "Acme Outdoors");
    await user.click(within(dialog).getByRole("button", { name: "Oluştur" }));

    await waitFor(() => expect(storeApiMock.createBrand).toHaveBeenCalledTimes(1));
    // Modal kapanır, yeni marka chip olarak görünür (otomatik seçim).
    await waitFor(() => expect(screen.getByText("Acme Outdoors")).toBeTruthy());
    // Başlık alanı DOKUNULMADAN kalır — form REMOUNT OLMADI.
    expect((screen.getByLabelText("Product name") as HTMLInputElement).value).toBe(
      "Trail Runner Jacket",
    );
    // REGRESYON KİLİDİ — `Modal` `createPortal(document.body)` kullandığından React'in
    // sentetik "submit" olayı DOM ağacı değil REACT ağacı boyunca yükselir: BrandEditor'ün
    // KENDİ formu (stopPropagation OLMADAN) submit edilince ürün formunun onSubmit'i de
    // SPURIOUS ikinci kez tetiklenirdi. brand-editor.tsx onSubmit'e `stopPropagation()`
    // eklendi (bkz. Task 17 fix); bu satır o düzeltmeyi KİLİTLER.
    expect(storeApiMock.updateProduct).not.toHaveBeenCalled();

    const saveButtons = screen.getAllByRole("button", { name: "save" });
    await user.click(saveButtons[0]!);
    await waitFor(() => expect(storeApiMock.updateProduct).toHaveBeenCalledTimes(1));
    const [, payload] = storeApiMock.updateProduct.mock.calls[0] as [string, Record<string, unknown>];
    // Payload governed `brandId` taşır; serbest-metin `brand` alanı HİÇ GÖNDERİLMEZ.
    expect(payload.brandId).toBe("b-new");
    expect(payload).not.toHaveProperty("brand");
    expect(payload.title).toBe("Trail Runner Jacket");
  });
});
