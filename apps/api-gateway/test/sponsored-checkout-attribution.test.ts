import { describe, expect, it } from "vitest";
import { resolveSponsoredForCheckout } from "../src/sponsored/checkout-attribution.js";
import { signSponsoredToken, SPONSORED_TOKEN_VERSION } from "../src/sponsored/sponsored-core.js";
import type { SponsoredData, SponsoredCampaignRecord } from "../src/sponsored/data.js";

const SECRET = "test-session-secret-with-enough-length-1234";
const NOW = 1_000_000;

function campaign(overrides: Partial<SponsoredCampaignRecord> = {}): SponsoredCampaignRecord {
  return {
    id: "camp-1",
    storeId: "store-1",
    name: "Kampanya",
    status: "ACTIVE",
    placement: "SEARCH_RESULTS",
    startsAt: null,
    endsAt: null,
    priority: 0,
    maxSlots: 3,
    targetCategoryId: null,
    timezone: "Europe/Istanbul",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

/** Yalnız getCampaign kullanılır; diğer metodlar test kapsamı dışı (stub). */
function fakeData(campaigns: Record<string, SponsoredCampaignRecord | null>): SponsoredData {
  return {
    getCampaign: async (_storeId, id) => campaigns[id] ?? null,
  } as unknown as SponsoredData;
}

function makeToken(overrides: Parameters<typeof signSponsoredToken>[0] extends infer T ? Partial<T> : never = {}) {
  return signSponsoredToken(
    {
      v: SPONSORED_TOKEN_VERSION,
      storeId: "store-1",
      campaignId: "camp-1",
      placementId: "plc-1",
      productId: "prod-1",
      placement: "SEARCH_RESULTS",
      issuedAt: NOW - 1000,
      expiresAt: NOW + 1_000_000,
      ...overrides,
    },
    SECRET,
  );
}

describe("resolveSponsoredForCheckout (ADR-118/120)", () => {
  it("geçerli grant → attribution çözülür", async () => {
    const data = fakeData({ "camp-1": campaign() });
    const result = await resolveSponsoredForCheckout(data, "store-1", [makeToken()], SECRET, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ campaignId: "camp-1", productId: "prod-1", placementId: "plc-1" });
  });

  it("cross-store grant → reddedilir", async () => {
    const data = fakeData({ "camp-1": campaign() });
    const foreign = makeToken({ storeId: "store-2" });
    const result = await resolveSponsoredForCheckout(data, "store-1", [foreign], SECRET, NOW);
    expect(result).toHaveLength(0);
  });

  it("pencere dışı grant → reddedilir", async () => {
    const data = fakeData({ "camp-1": campaign() });
    const expired = makeToken({ expiresAt: NOW - 1 });
    const result = await resolveSponsoredForCheckout(data, "store-1", [expired], SECRET, NOW);
    expect(result).toHaveLength(0);
  });

  it("pasif kampanya → reddedilir", async () => {
    const data = fakeData({ "camp-1": campaign({ status: "PAUSED" }) });
    const result = await resolveSponsoredForCheckout(data, "store-1", [makeToken()], SECRET, NOW);
    expect(result).toHaveLength(0);
  });

  it("silinmiş kampanya → reddedilir", async () => {
    const data = fakeData({ "camp-1": null });
    const result = await resolveSponsoredForCheckout(data, "store-1", [makeToken()], SECRET, NOW);
    expect(result).toHaveLength(0);
  });

  it("kurcalanan imza → reddedilir", async () => {
    const data = fakeData({ "camp-1": campaign() });
    const result = await resolveSponsoredForCheckout(data, "store-1", [`${makeToken()}x`], SECRET, NOW);
    expect(result).toHaveLength(0);
  });

  it("aynı (campaign, product) iki kez → tek attribution (dedupe)", async () => {
    const data = fakeData({ "camp-1": campaign() });
    const t = makeToken();
    const result = await resolveSponsoredForCheckout(data, "store-1", [t, t], SECRET, NOW);
    expect(result).toHaveLength(1);
  });

  it("boş grant listesi → boş", async () => {
    const data = fakeData({ "camp-1": campaign() });
    expect(await resolveSponsoredForCheckout(data, "store-1", null, SECRET, NOW)).toHaveLength(0);
    expect(await resolveSponsoredForCheckout(data, "store-1", [], SECRET, NOW)).toHaveLength(0);
  });
});
