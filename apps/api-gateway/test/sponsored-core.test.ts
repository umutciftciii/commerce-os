import { describe, expect, it } from "vitest";
import {
  SPONSORED_TOKEN_VERSION,
  compareSponsored,
  computeSponsoredExpiry,
  computeSponsoredMetrics,
  dedupeSponsoredByProduct,
  injectSponsoredSlots,
  isWithinSponsoredWindow,
  matchesSponsoredRelevancy,
  normalizeKeyword,
  normalizeSearchText,
  signSponsoredToken,
  tokenizeQuery,
  verifySponsoredToken,
  type SponsoredTokenPayload,
  type SponsoredOrderable,
} from "../src/sponsored/sponsored-core.js";

const SECRET = "test-session-secret-with-enough-length-1234";

function token(overrides: Partial<SponsoredTokenPayload> = {}): SponsoredTokenPayload {
  return {
    v: SPONSORED_TOKEN_VERSION,
    storeId: "store-1",
    campaignId: "camp-1",
    placementId: "plc-1",
    productId: "prod-1",
    placement: "SEARCH_RESULTS",
    issuedAt: 1_000_000,
    expiresAt: 2_000_000,
    ...overrides,
  };
}

describe("normalizeSearchText / tokenizeQuery / normalizeKeyword", () => {
  it("locale-bağımsız lowercase + Türkçe sadeleştirme + boşluk", () => {
    expect(normalizeSearchText("Işıklı ÇANTA")).toBe("isikli canta");
    expect(normalizeSearchText("Ürün-Ş:Ğ")).toBe("urun s g");
  });
  it("tokenizeQuery tekrarsız token kümesi", () => {
    expect(tokenizeQuery("kırmızı  kırmızı ayakkabı")).toEqual(["kirmizi", "ayakkabi"]);
    expect(tokenizeQuery("   ")).toEqual([]);
    expect(tokenizeQuery(null)).toEqual([]);
  });
  it("normalizeKeyword boş → null", () => {
    expect(normalizeKeyword("  Ayakkabı ")).toBe("ayakkabi");
    expect(normalizeKeyword("!!!")).toBeNull();
  });
});

describe("matchesSponsoredRelevancy (ADR-116)", () => {
  const doc = { searchText: "kirmizi spor ayakkabi nike", primaryCategoryId: "cat-shoes" };

  it("query kelimesi kampanya allowlist'inde VE ürün metninde → geçer", () => {
    expect(
      matchesSponsoredRelevancy(["ayakkabi"], doc, { keywords: ["ayakkabi"], targetCategoryIds: null }),
    ).toBe(true);
  });

  it("kampanya kelimesi eşleşse bile ürün metni içermiyorsa → elenir (sponsor önceliği yetmez)", () => {
    expect(
      matchesSponsoredRelevancy(["telefon"], doc, { keywords: ["telefon"], targetCategoryIds: null }),
    ).toBe(false);
  });

  it("query var ama kampanya o kelimeyi hedeflemiyor → elenir", () => {
    expect(
      matchesSponsoredRelevancy(["ayakkabi"], doc, { keywords: ["canta"], targetCategoryIds: null }),
    ).toBe(false);
  });

  it("query yok → yalnız kategori hedefi geçerli", () => {
    expect(
      matchesSponsoredRelevancy([], doc, { keywords: [], targetCategoryIds: new Set(["cat-shoes"]) }),
    ).toBe(true);
    expect(
      matchesSponsoredRelevancy([], doc, { keywords: [], targetCategoryIds: new Set(["cat-other"]) }),
    ).toBe(false);
    expect(matchesSponsoredRelevancy([], doc, { keywords: [], targetCategoryIds: null })).toBe(false);
  });
});

describe("compareSponsored (ADR-119) — deterministik öncelik", () => {
  const base: SponsoredOrderable = {
    campaignPriority: 0,
    campaignCreatedAt: 100,
    campaignId: "b",
    placementPriority: 0,
    position: null,
  };
  it("priority DESC önce", () => {
    expect(compareSponsored({ ...base, campaignPriority: 5 }, { ...base, campaignPriority: 1 })).toBeLessThan(0);
  });
  it("eşit priority → createdAt ASC", () => {
    expect(compareSponsored({ ...base, campaignCreatedAt: 100 }, { ...base, campaignCreatedAt: 200 })).toBeLessThan(0);
  });
  it("eşit → id ASC (stabil)", () => {
    expect(compareSponsored({ ...base, campaignId: "a" }, { ...base, campaignId: "z" })).toBeLessThan(0);
  });
  it("position ASC (null en sona)", () => {
    expect(compareSponsored({ ...base, position: 0 }, { ...base, position: null })).toBeLessThan(0);
  });
});

