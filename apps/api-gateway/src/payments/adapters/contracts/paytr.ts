import type { PaymentAttemptStatus } from "@prisma/client";
import type { PaymentHttpRequest, PaymentHttpResponse } from "../http.js";
import type { ResolvedCredentials, PaymentResult } from "../../types.js";
import {
  asRecord,
  hmacSha256Base64,
  safeJsonParse,
  type CredentialState,
  type ProviderContract,
} from "../provider-contract.js";

/**
 * F3B.2 — PayTR provider contract (iFrame API get-token; canli HTTP bu fazda kapali).
 *
 * Credential eslemesi: merchantId = merchant_id, apiKey = merchant_key, secretKey =
 * merchant_salt. Create: `POST /odeme/api/get-token` (form). paytr_token = base64(
 * HMAC-SHA256(merchant_id + user_ip + merchant_oid + email + payment_amount +
 * payment_type + installment_count + currency + test_mode + merchant_salt, merchant_key)).
 * Yanit status "success" + token → iFrame'e yonlendirme (REQUIRES_ACTION). Callback:
 * merchant_oid + status (success/failed) + total_amount + hash.
 */

const SANDBOX_BASE_URL = "https://www.paytr.com";
const GET_TOKEN_PATH = "/odeme/api/get-token";

function formEncode(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export const paytrContract: ProviderContract = {
  provider: "PAYTR",
  sandboxBaseUrl: SANDBOX_BASE_URL,

  validateCredentials(credentials: ResolvedCredentials): CredentialState {
    // merchant_id (merchantId) + merchant_key (apiKey) + merchant_salt (secretKey).
    if (!credentials.merchantId || !credentials.apiKey || !credentials.secretKey) return "MISSING";
    if (!/^\d{4,}$/.test(credentials.merchantId)) return "INVALID_FORMAT";
    return "OK";
  },

  buildCreatePaymentRequest(input, baseUrl): PaymentHttpRequest {
    const merchantId = input.context.credentials.merchantId ?? "";
    const merchantKey = input.context.credentials.apiKey ?? "";
    const merchantSalt = input.context.credentials.secretKey ?? "";
    const userIp = "127.0.0.1";
    const merchantOid = input.attemptId;
    const email = "buyer@example.local";
    const paymentAmount = String(input.context.amount); // kurus (minor)
    const paymentType = "card";
    const installmentCount = "0";
    const currency = input.context.currency;
    const testMode = "1";
    // paytr_token: PayTR dokumantasyonundaki hash sirasi.
    const hashStr = `${merchantId}${userIp}${merchantOid}${email}${paymentAmount}${paymentType}${installmentCount}${currency}${testMode}${merchantSalt}`;
    const paytrToken = hmacSha256Base64(hashStr, merchantKey);
    const body = formEncode({
      merchant_id: merchantId,
      user_ip: userIp,
      merchant_oid: merchantOid,
      email,
      payment_amount: paymentAmount,
      payment_type: paymentType,
      installment_count: installmentCount,
      currency,
      test_mode: testMode,
      paytr_token: paytrToken,
    });
    return {
      method: "POST",
      url: `${baseUrl}${GET_TOKEN_PATH}`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    };
  },

  parsePaymentResponse(response: PaymentHttpResponse): PaymentResult {
    const data = safeJsonParse(response.body);
    const status = typeof data.status === "string" ? data.status : "";
    if (status === "success") {
      // token alindi → iFrame odeme sayfasina yonlendirme.
      return {
        status: "REQUIRES_ACTION",
        providerReference: typeof data.token === "string" ? data.token : null,
        threeDsApplied: true,
      };
    }
    return {
      status: "FAILED",
      providerReference: null,
      failureCode: "PAYTR_TOKEN_FAILED",
      failureMessage: typeof data.reason === "string" ? data.reason : null,
    };
  },

  mapProviderStatus(raw: string): PaymentAttemptStatus {
    return raw === "success" ? "PAID" : raw === "failed" ? "FAILED" : "PENDING";
  },

  extractWebhookEventId(payload: unknown): string | null {
    const data = asRecord(payload);
    return typeof data.merchant_oid === "string" ? data.merchant_oid : null;
  },

  mapWebhookStatus(payload: unknown): PaymentAttemptStatus | null {
    const data = asRecord(payload);
    const raw = typeof data.status === "string" ? data.status : null;
    if (raw === "success") return "PAID";
    if (raw === "failed") return "FAILED";
    return null;
  },

  verifyWebhookSignature(): boolean {
    // Placeholder: gercek PayTR callback hash dogrulamasi TODO-071.
    return true;
  },
};
