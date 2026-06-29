/**
 * F3C.2 — Shipping price engine (store tarife) — REVIZYON (Generic Tariff Engine).
 *
 * TEMEL KARAR (ADR-044): Kargo ucreti SAGLAYICI quote'u DEGILDIR. Magaza/admin
 * tarafindan girilen kargo tarife planina (ShippingRatePlan + tier/zone/rule/surcharge)
 * gore hesaplanir. DHL eCommerce yalniz OPERASYON sağlayıcısıdır; bu motor hicbir
 * provider'a canli istek atmaz — saf, deterministik bir fonksiyondur.
 *
 * Generic model: her provider icin ayri motor YOKTUR. DHL (aylik hacim segmenti =
 * tier, desi araliklari), Aras (mesafe zonu, kg/desi araliklari, 31+ ek birim),
 * Yurtici (desi/ucrete-esas agirlik + ek hizmet) ayni generic kurallara maplenir.
 *
 * Saf tutulur (prisma/fastify import ETMEZ) ki birim testleri tek basina kosar.
 * AUTHORITATIVE: tum hesap burada (backend) yapilir; frontend yalniz sonucu gosterir.
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

export type ShippingChargeTypeValue =
  | "FLAT"
  | "PER_KG"
  | "PER_DESI"
  | "PER_KG_OR_DESI"
  | "PER_ADDITIONAL_KG_OR_DESI";

/** Aylik gonderi hacmi segmenti (DHL Tarife I/II/III). */
export interface EngineRateTier {
  id: string;
  name: string;
  monthlyShipmentMin: number | null;
  monthlyShipmentMax: number | null;
  sortOrder: number;
}

/** Mesafe/bolge zonu (Aras sehir-ici/yakin/kisa/orta/uzak/KKTC/MOBILE). */
export interface EngineRateZone {
  id: string;
  code: string;
  name: string;
  minDistanceKm: number | null;
  maxDistanceKm: number | null;
  sortOrder: number;
}

/** Ek hizmet bedeli (SMS, güvence, mobil alan, hamaliye, agir gonderi...). */
export interface EngineSurcharge {
  id: string;
  code: string;
  name: string;
  chargeType: ShippingChargeTypeValue;
  amountMinor: number | null;
  unitAmountMinor: number | null;
  /** Saf JSON kosul (yalniz engine okur): { minBillable?, maxBillable?, minSubtotalMinor?, maxSubtotalMinor?, zoneCode? }. */
  conditionJsonSafe: unknown;
  isOptional: boolean;
  sortOrder: number;
}

export interface EngineRateRule {
  id: string;
  tierId: string | null;
  zoneId: string | null;
  minDesi: number | null;
  maxDesi: number | null;
  minWeightKg: number | null;
  maxWeightKg: number | null;
  cityCode: string | null;
  districtCode: string | null;
  regionCode: string | null;
  chargeType: ShippingChargeTypeValue;
  amountMinor: number | null;
  unitAmountMinor: number | null;
  baseAmountMinor: number | null;
  baseThreshold: number | null;
  /** Legacy/simple-extra: gelismis hesabin merkezi DEGIL; ek ucretler surcharge ile. */
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
  tiers: EngineRateTier[];
  zones: EngineRateZone[];
  surcharges: EngineSurcharge[];
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
  /** Adresten cozulmus zon kodu (upstream maplenir; yoksa null). */
  zoneCode: string | null;
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
  appliedTierId: string | null;
  appliedZoneId: string | null;
  /** Eklenen ek hizmet kodlari (transparanlik/log icin). */
  surchargeCodes: string[];
  /** Makine-okunur sebep kodu (log/test icin; kullaniciya gosterilen i18n DEGIL). */
  reason: string | null;
}

