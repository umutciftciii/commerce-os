/**
 * TODO-151 (ADR-074) — Commercial Engine · STALE-PREVIEW FINGERPRINT (SAF, deterministik).
 *
 * Preview, hedef varyantların GÜNCEL ticari durumundan (id + price + compareAt + cost + vatRateBps,
 * KANONİK sırada) deterministik bir FNV-1a hash üretir. Apply request'i bu fingerprint'i taşır;
 * sunucu advisory-lock altında değerleri yeniden okuyup fingerprint'i yeniden hesaplar. Fark varsa
 * → stale (hiçbir yazım yapılmaz). İstemcinin hesapladığı hedef değerlere güvenilmez.
 *
 * Crypto/Date/Math.random KULLANILMAZ (saf integer aritmetiği; resume-güvenli, deterministik).
 */

import type { CommercialState } from "./types.js";

export interface FingerprintRow {
  variantId: string;
  state: CommercialState;
}

// FNV-1a 32-bit (deterministik, hızlı, çakışma-tolere: yalnız değişim tespiti için).
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime çarpımı (Math.imul ile taşma-güvenli).
    hash = Math.imul(hash, 0x01000193);
  }
  // İşaretsiz 32-bit hex.
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function serializeState(s: CommercialState): string {
  return `${s.priceMinor}|${s.compareAtMinor ?? "∅"}|${s.costMinor ?? "∅"}|${s.vatRateBps}`;
}

/**
 * Kanonik commercial fingerprint. Girdi sırasından BAĞIMSIZ (variantId'ye göre sıralanır) →
 * preview satır sırası değişse bile fingerprint stabil kalır (yalnız DEĞER değişimi fingerprint'i
 * değiştirir).
 */
export function commercialFingerprint(rows: FingerprintRow[]): string {
  const canonical = [...rows]
    .sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0))
    .map((r) => `${r.variantId}=${serializeState(r.state)}`)
    .join(";");
  return `cf1:${fnv1a(canonical)}:${rows.length}`;
}
