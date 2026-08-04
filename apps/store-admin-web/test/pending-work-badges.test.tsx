// @vitest-environment jsdom
// TODO-170-recovery — Sidebar bekleyen-iş sayaç rozetleri (Değerlendirmeler/İadeler).
// Kapsam: 3 pending → rozet + erişilebilir ad · 0 → rozet YOK · 99+ · mutation event tazeler.
import React from "react";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyPendingWorkChanged } from "../lib/client/pending-work-events";

const { storeApiMock } = vi.hoisted(() => ({
  storeApiMock: {
    // Modül gizleme kapalı kalsın (reject → tüm item'lar görünür).
    listModules: vi.fn(() => Promise.reject(new Error("no modules"))),
    pendingWork: vi.fn(),
  },
}));
vi.mock("../lib/client/api", () => ({ storeApi: storeApiMock, UiError: class extends Error {} }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { StoreNav } from "../components/store-nav";

function summary(reviews: number, returnsActionable: number) {
  return {
    reviews: { count: reviews, oldestAt: null },
    returns: {
      actionable: { count: returnsActionable, oldestAt: null },
      newRequests: { count: 0, oldestAt: null },
      inspection: { count: 0, oldestAt: null },
      financialAction: { count: 0, oldestAt: null },
    },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StoreNav pending-work rozetleri (TODO-170-recovery)", () => {
  it("3 bekleyen değerlendirme → '3' rozeti + erişilebilir ad", async () => {
    storeApiMock.pendingWork.mockResolvedValue(summary(3, 2));
    render(<StoreNav />);
    await waitFor(() => expect(screen.getByText("3")).toBeTruthy());
    expect(screen.getByText("2")).toBeTruthy();
    // Sayı yalnız görsel değil: erişilebilir ad ("… 3 bekleyen/pending") duyurulur.
    expect(screen.getByLabelText(/3 (bekleyen|pending)/i)).toBeTruthy();
  });

  it("0 → rozet gösterilmez", async () => {
    storeApiMock.pendingWork.mockResolvedValue(summary(0, 0));
    render(<StoreNav />);
    await waitFor(() => expect(storeApiMock.pendingWork).toHaveBeenCalled());
    expect(screen.queryByLabelText(/(bekleyen|pending)/i)).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("100+ → '99+' kısaltması", async () => {
    storeApiMock.pendingWork.mockResolvedValue(summary(150, 0));
    render(<StoreNav />);
    await waitFor(() => expect(screen.getByText("99+")).toBeTruthy());
  });

  it("mutation event → sayaç yeniden çekilir (approve sonrası düşer)", async () => {
    storeApiMock.pendingWork
      .mockResolvedValueOnce(summary(3, 0))
      .mockResolvedValueOnce(summary(2, 0));
    render(<StoreNav />);
    await waitFor(() => expect(screen.getByText("3")).toBeTruthy());
    act(() => notifyPendingWorkChanged());
    await waitFor(() => expect(screen.getByText("2")).toBeTruthy());
    expect(screen.queryByText("3")).toBeNull();
    expect(storeApiMock.pendingWork).toHaveBeenCalledTimes(2);
  });
});
