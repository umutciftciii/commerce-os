import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  PaymentAttemptStatus,
  PaymentProviderStatus,
  PaymentProviderType,
  PaymentStatus,
} from "@prisma/client";
import { resolveOrderPaymentTransition } from "./payment-state.js";
import {
  PAYMENT_WEBHOOK_SIGNATURE_HEADER,
  PAYMENT_WEBHOOK_TIMESTAMP_HEADER,
  hashPaymentWebhookPayload,
  mapWebhookPayloadStatus,
  parsePaymentWebhookOccurredAt,
  parsePaymentWebhookPayload,
  verifyPaymentWebhookSignature,
} from "./webhook-signature.js";

/**
 * PB-1 (ADR-156/157/158) — Provider-authenticated payment webhook.
 *
 * `POST /public/payments/webhooks/:webhookToken`
 *  - Kullanıcı auth YOK. Kimlik = webhookToken (config çözümleme); YETKİ = HMAC imza.
 *  - Client body ASLA otorite değildir: storeId token'dan, attempt/order DOĞRULANMIŞ
 *    provider reference'tan çözülür; status doğrulanmış payload'dan gelir.
 *  - Fail-closed: bilinmeyen/DISABLED/secret'siz config → generic 404; imza yok/yanlış → 401.
 *  - Amount/currency invariant + monotonik geçiş + idempotency (store, provider, eventId).
 */

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

const webhookParamSchema = z.object({ webhookToken: z.string().min(1).max(120) });

export interface PaymentWebhookConfigRecord {
  id: string;
  storeId: string;
  provider: PaymentProviderType;
  status: PaymentProviderStatus;
  webhookSecretCipher: string | null;
}

export interface PaymentWebhookAttemptRecord {
  id: string;
  storeId: string;
  orderId: string;
  provider: PaymentProviderType | null;
  amount: number;
  currency: string;
  status: PaymentAttemptStatus;
  threeDsApplied: boolean;
  providerReference: string | null;
}

export interface PaymentWebhookAuditInput {
  storeId: string;
  providerConfigId: string | null;
  attemptId: string | null;
  orderId: string | null;
  provider: PaymentProviderType;
  eventId: string | null;
  message: string;
  metadata: Record<string, unknown>;
}

export interface PaymentWebhookApplyInput {
  storeId: string;
  providerConfigId: string | null;
  attemptId: string;
  orderId: string;
  provider: PaymentProviderType;
  attemptStatus: PaymentAttemptStatus;
  providerReference: string;
  eventId: string;
  occurredAt: Date | null;
  threeDsApplied: boolean;
}

export type PaymentWebhookApplyOutcome = "applied" | "no_transition" | "duplicate";

/**
 * Persistence sınırı (server.ts prisma ile bağlar). `applyOutcome` TEK transaction'da:
 *  (1) idempotency guard (store,provider,eventId unique) → duplicate,
 *  (2) MONOTONIC geçiş (kilit-altı taze order status), (3) attempt + order + event yazımı.
 */
export interface PaymentWebhookPersistence {
  findConfigByWebhookToken(token: string): Promise<PaymentWebhookConfigRecord | null>;
  findAttemptByProviderReference(
    storeId: string,
    providerReference: string,
  ): Promise<PaymentWebhookAttemptRecord | null>;
  isEventProcessed(storeId: string, provider: PaymentProviderType, eventId: string): Promise<boolean>;
  recordAuditEvent(input: PaymentWebhookAuditInput): Promise<void>;
  applyOutcome(input: PaymentWebhookApplyInput): Promise<PaymentWebhookApplyOutcome>;
}

export interface PaymentWebhookRoutesDeps {
  persistence: PaymentWebhookPersistence;
  /** webhookSecretCipher → plain secret; çözülemezse fırlatır (route 500'e çevirir). */
  decryptWebhookSecret(cipher: string): string;
  now?: () => Date;
}

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

