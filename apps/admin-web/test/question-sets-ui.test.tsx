// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
      listQuestionSets: vi.fn(),
      createQuestionSet: vi.fn(),
      getQuestionSet: vi.fn(),
      editQuestionSetVersion: vi.fn(),
      validateQuestionSetVersion: vi.fn(),
      publishQuestionSetVersion: vi.fn(),
      archiveQuestionSetVersion: vi.fn(),
      createQuestionSetVersion: vi.fn(),
      listStores: vi.fn().mockResolvedValue({ data: [] }),
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push }),
  usePathname: () => "/question-sets",
}));
vi.mock("../lib/client/api.js", () => ({ adminApi: adminApiMock, UiError: MockUiError }));
vi.mock("../lib/client/api", () => ({ adminApi: adminApiMock, UiError: MockUiError }));

import { QuestionSetEditor } from "../components/question-sets/question-set-editor";
import QuestionSetsPage from "../app/(app)/question-sets/page";

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

function detail(over: Record<string, unknown> = {}) {
  return {
    id: "qs1",
    key: "default-x",
    title: "Varsayılan X",
    description: null,
    isDefault: true,
    status: "ACTIVE",
    latestPublishedVersion: 1,
    versionCount: 2,
    versions: [
      {
        id: "v2",
        version: 2,
        status: "DRAFT",
        publishedAt: null,
        questions: [
          { key: "entry", type: "SINGLE_SELECT", prompt: "Sorun ne?", helpText: null, sortOrder: 0, required: true, isEntry: true, options: [{ key: "a", label: "A", sortOrder: 0 }] },
          { key: "res", type: "SELF_SERVICE_RESULT", prompt: "Çözüm", helpText: null, sortOrder: 1, required: false, isEntry: false, options: [] },
        ],
        transitions: [
          { fromKey: "entry", matchKind: "OPTION", matchOptionKey: "a", action: "GO_TO_RESULT", toKey: "res", sortOrder: 0 },
          { fromKey: "entry", matchKind: "DEFAULT", matchOptionKey: null, action: "ESCALATE", toKey: null, sortOrder: 1 },
        ],
      },
      { id: "v1", version: 1, status: "PUBLISHED", publishedAt: "2026-08-01T00:00:00.000Z", questions: [], transitions: [] },
    ],
    ...over,
  };
}

describe("Question Sets — Platform Admin UI", () => {
  it("list renders human-readable status (no raw enum) and opens create modal", async () => {
    adminApiMock.listQuestionSets.mockResolvedValue({
      items: [{ id: "qs1", key: "k", title: "Varsayılan X", description: null, isDefault: true, status: "ACTIVE", latestPublishedVersion: 1, versionCount: 2 }],
    });
    render(<QuestionSetsPage />);
    await screen.findByText("Varsayılan X");
    expect(screen.getByText("Aktif")).toBeTruthy();
    expect(screen.queryByText("ACTIVE")).toBeNull(); // raw enum never shown
    await userEvent.click(screen.getByRole("button", { name: "Yeni set" }));
    expect(screen.getByText("Yeni soru seti")).toBeTruthy();
  });

  it("editor shows version status human-readably and marks published version immutable", async () => {
    render(<QuestionSetEditor initial={detail() as never} />);
    // version badges are human-readable, not raw
    expect(screen.getByText("Taslak")).toBeTruthy();
    expect(screen.getByText("Yayında")).toBeTruthy();
    expect(screen.queryByText("PUBLISHED")).toBeNull();
    expect(screen.queryByText("DRAFT")).toBeNull();
    // draft is selected by default → editable (add-question control visible)
    expect(screen.getByRole("button", { name: /Soru ekle/ })).toBeTruthy();
    // select the published version → immutable (no add-question control; offers new-draft instead)
    await userEvent.click(screen.getByText("v1"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Bu sürümden yeni taslak/ })).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: /Soru ekle/ })).toBeNull();
    expect(screen.getByText(/Düzenlemek için yeni taslak oluşturun/)).toBeTruthy();
  });

  it("renders publish validation errors as human sentences (not raw codes)", async () => {
    adminApiMock.editQuestionSetVersion.mockResolvedValue({ ok: true });
    adminApiMock.getQuestionSet.mockResolvedValue({ questionSet: detail() });
    adminApiMock.validateQuestionSetVersion.mockResolvedValue({
      ok: false,
      errors: [{ code: "CYCLE", detail: "x" }, { code: "NO_ESCALATION_PATH", detail: "y" }],
    });
    render(<QuestionSetEditor initial={detail() as never} />);
    await userEvent.click(screen.getByRole("button", { name: "Doğrula" }));
    await waitFor(() => expect(screen.getByText(/Akışta döngü var/)).toBeTruthy());
    expect(screen.getByText(/Talep oluşturma \(escalation\) yolu yok/)).toBeTruthy();
    expect(screen.queryByText("CYCLE")).toBeNull(); // raw code never shown
  });

  it("publishes a draft version", async () => {
    adminApiMock.editQuestionSetVersion.mockResolvedValue({ ok: true });
    adminApiMock.publishQuestionSetVersion.mockResolvedValue({ ok: true });
    adminApiMock.getQuestionSet.mockResolvedValue({ questionSet: detail() });
    render(<QuestionSetEditor initial={detail() as never} />);
    await userEvent.click(screen.getByRole("button", { name: "Yayınla" }));
    await waitFor(() => expect(adminApiMock.publishQuestionSetVersion).toHaveBeenCalledWith("v2"));
    await screen.findByText("Sürüm yayınlandı.");
  });
});
