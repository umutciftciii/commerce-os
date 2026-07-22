// @vitest-environment jsdom
// Faz 2C-1 (ADR-070) — "Variant Attributes" bölümü entegrasyon testleri.
// Kanıtlanan: yalnız variantDefining=true + option-tabanlı attribute render, eksen/option seçimi,
// enabled-eksende ≥1 option client doğrulaması, archived option gizlenir, save payload
// (variantSelections), edit round-trip, legacy (variantDefining yok → gönderim yok), sunucu hata
// → eksene eşleme. KOMBINASYON URETILMEZ (yalnız seçim).
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@commerce-os/ui";
import { ProductForm } from "../app/(app)/products/product-form";
import { makeCategorySelectorFake, pickInSelector } from "./selector-test-utils";

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
      // Faz 2C-2 — düzenleme modunda eksen varsa combination preview çekilir (yalnız okuma).
      getVariantCombinationPreview: vi
        .fn()
        .mockResolvedValue({ axisCount: 0, totalCombinations: 0, combinations: [] }),
      listCategoryAttributes: vi.fn(),
      listAttributes: vi.fn(),
      listAttributeGroups: vi.fn().mockResolvedValue({ data: [] }),
      listAttributeOptions: vi.fn(),
      listMedia: vi.fn().mockResolvedValue({ data: [] }),
      // TODO-159B (ADR-090) — kategori ataması aranabilir seçiciden geçer.
      listCategorySelector: vi.fn(),
      uploadMedia: vi.fn(),
      deleteMedia: vi.fn(),
    },
  };
});

vi.mock("../lib/client/api.js", () => ({ storeApi: storeApiMock, UiError: MockUiError }));

const STATUS_LABELS = { DRAFT: "Draft", ACTIVE: "Active", ARCHIVED: "Archived" } as const;
const ISO = "2026-07-17T10:00:00.000Z";

function def(id: string, dataType: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id, scope: "STORE", storeId: "s1", code: id, name, description: null, dataType, unit: null,
    status: "ACTIVE", createdAt: ISO, updatedAt: ISO, ...overrides,
  };
}
function link(defId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `ca_${defId}`, storeId: "s1", categoryId: "c1", attributeDefinitionId: defId, groupId: null,
    required: false, filterable: false, searchable: false, comparable: false, variantDefining: false,
    visibleOnProductPage: true, visibleOnListing: false, displayOrder: 0, validationRules: {},
    createdAt: ISO, updatedAt: ISO, ...overrides,
  };
}
function option(id: string, defId: string, label: string, overrides: Record<string, unknown> = {}) {
  return {
    id, attributeDefinitionId: defId, storeId: "s1", value: id, label, colorHex: null, sortOrder: 0,
    status: "ACTIVE", createdAt: ISO, updatedAt: ISO, ...overrides,
  };
}

