/**
 * TODO-169 (ADR-269 §6/§12) — İade tutarı SAF hesabı. İmmutable OrderLine snapshot'larından +
 * iade quantity oranından hesaplanır; CLIENT-SIDE hesap YOK. Bu kayıt RefundIntent (PENDING)
 * olarak yazılır ve TODO-170 tarafından işlenir; bu fazda FINANSA DOKUNMAZ.
 *
 * Politika (ADR-269 §6):
 *  - Satır indirimi zaten lineGross snapshot'ının İÇİNDEDİR (ADR-066).
 *  - Order-level indirim (Order.discountAmount) satırlara gross ağırlığıyla DETERMINISTIK dağıtılır;
 *    minor-unit rounding, kalan (remainder) SON (pozitif ağırlıklı) satıra verilir → Σ tam eşit.
 *  - KDV DAHILDIR (Order.taxAmount=0; VAT lineVat snapshot'ında). Tax refund pro-rata DISCLOSURE
 *    içindir; gross ürün iadesinin İÇİNDE olduğundan ÜSTÜNE EKLENMEZ.
 *  - Kargo yalnız politika/admin kararıyla iade edilir; ücretsiz kargoda (shippingAmount=0) → 0.
 *  - total = Σ productRefund + shippingRefund (tax tekrar eklenmez).
 */

export interface RefundCalcLine {
  orderLineId: string;
  lineQuantity: number;
  returnedQuantity: number;
  /** Çözülmüş satır brüt tutarı: lineGrossAmountMinor ?? totalAmount (KDV DAHIL). */
  lineGrossMinor: number;
  /** Satır KDV snapshot'ı (lineVatAmountMinor); legacy'de null. */
  lineVatMinor: number | null;
}

export interface RefundCalcInput {
  currency: string;
  /** Order.discountAmount — order-level indirim (satır indirimi zaten lineGross içinde). */
  orderLevelDiscountMinor: number;
  /** Order.shippingAmount — kargo ücreti snapshot'ı. */
  shippingAmountMinor: number;
  /** Admin kararı: kargo ücreti iade edilsin mi. */
  refundShipping: boolean;
  /** TÜM sipariş satırları (dağıtım ağırlığı için); iade edilmeyen satır returnedQuantity=0. */
  lines: RefundCalcLine[];
}

export interface RefundCalcLineResult {
  orderLineId: string;
  productRefundMinor: number;
  taxRefundMinor: number;
  allocatedDiscountMinor: number;
}

export interface RefundCalcResult {
  currency: string;
  productRefundMinor: number;
  shippingRefundMinor: number;
  taxRefundMinor: number;
  totalRefundMinor: number;
  perLine: RefundCalcLineResult[];
}

/**
 * Order-level indirimi satırlara gross ağırlığıyla dağıtır. floor payları + kalanı son pozitif
 * ağırlıklı satıra ekler (deterministik, Σ = total). total≤0 veya toplam ağırlık 0 → hepsi 0.
 */
export function allocateOrderDiscount(weights: number[], total: number): number[] {
  const result = weights.map(() => 0);
  if (total <= 0) return result;
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) return result;

  let allocated = 0;
  for (let i = 0; i < weights.length; i += 1) {
    const share = Math.floor((total * weights[i]) / sumW);
    result[i] = share;
    allocated += share;
  }
  const remainder = total - allocated;
  if (remainder > 0) {
    // Son POZİTİF ağırlıklı satırı bul (ADR-269 §6: "son satır remainder alır").
    let lastIdx = -1;
    for (let i = 0; i < weights.length; i += 1) {
      if (weights[i] > 0) lastIdx = i;
    }
    if (lastIdx >= 0) result[lastIdx] += remainder;
  }
  return result;
}

/** İade tutarı hesabı (saf). Tüm alanlar minor-unit; tutarlar asla negatif olmaz. */
export function computeRefund(input: RefundCalcInput): RefundCalcResult {
  const weights = input.lines.map((l) => l.lineGrossMinor);
  const allocations = allocateOrderDiscount(weights, input.orderLevelDiscountMinor);

  const perLine: RefundCalcLineResult[] = [];
  let productRefundMinor = 0;
  let taxRefundMinor = 0;

  input.lines.forEach((line, i) => {
    const allocatedDiscountMinor = allocations[i];
    // Satırın iade tabanı: brüt − pay edilen order indirimi (negatife düşmez).
    const base = Math.max(0, line.lineGrossMinor - allocatedDiscountMinor);
    let productRefund = 0;
    let taxRefund = 0;
    if (line.returnedQuantity > 0 && line.lineQuantity > 0) {
      productRefund = Math.max(0, Math.round((base * line.returnedQuantity) / line.lineQuantity));
      if (line.lineVatMinor != null) {
        taxRefund = Math.max(
          0,
          Math.round((line.lineVatMinor * line.returnedQuantity) / line.lineQuantity),
        );
      }
    }
    productRefundMinor += productRefund;
    taxRefundMinor += taxRefund;
    perLine.push({ orderLineId: line.orderLineId, productRefundMinor: productRefund, taxRefundMinor: taxRefund, allocatedDiscountMinor });
  });

  const shippingRefundMinor =
    input.refundShipping && input.shippingAmountMinor > 0 ? input.shippingAmountMinor : 0;

  const totalRefundMinor = productRefundMinor + shippingRefundMinor;

  return {
    currency: input.currency,
    productRefundMinor,
    shippingRefundMinor,
    taxRefundMinor,
    totalRefundMinor,
    perLine,
  };
}
