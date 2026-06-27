import { randomBytes } from "node:crypto";
import type { PaymentAttemptStatus } from "@prisma/client";
import type { PaymentHttpRequest, PaymentHttpResponse } from "../http.js";
import type { ResolvedCredentials, PaymentResult } from "../../types.js";
import {
  asRecord,
  base64,
  hmacSha256Hex,
  minorToDecimalString,
  safeJsonParse,
  type CredentialState,
  type ProviderContract,
} from "../provider-contract.js";

/**
 * F3B.2 — iyzico provider contract (provider-ready mapping; canli HTTP bu fazda kapali).
 *
 * Akis: iyzico **Checkout Form** (`/payment/iyzipos/checkoutform/initialize/auth/ecom`)
 * — sunucu PAN tasimaz (PCI), iyzico bir `token` + `paymentPageUrl` doner; kullanici
 * yonlendirilir (REQUIRES_ACTION). Durum `/payment/iyzipos/checkoutform/auth/ecom/detail`
 * ile `token` uzerinden cekilir. Auth: iyzico **IYZWSv2** (HMAC-SHA256) imzasi.
 *
 * Dokumantasyondan haritalanan alanlar: locale, conversationId, price, paidPrice,
 * currency, basketId, paymentGroup, callbackUrl, enabledInstallments, buyer/address/
 * basketItems (ozet) + paymentStatus → ortak PaymentAttemptStatus.
 */

const SANDBOX_BASE_URL = "https://sandbox-api.iyzipay.com";
const CHECKOUT_INIT_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
const CHECKOUT_DETAIL_PATH = "/payment/iyzipos/checkoutform/auth/ecom/detail";

/** iyzico IYZWSv2 Authorization header'i (HMAC-SHA256). */
function buildAuthorizationHeader(
  apiKey: string,
  secretKey: string,
  uriPath: string,
  requestBody: string,
): { authorization: string; randomKey: string } {
  const randomKey = `${Date.now()}${randomBytes(8).toString("hex")}`;
  // imza = HMAC-SHA256(randomKey + uriPath + requestBody, secretKey)
  const signature = hmacSha256Hex(`${randomKey}${uriPath}${requestBody}`, secretKey);
  const authParams = `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`;
  return { authorization: `IYZWSv2 ${base64(authParams)}`, randomKey };
}

function initializeBody(input: { conversationId: string; amount: number; currency: string; callbackUrl: string }): string {
  const price = minorToDecimalString(input.amount);
  return JSON.stringify({
    locale: "tr",
    conversationId: input.conversationId,
    price,
    paidPrice: price,
    currency: input.currency,
    basketId: input.conversationId,
    paymentGroup: "PRODUCT",
    callbackUrl: input.callbackUrl,
    enabledInstallments: [1],
    // Buyer/adres/sepet ozeti: gercek entegrasyonda order'dan zenginlestirilir.
    buyer: { id: input.conversationId, name: "Commerce", surname: "OS" },
    basketItems: [
      { id: input.conversationId, name: "Order", category1: "General", itemType: "VIRTUAL", price },
    ],
  });
}

/** iyzico paymentStatus / status → ortak PaymentAttemptStatus. */
function mapStatus(raw: string): PaymentAttemptStatus {
  switch (raw.toUpperCase()) {
    case "SUCCESS":
      return "PAID";
    case "INIT_THREEDS":
    case "CALLBACK_THREEDS":
    case "BKM_POS_SELECTED":
    case "INIT_APM":
    case "PENDING_CREDIT":
      return "REQUIRES_ACTION";
    case "INIT_BANK_TRANSFER":
      return "PENDING";
    case "FAILURE":
    case "ERROR":
      return "FAILED";
    default:
      return "PENDING";
  }
}

