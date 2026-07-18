/**
 * TODO-151 (ADR-074) — Commercial Engine · TİPLER (SAF).
 *
 * Varyantların ticari alanlarını (price/compare-at/cost/VAT) preview-first + toplu yöneten motorun
 * ortak sözleşmesi. Bu dosya Prisma/DB/HTTP/Date/Math.random BİLMEZ; yalnız tip/enum/sabit tanımlar.
 *
 * Para modeli: tüm tutarlar integer minor unit (kuruş). "Price" = KDV DAHİL brüt satış fiyatı
 * (priceMinor); net/KDV apply'da bundan türetilir (F4C üçlüsü korunur). Margin/markup brüt üzerinden
 * hesaplanır (mevcut variants-manager semantiği ile birebir).
 */

/** Yönetilen ticari alanlar (rule hedefi + direct-edit alanı + audit alanı). */
export type CommercialField = "PRICE" | "COMPARE_AT_PRICE" | "COST" | "VAT_RATE";

export const COMMERCIAL_FIELDS: readonly CommercialField[] = [
  "PRICE",
  "COMPARE_AT_PRICE",
  "COST",
  "VAT_RATE",
] as const;

/** Para-değeri taşıyan alanlar (VAT_RATE hariç — o bps'tir, para değil). */
export const MONEY_FIELDS: readonly CommercialField[] = [
  "PRICE",
  "COMPARE_AT_PRICE",
  "COST",
] as const;

/** Bir varyantın ticari durumu (SAF; currency-agnostik minor unit). */
export interface CommercialState {
  /** KDV DAHİL brüt satış fiyatı (otoritatif; NOT NULL). */
  priceMinor: number;
  /** Liste/showroom fiyatı (nullable). */
  compareAtMinor: number | null;
  /** Maliyet (nullable; public'e sızmaz). */
  costMinor: number | null;
  /** KDV oranı basis-point (2000=%20). */
  vatRateBps: number;
}

/** Yalnız-okunur hesaplanan ticari göstergeler (persist edilmez). */
export interface CommercialCalc {
  /** Brüt kâr = price − cost (cost yoksa null). */
  grossProfitMinor: number | null;
  /** Margin% = (price − cost)/price × 100 (price≤0 veya cost yok → null). */
  marginPct: number | null;
  /** Markup% = (price − cost)/cost × 100 (cost≤0 veya cost yok → null). */
  markupPct: number | null;
  /** Discount% = (compareAt − price)/compareAt × 100 (compareAt≤0 veya yok → null). */
  discountPct: number | null;
}

/** Bulk rule operasyonları (structured contract — serbest metin/eval YOK). */
export type CommercialOperation =
  | "SET_FIXED"
  | "INCREASE_PERCENT"
  | "DECREASE_PERCENT"
  | "INCREASE_FIXED"
  | "DECREASE_FIXED"
  | "SET_FROM_COST_MARKUP"
  | "SET_COMPARE_AT_FROM_PRICE"
  | "ROUND"
  | "SET_PRICE_ENDING";

export type RoundingMode = "NONE" | "NEAREST" | "UP" | "DOWN";

/** Yuvarlama adımı (minor unit): 1 / 10 / 100 / 1000. */
export type RoundingStep = 1 | 10 | 100 | 1000;

/** Fiyat sonu kuralı → (modulo, ending) minor. Örn END_9990 = "…99,90". */
export type PriceEndingRule = "END_90" | "END_99" | "END_990" | "END_9990";

export interface PriceEndingSpec {
  modulo: number;
  ending: number;
}

/** Fiyat sonu kuralı → modulo/ending çözümü (SAF sabit tablo). */
export const PRICE_ENDING_SPECS: Record<PriceEndingRule, PriceEndingSpec> = {
  END_90: { modulo: 100, ending: 90 }, // .90
  END_99: { modulo: 100, ending: 99 }, // .99
  END_990: { modulo: 1000, ending: 990 }, // 9.90
  END_9990: { modulo: 10000, ending: 9990 }, // 99.90
};

/** Değer-üreten operasyonlara opsiyonel son-yuvarlama. */
export interface RoundingSpec {
  mode: RoundingMode;
  step?: RoundingStep;
}

