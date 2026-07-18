// @vitest-environment jsdom
// Faz 2B (TODO-146) — Dinamik, kategori-güdümlü ürün formu entegrasyon testleri.
// Kanıtlanan: kategori değişince attribute fetch + gruplu/sıralı render, required,
// validationRules, save payload (Faz 2A formatı), edit round-trip, boş/legacy kategori,
// sunucu hata → alan eşlemesi, memoization.
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@commerce-os/ui";
import { ProductForm } from "../app/(app)/products/product-form";

const { storeApiMock, MockUiError } = vi.hoisted(() => {
  class MockUiError extends Error {
    readonly code: string;
    readonly details?: { attributeDefinitionId?: string };
    constructor(code: string, details?: { attributeDefinitionId?: string }) {
      super(code);
      this.code = code;
      this.details = details;
    }
  }
  return {
    MockUiError,
    storeApiMock: {
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
      uploadMedia: vi.fn(),
      deleteMedia: vi.fn(),
    },
  };
});

vi.mock("../lib/client/api.js", () => ({ storeApi: storeApiMock, UiError: MockUiError }));

const STATUS_LABELS = { DRAFT: "Draft", ACTIVE: "Active", ARCHIVED: "Archived" } as const;
const ISO = "2026-06-01T10:00:00.000Z";