export const iyzicoContract: ProviderContract = {
  provider: "IYZICO",
  sandboxBaseUrl: SANDBOX_BASE_URL,

  validateCredentials(credentials: ResolvedCredentials): CredentialState {
    if (!credentials.apiKey || !credentials.secretKey) return "MISSING";
    // iyzico anahtarlari tipik olarak "sandbox-" ya da api/secret prefix tasir.
    if (credentials.apiKey.length < 16 || credentials.secretKey.length < 16) return "INVALID_FORMAT";
    return "OK";
  },

  buildCreatePaymentRequest(input, baseUrl): PaymentHttpRequest {
    const body = initializeBody({
      conversationId: input.attemptId,
      amount: input.context.amount,
      currency: input.context.currency,
      callbackUrl: `${SANDBOX_BASE_URL}/callback/${input.attemptId}`,
    });
    const { authorization } = buildAuthorizationHeader(
      input.context.credentials.apiKey ?? "",
      input.context.credentials.secretKey ?? "",
      CHECKOUT_INIT_PATH,
      body,
    );
    return {
      method: "POST",
      url: `${baseUrl}${CHECKOUT_INIT_PATH}`,
      headers: { "content-type": "application/json", authorization },
      body,
    };
  },

  buildStatusRequest(input, baseUrl): PaymentHttpRequest {
    const body = JSON.stringify({ locale: "tr", conversationId: input.attemptId, token: input.attemptId });
    const { authorization } = buildAuthorizationHeader(
      input.context.credentials.apiKey ?? "",
      input.context.credentials.secretKey ?? "",
      CHECKOUT_DETAIL_PATH,
      body,
    );
    return {
      method: "POST",
      url: `${baseUrl}${CHECKOUT_DETAIL_PATH}`,
      headers: { "content-type": "application/json", authorization },
      body,
    };
  },

  parsePaymentResponse(response: PaymentHttpResponse): PaymentResult {
    const data = safeJsonParse(response.body);
    const status = typeof data.status === "string" ? data.status : "";
    // initialize: status "success" + token → kullanici yonlendirilir (REQUIRES_ACTION)
    // detail: paymentStatus alani gercek odeme sonucunu tasir.
    const paymentStatus = typeof data.paymentStatus === "string" ? data.paymentStatus : null;
    const reference =
      (typeof data.token === "string" && data.token) ||
      (typeof data.paymentId === "string" && data.paymentId) ||
      null;

    if (status.toLowerCase() === "failure") {
      return {
        status: "FAILED",
        providerReference: reference,
        failureCode: typeof data.errorCode === "string" ? data.errorCode : "IYZICO_FAILURE",
        failureMessage: typeof data.errorMessage === "string" ? data.errorMessage : null,
      };
    }
    if (paymentStatus) {
      const mapped = mapStatus(paymentStatus);
      return { status: mapped, providerReference: reference, threeDsApplied: mapped === "REQUIRES_ACTION" };
    }
    // initialize basariliysa odeme sayfasina yonlendirme → REQUIRES_ACTION.
    return { status: "REQUIRES_ACTION", providerReference: reference, threeDsApplied: true };
  },

  mapProviderStatus: mapStatus,

  extractWebhookEventId(payload: unknown): string | null {
    const data = asRecord(payload);
    // iyzico callback: token / paymentId / iyziEventId benzeri alanlar.
    return (
      (typeof data.token === "string" && data.token) ||
      (typeof data.paymentId === "string" && data.paymentId) ||
      (typeof data.eventId === "string" && data.eventId) ||
      null
    );
  },

  mapWebhookStatus(payload: unknown): PaymentAttemptStatus | null {
    const data = asRecord(payload);
    const raw = typeof data.status === "string" ? data.status : typeof data.paymentStatus === "string" ? data.paymentStatus : null;
    return raw ? mapStatus(raw) : null;
  },

  verifyWebhookSignature(): boolean {
    // Placeholder: gercek imza dogrulama (iyzico signature) TODO-071.
    return true;
  },
};
