/**
 * Financial Reporting Foundation (ADR-268) — SAF finansal metrik SÖZLÜĞÜ.
 *
 * Bu modül I/O'suz, deterministik ve `Date.now`/`Math.random`-suzdur. KAYNAK DOĞRUSU
 * sipariş SNAPSHOT'larıdır (Order/OrderLine/OrderDiscount/PaymentAttempt); canlı
 * Product/Variant fiyatı ASLA kullanılmaz. `finance/data.ts` her iş-günü × para birimi
 * için building-block satırlarını (FinanceDailyRow) DB-tarafı agregasyonla üretir; bu
 * modül onları özet/karşılaştırmaya KATLAR. Böylece çalışma-zamanı yolu = saf motor →
 * "özet toplamı = günlük kırılım toplamı" invariant'ı (ADR-268 §15) yapıca garantidir.
 *
 * ── Metrik sözlüğü (tümü minor-unit; KDV fiyata DAHİL/inclusive) ──────────────
 *  Gross Sales        = Σ Order.subtotalAmount            (indirim ÖNCESİ brüt satış)
 *  Discounts          = Σ Order.discountAmount            (= Σ OrderDiscount.discountAmountMinor)
 *  Product Refunds    = Σ SUCCEEDED OrderRefund.productRefundMinor (ADR-272 ledger; completedAt günü;
 *                       inclusive KDV — taxRefund ürün refund'un İÇİNDE, ÜSTÜNE eklenmez; TEK KEZ düşülür)
 *  Net Product Sales  = Gross Sales − Discounts − Product Refunds
 *  Shipping Revenue   = Σ Order.shippingAmount
 *  Shipping Refunds   = Σ SUCCEEDED OrderRefund.shippingRefundMinor (ADR-272 ledger)
 *  Total Revenue      = Net Product Sales + Shipping Revenue − Shipping Refunds
 *  Tax (KDV)          = Σ OrderLine.lineVatAmountMinor    (inclusive; AYRI gösterilir,
 *                       revenue'ya İKİNCİ KEZ EKLENMEZ; yalnız snapshot'lı satırlardan)
 *  Orders             = satış siparişi sayısı (status ∈ PLACED/CONFIRMED/FULFILLED)
 *  Paid Orders        = paymentStatus ∈ {PAID, AUTHORIZED}
 *  Units Sold         = Σ OrderLine.quantity
 *  Cancelled Orders   = status = CANCELLED (satışa DAHİL DEĞİL; createdAt ile bucketlanır)
 *  Refunded Orders    = paymentStatus ∈ {REFUNDED, PARTIALLY_REFUNDED} (adet; tutar YOK)
 *  AOV                = round(Total Revenue / Orders)  (sıfır-payda güvenli → 0)
 *
 * ── Kârlılık (ADR-268 §8) ─────────────────────────────────────────────────────
 *  Satış-anı maliyet snapshot'ı (OrderLine.lineCostMinor) MEVCUT olduğundan kârlılık
 *  DESTEKLENİR; ancak "hepsi-varsa" kuralıyla: dönemdeki TÜM satış siparişleri hem KDV
 *  hem maliyet snapshot'ına sahipse gösterilir, aksi halde `null` (kısmi veriyle
 *  yanıltıcı kâr üretilmez — sales-summary.ts ile aynı ilke). Kapsam sayıları dışa verilir.
 *    Gross Profit = Σ lineNetAmountMinor (vergisiz) − Σ lineCostMinor
 *    Net Profit   = Gross Profit − Discounts (kampanya indirimi net kârdan düşülür)
 *
 * ── Para & zaman (ADR-268 §5) ─────────────────────────────────────────────────
 *  Her currency AYRI raporlanır; farklı currency değerleri TOPLANMAZ (FX yok). İş günü
 *  sınırı mağaza timezone'unda çözülür (finance/date-range.ts). Satış tarihi =
 *  COALESCE(placedAt, createdAt); tahsilat tarihi AYRIDIR (payment report, paidAt/collectedAt).
 */

