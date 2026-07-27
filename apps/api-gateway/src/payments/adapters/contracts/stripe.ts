import type { PaymentAttemptStatus } from "@prisma/client";
import type { PaymentHttpRequest, PaymentHttpResponse } from "../http.js";
import type { ResolvedCredentials, PaymentResult } from "../../types.js";
import {
  asRecord,
  safeJsonParse,
  type CredentialState,
  type ProviderContract,
} from "../provider-contract.js";

/**
 * F3B.2 — Stripe provider contract (PaymentIntents; canli HTTP bu fazda kapali).
 *
 * Create: `POST /v1/payment_intents` (application/x-www-form-urlencoded). Auth:
 * `Authorization: Bearer <secretKey>` (sk_test_… sandbox / sk_live_…). Status:
 * intent.status → ortak PaymentAttemptStatus. providerReference = PaymentIntent id (pi_…).
 * Webhook: event.id (evt_…) + event.type → status; imza Stripe-Signature (placeholder).
 */

const SANDBOX_BASE_URL = "https://api.stripe.com";

function mapStatus(raw: string): PaymentAttemptStatus {
  switch (raw) {
    case "succeeded":
      return "PAID";
    case "requires_capture":
      return "AUTHORIZED";
    case "requires_action":
    case "requires_confirmation":
    case "requires_payment_method":
      return "REQUIRES_ACTION";
    case "processing":
      return "PENDING";
    case "canceled":
      return "CANCELLED";
    default:
      return "FAILED";
  }
}

function formEncode(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export const stripeContract: ProviderContract = {
  provider: "STRIPE",
  sandboxBaseUrl: SANDBOX_BASE_URL,

  validateCredentials(credentials: ResolvedCredentials): CredentialState {
    if (!credentials.secretKey) return "MISSING";
    if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(credentials.secretKey)) return "INVALID_FORMAT";
    return "OK";
  },

  buildCreatePaymentRequest(input, baseUrl): PaymentHttpRequest {
    const body = formEncode({
      amount: String(input.context.amount),
      currency: input.context.currency.toLowerCase(),
      "automatic_payment_methods[enabled]": "true",
      "metadata[attemptId]": input.attemptId,
      "metadata[orderId]": input.orderId,
    });
    return {
      method: "POST",
      url: `${baseUrl}/v1/payment_intents`,
      headers: {
        authorization: `Bearer ${input.context.credentials.secretKey ?? ""}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    };
  },

  buildStatusRequest(input, baseUrl): PaymentHttpRequest {
    return {
      method: "GET",
      url: `${baseUrl}/v1/payment_intents/${encodeURIComponent(input.attemptId)}`,
      headers: { authorization: `Bearer ${input.context.credentials.secretKey ?? ""}` },
    };
  },

  buildCancelRequest(input, baseUrl): PaymentHttpRequest {
    return {
      method: "POST",
      url: `${baseUrl}/v1/payment_intents/${encodeURIComponent(input.attemptId)}/cancel`,
      headers: { authorization: `Bearer ${input.context.credentials.secretKey ?? ""}` },
    };
  },

  buildRefundRequest(input, baseUrl): PaymentHttpRequest {
    const body = formEncode({
      payment_intent: input.attemptId,
      ...(input.amount ? { amount: String(input.amount) } : {}),
    });
    return {
      method: "POST",
      url: `${baseUrl}/v1/refunds`,
      headers: {
        authorization: `Bearer ${input.context.credentials.secretKey ?? ""}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    };
  },

  parsePaymentResponse(response: PaymentHttpResponse): PaymentResult {
    const data = safeJsonParse(response.body);
    const error = asRecord(data.error);
    if (response.status >= 400 || Object.keys(error).length > 0) {
      return {
        status: "FAILED",
        providerReference: typeof data.id === "string" ? data.id : null,
        failureCode: typeof error.code === "string" ? error.code : "STRIPE_ERROR",
        failureMessage: typeof error.message === "string" ? error.message : null,
      };
    }
    const status = typeof data.status === "string" ? data.status : "";
    const mapped = mapStatus(status);
    return {
      status: mapped,
      providerReference: typeof data.id === "string" ? data.id : null,
      threeDsApplied: mapped === "REQUIRES_ACTION",
    };
  },

  mapProviderStatus: mapStatus,
  // PB-1 — Webhook doğrulama/parse contract'tan KALDIRILDI (bypass `return true` idi).
  // Doğrulanmış webhook artık payments/webhook-signature.ts + webhook-routes.ts'de (HMAC).
  // Sağlayıcı-native imza (Stripe-Signature) EX-1 canlı sözleşmesiyle eklenir → TD-137.
};
