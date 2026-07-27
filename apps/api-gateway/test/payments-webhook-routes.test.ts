import Fastify, { type FastifyInstance } from "fastify";
import type { PaymentProviderStatus, PaymentProviderType, PaymentStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  registerPaymentWebhookRoutes,
  resolveWebhookOrderTransition,
  type PaymentWebhookApplyInput,
  type PaymentWebhookAttemptRecord,
  type PaymentWebhookAuditInput,
  type PaymentWebhookConfigRecord,
  type PaymentWebhookPersistence,
} from "../src/payments/webhook-routes.js";
import {
  PAYMENT_WEBHOOK_SIGNATURE_HEADER,
  PAYMENT_WEBHOOK_TIMESTAMP_HEADER,
  computePaymentWebhookSignature,
} from "../src/payments/webhook-signature.js";

/**
 * PB-1 (ADR-156/158) — Doğrulanmış payment webhook route testleri. Sahte persistence ile
 * tüm exploit/fail-closed senaryoları: client body ASLA otorite değildir.
 */
const NOW_MS = 1_700_000_000_000;
const TS = String(Math.floor(NOW_MS / 1000));
const SECRET = "s".repeat(64);

interface AttemptState extends PaymentWebhookAttemptRecord {
  storeId: string;
}

class FakePersistence implements PaymentWebhookPersistence {
  configs = new Map<string, PaymentWebhookConfigRecord>();
  attempts: AttemptState[] = [];
  orders = new Map<string, PaymentStatus>();
  processed = new Set<string>();
  audits: PaymentWebhookAuditInput[] = [];

  addConfig(token: string, cfg: Partial<PaymentWebhookConfigRecord> = {}): void {
    this.configs.set(token, {
      id: cfg.id ?? "cfg_1",
      storeId: cfg.storeId ?? "store_a",
      provider: cfg.provider ?? "STRIPE",
      status: cfg.status ?? "ENABLED",
      webhookSecretCipher: "webhookSecretCipher" in cfg ? (cfg.webhookSecretCipher ?? null) : SECRET,
    });
  }

  addAttemptAndOrder(input: {
    storeId?: string;
    providerReference: string;
    provider?: PaymentProviderType;
    amount?: number;
    currency?: string;
    orderStatus?: PaymentStatus;
    orderId?: string;
  }): void {
    const orderId = input.orderId ?? `order_${input.providerReference}`;
    this.attempts.push({
      id: `att_${input.providerReference}`,
      storeId: input.storeId ?? "store_a",
      orderId,
      provider: input.provider ?? "STRIPE",
      amount: input.amount ?? 12990,
      currency: input.currency ?? "TRY",
      status: "PENDING",
      threeDsApplied: false,
      providerReference: input.providerReference,
    });
    this.orders.set(orderId, input.orderStatus ?? "PAYMENT_PENDING");
  }

  findConfigByWebhookToken(token: string): Promise<PaymentWebhookConfigRecord | null> {
    return Promise.resolve(this.configs.get(token) ?? null);
  }

  findAttemptByProviderReference(storeId: string, providerReference: string): Promise<PaymentWebhookAttemptRecord | null> {
    return Promise.resolve(
      this.attempts.find((a) => a.storeId === storeId && a.providerReference === providerReference) ?? null,
    );
  }

  isEventProcessed(storeId: string, provider: PaymentProviderType, eventId: string): Promise<boolean> {
    return Promise.resolve(this.processed.has(`${storeId}:${provider}:${eventId}`));
  }

  recordAuditEvent(input: PaymentWebhookAuditInput): Promise<void> {
    this.audits.push(input);
    return Promise.resolve();
  }

  applyOutcome(input: PaymentWebhookApplyInput): Promise<"applied" | "no_transition" | "duplicate"> {
    const key = `${input.storeId}:${input.provider}:${input.eventId}`;
    if (this.processed.has(key)) return Promise.resolve("duplicate");
    this.processed.add(key);
    const current = this.orders.get(input.orderId);
    if (!current) return Promise.resolve("no_transition");
    const next = resolveWebhookOrderTransition(current, input.attemptStatus);
    if (next === null) return Promise.resolve("no_transition");
    this.orders.set(input.orderId, next);
    const attempt = this.attempts.find((a) => a.id === input.attemptId);
    if (attempt) attempt.status = input.attemptStatus;
    return Promise.resolve("applied");
  }
}