export interface CalculateShippingInput {
  plan: EngineRatePlan | null;
  cart: EngineCart;
  address: EngineAddress | null;
  now?: Date;
  /** Magazanin aylik gonderi adedi (DHL tier secimi). Bilinmiyorsa null -> default tier. */
  monthlyShipmentCount?: number | null;
  /** Musterinin sectigi opsiyonel ek hizmet kodlari (SMS vb.). */
  selectedSurchargeCodes?: string[];
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
 * Sepetin ucrete-esas agirligi: billableWeight = max(kg, desi) (ADR-044 / Karar 5).
 * Volumetrik desi su an Product/Variant.shippingDesi'den (precomputed) gelir; gercek
 * en/boy/yukseklik alanlari ileride (TODO). Kullanilmayan eksen 0 oldugundan
 * desi-only / kg-only planlarda dogru calisir.
 */
export function billableWeight(cart: EngineCart): number {
  return Math.max(cart.totalWeightKg, cart.totalDesi);
}

/**
 * Aylik gonderi adedine gore tier secer (DHL Tarife I/II/III). Bilinmiyorsa veya
 * eslesme yoksa en kucuk sortOrder'li tier (default) secilir (ADR-044). Tier yoksa null.
 */
export function selectTier(tiers: EngineRateTier[], monthlyShipmentCount: number | null): EngineRateTier | null {
  if (tiers.length === 0) return null;
  const byOrder = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder);
  if (monthlyShipmentCount !== null && monthlyShipmentCount !== undefined) {
    const match = byOrder.find(
      (t) =>
        (t.monthlyShipmentMin === null || monthlyShipmentCount >= t.monthlyShipmentMin) &&
        (t.monthlyShipmentMax === null || monthlyShipmentCount <= t.monthlyShipmentMax),
    );
    if (match) return match;
  }
  return byOrder[0] ?? null;
}

/** Rule'un ucretini chargeType'a gore hesaplar (FLAT mevcut amountMinor yolunu korur). */
export function computeRuleAmount(rule: EngineRateRule, cart: EngineCart): number {
  const billable = billableWeight(cart);
  let amount: number;
  switch (rule.chargeType) {
    case "PER_KG":
      amount = Math.round((rule.unitAmountMinor ?? 0) * cart.totalWeightKg);
      break;
    case "PER_DESI":
      amount = Math.round((rule.unitAmountMinor ?? 0) * cart.totalDesi);
      break;
    case "PER_KG_OR_DESI":
      amount = Math.round((rule.unitAmountMinor ?? 0) * billable);
      break;
    case "PER_ADDITIONAL_KG_OR_DESI": {
      // 30+/31+ satiri: base + esik ustu birim ucret. maxDesi/maxWeightKg null ise
      // "ve uzeri" anlamina gelir (bracket secimi pickRule'da bu null'lari acik ucla yorumlar).
      const over = Math.max(0, billable - (rule.baseThreshold ?? 0));
      amount = (rule.baseAmountMinor ?? 0) + Math.round(over * (rule.unitAmountMinor ?? 0));
      break;
    }
    case "FLAT":
    default:
      amount = rule.amountMinor ?? 0;
      break;
  }
  // Legacy/simple-extra: gelismis hesabin merkezi DEGIL ama geriye uyumluluk icin eklenir.
  return amount + (rule.extraAmountMinor ?? 0);
}

/** Plan/rule duzeyinde hangi olcum eksenleri kullaniliyor (MISSING_DIMENSIONS karari icin). */
function axesInUse(rules: EngineRateRule[]): { usesDesi: boolean; usesWeight: boolean } {
  let usesDesi = false;
  let usesWeight = false;
  for (const r of rules) {
    if (r.minDesi !== null || r.maxDesi !== null) usesDesi = true;
    if (r.minWeightKg !== null || r.maxWeightKg !== null) usesWeight = true;
    if (r.chargeType === "PER_DESI" || r.chargeType === "PER_KG_OR_DESI" || r.chargeType === "PER_ADDITIONAL_KG_OR_DESI") usesDesi = true;
    if (r.chargeType === "PER_KG" || r.chargeType === "PER_KG_OR_DESI" || r.chargeType === "PER_ADDITIONAL_KG_OR_DESI") usesWeight = true;
  }
  return { usesDesi, usesWeight };
}

