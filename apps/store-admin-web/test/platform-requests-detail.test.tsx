// @vitest-environment jsdom
// TODO-178 (Faz D) — Talep detayı + mağaza aksiyonları. Kapsam: insan-okunur render (ham enum/id
// sızmaz), INTERNAL içerik görünmez, izinli aksiyonlar (canWithdraw/canConfirmClose/canReopen)
// backend-authoritative, reply STORE_VISIBLE, CLOSED terminal, VERSION_CONFLICT → reload+uyarı,
// silinmiş assignee fallback, SLA live-cycle render.
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { storeApiMock, UiErrorClass } = vi.hoisted(() => ({
  storeApiMock: {
    getPlatformRequest: vi.fn(),
    replyPlatformRequest: vi.fn(),
    platformRequestAction: vi.fn(),
    uploadPlatformRequestAttachment: vi.fn(),
  },
  UiErrorClass: class UiError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "r1" }),
}));
vi.mock("../lib/client/api.js", () => ({
  storeApi: storeApiMock,
  UiError: UiErrorClass,
}));

import PlatformRequestDetailPage from "../app/(app)/platform-requests/[id]/page.js";

function detailData(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    requestNumber: "PR-000001",
    subject: "Kargo entegrasyonu sorunu",
    description: "MNG bağlantısı 500 dönüyor.",
    category: { key: "PLATFORM_POLICY", labelTr: "Platform Politikası", labelEn: "Platform Policy" },
    status: "IN_PROGRESS",
    priority: "HIGH",
    storeImpact: "MEDIUM",
    assigneeName: "Ada Admin",
    contextKind: "NONE",
    contextSnapshot: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    lastActivityAt: "2026-08-10T00:00:00.000Z",
    resolvedAt: null,
    closedAt: null,
    closeReason: null,
    reopenCount: 0,
    version: 2,
    canReopen: false,
    canWithdraw: true,
    canConfirmClose: false,
    messages: [
      { id: "m1", authorType: "PLATFORM", body: "Merhaba, inceliyoruz.", createdAt: "2026-08-09T00:00:00.000Z" },
    ],
    timeline: [
      {
        id: "t1",
        event: "CREATED",
        actorType: "STORE",
        fromStatus: null,
        toStatus: "OPEN",
        fromPriority: null,
        toPriority: null,
        category: null,
        assigneeName: null,
        closeReason: null,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "t2",
        event: "STATUS_CHANGED",
        actorType: "PLATFORM",
        fromStatus: "OPEN",
        toStatus: "IN_PROGRESS",
        fromPriority: null,
        toPriority: null,
        category: null,
        assigneeName: null,
        closeReason: null,
        createdAt: "2026-08-09T00:00:00.000Z",
      },
    ],
    sla: {
      firstResponseState: "OVERDUE",
      firstResponseDueAt: "2026-08-05T00:00:00.000Z",
      resolutionState: "INSIDE",
      resolutionDueAt: "2026-08-20T00:00:00.000Z",
    },
    attachments: [
      { id: "att-1", type: "PHOTO", createdAt: "2026-08-09T00:00:00.000Z" },
      { id: "att-2", type: "PDF", createdAt: "2026-08-09T01:00:00.000Z" },
    ],
    ...overrides,
  };
}