function sign(rawBody: string, timestamp = TS, secret = SECRET): string {
  return computePaymentWebhookSignature(secret, timestamp, rawBody);
}

function body(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

let app: FastifyInstance;
let fake: FakePersistence;

async function post(token: string, rawBody: string, opts: { signature?: string | null; timestamp?: string | null; sign?: boolean } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const timestamp = opts.timestamp === undefined ? TS : opts.timestamp;
  if (timestamp !== null) headers[PAYMENT_WEBHOOK_TIMESTAMP_HEADER] = timestamp;
  const signature = opts.signature !== undefined ? opts.signature : opts.sign === false ? null : sign(rawBody, timestamp ?? TS);
  if (signature !== null) headers[PAYMENT_WEBHOOK_SIGNATURE_HEADER] = signature;
  return app.inject({ method: "POST", url: `/public/payments/webhooks/${token}`, headers, payload: rawBody });
}

const paidBody = (over: Record<string, unknown> = {}) =>
  body({ eventId: "evt_1", providerReference: "pi_1", status: "PAID", amountMinor: 12990, currency: "TRY", ...over });

beforeEach(async () => {
  fake = new FakePersistence();
  app = Fastify();
  registerPaymentWebhookRoutes(app, {
    persistence: fake,
    decryptWebhookSecret: (cipher) => cipher, // fake stores plain secret
    now: () => new Date(NOW_MS),
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("PB-1 payment webhook route — fail-closed resolution", () => {
  it("unknown token → 404 (no info leak)", async () => {
    const res = await post("whk_unknown", paidBody());
    expect(res.statusCode).toBe(404);
  });

  it("DISABLED config → 404", async () => {
    fake.addConfig("whk_1", { status: "DISABLED" as PaymentProviderStatus });
    const res = await post("whk_1", paidBody());
    expect(res.statusCode).toBe(404);
  });

  it("config without webhook secret → 404 (fail-closed)", async () => {
    fake.addConfig("whk_1", { webhookSecretCipher: null });
    const res = await post("whk_1", paidBody());
    expect(res.statusCode).toBe(404);
  });

  it("missing signature → 401", async () => {
    fake.addConfig("whk_1");
    fake.addAttemptAndOrder({ providerReference: "pi_1" });
    const res = await post("whk_1", paidBody(), { sign: false });
    expect(res.statusCode).toBe(401);
    expect(fake.orders.get("order_pi_1")).toBe("PAYMENT_PENDING");
  });

  it("wrong signature → 401, order unchanged", async () => {
    fake.addConfig("whk_1");
    fake.addAttemptAndOrder({ providerReference: "pi_1" });
    const res = await post("whk_1", paidBody(), { signature: "aa".repeat(32) });
    expect(res.statusCode).toBe(401);
    expect(fake.orders.get("order_pi_1")).toBe("PAYMENT_PENDING");
  });

  it("stale timestamp → 401", async () => {
    fake.addConfig("whk_1");
    fake.addAttemptAndOrder({ providerReference: "pi_1" });
    const oldTs = String(Math.floor(NOW_MS / 1000) - 4000);
    const res = await post("whk_1", paidBody(), { timestamp: oldTs, signature: sign(paidBody(), oldTs) });
    expect(res.statusCode).toBe(401);
  });

  it("tampered body (signature over different bytes) → 401", async () => {
    fake.addConfig("whk_1");
    fake.addAttemptAndOrder({ providerReference: "pi_1" });
    const goodSig = sign(paidBody());
    const res = await post("whk_1", paidBody({ amountMinor: 1 }), { signature: goodSig });
    expect(res.statusCode).toBe(401);
    expect(fake.orders.get("order_pi_1")).toBe("PAYMENT_PENDING");
  });
});

describe("PB-1 payment webhook route — verified resolution & invariants", () => {
  it("valid signature but malformed/legacy payload → 200 handled:false, order unchanged", async () => {
    fake.addConfig("whk_1");
    fake.addAttemptAndOrder({ providerReference: "pi_1" });
    // Eski exploit gövdesi (storeId/attemptId/status) strict schema'yı GEÇEMEZ.
    const legacy = body({ storeId: "store_a", attemptId: "att_pi_1", status: "PAID", eventId: "evt_1" });
    const res = await post("whk_1", legacy);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ handled: false, code: "INVALID_PAYLOAD" });
    expect(fake.orders.get("order_pi_1")).toBe("PAYMENT_PENDING");
  });

  it("unknown provider reference → 200 ack, order unchanged, safe audit", async () => {
    fake.addConfig("whk_1");
    // attempt yok
    const res = await post("whk_1", paidBody({ providerReference: "pi_ghost" }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ handled: false, code: "WEBHOOK_REFERENCE_NOT_FOUND" });
    expect(fake.audits.at(-1)?.metadata.result).toBe("WEBHOOK_REFERENCE_NOT_FOUND");
  });

  it("cross-store: attempt in another store is not resolvable → reference not found", async () => {
    fake.addConfig("whk_1", { storeId: "store_a" });
    fake.addAttemptAndOrder({ storeId: "store_b", providerReference: "pi_1" });
    const res = await post("whk_1", paidBody());
    expect(res.json().code).toBe("WEBHOOK_REFERENCE_NOT_FOUND");
    expect(fake.orders.get("order_pi_1")).toBe("PAYMENT_PENDING");
  });

  it("provider mismatch (attempt provider != config provider) → reference not found", async () => {
    fake.addConfig("whk_1", { provider: "STRIPE" });
    fake.addAttemptAndOrder({ providerReference: "pi_1", provider: "PAYTR" });
    const res = await post("whk_1", paidBody());
    expect(res.json().code).toBe("WEBHOOK_REFERENCE_NOT_FOUND");
  });

  it("amount mismatch → 200 rejected, order NOT paid", async () => {
    fake.addConfig("whk_1");
    fake.addAttemptAndOrder({ providerReference: "pi_1", amount: 12990 });
    const res = await post("whk_1", paidBody({ amountMinor: 100 }));
    expect(res.json()).toMatchObject({ handled: false, code: "AMOUNT_MISMATCH" });
    expect(fake.orders.get("order_pi_1")).toBe("PAYMENT_PENDING");
  });

  it("currency mismatch → 200 rejected, order NOT paid", async () => {
    fake.addConfig("whk_1");
    fake.addAttemptAndOrder({ providerReference: "pi_1", currency: "TRY" });
    const res = await post("whk_1", paidBody({ currency: "USD" }));
    expect(res.json()).toMatchObject({ handled: false, code: "CURRENCY_MISMATCH" });
    expect(fake.orders.get("order_pi_1")).toBe("PAYMENT_PENDING");
  });

  it("valid verified PAID → order becomes PAID", async () => {
    fake.addConfig("whk_1");
    fake.addAttemptAndOrder({ providerReference: "pi_1" });
    const res = await post("whk_1", paidBody());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ applied: true });
    expect(fake.orders.get("order_pi_1")).toBe("PAID");
  });

  it("duplicate event (same eventId) → idempotent, single transition", async () => {
    fake.addConfig("whk_1");
    fake.addAttemptAndOrder({ providerReference: "pi_1" });
    await post("whk_1", paidBody());
    const second = await post("whk_1", paidBody());
    expect(second.json()).toMatchObject({ duplicate: true });
    expect(fake.orders.get("order_pi_1")).toBe("PAID");
  });

  it("out-of-order: late FAILED after PAID does NOT reverse the order", async () => {
    fake.addConfig("whk_1");
    fake.addAttemptAndOrder({ providerReference: "pi_1" });
    await post("whk_1", paidBody());
    const failed = await post("whk_1", paidBody({ eventId: "evt_2", status: "FAILED" }));
    expect(failed.json().applied).toBe(false);
    expect(fake.orders.get("order_pi_1")).toBe("PAID");
  });

  it("parallel duplicate webhooks apply at most one transition", async () => {
    fake.addConfig("whk_1");
    fake.addAttemptAndOrder({ providerReference: "pi_1" });
    const raw = paidBody();
    const [a, b] = await Promise.all([post("whk_1", raw), post("whk_1", raw)]);
    const outcomes = [a.json(), b.json()];
    const appliedCount = outcomes.filter((o) => o.applied).length;
    const duplicateCount = outcomes.filter((o) => o.duplicate).length;
    expect(appliedCount).toBe(1);
    expect(duplicateCount).toBe(1);
    expect(fake.orders.get("order_pi_1")).toBe("PAID");
  });
});