// Şema: Colour (SELECT, variantDefining) options Black/White/Blue(archived); Size (COLOR,
// variantDefining) options S/M; Material (TEXT, variantDefining → option-tabanlı DEĞİL, DIŞLANIR);
// Fabric (SELECT, variantDefining=false → ürün-seviyesi, varyant bölümünde DIŞLANIR).
function installSchema() {
  storeApiMock.listAttributes.mockResolvedValue({
    data: [
      def("dc", "SELECT", "Colour"),
      def("ds", "COLOR", "SizeAxis"),
      def("dm", "TEXT", "MaterialAxis"),
      def("df", "SELECT", "FabricLevel"),
    ],
  });
  storeApiMock.listCategoryAttributes.mockResolvedValue({
    data: [
      link("dc", { variantDefining: true, displayOrder: 0 }),
      link("ds", { variantDefining: true, displayOrder: 1 }),
      link("dm", { variantDefining: true, displayOrder: 2 }),
      link("df", { variantDefining: false, displayOrder: 3 }),
    ],
  });
  storeApiMock.listAttributeOptions.mockImplementation((attributeId: string) => {
    if (attributeId === "dc") {
      return Promise.resolve({
        data: [
          option("black", "dc", "Black"),
          option("white", "dc", "White"),
          option("blue", "dc", "Blue", { status: "ARCHIVED" }),
        ],
      });
    }
    if (attributeId === "ds") {
      return Promise.resolve({ data: [option("s", "ds", "SmallOpt"), option("m", "ds", "MediumOpt")] });
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

describe("ProductForm variant attributes (Faz 2C-1 / TODO-147)", () => {
  it("renders only variantDefining option-based attributes; excludes TEXT + product-level", async () => {
    const user = userEvent.setup();
    installSchema();
    renderCreate();

    expect(screen.queryByText("Colour")).toBeNull();
    await pickInSelector(user, /Apparel/);

    await waitFor(() => expect(screen.getByText("Variant attributes")).toBeTruthy());
    // Varyant bölümüne özel sorgula (FabricLevel ürün-seviyesi bölümünde görünür — o bölüm ayrı).
    const section = screen.getByText("Variant attributes").closest("div.space-y-4") as HTMLElement;
    const scoped = within(section);
    // variantDefining + option-tabanlı görünür.
    expect(scoped.getByText("Colour")).toBeTruthy();
    expect(scoped.getByText("SizeAxis")).toBeTruthy();
    // variantDefining ama TEXT → hariç; variantDefining=false → varyant bölümünde hariç.
    expect(scoped.queryByText("MaterialAxis")).toBeNull();
    expect(scoped.queryByText("FabricLevel")).toBeNull();
  });

  it("reveals options after enabling an axis; hides archived options", async () => {
    const user = userEvent.setup();
    installSchema();
    renderCreate();
    await pickInSelector(user, /Apparel/);
    await waitFor(() => expect(screen.getByText("Colour")).toBeTruthy());

    // Eksen kapalıyken option yok.
    expect(screen.queryByRole("checkbox", { name: "Black" })).toBeNull();

    await user.click(screen.getByLabelText("Colour"));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Black" })).toBeTruthy());
    expect(screen.getByRole("checkbox", { name: "White" })).toBeTruthy();
    // Archived option (Blue) hiç gelmez.
    expect(screen.queryByRole("checkbox", { name: "Blue" })).toBeNull();
  });

  it("builds a variantSelections payload on save (option selection)", async () => {
    const user = userEvent.setup();
    installSchema();
    storeApiMock.createProduct.mockResolvedValue(makeProduct());
    renderCreate();

    await user.type(screen.getByLabelText("Product name"), "Tee");
    await user.type(screen.getByLabelText("Slug"), "tee");
    await pickInSelector(user, /Apparel/);
    await waitFor(() => expect(screen.getByText("Colour")).toBeTruthy());

    await user.click(screen.getByLabelText("Colour"));
    await user.click(await screen.findByRole("checkbox", { name: "Black" }));
    await user.click(screen.getByRole("checkbox", { name: "White" }));

    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(storeApiMock.createProduct).toHaveBeenCalledTimes(1));
    const payload = storeApiMock.createProduct.mock.calls[0]![0] as {
      variantSelections: Array<{ attributeDefinitionId: string; optionIds: string[] }>;
    };
    expect(payload.variantSelections).toEqual([{ attributeDefinitionId: "dc", optionIds: ["black", "white"] }]);
  });

  it("blocks save when an enabled axis has no options (option required)", async () => {
    const user = userEvent.setup();
    installSchema();
    renderCreate();

    await user.type(screen.getByLabelText("Product name"), "Tee");
    await user.type(screen.getByLabelText("Slug"), "tee");
    await pickInSelector(user, /Apparel/);
    await waitFor(() => expect(screen.getByText("Colour")).toBeTruthy());

    await user.click(screen.getByLabelText("Colour")); // enable, seçme
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() =>
      expect(screen.getByText("Select at least one option for this variant attribute.")).toBeTruthy(),
    );
    expect(storeApiMock.createProduct).not.toHaveBeenCalled();
  });

  it("sends no variantSelections and renders nothing for a legacy category (no variant attributes)", async () => {
    const user = userEvent.setup();
    storeApiMock.listAttributes.mockResolvedValue({ data: [] });
    storeApiMock.listCategoryAttributes.mockResolvedValue({ data: [] });
    storeApiMock.createProduct.mockResolvedValue(makeProduct());
    renderCreate();

    await user.type(screen.getByLabelText("Product name"), "Tee");
    await user.type(screen.getByLabelText("Slug"), "tee");
    await pickInSelector(user, /Apparel/);
    await waitFor(() => expect(storeApiMock.listCategoryAttributes).toHaveBeenCalled());

    expect(screen.queryByText("Variant attributes")).toBeNull();

    await user.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(storeApiMock.createProduct).toHaveBeenCalledTimes(1));
    const payload = storeApiMock.createProduct.mock.calls[0]![0] as Record<string, unknown>;
    expect("variantSelections" in payload).toBe(false);
  });

  it("hydrates existing variant selections on edit and round-trips them on save", async () => {
    const user = userEvent.setup();
    installSchema();
    storeApiMock.updateProduct.mockResolvedValue(makeProduct());
    storeApiMock.getProductVariantSelections.mockResolvedValue({
      data: [
        { attributeDefinitionId: "dc", dataType: "SELECT", position: 0, optionIds: ["black"], createdAt: ISO, updatedAt: ISO },
      ],
    });

    renderEdit(makeProduct({ categoryIds: ["c1"], primaryCategoryId: "c1" }));

    // Colour ekseni önceden seçili + Black işaretli gelir.
    await waitFor(() => expect((screen.getByRole("checkbox", { name: "Black" }) as HTMLInputElement).checked).toBe(true));
    expect((screen.getByRole("checkbox", { name: "White" }) as HTMLInputElement).checked).toBe(false);

    // White ekle, save.
    await user.click(screen.getByRole("checkbox", { name: "White" }));
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(storeApiMock.updateProduct).toHaveBeenCalledTimes(1));
    const payload = storeApiMock.updateProduct.mock.calls[0]![1] as {
      variantSelections: Array<{ attributeDefinitionId: string; optionIds: string[] }>;
    };
    expect(payload.variantSelections).toEqual([{ attributeDefinitionId: "dc", optionIds: ["black", "white"] }]);
  });

  it("maps a backend variant selection error to the axis", async () => {
    const user = userEvent.setup();
    installSchema();
    storeApiMock.createProduct.mockRejectedValue(
      new MockUiError("VARIANT_OPTION_INVALID", { attributeDefinitionId: "dc" }),
    );
    renderCreate();

    await user.type(screen.getByLabelText("Product name"), "Tee");
    await user.type(screen.getByLabelText("Slug"), "tee");
    await pickInSelector(user, /Apparel/);
    await waitFor(() => expect(screen.getByText("Colour")).toBeTruthy());
    await user.click(screen.getByLabelText("Colour"));
    await user.click(await screen.findByRole("checkbox", { name: "Black" }));

    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(screen.getByText("One of the selected options is invalid.")).toBeTruthy());
  });
});