/** Satış siparişi sayılan Order.status kümesi (DRAFT/CANCELLED hariç). */
export const SALES_ORDER_STATUSES = ["PLACED", "CONFIRMED", "FULFILLED"] as const;
/** "Ödendi" sayılan paymentStatus kümesi (hâlihazırda tahsil edilmiş). */
export const PAID_PAYMENT_STATUSES = ["PAID", "AUTHORIZED"] as const;
/** İadeli sayılan paymentStatus kümesi (adet metriği; tutar bu fazda YOK). */
export const REFUNDED_PAYMENT_STATUSES = ["REFUNDED", "PARTIALLY_REFUNDED"] as const;

/**
 * DB-tarafı agregasyonun ürettiği building-block: bir iş-günü × para birimi satırı.
 * Satış tutarları/sayıları satış siparişlerinden; `cancelledOrderCount` iptal
 * siparişlerin kendi createdAt gününden gelir. Snapshot'lı alanlar yalnız ilgili
 * OrderLine snapshot'ı DOLU siparişlerden toplanır (kapsam sayısıyla birlikte).
 */
export interface FinanceDailyRow {
  /** İş günü (YYYY-MM-DD, mağaza timezone'unda). */
  date: string;
  currency: string;
  grossSalesMinor: number;
  discountsMinor: number;
  shippingRevenueMinor: number;
  /** Σ Order.totalAmount (satış siparişleri) — AOV/mutabakat için. */
  totalMinor: number;
  /** Σ OrderLine.lineVatAmountMinor (yalnız KDV snapshot'lı satış siparişleri). */
  taxMinor: number;
  /** Σ OrderLine.lineNetAmountMinor (vergisiz; yalnız snapshot'lı). */
  netExVatMinor: number;
  /** Σ OrderLine.lineCostMinor (yalnız maliyet snapshot'lı). */
  costMinor: number;
  orderCount: number;
  paidOrderCount: number;
  refundedOrderCount: number;
  /** Σ SUCCEEDED OrderRefund.productRefundMinor (ADR-272; completedAt günü, inclusive KDV içinde). */
  productRefundsMinor: number;
  /** Σ SUCCEEDED OrderRefund.shippingRefundMinor (ADR-272). */
  shippingRefundsMinor: number;
  unitsSold: number;
  cancelledOrderCount: number;
  /** KDV snapshot'ı TAM olan satış siparişi sayısı (tax kapsamı). */
  taxCoveredOrderCount: number;
  /** Maliyet snapshot'ı TAM olan satış siparişi sayısı (kâr kapsamı). */
  costCoveredOrderCount: number;
}

/** Tek para birimi için dönem özeti (günlük satırların katlanmışı). */
export interface FinanceSummary {
  currency: string;
  grossSalesMinor: number;
  discountsMinor: number;
  /** Bu fazda 0 (tutar defteri yok); dışa `refundAmountsSupported=false` ile bildirilir. */
  productRefundsMinor: number;
  netProductSalesMinor: number;
  shippingRevenueMinor: number;
  shippingRefundsMinor: number;
  taxMinor: number;
  totalRevenueMinor: number;
  orderCount: number;
  paidOrderCount: number;
  cancelledOrderCount: number;
  refundedOrderCount: number;
  unitsSold: number;
  averageOrderValueMinor: number;
  /** Kârlılık — dönem TAM kapsamlıysa dolu; aksi halde null (yanıltıcı kâr üretilmez). */
  grossProfitMinor: number | null;
  netProfitMinor: number | null;
  costMinor: number | null;
  /** Kapsam şeffaflığı (UI "X/Y siparişte maliyet verisi" gösterir). */
  taxCoveredOrderCount: number;
  costCoveredOrderCount: number;
}

/** İki tutar/sayı arası karşılaştırma (ADR-268 §10; sıfır-payda güvenli). */
export interface FinanceDelta {
  current: number;
  previous: number;
  /** current − previous. */
  deltaMinor: number;
  /** Yüzde değişim (previous=0 ise null → UI "—"/"yeni" gösterir; renk-tek-başına DEĞİL). */
  deltaPct: number | null;
}

