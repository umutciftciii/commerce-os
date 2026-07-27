import { describe, expect, it } from "vitest";
import {
  PAYMENT_WEBHOOK_TOLERANCE_SECONDS,
  computePaymentWebhookEventKey,
  computePaymentWebhookSignature,
  parsePaymentWebhookPayload,
  verifyPaymentWebhookSignature,
} from "../src/payments/webhook-signature.js";

/**
 * PB-1 (ADR-157) — SAF webhook imza + payload doğrulama birim testleri. HMAC şeması
 * shipping webhook (TODO-104) ile aynıdır; hiçbir "her imza geçerli" bypass yoktur.
 */
const SECRET = "a".repeat(64);
const NOW_MS = 1_700_000_000_000; // sabit (determinizm)
const TS = String(Math.floor(NOW_MS / 1000));

function sign(rawBody: string, timestamp = TS, secret = SECRET): string {
  return computePaymentWebhookSignature(secret, timestamp, rawBody);
}

describe("PB-1 payment webhook signature", () => {
  const rawBody = JSON.stringify({ eventId: "evt_1", providerReference: "pi_1", status: "PAID" });

  it("accepts a correct HMAC over timestamp.rawBody", () => {
    const result = verifyPaymentWebhookSignature({
      secret: SECRET,
      rawBody,
      signature: sign(rawBody),
      timestamp: TS,
      nowMs: NOW_MS,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a missing signature", () => {
    const result = verifyPaymentWebhookSignature({ secret: SECRET, rawBody, signature: null, timestamp: TS, nowMs: NOW_MS });
    expect(result).toEqual({ ok: false, code: "SIGNATURE_MISSING" });
  });

  it("rejects a wrong signature", () => {
    const result = verifyPaymentWebhookSignature({
      secret: SECRET,
      rawBody,
      signature: "deadbeef".repeat(8),
      timestamp: TS,
      nowMs: NOW_MS,
    });
    expect(result).toEqual({ ok: false, code: "SIGNATURE_INVALID" });
  });

  it("rejects a tampered body (signature no longer matches)", () => {
    const signature = sign(rawBody);
    const tampered = JSON.stringify({ eventId: "evt_1", providerReference: "pi_1", status: "PAID", amountMinor: 999 });
    const result = verifyPaymentWebhookSignature({ secret: SECRET, rawBody: tampered, signature, timestamp: TS, nowMs: NOW_MS });
    expect(result).toEqual({ ok: false, code: "SIGNATURE_INVALID" });
  });

  it("rejects a stale timestamp (replay window)", () => {
    const oldTs = String(Math.floor(NOW_MS / 1000) - PAYMENT_WEBHOOK_TOLERANCE_SECONDS - 60);
    const result = verifyPaymentWebhookSignature({
      secret: SECRET,
      rawBody,
      signature: sign(rawBody, oldTs),
      timestamp: oldTs,
      nowMs: NOW_MS,
    });
    expect(result).toEqual({ ok: false, code: "TIMESTAMP_OUT_OF_RANGE" });
  });

  it("rejects a missing timestamp", () => {
    const result = verifyPaymentWebhookSignature({ secret: SECRET, rawBody, signature: sign(rawBody), timestamp: null, nowMs: NOW_MS });
    expect(result).toEqual({ ok: false, code: "TIMESTAMP_MISSING" });
  });

  it("fails closed when the secret is empty", () => {
    const result = verifyPaymentWebhookSignature({ secret: "", rawBody, signature: sign(rawBody, TS, ""), timestamp: TS, nowMs: NOW_MS });
    expect(result).toEqual({ ok: false, code: "SIGNATURE_INVALID" });
  });

  it("verification is secret-specific (a different secret's signature fails)", () => {
    const result = verifyPaymentWebhookSignature({
      secret: SECRET,
      rawBody,
      signature: sign(rawBody, TS, "b".repeat(64)),
      timestamp: TS,
      nowMs: NOW_MS,
    });
    expect(result).toEqual({ ok: false, code: "SIGNATURE_INVALID" });
  });
});

describe("PB-1 payment webhook payload parsing", () => {
  it("parses a valid platform payload", () => {
    const payload = parsePaymentWebhookPayload(
      JSON.stringify({ eventId: "e1", providerReference: "pi_1", status: "PAID", amountMinor: 12990, currency: "TRY" }),
    );
    expect(payload).toMatchObject({ eventId: "e1", providerReference: "pi_1", status: "PAID", amountMinor: 12990, currency: "TRY" });
  });

  it("rejects an unknown status", () => {
    expect(
      parsePaymentWebhookPayload(
        JSON.stringify({ eventId: "e1", providerReference: "pi_1", status: "HACKED", amountMinor: 1, currency: "TRY" }),
      ),
    ).toBeNull();
  });

  it("rejects extra/unknown keys (strict) and missing fields", () => {
    expect(
      parsePaymentWebhookPayload(
        JSON.stringify({ eventId: "e1", providerReference: "pi_1", status: "PAID", amountMinor: 1, currency: "TRY", storeId: "s_evil" }),
      ),
    ).toBeNull();
    expect(parsePaymentWebhookPayload(JSON.stringify({ eventId: "e1" }))).toBeNull();
  });

  it("does not crash on malformed JSON", () => {
    expect(parsePaymentWebhookPayload("{not-json")).toBeNull();
    expect(parsePaymentWebhookPayload("")).toBeNull();
  });

  it("event key prefers eventId, falls back to payload hash", () => {
    expect(computePaymentWebhookEventKey("evt_9", "x")).toBe("evt_9");
    expect(computePaymentWebhookEventKey(null, "x")).toMatch(/^sha256:/);
  });
});
