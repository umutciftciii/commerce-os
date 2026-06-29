/**
 * F3C.2 — Shipping price engine birim testleri (saf fonksiyon).
 * Kargo ucreti SAGLAYICI quote'u DEGILDIR; store tarife planindan hesaplanir.
 */
import { describe, expect, it } from "vitest";
import {
  calculateShippingQuote,
  type EngineCart,
  type EngineRatePlan,
  type EngineRateRule,
} from "../src/shipping/price-engine.js";

const baseCart: EngineCart = {
  subtotalMinor: 10_000,
  totalDesi: 0,
  totalWeightKg: 0,
  missingDesi: false,
  missingWeight: false,
};

function plan(overrides: Partial<EngineRatePlan>): EngineRatePlan {
  return {
    id: "plan_1",
    name: "Standart Kargo",
    provider: null,
    status: "ACTIVE",
    isDefault: true,
    pricingMode: "FIXED",
    currency: "TRY",
    fixedAmountMinor: 4990,
    freeShippingThresholdMinor: null,
    validFrom: null,
    validTo: null,
    rules: [],
    ...overrides,
  };
}

function rule(overrides: Partial<EngineRateRule>): EngineRateRule {
  return {
    id: "rule_1",
    minDesi: null,
    maxDesi: null,
    minWeightKg: null,
    maxWeightKg: null,
    cityCode: null,
    districtCode: null,
    regionCode: null,
    amountMinor: 0,
    extraAmountMinor: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe("F3C.2 price engine", () => {
  it("1) FIXED plan returns the fixed amount", () => {
    const out = calculateShippingQuote({ plan: plan({ pricingMode: "FIXED", fixedAmountMinor: 4990 }), cart: baseCart, address: null });
    expect(out.status).toBe("OK");
    expect(out.amountMinor).toBe(4990);
    expect(out.source).toBe("STORE_SHIPPING_TARIFF");
    expect(out.freeShipping).toBe(false);
  });

  it("2) FREE_THRESHOLD: at/above threshold -> amount 0, freeShipping", () => {
    const out = calculateShippingQuote({
      plan: plan({ pricingMode: "FREE_THRESHOLD", fixedAmountMinor: 4990, freeShippingThresholdMinor: 7500 }),
      cart: { ...baseCart, subtotalMinor: 7500 },
      address: null,
    });
    expect(out.status).toBe("OK");
    expect(out.amountMinor).toBe(0);
    expect(out.freeShipping).toBe(true);
  });

  it("3) FREE_THRESHOLD: below threshold -> base fixed amount", () => {
    const out = calculateShippingQuote({
      plan: plan({ pricingMode: "FREE_THRESHOLD", fixedAmountMinor: 4990, freeShippingThresholdMinor: 75_000 }),
      cart: { ...baseCart, subtotalMinor: 5000 },
      address: null,
    });
    expect(out.status).toBe("OK");
    expect(out.amountMinor).toBe(4990);
    expect(out.freeShipping).toBe(false);
  });

  it("4) DESI_TABLE picks the correct bracket", () => {
    const out = calculateShippingQuote({
      plan: plan({
        pricingMode: "DESI_TABLE",
        fixedAmountMinor: null,
        rules: [
          rule({ id: "r1", minDesi: 0, maxDesi: 5, amountMinor: 3000 }),
          rule({ id: "r2", minDesi: 5, maxDesi: 10, amountMinor: 5000 }),
        ],
      }),
      cart: { ...baseCart, totalDesi: 7 },
      address: null,
    });
    expect(out.status).toBe("OK");
    expect(out.amountMinor).toBe(5000);
    expect(out.appliedRuleId).toBe("r2");
  });

  it("5) WEIGHT_TABLE picks the correct bracket", () => {
    const out = calculateShippingQuote({
      plan: plan({
        pricingMode: "WEIGHT_TABLE",
        fixedAmountMinor: null,
        rules: [
          rule({ id: "w1", minWeightKg: 0, maxWeightKg: 2, amountMinor: 2000 }),
          rule({ id: "w2", minWeightKg: 2, maxWeightKg: 5, amountMinor: 4000 }),
        ],
      }),
      cart: { ...baseCart, totalWeightKg: 3.5 },
      address: null,
    });
    expect(out.amountMinor).toBe(4000);
    expect(out.appliedRuleId).toBe("w2");
  });

  it("6) DESI_TABLE with missing dimensions -> MISSING_DIMENSIONS", () => {
    const out = calculateShippingQuote({
      plan: plan({ pricingMode: "DESI_TABLE", fixedAmountMinor: null, rules: [rule({ minDesi: 0, maxDesi: 10, amountMinor: 1000 })] }),
      cart: { ...baseCart, missingDesi: true },
      address: null,
    });
    expect(out.status).toBe("MISSING_DIMENSIONS");
    expect(out.reason).toBe("MISSING_SHIPPING_DIMENSIONS");
  });

  it("7) no plan -> NO_RATE_PLAN", () => {
    const out = calculateShippingQuote({ plan: null, cart: baseCart, address: null });
    expect(out.status).toBe("NO_RATE_PLAN");
    expect(out.amountMinor).toBeNull();
  });

  it("7b) passive plan -> NO_RATE_PLAN", () => {
    const out = calculateShippingQuote({ plan: plan({ status: "PASSIVE" }), cart: baseCart, address: null });
    expect(out.status).toBe("NO_RATE_PLAN");
  });

  it("8) city/district specificity wins over generic, tie-break by sortOrder", () => {
    const out = calculateShippingQuote({
      plan: plan({
        pricingMode: "DESI_AND_REGION_TABLE",
        fixedAmountMinor: null,
        rules: [
          rule({ id: "generic", minDesi: 0, maxDesi: 100, amountMinor: 9000, sortOrder: 0 }),
          rule({ id: "city", minDesi: 0, maxDesi: 100, cityCode: "34", amountMinor: 5000, sortOrder: 1 }),
          rule({ id: "district", minDesi: 0, maxDesi: 100, cityCode: "34", districtCode: "Kadikoy", amountMinor: 3000, sortOrder: 2 }),
        ],
      }),
      cart: { ...baseCart, totalDesi: 4 },
      address: { cityCode: "34", districtCode: "Kadikoy", regionCode: null },
    });
    expect(out.appliedRuleId).toBe("district");
    expect(out.amountMinor).toBe(3000);
  });

  it("8b) DESI_AND_REGION_TABLE without address -> ADDRESS_REQUIRED", () => {
    const out = calculateShippingQuote({
      plan: plan({ pricingMode: "DESI_AND_REGION_TABLE", fixedAmountMinor: null, rules: [rule({ minDesi: 0, maxDesi: 10, amountMinor: 1000 })] }),
      cart: { ...baseCart, totalDesi: 4 },
      address: null,
    });
    expect(out.status).toBe("ADDRESS_REQUIRED");
  });

  it("9) no matching rule -> RATE_NOT_FOUND", () => {
    const out = calculateShippingQuote({
      plan: plan({ pricingMode: "DESI_TABLE", fixedAmountMinor: null, rules: [rule({ minDesi: 0, maxDesi: 5, amountMinor: 1000 })] }),
      cart: { ...baseCart, totalDesi: 20 },
      address: null,
    });
    expect(out.status).toBe("RATE_NOT_FOUND");
  });

  it("11) extraAmountMinor is added as surcharge", () => {
    const out = calculateShippingQuote({
      plan: plan({ pricingMode: "DESI_TABLE", fixedAmountMinor: null, rules: [rule({ minDesi: 0, maxDesi: 10, amountMinor: 3000, extraAmountMinor: 500 })] }),
      cart: { ...baseCart, totalDesi: 4 },
      address: null,
    });
    expect(out.amountMinor).toBe(3500);
  });

  it("free threshold applies across modes (DESI_TABLE above threshold -> free)", () => {
    const out = calculateShippingQuote({
      plan: plan({
        pricingMode: "DESI_TABLE",
        fixedAmountMinor: null,
        freeShippingThresholdMinor: 5000,
        rules: [rule({ minDesi: 0, maxDesi: 10, amountMinor: 3000 })],
      }),
      cart: { ...baseCart, subtotalMinor: 6000, totalDesi: 4 },
      address: null,
    });
    expect(out.status).toBe("OK");
    expect(out.amountMinor).toBe(0);
    expect(out.freeShipping).toBe(true);
  });

  it("validTo in the past -> NO_RATE_PLAN (expired window)", () => {
    const out = calculateShippingQuote({
      plan: plan({ validTo: new Date("2020-01-01T00:00:00.000Z") }),
      cart: baseCart,
      address: null,
      now: new Date("2026-06-29T00:00:00.000Z"),
    });
    expect(out.status).toBe("NO_RATE_PLAN");
  });
});
