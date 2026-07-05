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
  displayTitle: null,
  shortDescription: null,
  terms: null,
  badgeLabel: null,
  badgeVariant: null,
  cardStyle: "STANDARD",
  accessModel: "PUBLIC_CLAIMABLE",
  displayPriority: 0,
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

// F4A.1 — Otomatik kupon kodu uretici: buton kodu doldurur, alan duzenlenebilir
// kalir; benzersizlik dogrulamasi backend'de kalir (burada yalniz UI akisi).
describe("store-admin · F4A.1 auto coupon code generator", () => {
  it("fills the coupon input with a generated, editable code", async () => {
    seedHappyPath();
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await screen.findByText("TEST250 Kuponu");

    await user.click(screen.getByRole("button", { name: "Yeni kampanya" }));
    await user.type(screen.getByLabelText("Kampanya adı"), "Yaz Şöleni");
    await user.type(screen.getByLabelText("İndirim yüzdesi (1-100)"), "10");
    await user.click(screen.getByRole("button", { name: "Otomatik Oluştur" }));

    const input = screen.getByLabelText("Kupon kodu") as HTMLInputElement;
    expect(input.value.startsWith("YAZSOLENI10-")).toBe(true);
    expect(input.value).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/);

    // Uretim sonrasi kullanici kodu duzenleyebilir.
    await user.clear(input);
    await user.type(input, "ELLE-KOD1");
    expect(input.value).toBe("ELLE-KOD1");
  });

  it("does not show the generate button while editing an existing campaign", async () => {
    seedHappyPath();
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await screen.findByText("TEST250 Kuponu");

    await user.click(screen.getByRole("button", { name: "Düzenle" }));
    expect(screen.queryByRole("button", { name: "Otomatik Oluştur" })).toBeNull();
  });
});

// F4A.2 — Kampanya detay analitigi (ADR-059): snapshot-tabanli sayilar, tekil
// musteri, ciro oncesi/sonrasi, ortalamalar ve siparis detayina baglanti.
describe("store-admin · F4A.2 campaign analytics", () => {
  const DETAIL_WITH_ANALYTICS = {
    ...COUPON_CAMPAIGN,
    recentRedemptions: [
      {
        id: "red_1",
        orderId: "order_1",
        orderNumber: "OS-000042",
        couponCode: "TEST250",
        maskedEmail: "bu***@e***.com",
        discountAmountMinor: 25000,
        orderTotalMinor: 130000,
        createdAt: "2026-07-02T10:00:00.000Z",
      },
    ],
    totalRedemptionCount: 3,
    totalDiscountMinor: 75000,
    analytics: {
      redemptionCount: 3,
      uniqueCustomerCount: 2,
      totalDiscountMinor: 75000,
      ordersSubtotalMinor: 450000,
      ordersTotalMinor: 390000,
      avgDiscountPerOrderMinor: 25000,
      avgOrderTotalMinor: 130000,
      lastRedemptionAt: "2026-07-02T10:00:00.000Z",
    },
  };

  it("shows analytics and links recent redemptions to the order detail", async () => {
    seedHappyPath();
    storeApiMock.getCampaign.mockResolvedValue(DETAIL_WITH_ANALYTICS);
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await screen.findByText("TEST250 Kuponu");

    await user.click(screen.getByRole("button", { name: "Detay" }));
    expect(await screen.findByText("Kullanım istatistikleri")).toBeTruthy();
    expect(screen.getByText("Tekil müşteri:")).toBeTruthy();
    expect(screen.getByText("₺750,00")).toBeTruthy(); // toplam indirim
    expect(screen.getByText("₺4.500,00")).toBeTruthy(); // indirim oncesi ciro
    expect(screen.getByText("₺3.900,00")).toBeTruthy(); // indirim sonrasi ciro

    const orderLink = screen.getByRole("link", { name: "OS-000042" }) as HTMLAnchorElement;
    expect(orderLink.getAttribute("href")).toBe("/orders/order_1");
  });

  it("renders zeros for a campaign without redemptions", async () => {
    seedHappyPath();
    storeApiMock.getCampaign.mockResolvedValue({
      ...DETAIL_WITH_ANALYTICS,
      recentRedemptions: [],
      totalRedemptionCount: 0,
      totalDiscountMinor: 0,
      analytics: {
        redemptionCount: 0,
        uniqueCustomerCount: 0,
        totalDiscountMinor: 0,
        ordersSubtotalMinor: 0,
        ordersTotalMinor: 0,
        avgDiscountPerOrderMinor: 0,
        avgOrderTotalMinor: 0,
        lastRedemptionAt: null,
      },
    });
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await screen.findByText("TEST250 Kuponu");

    await user.click(screen.getByRole("button", { name: "Detay" }));
    expect(await screen.findByText("Henüz kullanım yok.")).toBeTruthy();
    expect(screen.getAllByText(/₺0,00/).length).toBeGreaterThanOrEqual(1);
  });
});

