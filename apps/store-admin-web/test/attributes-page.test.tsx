// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AttributesPage from "../app/(app)/attributes/page.js";

// Faz 1B (ADR-067) — Attributes ekranı: liste render'ı, scope rozeti (PLATFORM salt-okunur),
// yeni özellik oluşturma akışı ve seçenek-destekleyen tipte "Seçenekler" aksiyonu.
const { storeApiMock } = vi.hoisted(() => ({
  storeApiMock: {
    listAttributes: vi.fn(),
    listAttributeGroups: vi.fn(),
    createAttribute: vi.fn(),
    updateAttribute: vi.fn(),
    listAttributeOptions: vi.fn(),
    createAttributeOption: vi.fn(),
  },
}));

vi.mock("../lib/client/api.js", () => ({
  storeApi: storeApiMock,
  UiError: class UiError extends Error {},
}));

function attribute(overrides: Record<string, unknown> = {}) {
  return {
    id: "attr_1",
    scope: "STORE",
    storeId: "store_demo",
    code: "color",
    name: "Renk",
    description: null,
    dataType: "SELECT",
    unit: null,
    status: "ACTIVE",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AttributesPage (Faz 1B / ADR-067)", () => {
  it("özellikleri listeler; PLATFORM özelliği salt-okunur gösterilir", async () => {
    storeApiMock.listAttributes.mockResolvedValue({
      data: [
        attribute(),
        attribute({ id: "attr_2", scope: "PLATFORM", storeId: null, code: "gtin", name: "GTIN", dataType: "TEXT" }),
      ],
    });
    storeApiMock.listAttributeGroups.mockResolvedValue({ data: [] });

    render(<AttributesPage />);

    await waitFor(() => expect(screen.getByText("Renk")).toBeTruthy());
    expect(screen.getByText("GTIN")).toBeTruthy();
    // PLATFORM özelliği düzenlenemez (salt-okunur etiketi görünür).
    expect(screen.getByText("Platform özelliği (salt-okunur)")).toBeTruthy();
  });

  it("yeni STORE özelliği oluşturur (code + dataType gönderir)", async () => {
    storeApiMock.listAttributes.mockResolvedValue({ data: [] });
    storeApiMock.listAttributeGroups.mockResolvedValue({ data: [] });
    storeApiMock.createAttribute.mockResolvedValue(attribute({ code: "material", name: "Malzeme", dataType: "TEXT" }));

    render(<AttributesPage />);
    await waitFor(() => expect(screen.getByText("Henüz özellik yok")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Özellik ekle" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Kod"), "material");
    await userEvent.type(within(dialog).getByLabelText("Görünen ad"), "Malzeme");
    await userEvent.selectOptions(within(dialog).getByLabelText("Veri tipi"), "TEXT");
    await userEvent.click(within(dialog).getByRole("button", { name: "Özellik oluştur" }));

    await waitFor(() => expect(storeApiMock.createAttribute).toHaveBeenCalledTimes(1));
    expect(storeApiMock.createAttribute).toHaveBeenCalledWith(
      expect.objectContaining({ code: "material", name: "Malzeme", dataType: "TEXT", status: "ACTIVE" }),
    );
  });

  it("SELECT tipli özellikte Seçenekler modalını açar ve seçenekleri yükler", async () => {
    storeApiMock.listAttributes.mockResolvedValue({ data: [attribute()] });
    storeApiMock.listAttributeGroups.mockResolvedValue({ data: [] });
    storeApiMock.listAttributeOptions.mockResolvedValue({
      data: [
        {
          id: "opt_1",
          attributeDefinitionId: "attr_1",
          storeId: "store_demo",
          value: "red",
          label: "Kırmızı",
          colorHex: "#ff0000",
          sortOrder: 0,
          status: "ACTIVE",
          createdAt: "2026-07-14T00:00:00.000Z",
          updatedAt: "2026-07-14T00:00:00.000Z",
        },
      ],
    });

    render(<AttributesPage />);
    await waitFor(() => expect(screen.getByText("Renk")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Seçenekler" }));
    await waitFor(() => expect(storeApiMock.listAttributeOptions).toHaveBeenCalledWith("attr_1"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Kırmızı")).toBeTruthy();
  });
});
