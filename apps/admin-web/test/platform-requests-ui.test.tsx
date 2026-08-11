// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { adminApiMock, push, MockUiError } = vi.hoisted(() => {
  class MockUiError extends Error {
    readonly code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    push: vi.fn(),
    MockUiError,
    adminApiMock: {
      listPlatformRequests: vi.fn(),
      listPlatformRequestCategories: vi.fn().mockResolvedValue({ items: [] }),
      listAssignablePlatformUsers: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 }),
      getPlatformRequest: vi.fn(),
      assignPlatformRequest: vi.fn(),
      setPlatformRequestPriority: vi.fn(),
      setPlatformRequestStatus: vi.fn(),
      recategorizePlatformRequest: vi.fn(),
      addPlatformRequestMessage: vi.fn(),
      uploadPlatformRequestAttachment: vi.fn(),
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push }),
  usePathname: () => "/platform-requests",
}));
vi.mock("../lib/client/api.js", () => ({ adminApi: adminApiMock, UiError: MockUiError }));
vi.mock("../lib/client/api", () => ({ adminApi: adminApiMock, UiError: MockUiError }));

import PlatformRequestsPage from "../app/(app)/platform-requests/page";
import PlatformRequestDetailPage from "../app/(app)/platform-requests/[id]/page";

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

const CATEGORY = { key: "PLATFORM_POLICY", labelTr: "Platform Politikası", labelEn: "Platform Policy" };

function listResponse() {
  return {
    items: [
      {
        requestId: "r1",
        requestNumber: "PR-000001",
        storeId: "st1",
        storeName: "Demo Store",
        category: CATEGORY,
        subject: "İptal nedeni talebi",
        priority: "URGENT",
        status: "OPEN",
        assigneePlatformUserId: null,
        assigneeName: null,
        firstResponseState: "OVERDUE",
        resolutionState: "INSIDE",
        lastActivityAt: "2026-08-11T09:00:00.000Z",
      },
    ],
    page: 1,
    pageSize: 25,
    total: 1,
  };
}

function detailResponse(over: Record<string, unknown> = {}) {
  return {
    request: {
      requestId: "r1",
      requestNumber: "PR-000001",
      storeId: "st1",
      storeName: "Demo Store",
      categoryId: "cat1",
      category: CATEGORY,
      filedCategory: CATEGORY,
      subject: "İptal nedeni talebi",
      description: "Yeni iptal nedeni.",
      status: "IN_PROGRESS",
      priority: "NORMAL",
      storeImpact: null,
      contextKind: "PLATFORM_POLICY",
      contextSnapshot: null,
      version: 3,
      createdByName: "Store Owner",
      createdByEmail: "owner@ex.test",
      assigneePlatformUserId: null,
      assigneeName: null,
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null,
      closeReason: null,
      reopenCount: 0,
      createdAt: "2026-08-11T08:00:00.000Z",
      lastActivityAt: "2026-08-11T09:00:00.000Z",
      messages: [
        { id: "m1", authorType: "PLATFORM", visibility: "STORE_VISIBLE", body: "public answer", createdAt: "2026-08-11T09:00:00.000Z" },
        { id: "m2", authorType: "PLATFORM", visibility: "INTERNAL", body: "internal-only-secret", createdAt: "2026-08-11T09:05:00.000Z" },
      ],
      timeline: [],
      attachments: [
        { id: "att-vis", type: "PHOTO", visibility: "STORE_VISIBLE", createdAt: "2026-08-11T09:00:00.000Z" },
        { id: "att-int", type: "PDF", visibility: "INTERNAL", createdAt: "2026-08-11T09:05:00.000Z" },
      ],
      sla: { cycle: 1, firstResponseDueAt: "x", firstResponseState: "INSIDE", resolutionDueAt: "y", resolutionState: "INSIDE" },
      ...over,
    },
  };
}

describe("TODO-178 inbox renders human labels, never raw enums", () => {
  it("shows the request with localized status/priority (no raw OPEN/URGENT)", async () => {
    adminApiMock.listPlatformRequests.mockResolvedValue(listResponse());
    render(<PlatformRequestsPage />);
    expect(await screen.findByText("PR-000001")).toBeTruthy();
    expect(screen.getByText("Demo Store")).toBeTruthy();
    // localized labels appear (row badge + possibly the filter option) — never the raw enum
    expect(screen.getAllByText("Açık").length).toBeGreaterThan(0); // OPEN → localized
    expect(screen.getAllByText("Acil").length).toBeGreaterThan(0); // URGENT → localized
    expect(screen.queryByText("OPEN")).toBeNull();
    expect(screen.queryByText("URGENT")).toBeNull();
  });

  it("TD-178-6: the assignee filter maps 'Unassigned' to the server sentinel", async () => {
    adminApiMock.listPlatformRequests.mockResolvedValue(listResponse());
    render(<PlatformRequestsPage />);
    await screen.findByText("PR-000001");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Atanan filtresi/ }), "UNASSIGNED");
    await waitFor(() =>
      expect(adminApiMock.listPlatformRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ assignee: "__unassigned__" }),
      ),
    );
  });
});

