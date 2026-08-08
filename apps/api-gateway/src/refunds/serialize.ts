/**
 * TODO-170 (ADR-272) — Refund DTO serileştirme (ALLOWLIST). Admin yüzeyi kontrollü teknik detay görür;
 * müşteri yüzeyi MASKELİ (ham provider kodu/secret/PAN ASLA). Saf fonksiyonlar (DB'ye bağımlı değil).
 */
import type {
  AdminOrderRefund,
  AdminRefundCapability,
  AdminRefundContext,
  CustomerRefundSummary,
} from "@commerce-os/contracts";
import type {
  OrderRefund,
  OrderRefundEvent,
  PaymentManualMethod,
  PaymentMethodType,
} from "@prisma/client";
import type { RefundCapability } from "./capability.js";
import type { RefundSummaryStatus } from "./summary-status.js";

type RefundWithEvents = OrderRefund & { events: OrderRefundEvent[] };

export function serializeAdminRefund(refund: RefundWithEvents): AdminOrderRefund {
  return {
    id: refund.id,
    status: refund.status,
    executionMode: refund.executionMode,
    provider: refund.provider,
    method: refund.method,
    currency: refund.currency,
    productRefundMinor: refund.productRefundMinor,
    shippingRefundMinor: refund.shippingRefundMinor,
    taxRefundMinor: refund.taxRefundMinor,
    totalRefundMinor: refund.totalRefundMinor,
    providerRefundId: refund.providerRefundId,
    providerReference: refund.providerReference,
    failureCode: refund.failureCode,
    failureMessage: refund.failureMessage,
    manualMethod: refund.manualMethod,
    manualReference: refund.manualReference,
    manualNote: refund.manualNote,
    requestedAt: refund.requestedAt.toISOString(),
    processingStartedAt: refund.processingStartedAt?.toISOString() ?? null,
    completedAt: refund.completedAt?.toISOString() ?? null,
    failedAt: refund.failedAt?.toISOString() ?? null,
    cancelledAt: refund.cancelledAt?.toISOString() ?? null,
    refundDestination: refund.refundDestination,
    version: refund.version,
    events: [...refund.events]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((e) => ({
        type: e.type,
        actorType: e.actorType,
        amountMinor: e.amountMinor,
        providerReference: e.providerReference,
        createdAt: e.createdAt.toISOString(),
      })),
  };
}

export function serializeRefundCapability(cap: RefundCapability): AdminRefundCapability {
  return {
    mode: cap.mode,
    supportsRefund: cap.supportsRefund,
    supportsPartialRefund: cap.supportsPartialRefund,
    provider: cap.provider,
    method: cap.method,
    manualMethod: cap.manualMethod,
    reason: cap.reason,
  };
}

export interface AdminRefundContextInput {
  currency: string;
  capturedMinor: number;
  succeededRefundMinor: number;
  activeRefundMinor: number;
  // TD-FR-7 — PENDING ve PROCESSING AYRI (birleşik activeRefundMinor geriye uyumlu korunur).
  pendingMinor: number;
  processingMinor: number;
  // TD-FR-7 — payment-state.computeNetCollectedMinor çağrısının sonucu (server-side TEK otorite).
  netCollectedMinor: number;
  refundableRemainingMinor: number;
  intent: {
    currency: string;
    productRefundMinor: number;
    shippingRefundMinor: number;
    taxRefundMinor: number;
    totalRefundMinor: number;
    status: "PENDING" | "PROCESSED" | "CONSUMED" | "CANCELLED";
  } | null;
  capability: RefundCapability | null;
  canInitiate: boolean;
  summaryStatus: RefundSummaryStatus;
  refunds: RefundWithEvents[];
}

