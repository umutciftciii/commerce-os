/**
 * TODO-151 (ADR-074) — Commercial Engine · HESAP MAKİNESİ (SAF).
 *
 * Margin / markup / discount / gross-profit türetir. Hepsi brüt `priceMinor` (KDV dahil satış) vs
 * `costMinor`/`compareAtMinor` üzerinden — mevcut variants-manager semantiği ile birebir. Sıfıra
 * bölme GÜVENLİ (null döner; yanıltıcı yüzde ÜRETİLMEZ). Prisma/DB/Date/Math.random BİLMEZ.
 */

import type { CommercialCalc, CommercialState } from "./types.js";

/** Brüt kâr (minor) = price − cost. cost yoksa null. */
export function grossProfit(state: CommercialState): number | null {
  if (state.costMinor == null) return null;
  return state.priceMinor - state.costMinor;
}

/** Margin% = (price − cost)/price × 100. price≤0 veya cost yok → null (division-by-zero güvenli). */
export function marginPct(state: CommercialState): number | null {
  if (state.costMinor == null || state.priceMinor <= 0) return null;
  return ((state.priceMinor - state.costMinor) / state.priceMinor) * 100;
}

/** Markup% = (price − cost)/cost × 100. cost≤0 veya cost yok → null (division-by-zero güvenli). */
export function markupPct(state: CommercialState): number | null {
  if (state.costMinor == null || state.costMinor <= 0) return null;
  return ((state.priceMinor - state.costMinor) / state.costMinor) * 100;
}

/** Discount% = (compareAt − price)/compareAt × 100. compareAt≤0 veya yok → null. */
export function discountPct(state: CommercialState): number | null {
  if (state.compareAtMinor == null || state.compareAtMinor <= 0) return null;
  return ((state.compareAtMinor - state.priceMinor) / state.compareAtMinor) * 100;
}

/** Tüm hesaplanan göstergeleri tek çağrıda döndür (UI satırı + summary için). */
export function computeCalc(state: CommercialState): CommercialCalc {
  return {
    grossProfitMinor: grossProfit(state),
    marginPct: marginPct(state),
    markupPct: markupPct(state),
    discountPct: discountPct(state),
  };
}
