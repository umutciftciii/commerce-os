/**
 * TODO-162 (ADR-197…ADR-204) — Storefront Discovery eligibility SAF çekirdek testleri.
 * Kapsam (§27): eşik altı/eşit/üstü · admin-max invariant (min düşürülemez) · no-signal fallback yasağı ·
 * auth kapısı · viewer-desteği · DISCOVERY_GRID grid kuralı (min 2 / max 4, 1 kart → gizli).
 */
import { describe, expect, it } from "vitest";
import {
  DISCOVERY_GRID_MAX_CARDS,
  DISCOVERY_SECTION_TYPES,
  SECTION_BOUNDS,
  isDiscoveryGridCardType,
  isDiscoverySectionType,
  resolveDiscoveryGrid,
  resolveEffectiveMax,
  resolveHomeSectionEligibility,
  type HomeEligibilityContext,
} from "../src/home/eligibility-core.js";

function ctx(overrides: Partial<HomeEligibilityContext> = {}): HomeEligibilityContext {
  return {
    storeId: "store_1",
    visitorHash: "vh_1",
    customerId: null,
    isAuthenticated: false,
    recentlyViewedCount: 0,
    cartItemCount: 0,
    wishlistItemCount: 0,
    completedOrderCount: 0,
    recommendationCount: 0,
    activeCampaignProductCount: 0,
    eligibleSponsoredProductCount: 0,
    locale: "tr",
    currency: "TRY",
    ...overrides,
  };
}

describe("eligibility-core: taksonomi + bounds", () => {
  it("her discovery tipi için bounds tanımlıdır ve min ≤ max", () => {
    for (const type of DISCOVERY_SECTION_TYPES) {
      const b = SECTION_BOUNDS[type];
      expect(b).toBeTruthy();
      expect(b.min).toBeLessThanOrEqual(b.max);
      expect(b.min).toBeGreaterThanOrEqual(1);
    }
  });
  it("§17 min/max invariant değerleri", () => {
    expect(SECTION_BOUNDS.CONTINUE_BROWSING).toMatchObject({ min: 2, max: 4 });
    expect(SECTION_BOUNDS.CART_RECOMMENDATIONS).toMatchObject({ min: 3, max: 8 });
    expect(SECTION_BOUNDS.PERSONALIZED_DEALS).toMatchObject({ min: 3, max: 8 });
    expect(SECTION_BOUNDS.REPURCHASE).toMatchObject({ min: 2, max: 6 });
    expect(SECTION_BOUNDS.SIMILAR_TO_PURCHASED).toMatchObject({ min: 3, max: 8 });
    expect(SECTION_BOUNDS.WISHLIST_DEALS).toMatchObject({ min: 2, max: 6 });
    expect(SECTION_BOUNDS.DAILY_DEALS).toMatchObject({ min: 4, max: 12 });
    expect(SECTION_BOUNDS.SPONSORED_RAIL).toMatchObject({ min: 3, max: 8 });
    expect(SECTION_BOUNDS.GENERIC_PRODUCT_RAIL).toMatchObject({ min: 4, max: 12 });
  });
  it("fallback politikası (§18)", () => {
    // Kişiselleştirilmiş → fallback YASAK
    for (const t of ["CONTINUE_BROWSING", "CART_RECOMMENDATIONS", "PERSONALIZED_DEALS", "REPURCHASE", "SIMILAR_TO_PURCHASED", "WISHLIST_DEALS"] as const) {
      expect(SECTION_BOUNDS[t].fallbackAllowed).toBe(false);
    }
    // Generic → fallback İZİNLİ
    for (const t of ["DAILY_DEALS", "EDITORIAL_CAMPAIGN", "SPONSORED_RAIL", "GENERIC_PRODUCT_RAIL"] as const) {
      expect(SECTION_BOUNDS[t].fallbackAllowed).toBe(true);
    }
  });
  it("type guard'lar", () => {
    expect(isDiscoverySectionType("CONTINUE_BROWSING")).toBe(true);
    expect(isDiscoverySectionType("HERO_SLIDER")).toBe(false);
    expect(isDiscoveryGridCardType("DAILY_DEALS")).toBe(true);
    expect(isDiscoveryGridCardType("REPURCHASE")).toBe(false); // grid kartı değil
  });
});

