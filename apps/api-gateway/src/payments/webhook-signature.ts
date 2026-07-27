import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PaymentAttemptStatus } from "@prisma/client";

/**
 * PB-1 (ADR-156/157) — Payment webhook imza dogrulama + doğrulanmış olay parse'ı.
 *
 * Guvenlik modeli (shipping webhook TODO-104/ADR-048 ile AYNI, kanıtlanmış desen):
 *  - Uc kullanici auth GEREKTIRMEZ; kimlik = URL'deki webhookToken (config cozumleme),
 *    YETKI = her istekte HMAC-SHA256 imza. Token tek basina yetki VERMEZ.
 *  - Imza: hex(HMAC_SHA256(secret, `${timestamp}.${rawBody}`)). rawBody BYTE-AYNEN
 *    imzalanir (JSON re-serialize edilmez); route raw string parser kullanir.
 *  - timestamp (unix saniye) zorunlu; tolerans disi istek REDDEDILIR (replay penceresi).
 *    Pencere ICI replay'i inbox unique (storeId, provider, eventId) keser.
 *  - Karsilastirma timingSafeEqual iledir (uzunluk + hex ön-kontrolü).
 *  - Secret PaymentProviderConfig.webhookSecretCipher'dan gelir; secret yoksa fail-closed.
 *
 * NOT (PB-1): Bu faz PLATFORM imza şemasını (yukarıdaki HMAC) kullanır. Gerçek sağlayıcıya
 * özgü native imza (Stripe-Signature vb.) EX-1 (canlı sağlayıcı sözleşmesi) ile eklenir;
 * o zamana dek gerçek sağlayıcılar webhookSecret'sız → fail-closed (işlem YOK).
 */

export const PAYMENT_WEBHOOK_SIGNATURE_HEADER = "x-payment-signature";
export const PAYMENT_WEBHOOK_TIMESTAMP_HEADER = "x-payment-timestamp";
/** Timestamp toleransi (saniye). Disindaki istekler TIMESTAMP_OUT_OF_RANGE ile reddedilir. */
export const PAYMENT_WEBHOOK_TOLERANCE_SECONDS = 300;

export type PaymentWebhookSignatureFailure =
  | "SIGNATURE_MISSING"
  | "SIGNATURE_INVALID"
  | "TIMESTAMP_MISSING"
  | "TIMESTAMP_INVALID"
  | "TIMESTAMP_OUT_OF_RANGE";

export type PaymentWebhookSignatureResult =
  | { ok: true }
  | { ok: false; code: PaymentWebhookSignatureFailure };

export function computePaymentWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export function verifyPaymentWebhookSignature(input: {
  secret: string;
  rawBody: string;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  nowMs: number;
  toleranceSeconds?: number;
}): PaymentWebhookSignatureResult {
  const signature = typeof input.signature === "string" ? input.signature.trim().toLowerCase() : "";
  const timestamp = typeof input.timestamp === "string" ? input.timestamp.trim() : "";
  // Secret yoksa fail-closed (imza bile hesaplanmaz).
  if (input.secret.length === 0) return { ok: false, code: "SIGNATURE_INVALID" };
  if (signature.length === 0) return { ok: false, code: "SIGNATURE_MISSING" };
  if (timestamp.length === 0) return { ok: false, code: "TIMESTAMP_MISSING" };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, code: "TIMESTAMP_INVALID" };
  const tolerance = input.toleranceSeconds ?? PAYMENT_WEBHOOK_TOLERANCE_SECONDS;
  const skewSeconds = Math.abs(input.nowMs / 1000 - Number(timestamp));
  if (skewSeconds > tolerance) return { ok: false, code: "TIMESTAMP_OUT_OF_RANGE" };

  const expected = computePaymentWebhookSignature(input.secret, timestamp, input.rawBody);
  if (!/^[0-9a-f]+$/.test(signature) || signature.length !== expected.length) {
    return { ok: false, code: "SIGNATURE_INVALID" };
  }
  const match = timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
  return match ? { ok: true } : { ok: false, code: "SIGNATURE_INVALID" };
}

/** Idempotency anahtari: doğrulanmış payload eventId varsa o; yoksa rawBody sha256. */
export function computePaymentWebhookEventKey(
  eventId: string | null | undefined,
  rawBody: string,
): string {
  if (eventId && eventId.trim().length > 0) return eventId.trim();
  return `sha256:${hashPaymentWebhookPayload(rawBody)}`;
}

export function hashPaymentWebhookPayload(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

/** URL yol parcasi olan config cozumleme kimligi (yetki vermez; imza ayrica zorunlu). */
export function generatePaymentWebhookToken(): string {
  return `whk_${randomBytes(24).toString("hex")}`;
}

/** Imza secret'i — yalniz rotate yanitinda BIR KEZ plain doner, DB'de sifreli saklanir. */
export function generatePaymentWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

/** occurredAt (ISO/parse edilebilir) → Date; cozulemezse null (crash yok). */
export function parsePaymentWebhookOccurredAt(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/**
 * PLATFORM webhook payload sözleşmesi (imza SONRASI parse edilir). Sağlayıcı geri
 * bildirimini normalize eder. `providerReference` attempt çözümü için OTORİTEDİR;
 * `amountMinor`/`currency` invariant karşılaştırması içindir; `status` monotonik geçişi sürer.
 */
export const paymentWebhookPayloadSchema = z
  .object({
    eventId: z.string().min(1).max(200),
    providerReference: z.string().min(1).max(200),
    status: z.enum(["PENDING", "REQUIRES_ACTION", "AUTHORIZED", "PAID", "FAILED", "CANCELLED", "REFUNDED"]),
    amountMinor: z.number().int().nonnegative(),
    currency: z.string().min(3).max(8),
    occurredAt: z.string().min(1).optional(),
  })
  .strict();

export type PaymentWebhookPayload = z.infer<typeof paymentWebhookPayloadSchema>;

/** Doğrulanmış (imza geçmiş) payload status → PaymentAttemptStatus. */
export function mapWebhookPayloadStatus(status: PaymentWebhookPayload["status"]): PaymentAttemptStatus {
  return status;
}

/** İmza geçmiş ham gövdeyi zod ile parse eder; geçersizse null (crash yok). */
export function parsePaymentWebhookPayload(rawBody: string): PaymentWebhookPayload | null {
  let json: unknown;
  try {
    json = rawBody.length > 0 ? JSON.parse(rawBody) : null;
  } catch {
    return null;
  }
  const parsed = paymentWebhookPayloadSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
