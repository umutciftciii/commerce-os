// @vitest-environment jsdom
// TODO-165A (ADR-165A) Task 22/23 — Ürün formu Fashion Özellikleri adımı: governed
// fashion.* attribute'ları taksonomi-güdümlü aranabilir seçim + satır-içi hızlı-ekle ile
// render edilir. Kanıtlanan: (1) seçenekler taksonomi listesinden gelir (sabit dizi YOK),
// seçilen değer `attributeOptionId` olarak MEVCUT attribute-values payload'ına yazılır
// (attributeValueService tek yazma yolu, paralel yol YOK); (2) governed OLMAYAN
// attribute'lar generic AttributeSection'da KALIR (regresyon yok); (3) düzenleme
// round-trip (yeniden yükleme → ön-seçili); (4) legacy global-option ataması doğru
// etiketle okunur; (5) satır-içi hızlı-ekle form REMOUNT ETMEDEN yeni değeri seçer,
// 409 TAXONOMY_DUPLICATE yüzeye çıkar.
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@commerce-os/ui";
import { ProductForm } from "../app/(app)/products/product-form";
import { makeCategorySelectorFake, pickInSelector } from "./selector-test-utils";

const { storeApiMock, MockUiError } = vi.hoisted(() => {
  class MockUiError extends Error {
    readonly code: string;
    readonly details?: Record<string, unknown>;
    constructor(code: string, details?: Record<string, unknown>) {
      super(code);
      this.code = code;
      this.details = details;
    }
  }
  return {
    MockUiError,
    storeApiMock: {
      listModules: vi.fn().mockResolvedValue({ data: { storeId: "s1", modules: [] } }),
      createProduct: vi.fn(),
      updateProduct: vi.fn(),
      getProductAttributeValues: vi.fn().mockResolvedValue({ data: [] }),
      getCommercialMatrix: vi.fn().mockResolvedValue({ rows: [] }),
      getProductVariantSelections: vi.fn().mockResolvedValue({ data: [] }),
      listCategoryAttributes: vi.fn(),
      listAttributes: vi.fn(),
      listAttributeGroups: vi.fn(),
      listAttributeOptions: vi.fn(),
      listMedia: vi.fn().mockResolvedValue({ data: [] }),
      listCategorySelector: vi.fn(),
      uploadMedia: vi.fn(),
      deleteMedia: vi.fn(),
      // TODO-165A Task 22/23 — governed taksonomi listesi + satır-içi hızlı-ekle.
      listProductTaxonomy: vi.fn(),
      createProductTaxonomyValue: vi.fn(),
    },
  };
});

vi.mock("../lib/client/api.js", () => ({ storeApi: storeApiMock, UiError: MockUiError }));

const STATUS_LABELS = { DRAFT: "Draft", ACTIVE: "Active", ARCHIVED: "Archived" } as const;
const ISO = "2026-06-01T10:00:00.000Z";

function def(id: string, dataType: string, code: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    scope: "STORE",
    storeId: "s1",
    code,
    name: id,
    description: null,
    dataType,
    unit: null,
    status: "ACTIVE",
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}
function link(defId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `ca_${defId}`,
    storeId: "s1",
    categoryId: "c1",
    attributeDefinitionId: defId,
    groupId: null,
    required: false,
    filterable: false,
    searchable: false,
    comparable: false,
    variantDefining: false,
    visibleOnProductPage: true,
    visibleOnListing: false,
    displayOrder: 0,
    validationRules: {},
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}
function option(id: string, defId: string, label: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    attributeDefinitionId: defId,
    storeId: "s1",
    value: id,
    label,
    colorHex: null,
    sortOrder: 0,
    status: "ACTIVE",
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}
function taxonomyValue(id: string, type: string, name: string, attributeOptionId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    storeId: "s1",
    type,
    name,
    slug: name.toLowerCase(),
    status: "ACTIVE",
    displayOrder: 0,
    metadata: {},
    parentId: null,
    attributeOptionId,
    createdAt: ISO,
    updatedAt: ISO,
    usageCount: 0,
    ...overrides,
  };
}

