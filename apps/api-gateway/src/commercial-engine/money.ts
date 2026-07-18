/**
 * TODO-151 (ADR-074) — Commercial Engine · PARA ARİTMETİĞİ (SAF, integer minor unit).
 *
 * Tüm hesaplar integer minor unit (kuruş) üzerinden; FLOAT PARA MATEMATİĞİ YASAK. Yüzde işlemleri
 * bps (basis-point) integer ile yapılır ve TEK deterministik `Math.round` (pozitifte half-up) ile
 * kapanır → `0.1 + 0.2` tipi kayan-nokta hatası oluşmaz. Prisma/DB/Date/Math.random BİLMEZ.
 */

import {
  DEFAULT_COMMERCIAL_LIMITS,
  type PriceEndingSpec,
  type RoundingMode,
  type RoundingStep,
} from "./types.js";

/** Değerin geçerli (sonlu, integer) minor unit olduğunu doğrular. */
export function isSafeMinor(value: number): boolean {
  return Number.isInteger(value);
}

/** value ∈ [0, maxMoneyMinor] mi? (negatif ve overflow guard tek noktada). */
export function isWithinMoneyBounds(
  value: number,
  maxMoneyMinor: number = DEFAULT_COMMERCIAL_LIMITS.maxMoneyMinor,
): boolean {
  return Number.isInteger(value) && value >= 0 && value <= maxMoneyMinor;
}

/**
 * Yüzde uygula: `base × (10000 ± percentBps) / 10000`, tek round. direction:+1 artış, −1 azalış.
 * percentBps 1000 = %10. Integer aritmetiği; sonuç round'lu integer minor.
 */
export function applyPercent(baseMinor: number, percentBps: number, direction: 1 | -1): number {
  const factor = 10000 + direction * percentBps;
  return Math.round((baseMinor * factor) / 10000);
}

/** Sabit tutar uygula: base ± valueMinor (integer). */
export function applyFixed(baseMinor: number, valueMinor: number, direction: 1 | -1): number {
  return baseMinor + direction * valueMinor;
}

/**
 * Maliyetten markup ile fiyat: `cost × (10000 + markupBps) / 10000`, tek round.
 * markupBps 2500 = %25 markup.
 */
export function priceFromCostMarkup(costMinor: number, markupBps: number): number {
  return Math.round((costMinor * (10000 + markupBps)) / 10000);
}

/**
 * Fiyattan compare-at: `price × (10000 + marginBps) / 10000`, tek round.
 * marginBps 1500 = price + %15.
 */
export function compareAtFromPrice(priceMinor: number, marginBps: number): number {
  return Math.round((priceMinor * (10000 + marginBps)) / 10000);
}

/**
 * Adım-tabanlı yuvarlama. NONE → değişmez. NEAREST/UP/DOWN, step (1/10/100/1000) minor'a göre.
 * Negatif üretmez (girdi negatifse üst katmanda validation yakalar; burada matematik saftır).
 */
export function roundToStep(value: number, mode: RoundingMode, step: RoundingStep = 1): number {
  // NONE → dokunma; step==1 → zaten integer minor (round-modu no-op).
  if (mode === "NONE" || step <= 1) return value;
  const q = value / step;
  let rounded: number;
  if (mode === "UP") rounded = Math.ceil(q);
  else if (mode === "DOWN") rounded = Math.floor(q);
  else rounded = Math.round(q); // NEAREST (+ NONE guard yukarıda döndü)
  return rounded * step;
}

/**
 * Fiyat sonu kuralı: değeri, modulo bloğu içinde `ending` ile biten EN YAKIN değere çeker.
 * Örn spec {modulo:100, ending:99}: 12345 → 12399? Hayır; en yakın: alt=12299? üst=12399 …
 * Doğru: taban = floor((value − ending)/modulo)×modulo + ending; üst = taban + modulo; en yakını.
 * Negatif taban güvenli (max 0). Sonuç negatif olmaz.
 */
export function applyPriceEnding(value: number, spec: PriceEndingSpec): number {
  const { modulo, ending } = spec;
  const lower = Math.floor((value - ending) / modulo) * modulo + ending;
  const upper = lower + modulo;
  const nearest = value - lower <= upper - value ? lower : upper;
  return nearest < 0 ? Math.max(ending, 0) : nearest;
}

/** İki tutar oranı (yüzde, float — YALNIZ gösterim/uyarı eşiği için; para değil). */
export function pctChange(fromMinor: number, toMinor: number): number | null {
  if (fromMinor <= 0) return null;
  return ((toMinor - fromMinor) / fromMinor) * 100;
}
