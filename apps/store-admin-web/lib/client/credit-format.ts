/**
 * TODO-174B UX — Store Credit tutar/neden yardımcıları (store-admin client).
 * Girdi TL (₺) formatında; API sınırına kanonik MINOR string (kuruş) çevrilir (float yok, BigInt).
 */

/** "250" | "250,50" | "250.5" | "0,25" → kanonik minor string ("25000" | "25050" | "25050" | "25"). Geçersiz → null. */
export function tlToMinor(input: string): string | null {
  const s = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  const minor = BigInt(whole) * 100n + BigInt(fracPadded || "0");
  if (minor <= 0n) return null;
  return minor.toString();
}

/** Bakiye ekleme/düzeltme nedeni (iç kod; audit). Free-text değil — dropdown seçimi. */
export interface CreditReasonOption {
  value: string;
  label: string;
}
export function creditReasonOptions(tr: boolean): CreditReasonOption[] {
  const opts: [string, string, string][] = [
    ["CUSTOMER_SATISFACTION", "Müşteri memnuniyeti", "Customer satisfaction"],
    ["DELIVERY_ISSUE", "Teslimat sorunu", "Delivery issue"],
    ["PRODUCT_ISSUE", "Ürün sorunu / hasar", "Product issue / damage"],
    ["PRICE_ADJUSTMENT", "Fiyat farkı / düzeltme", "Price adjustment"],
    ["APOLOGY", "Özür / iyi niyet", "Apology / goodwill"],
    ["LOYALTY", "Sadakat / kampanya", "Loyalty / campaign"],
    ["CORRECTION", "Hatalı işlem düzeltmesi", "Erroneous entry correction"],
    ["OTHER", "Diğer", "Other"],
  ];
  return opts.map(([value, trLabel, enLabel]) => ({ value, label: tr ? trLabel : enLabel }));
}
