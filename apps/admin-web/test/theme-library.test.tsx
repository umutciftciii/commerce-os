// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
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
      listThemeLibrary: vi.fn(),
      createTemplate: vi.fn(),
      archiveTemplate: vi.fn(),
      assignableStores: vi.fn(),
      templateUsage: vi.fn(),
      assignPreview: vi.fn(),
      assignTemplate: vi.fn(),
      applyTemplateUpdate: vi.fn(),
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push }),
  usePathname: () => "/theme-library",
  useParams: () => ({ id: "theme_1" }),
}));

vi.mock("../lib/client/api.js", () => ({ adminApi: adminApiMock, UiError: MockUiError }));

import ThemeLibraryPage from "../app/(app)/theme-library/page.js";
import { PolicyMatrix } from "../components/theme-library/policy-matrix.js";
import { BeforeAfter } from "../components/theme-library/before-after.js";
import { defaultOverridePolicy } from "@commerce-os/theme";

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

function template(over: Record<string, unknown> = {}) {
  return {
    id: "theme_1",
    name: "Modern Şablon",
    description: null,
    themeKey: "BASE_COMMERCE",
    status: "PUBLISHED",
    ownerScope: "PLATFORM",
    compatible: true,
    sourcePreset: "starting:BASE_COMMERCE",
    colorScheme: "light",
    publishedVersion: 2,
    draftVersion: 3,
    policyComplete: true,
    usingCount: 4,
    updatePendingCount: 1,
    updatedAt: "2026-07-31T12:00:00.000Z",
    lastPublishedAt: "2026-07-31T12:00:00.000Z",
    ...over,
  };
}

describe("Tema Kütüphanesi listesi", () => {
  it("şablonları listeler (ad + kullanım + güncelleme sayacı)", async () => {
    adminApiMock.listThemeLibrary.mockResolvedValue({ templates: [template()] });
    render(<ThemeLibraryPage />);
    await screen.findByText("Modern Şablon");
    expect(screen.getByText("4 mağaza")).toBeTruthy();
    expect(screen.getByText("1 güncelleme bekliyor")).toBeTruthy();
  });

  it("boş liste → boş durum gösterir", async () => {
    adminApiMock.listThemeLibrary.mockResolvedValue({ templates: [] });
    render(<ThemeLibraryPage />);
    await screen.findByText("Henüz şablon yok");
  });

  it("hata → uyarı + tekrar dene", async () => {
    adminApiMock.listThemeLibrary.mockRejectedValue(new MockUiError("NETWORK"));
    render(<ThemeLibraryPage />);
    await screen.findByText("Liste yüklenemedi");
  });
});

describe("PolicyMatrix", () => {
  it("bir alanı locked yapınca onChange doğru policy ile çağrılır", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PolicyMatrix policy={defaultOverridePolicy()} onChange={onChange} />);
    // "Ana buton rengi" alanının select'ini locked'a çevir.
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "locked");
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[0][0];
    expect(Object.values(arg.fields)).toContain("locked");
  });
});

describe("BeforeAfter", () => {
  it("değişiklik yoksa bilgilendirir", () => {
    render(<BeforeAfter summary={{ changes: [], counts: {}, total: 0, hasChanges: false }} />);
    expect(screen.getByText(/Değişiklik yok/)).toBeTruthy();
  });
  it("renk değişimini önce/sonra gösterir", () => {
    render(
      <BeforeAfter
        summary={{
          changes: [
            { path: "brand.primaryColor", labelTr: "Ana buton rengi", labelEn: "Primary", category: "color", before: "#111111", after: "#ff0000", kind: "changed" },
          ],
          counts: { color: 1 },
          total: 1,
          hasChanges: true,
        }}
      />,
    );
    expect(screen.getByText("Ana buton rengi")).toBeTruthy();
    expect(screen.getByText("#ff0000")).toBeTruthy();
  });
});