/**
 * Yapısal bulk rule (tek alan, tek operasyon + opsiyonel son-yuvarlama). Serbest formül/eval YOK.
 * - `valueMinor`: SET_FIXED (para alanı) / INCREASE_FIXED / DECREASE_FIXED için minor tutar.
 * - `valueBps`: SET_FIXED (VAT_RATE) için oran bps.
 * - `percentBps`: INCREASE/DECREASE_PERCENT, SET_FROM_COST_MARKUP, SET_COMPARE_AT_FROM_PRICE için
 *   yüzde-bps (10% = 1000; float yok — integer bps aritmetiği).
 * - `rounding`: ROUND için mode+step; değer-üreten opsyonlara ekli son-yuvarlama.
 * - `priceEnding`: SET_PRICE_ENDING için kural.
 */
export interface CommercialRule {
  targetField: CommercialField;
  operation: CommercialOperation;
  valueMinor?: number;
  valueBps?: number;
  percentBps?: number;
  rounding?: RoundingSpec;
  priceEnding?: PriceEndingRule;
}

/** Direct-edit: bir varyanta hedef alan değerleri (verilmeyen alan = dokunma). */
export interface CommercialDirectEdit {
  variantId: string;
  priceMinor?: number;
  compareAtMinor?: number | null;
  costMinor?: number | null;
  vatRateBps?: number;
}

export type VariantStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

/** Motorun her varyant için gördüğü salt-okuma girdi (servis sıralar/okur). */
export interface CommercialVariantInput {
  variantId: string;
  sku: string;
  title: string;
  status: VariantStatus;
  currency: string;
  /** attribute code → görünür etiket (UI satırı için; motor mantığında kullanılmaz). */
  attributes: { code: string; label: string }[];
  current: CommercialState;
}

/** Stable tanı kodları — blocking apply'ı toptan reddeder; warning etmez. */
export type CommercialIssueCode =
  // Blocking
  | "NEGATIVE_PRICE"
  | "NEGATIVE_COMPARE_AT"
  | "NEGATIVE_COST"
  | "INVALID_VAT"
  | "OVERFLOW"
  | "CURRENCY_MISMATCH"
  | "RULE_SOURCE_MISSING" // ör. markup için cost yok
  // Warning
  | "NEGATIVE_MARGIN"
  | "ZERO_MARGIN"
  | "HIGH_MARGIN"
  | "COST_EXCEEDS_LIST"
  | "COMPARE_AT_BELOW_PRICE"
  | "MISSING_COST"
  | "MISSING_COMPARE_AT"
  | "LARGE_PRICE_INCREASE"
  | "LARGE_PRICE_DECREASE"
  | "ARCHIVED_VARIANT"
  | "DRAFT_VARIANT";

/** Blocking kod kümesi (apply'ı reddeder). Kalanlar warning (apply'ı engellemez). */
export const BLOCKING_ISSUE_CODES: ReadonlySet<CommercialIssueCode> = new Set([
  "NEGATIVE_PRICE",
  "NEGATIVE_COMPARE_AT",
  "NEGATIVE_COST",
  "INVALID_VAT",
  "OVERFLOW",
  "CURRENCY_MISMATCH",
  "RULE_SOURCE_MISSING",
]);

/** Motor sınırları (currency minor yapısı + overflow tavanı). Int32 (Postgres integer) altı. */
export interface CommercialLimits {
  /** Para tavanı (minor). Postgres `Int` 2^31−1 altında güvenli tavan. */
  maxMoneyMinor: number;
  /** "Yüksek marj" uyarı eşiği (yüzde). */
  highMarginPct: number;
  /** "Ciddi fiyat değişimi" uyarı eşiği (yüzde, mutlak). */
  largePriceChangePct: number;
}

export const DEFAULT_COMMERCIAL_LIMITS: CommercialLimits = {
  maxMoneyMinor: 1_000_000_000, // 10.000.000,00 (Int32 tavanının ~%47'si — güvenli)
  highMarginPct: 90,
  largePriceChangePct: 50,
};
