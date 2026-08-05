/**
 * TODO-170 (ADR-272) — Refund provider PORT (adapter contract).
 *
 * Ödeme adapter'ından (payments/types.ts PaymentProviderAdapter) AYRI, refund'a özgü dar sözleşme.
 * Yalnız capability PROVIDER_AUTOMATIC çözülen attempt'ler için çağrılır (bu fazda gerçekte yalnız MOCK).
 * Gerçek online provider'lar (Stripe/iyzico/PayTR/generic) bu fazda MANUAL_OFFLINE'a yönlendirilir →
 * port ASLA sahte başarı üretmez; desteklenmeyeni açıkça reddeder.
 */
import type { PaymentProviderType } from "@prisma/client";

export type RefundOutcome = "SUCCEEDED" | "PROCESSING" | "FAILED" | "UNKNOWN";

export interface RefundExecutionResult {
  outcome: RefundOutcome;
  providerRefundId?: string | null;
  providerReference?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}

export interface CreateRefundPortInput {
  provider: PaymentProviderType;
  paymentAttemptId: string;
  /** Orijinal ödeme sağlayıcı referansı (provider transaction id). */
  providerReference: string | null;
  amountMinor: number;
  currency: string;
  /** Server-üretimi idempotency (aynı key → aynı providerRefundId; duplicate retry güvenliği). */
  idempotencyKey: string;
  /** MOCK-only deterministik senaryo kontrolü (attempt.scenario'dan; gerçek provider'da yok sayılır). */
  scenario?: string | null;
}

export interface GetRefundStatusPortInput {
  provider: PaymentProviderType;
  paymentAttemptId: string;
  providerRefundId: string | null;
  idempotencyKey: string;
  scenario?: string | null;
}

export interface RefundProviderPort {
  createRefund(input: CreateRefundPortInput): Promise<RefundExecutionResult>;
  getRefundStatus(input: GetRefundStatusPortInput): Promise<RefundExecutionResult>;
}

/**
 * Provider timeout / bilinmeyen sonuç. Kör retry YASAK — çağıran önce getRefundStatus ile reconcile eder,
 * unknown durumu açıkça gösterir (spec §7).
 */
export class RefundProviderTimeoutError extends Error {
  constructor(message = "Refund provider timeout (sonuç bilinmiyor).") {
    super(message);
    this.name = "RefundProviderTimeoutError";
  }
}

/** Provider ham hatasını güvenli, müşteriye sızmayan koda normalize eder (secret/PII loglanmaz). */
export function normalizeRefundError(err: unknown): { failureCode: string; failureMessage: string } {
  if (err instanceof RefundProviderTimeoutError) {
    return { failureCode: "REFUND_TIMEOUT", failureMessage: err.message };
  }
  if (err instanceof Error) {
    return { failureCode: "REFUND_PROVIDER_ERROR", failureMessage: err.message.slice(0, 300) };
  }
  return { failureCode: "REFUND_PROVIDER_ERROR", failureMessage: "Bilinmeyen sağlayıcı hatası." };
}
