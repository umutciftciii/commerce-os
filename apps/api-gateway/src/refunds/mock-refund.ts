/**
 * TODO-170 (ADR-272) — MOCK refund port implementasyonu + provider port factory.
 *
 * MOCK bu fazda refund'u gerçekten yürüten TEK sağlayıcıdır. Deterministik senaryolar (attempt.scenario
 * konvansiyonundan — MOCK-only; gerçek provider'da yok sayılır) canlı smoke + testte kontrol edilebilir:
 *   refund_failure   → FAILED (REFUND_DECLINED)
 *   refund_timeout   → RefundProviderTimeoutError (sonuç bilinmiyor → UNKNOWN; kör retry YOK)
 *   refund_async     → PROCESSING (createRefund); getRefundStatus → SUCCEEDED (reconciliation)
 *   refund_duplicate → SUCCEEDED, SABİT providerRefundId (duplicate callback/unique testi)
 *   (diğer/success)  → SUCCEEDED (providerRefundId idempotencyKey'den türetilir → retry-güvenli)
 * Gerçek online provider (Stripe/iyzico/PayTR/generic) capability tarafından MANUAL_OFFLINE'a yönlendirilir;
 * bu port ONLARI çağırmaz (çağrılırsa açıkça reddeder — sahte başarı YOK).
 */
import {
  RefundProviderTimeoutError,
  type CreateRefundPortInput,
  type GetRefundStatusPortInput,
  type RefundExecutionResult,
  type RefundProviderPort,
} from "./provider-port.js";

const SCENARIO_FAILURE = "refund_failure";
const SCENARIO_TIMEOUT = "refund_timeout";
const SCENARIO_ASYNC = "refund_async";
const SCENARIO_DUPLICATE = "refund_duplicate";

function mockRefundId(input: { idempotencyKey: string; paymentAttemptId: string; scenario?: string | null }): string {
  if (input.scenario === SCENARIO_DUPLICATE) {
    // Sabit id → aynı attempt'e ikinci refund aynı providerRefundId ile çakışır (unique guard testi).
    return `mockrf_dup_${input.paymentAttemptId}`;
  }
  return `mockrf_${input.idempotencyKey}`;
}

export class MockRefundPort implements RefundProviderPort {
  async createRefund(input: CreateRefundPortInput): Promise<RefundExecutionResult> {
    const scenario = input.scenario ?? null;
    const providerRefundId = mockRefundId(input);
    const providerReference = `mockrfref_${input.idempotencyKey}`;
    switch (scenario) {
      case SCENARIO_FAILURE:
        return {
          outcome: "FAILED",
          providerReference,
          failureCode: "REFUND_DECLINED",
          failureMessage: "İade reddedildi (test senaryosu).",
        };
      case SCENARIO_TIMEOUT:
        throw new RefundProviderTimeoutError();
      case SCENARIO_ASYNC:
        return { outcome: "PROCESSING", providerRefundId, providerReference };
      default:
        return { outcome: "SUCCEEDED", providerRefundId, providerReference };
    }
  }

  async getRefundStatus(input: GetRefundStatusPortInput): Promise<RefundExecutionResult> {
    // Async senaryo reconciliation'da tamamlanır; diğerleri mevcut providerRefundId ile SUCCEEDED.
    const providerRefundId = input.providerRefundId ?? mockRefundId(input);
    if (input.scenario === SCENARIO_FAILURE) {
      return { outcome: "FAILED", failureCode: "REFUND_DECLINED", failureMessage: "İade reddedildi (test senaryosu)." };
    }
    return { outcome: "SUCCEEDED", providerRefundId, providerReference: `mockrfref_${input.idempotencyKey}` };
  }
}

/**
 * Provider port dispatcher. Bu fazda yalnız MOCK yürütülür; başka bir provider'a otomatik refund çağrısı
 * capability katmanı tarafından ENGELLENİR (MANUAL_OFFLINE'a düşürülür) — buraya düşerse açık hata (sahte
 * başarı üretmez).
 */
export function createRefundProviderPort(): RefundProviderPort {
  const mock = new MockRefundPort();
  const unsupported = (provider: string): never => {
    throw new Error(`Otomatik refund desteklenmiyor: ${provider} (MANUAL_OFFLINE bekleniyordu).`);
  };
  return {
    createRefund: (input) => (input.provider === "MOCK" ? mock.createRefund(input) : unsupported(input.provider)),
    getRefundStatus: (input) =>
      input.provider === "MOCK" ? mock.getRefundStatus(input) : unsupported(input.provider),
  };
}
