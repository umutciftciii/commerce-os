/**
 * F3C.2 — Shipping price engine birim testleri (saf fonksiyon).
 * Kargo ucreti SAGLAYICI quote'u DEGILDIR; store tarife planindan hesaplanir.
 */
import { describe, expect, it } from "vitest";
import {
  calculateShippingQuote,
  billableWeight,
  selectTier,
  resolveShippingDims,
  type EngineCart,
  type EngineRatePlan,
  type EngineRateRule,
  type EngineRateTier,
  type EngineRateZone,
  type EngineSurcharge,
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
    deliveryEstimate: null,
    validFrom: null,
    validTo: null,
    rules: [],
    tiers: [],
    zones: [],
    surcharges: [],
    ...overrides,
  };
}

function rule(overrides: Partial<EngineRateRule>): EngineRateRule {
  return {
    id: "rule_1",
    tierId: null,
    zoneId: null,
    minDesi: null,
    maxDesi: null,
    minWeightKg: null,
    maxWeightKg: null,
    cityCode: null,
    districtCode: null,
    regionCode: null,
    chargeType: "FLAT",
    amountMinor: 0,
    unitAmountMinor: null,
    baseAmountMinor: null,
    baseThreshold: null,
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

  it("4b) DESI_TABLE: decimal desi 3.01 matches inclusive [3,5] bracket", () => {
    // Smoke senaryosu: urun shippingDesi=3.01. TEK adette billable=3.01, alt sinir
    // dahil (minDesi=3) eslesmeli; ondalik kayma RATE_NOT_FOUND'a yol acmamali.
    const desiPlan = plan({
      pricingMode: "DESI_TABLE",
      fixedAmountMinor: null,
      rules: [
        rule({ id: "d0_3", minDesi: 0, maxDesi: 3, amountMinor: 2000 }),
        rule({ id: "d3_5", minDesi: 3, maxDesi: 5, amountMinor: 3500 }),
        rule({ id: "d5_10", minDesi: 5, maxDesi: 10, amountMinor: 5000 }),
      ],
    });
    const single = calculateShippingQuote({ plan: desiPlan, cart: { ...baseCart, totalDesi: 3.01 }, address: null });
    expect(single.status).toBe("OK");
    expect(single.appliedRuleId).toBe("d3_5");
    expect(single.amountMinor).toBe(3500);

    // 2 adet -> sepet desisi 6.02 (billable max(kg,desi)); ust brackete (5-10) duser.
    // Kurali ispatlar: ucret SEPET toplamindan hesaplanir, adet-basi degil.
    const twoUnits = calculateShippingQuote({ plan: desiPlan, cart: { ...baseCart, totalDesi: 6.02 }, address: null });
    expect(twoUnits.status).toBe("OK");
    expect(twoUnits.appliedRuleId).toBe("d5_10");
    expect(twoUnits.amountMinor).toBe(5000);
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

/* ─────────────────── F3C.2 revizyon — Generic Tariff Engine ─────────────────── */

function tier(overrides: Partial<EngineRateTier>): EngineRateTier {
  return { id: "tier", name: "Tarife", monthlyShipmentMin: null, monthlyShipmentMax: null, sortOrder: 0, ...overrides };
}
function zone(overrides: Partial<EngineRateZone>): EngineRateZone {
  return { id: "zone", code: "CITY", name: "Şehir içi", minDistanceKm: null, maxDistanceKm: null, sortOrder: 0, ...overrides };
}
function surcharge(overrides: Partial<EngineSurcharge>): EngineSurcharge {
  return {
    id: "sur",
    code: "SMS",
    name: "SMS",
    chargeType: "FLAT",
    amountMinor: 0,
    unitAmountMinor: null,
    conditionJsonSafe: null,
    isOptional: false,
    sortOrder: 0,
    ...overrides,
  };
}

describe("F3C.2 revizyon — tier/zone/charge/surcharge", () => {
  // DHL tarzi Tarife I/II/III: aylik gonderi adedine gore tier secimi.
  const dhlTiers: EngineRateTier[] = [
    tier({ id: "I", name: "Tarife I", monthlyShipmentMin: 0, monthlyShipmentMax: 199, sortOrder: 0 }),
    tier({ id: "II", name: "Tarife II", monthlyShipmentMin: 200, monthlyShipmentMax: 499, sortOrder: 1 }),
    tier({ id: "III", name: "Tarife III", monthlyShipmentMin: 500, monthlyShipmentMax: null, sortOrder: 2 }),
  ];
  const dhlPlan = plan({
    pricingMode: "DESI_TABLE",
    fixedAmountMinor: null,
    tiers: dhlTiers,
    rules: [
      rule({ id: "rI", tierId: "I", minDesi: 0, maxDesi: 30, amountMinor: 5000 }),
      rule({ id: "rII", tierId: "II", minDesi: 0, maxDesi: 30, amountMinor: 4000 }),
      rule({ id: "rIII", tierId: "III", minDesi: 0, maxDesi: 30, amountMinor: 3000 }),
    ],
  });

  it("selectTier maps monthly volume to the right tier (100->I, 250->II, 700->III)", () => {
    expect(selectTier(dhlTiers, 100)?.id).toBe("I");
    expect(selectTier(dhlTiers, 250)?.id).toBe("II");
    expect(selectTier(dhlTiers, 700)?.id).toBe("III");
  });

  it("unknown monthly volume -> first sortOrder tier (default)", () => {
    expect(selectTier(dhlTiers, null)?.id).toBe("I");
  });

  it("DHL: monthlyShipmentCount 250 picks Tarife II rule", () => {
    const out = calculateShippingQuote({ plan: dhlPlan, cart: { ...baseCart, totalDesi: 10 }, address: null, monthlyShipmentCount: 250 });
    expect(out.status).toBe("OK");
    expect(out.appliedRuleId).toBe("rII");
    expect(out.appliedTierId).toBe("II");
    expect(out.amountMinor).toBe(4000);
  });

  it("DHL: 700 -> Tarife III; unknown volume -> Tarife I (default)", () => {
    const t3 = calculateShippingQuote({ plan: dhlPlan, cart: { ...baseCart, totalDesi: 10 }, address: null, monthlyShipmentCount: 700 });
    expect(t3.appliedRuleId).toBe("rIII");
    const t1 = calculateShippingQuote({ plan: dhlPlan, cart: { ...baseCart, totalDesi: 10 }, address: null });
    expect(t1.appliedRuleId).toBe("rI");
  });

  it("Aras-style zone selection by resolved zoneCode", () => {
    const arasPlan = plan({
      pricingMode: "DESI_AND_REGION_TABLE",
      fixedAmountMinor: null,
      zones: [zone({ id: "z_city", code: "CITY" }), zone({ id: "z_far", code: "FAR" })],
      rules: [
        rule({ id: "generic", minDesi: 0, maxDesi: 100, amountMinor: 9000, sortOrder: 0 }),
        rule({ id: "city", zoneId: "z_city", minDesi: 0, maxDesi: 100, amountMinor: 4000, sortOrder: 1 }),
        rule({ id: "far", zoneId: "z_far", minDesi: 0, maxDesi: 100, amountMinor: 7000, sortOrder: 2 }),
      ],
    });
    const out = calculateShippingQuote({
      plan: arasPlan,
      cart: { ...baseCart, totalDesi: 5 },
      address: { cityCode: "34", districtCode: null, regionCode: null, zoneCode: "FAR" },
    });
    expect(out.appliedRuleId).toBe("far");
    expect(out.appliedZoneId).toBe("z_far");
    expect(out.amountMinor).toBe(7000);
  });

  it("billableWeight = max(kg, desi)", () => {
    expect(billableWeight({ ...baseCart, totalWeightKg: 2, totalDesi: 5 })).toBe(5);
    expect(billableWeight({ ...baseCart, totalWeightKg: 8, totalDesi: 3 })).toBe(8);
  });

  it("bracket matches on billableWeight = max(kg, desi)", () => {
    // kg=2, desi=6 -> billable=6 -> 5-10 bracket.
    const out = calculateShippingQuote({
      plan: plan({
        pricingMode: "DESI_TABLE",
        fixedAmountMinor: null,
        rules: [
          rule({ id: "a", minDesi: 0, maxDesi: 5, amountMinor: 1000 }),
          rule({ id: "b", minDesi: 5, maxDesi: 10, amountMinor: 2000 }),
        ],
      }),
      cart: { ...baseCart, totalWeightKg: 2, totalDesi: 6 },
      address: null,
    });
    expect(out.appliedRuleId).toBe("b");
  });

  it("31+ PER_ADDITIONAL_KG_OR_DESI: base + (billable - threshold) * unit", () => {
    // Aras 31+ kg: 30'a kadar base, ustu kg/desi basina ek birim. billable=33 -> 3 birim ek.
    const out = calculateShippingQuote({
      plan: plan({
        pricingMode: "DESI_TABLE",
        fixedAmountMinor: null,
        rules: [
          rule({ id: "upTo30", minDesi: 0, maxDesi: 30, amountMinor: 5000 }),
          rule({
            id: "over30",
            chargeType: "PER_ADDITIONAL_KG_OR_DESI",
            minDesi: 30,
            maxDesi: null, // "ve uzeri"
            baseAmountMinor: 5000,
            baseThreshold: 30,
            unitAmountMinor: 400,
          }),
        ],
      }),
      cart: { ...baseCart, totalDesi: 33 },
      address: null,
    });
    expect(out.appliedRuleId).toBe("over30");
    expect(out.amountMinor).toBe(5000 + 3 * 400); // 6200
  });

  it("surcharge: mandatory always added; optional only when selected; condition gates", () => {
    const p = plan({
      pricingMode: "DESI_TABLE",
      fixedAmountMinor: null,
      rules: [rule({ id: "r", minDesi: 0, maxDesi: 100, amountMinor: 3000 })],
      surcharges: [
        surcharge({ id: "ins", code: "INSURANCE", chargeType: "FLAT", amountMinor: 500, isOptional: false }),
        surcharge({ id: "sms", code: "SMS", chargeType: "FLAT", amountMinor: 200, isOptional: true }),
        surcharge({ id: "heavy", code: "HEAVY", chargeType: "FLAT", amountMinor: 1000, isOptional: false, conditionJsonSafe: { minBillable: 30 } }),
      ],
    });
    // billable=10: INSURANCE(500) eklenir, SMS secilmedi, HEAVY kosulu saglanmaz.
    const a = calculateShippingQuote({ plan: p, cart: { ...baseCart, totalDesi: 10 }, address: null });
    expect(a.amountMinor).toBe(3000 + 500);
    expect(a.surchargeCodes).toEqual(["INSURANCE"]);
    // SMS secilir + billable=40 -> HEAVY kosulu saglanir.
    const b = calculateShippingQuote({
      plan: p,
      cart: { ...baseCart, totalDesi: 40 },
      address: null,
      selectedSurchargeCodes: ["SMS"],
    });
    expect(b.amountMinor).toBe(3000 + 500 + 200 + 1000);
    expect(b.surchargeCodes).toEqual(["INSURANCE", "SMS", "HEAVY"]);
  });

  it("zone + tier + desi rule eşleşmesi birlikte", () => {
    const p = plan({
      pricingMode: "DESI_AND_REGION_TABLE",
      fixedAmountMinor: null,
      tiers: [tier({ id: "II", monthlyShipmentMin: 200, monthlyShipmentMax: 499, sortOrder: 1 })],
      zones: [zone({ id: "z_far", code: "FAR" })],
      rules: [
        rule({ id: "match", tierId: "II", zoneId: "z_far", minDesi: 0, maxDesi: 30, amountMinor: 8000 }),
        rule({ id: "wrongTier", tierId: "OTHER", zoneId: "z_far", minDesi: 0, maxDesi: 30, amountMinor: 1 }),
      ],
    });
    const out = calculateShippingQuote({
      plan: p,
      cart: { ...baseCart, totalDesi: 12 },
      address: { cityCode: "01", districtCode: null, regionCode: null, zoneCode: "FAR" },
      monthlyShipmentCount: 250,
    });
    expect(out.appliedRuleId).toBe("match");
    expect(out.amountMinor).toBe(8000);
  });

  it("resolveShippingDims: variant overrides product; falls back when null; null when both null", () => {
    // Varyant degeri urun-seviyesini override eder.
    expect(resolveShippingDims({ shippingDesi: 4, shippingWeightKg: 0.5 }, { shippingDesi: 3, shippingWeightKg: 0.4 })).toEqual({
      shippingDesi: 4,
      shippingWeightKg: 0.5,
    });
    // Varyantta yoksa urun-seviyesi fallback.
    expect(resolveShippingDims({ shippingDesi: null, shippingWeightKg: null }, { shippingDesi: 3, shippingWeightKg: 0.4 })).toEqual({
      shippingDesi: 3,
      shippingWeightKg: 0.4,
    });
    // Kismi: desi varyanttan, kg urunden.
    expect(resolveShippingDims({ shippingDesi: 6, shippingWeightKg: null }, { shippingDesi: 3, shippingWeightKg: 0.4 })).toEqual({
      shippingDesi: 6,
      shippingWeightKg: 0.4,
    });
    // Ikisi de null -> null (MISSING_SHIPPING_DIMENSIONS'a yol acar).
    expect(resolveShippingDims({ shippingDesi: null, shippingWeightKg: null }, { shippingDesi: null, shippingWeightKg: null })).toEqual({
      shippingDesi: null,
      shippingWeightKg: null,
    });
  });

  it("FLAT default preserves legacy amount + extra (backward compatible)", () => {
    const out = calculateShippingQuote({
      plan: plan({ pricingMode: "DESI_TABLE", fixedAmountMinor: null, rules: [rule({ minDesi: 0, maxDesi: 10, amountMinor: 3000, extraAmountMinor: 250 })] }),
      cart: { ...baseCart, totalDesi: 4 },
      address: null,
    });
    expect(out.amountMinor).toBe(3250);
  });
});