describe("dedupeSponsoredByProduct (ADR-117)", () => {
  it("ürün başına ilk (en yüksek öncelikli) kazanır", () => {
    const sorted = [
      { productId: "p1", campaignId: "c1" },
      { productId: "p2", campaignId: "c1" },
      { productId: "p1", campaignId: "c2" },
    ];
    expect(dedupeSponsoredByProduct(sorted)).toEqual([
      { productId: "p1", campaignId: "c1" },
      { productId: "p2", campaignId: "c1" },
    ]);
  });
});

describe("injectSponsoredSlots (ADR-115)", () => {
  it("organik sırayı bozmadan lead sonrası enjekte eder", () => {
    const organic = ["o1", "o2", "o3", "o4"];
    const sponsored = ["s1", "s2"];
    expect(injectSponsoredSlots(organic, sponsored, { leadOrganic: 1, maxSlots: 2 })).toEqual([
      "o1",
      "s1",
      "s2",
      "o2",
      "o3",
      "o4",
    ]);
  });
  it("maxSlots tavanı uygulanır", () => {
    expect(injectSponsoredSlots(["o1"], ["s1", "s2", "s3"], { leadOrganic: 0, maxSlots: 1 })).toEqual(["s1", "o1"]);
  });
  it("sponsorlu yoksa organik aynen döner", () => {
    expect(injectSponsoredSlots(["o1", "o2"], [], { leadOrganic: 1, maxSlots: 2 })).toEqual(["o1", "o2"]);
  });
  it("lead organikten büyükse clamp", () => {
    expect(injectSponsoredSlots(["o1"], ["s1"], { leadOrganic: 5, maxSlots: 2 })).toEqual(["o1", "s1"]);
  });
});

describe("sponsored token sign/verify (ADR-118)", () => {
  it("round-trip", () => {
    const signed = signSponsoredToken(token(), SECRET);
    expect(verifySponsoredToken(signed, SECRET)).toEqual(token());
  });
  it("kurcalanan imza → null", () => {
    const signed = signSponsoredToken(token(), SECRET);
    expect(verifySponsoredToken(`${signed}x`, SECRET)).toBeNull();
  });
  it("yanlış secret → null", () => {
    const signed = signSponsoredToken(token(), SECRET);
    expect(verifySponsoredToken(signed, "other-secret-1234567890-abcdef")).toBeNull();
  });
  it("bozuk/eksik → null", () => {
    expect(verifySponsoredToken(null, SECRET)).toBeNull();
    expect(verifySponsoredToken("", SECRET)).toBeNull();
    expect(verifySponsoredToken("no-dot", SECRET)).toBeNull();
  });
});

describe("attribution penceresi", () => {
  it("computeSponsoredExpiry + isWithinSponsoredWindow", () => {
    const exp = computeSponsoredExpiry(0, 7);
    expect(exp).toBe(7 * 24 * 60 * 60 * 1000);
    expect(isWithinSponsoredWindow(exp - 1, exp)).toBe(true);
    expect(isWithinSponsoredWindow(exp + 1, exp)).toBe(false);
  });
});

describe("computeSponsoredMetrics (ADR-118)", () => {
  it("CTR = clicks/impressions, conversion = orders/clicks", () => {
    const m = computeSponsoredMetrics({
      impressions: 100,
      uniqueImpressions: 80,
      clicks: 10,
      carts: 4,
      orders: 2,
      grossRevenueMinor: 5000,
      refundedRevenueMinor: 1000,
      netRevenueMinor: 4000,
    });
    expect(m.clickThroughRate).toBeCloseTo(0.1);
    expect(m.conversionRate).toBeCloseTo(0.2);
  });
  it("payda 0 → 0", () => {
    const m = computeSponsoredMetrics({
      impressions: 0,
      uniqueImpressions: 0,
      clicks: 0,
      carts: 0,
      orders: 0,
      grossRevenueMinor: 0,
      refundedRevenueMinor: 0,
      netRevenueMinor: 0,
    });
    expect(m.clickThroughRate).toBe(0);
    expect(m.conversionRate).toBe(0);
  });
});
