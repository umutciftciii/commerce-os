/**
 * TODO-174A — Birleşik iade/refund GÖRÜNÜRLÜK projeksiyonu (admin + müşteri).
 *
 * ReturnRequest ve OrderRefund AYRI domain'ler kalır (Refund Ledger source-of-truth); bu modül YALNIZ
 * projeksiyon birleşimidir — yeni tablo/domain birleştirmesi YOK. Cancellation satırı için "return
 * request" copy'si ÜRETİLMEZ; her satır `source` (RefundOrigin) ile kendi menşeine etiketlenir.
 *
 * Her cancellation için sipariş başına EN FAZLA bir OrderRefund vardır (idempotencyKey
 * `order-cancel-refund:<orderId>` @@unique([storeId, idempotencyKey])) → gruplama gerekmez.
 *
 * Saf mapper'lar birim-test edilebilir (prisma'ya dokunmaz); route handler'ı sorgu + pagination yapar.
 */
import type {
  AdminRefundVisibilityItem,
  CustomerRefundVisibilityItem,
  OrderCancellationReasonValue,
  OrderRefundStatusValue,
  RefundDestinationValue,
  ReturnResolutionTypeValue,
} from "@commerce-os/contracts";
import type { PaymentManualMethod, PaymentMethodType } from "@prisma/client";
import { buildCustomerRefundSummary, maskPaymentMethodLabel } from "./serialize.js";

const OVERDUE_AGE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Maskeli ödeme yöntemi için gereken minimal paymentAttempt şekli (ham PAN/secret İÇERMEZ). */
export interface MaskablePaymentAttempt {
  method: PaymentMethodType;
  cardBrand: string | null;
  cardLast4: string | null;
  manualMethod: PaymentManualMethod | null;
}

/** Store Admin liste için return-request satırının kaynak şekli (prisma select ile eşleşir). */
export interface AdminReturnRowSource {
  id: string;
  returnNumber: string;
  status: string;
  resolutionType: string;
  refundDestination: RefundDestinationValue | null;
  requestedAt: Date;
  returnWindowEndsAt: Date;
  order: { orderNumber: string };
  customer: { firstName: string | null; lastName: string | null; email: string | null } | null;
  items: Array<{ quantity: number }>;
}

/** Store Admin liste için cancellation OrderRefund satırının kaynak şekli. */
export interface AdminCancellationRowSource {
  id: string;
  status: OrderRefundStatusValue;
  currency: string;
  totalRefundMinor: number;
  requestedAt: Date;
  completedAt: Date | null;
  order: {
    id: string;
    orderNumber: string;
    cancelReasonCode: OrderCancellationReasonValue | null;
    customer: { firstName: string | null; lastName: string | null; email: string | null } | null;
  };
  refundDestination: RefundDestinationValue | null;
  paymentAttempt: MaskablePaymentAttempt | null;
}

function customerName(
  c: { firstName: string | null; lastName: string | null; email: string | null } | null,
): string | null {
  if (!c) return null;
  const full = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
  return full || c.email || null;
}

/** Return-request → birleşik admin satırı (refund alanları null; return alanları dolu). */
export function mapAdminReturnRow(r: AdminReturnRowSource, now: number): AdminRefundVisibilityItem {
  const totalQuantity = r.items.reduce((s, it) => s + it.quantity, 0);
  const ageDays = Math.max(0, Math.floor((now - r.requestedAt.getTime()) / DAY_MS));
  return {
    source: "RETURN_REQUEST",
    detailKind: "RETURN",
    detailId: r.id,
    reference: r.returnNumber,
    orderNumber: r.order.orderNumber,
    customerName: customerName(r.customer),
    customerEmail: r.customer?.email ?? null,
    createdAt: r.requestedAt.toISOString(),
    itemCount: r.items.length,
    totalQuantity,
    resolutionType: r.resolutionType as ReturnResolutionTypeValue,
    returnStatus: r.status as AdminRefundVisibilityItem["returnStatus"],
    returnWindowEndsAt: r.returnWindowEndsAt.toISOString(),
    ageDays,
    refundStatus: null,
    refundAmountMinor: null,
    currency: null,
    refundMethodLabel: null,
    refundCompletedAt: null,
    refundDestination: r.refundDestination,
    cancellationReasonCode: null,
  };
}

/** Cancellation OrderRefund → birleşik admin satırı (return alanları null; refund alanları dolu). */
export function mapAdminCancellationRow(r: AdminCancellationRowSource): AdminRefundVisibilityItem {
  return {
    source: "ORDER_CANCELLATION",
    detailKind: "ORDER",
    detailId: r.order.id,
    reference: r.order.orderNumber,
    orderNumber: r.order.orderNumber,
    customerName: customerName(r.order.customer),
    customerEmail: r.order.customer?.email ?? null,
    createdAt: r.requestedAt.toISOString(),
    itemCount: null,
    totalQuantity: null,
    resolutionType: null,
    returnStatus: null,
    returnWindowEndsAt: null,
    ageDays: null,
    refundStatus: r.status,
    refundAmountMinor: r.totalRefundMinor,
    currency: r.currency,
    refundMethodLabel: maskPaymentMethodLabel(r.paymentAttempt),
    refundCompletedAt: r.completedAt?.toISOString() ?? null,
    refundDestination: r.refundDestination,
    cancellationReasonCode: r.order.cancelReasonCode,
  };
}

