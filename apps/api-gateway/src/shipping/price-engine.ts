/**
 * F3C.2 — Shipping price engine (store tarife).
 *
 * TEMEL KARAR (ADR-036): Kargo ucreti SAGLAYICI quote'u DEGILDIR. Magaza/admin
 * tarafindan girilen kargo tarife planina (ShippingRatePlan + kurallar) gore
 * hesaplanir. DHL eCommerce yalniz OPERASYON sağlayıcısıdır; bu motor hicbir
 * provider'a canli istek atmaz — saf, deterministik bir fonksiyondur.
 *
 * Saf tutulur (prisma/fastify import ETMEZ) ki birim testleri tek basina kosar.
 */

export type ShippingQuoteStatusValue =
  | "OK"
  | "ADDRESS_REQUIRED"
  | "NO_RATE_PLAN"
  | "RATE_NOT_FOUND"
  | "MISSING_DIMENSIONS"
  | "UNAVAILABLE"
  | "ERROR";

export type ShippingRateSourceValue = "STORE_FIXED_RULE" | "STORE_SHIPPING_TARIFF" | "MOCK";

export type ShippingRateProvider = "MOCK" | "GELIVER" | "DHL_ECOMMERCE" | null;

export type ShippingPricingMode =
  | "FIXED"
  | "FREE_THRESHOLD"
  | "DESI_TABLE"
  | "WEIGHT_TABLE"
  | "DESI_AND_REGION_TABLE";

export interface EngineRateRule {
  id: string;
  minDesi: number | null;
  maxDesi: number | null;
  minWeightKg: number | null;
  maxWeightKg: number | null;
  cityCode: string | null;
  districtCode: string | null;
  regionCode: string | null;
  amountMinor: number;
  extraAmountMinor: number | null;
  sortOrder: number;
}

export interface EngineRatePlan {
  id: string;
  name: string;
  provider: ShippingRateProvider;
  status: "ACTIVE" | "PASSIVE";
  isDefault: boolean;
  pricingMode: ShippingPricingMode;
  currency: string;
  fixedAmountMinor: number | null;
  freeShippingThresholdMinor: number | null;
  validFrom: Date | null;
  validTo: Date | null;
  rules: EngineRateRule[];
}

export interface EngineCart {
  subtotalMinor: number;
  /** Sepet toplam desi (eksik olcum varsa hesaplanamaz; missingDesi=true). */
  totalDesi: number;
  /** Sepet toplam kg (eksik olcum varsa hesaplanamaz; missingWeight=true). */
  totalWeightKg: number;
  /** Desi gerektiren satirlarda en az birinde olcum eksik mi. */
  missingDesi: boolean;
  /** Kg gerektiren satirlarda en az birinde olcum eksik mi. */
  missingWeight: boolean;
}

export interface EngineAddress {
  cityCode: string | null;
  districtCode: string | null;
  regionCode: string | null;
}

export interface ShippingQuoteOutcome {
  status: ShippingQuoteStatusValue;
  source: ShippingRateSourceValue | null;
  amountMinor: number | null;
  currency: string;
  ratePlanId: string | null;
  ratePlanName: string | null;
  freeShipping: boolean;
  appliedRuleId: string | null;
  /** Makine-okunur sebep kodu (log/test icin; kullaniciya gosterilen i18n DEGIL). */
  reason: string | null;
}

export interface CalculateShippingInput {
  plan: EngineRatePlan | null;
  cart: EngineCart;
  address: EngineAddress | null;
  now?: Date;
}

/** Plan gecerlilik penceresi icinde ve ACTIVE mi. */
export function isPlanActive(plan: EngineRatePlan, now: Date): boolean {
  if (plan.status !== "ACTIVE") return false;
  if (plan.validFrom && now < plan.validFrom) return false;
  if (plan.validTo && now > plan.validTo) return false;
  return true;
}

/** Tablo modunda hangi pricingMode'larin teslimat adresine ihtiyaci var. */
function modeRequiresAddress(mode: ShippingPricingMode): boolean {
  return mode === "DESI_AND_REGION_TABLE";
}

/**
 * Adres + olcum degerine gore en UYGUN ve en SPESIFIK kurali secer.
 * Eslesmeyen geo alani (kural city/district/region doluyken adres farkli) kurali
 * tamamen eler. Spesiflik: district(4) > city(2) > region(1) > generic(0).
 * Esitlikte sortOrder kucuk olan oncelikli; o da esitse ilk kural.
 */
