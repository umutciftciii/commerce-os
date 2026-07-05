import { describe, expect, it } from "vitest";
import type { CampaignCouponRecord, CampaignRecord } from "../src/campaigns/data.js";
import {
  projectCouponCenter,
  type CouponCenterUsedEntry,
  type WalletCandidate,
} from "../src/campaigns/wallet.js";

const NOW = new Date("2026-07-05T12:00:00Z");

function coupon(overrides: Partial<CampaignCouponRecord> = {}): CampaignCouponRecord {
  return {
    id: "coupon-1",
    code: "TEST250",
    normalizedCode: "TEST250",
    status: "ACTIVE",
    totalUsageLimit: null,
    perCustomerUsageLimit: null,
    usageCount: 0,
    startsAt: null,
    endsAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function campaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "camp-1",
    storeId: "store-1",
    name: "TEST250 Kupon",
    description: null,
    status: "ACTIVE",
    type: "COUPON_CODE",
    discountType: "FIXED_AMOUNT",
    discountValue: 25000,
    maxDiscountAmountMinor: null,
    minOrderAmountMinor: null,
    startsAt: null,
    endsAt: null,
    totalUsageLimit: null,
    perCustomerUsageLimit: null,
    usageCount: 0,
    stackable: false,
    priority: 0,
    isPublic: true,
    displayTitle: null,
    shortDescription: null,
    terms: null,
    badgeLabel: null,
    badgeVariant: null,
    cardStyle: "STANDARD",
    accessModel: "AUTO_VISIBLE",
    displayPriority: 0,
    productIds: [],
    categoryIds: [],
    coupons: [coupon()],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function candidate(overrides: {
  campaign?: Partial<CampaignRecord>;
  coupon?: Partial<CampaignCouponRecord>;
  source?: WalletCandidate["source"];
} = {}): WalletCandidate {
  return {
    campaign: campaign(overrides.campaign),
    coupon: coupon(overrides.coupon),
    source: overrides.source ?? "PUBLIC",
  };
}

function usedEntry(overrides: {
  campaign?: Partial<CampaignRecord>;
  coupon?: Partial<CampaignCouponRecord>;
  source?: CouponCenterUsedEntry["source"];
  usedAt?: Date | null;
  orderNumber?: string | null;
} = {}): CouponCenterUsedEntry {
  return {
    campaign: campaign(overrides.campaign),
    coupon: coupon(overrides.coupon),
    source: overrides.source ?? "CLAIMED",
    usedAt: overrides.usedAt ?? new Date("2026-07-01T09:00:00Z"),
    orderNumber: overrides.orderNumber ?? "ORD-1001",
  };
}

describe("projectCouponCenter (F4A.5)", () => {
  it("kullanilabilir public kupon AVAILABLE kart doner (allowlist alanlar)", () => {
    const [card] = projectCouponCenter([candidate()], [], NOW);
    expect(card).toEqual({
      code: "TEST250",
      discountType: "FIXED_AMOUNT",
      discountValue: 25000,
      minOrderAmountMinor: null,
      endsAt: null,
      state: "AVAILABLE",
      source: "PUBLIC",
      usedAt: null,
      orderNumber: null,
      // F4A.4 — Sunum alanlari (ADR-061); fixture varsayilanlariyla null/STANDARD.
      displayTitle: null,
      shortDescription: null,
      badgeLabel: null,
      badgeVariant: null,
      cardStyle: "STANDARD",
      terms: null,
    });
  });

  it("F4A.4: admin sunum alanlarini kupon merkezi kartina tasir (allowlist)", () => {
    const [card] = projectCouponCenter(
      [
        candidate({
          campaign: {
            displayTitle: "Sana Özel Kupon",
            shortDescription: "Sadece bugün",
            badgeLabel: "Sana Özel",
            badgeVariant: "PERSONAL",
            cardStyle: "PERSONAL",
            terms: "Tek kullanımlıktır.",
          },
        }),
      ],
      [],
      NOW,
    );
    expect(card?.displayTitle).toBe("Sana Özel Kupon");
    expect(card?.badgeLabel).toBe("Sana Özel");
    expect(card?.badgeVariant).toBe("PERSONAL");
    expect(card?.cardStyle).toBe("PERSONAL");
    expect(card?.terms).toBe("Tek kullanımlıktır.");
  });

  it("alt limit merkez ucunda MIN_ORDER_NOT_MET uretmez (sepet-bagimsiz)", () => {
    const [card] = projectCouponCenter(
      [candidate({ campaign: { minOrderAmountMinor: 100000 } })],
      [],
      NOW,
    );
    expect(card?.state).toBe("AVAILABLE");
    expect(card?.minOrderAmountMinor).toBe(100000);
  });

  it("suresi dolmus kupon EXPIRED", () => {
    const [card] = projectCouponCenter(
      [candidate({ campaign: { endsAt: new Date("2026-06-01T00:00:00Z") } })],
      [],
      NOW,
    );
    expect(card?.state).toBe("EXPIRED");
  });

  it("kullanilmis kupon USED kart doner (usedAt + orderNumber + source)", () => {
    const cards = projectCouponCenter([], [usedEntry({ source: "ASSIGNED" })], NOW);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      code: "TEST250",
      state: "USED",
      source: "ASSIGNED",
      usedAt: "2026-07-01T09:00:00.000Z",
      orderNumber: "ORD-1001",
    });
  });

  it("kullanilmis kod 'Kullanılabilir'den dusurulur; yalniz USED'da gorunur", () => {
    const cards = projectCouponCenter([candidate()], [usedEntry()], NOW);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.state).toBe("USED");
  });

  it("kart yalnizca allowlist alanlarini tasir (ic kimlik/limit/priority sizmaz)", () => {
    const [card] = projectCouponCenter([candidate()], [], NOW);
    const keys = Object.keys(card ?? {}).sort();
    expect(keys).toEqual(
      [
        "code",
        "discountType",
        "discountValue",
        "endsAt",
        "minOrderAmountMinor",
        "orderNumber",
        "source",
        "state",
        "usedAt",
        // F4A.4 — Sunum alanlari da allowlist'in parcasidir (ADR-061).
        "displayTitle",
        "shortDescription",
        "badgeLabel",
        "badgeVariant",
        "cardStyle",
        "terms",
      ].sort(),
    );
  });
});
