import type {
  CancelPaymentInput,
  ConfirmPaymentInput,
  CreatePaymentInput,
  GetPaymentStatusInput,
  HandleWebhookInput,
  PaymentProviderAdapter,
  PaymentResult,
  RefundPaymentInput,
  TestConnectionResult,
  WebhookResult,
} from "../types.js";

/**
 * F3B.2 — MOCK provider adapter (TAM CALISIR).
 *
 * Gercek odeme almaz; checkout sonrasi test odeme sayfasindaki senaryolari
 * deterministik olarak simule eder. Credential gerektirmez.
 *
 * Senaryo → sonuc:
 *   success            → PAID
 *   failure            → FAILED (PAYMENT_DECLINED)
 *   insufficient_funds → FAILED (INSUFFICIENT_FUNDS)
 *   cancelled          → CANCELLED
 *   three_ds_required  → REQUIRES_ACTION (ikinci confirm 'success' ile PAID olur)
 */
export class MockPaymentAdapter implements PaymentProviderAdapter {
  readonly provider = "MOCK" as const;

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    return {
      status: "CREATED",
      providerReference: `mock_${input.attemptId}`,
    };
  }

  async confirmPayment(input: ConfirmPaymentInput): Promise<PaymentResult> {
    const scenario = input.scenario ?? "success";
    const reference = `mock_${input.attemptId}`;

    // 3D Secure: ilk confirm REQUIRES_ACTION; tekrar (REQUIRES_ACTION iken) PAID.
    if (scenario === "three_ds_required") {
      if (input.currentStatus === "REQUIRES_ACTION") {
        return { status: "PAID", providerReference: reference, threeDsApplied: true };
      }
      return { status: "REQUIRES_ACTION", providerReference: reference, threeDsApplied: true };
    }

    switch (scenario) {
      case "success":
        return { status: "PAID", providerReference: reference };
      case "insufficient_funds":
        return {
          status: "FAILED",
          providerReference: reference,
          failureCode: "INSUFFICIENT_FUNDS",
          failureMessage: "Yetersiz bakiye (test senaryosu).",
        };
      case "cancelled":
        return {
          status: "CANCELLED",
          providerReference: reference,
          failureCode: "PAYMENT_CANCELLED",
          failureMessage: "Odeme iptal edildi (test senaryosu).",
        };
      case "failure":
      default:
        return {
          status: "FAILED",
          providerReference: reference,
          failureCode: "PAYMENT_DECLINED",
          failureMessage: "Odeme reddedildi (test senaryosu).",
        };
    }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<PaymentResult> {
    return {
      status: "CANCELLED",
      providerReference: `mock_${input.attemptId}`,
      failureCode: "PAYMENT_CANCELLED",
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<PaymentResult> {
    return { status: "REFUNDED", providerReference: `mock_${input.attemptId}` };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<PaymentResult> {
    return { status: input.currentStatus, providerReference: `mock_${input.attemptId}` };
  }

  async handleWebhook(input: HandleWebhookInput): Promise<WebhookResult> {
    const eventId =
      input.payload && typeof input.payload === "object" && "eventId" in input.payload
        ? String((input.payload as Record<string, unknown>).eventId)
        : null;
    // Mock webhook: imza dogrulamasi her zaman gecerli kabul edilir (test).
    return { handled: true, eventId, signatureValid: true };
  }

  async testConnection(): Promise<TestConnectionResult> {
    return { ok: true, message: "Mock saglayici hazir (test modu, credential gerekmez)." };
  }
}