// F4A.4 — Kampanya/kupon sunum alanları + erişim modeli (ADR-061). Sunum alanları
// yalnızca görünümdür; indirim hesabını etkilemez. "Takip et kazan" hiçbir yerde yok.
describe("store-admin · F4A.4 campaign presentation & access model", () => {
  it("renders the six form sections and the coupon card preview", async () => {
    seedHappyPath();
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await screen.findByText("TEST250 Kuponu");

    await user.click(screen.getByRole("button", { name: "Yeni kampanya" }));
    expect(screen.getByText("Görünüm / Kupon Kartı")).toBeTruthy();
    expect(screen.getByText("İndirim Kuralı")).toBeTruthy();
    expect(screen.getByText("Geçerlilik")).toBeTruthy();
    expect(screen.getByText("Erişim / Kitle")).toBeTruthy();
    expect(screen.getByText("Kapsam")).toBeTruthy();
    expect(screen.getByText("Önizleme")).toBeTruthy();
    // Preview kart aksiyonu placeholder'ı görünür.
    expect(screen.getAllByText("Kullan").length).toBeGreaterThanOrEqual(1);
  });

  it("never renders any follow-to-earn / reserved audience option", async () => {
    seedHappyPath();
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await screen.findByText("TEST250 Kuponu");

    await user.click(screen.getByRole("button", { name: "Yeni kampanya" }));
    expect(screen.queryByText(/takip et/i)).toBeNull();
    expect(screen.queryByText(/follow/i)).toBeNull();
    expect(screen.queryByText(/mağaza.*takip/i)).toBeNull();
    // Reserved segmentler (enforce edilemez) formda GÖRÜNMEZ.
    expect(screen.queryByText(/ilk alışveriş/i)).toBeNull();
    expect(screen.queryByText(/geri dönen/i)).toBeNull();
    expect(screen.queryByText(/e-posta listesi/i)).toBeNull();
  });

  it("offers only the supported claim access models for a coupon campaign", async () => {
    seedHappyPath();
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await screen.findByText("TEST250 Kuponu");

    await user.click(screen.getByRole("button", { name: "Yeni kampanya" }));
    const accessSelect = screen.getByLabelText("Erişim modeli") as HTMLSelectElement;
    const optionLabels = Array.from(accessSelect.options).map((o) => o.textContent);
    expect(optionLabels).toContain("Herkese açık kupon");
    expect(optionLabels).toContain("Kod ile kazanılan özel kupon");
    expect(optionLabels).toContain("Müşteriye atanan kupon");
    // Otomatik model kupon tipinde erişim seçeneği olarak listelenmez.
    expect(optionLabels).not.toContain("Otomatik sepette indirim");
  });

  it("saves the display fields and derived access model on create", async () => {
    seedHappyPath();
    storeApiMock.createCampaign.mockResolvedValue({});
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await screen.findByText("TEST250 Kuponu");

    await user.click(screen.getByRole("button", { name: "Yeni kampanya" }));
    await user.type(screen.getByLabelText("Kampanya adı"), "Hafta Sonu");
    await user.type(screen.getByLabelText("Kupon başlığı (opsiyonel)"), "Hafta sonu 500 TL’ye 100 TL kupon");
    await user.type(screen.getByLabelText("Kart etiketi (opsiyonel)"), "Süper Kupon");
    await user.type(screen.getByLabelText("İndirim yüzdesi (1-100)"), "10");
    await user.type(screen.getByLabelText("Kupon kodu"), "HAFTASONU10");
    await user.click(screen.getByRole("button", { name: "Oluştur" }));

    await waitFor(() => {
      expect(storeApiMock.createCampaign).toHaveBeenCalledTimes(1);
    });
    const payload = storeApiMock.createCampaign.mock.calls[0][0];
    expect(payload.displayTitle).toBe("Hafta sonu 500 TL’ye 100 TL kupon");
    expect(payload.badgeLabel).toBe("Süper Kupon");
    expect(payload.accessModel).toBe("PUBLIC_CLAIMABLE");
    // isPublic form tarafından gönderilmez; sunucuda accessModel'den türetilir.
    expect(payload.isPublic).toBeUndefined();
  });

  it("edits an existing campaign with null display fields without crashing", async () => {
    seedHappyPath();
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await screen.findByText("TEST250 Kuponu");

    await user.click(screen.getByRole("button", { name: "Düzenle" }));
    // Sunum bölümü ve boş başlık alanı sorunsuz açılır.
    expect(screen.getByText("Görünüm / Kupon Kartı")).toBeTruthy();
    expect((screen.getByLabelText("Kupon başlığı (opsiyonel)") as HTMLInputElement).value).toBe("");
  });
});