// Şema: Season (SELECT, code fashion.season, governed), Material (MULTI_SELECT, code
// fashion.material, governed), Vendor Code (TEXT, code vendor_code, NON-governed —
// generic AttributeSection'da kalmalı).
function installSchema() {
  storeApiMock.listAttributes.mockResolvedValue({
    data: [
      def("d_season", "SELECT", "fashion.season", { name: "Season" }),
      def("d_material", "MULTI_SELECT", "fashion.material", { name: "Material" }),
      def("d_vendor", "TEXT", "vendor_code", { name: "Vendor Code" }),
    ],
  });
  storeApiMock.listAttributeGroups.mockResolvedValue({ data: [] });
  storeApiMock.listCategoryAttributes.mockResolvedValue({
    data: [
      link("d_season", { displayOrder: 0 }),
      link("d_material", { displayOrder: 1 }),
      link("d_vendor", { displayOrder: 2 }),
    ],
  });
  // Generic option kaynağı (use-category-attributes.ts) — legacy fallback etiket
  // çözümü için de kullanılır (bkz. taxonomy-select-field.tsx yorum).
  storeApiMock.listAttributeOptions.mockImplementation((attributeId: string) => {
    if (attributeId === "d_season") {
      return Promise.resolve({
        data: [
          option("opt_summer", "d_season", "Yaz"),
          option("opt_legacy_winter", "d_season", "Kış (Legacy Global)"),
        ],
      });
    }
    if (attributeId === "d_material") {
      return Promise.resolve({ data: [option("opt_cotton", "d_material", "Pamuk")] });
    }
    return Promise.resolve({ data: [] });
  });
  // Taksonomi listesi (T8 çözümleyici sonucu — mağaza-güdümlü de-dupe edilmiş).
  // Season için yalnız "opt_summer" görünür → "opt_legacy_winter" artık listede YOK
  // (legacy senaryosunu tetikler).
  storeApiMock.listProductTaxonomy.mockImplementation((query: Record<string, unknown>) => {
    if (query?.type === "SEASON") {
      return Promise.resolve({
        data: [taxonomyValue("tv_summer", "SEASON", "Yaz", "opt_summer")],
        pagination: { page: 1, pageSize: 100, total: 1, totalItems: 1, totalPages: 1, limit: 100, offset: 0 },
      });
    }
    if (query?.type === "MATERIAL") {
      return Promise.resolve({
        data: [taxonomyValue("tv_cotton", "MATERIAL", "Pamuk", "opt_cotton")],
        pagination: { page: 1, pageSize: 100, total: 1, totalItems: 1, totalPages: 1, limit: 100, offset: 0 },
      });
    }
    return Promise.resolve({
      data: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalItems: 0, totalPages: 0, limit: 100, offset: 0 },
    });
  });
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1", storeId: "s1", title: "Sweatshirt", slug: "sweatshirt", description: null,
    status: "ACTIVE", type: "PHYSICAL", vendor: null, brand: null, seoTitle: null, seoDescription: null,
    salesMode: "ONLINE", priceVisibility: "VISIBLE", primaryAction: "ADD_TO_CART", purchasable: true,
    inquiryEnabled: false, appointmentRequired: false, whatsappEnabled: false, minOrderQuantity: 1,
    maxOrderQuantity: null, callToActionLabel: null, whatsappMessageTemplate: null, inquiryFormTitle: null,
    appointmentNote: null, categoryIds: [], primaryCategoryId: null, images: [], shippingWeightKg: null,
    shippingDesi: null, createdAt: ISO, updatedAt: ISO, ...overrides,
  };
}
function cat(id: string, name: string) {
  return {
    id, storeId: "s1", name, slug: id, parentId: null, sortOrder: 0, status: "ACTIVE",
    imageId: null, imageUrl: null, createdAt: ISO, updatedAt: ISO,
  };
}

function renderCreate(categories: { id: string; name: string }[] = [cat("c1", "Apparel")]) {
  storeApiMock.listCategorySelector.mockImplementation(makeCategorySelectorFake(categories));
  return render(
    <LocaleProvider locale="en">
      <ProductForm mode="create" statusLabels={STATUS_LABELS} formId="pf" onSaved={vi.fn()} />
      <button form="pf" type="submit">save</button>
    </LocaleProvider>,
  );
}

