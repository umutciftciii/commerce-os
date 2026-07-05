// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CampaignsPage from "../app/(app)/campaigns/page.js";

// F4A — Kampanya yönetim ekranı testi: liste render + form doğrulama + durum aksiyonu.
const { storeApiMock } = vi.hoisted(() => ({
  storeApiMock: {
    listCampaigns: vi.fn(),
    createCampaign: vi.fn(),
    getCampaign: vi.fn(),
    updateCampaign: vi.fn(),
    campaignStatusAction: vi.fn(),
    listProducts: vi.fn(),
    listCategories: vi.fn(),
  },
}));

vi.mock("../lib/client/api.js", () => ({ storeApi: storeApiMock }));

const COUPON_CAMPAIGN = {
  id: "camp_1",
  name: "TEST250 Kuponu",
  description: null,
  status: "ACTIVE",
  type: "COUPON_CODE",
  discountType: "FIXED_AMOUNT",
  discountValue: 25000,
  maxDiscountAmountMinor: null,
  minOrderAmountMinor: 100000,
  startsAt: null,
  endsAt: null,
  totalUsageLimit: 10,
  perCustomerUsageLimit: 1,
  usageCount: 3,
  stackable: false,
  priority: 0,
  isPublic: true,
  productIds: [],
  categoryIds: [],
  coupons: [
    {
      id: "coup_1",
      code: "TEST250",
      normalizedCode: "TEST250",
      status: "ACTIVE",
      totalUsageLimit: null,
      perCustomerUsageLimit: null,
      usageCount: 3,
      startsAt: null,
      endsAt: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    },
  ],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

function seedHappyPath() {
  storeApiMock.listCampaigns.mockResolvedValue({ data: [COUPON_CAMPAIGN] });
  storeApiMock.listProducts.mockResolvedValue({ data: [] });
  storeApiMock.listCategories.mockResolvedValue({ data: [] });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("store-admin · F4A campaigns page", () => {
  it("renders the campaign list with type, discount, usage and status", async () => {
    seedHappyPath();
    render(<CampaignsPage />);
    expect(await screen.findByText("TEST250 Kuponu")).toBeTruthy();
    expect(screen.getByText("Kupon kodu")).toBeTruthy();
    expect(screen.getByText("3 / 10")).toBeTruthy();
    expect(screen.getByText("Aktif")).toBeTruthy();
    expect(screen.getByText("TEST250")).toBeTruthy();
  });

  it("validates the form before sending anything to the server", async () => {
    seedHappyPath();
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await screen.findByText("TEST250 Kuponu");

    await user.click(screen.getByRole("button", { name: "Yeni kampanya" }));
    await user.type(screen.getByLabelText("Kampanya adı"), "Bozuk Kampanya");
    await user.type(screen.getByLabelText("İndirim yüzdesi (1-100)"), "150");
    await user.type(screen.getByLabelText("Kupon kodu"), "YENI10");
    await user.click(screen.getByRole("button", { name: "Oluştur" }));

    expect(await screen.findByText("Yüzde 1-100 arasında olmalıdır.")).toBeTruthy();
    expect(storeApiMock.createCampaign).not.toHaveBeenCalled();
  });

  it("pauses an active campaign via the status action", async () => {
    seedHappyPath();
    storeApiMock.campaignStatusAction.mockResolvedValue({ ...COUPON_CAMPAIGN, status: "PAUSED" });
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await screen.findByText("TEST250 Kuponu");

    await user.click(screen.getByRole("button", { name: "Duraklat" }));
    await waitFor(() => {
      expect(storeApiMock.campaignStatusAction).toHaveBeenCalledWith("camp_1", "pause");
    });
  });
});