export function registerPaymentWebhookRoutes(app: FastifyInstance, deps: PaymentWebhookRoutesDeps): void {
  const now = deps.now ?? (() => new Date());

  void app.register(async (scope) => {
    // İmza RAW BODY üzerinden doğrulanır; JSON parse imza SONRASI elle yapılır.
    scope.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
      done(null, body);
    });

    scope.post("/public/payments/webhooks/:webhookToken", async (request, reply) => {
      const params = webhookParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(404).send(errorBody("WEBHOOK_NOT_FOUND", "Webhook bulunamadı."));
      }

      const cfg = await deps.persistence.findConfigByWebhookToken(params.data.webhookToken);
      // Bilinmeyen token, DISABLED config ve secret'siz config AYNI generic 404'ü alır
      // (fail-closed; tenant/config varlığı sızdırılmaz).
      if (!cfg || cfg.status !== "ENABLED" || !cfg.webhookSecretCipher) {
        return reply.code(404).send(errorBody("WEBHOOK_NOT_FOUND", "Webhook bulunamadı."));
      }

      let secret: string;
      try {
        secret = deps.decryptWebhookSecret(cfg.webhookSecretCipher);
      } catch (error) {
        request.log.error(
          { providerConfigId: cfg.id },
          "payment webhook secret çözülemedi",
        );
        void error;
        return reply.code(500).send(errorBody("CONFIG_MISSING", "Webhook yapılandırması çözümlenemedi."));
      }

      const rawBody = typeof request.body === "string" ? request.body : "";
      const signatureResult = verifyPaymentWebhookSignature({
        secret,
        rawBody,
        signature: request.headers[PAYMENT_WEBHOOK_SIGNATURE_HEADER] as string | undefined,
        timestamp: request.headers[PAYMENT_WEBHOOK_TIMESTAMP_HEADER] as string | undefined,
        nowMs: now().getTime(),
      });
      if (!signatureResult.ok) {
        // Geçersiz imzalı istekler DB'ye YAZILMAZ (inbox flood/DoS önlemi); yalnız log.
        request.log.warn(
          { code: signatureResult.code, providerConfigId: cfg.id },
          "payment webhook imza doğrulaması başarısız",
        );
        return reply.code(401).send(errorBody(signatureResult.code, "Webhook imzası doğrulanamadı."));
      }

      // İmza geçerli — gövde artık güvenilir secret sahibinden. Geçersiz/sözleşme-dışı
      // payload CRASH ETMEZ ve order DEĞİŞTİRMEZ (200 ack; sağlayıcı sonsuz retry'ı önlenir).
      const payload = parsePaymentWebhookPayload(rawBody);
      if (!payload) {
        request.log.warn({ providerConfigId: cfg.id }, "payment webhook payload sözleşme dışı");
        return reply.code(200).send({ received: true, handled: false, code: "INVALID_PAYLOAD" });
      }

      // Idempotency: aynı (store, provider, eventId) daha önce işlendiyse no-op ack.
      const alreadyProcessed = await deps.persistence.isEventProcessed(
        cfg.storeId,
        cfg.provider,
        payload.eventId,
      );
      if (alreadyProcessed) {
        return reply.code(200).send({ received: true, handled: true, duplicate: true });
      }

      // Attempt/order DOĞRULANMIŞ provider reference'tan (client body DEĞİL) + store token'dan.
      const attempt = await deps.persistence.findAttemptByProviderReference(
        cfg.storeId,
        payload.providerReference,
      );
      if (!attempt || attempt.provider !== cfg.provider) {
        // Bilinmeyen reference: order DEĞİŞMEZ, tenant enumeration sızdırmaz; güvenli audit + ack.
        await deps.persistence.recordAuditEvent({
          storeId: cfg.storeId,
          providerConfigId: cfg.id,
          attemptId: null,
          orderId: null,
          provider: cfg.provider,
          eventId: payload.eventId,
          message: "Webhook reference not found.",
          metadata: {
            result: "WEBHOOK_REFERENCE_NOT_FOUND",
            payloadHash: hashPaymentWebhookPayload(rawBody),
          },
        });
        return reply
          .code(200)
          .send({ received: true, handled: false, code: "WEBHOOK_REFERENCE_NOT_FOUND" });
      }

      // Amount/currency invariant — doğrulanmış payload dahi attempt snapshot'ıyla eşleşmeli.
      const amountMatches = payload.amountMinor === attempt.amount;
      const currencyMatches = normalizeCurrency(payload.currency) === normalizeCurrency(attempt.currency);
      if (!amountMatches || !currencyMatches) {
        const mismatch = !amountMatches ? "AMOUNT_MISMATCH" : "CURRENCY_MISMATCH";
        // Order PAID OLMAZ; yalnız güvenli audit (idempotency için eventId ile).
        await deps.persistence.recordAuditEvent({
          storeId: cfg.storeId,
          providerConfigId: cfg.id,
          attemptId: attempt.id,
          orderId: attempt.orderId,
          provider: cfg.provider,
          eventId: payload.eventId,
          message: `Webhook rejected: ${mismatch}.`,
          metadata: {
            result: mismatch,
            expectedAmountMinor: attempt.amount,
            receivedAmountMinor: payload.amountMinor,
            expectedCurrency: normalizeCurrency(attempt.currency),
            receivedCurrency: normalizeCurrency(payload.currency),
          },
        });
        return reply.code(200).send({ received: true, handled: false, code: mismatch });
      }

      const outcome = await deps.persistence.applyOutcome({
        storeId: cfg.storeId,
        providerConfigId: cfg.id,
        attemptId: attempt.id,
        orderId: attempt.orderId,
        provider: cfg.provider,
        attemptStatus: mapWebhookPayloadStatus(payload.status),
        providerReference: payload.providerReference,
        eventId: payload.eventId,
        occurredAt: parsePaymentWebhookOccurredAt(payload.occurredAt ?? null),
        threeDsApplied: attempt.threeDsApplied,
      });

      return reply.code(200).send({
        received: true,
        handled: outcome !== "no_transition",
        duplicate: outcome === "duplicate",
        applied: outcome === "applied",
      });
    });
  });
}

/**
 * PB-1 — SAF monotonik geçiş çözümü (persistence transaction'ında kullanılır). `current`
 * order status + doğrulanmış attempt status → uygulanacak yeni order status (ya da null).
 * Mevcut ödeme durum makinesini (payment-state.ts) yeniden kullanır.
 */
export function resolveWebhookOrderTransition(
  currentOrderStatus: PaymentStatus,
  attemptStatus: PaymentAttemptStatus,
): PaymentStatus | null {
  return resolveOrderPaymentTransition(currentOrderStatus, attemptStatus);
}
