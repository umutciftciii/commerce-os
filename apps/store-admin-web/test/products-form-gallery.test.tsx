// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@commerce-os/ui";
import { ProductForm } from "../app/(app)/products/product-form";

// ADR-065 (Faz 2/Dilim 2) — ürün galerisi UI. Kanıtlanan davranışlar:
//  • edit'te initial.images → MediaUpload value'suna dolar (MediaItem.id = mediaId invariant),
//  • reorder sonrası submit payload'ı imageMediaIds sırasını doğru taşır,
//  • çıkarma sonrası imageMediaIds'ten düşer,
//  • CREATE modunda galeri bölümü HİÇ render edilmez (R5).
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
      // MediaUpload bunları yalnız yükleme/kütüphane etkileşiminde çağırır; bu
      // testlerde tetiklenmez ama modül çözümü için stub gerekir.
      listMedia: vi.fn(),
      uploadMedia: vi.fn(),
      deleteMedia: vi.fn(),
      // Faz 2B — dinamik attribute form'u için (bu testlerde kategori yok → tetiklenmez).
      listCategoryAttributes: vi.fn().mockResolvedValue({ data: [] }),
      listAttributes: vi.fn().mockResolvedValue({ data: [] }),
      listAttributeGroups: vi.fn().mockResolvedValue({ data: [] }),
      listAttributeOptions: vi.fn().mockResolvedValue({ data: [] }),
      getProductAttributeValues: vi.fn().mockResolvedValue({ data: [] }),
      getCommercialMatrix: vi.fn().mockResolvedValue({ rows: [] }),
    },
  };
});

vi.mock("../lib/client/api.js", () => ({
  storeApi: storeApiMock,
  UiError: MockUiError,
}));

const STATUS_LABELS = { DRAFT: "Draft", ACTIVE: "Active", ARCHIVED: "Archived" } as const;

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
    images: [],
    shippingWeightKg: null,
    shippingDesi: null,
    createdAt: new Date("2026-06-01T10:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-06-01T10:00:00.000Z").toISOString(),
    ...overrides,
  };
}

// Galeri; ÖNEMLİ: yalnız mediaId taşınır (ProductImage.id contract'ta yoktur) →
// UI id'si = mediaId olmak ZORUNDA. url'ler asset URL'leri.
const IMAGES = [
  { mediaId: "media_aaa", url: "/media/s1/products/aaa.webp", altText: null, position: 0 },
  { mediaId: "media_bbb", url: "/media/s1/products/bbb.webp", altText: "second", position: 1 },
];

function renderForm({ product }: { product: unknown }) {
  return render(
    <LocaleProvider locale="en">
      {/* Gönder butonu form dışından `form={formId}` ile bağlanır (gerçek kullanım gibi). */}
      <ProductForm
        mode="edit"
        product={product as never}
        categories={[]}
        statusLabels={STATUS_LABELS}
        formId="product-form"
        onSaved={vi.fn()}
      />
      <button form="product-form" type="submit">
        save
      </button>
    </LocaleProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProductForm gallery (ADR-065 Faz 2/Dilim 2)", () => {
  it("fills MediaUpload value from initial.images with id = mediaId, and submits imageMediaIds in order", async () => {
    const user = userEvent.setup();
    storeApiMock.updateProduct.mockResolvedValue(makeProduct({ images: IMAGES }));

    renderForm({ product: makeProduct({ images: IMAGES }) });

    // Galeri bölümü göründü; her iki görsel de value'dan render edildi (url = asset url).
    // Not: altText=null olan görsel alt="" ile dekoratiftir (role=none), bu yüzden
    // role sorgusu değil doğrudan DOM sorgusu kullanılır.
    const srcs = Array.from(document.querySelectorAll("img")).map((img) => img.getAttribute("src"));
    expect(srcs).toContain("/media/s1/products/aaa.webp");
    expect(srcs).toContain("/media/s1/products/bbb.webp");
    // Kapak rozeti çoklu modda ilk görselde.
    expect(screen.getByText("Cover")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(storeApiMock.updateProduct).toHaveBeenCalledTimes(1));
    // INVARIANT KANITI: payload id'leri = mediaId'ler (ProductImage.id değil), sırayla.
    // Faz 2C-7 (ADR-078): payload artık etiketli imageBindings taşır (eksen yoksa optionId null).
    expect(storeApiMock.updateProduct).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({
        imageBindings: [
          { mediaId: "media_aaa", optionId: null },
          { mediaId: "media_bbb", optionId: null },
        ],
      }),
    );
  });

  it("reorders via move-down then submits the new imageMediaIds order", async () => {
    const user = userEvent.setup();
    storeApiMock.updateProduct.mockResolvedValue(makeProduct({ images: IMAGES }));

    renderForm({ product: makeProduct({ images: IMAGES }) });

    // İlk görselin (media_aaa, index 0) "aşağı taşı" butonu → [bbb, aaa].
    const moveDowns = screen.getAllByRole("button", { name: "Move down" });
    await user.click(moveDowns[0]!);

    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(storeApiMock.updateProduct).toHaveBeenCalledTimes(1));
    expect(storeApiMock.updateProduct).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({
        imageBindings: [
          { mediaId: "media_bbb", optionId: null },
          { mediaId: "media_aaa", optionId: null },
        ],
      }),
    );
  });

  it("removes an image then drops it from imageMediaIds", async () => {
    const user = userEvent.setup();
    storeApiMock.updateProduct.mockResolvedValue(makeProduct({ images: [IMAGES[1]] }));

    renderForm({ product: makeProduct({ images: IMAGES }) });

    // İki "Remove" butonu (görsel başına). İlkini (media_aaa) kaldır → [bbb].
    const removes = screen.getAllByRole("button", { name: "Remove" });
    await user.click(removes[0]!);

    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(storeApiMock.updateProduct).toHaveBeenCalledTimes(1));
    expect(storeApiMock.updateProduct).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ imageBindings: [{ mediaId: "media_bbb", optionId: null }] }),
    );
  });

  it("does NOT render the gallery section in create mode (R5)", () => {
    render(
      <LocaleProvider locale="en">
        <ProductForm
          mode="create"
          categories={[]}
          statusLabels={STATUS_LABELS}
          formId="product-create"
          onSaved={vi.fn()}
        />
      </LocaleProvider>,
    );

    // Galeri başlığı ve MediaUpload aksiyonları create'te yok (ürün id'si henüz yok).
    expect(screen.queryByText("Images")).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose from library" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Upload image" })).toBeNull();
  });
});
