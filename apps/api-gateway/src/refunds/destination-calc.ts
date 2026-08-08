/**
 * TODO-175 (ADR-285) — Refund destination allocation (SAF; finansal invariant otoritesi).
 *
 * Refund tutarı R iki KALAN refundable havuza oransal bölünür: external-origin (Re) ve
 * credit-origin (Rc). external floor + residual credit'e. Cap: Re ≤ extPool, Rc ≤ creditPool;
 * taşan taraf diğerine kaydırılır. R ≤ extPool+creditPool (çağıran garanti eder).
 * Tüm değerler number minor (refund domain). STORE_CREDIT değeri ASLA external'a sayılmaz.
 * Düzeltme C: ara matematik BigInt; girdi/çıktı safe-integer guard'lı (overflow/precision yok).
 */

export interface RefundSourceSplitInput {
  externalRefundableRemaining: number;
  creditRestorableRemaining: number;
  refundAmountMinor: number;
}

export interface RefundSourceSplit {
  externalPortionMinor: number;
  creditPortionMinor: number;
}

function assertSafeMinor(n: number, label: string): void {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`destination-calc: ${label} must be a non-negative safe integer (got ${n})`);
  }
}

/**
 * Refund tutarını external-origin / credit-origin bileşenlerine oransal böl.
 * BigInt ara matematik; sonuç number (safe-integer). external floor, residual credit'e.
 */
export function computeRefundSourceSplit(input: RefundSourceSplitInput): RefundSourceSplit {
  assertSafeMinor(input.externalRefundableRemaining, "externalRefundableRemaining");
  assertSafeMinor(input.creditRestorableRemaining, "creditRestorableRemaining");
  assertSafeMinor(input.refundAmountMinor, "refundAmountMinor");

  const ext = BigInt(input.externalRefundableRemaining);
  const credit = BigInt(input.creditRestorableRemaining);
  const total = ext + credit;
  // R, toplam havuzu aşamaz (üst çağrı cap invariant'ı zaten uygular; defensive clamp).
  const R =
    input.refundAmountMinor > input.externalRefundableRemaining + input.creditRestorableRemaining
      ? total
      : BigInt(input.refundAmountMinor);
  if (R === 0n || total === 0n) return { externalPortionMinor: 0, creditPortionMinor: 0 };

  // Oransal: external floor (BigInt bölme zaten floor); residual credit'e.
  let externalPortion = (R * ext) / total;
  if (externalPortion > ext) externalPortion = ext; // defensive cap
  let creditPortion = R - externalPortion;
  // Credit havuzu aşarsa fazlayı external'a kaydır (external hâlâ havuzunu aşmasın).
  if (creditPortion > credit) {
    const overflow = creditPortion - credit;
    creditPortion = credit;
    externalPortion = externalPortion + overflow > ext ? ext : externalPortion + overflow;
  }
  return { externalPortionMinor: Number(externalPortion), creditPortionMinor: Number(creditPortion) };
}

export interface DestinationEligibilityInput {
  externalRefundableRemaining: number;
  totalRefundableMinor: number;
}

export interface DestinationEligibility {
  offerOriginalPayment: boolean;
  offerShoppingBalance: boolean;
}

/**
 * ORIGINAL_PAYMENT yalnız external refundable > 0 iken sunulur (external-origin değer olmadan
 * "orijinal ödemeye iade" anlamsız). SHOPPING_BALANCE herhangi refundable > 0 iken sunulur.
 */
export function resolveDestinationEligibility(input: DestinationEligibilityInput): DestinationEligibility {
  return {
    offerOriginalPayment: input.externalRefundableRemaining > 0,
    offerShoppingBalance: input.totalRefundableMinor > 0,
  };
}

export interface RefundDestinationPreview {
  totalRefundableMinor: number;
  externalComponentMinor: number;
  creditComponentMinor: number;
  offerOriginalPayment: boolean;
  offerShoppingBalance: boolean;
}

/** UI/preview DTO: split + eligibility. Server-authoritative; client tutar göndermez. */
export function buildRefundDestinationPreview(input: RefundSourceSplitInput): RefundDestinationPreview {
  const split = computeRefundSourceSplit(input);
  const totalRefundableMinor = split.externalPortionMinor + split.creditPortionMinor;
  const elig = resolveDestinationEligibility({
    externalRefundableRemaining: input.externalRefundableRemaining,
    totalRefundableMinor,
  });
  return {
    totalRefundableMinor,
    externalComponentMinor: split.externalPortionMinor,
    creditComponentMinor: split.creditPortionMinor,
    ...elig,
  };
}
