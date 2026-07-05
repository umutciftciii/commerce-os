/**
 * F4C (ADR-063) — KDV para matematiği. TEK KAYNAK: sunucu (gateway) nihai
 * hesabı BURADAN yapar; admin UI aynı fonksiyonları YALNIZCA önizleme için
 * kullanır (istemci hesabına asla güvenilmez). Tüm tutarlar minor unit (kuruş)
 * TAM SAYIDIR; floating-point para matematiği YASAKTIR — çarpma/bölme sonrası
 * tek deterministik yuvarlama (Math.round, pozitifte half-up) uygulanır.
 *
 * Oran birimi bps (basis points): 2000 = %20, 1000 = %10, 100 = %1, 0 = %0.
 */

/** Geçerli KDV oranı aralığı (bps). Kontrat da aynı sınırı doğrular. */
export const VAT_RATE_BPS_MIN = 0;
export const VAT_RATE_BPS_MAX = 10000;

/** Türkiye MVP ön-tanımlı oranları (admin UI select seçenekleri). */
export const VAT_RATE_BPS_PRESETS = [0, 100, 1000, 2000] as const;

/** Varsayılan oran: %20 (mevcut sepet CART_TAX_RATE_PERCENT=20 ile tutarlı). */
export const DEFAULT_VAT_RATE_BPS = 2000;

export interface VatBreakdownMinor {
  /** KDV hariç net tutar (minor). */
  netMinor: number;
  /** KDV tutarı (minor). */
  vatMinor: number;
  /** KDV dahil brüt tutar (minor). */
  grossMinor: number;
}

function assertNonNegativeInt(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer (minor units).`);
  }
}

export function isValidVatRateBps(rateBps: number): boolean {
  return Number.isInteger(rateBps) && rateBps >= VAT_RATE_BPS_MIN && rateBps <= VAT_RATE_BPS_MAX;
}

function assertVatRate(rateBps: number): void {
  if (!isValidVatRateBps(rateBps)) {
    throw new RangeError(`vatRateBps must be an integer within [${VAT_RATE_BPS_MIN}, ${VAT_RATE_BPS_MAX}].`);
  }
}

/**
 * Net (KDV hariç) tutardan KDV + brüt hesaplar:
 * vat = round(net * rateBps / 10000); gross = net + vat.
 */
export function vatFromNet(netMinor: number, rateBps: number): VatBreakdownMinor {
  assertNonNegativeInt(netMinor, "netMinor");
  assertVatRate(rateBps);
  const vatMinor = Math.round((netMinor * rateBps) / 10000);
  return { netMinor, vatMinor, grossMinor: netMinor + vatMinor };
}

/**
 * Brüt (KDV dahil) tutardan net + KDV ayrıştırır (migration/backfill ve
 * legacy-gross girişleri için): net = round(gross * 10000 / (10000 + rateBps));
 * vat = gross - net. Brüt DEĞİŞMEZ (gross === net + vat garantisi).
 */
export function splitGrossByVat(grossMinor: number, rateBps: number): VatBreakdownMinor {
  assertNonNegativeInt(grossMinor, "grossMinor");
  assertVatRate(rateBps);
  const netMinor = Math.round((grossMinor * 10000) / (10000 + rateBps));
  return { netMinor, vatMinor: grossMinor - netMinor, grossMinor };
}