describe("TODO-178 detail: internal vs visible distinction + actions", () => {
  async function renderDetail() {
    // STABLE promise reference — inline `Promise.resolve` per render would make `use()` suspend forever.
    const params = Promise.resolve({ id: "r1" });
    await act(async () => {
      render(
        <React.Suspense fallback={null}>
          <PlatformRequestDetailPage params={params} />
        </React.Suspense>,
      );
      await params; // flush the use(params) suspense
    });
    return screen.findByText(/İptal nedeni talebi/);
  }

  it("shows internal notes as distinctly labeled and visible replies separately", async () => {
    adminApiMock.getPlatformRequest.mockResolvedValue(detailResponse());
    await renderDetail();
    // internal note is visually distinguished for platform, and its body is shown (platform sees it)
    expect(screen.getByText(/Dahili not — mağaza görmez/)).toBeTruthy();
    expect(screen.getByText("internal-only-secret")).toBeTruthy();
    expect(screen.getByText(/Mağazaya görünür/)).toBeTruthy();
    expect(screen.getByText("public answer")).toBeTruthy();
  });

  // TODO-178 (Faz E) — Platform: STORE_VISIBLE + INTERNAL ekler görsel ayrımla; ham id sızmaz.
  it("shows visible and internal attachments with distinct treatment (raw storageKey/mediaAssetId hidden)", async () => {
    adminApiMock.getPlatformRequest.mockResolvedValue(detailResponse());
    await renderDetail();
    const vis = screen.getByTestId("visible-attachment-link");
    const int = screen.getByTestId("internal-attachment-link");
    expect(vis.getAttribute("href")).toBe("/api/admin/platform-requests/attachments/att-vis");
    expect(int.getAttribute("href")).toBe("/api/admin/platform-requests/attachments/att-int");
    // internal ek görsel olarak ayrışır (amber "Dahili" rozet)
    expect(screen.getByText(/Dahili — mağaza görmez/)).toBeTruthy();
    const html = document.body.innerHTML;
    expect(html).not.toContain("storageKey");
    expect(html).not.toContain("mediaAssetId");
  });

  it("uploads an internal attachment with the chosen visibility (platform can pick)", async () => {
    adminApiMock.getPlatformRequest.mockResolvedValue(detailResponse());
    adminApiMock.uploadPlatformRequestAttachment.mockResolvedValue({
      attachment: { id: "att-3", type: "PHOTO", visibility: "INTERNAL", createdAt: "2026-08-12T00:00:00.000Z" },
    });
    await renderDetail();
    const input = document.querySelector('[data-testid="internal-attachment-upload"]') as HTMLInputElement;
    const file = new File(["x"], "n.png", { type: "image/png" });
    await userEvent.upload(input, file);
    await waitFor(() =>
      expect(adminApiMock.uploadPlatformRequestAttachment).toHaveBeenCalledWith("r1", "INTERNAL", file),
    );
  });

  it("assign-to-me sends expectedVersion and applies the returned detail", async () => {
    adminApiMock.getPlatformRequest.mockResolvedValue(detailResponse());
    adminApiMock.assignPlatformRequest.mockResolvedValue(
      detailResponse({ assigneeName: "Ada Admin", version: 4 }),
    );
    await renderDetail();
    await userEvent.click(screen.getByRole("button", { name: /Kendime ata/ }));
    await waitFor(() => expect(adminApiMock.assignPlatformRequest).toHaveBeenCalledWith("r1", { expectedVersion: 3, assigneePlatformUserId: "me" }));
    expect(await screen.findByText("Ada Admin")).toBeTruthy();
  });

  it("TD-178-6: shows a safe fallback when the assignee record is missing (deleted user)", async () => {
    adminApiMock.getPlatformRequest.mockResolvedValue(
      detailResponse({ assigneePlatformUserId: "pu-deleted", assigneeName: null }),
    );
    await renderDetail();
    expect(screen.getByText(/Atanmış kullanıcı bulunamadı/)).toBeTruthy();
  });

  it("TD-178-6: searching + picking a user assigns them (id sent, expectedVersion, name shown)", async () => {
    adminApiMock.getPlatformRequest.mockResolvedValue(detailResponse());
    adminApiMock.listAssignablePlatformUsers.mockResolvedValue({
      items: [{ id: "pu-9", name: "Ada Admin", email: "ada@ex.test", role: "SUPPORT_ADMIN" }],
      page: 1,
      pageSize: 10,
      total: 1,
    });
    adminApiMock.assignPlatformRequest.mockResolvedValue(detailResponse({ assigneeName: "Ada Admin", version: 4 }));
    await renderDetail();
    const searchBoxes = screen.getAllByLabelText(/Kullanıcı ara/);
    await userEvent.type(searchBoxes[0], "ada");
    const option = await screen.findByText("ada@ex.test");
    await userEvent.click(option);
    await waitFor(() =>
      expect(adminApiMock.assignPlatformRequest).toHaveBeenCalledWith("r1", { expectedVersion: 3, assigneePlatformUserId: "pu-9" }),
    );
    expect((await screen.findAllByText("Ada Admin")).length).toBeGreaterThan(0);
  });

  it("a VERSION_CONFLICT reloads the request and shows a human message (no crash)", async () => {
    adminApiMock.getPlatformRequest.mockResolvedValue(detailResponse());
    adminApiMock.setPlatformRequestPriority.mockRejectedValue(new MockUiError("VERSION_CONFLICT"));
    await renderDetail();
    // change priority then apply
    const applyButtons = screen.getAllByRole("button", { name: /Uygula/ });
    // select a different priority first
    const prioritySelect = screen.getAllByRole("combobox")[0];
    await userEvent.selectOptions(prioritySelect, "URGENT");
    await userEvent.click(applyButtons[0]);
    await waitFor(() => expect(adminApiMock.setPlatformRequestPriority).toHaveBeenCalled());
    // reload happened (getPlatformRequest called again) + conflict message rendered
    await waitFor(() => expect(adminApiMock.getPlatformRequest).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/en güncel hâli yüklendi/)).toBeTruthy();
  });
});