export function buildAdminRefundContext(input: AdminRefundContextInput): AdminRefundContext {
  return {
    currency: input.currency,
    capturedMinor: input.capturedMinor,
    succeededRefundMinor: input.succeededRefundMinor,
    activeRefundMinor: input.activeRefundMinor,
    pendingMinor: input.pendingMinor,
    processingMinor: input.processingMinor,
    netCollectedMinor: input.netCollectedMinor,
    refundableRemainingMinor: input.refundableRemainingMinor,
    summaryStatus: input.summaryStatus,
    intent: input.intent
      ? {
          currency: input.intent.currency,
          productRefundMinor: input.intent.productRefundMinor,
          shippingRefundMinor: input.intent.shippingRefundMinor,
          taxRefundMinor: input.intent.taxRefundMinor,
          totalRefundMinor: input.intent.totalRefundMinor,
          status: input.intent.status,
        }
      : null,
    capability: input.capability ? serializeRefundCapability(input.capability) : null,
    canInitiate: input.canInitiate,
    refunds: input.refunds.map(serializeAdminRefund),
  };
}

/** Maskeli ödeme yöntemi etiketi (müşteri + admin). Ham PAN/secret ASLA. */
export function maskPaymentMethodLabel(attempt: {
  method: PaymentMethodType;
  cardBrand: string | null;
  cardLast4: string | null;
  manualMethod: PaymentManualMethod | null;
} | null): string | null {
  if (!attempt) return null;
  if (attempt.method === "CARD") {
    const brand = attempt.cardBrand ?? "Kart";
    return attempt.cardLast4 ? `${brand} •••• ${attempt.cardLast4}` : brand;
  }
  if (attempt.method === "BANK_TRANSFER" || attempt.manualMethod === "BANK_TRANSFER") return "Banka havalesi";
  if (attempt.method === "CASH_ON_DELIVERY") return "Kapıda ödeme";
  if (attempt.method === "PAYMENT_LINK") return "Ödeme bağlantısı";
  return null;
}

interface CustomerRefundInput {
  currency: string;
  expectedTotalMinor: number;
  refunds: Array<{
    status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
    totalRefundMinor: number;
    completedAt: Date | null;
    requestedAt: Date;
  }>;
  methodLabel: string | null;
}

/**
 * Müşteri-görünür refund özeti (MASKELİ; teknik kod YOK). NONE = henüz refund başlatılmadı. FAILED yalnız
 * hiç başarılı/aktif refund yokken ve son deneme başarısızsa gösterilir (müşteriye "başarısız" honest).
 */
export function buildCustomerRefundSummary(input: CustomerRefundInput): CustomerRefundSummary {
  const succeeded = input.refunds.filter((r) => r.status === "SUCCEEDED");
  const realized = succeeded.reduce((s, r) => s + r.totalRefundMinor, 0);
  const active = input.refunds.filter((r) => r.status === "PENDING" || r.status === "PROCESSING");
  let status: CustomerRefundSummary["status"];
  let completedAt: string | null = null;
  if (realized >= input.expectedTotalMinor && succeeded.length > 0) {
    status = "SUCCEEDED";
    const last = succeeded.reduce((a, b) => ((a.completedAt?.getTime() ?? 0) >= (b.completedAt?.getTime() ?? 0) ? a : b));
    completedAt = last.completedAt?.toISOString() ?? null;
  } else if (active.length > 0) {
    status = active.some((r) => r.status === "PROCESSING") ? "PROCESSING" : "PENDING";
  } else if (realized > 0) {
    // Kısmi başarılı ama beklenen tamamlanmadı → hâlâ işleniyor gibi göster (dürüst; eksik kalan var).
    status = "PROCESSING";
  } else {
    const failed = input.refunds.filter((r) => r.status === "FAILED");
    status = failed.length > 0 ? "FAILED" : "NONE";
  }
  return {
    status,
    currency: input.currency,
    refundedTotalMinor: realized,
    expectedTotalMinor: input.expectedTotalMinor,
    methodLabel: input.methodLabel,
    completedAt,
  };
}
