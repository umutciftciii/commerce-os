/**
 * TODO-174B UX — Checkout "Alışveriş bakiyesi" (store credit) istemci-önizlemesi.
 *
 * Kredi bir ÖDEME yöntemidir, indirim DEĞİL: sipariş toplamını (Genel toplam) değiştirmez;
 * yalnız ŞU AN ödenecek tutarı azaltır. Gateway tahsis kuralı (ADR-282) `min(available, payable)`
 * — bu saf fonksiyon aynı kuralı önizlemede yansıtır (Genel toplam korunur; "Ödenecek" düşer).
 */
export interface ShoppingCreditPreview {
  /** Bu siparişte kullanılacak bakiye (minor); min(bakiye, ödenecek). */
  appliedMinor: number;
  /** Bakiye sonrası ödeme adımında tahsil edilecek kalan (minor). */
  remainingMinor: number;
}

/** Negatif/NaN girişleri 0'a kırpar; asla negatif kalan üretmez. */
export function computeShoppingCreditPreview(availableMinor: number, payableMinor: number): ShoppingCreditPreview {
  const available = Number.isFinite(availableMinor) ? Math.max(0, Math.floor(availableMinor)) : 0;
  const payable = Number.isFinite(payableMinor) ? Math.max(0, Math.floor(payableMinor)) : 0;
  const appliedMinor = Math.min(available, payable);
  return { appliedMinor, remainingMinor: payable - appliedMinor };
}