const ZERO_SUMMARY = (currency: string): FinanceSummary => ({
  currency,
  grossSalesMinor: 0,
  discountsMinor: 0,
  productRefundsMinor: 0,
  netProductSalesMinor: 0,
  shippingRevenueMinor: 0,
  shippingRefundsMinor: 0,
  taxMinor: 0,
  totalRevenueMinor: 0,
  orderCount: 0,
  paidOrderCount: 0,
  cancelledOrderCount: 0,
  refundedOrderCount: 0,
  unitsSold: 0,
  averageOrderValueMinor: 0,
  grossProfitMinor: null,
  netProfitMinor: null,
  costMinor: null,
  taxCoveredOrderCount: 0,
  costCoveredOrderCount: 0,
});

/** Sıfır-payda güvenli tam-sayı AOV. */
export function averageOrderValue(totalRevenueMinor: number, orderCount: number): number {
  if (orderCount <= 0) return 0;
  return Math.round(totalRevenueMinor / orderCount);
}

/** Sıfır-payda güvenli yüzde değişim (previous=0 → null). */
export function computeDelta(current: number, previous: number): FinanceDelta {
  const deltaMinor = current - previous;
  const deltaPct = previous === 0 ? null : (deltaMinor / previous) * 100;
  return { current, previous, deltaMinor, deltaPct };
}

/**
 * Günlük satırları TEK para birimi özetine katlar. Girdi satırları AYNI currency
 * olmalıdır (çağıran currency başına gruplar). Reconciliation: dönen toplamlar,
 * girdilerin alan-bazlı toplamına birebir eşittir.
 */
export function summarizeDailyRows(currency: string, rows: FinanceDailyRow[]): FinanceSummary {
  const summary = ZERO_SUMMARY(currency);
  let netExVatMinor = 0;
  let costMinor = 0;
  for (const row of rows) {
    if (row.currency !== currency) continue;
    summary.grossSalesMinor += row.grossSalesMinor;
    summary.discountsMinor += row.discountsMinor;
    summary.productRefundsMinor += row.productRefundsMinor;
    summary.shippingRefundsMinor += row.shippingRefundsMinor;
    summary.shippingRevenueMinor += row.shippingRevenueMinor;
    summary.taxMinor += row.taxMinor;
    summary.orderCount += row.orderCount;
    summary.paidOrderCount += row.paidOrderCount;
    summary.cancelledOrderCount += row.cancelledOrderCount;
    summary.refundedOrderCount += row.refundedOrderCount;
    summary.unitsSold += row.unitsSold;
    summary.taxCoveredOrderCount += row.taxCoveredOrderCount;
    summary.costCoveredOrderCount += row.costCoveredOrderCount;
    netExVatMinor += row.netExVatMinor;
    costMinor += row.costMinor;
  }
  summary.netProductSalesMinor =
    summary.grossSalesMinor - summary.discountsMinor - summary.productRefundsMinor;
  summary.totalRevenueMinor =
    summary.netProductSalesMinor + summary.shippingRevenueMinor - summary.shippingRefundsMinor;
  summary.averageOrderValueMinor = averageOrderValue(summary.totalRevenueMinor, summary.orderCount);

  // Kârlılık — yalnız dönem TAM kapsamlıysa (her satış siparişi hem KDV hem maliyet
  // snapshot'lı). Aksi halde null: kısmi maliyetle yanıltıcı kâr gösterilmez (ADR-268 §8).
  const fullyCovered =
    summary.orderCount > 0 &&
    summary.taxCoveredOrderCount === summary.orderCount &&
    summary.costCoveredOrderCount === summary.orderCount;
  if (fullyCovered) {
    summary.costMinor = costMinor;
    summary.grossProfitMinor = netExVatMinor - costMinor;
    summary.netProfitMinor = summary.grossProfitMinor - summary.discountsMinor;
  } else {
    summary.costMinor = null;
    summary.grossProfitMinor = null;
    summary.netProfitMinor = null;
  }
  return summary;
}

/** Günlük satırlardaki farklı currency'leri (satış hacmine göre azalan) listeler. */
export function listCurrencies(rows: FinanceDailyRow[]): string[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.grossSalesMinor + row.shippingRevenueMinor);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}

/** Birincil currency = en yüksek satış hacimli (yoksa null). */
export function primaryCurrency(rows: FinanceDailyRow[]): string | null {
  return listCurrencies(rows)[0] ?? null;
}
