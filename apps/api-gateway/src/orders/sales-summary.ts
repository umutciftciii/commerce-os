/**
 * F4C (ADR-064) — Admin sipariş "satış özeti" türetimi. Modül SAF'tır (I/O yok)
 * ve KAYNAK DOĞRUSU sipariş SNAPSHOT'larıdır:
 *
 *  - Bölüm A (ödeme/tutar): Order toplam alanları + OrderDiscount etiketleri +
 *    PaymentAttempt kayıtları. Her sipariş için üretilir (legacy dahil).
 *  - Bölüm B (satış/vergi/kâr): OrderLine F4C KDV/maliyet snapshot alanları.
 *    YALNIZCA tüm satırlarda KDV snapshot'ı varsa üretilir; eski (F4C öncesi)
 *    siparişlerde `sales: null` döner — güncel ürün verisinden ASLA yeniden
 *    hesaplanmaz, yanıltıcı sıfır gösterilmez.
 *
 * Deterministik MVP kuralları (ADR-064):
 *  - Liste Fiyatı  = Σ unitListPriceMinor × adet (indirim ÖNCESİ brüt taban).
 *  - KDV           = Σ lineVatAmountMinor (indirim ÖNCESİ; oran bazında dağılım).
 *  - Vergisiz Net  = Σ lineNetAmountMinor (indirim ÖNCESİ).
 *  - Maliyet       = Σ lineCostMinor; HERHANGİ bir satırda yoksa null (kısmi
 *    maliyetle yanıltıcı kâr üretilmez).
 *  - Brüt Kâr      = Vergisiz Net − Maliyet (maliyet yoksa null).
 *  - Kampanya İnd. = Order.discountAmount (müşteriye yansıyan BRÜT indirim).
 *  - Net Kâr       = Brüt Kâr − Kampanya İndirimi (brüt indirim net kâr
 *    tabanından düşülür; kullanıcı tablosuyla birebir aynı kural).
 *  - Net Ödenen    = ilk PAID/AUTHORIZED PaymentAttempt tutarı; deneme yoksa ve
 *    sipariş PAID/AUTHORIZED ise genel toplam; aksi halde 0.
 *  - Kalan Bakiye  = max(0, Ödenmesi Gereken − Net Ödenen).
 */
import type { OrderSalesSummary } from "@commerce-os/contracts";

export interface SalesSummaryLineInput {
  quantity: number;
  /** Mevcut brüt satır toplamı (KDV dahil). */
  totalAmount: number;
  unitPriceAmount: number;
  unitNetPriceMinor: number | null;
  unitVatRateBps: number | null;
  unitVatAmountMinor: number | null;
  unitGrossPriceMinor: number | null;
  unitListPriceMinor: number | null;
  unitCostMinor: number | null;
  lineNetAmountMinor: number | null;
  lineVatAmountMinor: number | null;
  lineGrossAmountMinor: number | null;
  lineCostMinor: number | null;
}

export interface SalesSummaryOrderInput {
  currency: string;
  subtotalAmount: number;
  discountAmount: number;
  shippingAmount: number;
  totalAmount: number;
  paymentStatus: string;
  lines: SalesSummaryLineInput[];
  discounts: Array<{ label: string; discountAmountMinor: number }>;
  paymentAttempts: Array<{ status: string; amount: number }>;
}

/** Satırda F4C KDV snapshot'ı tam mı? (maliyet OPSİYONEL; ayrı ele alınır) */
function hasVatSnapshot(line: SalesSummaryLineInput): boolean {
  return (
    line.unitNetPriceMinor !== null &&
    line.unitVatRateBps !== null &&
    line.unitVatAmountMinor !== null &&
    line.lineNetAmountMinor !== null &&
    line.lineVatAmountMinor !== null
  );
}

export function buildOrderSalesSummary(order: SalesSummaryOrderInput): OrderSalesSummary {
  // Bölüm A — Ödeme/tutar özeti (mevcut alanlardan; snapshot gerektirmez).
  // TODO-159F — Tahsil edilmiş (PAID/AUTHORIZED) TÜM denemeler toplanır (online + manuel).
  // Deneme yoksa ve sipariş PAID/AUTHORIZED ise genel toplama düşülür (legacy siparişler).
  const capturedAttemptsMinor = order.paymentAttempts
    .filter((attempt) => attempt.status === "PAID" || attempt.status === "AUTHORIZED")
    .reduce((sum, attempt) => sum + attempt.amount, 0);
  const paidGrossMinor =
    capturedAttemptsMinor > 0
      ? Math.min(capturedAttemptsMinor, order.totalAmount)
      : order.paymentStatus === "PAID" || order.paymentStatus === "AUTHORIZED"
        ? order.totalAmount
        : 0;
  const labels = order.discounts.map((discount) => discount.label).filter((label) => label.length > 0);
  const discountLabel = labels.length > 0 ? labels.join(" + ") : null;

  // Bölüm B — Satış/vergi/kâr (yalnız tüm satırlar KDV snapshot'lıysa).
  const snapshotComplete = order.lines.length > 0 && order.lines.every(hasVatSnapshot);
  let sales: OrderSalesSummary["sales"] = null;
  if (snapshotComplete) {
    let listGrossMinor = 0;
    let subtotalNetMinor = 0;
    let totalVatMinor = 0;
    const vatByRate = new Map<number, number>();
    let totalCostMinor: number | null = 0;
    for (const line of order.lines) {
      // Liste fiyatı snapshot'ı eksikse brüt birim fiyata düşülür (yine snapshot).
      const unitList = line.unitListPriceMinor ?? line.unitGrossPriceMinor ?? line.unitPriceAmount;
      listGrossMinor += unitList * line.quantity;
      subtotalNetMinor += line.lineNetAmountMinor!;
      totalVatMinor += line.lineVatAmountMinor!;
      const rate = line.unitVatRateBps!;
      vatByRate.set(rate, (vatByRate.get(rate) ?? 0) + line.lineVatAmountMinor!);
      const lineCost = line.lineCostMinor ?? (line.unitCostMinor !== null ? line.unitCostMinor * line.quantity : null);
      if (lineCost === null) totalCostMinor = null;
      else if (totalCostMinor !== null) totalCostMinor += lineCost;
    }
    const grossProfitMinor = totalCostMinor === null ? null : subtotalNetMinor - totalCostMinor;
    const campaignDiscountMinor = order.discountAmount;
    sales = {
      listGrossMinor,
      subtotalNetMinor,
      totalVatMinor,
      // Deterministik sıra: oran artan.
      vatBreakdown: [...vatByRate.entries()]
        .sort(([a], [b]) => a - b)
        .map(([rateBps, amountMinor]) => ({ rateBps, amountMinor })),
      totalCostMinor,
      grossProfitMinor,
      campaignDiscountMinor,
      netProfitMinor: grossProfitMinor === null ? null : grossProfitMinor - campaignDiscountMinor,
    };
  }

  return {
    currency: order.currency,
    subtotalGrossMinor: order.subtotalAmount,
    discountGrossMinor: order.discountAmount,
    discountLabel,
    shippingGrossMinor: order.shippingAmount,
    payableGrossMinor: order.totalAmount,
    paidGrossMinor,
    remainingGrossMinor: Math.max(0, order.totalAmount - paidGrossMinor),
    sales,
  };
}
