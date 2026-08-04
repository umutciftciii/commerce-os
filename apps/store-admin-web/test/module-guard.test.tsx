// @vitest-environment jsdom
// TODO-163 (ADR-214 · Faz 3 · TD-155) — Store-admin sunucu-tarafı direct-URL guard + nav gizleme.
// Kapsam: ModuleGuard açık→children / kapalı→MODULE_DISABLED (children render EDİLMEZ) · StoreNav
// kapalı modül item'ı gizler + tümüyle boşalan grubu gizler · başka modül etkilenmez.
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { moduleAccessMock } = vi.hoisted(() => ({
  moduleAccessMock: { isStoreModuleEnabled: vi.fn() },
}));
vi.mock("../lib/server/module-access", () => moduleAccessMock);

const { storeApiMock } = vi.hoisted(() => ({
  storeApiMock: {
    listModules: vi.fn(),
    // TODO-170-recovery — StoreNav artık bekleyen-iş sayaçlarını çeker; testte 0 döndür (rozet yok).
    pendingWork: vi.fn(() =>
      Promise.resolve({
        reviews: { count: 0, oldestAt: null },
        returns: {
          actionable: { count: 0, oldestAt: null },
          newRequests: { count: 0, oldestAt: null },
          inspection: { count: 0, oldestAt: null },
          financialAction: { count: 0, oldestAt: null },
        },
      }),
    ),
  },
}));
vi.mock("../lib/client/api", () => ({ storeApi: storeApiMock, UiError: class extends Error {} }));
// StoreNav usePathname (aktif-durum) kullanır; jsdom'da router yok → sabit yol mock'la.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { ModuleGuard } from "../components/module-guard";
import { StoreNav } from "../components/store-nav";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ModuleGuard (sunucu-tarafı sayfa guard'ı)", () => {
  it("modül AÇIK → children render edilir", async () => {
    moduleAccessMock.isStoreModuleEnabled.mockResolvedValue(true);
    const ui = await ModuleGuard({ moduleKey: "REVIEWS", children: <div>GIZLI_ICERIK</div> });
    render(ui);
    expect(screen.getByText("GIZLI_ICERIK")).toBeTruthy();
    expect(screen.queryByText("MODULE_DISABLED")).toBeNull();
  });

  it("modül KAPALI → MODULE_DISABLED görünümü; children render EDİLMEZ (bypass yok)", async () => {
    moduleAccessMock.isStoreModuleEnabled.mockResolvedValue(false);
    const ui = await ModuleGuard({ moduleKey: "REVIEWS", children: <div>GIZLI_ICERIK</div> });
    render(ui);
    expect(screen.queryByText("GIZLI_ICERIK")).toBeNull();
    expect(screen.getByText("MODULE_DISABLED")).toBeTruthy();
    expect(moduleAccessMock.isStoreModuleEnabled).toHaveBeenCalledWith("REVIEWS");
  });
});

function matrix(overrides: Record<string, boolean> = {}) {
  // Registry'nin store-admin'e yansıyan alt kümesi; yalnız test için ilgili anahtarlar.
  const base: Record<string, boolean> = {
    REVIEWS: true,
    CAMPAIGNS: true,
    INFLUENCER_TRACKING: true,
    SPONSORED_PRODUCTS: true,
    SPONSORSHIP_FINANCE: true,
    HOME_EXPERIENCE: true,
    THEME_STUDIO: true,
    MULTI_WAREHOUSE: true,
    OPERATIONS_ADVANCED: true,
  };
  const merged = { ...base, ...overrides };
  return {
    data: {
      storeId: "s1",
      modules: Object.entries(merged).map(([key, effectiveEnabled]) => ({
        key,
        group: "sales",
        labelTr: key,
        labelEn: key,
        descriptionTr: "",
        core: false,
        effectiveEnabled,
        source: "baseline",
        overrideState: "INHERIT",
        blockedBy: null,
      })),
    },
  };
}

describe("StoreNav (menü gizleme + boş grup)", () => {
  it("kapalı modül item'ı gizlenir; diğerleri görünür", async () => {
    storeApiMock.listModules.mockResolvedValue(matrix({ REVIEWS: false }));
    render(<StoreNav />);
    await waitFor(() => expect(storeApiMock.listModules).toHaveBeenCalled());
    // "Kampanyalar" görünür kalır; "Değerlendirmeler" (reviews) gizlenir.
    await waitFor(() => expect(screen.queryByText("Değerlendirmeler")).toBeNull());
    expect(screen.getByText("Kampanyalar")).toBeTruthy();
  });

  it("tümüyle boşalan grup gizlenir (OPERATIONS_ADVANCED kapalı → Sistem grubu yok)", async () => {
    storeApiMock.listModules.mockResolvedValue(matrix({ OPERATIONS_ADVANCED: false }));
    render(<StoreNav />);
    await waitFor(() => expect(storeApiMock.listModules).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Operasyon")).toBeNull());
    // "Sistem" grup başlığı da kalmamalı (tek item'ı kapandı).
    expect(screen.queryByText("Sistem")).toBeNull();
  });
});