function renderEdit(product: unknown, categories: { id: string; name: string }[] = [cat("c1", "Apparel")]) {
  storeApiMock.listCategorySelector.mockImplementation(makeCategorySelectorFake(categories));
  return render(
    <LocaleProvider locale="en">
      <ProductForm mode="edit" product={product as never} statusLabels={STATUS_LABELS} formId="pf" onSaved={vi.fn()} />
      <button form="pf" type="submit">save</button>
    </LocaleProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProductForm fashion attributes (TODO-165A Task 22/23)", () => {
  it("renders governed SELECT/MULTI_SELECT from the taxonomy list (no hardcoded options) and non-governed attribute stays on the generic path", async () => {
    const user = userEvent.setup();
    installSchema();
    renderCreate();

    await pickInSelector(user, /Apparel/, 1);

    await waitFor(() => expect(storeApiMock.listProductTaxonomy).toHaveBeenCalled());
    // Taksonomi tip parametreleriyle çağrıldı (SEASON/MATERIAL), sabit dizi YOK.
    const calledTypes = storeApiMock.listProductTaxonomy.mock.calls.map((call: unknown[]) => (call[0] as Record<string, unknown>).type);
    expect(calledTypes).toContain("SEASON");
    expect(calledTypes).toContain("MATERIAL");

    await waitFor(() => expect(screen.getByRole("option", { name: /Yaz/ })).toBeTruthy());
    expect(screen.getByRole("option", { name: /Pamuk/ })).toBeTruthy();

    // Governed olmayan Vendor Code, generic AttributeSection'da (Input) kalır.
    expect(screen.getByLabelText(/Vendor Code/)).toBeTruthy();
  });

  it("submits the taxonomy value's attributeOptionId through the existing attribute-values payload (single writer)", async () => {
    const user = userEvent.setup();
    installSchema();
    storeApiMock.createProduct.mockResolvedValue(makeProduct());
    renderCreate();

    await user.type(screen.getByLabelText("Product name"), "Tee");
    await user.type(screen.getByLabelText("Slug"), "tee");
    await pickInSelector(user, /Apparel/, 1);

    await waitFor(() => expect(screen.getByRole("option", { name: /Yaz/ })).toBeTruthy());
    await user.click(screen.getByRole("option", { name: /Yaz/ }));
    await user.click(screen.getByRole("option", { name: /Pamuk/ }));

    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(storeApiMock.createProduct).toHaveBeenCalledTimes(1));
    const payload = storeApiMock.createProduct.mock.calls[0]![0] as {
      attributeValues: Array<Record<string, unknown>>;
    };
    // Gönderilen değer taksonomi değerinin attributeOptionId'sidir (mağaza-kapsamlı) —
    // taksonomi kaydının kendi id'si (tv_summer) DEĞİL.
    expect(payload.attributeValues).toContainEqual({ attributeDefinitionId: "d_season", optionId: "opt_summer" });
    expect(payload.attributeValues).toContainEqual({ attributeDefinitionId: "d_material", optionIds: ["opt_cotton"] });
  });

  it("edit round-trip: taxonomy-backed value pre-selects on load and survives an unrelated re-save", async () => {
    const user = userEvent.setup();
    installSchema();
    storeApiMock.updateProduct.mockResolvedValue(makeProduct());
    storeApiMock.getProductAttributeValues.mockResolvedValue({
      data: [
        {
          id: "v1", attributeDefinitionId: "d_season", dataType: "SELECT", valueText: null,
          valueInteger: null, valueDecimal: null, valueBoolean: null, valueDate: null,
          optionId: "opt_summer", optionIds: [], mediaId: null, createdAt: ISO, updatedAt: ISO,
        },
        {
          id: "v2", attributeDefinitionId: "d_material", dataType: "MULTI_SELECT", valueText: null,
          valueInteger: null, valueDecimal: null, valueBoolean: null, valueDate: null,
          optionId: null, optionIds: ["opt_cotton"], mediaId: null, createdAt: ISO, updatedAt: ISO,
        },
      ],
    });

    renderEdit(makeProduct({ categoryIds: ["c1"], primaryCategoryId: "c1" }));

    await waitFor(() => expect(screen.getByRole("option", { name: /Yaz/ })).toBeTruthy());
    expect(screen.getByRole("option", { name: /Yaz/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: /Pamuk/ }).getAttribute("aria-selected")).toBe("true");

    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(storeApiMock.updateProduct).toHaveBeenCalledTimes(1));
    const payload = storeApiMock.updateProduct.mock.calls[0]![1] as {
      attributeValues: Array<Record<string, unknown>>;
    };
    expect(payload.attributeValues).toContainEqual({ attributeDefinitionId: "d_season", optionId: "opt_summer" });
    expect(payload.attributeValues).toContainEqual({ attributeDefinitionId: "d_material", optionIds: ["opt_cotton"] });
  });

  it("a legacy global-option assignment (not in the store's taxonomy list) still reads with the correct label", async () => {
    installSchema();
    storeApiMock.getProductAttributeValues.mockResolvedValue({
      data: [
        {
          id: "v1", attributeDefinitionId: "d_season", dataType: "SELECT", valueText: null,
          valueInteger: null, valueDecimal: null, valueBoolean: null, valueDate: null,
          // opt_legacy_winter taksonomi listesinde YOK (yalnız opt_summer var) — legacy global atama.
          optionId: "opt_legacy_winter", optionIds: [], mediaId: null, createdAt: ISO, updatedAt: ISO,
        },
      ],
    });

    renderEdit(makeProduct({ categoryIds: ["c1"], primaryCategoryId: "c1" }));

    await waitFor(() => expect(screen.getByRole("option", { name: /Kış \(Legacy Global\)/ })).toBeTruthy());
    expect(screen.getByRole("option", { name: /Kış \(Legacy Global\)/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("inline quick-add creates a taxonomy value, auto-selects it WITHOUT remounting the form, and surfaces a 409 duplicate", async () => {
    const user = userEvent.setup();
    installSchema();
    renderCreate();

    await user.type(screen.getByLabelText("Product name"), "Trail Jacket");
    await pickInSelector(user, /Apparel/, 1);
    await waitFor(() => expect(screen.getByRole("option", { name: /Yaz/ })).toBeTruthy());

    // Governed attribute'lar `displayOrder` sırasıyla render edilir (Season önce, Material
    // sonra) — ilk "+ Yeni ekle" Season alanına aittir.
    const quickAddButtons = screen.getAllByRole("button", { name: "＋ Yeni ekle" });
    await user.click(quickAddButtons[0]!);

    // Duplicate → 409 TAXONOMY_DUPLICATE Türkçe mesaja çevrilir.
    storeApiMock.createProductTaxonomyValue.mockRejectedValueOnce(new MockUiError("TAXONOMY_DUPLICATE"));
    await user.type(screen.getByLabelText("Ad"), "Yaz");
    await user.click(screen.getByRole("button", { name: "Oluştur" }));
    await waitFor(() =>
      expect(screen.getByText("Bu isim (veya kısa ad) bu sözlükte zaten kullanılıyor.")).toBeTruthy(),
    );

    // Şimdi başarılı: yeni değer oluşturulur, OTOMATİK seçilir, listeye ENJEKTE edilir.
    storeApiMock.createProductTaxonomyValue.mockResolvedValueOnce({
      data: taxonomyValue("tv_autumn", "SEASON", "Sonbahar", "opt_autumn"),
    });
    await user.clear(screen.getByLabelText("Ad"));
    await user.type(screen.getByLabelText("Ad"), "Sonbahar");
    await user.click(screen.getByRole("button", { name: "Oluştur" }));

    await waitFor(() => expect(screen.getByRole("option", { name: /Sonbahar/ }).getAttribute("aria-selected")).toBe("true"));
    // Form REMOUNT OLMADI: başlık değeri korunur.
    expect((screen.getByLabelText("Product name") as HTMLInputElement).value).toBe("Trail Jacket");
  });
});
