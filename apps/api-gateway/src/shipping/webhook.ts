import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TODO-104 (ADR-048) — Shipping webhook imza dogrulama + idempotency yardimcilari.
 *
 * Guvenlik modeli:
 *  - Uc kullanici auth GEREKTIRMEZ; kimlik = URL'deki webhookToken (config cozumleme),
 *    YETKI = her istekte HMAC-SHA256 imza. Token tek basina yetki VERMEZ.
 *  - Imza: hex(HMAC_SHA256(secret, `${timestamp}.${rawBody}`)). rawBody BYTE-AYNEN
 *    imzalanir (JSON re-serialize edilmez); route raw string parser kullanir.
 *  - timestamp (unix saniye) zorunlu; tolerans disi istek REDDEDILIR (replay penceresi).
 *    Pencere ICI replay'i inbox unique (providerConfigId, eventKey) keser.
 *  - Karsilastirma timingSafeEqual iledir (uzunluk esitligi onceden dogrulanir).
 */

export const SHIPPING_WEBHOOK_SIGNATURE_HEADER = "x-shipping-signature";
export const SHIPPING_WEBHOOK_TIMESTAMP_HEADER = "x-shipping-timestamp";
/** Timestamp toleransi (saniye). Disindaki istekler TIMESTAMP_OUT_OF_RANGE ile reddedilir. */
export const SHIPPING_WEBHOOK_TOLERANCE_SECONDS = 300;

export type ShippingWebhookSignatureFailure =
  | "SIGNATURE_MISSING"
  | "SIGNATURE_INVALID"
  | "TIMESTAMP_MISSING"
  | "TIMESTAMP_INVALID"
  | "TIMESTAMP_OUT_OF_RANGE";

export type ShippingWebhookSignatureResult =
  | { ok: true }
  | { ok: false; code: ShippingWebhookSignatureFailure };

export function computeShippingWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export function verifyShippingWebhookSignature(input: {
  secret: string;
  rawBody: string;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  nowMs: number;
  toleranceSeconds?: number;
}): ShippingWebhookSignatureResult {
  const signature = typeof input.signature === "string" ? input.signature.trim().toLowerCase() : "";
  const timestamp = typeof input.timestamp === "string" ? input.timestamp.trim() : "";
  if (signature.length === 0) return { ok: false, code: "SIGNATURE_MISSING" };
  if (timestamp.length === 0) return { ok: false, code: "TIMESTAMP_MISSING" };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, code: "TIMESTAMP_INVALID" };
  const tolerance = input.toleranceSeconds ?? SHIPPING_WEBHOOK_TOLERANCE_SECONDS;
  const skewSeconds = Math.abs(input.nowMs / 1000 - Number(timestamp));
  if (skewSeconds > tolerance) return { ok: false, code: "TIMESTAMP_OUT_OF_RANGE" };

  const expected = computeShippingWebhookSignature(input.secret, timestamp, input.rawBody);
  // Hex disi karakter/uzunluk farki dogrudan gecersiz — timingSafeEqual esit uzunluk ister.
  if (!/^[0-9a-f]+$/.test(signature) || signature.length !== expected.length) {
    return { ok: false, code: "SIGNATURE_INVALID" };
  }
  const match = timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
  return match ? { ok: true } : { ok: false, code: "SIGNATURE_INVALID" };
}

/** Idempotency anahtari: saglayici eventId varsa o; yoksa payload'in sha256 ozeti. */
export function computeShippingWebhookEventKey(
  eventId: string | null | undefined,
  rawBody: string,
): string {
  if (eventId && eventId.trim().length > 0) return `evt:${eventId.trim()}`;
  return `sha256:${hashShippingWebhookPayload(rawBody)}`;
}

export function hashShippingWebhookPayload(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

/** URL yol parcasi olan config cozumleme kimligi (yetki vermez; imza ayrica zorunlu). */
export function generateShippingWebhookToken(): string {
  return `whk_${randomBytes(24).toString("hex")}`;
}

/** Imza secret'i — yalniz rotate yanitinda BIR KEZ plain doner, DB'de sifreli saklanir. */
export function generateShippingWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

/** occurredAt (ISO/parse edilebilir) → Date; cozulemezse null (crash yok). */
export function parseWebhookOccurredAt(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}
