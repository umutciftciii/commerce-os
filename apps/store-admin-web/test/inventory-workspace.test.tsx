// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryWorkspace } from "../app/(app)/products/inventory/inventory-workspace.js";

// TODO-152 (ADR-076) — Stok çalışma alanı: depo seçici + KPI + hızlı düzenleme (reserved salt-okunur)
// + toplu işlem yönlendirmesi + preview özet (old→new) + blocking apply guard.
const { storeApiMock } = vi.hoisted(() => ({
  storeApiMock: {
    listWarehouses: vi.fn(),
    getInventoryMatrix: vi.fn(),
    previewInventory: vi.fn(),
    applyInventory: vi.fn(),
  },
}));

vi.mock("../lib/client/api.js", () => ({
  storeApi: storeApiMock,
  UiError: class UiError extends Error {},
}));

vi.mock("../lib/client/messages.js", () => ({
  messageForError: () => "hata",
}));

const warehouse = (over: Record<string, unknown> = {}) => ({
  id: "wh1",
  code: "DEFAULT",
  name: "Ana Depo",
  status: "ACTIVE",
  isDefault: true,
  priority: 0,
  ...over,
});

const calc = (over: Record<string, unknown> = {}) => ({
  rawAvailable: 8,
  sellableAvailable: 8,
  reservedRatioPct: 20,
  status: "IN_STOCK",
  ...over,
});

const row = (over: Record<string, unknown> = {}) => ({
  variantId: "v1",
  sku: "SKU-1",
  title: "Varyant 1",
  status: "ACTIVE",
  attributes: [],
  balanceExists: true,
  current: { onHand: 10, reserved: 2, incoming: 0, safetyStock: 0, reorderPoint: 0 },
  currentCalc: calc(),
  target: { onHand: 10, reserved: 2, incoming: 0, safetyStock: 0, reorderPoint: 0 },
  targetCalc: calc(),
  changedFields: [],
  changed: false,
  warnings: [],
  errors: [],
  ...over,
});

