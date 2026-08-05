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
  /**
   * TD-FR-7 — Sipariş anında bu kaleme FİİLEN düşen order-level indirim (KDV DAHİL).
   * Kampanya/checkout motoru scope'u bilerek dağıtır (OrderLine.discountAllocatedMinor).
   * Bu değer set ise iade, kalemin fiilen ödenenini (lineGross − discountAllocated)
   * yansıtır; oransal (gross-ağırlıklı) dağıtım YAPILMAZ. undefined/null = legacy
   * snapshot yok → order-level indirim gross-ağırlıklı oransal dağıtılır (geri uyum).
   */
  discountAllocatedMinor?: number | null;
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
  // TD-FR-7 — Kalem-bazlı indirim SNAPSHOT'i (discountAllocatedMinor) TÜM satırlarda
  // varsa: her kalem sipariş anında FİİLEN düşen indirimini taşır → oransal dağıtım
  // YAPILMAZ (scope'lu indirimde yanlış olurdu). Herhangi bir satırda snapshot yoksa
  // (legacy sipariş) TÜM sipariş için gross-ağırlıklı oransal fallback (geri uyum);
  // karışık mod order indirimini çift saymamak için ya-hep-ya-hiç değerlendirilir.
  const hasSnapshot =
    input.lines.length > 0 && input.lines.every((l) => l.discountAllocatedMinor != null);
  const allocations = hasSnapshot
    ? input.lines.map((l) => l.discountAllocatedMinor as number)
    : allocateOrderDiscount(
        input.lines.map((l) => l.lineGrossMinor),
        input.orderLevelDiscountMinor,
      );

  const perLine: RefundCalcLineResult[] = [];
  let productRefundMinor = 0;
  let taxRefundMinor = 0;

  input.lines.forEach((line, i) => {
    const allocatedDiscountMinor = allocations[i];
    // Satırın iade tabanı: brüt − o kaleme düşen indirim (negatife düşmez).
    // Snapshot modda = kalemin fiilen ödenen tutarı; legacy'de = oransal pay sonrası.
    const base = Math.max(0, line.lineGrossMinor - allocatedDiscountMinor);
    let productRefund = 0;
    let taxRefund = 0;
    if (line.returnedQuantity > 0 && line.lineQuantity > 0) {
      productRefund = Math.max(0, Math.round((base * line.returnedQuantity) / line.lineQuantity));
      // Disclosed KDV, iade edilen (indirim-sonrası) tutarın İÇİNDEKİ orandan türer:
      // KDV oranı brütte sabit (vat/gross); indirim KDV-dahil brütü düşürdüğünden
      // aynı oran indirimli tabanda da geçerlidir. Bu, indirimli kalemde brütten
      // KDV göstermenin (fazla-disclosure) tutarsızlığını da çözer (TD-FR-7 §3).
      if (line.lineVatMinor != null && line.lineGrossMinor > 0) {
        taxRefund = Math.max(0, Math.round((line.lineVatMinor * productRefund) / line.lineGrossMinor));
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