// ── Attribute metadata fabrikaları ──
function def(id: string, dataType: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    scope: "STORE",
    storeId: "s1",
    code: id,
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
function group(id: string, name: string, sortOrder = 0) {
  return { id, storeId: "s1", name, description: null, sortOrder, createdAt: ISO, updatedAt: ISO };
}

// Şema: Material (TEXT, required, minLength 3, general, order 1), Waterproof (BOOLEAN,
// general, order 0), Color (SELECT, group Specs, order 2), Size (MULTI_SELECT, Specs, order 3).
function installSchema() {
  storeApiMock.listAttributes.mockResolvedValue({
    data: [
      def("dm", "TEXT", { name: "Material" }),
      def("dw", "BOOLEAN", { name: "Waterproof" }),
      def("dc", "SELECT", { name: "Color" }),
      def("dz", "MULTI_SELECT", { name: "Size" }),
    ],
  });
  storeApiMock.listAttributeGroups.mockResolvedValue({ data: [group("g1", "Specs", 0)] });
  storeApiMock.listCategoryAttributes.mockResolvedValue({
    data: [
      link("dm", { required: true, displayOrder: 1, validationRules: { minLength: 3 } }),
      link("dw", { displayOrder: 0 }),
      link("dc", { groupId: "g1", displayOrder: 2 }),
      link("dz", { groupId: "g1", displayOrder: 3 }),
    ],
  });
  storeApiMock.listAttributeOptions.mockImplementation((attributeId: string) => {
    if (attributeId === "dc") {
      return Promise.resolve({ data: [option("o_red", "dc", "Red"), option("o_blue", "dc", "Blue")] });
    }
    if (attributeId === "dz") {
      return Promise.resolve({ data: [option("o_s", "dz", "S"), option("o_m", "dz", "M")] });
    }
    return Promise.resolve({ data: [] });
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

function renderCreate(categories: unknown[] = [cat("c1", "Apparel")]) {
  return render(
    <LocaleProvider locale="en">
      <ProductForm
        mode="create"
        categories={categories as never}
        statusLabels={STATUS_LABELS}
        formId="pf"
        onSaved={vi.fn()}
      />
      <button form="pf" type="submit">save</button>
    </LocaleProvider>,
  );
}

function renderEdit(product: unknown, categories: unknown[] = [cat("c1", "Apparel")]) {
  return render(
    <LocaleProvider locale="en">
      <ProductForm
        mode="edit"
        product={product as never}
        categories={categories as never}
        statusLabels={STATUS_LABELS}
        formId="pf"
        onSaved={vi.fn()}
      />
      <button form="pf" type="submit">save</button>
    </LocaleProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProductForm dynamic attributes (Faz 2B / TODO-146)", () => {
  it("fetches and renders category attributes, grouped and ordered, on category selection", async () => {
    const user = userEvent.setup();
    installSchema();
    renderCreate();

    // Kategori seçilmeden attribute yok.
    expect(screen.queryByText("Material")).toBeNull();

    await user.click(screen.getByLabelText("Apparel"));

    await waitFor(() => expect(screen.getByText("Material")).toBeTruthy());
    // Grup başlıkları: General + Specs.
    expect(screen.getByText("General attributes")).toBeTruthy();
    expect(screen.getByText("Specs")).toBeTruthy();
    // Tüm alanlar geldi.
    expect(screen.getByText("Waterproof")).toBeTruthy();
    expect(screen.getByText("Color")).toBeTruthy();
    expect(screen.getByText("Size")).toBeTruthy();

    // Sıralama: General içinde Waterproof (order 0) Material'dan (order 1) önce.
    const generalText = document.body.textContent ?? "";
    expect(generalText.indexOf("Waterproof")).toBeLessThan(generalText.indexOf("Material"));
    // Faz 2C-1: useCategoryAttributes + useVariantAttributes iki ayrı tüketici → kategori
    // başına 2 çağrı (her ikisi de bu uçtan okur; her biri kendi içinde memoize eder).
    expect(storeApiMock.listCategoryAttributes).toHaveBeenCalledTimes(2);
  });

  it("blocks save when a required attribute is empty", async () => {
    const user = userEvent.setup();
    installSchema();
    renderCreate();

    await user.type(screen.getByLabelText("Product name"), "Tee");
    await user.type(screen.getByLabelText("Slug"), "tee");
    await user.click(screen.getByLabelText("Apparel"));
    await waitFor(() => expect(screen.getByText("Material")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(screen.getByText("This field is required.")).toBeTruthy());
    expect(storeApiMock.createProduct).not.toHaveBeenCalled();
  });

  it("applies validationRules (minLength) before save", async () => {
    const user = userEvent.setup();
    installSchema();
    renderCreate();

    await user.type(screen.getByLabelText("Product name"), "Tee");
    await user.type(screen.getByLabelText("Slug"), "tee");
    await user.click(screen.getByLabelText("Apparel"));
    await waitFor(() => expect(screen.getByText("Material")).toBeTruthy());

    await user.type(screen.getByLabelText(/Material/), "ab"); // < minLength 3
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(screen.getByText("Must be at least 3 characters.")).toBeTruthy());
    expect(storeApiMock.createProduct).not.toHaveBeenCalled();
  });

  it("builds a Phase 2A attributeValues payload on save", async () => {
    const user = userEvent.setup();
    installSchema();
    storeApiMock.createProduct.mockResolvedValue(makeProduct());
    renderCreate();

    await user.type(screen.getByLabelText("Product name"), "Tee");
    await user.type(screen.getByLabelText("Slug"), "tee");
    await user.click(screen.getByLabelText("Apparel"));
    await waitFor(() => expect(screen.getByText("Material")).toBeTruthy());

    await user.type(screen.getByLabelText(/Material/), "Cotton");
    await user.selectOptions(screen.getByLabelText(/Color/), "o_red");
    await user.click(screen.getByRole("checkbox", { name: "S" }));
    await user.click(screen.getByRole("checkbox", { name: "M" }));
    await user.click(screen.getByRole("checkbox", { name: /Waterproof/ }));

    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(storeApiMock.createProduct).toHaveBeenCalledTimes(1));
    const payload = storeApiMock.createProduct.mock.calls[0]![0] as {
      attributeValues: Array<Record<string, unknown>>;
    };
    expect(payload.attributeValues).toContainEqual({ attributeDefinitionId: "dm", valueText: "Cotton" });
    expect(payload.attributeValues).toContainEqual({ attributeDefinitionId: "dc", optionId: "o_red" });
    expect(payload.attributeValues).toContainEqual({ attributeDefinitionId: "dz", optionIds: ["o_s", "o_m"] });
    expect(payload.attributeValues).toContainEqual({ attributeDefinitionId: "dw", valueBoolean: true });
  });

  it("hydrates existing attribute values on edit and round-trips them on save", async () => {
    const user = userEvent.setup();
    installSchema();
    storeApiMock.updateProduct.mockResolvedValue(makeProduct());
    storeApiMock.getProductAttributeValues.mockResolvedValue({
      data: [
        {
          id: "v1", attributeDefinitionId: "dm", dataType: "TEXT", valueText: "Wool",
          valueInteger: null, valueDecimal: null, valueBoolean: null, valueDate: null,
          optionId: null, optionIds: [], mediaId: null, createdAt: ISO, updatedAt: ISO,
        },
        {
          id: "v2", attributeDefinitionId: "dc", dataType: "SELECT", valueText: null,
          valueInteger: null, valueDecimal: null, valueBoolean: null, valueDate: null,
          optionId: "o_blue", optionIds: [], mediaId: null, createdAt: ISO, updatedAt: ISO,
        },
      ],
    });

    renderEdit(makeProduct({ categoryIds: ["c1"], primaryCategoryId: "c1" }));

    await waitFor(() => expect((screen.getByLabelText(/Material/) as HTMLInputElement).value).toBe("Wool"));
    expect((screen.getByLabelText(/Color/) as HTMLSelectElement).value).toBe("o_blue");

    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(storeApiMock.updateProduct).toHaveBeenCalledTimes(1));
    const payload = storeApiMock.updateProduct.mock.calls[0]![1] as {
      attributeValues: Array<Record<string, unknown>>;
    };
    expect(payload.attributeValues).toContainEqual({ attributeDefinitionId: "dm", valueText: "Wool" });
    expect(payload.attributeValues).toContainEqual({ attributeDefinitionId: "dc", optionId: "o_blue" });
    // Waterproof (BOOLEAN) her zaman gönderilir (false).
    expect(payload.attributeValues).toContainEqual({ attributeDefinitionId: "dw", valueBoolean: false });
  });

  it("legacy category (no attributes) renders nothing and sends no attributeValues", async () => {
    const user = userEvent.setup();
    storeApiMock.listAttributes.mockResolvedValue({ data: [] });
    storeApiMock.listAttributeGroups.mockResolvedValue({ data: [] });
    storeApiMock.listCategoryAttributes.mockResolvedValue({ data: [] });
    storeApiMock.createProduct.mockResolvedValue(makeProduct());
    renderCreate();

    await user.type(screen.getByLabelText("Product name"), "Tee");
    await user.type(screen.getByLabelText("Slug"), "tee");
    await user.click(screen.getByLabelText("Apparel"));
    await waitFor(() => expect(storeApiMock.listCategoryAttributes).toHaveBeenCalled());

    // Hiçbir attribute grubu render edilmedi.
    expect(screen.queryByText("General attributes")).toBeNull();

    await user.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(storeApiMock.createProduct).toHaveBeenCalledTimes(1));
    const payload = storeApiMock.createProduct.mock.calls[0]![0] as Record<string, unknown>;
    expect("attributeValues" in payload).toBe(false);
  });

  it("maps a backend attribute error to the field", async () => {
    const user = userEvent.setup();
    installSchema();
    storeApiMock.createProduct.mockRejectedValue(
      new MockUiError("ATTRIBUTE_OPTION_INVALID", { attributeDefinitionId: "dc" }),
    );
    renderCreate();

    await user.type(screen.getByLabelText("Product name"), "Tee");
    await user.type(screen.getByLabelText("Slug"), "tee");
    await user.click(screen.getByLabelText("Apparel"));
    await waitFor(() => expect(screen.getByText("Material")).toBeTruthy());
    await user.type(screen.getByLabelText(/Material/), "Cotton");

    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() =>
      expect(screen.getByText("The selected option is invalid.")).toBeTruthy(),
    );
  });

  it("memoizes: re-selecting the same category does not refetch attributes", async () => {
    const user = userEvent.setup();
    installSchema();
    renderCreate();

    await user.click(screen.getByLabelText("Apparel"));
    await waitFor(() => expect(screen.getByText("Material")).toBeTruthy());
    // Kategoriyi kaldır (primary null → attribute yok), sonra tekrar ekle.
    await user.click(screen.getByLabelText("Apparel"));
    await waitFor(() => expect(screen.queryByText("Material")).toBeNull());
    await user.click(screen.getByLabelText("Apparel"));
    await waitFor(() => expect(screen.getByText("Material")).toBeTruthy());

    // Cache: her tüketici (product + variant hook) kategori başına yalnız BİR kez çağırdı →
    // toplam 2; yeniden seçim yeniden fetch ETMEZ (aksi halde 4 olurdu). Memoization korunur.
    expect(storeApiMock.listCategoryAttributes).toHaveBeenCalledTimes(2);
  });
});