const matrix = (rows = [row()], over: Record<string, unknown> = {}) => ({
  fingerprint: "if1:abc:1",
  source: "DIRECT_EDIT",
  warehouse: warehouse(),
  blocked: false,
  rows,
  summary: {
    totalVariants: rows.length,
    changedVariants: 0,
    unchangedVariants: rows.length,
    changedFieldCount: 0,
    warningCount: 0,
    errorCount: 0,
    totalOnHandDelta: 0,
    totalSellableDelta: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    newBalanceCount: 0,
  },
  ...over,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InventoryWorkspace (TODO-152 / ADR-076)", () => {
  it("depo seçici + default rozet + KPI gösterir", async () => {
    storeApiMock.listWarehouses.mockResolvedValue({ data: [warehouse()] });
    storeApiMock.getInventoryMatrix.mockResolvedValue(matrix());

    render(<InventoryWorkspace productId="p1" />);

    await waitFor(() => expect(screen.getByText("Stok yönetimi")).toBeTruthy());
    expect(screen.getByText("Ana Depo")).toBeTruthy();
    expect(screen.getByText("Varsayılan")).toBeTruthy();
    // KPI toplam eldeki stok = 10
    expect(screen.getByText("Toplam eldeki stok")).toBeTruthy();
  });

  it("hızlı düzenleme varsayılan; reserved salt-okunur (input yok)", async () => {
    storeApiMock.listWarehouses.mockResolvedValue({ data: [warehouse()] });
    storeApiMock.getInventoryMatrix.mockResolvedValue(matrix());

    render(<InventoryWorkspace productId="p1" />);
    await waitFor(() => expect(screen.getByText("Stok yönetimi")).toBeTruthy());

    // 4 düzenlenebilir alan (onHand/safety/incoming/reorder) input; reserved input DEĞİL.
    const numberInputs = screen.getAllByRole("spinbutton");
    expect(numberInputs.length).toBe(4);
  });

  it("boş varyant → empty state", async () => {
    storeApiMock.listWarehouses.mockResolvedValue({ data: [warehouse()] });
    storeApiMock.getInventoryMatrix.mockResolvedValue(matrix([]));

    render(<InventoryWorkspace productId="p1" />);
    await waitFor(() =>
      expect(screen.getByText("Bu ürünün stok yönetilebilir varyantı yok.")).toBeTruthy(),
    );
  });

  it("toplu işlem modu yönlendirmeli senaryoları gösterir", async () => {
    storeApiMock.listWarehouses.mockResolvedValue({ data: [warehouse()] });
    storeApiMock.getInventoryMatrix.mockResolvedValue(matrix());

    render(<InventoryWorkspace productId="p1" />);
    await waitFor(() => expect(screen.getByText("Stok yönetimi")).toBeTruthy());

    await userEvent.click(screen.getByText("Toplu işlem"));
    expect(screen.getByText("Ne yapmak istiyorsunuz?")).toBeTruthy();
    expect(screen.getByText("Elde stok ekle")).toBeTruthy();
    expect(screen.getByText("Stoğu sıfırla")).toBeTruthy();
  });

  it("önizleme özeti old→new gösterir; blocked apply'ı engeller", async () => {
    storeApiMock.listWarehouses.mockResolvedValue({ data: [warehouse()] });
    storeApiMock.getInventoryMatrix.mockResolvedValue(matrix());
    storeApiMock.previewInventory.mockResolvedValue(
      matrix(
        [
          row({
            changed: true,
            changedFields: ["ON_HAND"],
            target: { onHand: 20, reserved: 2, incoming: 0, safetyStock: 0, reorderPoint: 0 },
            targetCalc: calc({ sellableAvailable: 18 }),
          }),
        ],
        {
          blocked: false,
          summary: {
            totalVariants: 1,
            changedVariants: 1,
            unchangedVariants: 0,
            changedFieldCount: 1,
            warningCount: 0,
            errorCount: 0,
            totalOnHandDelta: 10,
            totalSellableDelta: 10,
            lowStockCount: 0,
            outOfStockCount: 0,
            newBalanceCount: 0,
          },
        },
      ),
    );

    render(<InventoryWorkspace productId="p1" />);
    await waitFor(() => expect(screen.getByText("Stok yönetimi")).toBeTruthy());

    // onHand hücresini 20 yap
    const onHandInput = screen.getAllByRole("spinbutton")[0];
    await userEvent.clear(onHandInput);
    await userEvent.type(onHandInput, "20");

    await userEvent.click(screen.getByText("Önizle"));

    await waitFor(() => expect(screen.getByText("Önizleme")).toBeTruthy());
    expect(screen.getByText("Etkilenen varyant")).toBeTruthy();
    // Apply butonu etkin (blocked değil)
    expect(screen.getByText("Değişiklikleri kaydet")).toBeTruthy();
  });

  it("blocked preview → apply devre dışı + engelleyici uyarı", async () => {
    storeApiMock.listWarehouses.mockResolvedValue({ data: [warehouse()] });
    storeApiMock.getInventoryMatrix.mockResolvedValue(matrix());
    storeApiMock.previewInventory.mockResolvedValue(
      matrix(
        [
          row({
            changed: true,
            changedFields: ["ON_HAND"],
            target: { onHand: -5, reserved: 2, incoming: 0, safetyStock: 0, reorderPoint: 0 },
            targetCalc: calc({ sellableAvailable: 0, status: "NEGATIVE" }),
            errors: ["NEGATIVE_ON_HAND"],
          }),
        ],
        { blocked: true },
      ),
    );

    render(<InventoryWorkspace productId="p1" />);
    await waitFor(() => expect(screen.getByText("Stok yönetimi")).toBeTruthy());

    const onHandInput = screen.getAllByRole("spinbutton")[0];
    await userEvent.clear(onHandInput);
    await userEvent.type(onHandInput, "3");
    await userEvent.click(screen.getByText("Önizle"));

    await waitFor(() => expect(screen.getByText("Önizleme")).toBeTruthy());
    expect(screen.getByText("Eldeki stok negatif olamaz.")).toBeTruthy();
    const applyBtn = screen.getByText("Değişiklikleri kaydet").closest("button");
    expect(applyBtn?.disabled).toBe(true);
  });
});
