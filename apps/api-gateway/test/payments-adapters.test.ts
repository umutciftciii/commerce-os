import { describe, expect, it } from "vitest";
import { getPaymentAdapter } from "../src/payments/adapters/registry.js";
import type { PaymentHttpTransport } from "../src/payments/adapters/http.js";
import { PaymentConfigError, type PaymentActionContext } from "../src/payments/types.js";

function context(overrides: Partial<PaymentActionContext> = {}): PaymentActionContext {
  return {
    provider: "MOCK",
    mode: "TEST",
    threeDsMode: "DISABLED",
    method: "CARD",
    amount: 12990,
    currency: "TRY",
    credentials: { apiKey: null, secretKey: null, webhookSecret: null, merchantId: null },
    ...overrides,
  };
}

/** Test transport: HTTP acik; sabit bir provider yaniti dondurur (ag yok). */
function stubTransport(response: { status: number; body: string }): PaymentHttpTransport {
  return { enabled: true, async send() { return response; } };
}

describe("mock payment adapter", () => {
  const adapter = getPaymentAdapter("MOCK");

  it("maps each scenario to the expected attempt status", async () => {
    const ctx = context();
    expect((await adapter.confirmPayment({ context: ctx, attemptId: "a", currentStatus: "CREATED", scenario: "success" })).status).toBe("PAID");
    expect((await adapter.confirmPayment({ context: ctx, attemptId: "a", currentStatus: "CREATED", scenario: "failure" })).status).toBe("FAILED");
    expect((await adapter.confirmPayment({ context: ctx, attemptId: "a", currentStatus: "CREATED", scenario: "insufficient_funds" })).failureCode).toBe("INSUFFICIENT_FUNDS");
    expect((await adapter.confirmPayment({ context: ctx, attemptId: "a", currentStatus: "CREATED", scenario: "cancelled" })).status).toBe("CANCELLED");
  });

  it("requires a second confirm to complete 3D Secure", async () => {
    const ctx = context();
    const first = await adapter.confirmPayment({ context: ctx, attemptId: "a", currentStatus: "CREATED", scenario: "three_ds_required" });
    expect(first.status).toBe("REQUIRES_ACTION");
    expect(first.threeDsApplied).toBe(true);
    const second = await adapter.confirmPayment({ context: ctx, attemptId: "a", currentStatus: "REQUIRES_ACTION", scenario: "three_ds_required", threeDsOutcome: "success" });
    expect(second.status).toBe("PAID");
    expect(second.threeDsApplied).toBe(true);
  });

  it("fails 3D Secure when the verification step is rejected (no fake success)", async () => {
    const ctx = context();
    const first = await adapter.confirmPayment({ context: ctx, attemptId: "a", currentStatus: "CREATED", scenario: "three_ds_required" });
    expect(first.status).toBe("REQUIRES_ACTION");
    const failed = await adapter.confirmPayment({ context: ctx, attemptId: "a", currentStatus: "REQUIRES_ACTION", scenario: "three_ds_required", threeDsOutcome: "fail" });
    expect(failed.status).toBe("FAILED");
    expect(failed.failureCode).toBe("THREE_DS_FAILED");
    expect(failed.threeDsApplied).toBe(true);
  });

  it("reports a healthy test connection without credentials", async () => {
    const result = await adapter.testConnection({ context: { provider: "MOCK", mode: "TEST", credentials: context().credentials } });
    expect(result.ok).toBe(true);
  });
});