function renderDetail() {
  return render(<PlatformRequestDetailPage />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Platform talebi detayı — render (INTERNAL/ham değer sızmaz)", () => {
  beforeEach(() => storeApiMock.getPlatformRequest.mockResolvedValue({ request: detailData() }));

  it("insan-okunur alanları gösterir; ham enum/key/UUID ve INTERNAL görünmez", async () => {
    renderDetail();
    await screen.findByText("PR-000001");
    expect(screen.getByText("Kargo entegrasyonu sorunu")).toBeTruthy();
    expect(screen.getByText("Platform Politikası")).toBeTruthy();
    expect(screen.getAllByText("İşlemde").length).toBeGreaterThan(0); // IN_PROGRESS
    expect(screen.getByText("Ada Admin")).toBeTruthy();
    expect(screen.getByText("Gecikmiş")).toBeTruthy(); // OVERDUE
    expect(screen.getByText("Merhaba, inceliyoruz.")).toBeTruthy();

    const html = document.body.innerHTML;
    expect(html).not.toContain("IN_PROGRESS");
    expect(html).not.toContain("OVERDUE");
    expect(html).not.toContain("PLATFORM_POLICY");
    expect(html).not.toContain("INTERNAL");
  });

  it("silinmiş/atanmamış assignee güvenli fallback gösterir", async () => {
    storeApiMock.getPlatformRequest.mockResolvedValue({ request: detailData({ assigneeName: null }) });
    renderDetail();
    await screen.findByText("PR-000001");
    expect(screen.getByText("Henüz atanmadı")).toBeTruthy();
  });

  // TODO-178 (Faz D follow-up) — konuşmadan AYRI güvenli audit timeline bölümü.
  it("ayrı 'Talep Geçmişi' bölümünde güvenli audit event'lerini gösterir (konuşmadan ayrı)", async () => {
    renderDetail();
    await screen.findByText("PR-000001");
    expect(screen.getByText("Talep Geçmişi")).toBeTruthy();
    expect(screen.getByText("Talep oluşturuldu")).toBeTruthy(); // CREATED
    expect(screen.getByText("Durum güncellendi")).toBeTruthy(); // STATUS_CHANGED
    // Conversation ayrı bir bölüm (Yazışma); ham event key sızmaz.
    expect(screen.getByText("Yazışma")).toBeTruthy();
    expect(document.body.innerHTML).not.toContain("STATUS_CHANGED");
    expect(document.body.innerHTML).not.toContain("REQUEST_");
  });
});

describe("Platform talebi detayı — izinli aksiyonlar (backend-authoritative)", () => {
  it("canWithdraw ise geri çek butonu görünür; expectedVersion ile aksiyon çağrılır", async () => {
    storeApiMock.getPlatformRequest.mockResolvedValue({ request: detailData({ canWithdraw: true, version: 5 }) });
    storeApiMock.platformRequestAction.mockResolvedValue({ request: detailData({ status: "CLOSED", canWithdraw: false }) });
    const user = userEvent.setup();
    renderDetail();
    await screen.findByText("PR-000001");
    await user.click(screen.getByRole("button", { name: "Talebi geri çek" }));
    await waitFor(() =>
      expect(storeApiMock.platformRequestAction).toHaveBeenCalledWith("r1", "withdraw", 5),
    );
  });

  it("IN_PROGRESS'te geri çekme İZNİ yoksa buton gösterilmez (canWithdraw=false)", async () => {
    storeApiMock.getPlatformRequest.mockResolvedValue({ request: detailData({ status: "IN_PROGRESS", canWithdraw: false }) });
    renderDetail();
    await screen.findByText("PR-000001");
    expect(screen.queryByRole("button", { name: "Talebi geri çek" })).toBeNull();
  });

  it("RESOLVED'da onayla-kapat ve yeniden-aç butonları izne göre görünür", async () => {
    storeApiMock.getPlatformRequest.mockResolvedValue({
      request: detailData({ status: "RESOLVED", canWithdraw: false, canConfirmClose: true, canReopen: true }),
    });
    renderDetail();
    await screen.findByText("PR-000001");
    expect(screen.getByRole("button", { name: "Çözümü onayla ve kapat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yeniden aç" })).toBeTruthy();
  });

  it("CLOSED terminal: yanıt kutusu yok, kapatılma nedeni gösterilir", async () => {
    storeApiMock.getPlatformRequest.mockResolvedValue({
      request: detailData({
        status: "CLOSED",
        closeReason: "COMPLETED",
        closedAt: "2026-08-11T00:00:00.000Z",
        canWithdraw: false,
        canConfirmClose: false,
        canReopen: false,
      }),
    });
    renderDetail();
    await screen.findByText("PR-000001");
    expect(screen.getByText("Bu talep kapatıldı.")).toBeTruthy();
    expect(screen.getByText("Tamamlandı")).toBeTruthy(); // COMPLETED close reason
    expect(screen.queryByRole("button", { name: "Gönder" })).toBeNull();
  });
});