function pickRule(
  rules: EngineRateRule[],
  value: number,
  dimension: "desi" | "weight",
  address: EngineAddress | null,
): EngineRateRule | null {
  let best: EngineRateRule | null = null;
  let bestScore = -1;
  for (const rule of rules) {
    const min = dimension === "desi" ? rule.minDesi : rule.minWeightKg;
    const max = dimension === "desi" ? rule.maxDesi : rule.maxWeightKg;
    if (min !== null && value < min) continue;
    if (max !== null && value > max) continue;

    let score = 0;
    if (rule.districtCode !== null) {
      if (!address || address.districtCode !== rule.districtCode) continue;
      score += 4;
    }
    if (rule.cityCode !== null) {
      if (!address || address.cityCode !== rule.cityCode) continue;
      score += 2;
    }
    if (rule.regionCode !== null) {
      if (!address || address.regionCode !== rule.regionCode) continue;
      score += 1;
    }

    if (
      score > bestScore ||
      (score === bestScore && best !== null && rule.sortOrder < best.sortOrder)
    ) {
      best = rule;
      bestScore = score;
    }
  }
  return best;
}

function baseOutcome(plan: EngineRatePlan | null, currency: string): ShippingQuoteOutcome {
  return {
    status: "ERROR",
    source: null,
    amountMinor: null,
    currency,
    ratePlanId: plan?.id ?? null,
    ratePlanName: plan?.name ?? null,
    freeShipping: false,
    appliedRuleId: null,
    reason: null,
  };
}

/** Plan provider'i MOCK ise quote source'u MOCK; aksi halde STORE_SHIPPING_TARIFF. */
function planSource(plan: EngineRatePlan): ShippingRateSourceValue {
  return plan.provider === "MOCK" ? "MOCK" : "STORE_SHIPPING_TARIFF";
}

/**
 * Ana hesaplama. Adres gerekliligi (storefront guest/no-address) cagiran katmanda
 * ele alinir; bu motor adres gercekten gerektiginde (region tablosu) ADDRESS_REQUIRED
 * doner. FIXED/FREE_THRESHOLD adres gerektirmez.
 */
export function calculateShippingQuote(input: CalculateShippingInput): ShippingQuoteOutcome {
  const now = input.now ?? new Date();
  const { plan, cart, address } = input;
  const currency = plan?.currency ?? "TRY";
  const out = baseOutcome(plan, currency);

  if (!plan) {
    return { ...out, status: "NO_RATE_PLAN", reason: "PLAN_NULL" };
  }
  if (!isPlanActive(plan, now)) {
    return { ...out, status: "NO_RATE_PLAN", reason: "PLAN_INACTIVE" };
  }

  // Ucretsiz kargo esigi (her modda gecerli): subtotal >= esik ise ucret 0.
  if (plan.freeShippingThresholdMinor !== null && cart.subtotalMinor >= plan.freeShippingThresholdMinor) {
    return {
      ...out,
      status: "OK",
      source: planSource(plan),
      amountMinor: 0,
      freeShipping: true,
      reason: "FREE_THRESHOLD_MET",
    };
  }

  switch (plan.pricingMode) {
    case "FIXED": {
      if (plan.fixedAmountMinor === null) {
        return { ...out, status: "ERROR", reason: "FIXED_AMOUNT_MISSING" };
      }
      return {
        ...out,
        status: "OK",
        source: planSource(plan),
        amountMinor: plan.fixedAmountMinor,
      };
    }
    case "FREE_THRESHOLD": {
      // Esik altinda: taban ucret fixedAmountMinor (yoksa 0).
      return {
        ...out,
        status: "OK",
        source: planSource(plan),
        amountMinor: plan.fixedAmountMinor ?? 0,
      };
    }
    case "DESI_TABLE":
    case "WEIGHT_TABLE":
    case "DESI_AND_REGION_TABLE": {
      const useWeight = plan.pricingMode === "WEIGHT_TABLE";
      if (modeRequiresAddress(plan.pricingMode) && !address) {
        return { ...out, status: "ADDRESS_REQUIRED", reason: "ADDRESS_MISSING" };
      }
      if (useWeight ? cart.missingWeight : cart.missingDesi) {
        return { ...out, status: "MISSING_DIMENSIONS", reason: "MISSING_SHIPPING_DIMENSIONS" };
      }
      const value = useWeight ? cart.totalWeightKg : cart.totalDesi;
      const rule = pickRule(plan.rules, value, useWeight ? "weight" : "desi", address);
      if (!rule) {
        return { ...out, status: "RATE_NOT_FOUND", reason: "NO_MATCHING_RULE" };
      }
      return {
        ...out,
        status: "OK",
        source: planSource(plan),
        amountMinor: rule.amountMinor + (rule.extraAmountMinor ?? 0),
        appliedRuleId: rule.id,
      };
    }
    default: {
      return { ...out, status: "ERROR", reason: "UNKNOWN_MODE" };
    }
  }
}