/**
 * TODO-175 (Düzeltme D) — Shopping-balance adoption rate. Payda YALNIZ müşterinin GERÇEK seçim yaptığı
 * refund'lar: external component > 0 VE her iki seçenek de sunulmuş (choiceEligible). Payda 0 → null.
 */
export interface AdoptionInput {
  choiceEligible: boolean;
  destination: RefundDestinationValue | null;
}
export function computeAdoptionRate(rows: readonly AdoptionInput[]): number | null {
  const eligible = rows.filter((r) => r.choiceEligible);
  if (eligible.length === 0) return null;
  const shoppingBalance = eligible.filter((r) => r.destination === "SHOPPING_BALANCE").length;
  return shoppingBalance / eligible.length;
}

/** TODO-175 — Minimum refund-destination raporu (tutar + adoption + cancellation vs return breakdown). */
export interface RefundDestinationReportRow {
  source: "RETURN_REQUEST" | "ORDER_CANCELLATION";
  destination: RefundDestinationValue | null;
  refundAmountMinor: number;
  choiceEligible: boolean;
}
export interface RefundDestinationReport {
  refundToOriginalMinor: number;
  refundToShoppingBalanceMinor: number;
  shoppingBalanceAdoptionRate: number | null;
  returnCount: number;
  cancellationCount: number;
}
export function computeRefundDestinationReport(rows: readonly RefundDestinationReportRow[]): RefundDestinationReport {
  let refundToOriginalMinor = 0;
  let refundToShoppingBalanceMinor = 0;
  let returnCount = 0;
  let cancellationCount = 0;
  for (const r of rows) {
    if (r.destination === "ORIGINAL_PAYMENT") refundToOriginalMinor += r.refundAmountMinor;
    else if (r.destination === "SHOPPING_BALANCE") refundToShoppingBalanceMinor += r.refundAmountMinor;
    if (r.source === "RETURN_REQUEST") returnCount += 1;
    else cancellationCount += 1;
  }
  return {
    refundToOriginalMinor,
    refundToShoppingBalanceMinor,
    shoppingBalanceAdoptionRate: computeAdoptionRate(rows),
    returnCount,
    cancellationCount,
  };
}

/** Settled (nihai) return durumları — SLA/overdue hesabında bunlar geciken sayılmaz. */
const SETTLED_RETURN_STATUSES = new Set([
  "COMPLETED",
  "REJECTED",
  "CANCELLED_BY_CUSTOMER",
  "EXPIRED",
  "CLOSED",
]);

/** Overdue (SLA) filtresi — yalnız return satırlarına uygulanır (cancellation satırında ageDays yok). */
export function isAdminRowOverdue(row: AdminRefundVisibilityItem): boolean {
  if (row.source !== "RETURN_REQUEST" || row.ageDays == null || row.returnStatus == null) return false;
  return row.ageDays >= OVERDUE_AGE_DAYS && !SETTLED_RETURN_STATUSES.has(row.returnStatus);
}

/**
 * İki kaynaktan gelen satırları createdAt'e göre azalan (veya artan) birleştirip sayfalar.
 * Her kaynaktan (skip+take) kadar önceden çekilmiş satır, doğru sayfa dilimini garanti eder.
 */
export function mergeVisibilityRows(
  rows: AdminRefundVisibilityItem[],
  opts: { skip: number; take: number; order: "asc" | "desc" },
): AdminRefundVisibilityItem[] {
  const sorted = [...rows].sort((a, b) => {
    const cmp = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    return opts.order === "asc" ? cmp : -cmp;
  });
  return sorted.slice(opts.skip, opts.skip + opts.take);
}

/* ── Müşteri (vitrin) tarafı ─────────────────────────────────────────────────── */

export interface CustomerCancellationRowSource {
  status: OrderRefundStatusValue;
  currency: string;
  totalRefundMinor: number;
  requestedAt: Date;
  completedAt: Date | null;
  order: {
    orderNumber: string;
    cancelReasonCode: OrderCancellationReasonValue | null;
    cancelReasonNote: string | null;
  };
  refundDestination: RefundDestinationValue | null;
  paymentAttempt: MaskablePaymentAttempt | null;
}

/**
 * Cancellation OrderRefund → müşteri "İadelerim" birleşik satırı (MASKELİ refund + insani neden kodu).
 * Refund özeti sipariş iptalinin tek refund'undan türetilir (expectedTotal = talep edilen tutar).
 */
export function mapCustomerCancellationItem(
  r: CustomerCancellationRowSource,
): CustomerRefundVisibilityItem {
  const refund = buildCustomerRefundSummary({
    currency: r.currency,
    expectedTotalMinor: r.totalRefundMinor,
    refunds: [
      {
        status: r.status,
        totalRefundMinor: r.totalRefundMinor,
        completedAt: r.completedAt,
        requestedAt: r.requestedAt,
      },
    ],
    methodLabel: maskPaymentMethodLabel(r.paymentAttempt),
  });
  return {
    source: "ORDER_CANCELLATION",
    reference: r.order.orderNumber,
    orderNumber: r.order.orderNumber,
    createdAt: r.requestedAt.toISOString(),
    returnStatus: null,
    resolutionType: null,
    refundDestination: r.refundDestination,
    itemCount: null,
    refund,
    cancellationReasonCode: r.order.cancelReasonCode,
    cancellationReasonNote: r.order.cancelReasonNote,
  };
}
