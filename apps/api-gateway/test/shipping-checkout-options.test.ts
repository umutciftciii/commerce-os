/**
 * TODO-125 — Checkout kargo SEÇENEK üreteci birim testleri (saf fonksiyon).
 * Bir seçenek = AKTİF rate plan + price-engine fiyatı + ENABLED provider görünümü.
 */
import { describe, expect, it } from "vitest";
import { buildShippingOptions, type ProviderDisplayMap } from "../src/shipping/checkout-options.js";
import type { EngineAddress, EngineCart, EngineRatePlan } from "../src/shipping/price-engine.js";

function plan(over: Partial<EngineRatePlan> & Pick<EngineRatePlan, "id" | "name">): EngineRatePlan {
  return {
    provider: null,
    status: "ACTIVE",
    isDefault: false,
    pricingMode: "FIXED",
    currency: "TRY",
    fixedAmountMinor: 4990,
    freeShippingThresholdMinor: null,
    deliveryEstimate: null,
    validFrom: null,
    validTo: null,
    rules: [],
    tiers: [],
    zones: [],
    surcharges: [],
    ...over,
  };
}

const cart: EngineCart = {
  subtotalMinor: 10_000,
  totalDesi: 0,
  totalWeightKg: 0,
  missingDesi: false,
  missingWeight: false,
};
const address: EngineAddress = { cityCode: "Istanbul", districtCode: "Kadikoy", regionCode: null, zoneCode: null };

const displays: ProviderDisplayMap = new Map([
  ["DHL_ECOMMERCE", { displayName: "DHL Express", logoUrl: "https://cdn/dhl.png", logoAlt: "DHL" }],
]);

describe("buildShippingOptions (TODO-125)", () => {
  it("prices multiple active plans and selects the default by default", () => {
    const result = buildShippingOptions({
      plans: [
        plan({ id: "a", name: "Hızlı", provider: "DHL_ECOMMERCE", fixedAmountMinor: 4990, isDefault: true }),
        plan({ id: "b", name: "Ekonomik", provider: "MOCK", fixedAmountMinor: 2500 }),
      ],
      providerDisplays: displays,
      cart,
      address,
      addressKnown: true,
    });
    expect(result.options).toHaveLength(2);
    expect(result.selectedOptionId).toBe("a"); // default plan
    const a = result.options.find((o) => o.optionId === "a")!;
    expect(a).toMatchObject({ providerName: "DHL Express", priceMinor: 4990, logoUrl: "https://cdn/dhl.png", available: true });
  });

  it("falls back to a safe provider label when no ENABLED display exists (no logo leak)", () => {
    const result = buildShippingOptions({
      plans: [plan({ id: "b", name: "Ekonomik", provider: "MOCK", fixedAmountMinor: 2500 })],
      providerDisplays: new Map(), // hicbir ENABLED config yok
      cart,
      address,
      addressKnown: true,
    });
    const b = result.options[0]!;
    expect(b.providerName).toBe("Demo Kargo"); // güvenli fallback
    expect(b.logoUrl).toBeNull();
  });

  it("honours a valid requested option id", () => {
    const result = buildShippingOptions({
      plans: [
        plan({ id: "a", name: "Hızlı", fixedAmountMinor: 4990, isDefault: true }),
        plan({ id: "b", name: "Ekonomik", fixedAmountMinor: 2500 }),
      ],
      providerDisplays: displays,
      cart,
      address,
      addressKnown: true,
      requestedOptionId: "b",
    });
    expect(result.selectedOptionId).toBe("b");
    expect(result.selected?.outcome.amountMinor).toBe(2500);
  });

  it("picks the cheapest available option when there is no default and no request", () => {
    const result = buildShippingOptions({
      plans: [
        plan({ id: "a", name: "Hızlı", fixedAmountMinor: 4990 }),
        plan({ id: "b", name: "Ekonomik", fixedAmountMinor: 2500 }),
      ],
      providerDisplays: displays,
      cart,
      address,
      addressKnown: true,
    });
    expect(result.selectedOptionId).toBe("b"); // en ucuz
  });

  it("excludes plans that cannot price for this cart (no matching rule)", () => {
    const result = buildShippingOptions({
      plans: [
        plan({ id: "a", name: "Hızlı", fixedAmountMinor: 4990, isDefault: true }),
        // DESI tablosu ama kural yok → RATE_NOT_FOUND → seçenek listesinde YOK.
        plan({ id: "bad", name: "Kötü", pricingMode: "DESI_TABLE", fixedAmountMinor: null }),
      ],
      providerDisplays: displays,
      cart,
      address,
      addressKnown: true,
    });
    expect(result.options.map((o) => o.optionId)).toEqual(["a"]);
    expect(result.activeOptionIds).toContain("bad"); // aktif ama uygun değil
  });

  it("lists carriers unpriced when the address is unknown (cart preview)", () => {
    const result = buildShippingOptions({
      plans: [plan({ id: "a", name: "Hızlı", provider: "DHL_ECOMMERCE", fixedAmountMinor: 4990, isDefault: true })],
      providerDisplays: displays,
      cart,
      address: null,
      addressKnown: false,
    });
    expect(result.options).toHaveLength(1);
    expect(result.options[0]!.priceMinor).toBeNull();
    expect(result.options[0]!.available).toBe(false);
    expect(result.options[0]!.providerName).toBe("DHL Express"); // taşıyıcı yine görünür
  });

  it("returns no selection when there are no plans", () => {
    const result = buildShippingOptions({
      plans: [],
      providerDisplays: displays,
      cart,
      address,
      addressKnown: true,
    });
    expect(result.options).toHaveLength(0);
    expect(result.selectedOptionId).toBeNull();
    expect(result.selected).toBeNull();
  });
});
