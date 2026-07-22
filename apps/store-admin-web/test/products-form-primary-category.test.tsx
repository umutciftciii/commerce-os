// @vitest-environment jsdom
// Faz 1A (ADR-067) — ProductForm ana kategori UX component smoke'u. Kanıtlanan:
//  • tek kategori seçilince otomatik ana olur (submit payload primaryCategoryId),
//  • ikinci kategori eklenince mevcut ana korunur + "Primary category" rozeti,
//  • ana kategori kaldırılıp çok kategori kalınca submit ENGELLENIR (backend'e gitmez),
//  • edit'te backfill edilmiş ana kategori doğru hydrate edilir.
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
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    MockUiError,
    storeApiMock: {
      updateProduct: vi.fn(),
      createProduct: vi.fn(),
      listMedia: vi.fn(),
      // TODO-159B (ADR-090) — kategori ataması aranabilir seçiciden geçer.
      listCategorySelector: vi.fn(),
      uploadMedia: vi.fn(),
      deleteMedia: vi.fn(),
      // Faz 2B — dinamik attribute form'u kategori seçilince bu uçları çağırır.
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
    status: "ACTIVE", type: "PHYSICAL", vendor: null, brand: null, seoTitle: null, seoDescription: null,
    salesMode: "ONLINE", priceVisibility: "VISIBLE", primaryAction: "ADD_TO_CART", purchasable: true,
    inquiryEnabled: false, appointmentRequired: false, whatsappEnabled: false, minOrderQuantity: 1,
    maxOrderQuantity: null, callToActionLabel: null, whatsappMessageTemplate: null, inquiryFormTitle: null,
    appointmentNote: null, categoryIds: [], primaryCategoryId: null, images: [], shippingWeightKg: null,
    shippingDesi: null, createdAt: new Date("2026-06-01T10:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-06-01T10:00:00.000Z").toISOString(), ...overrides,
  };
}

function cat(id: string, name: string) {
  return {
    id, storeId: "s1", name, slug: id, parentId: null, sortOrder: 0, status: "ACTIVE",
    imageId: null, imageUrl: null,
    createdAt: new Date("2026-06-01T10:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-06-01T10:00:00.000Z").toISOString(),
  };
}

function renderForm(product: unknown, categories: { id: string; name: string }[]) {
  storeApiMock.listCategorySelector.mockImplementation(makeCategorySelectorFake(categories));
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

describe("ProductForm ana kategori (Faz 1A / ADR-067)", () => {
  it("tek kategori seçilince otomatik ana olur ve submit payload'a girer", async () => {
    const user = userEvent.setup();
    storeApiMock.updateProduct.mockResolvedValue(makeProduct());
    renderForm(makeProduct(), [cat("c1", "Apparel"), cat("c2", "Accessories")]);

    await pickInSelector(user, /Apparel/);
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(storeApiMock.updateProduct).toHaveBeenCalledTimes(1));
    expect(storeApiMock.updateProduct).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ categoryIds: ["c1"], primaryCategoryId: "c1" }),
    );
  });

  it("ikinci kategori eklenince mevcut ana korunur ve görsel olarak işaretlenir", async () => {
    const user = userEvent.setup();
    storeApiMock.updateProduct.mockResolvedValue(makeProduct());
    renderForm(makeProduct({ categoryIds: ["c1"], primaryCategoryId: "c1" }), [cat("c1", "Apparel"), cat("c2", "Accessories")]);

    // Hydration: seçili kategori `ids` çözüm moduyla ASENKRON gelir; c1 ana →
    // "Primary category" rozeti tam 1 kez.
    await waitFor(() => expect(screen.getAllByText(/Primary category/).length).toBe(1));
    await pickInSelector(user, /Accessories/);
    // Ana hâlâ c1 → rozet hâlâ 1 (c2 "Make primary" gösterir).
    await waitFor(() => expect(screen.getByText("Make primary")).toBeTruthy());
    expect(screen.getAllByText(/Primary category/).length).toBe(1);

    await user.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(storeApiMock.updateProduct).toHaveBeenCalledTimes(1));
    expect(storeApiMock.updateProduct).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ categoryIds: ["c1", "c2"], primaryCategoryId: "c1" }),
    );
  });

  it("ana kategori kaldırılıp çok kategori kalınca submit ENGELLENIR (backend'e gitmez)", async () => {
    const user = userEvent.setup();
    renderForm(
      makeProduct({ categoryIds: ["c1", "c2", "c3"], primaryCategoryId: "c1" }),
      [cat("c1", "Apparel"), cat("c2", "Accessories"), cat("c3", "Home")],
    );
    // Ana kategori c1'i kaldır → [c2,c3] çoklu kalır, ana null olur.
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove Apparel" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Remove Apparel" }));
    await user.click(screen.getByRole("button", { name: "save" }));

    // Submit engellendi: hata gösterildi, updateProduct çağrılmadı.
    expect(
      screen.getByText("You selected multiple categories; choose a primary category."),
    ).toBeTruthy();
    expect(storeApiMock.updateProduct).not.toHaveBeenCalled();
  });

  it("edit'te backfill edilmiş ana kategori doğru hydrate edilir", async () => {
    renderForm(makeProduct({ categoryIds: ["c1", "c2"], primaryCategoryId: "c2" }), [cat("c1", "Apparel"), cat("c2", "Accessories")]);
    // c2 ana → "Primary category" rozeti; c1 "Make primary".
    await waitFor(() => expect(screen.getAllByText(/Primary category/).length).toBe(1));
    expect(screen.getByText("Make primary")).toBeTruthy();
  });

  it("seçili kategori arama sonucunda OLMASA BİLE görünür ve kaldırılabilir (TD-093)", async () => {
    const user = userEvent.setup();
    storeApiMock.updateProduct.mockResolvedValue(makeProduct());
    // Katalogda 120 kategori var; seçili olan SON sıradaki (ilk sayfada DEĞİL).
    const many = Array.from({ length: 120 }, (_, index) => cat(`c${index}`, `Cat ${index}`));
    renderForm(makeProduct({ categoryIds: ["c119"], primaryCategoryId: "c119" }), many);

    // `ids` çözüm modu sayesinde çip görünür — eski işaretli-kutu listesinde
    // (ilk 25 kayıt) bu kategori hiç RENDER EDİLMİYORDU.
    await waitFor(() => expect(screen.getByText("Cat 119")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Remove Cat 119" }));
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(storeApiMock.updateProduct).toHaveBeenCalledTimes(1));
    expect(storeApiMock.updateProduct).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ categoryIds: [], primaryCategoryId: null }),
    );
  });
});