/**
 * billableWeight + adres/zone/tier'a gore en UYGUN ve en SPESIFIK kurali secer.
 * Aralik eslesmesi tek skaler billableWeight uzerinden yapilir (Karar 5): rule'un
 * desi VE kg araliklari (tanimliysa) billable'i kapsamali. Eslesmeyen geo/zone alani
 * kurali tamamen eler. Spesiflik: districtCode(8) > cityCode(4) > zoneId(2) >
 * regionCode(1) > generic(0). Esitlikte sortOrder kucuk olan oncelikli.
 */
function pickRule(
  rules: EngineRateRule[],
  cart: EngineCart,
  address: EngineAddress | null,
  zoneCodeById: Map<string, string>,
): EngineRateRule | null {
  const billable = billableWeight(cart);
  let best: EngineRateRule | null = null;
  let bestScore = -1;
  for (const rule of rules) {
    if (rule.minDesi !== null && billable < rule.minDesi) continue;
    if (rule.maxDesi !== null && billable > rule.maxDesi) continue;
    if (rule.minWeightKg !== null && billable < rule.minWeightKg) continue;
    if (rule.maxWeightKg !== null && billable > rule.maxWeightKg) continue;

    let score = 0;
    if (rule.districtCode !== null) {
      if (!address || address.districtCode !== rule.districtCode) continue;
      score += 8;
    }
    if (rule.cityCode !== null) {
      if (!address || address.cityCode !== rule.cityCode) continue;
      score += 4;
    }
    if (rule.zoneId !== null) {
      const zoneCode = zoneCodeById.get(rule.zoneId) ?? null;
      if (!address || zoneCode === null || address.zoneCode !== zoneCode) continue;
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

/** Opsiyonel/kosullu ek hizmet bedellerini degerlendirip toplam ekler. */
function applySurcharges(
  surcharges: EngineSurcharge[],
  cart: EngineCart,
  address: EngineAddress | null,
  selectedCodes: string[],
): { total: number; codes: string[] } {
  const billable = billableWeight(cart);
  const selected = new Set(selectedCodes);
  let total = 0;
  const codes: string[] = [];
  for (const s of [...surcharges].sort((a, b) => a.sortOrder - b.sortOrder)) {
    // Opsiyonel ek hizmetler yalniz musteri sectiyse; zorunlular her zaman aday.
    if (s.isOptional && !selected.has(s.code)) continue;
    if (!conditionMet(s.conditionJsonSafe, { billable, subtotalMinor: cart.subtotalMinor, zoneCode: address?.zoneCode ?? null })) {
      continue;
    }
    total += surchargeAmount(s, cart);
    codes.push(s.code);
  }
  return { total, codes };
}

function surchargeAmount(s: EngineSurcharge, cart: EngineCart): number {
  const billable = billableWeight(cart);
  switch (s.chargeType) {
    case "PER_KG":
      return Math.round((s.unitAmountMinor ?? 0) * cart.totalWeightKg);
    case "PER_DESI":
      return Math.round((s.unitAmountMinor ?? 0) * cart.totalDesi);
    case "PER_KG_OR_DESI":
    case "PER_ADDITIONAL_KG_OR_DESI":
      return Math.round((s.unitAmountMinor ?? 0) * billable);
    case "FLAT":
    default:
      return s.amountMinor ?? 0;
  }
}

/** Saf JSON kosul degerlendirme (yalniz bilinen sayisal/zone anahtarlari; bilinmeyen anahtarlar pas). */
function conditionMet(
  condition: unknown,
  ctx: { billable: number; subtotalMinor: number; zoneCode: string | null },
): boolean {
  if (condition === null || condition === undefined) return true;
  if (typeof condition !== "object") return true;
  const c = condition as Record<string, unknown>;
  if (typeof c.minBillable === "number" && ctx.billable < c.minBillable) return false;
  if (typeof c.maxBillable === "number" && ctx.billable > c.maxBillable) return false;
  if (typeof c.minSubtotalMinor === "number" && ctx.subtotalMinor < c.minSubtotalMinor) return false;
  if (typeof c.maxSubtotalMinor === "number" && ctx.subtotalMinor > c.maxSubtotalMinor) return false;
  if (typeof c.zoneCode === "string" && ctx.zoneCode !== c.zoneCode) return false;
  return true;
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
    appliedTierId: null,
    appliedZoneId: null,
    surchargeCodes: [],
    reason: null,
  };
}

/** Plan provider'i MOCK ise quote source'u MOCK; aksi halde STORE_SHIPPING_TARIFF. */
function planSource(plan: EngineRatePlan): ShippingRateSourceValue {
  return plan.provider === "MOCK" ? "MOCK" : "STORE_SHIPPING_TARIFF";
}

/**
 * Ana hesaplama. Secim sirasi (ADR-044): aktif/default plan -> tarih penceresi ->
 * free threshold -> mod -> tier (aylik hacim) -> zone/geo + kg/desi bracket ->
 * chargeType hesap -> surcharge. Adres gerekliligi cagiran katmanda da ele alinir;
 * bu motor adres gercekten gerektiginde (region tablosu) ADDRESS_REQUIRED doner.
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
      return { ...out, status: "OK", source: planSource(plan), amountMinor: plan.fixedAmountMinor };
    }
    case "FREE_THRESHOLD": {
      // Esik altinda: taban ucret fixedAmountMinor (yoksa 0).
      return { ...out, status: "OK", source: planSource(plan), amountMinor: plan.fixedAmountMinor ?? 0 };
    }
    case "DESI_TABLE":
    case "WEIGHT_TABLE":
    case "DESI_AND_REGION_TABLE": {
      if (modeRequiresAddress(plan.pricingMode) && !address) {
        return { ...out, status: "ADDRESS_REQUIRED", reason: "ADDRESS_MISSING" };
      }

      // Tier secimi (DHL Tarife I/II/III) — sonra kurallar tier'a gore daraltilir.
      const tier = selectTier(plan.tiers, input.monthlyShipmentCount ?? null);
      const candidateRules =
        tier === null
          ? plan.rules
          : plan.rules.filter((r) => r.tierId === null || r.tierId === tier.id);

      // MISSING_DIMENSIONS: yalniz fiilen kullanilan eksen eksikse.
      const { usesDesi, usesWeight } = axesInUse(candidateRules);
      if ((usesDesi && cart.missingDesi) || (usesWeight && cart.missingWeight)) {
        return { ...out, status: "MISSING_DIMENSIONS", reason: "MISSING_SHIPPING_DIMENSIONS" };
      }

      const zoneCodeById = new Map(plan.zones.map((z) => [z.id, z.code] as const));
      const rule = pickRule(candidateRules, cart, address, zoneCodeById);
      if (!rule) {
        return { ...out, status: "RATE_NOT_FOUND", reason: "NO_MATCHING_RULE" };
      }

      const ruleAmount = computeRuleAmount(rule, cart);
      const surcharge = applySurcharges(plan.surcharges, cart, address, input.selectedSurchargeCodes ?? []);
      return {
        ...out,
        status: "OK",
        source: planSource(plan),
        amountMinor: ruleAmount + surcharge.total,
        appliedRuleId: rule.id,
        appliedTierId: tier?.id ?? null,
        appliedZoneId: rule.zoneId,
        surchargeCodes: surcharge.codes,
      };
    }
    default: {
      return { ...out, status: "ERROR", reason: "UNKNOWN_MODE" };
    }
  }
}