describe("Platform talebi detayı — reply + eşzamanlılık", () => {
  it("mağaza yanıtı gönderir (STORE_VISIBLE; visibility seçilemez)", async () => {
    storeApiMock.getPlatformRequest.mockResolvedValue({ request: detailData() });
    storeApiMock.replyPlatformRequest.mockResolvedValue({ request: detailData({ status: "WAITING_STORE" }) });
    const user = userEvent.setup();
    renderDetail();
    await screen.findByText("PR-000001");
    await user.type(screen.getByPlaceholderText("Platform ekibine yanıt yazın…"), "Ek bilgi ektedir.");
    await user.click(screen.getByRole("button", { name: "Gönder" }));
    await waitFor(() =>
      expect(storeApiMock.replyPlatformRequest).toHaveBeenCalledWith("r1", { body: "Ek bilgi ektedir." }),
    );
  });

  it("VERSION_CONFLICT'te taze veriyi yükler ve kullanıcıya uyarı gösterir", async () => {
    storeApiMock.getPlatformRequest.mockResolvedValue({ request: detailData({ canWithdraw: true }) });
    storeApiMock.platformRequestAction.mockRejectedValue(new UiErrorClass("VERSION_CONFLICT"));
    const user = userEvent.setup();
    renderDetail();
    await screen.findByText("PR-000001");
    await user.click(screen.getByRole("button", { name: "Talebi geri çek" }));
    // İlk yükleme + conflict sonrası reload = en az 2 çağrı.
    await waitFor(() => expect(storeApiMock.getPlatformRequest.mock.calls.length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.getByText(/en son durum yüklendi/)).toBeTruthy());
  });
});

// TODO-178 (Faz E) — Ekler: STORE_VISIBLE render + upload; ham id/storageKey/visibility sızmaz.
describe("Platform talebi detayı — ekler", () => {
  beforeEach(() => storeApiMock.getPlatformRequest.mockResolvedValue({ request: detailData() }));

  it("STORE_VISIBLE ekleri human-readable linkle gösterir; ham storageKey/mediaAssetId/visibility yok", async () => {
    renderDetail();
    await screen.findByText("PR-000001");
    const links = screen.getAllByTestId("platform-request-attachment-link");
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe("/api/platform-requests/attachments/att-1");
    const html = document.body.innerHTML;
    expect(html).not.toContain("storageKey");
    expect(html).not.toContain("mediaAssetId");
    expect(html).not.toContain("visibility"); // store DTO'da yok; INTERNAL ayrımı store'a hiç gelmez
  });

  it("dosya seçilince yükler ve detayı tazeler", async () => {
    storeApiMock.uploadPlatformRequestAttachment.mockResolvedValue({
      attachment: { id: "att-3", type: "PHOTO", createdAt: "2026-08-10T00:00:00.000Z" },
    });
    const user = userEvent.setup();
    renderDetail();
    await screen.findByText("PR-000001");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "photo.png", { type: "image/png" });
    await user.upload(input, file);
    await waitFor(() =>
      expect(storeApiMock.uploadPlatformRequestAttachment).toHaveBeenCalledWith("r1", file),
    );
  });

  it("CLOSED talepte yükleme kutusu gösterilmez (terminal)", async () => {
    storeApiMock.getPlatformRequest.mockResolvedValue({
      request: detailData({ status: "CLOSED", canWithdraw: false, canConfirmClose: false, canReopen: false }),
    });
    renderDetail();
    await screen.findByText("PR-000001");
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
