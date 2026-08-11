// @vitest-environment jsdom
// TODO-178 (Faz D) — Platform Talepleri LİSTE ekranı. Kapsam: URL durumundan server-side istek
// query'sinin türetilmesi (status/kategori/SLA/arama/sayfa), insan-okunur etiket render (ham enum/
// key/UUID GÖSTERİLMEZ), atanan + SLA hücreleri, atanmamış/SLA-yok güvenli fallback, boş durum.
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { storeApiMock, routerMock, searchParamsRef } = vi.hoisted(() => ({
  storeApiMock: {
    listPlatformRequests: vi.fn(),
    listPlatformRequestCategories: vi.fn(),
  },
  routerMock: { push: vi.fn(), replace: vi.fn() },
  searchParamsRef: { current: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useSearchParams: () => searchParamsRef.current,
  useParams: () => ({}),
}));
vi.mock("../lib/client/api.js", () => ({
  storeApi: storeApiMock,
  UiError: class UiError extends Error {},
}));

import PlatformRequestsPage from "../app/(app)/platform-requests/page.js";

function reqItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-uuid-1",
    requestNumber: "PR-000001",
    subject: "Kargo entegrasyonu sorunu",
    category: { key: "PLATFORM_POLICY", labelTr: "Platform Politikası", labelEn: "Platform Policy" },
    status: "WAITING_STORE",
    priority: "HIGH",
    storeImpact: "MEDIUM",
    assigneeName: "Ada Admin",
    sla: { firstResponseState: "OVERDUE", resolutionState: "INSIDE" },
    createdAt: "2026-08-01T00:00:00.000Z",
    lastActivityAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}
function listResult(items: unknown[], total = items.length, page = 1, pageSize = 20) {
  return { items, page, pageSize, total };
}

beforeEach(() => {
  searchParamsRef.current = new URLSearchParams();
  storeApiMock.listPlatformRequestCategories.mockResolvedValue({
    items: [{ key: "PLATFORM_POLICY", labelTr: "Platform Politikası", labelEn: "Platform Policy" }],
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Platform Talepleri liste — URL durumundan istek query'si", () => {
  it("varsayılan durumda son-aktivite DESC ile ilk sayfayı ister", async () => {
    storeApiMock.listPlatformRequests.mockResolvedValue(listResult([reqItem()]));
    render(<PlatformRequestsPage />);
    await screen.findByText("PR-000001");
    expect(storeApiMock.listPlatformRequests).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, sortBy: "lastActivityAt", sortOrder: "desc" }),
    );
  });

  it("URL'deki status/kategori/SLA/arama/sayfa isteğe birebir taşınır", async () => {
    searchParamsRef.current = new URLSearchParams(
      "status=OPEN&categoryKey=PLATFORM_POLICY&slaRisk=true&search=kargo&page=2&pageSize=50",
    );
    storeApiMock.listPlatformRequests.mockResolvedValue(listResult([reqItem()], 60, 2, 50));
    render(<PlatformRequestsPage />);
    await screen.findByText("PR-000001");
    expect(storeApiMock.listPlatformRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        pageSize: 50,
        search: "kargo",
        status: "OPEN",
        categoryKey: "PLATFORM_POLICY",
        slaRisk: "true",
      }),
    );
  });
});

describe("Platform Talepleri liste — insan-okunur render (ham enum/id sızmaz)", () => {
  it("kategori/durum/öncelik/atanan/SLA insan-okunur etiketlerle gösterilir; ham değerler görünmez", async () => {
    storeApiMock.listPlatformRequests.mockResolvedValue(listResult([reqItem()]));
    render(<PlatformRequestsPage />);
    await screen.findByText("PR-000001");

    expect(screen.getByText("Kargo entegrasyonu sorunu")).toBeTruthy();
    expect(screen.getByText("Platform Politikası")).toBeTruthy(); // kategori bilingual (tr)
    expect(screen.getByText("Yanıtınız bekleniyor")).toBeTruthy(); // WAITING_STORE
    expect(screen.getByText("Yüksek")).toBeTruthy(); // HIGH
    expect(screen.getByText("Ada Admin")).toBeTruthy(); // assignee human-readable
    expect(screen.getByText("Gecikmiş")).toBeTruthy(); // OVERDUE first-response SLA
    expect(screen.getByText("Normal")).toBeTruthy(); // INSIDE resolution SLA

    const html = document.body.innerHTML;
    // Ham enum / kategori key KULLANICIYA gösterilmez (görünür metinde de, işaretlemede de yok).
    expect(html).not.toContain("WAITING_STORE");
    expect(html).not.toContain("OVERDUE");
    expect(html).not.toContain("PLATFORM_POLICY");
    // INTERNAL içerik store liste DTO'sunda hiç yoktur.
    expect(html).not.toContain("INTERNAL");
    // Ham UUID kullanıcıya METİN olarak gösterilmez (yalnız detay link href'inde routing amaçlı bulunur).
    expect(screen.queryByText("req-uuid-1")).toBeNull();
  });

  it("atanmamış talep güvenli fallback gösterir (raw id yok)", async () => {
    storeApiMock.listPlatformRequests.mockResolvedValue(listResult([reqItem({ assigneeName: null })]));
    render(<PlatformRequestsPage />);
    await screen.findByText("PR-000001");
    expect(screen.getByText("Atanmadı")).toBeTruthy();
  });

  it("SLA snapshot yoksa nötr çizgi gösterir (çökme yok)", async () => {
    storeApiMock.listPlatformRequests.mockResolvedValue(listResult([reqItem({ sla: null })]));
    render(<PlatformRequestsPage />);
    await screen.findByText("PR-000001");
    // İki SLA kolonu da "—" gösterir.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});

describe("Platform Talepleri liste — boş durum", () => {
  it("filtresiz boş sonuçta 'henüz talep yok' mesajı gösterir", async () => {
    storeApiMock.listPlatformRequests.mockResolvedValue(listResult([], 0));
    render(<PlatformRequestsPage />);
    expect(await screen.findByText("Henüz talep yok")).toBeTruthy();
  });
});
