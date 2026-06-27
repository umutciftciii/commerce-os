import { createHmac } from "node:crypto";
import type { PaymentAttemptStatus } from "@prisma/client";
import type { PaymentHttpRequest, PaymentHttpResponse } from "./http.js";
import type {
  CancelPaymentInput,
  ConfirmPaymentInput,
  CreatePaymentInput,
  GetPaymentStatusInput,
  HandleWebhookInput,
  PaymentResult,
  RefundPaymentInput,
  ResolvedCredentials,
} from "../types.js";

/**
 * F3B.2 — Provider contract: provider-specific request builder + response parser +
 * status mapping + credential validation. Adapter (provider-adapter.ts) bu contract'i
 * + transport'u kullanarak 7 metodu yurutur. Gercek HTTP transport kapaliyken bile
 * request mapping uretilir/test edilir (canli cagri yapilmaz).
 */

export type CredentialState = "OK" | "MISSING" | "INVALID_FORMAT";

export interface ProviderContract {
  provider: "IYZICO" | "STRIPE" | "PAYTR" | "GENERIC_REDIRECT";
  /** Sandbox taban URL (flag acilinca kullanilir). */
  sandboxBaseUrl: string;
  /** Credential varlik + format dogrulamasi (sandbox-ready validation icin). */
  validateCredentials(credentials: ResolvedCredentials): CredentialState;
  buildCreatePaymentRequest(input: CreatePaymentInput, baseUrl: string): PaymentHttpRequest;
  buildConfirmPaymentRequest?(input: ConfirmPaymentInput, baseUrl: string): PaymentHttpRequest;
  buildStatusRequest?(input: GetPaymentStatusInput, baseUrl: string): PaymentHttpRequest;
  buildCancelRequest?(input: CancelPaymentInput, baseUrl: string): PaymentHttpRequest;
  buildRefundRequest?(input: RefundPaymentInput, baseUrl: string): PaymentHttpRequest;
  /** Provider yanitini (HTTP) ortak PaymentResult'a parse eder. */
  parsePaymentResponse(response: PaymentHttpResponse): PaymentResult;
  /** Provider'a ozgu durum kodunu ortak PaymentAttemptStatus'a esler. */
  mapProviderStatus(raw: string): PaymentAttemptStatus;
  /** Webhook payload'indan external event id cikarir (idempotency). */
  extractWebhookEventId(payload: unknown): string | null;
  /** Webhook payload'ini PaymentAttemptStatus'a esler (yoksa null). */
  mapWebhookStatus(payload: unknown): PaymentAttemptStatus | null;
  /** Webhook imza dogrulama. Bu fazda placeholder (gercek HMAC TODO-071). */
  verifyWebhookSignature(input: HandleWebhookInput): boolean;
}

/* ───────────────────────── Ortak yardimcilar ───────────────────────── */

/** Minor (kurus) → provider'in bekledigi ondalik string (ornek 12990 → "129.90"). */
export function minorToDecimalString(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function hmacSha256Hex(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

export function hmacSha256Base64(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64");
}

export function base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

export function safeJsonParse(body: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
