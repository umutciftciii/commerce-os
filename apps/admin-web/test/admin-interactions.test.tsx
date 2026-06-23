// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginClientPage } from "../components/login-client-page.js";
import { AdminAppShell } from "../components/admin-app-shell.js";
import StoresPage from "../app/(app)/stores/page.js";
import PlansPage from "../app/(app)/plans/page.js";

const { adminApiMock, replace, MockUiError } = vi.hoisted(() => {
  class MockUiError extends Error {
    readonly code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }

  return {
    replace: vi.fn(),
    MockUiError,
    adminApiMock: {
      me: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      listStores: vi.fn(),
      createStore: vi.fn(),
      updateStore: vi.fn(),
      listPlans: vi.fn(),
      createPlan: vi.fn(),
      updatePlan: vi.fn(),
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("../lib/client/api.js", () => ({
  adminApi: adminApiMock,
  UiError: MockUiError,
}));

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("admin-web interactions", () => {
  it("renders login form validation and Turkish invalid-credential feedback", async () => {
    adminApiMock.me.mockRejectedValue(new Error("no-session"));
    adminApiMock.login.mockRejectedValue(new MockUiError("INVALID_CREDENTIALS"));
    const user = userEvent.setup();

    render(<LoginClientPage />);

    await screen.findByRole("button", { name: "Giriş yap" });
    await user.click(screen.getByRole("button", { name: "Giriş yap" }));
    expect(await screen.findByText("Geçerli bir e-posta adresi girin.")).toBeTruthy();

    await user.type(screen.getByLabelText("E-posta"), "admin@example.local");
    await user.type(screen.getByLabelText("Parola"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Giriş yap" }));

    expect(await screen.findByText("E-posta veya parola hatalı.")).toBeTruthy();
  });

  it("creates a store from the stores modal with mocked BFF calls", async () => {
    adminApiMock.listStores.mockResolvedValue({
      data: [],
      pagination: { limit: 50, offset: 0, total: 0 },
    });
    adminApiMock.createStore.mockResolvedValue({
      id: "s1",
      name: "Smoke Store",
      slug: "smoke-store",
      domain: "smoke.localhost",
      status: "ACTIVE",
      metadata: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    });
    const user = userEvent.setup();

    render(<StoresPage />);

    await user.click(await screen.findByRole("button", { name: "Yeni mağaza" }));
    await user.type(screen.getByLabelText("Mağaza adı"), "Smoke Store");
    await user.type(screen.getByLabelText("Kısa ad (slug)"), "smoke-store");
    await user.type(screen.getByLabelText("Alan adı (opsiyonel)"), "smoke.localhost");
    await user.click(screen.getByRole("button", { name: "Mağaza oluştur" }));

    await waitFor(() =>
      expect(adminApiMock.createStore).toHaveBeenCalledWith({
        name: "Smoke Store",
        slug: "smoke-store",
        status: "DRAFT",
        domain: "smoke.localhost",
      }),
    );
  });

  it("creates a plan from the plans modal with mocked BFF calls", async () => {
    adminApiMock.listPlans.mockResolvedValue({
      data: [],
      pagination: { limit: 50, offset: 0, total: 0 },
    });
    adminApiMock.createPlan.mockResolvedValue({
      id: "p1",
      code: "smoke-plan",
      name: "Smoke Plan",
      description: "Test plan",
      metadata: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    });
    const user = userEvent.setup();

    render(<PlansPage />);

    await user.click(await screen.findByRole("button", { name: "Yeni paket" }));
    await user.type(screen.getByLabelText("Paket kodu"), "smoke-plan");
    await user.type(screen.getByLabelText("Paket adı"), "Smoke Plan");
    await user.type(screen.getByLabelText("Açıklama (opsiyonel)"), "Test plan");
    await user.click(screen.getByRole("button", { name: "Paket oluştur" }));

    await waitFor(() =>
      expect(adminApiMock.createPlan).toHaveBeenCalledWith({
        code: "smoke-plan",
        name: "Smoke Plan",
        description: "Test plan",
      }),
    );
  });

  it("calls logout from the app shell and redirects to login", async () => {
    adminApiMock.me.mockResolvedValue({
      user: { id: "u1", email: "admin@example.local", name: "Admin", role: "SUPER_ADMIN" },
      session: { id: "sess", expiresAt: new Date().toISOString() },
    });
    adminApiMock.logout.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<AdminAppShell>İçerik</AdminAppShell>);

    await user.click(await screen.findByRole("button", { name: "Çıkış yap" }));

    expect(adminApiMock.logout).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