describe("eligibility-core: eşik (threshold)", () => {
  it("eşik ALTI → gizli", () => {
    const r = resolveHomeSectionEligibility(ctx({ recentlyViewedCount: 1 }), {
      type: "CONTINUE_BROWSING",
      candidateCount: 1,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("BELOW_THRESHOLD");
    expect(r.itemCount).toBe(0);
  });
  it("eşik EŞİT → görünür (min = itemCount)", () => {
    const r = resolveHomeSectionEligibility(ctx({ recentlyViewedCount: 2 }), {
      type: "CONTINUE_BROWSING",
      candidateCount: 2,
    });
    expect(r.eligible).toBe(true);
    expect(r.itemCount).toBe(2);
    expect(r.source).toBe("RECENTLY_VIEWED");
  });
  it("eşik ÜSTÜ → max ile kelepçelenir (5 → 4)", () => {
    const r = resolveHomeSectionEligibility(ctx(), { type: "CONTINUE_BROWSING", candidateCount: 5 });
    expect(r.eligible).toBe(true);
    expect(r.itemCount).toBe(4);
  });
  it("public reason yalnız server-side (sonuçta var ama BFF çıkarmalı)", () => {
    const r = resolveHomeSectionEligibility(ctx(), { type: "DAILY_DEALS", candidateCount: 4 });
    expect(r.reason).toBe("OK");
  });
});

describe("eligibility-core: admin-max invariant (§17)", () => {
  it("admin max'ı düşürebilir (8 → 5)", () => {
    const r = resolveHomeSectionEligibility(ctx(), {
      type: "CART_RECOMMENDATIONS",
      candidateCount: 8,
      adminMaxItems: 5,
    });
    expect(r.eligible).toBe(true);
    expect(r.itemCount).toBe(5);
  });
  it("admin max'ı bounds.max ÜSTÜNE çıkaramaz (12 istese de 8'de kalır)", () => {
    const r = resolveHomeSectionEligibility(ctx(), {
      type: "CART_RECOMMENDATIONS",
      candidateCount: 20,
      adminMaxItems: 12,
    });
    expect(r.itemCount).toBe(8);
  });
  it("admin max'ı min'in ALTINA indirirse → gizlenir (sahte yetersiz gösterilmez)", () => {
    const r = resolveHomeSectionEligibility(ctx(), {
      type: "CART_RECOMMENDATIONS",
      candidateCount: 8,
      adminMaxItems: 2, // min=3
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("ADMIN_MAX_BELOW_MIN");
  });
  it("resolveEffectiveMax kelepçeleme", () => {
    const b = SECTION_BOUNDS.CART_RECOMMENDATIONS; // min3 max8
    expect(resolveEffectiveMax(b, null)).toBe(8);
    expect(resolveEffectiveMax(b, 5)).toBe(5);
    expect(resolveEffectiveMax(b, 99)).toBe(8);
    expect(resolveEffectiveMax(b, 0)).toBe(1);
  });
});

describe("eligibility-core: no-signal fallback yasağı (§18)", () => {
  it("kişiselleştirilmiş + signalPresent=false → gizli (yeterli aday olsa bile)", () => {
    const r = resolveHomeSectionEligibility(ctx(), {
      type: "PERSONALIZED_DEALS",
      candidateCount: 8,
      signalPresent: false,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("NO_SIGNAL");
  });
  it("kişiselleştirilmiş + signalPresent=true + eşik → görünür", () => {
    const r = resolveHomeSectionEligibility(ctx({ wishlistItemCount: 3 }), {
      type: "PERSONALIZED_DEALS",
      candidateCount: 4,
      signalPresent: true,
    });
    expect(r.eligible).toBe(true);
  });
  it("generic (DAILY_DEALS) signalPresent=false OLSA BİLE render edilebilir (fallback izinli)", () => {
    const r = resolveHomeSectionEligibility(ctx(), {
      type: "DAILY_DEALS",
      candidateCount: 6,
      signalPresent: false,
    });
    expect(r.eligible).toBe(true);
  });
  it("admin fallback'i KAPATABİLİR → generic bile no-signal'da gizlenir", () => {
    const r = resolveHomeSectionEligibility(ctx(), {
      type: "DAILY_DEALS",
      candidateCount: 6,
      signalPresent: false,
      fallbackDisabledByAdmin: true,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("NO_SIGNAL");
  });
});

describe("eligibility-core: auth kapısı + viewer desteği (§5/§12/§13)", () => {
  it("REPURCHASE guest'te ASLA render edilmez", () => {
    const r = resolveHomeSectionEligibility(ctx({ isAuthenticated: false }), {
      type: "REPURCHASE",
      candidateCount: 5,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("AUTH_REQUIRED");
  });
  it("REPURCHASE authenticated + eşik → görünür", () => {
    const r = resolveHomeSectionEligibility(ctx({ isAuthenticated: true, customerId: "c1", completedOrderCount: 1 }), {
      type: "REPURCHASE",
      candidateCount: 2,
    });
    expect(r.eligible).toBe(true);
    expect(r.itemCount).toBe(2);
  });
  it("admin guestSupported=false → guest'te gizli", () => {
    const r = resolveHomeSectionEligibility(ctx({ isAuthenticated: false }), {
      type: "CONTINUE_BROWSING",
      candidateCount: 3,
      guestSupported: false,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("GUEST_DISABLED");
  });
  it("admin authSupported=false → auth'ta gizli", () => {
    const r = resolveHomeSectionEligibility(ctx({ isAuthenticated: true, customerId: "c1" }), {
      type: "CONTINUE_BROWSING",
      candidateCount: 3,
      authSupported: false,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("AUTH_DISABLED");
  });
});

describe("eligibility-core: bilinmeyen tip", () => {
  it("allowlist dışı tip → gizli", () => {
    const r = resolveHomeSectionEligibility(ctx(), { type: "MYSTERY_BOX", candidateCount: 99 });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("UNKNOWN_TYPE");
  });
});

describe("eligibility-core: DISCOVERY_GRID grid kuralı (§6)", () => {
  it("0 eligible kart → grid gizli", () => {
    const r = resolveDiscoveryGrid([
      { type: "CONTINUE_BROWSING", eligible: false, order: 0 },
      { type: "DAILY_DEALS", eligible: false, order: 1 },
    ]);
    expect(r.eligible).toBe(false);
    expect(r.columns).toBe(0);
  });
  it("1 eligible kart → grid render EDİLMEZ", () => {
    const r = resolveDiscoveryGrid([
      { type: "CONTINUE_BROWSING", eligible: true, order: 0 },
      { type: "DAILY_DEALS", eligible: false, order: 1 },
    ]);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("INSUFFICIENT_CARDS");
  });
  it("2 eligible → 2 kolon, admin sırasında", () => {
    const r = resolveDiscoveryGrid([
      { type: "DAILY_DEALS", eligible: true, order: 1 },
      { type: "CONTINUE_BROWSING", eligible: true, order: 0 },
    ]);
    expect(r.eligible).toBe(true);
    expect(r.columns).toBe(2);
    expect(r.cards).toEqual(["CONTINUE_BROWSING", "DAILY_DEALS"]);
  });
  it("5 eligible → max 4 kart", () => {
    const r = resolveDiscoveryGrid([
      { type: "CONTINUE_BROWSING", eligible: true, order: 0 },
      { type: "CART_RECOMMENDATIONS", eligible: true, order: 1 },
      { type: "PERSONALIZED_DEALS", eligible: true, order: 2 },
      { type: "EDITORIAL_CAMPAIGN", eligible: true, order: 3 },
      { type: "DAILY_DEALS", eligible: true, order: 4 },
    ]);
    expect(r.eligible).toBe(true);
    expect(r.cards).toHaveLength(DISCOVERY_GRID_MAX_CARDS);
    expect(r.columns).toBe(4);
    expect(r.cards).not.toContain("DAILY_DEALS"); // 5. kart düşer
  });
});
