import type { PaymentAttemptStatus } from "@prisma/client";
import type { PaymentHttpRequest, PaymentHttpResponse } from "../http.js";
import type { ResolvedCredentials, PaymentResult } from "../../types.js";
import {
  safeJsonParse,
  type CredentialState,
  type ProviderContract,
} from "../provider-contract.js";

/**
 * F3B.2 — Generic redirect/3D provider contract (banka sanal POS vb. icin sade
 * iskelet; canli HTTP bu fazda kapali). Create → saglayici bir redirect URL doner;
 * kullanici yonlendirilir (REQUIRES_ACTION). Callback/webhook: status + eventId.
 */

const SANDBOX_BASE_URL = "https://sandbox.example-psp.local";

function mapStatus(raw: string): PaymentAttemptStatus {
  switch (raw.toUpperCase()) {
    case "SUCCESS":
    case "PAID":
      return "PAID";
    case "AUTHORIZED":
      return "AUTHORIZED";
    case "PENDING":
    case "REDIRECT":
      return "REQUIRES_ACTION";
    case "CANCELLED":
    case "CANCELED":
      return "CANCELLED";
    default:
      return "FAILED";
  }
}

export const genericRedirectContract: ProviderContract = {
  provider: "GENERIC_REDIRECT",
  sandboxBaseUrl: SANDBOX_BASE_URL,

  validateCredentials(credentials: ResolvedCredentials): CredentialState {
    if (!credentials.apiKey || !credentials.secretKey) return "MISSING";
    return "OK";
  },

  buildCreatePaymentRequest(input, baseUrl): PaymentHttpRequest {
    return {
      method: "POST",
      url: `${baseUrl}/payments`,
      headers: {
        authorization: `Bearer ${input.context.credentials.apiKey ?? ""}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reference: input.attemptId,
        orderId: input.orderId,
        amount: input.context.amount,
        currency: input.context.currency,
        returnUrl: `${baseUrl}/return/${input.attemptId}`,
      }),
    };
  },

  parsePaymentResponse(response: PaymentHttpResponse): PaymentResult {
    const data = safeJsonParse(response.body);
    const status = typeof data.status === "string" ? data.status : "REDIRECT";
    const mapped = mapStatus(status);
    return {
      status: mapped,
      providerReference: typeof data.reference === "string" ? data.reference : null,
      threeDsApplied: mapped === "REQUIRES_ACTION",
      failureCode: mapped === "FAILED" ? (typeof data.code === "string" ? data.code : "PSP_ERROR") : null,
    };
  },

  mapProviderStatus: mapStatus,
  // PB-1 — Webhook doğrulama/parse contract'tan KALDIRILDI (bypass `return true` idi).
  // Doğrulanmış webhook payments/webhook-signature.ts + webhook-routes.ts'de (HMAC). Native
  // PSP imzası EX-1 ile → TD-137.
};
