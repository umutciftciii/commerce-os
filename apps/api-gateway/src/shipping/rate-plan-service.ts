/**
 * F3C.2 — Shipping rate plan servisi: prisma <-> price-engine eslemeleri, aktif
 * default plan cozumlemesi, sepet desi/kg toplami ve quote serializasyonu.
 *
 * Kargo ucreti SAGLAYICI quote'u DEGILDIR (ADR-036): bu servis yalniz store
 * tarife planlarini okur ve saf price-engine'i besler.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { CartShippingQuoteResponse, ShippingRatePlanResponse } from "@commerce-os/contracts";
import {
  calculateShippingQuote,
  type EngineAddress,
  type EngineCart,
  type EngineRatePlan,
  type EngineRateRule,
  type ShippingQuoteOutcome,
} from "./price-engine.js";

type Decimalish = { toNumber: () => number } | number | null;

function decToNumber(value: Decimalish): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  return value.toNumber();
}

const ratePlanInclude = {
  rules: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
} satisfies Prisma.ShippingRatePlanInclude;

export type RatePlanWithRules = Prisma.ShippingRatePlanGetPayload<{ include: typeof ratePlanInclude }>;

/** Prisma plan kaydini saf engine tipine donusturur (Decimal -> number). */
export function toEnginePlan(plan: RatePlanWithRules): EngineRatePlan {
  return {
    id: plan.id,
    name: plan.name,
    provider: plan.provider,
    status: plan.status,
    isDefault: plan.isDefault,
    pricingMode: plan.pricingMode,
    currency: plan.currency,
    fixedAmountMinor: plan.fixedAmountMinor,
    freeShippingThresholdMinor: plan.freeShippingThresholdMinor,
    validFrom: plan.validFrom,
    validTo: plan.validTo,
    rules: plan.rules.map(
      (rule): EngineRateRule => ({
        id: rule.id,
        minDesi: decToNumber(rule.minDesi),
        maxDesi: decToNumber(rule.maxDesi),
        minWeightKg: decToNumber(rule.minWeightKg),
        maxWeightKg: decToNumber(rule.maxWeightKg),
        cityCode: rule.cityCode,
        districtCode: rule.districtCode,
        regionCode: rule.regionCode,
        amountMinor: rule.amountMinor,
        extraAmountMinor: rule.extraAmountMinor,
        sortOrder: rule.sortOrder,
      }),
    ),
  };
}

/** Plan kaydini contract response'una serialize eder (Decimal -> number, tarih -> ISO). */
export function serializeRatePlan(plan: RatePlanWithRules): ShippingRatePlanResponse {
  return {
    id: plan.id,
    provider: plan.provider,
    name: plan.name,
    status: plan.status,
    isDefault: plan.isDefault,
    pricingMode: plan.pricingMode,
    currency: plan.currency,
    fixedAmountMinor: plan.fixedAmountMinor,
    freeShippingThresholdMinor: plan.freeShippingThresholdMinor,
    validFrom: plan.validFrom?.toISOString() ?? null,
    validTo: plan.validTo?.toISOString() ?? null,
    ruleCount: plan.rules.length,
    rules: plan.rules.map((rule) => ({
      id: rule.id,
      minDesi: decToNumber(rule.minDesi),
      maxDesi: decToNumber(rule.maxDesi),
      minWeightKg: decToNumber(rule.minWeightKg),
      maxWeightKg: decToNumber(rule.maxWeightKg),
      cityCode: rule.cityCode,
      districtCode: rule.districtCode,
      regionCode: rule.regionCode,
      amountMinor: rule.amountMinor,
      extraAmountMinor: rule.extraAmountMinor,
      sortOrder: rule.sortOrder,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    })),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

/**
 * Magazanin AKTIF DEFAULT kargo tarife planini cozer. Once default+ACTIVE; yoksa
 * en eski ACTIVE plan (UI'da default isaretlenmemis ama tek aktif plan varsa
 * kullanilir). Hicbiri yoksa null.
 */
export async function resolveActiveRatePlan(
  prisma: PrismaClient,
  storeId: string,
): Promise<RatePlanWithRules | null> {
  const planDefault = await prisma.shippingRatePlan.findFirst({
    where: { storeId, status: "ACTIVE", isDefault: true },
    include: ratePlanInclude,
  });
  if (planDefault) return planDefault;
  return prisma.shippingRatePlan.findFirst({
    where: { storeId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: ratePlanInclude,
  });
}

/** Quote outcome'unu cart/checkout response contract'ina serialize eder. */
export function outcomeToQuoteResponse(
  outcome: ShippingQuoteOutcome,
  plan: EngineRatePlan | null,
  now: Date,
): CartShippingQuoteResponse {
  return {
    provider: plan?.provider ?? null,
    source: outcome.source,
    status: outcome.status,
    amountMinor: outcome.amountMinor,
    currency: outcome.status === "OK" ? outcome.currency : (plan?.currency ?? null),
    ratePlanId: outcome.ratePlanId,
    ratePlanName: outcome.ratePlanName,
    freeShipping: outcome.freeShipping,
    errorCode: outcome.status === "OK" ? null : outcome.reason,
    message: null,
    calculatedAt: outcome.status === "OK" ? now.toISOString() : null,
  };
}

export interface QuoteComputation {
  outcome: ShippingQuoteOutcome;
  plan: EngineRatePlan | null;
  response: CartShippingQuoteResponse;
}

/**
 * Tek noktadan quote hesabi (framework-bagimsiz). Aktif plan cagiran katmanda
 * (dataAccess) cozulur ve buraya engine-sekli olarak verilir; boylece hem prisma
 * hem de in-memory test dataAccess ayni yolu kullanir. addressKnown=false ise
 * (guest/no-address) ve ortada plan varsa ADDRESS_REQUIRED zorlanir.
 */
export function computeStoreShippingQuote(
  plan: EngineRatePlan | null,
  cart: EngineCart,
  address: EngineAddress | null,
  options: { addressKnown: boolean; now?: Date },
): QuoteComputation {
  const now = options.now ?? new Date();

  if (!options.addressKnown && plan) {
    const outcome: ShippingQuoteOutcome = {
      status: "ADDRESS_REQUIRED",
      source: null,
      amountMinor: null,
      currency: plan.currency,
      ratePlanId: plan.id,
      ratePlanName: plan.name,
      freeShipping: false,
      appliedRuleId: null,
      reason: "ADDRESS_NOT_SELECTED",
    };
    return { outcome, plan, response: outcomeToQuoteResponse(outcome, plan, now) };
  }

  const outcome = calculateShippingQuote({ plan, cart, address, now });
  return { outcome, plan, response: outcomeToQuoteResponse(outcome, plan, now) };
}
