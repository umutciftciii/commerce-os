import { cardLast4, detectCardBrand, digitsOnly, luhnValid } from "@commerce-os/contracts";
import type { PaymentScenario } from "./types.js";

/**
 * F3B.2 — Test kart yardimcilari (MOCK provider). Gercekci kart formu girdisinden
 * deterministik bir test senaryosu turetir. FULL PAN/CVC ASLA saklanmaz/loglanmaz;
 * yalniz marka + son 4 hane turetilir. Senaryo, bilinen test kartlarindan ya da
 * (eslesmiyorsa) Luhn gecerliligine gore belirlenir.
 */

/** Bilinen test kartlari → senaryo (yalniz son-eslesme; deger karsilastirmasi). */
const TEST_CARD_SCENARIOS: ReadonlyArray<{ pan: string; scenario: PaymentScenario }> = [
  { pan: "5528790000000008", scenario: "success" },
  { pan: "5890040000000016", scenario: "three_ds_required" },
  { pan: "4000000000000002", scenario: "failure" },
  { pan: "4111111111111111", scenario: "insufficient_funds" },
  { pan: "5555555555554444", scenario: "cancelled" },
];

/** Storefront test kart panelinde gosterilen kartlar (senaryo + maskeli numara). */
export const TEST_CARDS = TEST_CARD_SCENARIOS.map((entry) => ({
  scenario: entry.scenario,
  last4: cardLast4(entry.pan),
  brand: detectCardBrand(entry.pan),
}));

/** Kart numarasindan test senaryosu turetir (eslesme yoksa Luhn'a gore). */
export function scenarioFromCardNumber(pan: string): PaymentScenario {
  const digits = digitsOnly(pan);
  const match = TEST_CARD_SCENARIOS.find((entry) => entry.pan === digits);
  if (match) return match.scenario;
  return luhnValid(digits) ? "success" : "failure";
}

export interface CardValidationOk {
  ok: true;
  brand: string;
  last4: string;
}
export interface CardValidationError {
  ok: false;
  code: "CARD_NUMBER_INVALID" | "CARD_EXPIRED";
}

/**
 * Kart girdisini SUNUCU-OTORITER dogrular (Luhn + son kullanma). CVC formati zaten
 * sema duzeyinde dogrulanir; deger saklanmaz. Donen sonucta yalniz marka + son 4 olur.
 */
export function validateCard(card: {
  number: string;
  expMonth: number;
  expYear: number;
}): CardValidationOk | CardValidationError {
  const digits = digitsOnly(card.number);
  if (!luhnValid(digits)) {
    return { ok: false, code: "CARD_NUMBER_INVALID" };
  }
  // Son kullanma: ay sonuna kadar gecerli. Gecmis ay/yil reddedilir.
  const now = new Date();
  const expEnd = new Date(card.expYear, card.expMonth, 1); // bir sonraki ayin ilk gunu
  if (expEnd <= new Date(now.getFullYear(), now.getMonth(), 1)) {
    return { ok: false, code: "CARD_EXPIRED" };
  }
  return { ok: true, brand: detectCardBrand(digits), last4: cardLast4(digits) };
}

/**
 * Provider config + tutar'a gore izin verilen taksit secenekleri.
 * 1 = tek cekim her zaman gecerli. installmentEnabled false ise yalniz [1].
 */
const INSTALLMENT_TIERS = [1, 2, 3, 6, 9, 12] as const;
export function installmentOptionsFor(input: {
  installmentEnabled: boolean;
  method: string;
}): number[] {
  if (!input.installmentEnabled || input.method !== "CARD") return [1];
  return [...INSTALLMENT_TIERS];
}