describe("provider-ready adapters (iyzico/Stripe/PayTR) — HTTP gated off this phase", () => {
  const iyzicoCreds = { apiKey: "sandbox-apikey-0123456789", secretKey: "sandbox-secret-0123456789", webhookSecret: null, merchantId: null };
  const stripeCreds = { apiKey: null, secretKey: "sk_test_abc123DEF456", webhookSecret: null, merchantId: null };
  const paytrCreds = { apiKey: "merchant_key_x", secretKey: "merchant_salt_y", webhookSecret: null, merchantId: "123456" };

  it("rejects payment operations with MISSING_CREDENTIALS when creds are absent", async () => {
    const adapter = getPaymentAdapter("IYZICO");
    await expect(
      adapter.createPayment({ context: context({ provider: "IYZICO" }), orderId: "o", attemptId: "a" }),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIALS" });
  });

  it("rejects invalid credential format with CREDENTIALS_INVALID_FORMAT", async () => {
    const adapter = getPaymentAdapter("STRIPE");
    await expect(
      adapter.createPayment({
        context: context({ provider: "STRIPE", credentials: { apiKey: null, secretKey: "not-a-stripe-key", webhookSecret: null, merchantId: null } }),
        orderId: "o",
        attemptId: "a",
      }),
    ).rejects.toMatchObject({ code: "CREDENTIALS_INVALID_FORMAT" });
  });

  it("builds the request but blocks live calls with SANDBOX_HTTP_DISABLED when transport is off", async () => {
    const adapter = getPaymentAdapter("IYZICO"); // default disabled transport
    await expect(
      adapter.createPayment({ context: context({ provider: "IYZICO", credentials: iyzicoCreds }), orderId: "o", attemptId: "a" }),
    ).rejects.toMatchObject({ code: "SANDBOX_HTTP_DISABLED" });
  });

  it("testConnection distinguishes missing / invalid / sandbox-disabled states", async () => {
    const adapter = getPaymentAdapter("STRIPE");
    expect((await adapter.testConnection({ context: { provider: "STRIPE", mode: "TEST", credentials: context().credentials } })).ok).toBe(false);
    expect(
      (await adapter.testConnection({ context: { provider: "STRIPE", mode: "TEST", credentials: { apiKey: null, secretKey: "bad", webhookSecret: null, merchantId: null } } })).message,
    ).toContain("format");
    const ready = await adapter.testConnection({ context: { provider: "STRIPE", mode: "TEST", credentials: stripeCreds } });
    expect(ready.ok).toBe(true);
    expect(ready.message.toLowerCase()).toContain("sandbox");
  });

  it("maps a real provider response to PAID when the (test) transport is enabled — Stripe succeeded", async () => {
    const transport = stubTransport({ status: 200, body: JSON.stringify({ id: "pi_123", status: "succeeded" }) });
    const adapter = getPaymentAdapter("STRIPE", transport);
    const result = await adapter.createPayment({ context: context({ provider: "STRIPE", credentials: stripeCreds }), orderId: "o", attemptId: "a" });
    expect(result).toMatchObject({ status: "PAID", providerReference: "pi_123" });
  });

  it("maps iyzico checkout-form initialize (success) to REQUIRES_ACTION with a token reference", async () => {
    const transport = stubTransport({ status: 200, body: JSON.stringify({ status: "success", token: "tok_abc" }) });
    const adapter = getPaymentAdapter("IYZICO", transport);
    const result = await adapter.createPayment({ context: context({ provider: "IYZICO", credentials: iyzicoCreds }), orderId: "o", attemptId: "a" });
    expect(result).toMatchObject({ status: "REQUIRES_ACTION", providerReference: "tok_abc", threeDsApplied: true });
  });

  it("maps PayTR get-token (success) to REQUIRES_ACTION and webhook success to PAID", async () => {
    const transport = stubTransport({ status: 200, body: JSON.stringify({ status: "success", token: "paytr_tok" }) });
    const adapter = getPaymentAdapter("PAYTR", transport);
    const created = await adapter.createPayment({ context: context({ provider: "PAYTR", credentials: paytrCreds }), orderId: "o", attemptId: "a" });
    expect(created.status).toBe("REQUIRES_ACTION");
    const webhook = await adapter.handleWebhook({
      provider: "PAYTR",
      credentials: paytrCreds,
      signature: null,
      rawBody: "",
      payload: { merchant_oid: "a", status: "success" },
    });
    expect(webhook).toMatchObject({ handled: true, eventId: "a" });
  });

  it("throws typed PaymentConfigError instances", async () => {
    const adapter = getPaymentAdapter("STRIPE");
    await expect(
      adapter.refundPayment({ context: context({ provider: "STRIPE" }), attemptId: "a" }),
    ).rejects.toBeInstanceOf(PaymentConfigError);
  });
});
