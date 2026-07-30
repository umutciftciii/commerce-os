/**
 * TODO-162 (ADR-197/202/204) — Katman B Discovery orchestration SAF çekirdek testleri.
 * Kapsam: sinyal-kapısı (heavy query öncesi) · page-level dedupe · finalize (eşik-tekrar + cap + seen mutasyonu).
 */
import { describe, expect, it } from "vitest";
import {
  candidateFetchLimit,
  dedupeProductIds,
  finalizeRail,
  sectionSignalGate,
} from "../src/home/discovery-core.js";
import type { HomeEligibilityContext } from "../src/home/eligibility-core.js";

function ctx(overrides: Partial<HomeEligibilityContext> = {}): HomeEligibilityContext {
  return {
    storeId: "s1",
    visitorHash: "vh",
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

describe("discovery-core: sinyal-kapısı", () => {
  it("CONTINUE_BROWSING: <2 view → attempt yok", () => {
    expect(sectionSignalGate(ctx({ recentlyViewedCount: 1 }), "CONTINUE_BROWSING").attempt).toBe(false);
    expect(sectionSignalGate(ctx({ recentlyViewedCount: 2 }), "CONTINUE_BROWSING").attempt).toBe(true);
  });
  it("CART_RECOMMENDATIONS: boş cart → attempt yok", () => {
    expect(sectionSignalGate(ctx({ cartItemCount: 0 }), "CART_RECOMMENDATIONS").attempt).toBe(false);
    expect(sectionSignalGate(ctx({ cartItemCount: 1 }), "CART_RECOMMENDATIONS").attempt).toBe(true);
  });
  it("REPURCHASE/SIMILAR: guest → attempt yok (auth-only)", () => {
    expect(sectionSignalGate(ctx({ isAuthenticated: false, completedOrderCount: 5 }), "REPURCHASE").attempt).toBe(false);
    expect(sectionSignalGate(ctx({ isAuthenticated: true, completedOrderCount: 1 }), "REPURCHASE").attempt).toBe(true);
    expect(sectionSignalGate(ctx({ isAuthenticated: true, completedOrderCount: 0 }), "SIMILAR_TO_PURCHASED").attempt).toBe(false);
  });
  it("PERSONALIZED_DEALS: herhangi bir sinyal yeter", () => {
    expect(sectionSignalGate(ctx(), "PERSONALIZED_DEALS").attempt).toBe(false);
    expect(sectionSignalGate(ctx({ wishlistItemCount: 1 }), "PERSONALIZED_DEALS").signalPresent).toBe(true);
    expect(sectionSignalGate(ctx({ recentlyViewedCount: 1 }), "PERSONALIZED_DEALS").attempt).toBe(true);
  });
  it("DAILY_DEALS/SPONSORED_RAIL: her zaman dener (generic)", () => {
    expect(sectionSignalGate(ctx(), "DAILY_DEALS").attempt).toBe(true);
    expect(sectionSignalGate(ctx(), "SPONSORED_RAIL").attempt).toBe(true);
  });
  it("WISHLIST_DEALS: <2 wishlist → attempt yok", () => {
    expect(sectionSignalGate(ctx({ wishlistItemCount: 1 }), "WISHLIST_DEALS").attempt).toBe(false);
    expect(sectionSignalGate(ctx({ wishlistItemCount: 2 }), "WISHLIST_DEALS").attempt).toBe(true);
  });
});

describe("discovery-core: dedupe", () => {
  it("seen + section-içi tekrarı eler, sıra korunur", () => {
    const seen = new Set(["p1"]);
    expect(dedupeProductIds(["p1", "p2", "p3", "p2"], seen)).toEqual(["p2", "p3"]);
  });
});

describe("discovery-core: finalizeRail", () => {
  it("dedupe sonrası eşik sağlanır → eligible + seen mutasyonu", () => {
    const seen = new Set<string>();
    const r = finalizeRail(
      ctx({ recentlyViewedCount: 4 }),
      { type: "CONTINUE_BROWSING", candidateIds: ["a", "b", "c", "d", "e"], signalPresent: true },
      seen,
    );
    expect(r.eligible).toBe(true);
    expect(r.productIds).toEqual(["a", "b", "c", "d"]); // max 4
    expect([...seen]).toEqual(["a", "b", "c", "d"]);
  });
  it("dedupe sonrası min bozulursa gizlenir; seen değişmez", () => {
    const seen = new Set(["a", "b", "c"]); // önceki section'lar aldı
    const r = finalizeRail(
      ctx({ recentlyViewedCount: 4 }),
      { type: "CONTINUE_BROWSING", candidateIds: ["a", "b", "c", "d"], signalPresent: true }, // yalnız d kalır → <2
      seen,
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("BELOW_THRESHOLD");
    expect(seen.has("d")).toBe(false); // gizlenen section seen'i kirletmez
  });
  it("no-signal kişiselleştirilmiş → gizli (aday olsa bile)", () => {
    const seen = new Set<string>();
    const r = finalizeRail(
      ctx(),
      { type: "PERSONALIZED_DEALS", candidateIds: ["a", "b", "c", "d"], signalPresent: false },
      seen,
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("NO_SIGNAL");
  });
  it("admin max düşürür (cap)", () => {
    const seen = new Set<string>();
    const r = finalizeRail(
      ctx({ cartItemCount: 1 }),
      { type: "CART_RECOMMENDATIONS", candidateIds: ["a", "b", "c", "d", "e"], signalPresent: true, adminMaxItems: 3 },
      seen,
    );
    expect(r.productIds).toHaveLength(3);
  });
});

describe("discovery-core: candidateFetchLimit", () => {
  it("bounds.max ile kelepçeli", () => {
    expect(candidateFetchLimit("CONTINUE_BROWSING", null)).toBe(4);
    expect(candidateFetchLimit("CART_RECOMMENDATIONS", null)).toBe(8);
    expect(candidateFetchLimit("CART_RECOMMENDATIONS", 5)).toBe(5);
    expect(candidateFetchLimit("DAILY_DEALS", 99)).toBe(12);
  });
});
