/**
 * TODO-104 (ADR-048) — Public shipping webhook ucu.
 *
 * POST /public/shipping/webhooks/:webhookToken
 *
 * Guvenlik:
 *  - Kullanici auth YOK; her istekte HMAC-SHA256 imza + timestamp ZORUNLU
 *    (bkz. webhook.ts). Gecersiz/eksik imza → 401, DB'ye HICBIR sey yazilmaz.
 *  - webhookToken yalniz provider config COZUMLEME kimligidir; token bilinse bile
 *    imzasiz istek islenmez. Bilinmeyen token → generic 404 (var/yok sizdirilmaz).
 *  - Store/tenant cozumlemesi config uzerinden yapilir; shipment aramasi
 *    {storeId, providerConfigId} scoped'tur → cross-store mutasyon IMKANSIZ.
 *  - Idempotency/replay: (providerConfigId, eventKey) unique inbox kaydi tek
 *    transaction'da event isleme ile atomiktir; duplicate teslimat yeni
 *    ShipmentEvent uretmez. Timestamp toleransi disindaki istekler reddedilir.
 *  - Bilinmeyen saglayici durumu shipment durumunu DEGISTIRMEZ (mevcut normalize
 *    esleme + regresyon korumasi); eslesen gonderi yoksa audit'li IGNORED kaydi.
 *  - Yanit minimal ACK'tir; ic alan/secret/raw payload donmez.
 */
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "@commerce-os/config";
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type {
  ShipmentStatus,
  ShipmentWebhookOutcome,
  ShippingProviderStatus,
  ShippingProviderType,
} from "@prisma/client";
import { shippingWebhookAckResponseSchema, shippingWebhookEventRequestSchema } from "@commerce-os/contracts";
import { z } from "zod";
import { createShippingSecretCipher } from "./encryption.js";
import { ShippingConfigError } from "./errors.js";
import { mapProviderStatusToShipmentStatus } from "./routes.js";
import {
  SHIPPING_WEBHOOK_SIGNATURE_HEADER,
  SHIPPING_WEBHOOK_TIMESTAMP_HEADER,
  computeShippingWebhookEventKey,
  hashShippingWebhookPayload,
  parseWebhookOccurredAt,
  verifyShippingWebhookSignature,
} from "./webhook.js";

const webhookParamSchema = z.object({ webhookToken: z.string().min(8).max(200) });

export interface WebhookProviderConfigRecord {
  id: string;
  storeId: string;
  provider: ShippingProviderType;
  status: ShippingProviderStatus;
  webhookSecretCipher: string | null;
}

export interface WebhookShipmentRecord {
  id: string;
  storeId: string;
  provider: ShippingProviderType;
  status: ShipmentStatus;
  shipmentStatusCode: number | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
}

export interface WebhookDeliveryApplyInput {
  shipmentId: string;
  nextStatus: ShipmentStatus;
  statusCode: number | null;
  statusText: string | null;
  location: string | null;
  occurredAt: Date | null;
  trackingUrl: string | null;
  trackingNumber: string | null;
}

export interface WebhookDeliveryInput {
  storeId: string;
  providerConfigId: string;
  provider: ShippingProviderType;
  eventKey: string;
  payloadHash: string;
  outcome: ShipmentWebhookOutcome;
  statusCode: number | null;
  statusText: string | null;
  /** ACCEPTED ise shipment guncelleme + WEBHOOK_RECEIVED event ile ATOMIK yazilir. */
  apply: WebhookDeliveryApplyInput | null;
}

export interface ShippingWebhookPersistence {
  findConfigByWebhookToken(token: string): Promise<WebhookProviderConfigRecord | null>;
  /** {storeId, providerConfigId} scoped arama — cross-store eslesme imkansiz. */
  findShipment(
    storeId: string,
    providerConfigId: string,
    ids: { referenceId?: string; trackingNumber?: string; externalShipmentId?: string },
  ): Promise<WebhookShipmentRecord | null>;
  /** Inbox insert (+ apply) tek transaction; unique ihlali → "duplicate". */
  recordDelivery(input: WebhookDeliveryInput): Promise<"created" | "duplicate">;
}

export interface ShippingWebhookRoutesDeps {
  config: Pick<AppConfig, "SHIPPING_ENCRYPTION_KEY">;
  persistence: ShippingWebhookPersistence;
  now?: () => Date;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export function registerShippingWebhookRoutes(
  app: FastifyInstance,
  deps: ShippingWebhookRoutesDeps,
): void {
  const now = deps.now ?? (() => new Date());

  // Scoped plugin: imza RAW BODY uzerinden dogrulanir; JSON parse imza SONRASI
  // elle yapilir (re-serialize edilmis govde imzalanmaz).
  void app.register(async (scope) => {
    scope.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
      done(null, body);
    });

    scope.post("/public/shipping/webhooks/:webhookToken", async (request, reply) => {
      const params = webhookParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(404).send(errorBody("WEBHOOK_NOT_FOUND", "Webhook bulunamadı."));
      }

      const cfg = await deps.persistence.findConfigByWebhookToken(params.data.webhookToken);
      // Bilinmeyen token, DISABLED config ve secret'siz config ayni generic 404'u alir.
      if (!cfg || cfg.status !== "ENABLED" || !cfg.webhookSecretCipher) {
        return reply.code(404).send(errorBody("WEBHOOK_NOT_FOUND", "Webhook bulunamadı."));
      }

      let secret: string;
      try {
        secret = createShippingSecretCipher(deps.config.SHIPPING_ENCRYPTION_KEY).decrypt(
          cfg.webhookSecretCipher,
        );
      } catch (error) {
        if (error instanceof ShippingConfigError) {
          request.log.error({ code: error.code }, "shipping webhook secret cozulemedi");
          return reply
            .code(500)
            .send(errorBody("CONFIG_MISSING", "Webhook yapılandırması çözümlenemedi."));
        }
        throw error;
      }

      const rawBody = typeof request.body === "string" ? request.body : "";
      const signatureResult = verifyShippingWebhookSignature({
        secret,
        rawBody,
        signature: request.headers[SHIPPING_WEBHOOK_SIGNATURE_HEADER] as string | undefined,
        timestamp: request.headers[SHIPPING_WEBHOOK_TIMESTAMP_HEADER] as string | undefined,
        nowMs: now().getTime(),
      });
      if (!signatureResult.ok) {
        // Gecersiz imzali istekler DB'ye YAZILMAZ (inbox flood/DoS onlemi); yalniz log.
        request.log.warn(
          { code: signatureResult.code, providerConfigId: cfg.id },
          "shipping webhook imza dogrulamasi basarisiz",
        );
        return reply
          .code(401)
          .send(errorBody(signatureResult.code, "Webhook imzası doğrulanamadı."));
      }

      // Imza gecerli — govde artik guvenilir kaynaktan. Parse edilemeyen/sozlesme disi
      // payload CRASH ETMEZ: audit'li IGNORED_UNSUPPORTED inbox kaydi + ack doner
      // (saglayicinin sonsuz retry'ini tetiklememek icin 200).
      const payloadHash = hashShippingWebhookPayload(rawBody);
      let parsedJson: unknown = null;
      let jsonValid = true;
      try {
        parsedJson = rawBody.length > 0 ? JSON.parse(rawBody) : null;
      } catch {
        jsonValid = false;
      }
      const parsed = jsonValid
        ? shippingWebhookEventRequestSchema.safeParse(parsedJson)
        : ({ success: false } as const);

      const baseDelivery = {
        storeId: cfg.storeId,
        providerConfigId: cfg.id,
        provider: cfg.provider,
        payloadHash,
      };

      if (!parsed.success) {
        const outcome = await deps.persistence.recordDelivery({
          ...baseDelivery,
          eventKey: computeShippingWebhookEventKey(null, rawBody),
          outcome: "IGNORED_UNSUPPORTED",
          statusCode: null,
          statusText: jsonValid ? "Sözleşme dışı payload" : "Geçersiz JSON",
          apply: null,
        });
        return reply.send(
          shippingWebhookAckResponseSchema.parse({
            ok: true,
            duplicate: outcome === "duplicate",
            handled: false,
          }),
        );
      }

      const event = parsed.data;
      const eventKey = computeShippingWebhookEventKey(event.eventId ?? null, rawBody);
      const hasIdentifier = Boolean(
        event.referenceId || event.trackingNumber || event.externalShipmentId,
      );
      const shipment = hasIdentifier
        ? await deps.persistence.findShipment(cfg.storeId, cfg.id, {
            referenceId: event.referenceId,
            trackingNumber: event.trackingNumber,
            externalShipmentId: event.externalShipmentId,
          })
        : null;

      if (!shipment) {
        const outcome = await deps.persistence.recordDelivery({
          ...baseDelivery,
          eventKey,
          outcome: hasIdentifier ? "IGNORED_UNKNOWN_SHIPMENT" : "IGNORED_UNSUPPORTED",
          statusCode: event.statusCode ?? null,
          statusText: event.statusText ?? null,
          apply: null,
        });
        return reply.send(
          shippingWebhookAckResponseSchema.parse({
            ok: true,
            duplicate: outcome === "duplicate",
            handled: false,
          }),
        );
      }

      // Bilinmeyen statusCode mevcut durumu KORUR; terminal durumdan geri donulmez,
      // regres edilmez (mevcut normalize esleme yeniden kullanilir).
      const nextStatus = mapProviderStatusToShipmentStatus(
        { statusCode: event.statusCode ?? null, isDelivered: event.isDelivered === true },
        shipment.status,
      );

      const outcome = await deps.persistence.recordDelivery({
        ...baseDelivery,
        eventKey,
        outcome: "ACCEPTED",
        statusCode: event.statusCode ?? null,
        statusText: event.statusText ?? null,
        apply: {
          shipmentId: shipment.id,
          nextStatus,
          statusCode: event.statusCode ?? null,
          statusText: event.statusText ?? null,
          location: event.location ?? null,
          occurredAt: parseWebhookOccurredAt(event.occurredAt),
          trackingUrl: event.trackingUrl ?? null,
          trackingNumber: event.trackingNumber ?? null,
        },
      });

      return reply.send(
        shippingWebhookAckResponseSchema.parse({
          ok: true,
          duplicate: outcome === "duplicate",
          handled: outcome === "created",
        }),
      );
    });
  });
}

/* ───────────── Prisma persistence (runtime wiring) ───────────── */

export function createPrismaShippingWebhookPersistence(): ShippingWebhookPersistence {
  return {
    async findConfigByWebhookToken(token) {
      return prisma.shippingProviderConfig.findUnique({
        where: { webhookToken: token },
        select: {
          id: true,
          storeId: true,
          provider: true,
          status: true,
          webhookSecretCipher: true,
        },
      });
    },

    async findShipment(storeId, providerConfigId, ids) {
      const identifierFilters: Prisma.ShipmentWhereInput[] = [];
      if (ids.referenceId) identifierFilters.push({ referenceId: ids.referenceId });
      if (ids.trackingNumber) identifierFilters.push({ trackingNumber: ids.trackingNumber });
      if (ids.externalShipmentId) {
        identifierFilters.push({ externalShipmentId: ids.externalShipmentId });
      }
      if (identifierFilters.length === 0) return null;
      return prisma.shipment.findFirst({
        where: { storeId, providerConfigId, OR: identifierFilters },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          storeId: true,
          provider: true,
          status: true,
          shipmentStatusCode: true,
          trackingNumber: true,
          trackingUrl: true,
        },
      });
    },

    async recordDelivery(input) {
      try {
        await prisma.$transaction(async (tx) => {
          // Unique (providerConfigId, eventKey) — duplicate teslimat burada durur;
          // shipment guncelleme + event yazimi ATOMIK olarak ayni transaction'dadir.
          await tx.shipmentWebhookInbox.create({
            data: {
              storeId: input.storeId,
              providerConfigId: input.providerConfigId,
              provider: input.provider,
              eventKey: input.eventKey,
              payloadHash: input.payloadHash,
              outcome: input.outcome,
              shipmentId: input.apply?.shipmentId ?? null,
              statusCode: input.statusCode,
              statusText: input.statusText,
            },
          });
          if (input.apply) {
            const current = await tx.shipment.findUniqueOrThrow({
              where: { id: input.apply.shipmentId },
              select: {
                shipmentStatusCode: true,
                trackingNumber: true,
                trackingUrl: true,
                provider: true,
              },
            });
            await tx.shipment.update({
              where: { id: input.apply.shipmentId },
              data: {
                status: input.apply.nextStatus,
                shipmentStatusCode: input.apply.statusCode ?? current.shipmentStatusCode,
                trackingUrl: input.apply.trackingUrl ?? current.trackingUrl,
                trackingNumber: current.trackingNumber ?? input.apply.trackingNumber,
              },
            });
            // rawSafeJson yalniz sanitize ozet tasir; imza/secret/raw govde YAZILMAZ.
            await tx.shipmentEvent.create({
              data: {
                storeId: input.storeId,
                shipmentId: input.apply.shipmentId,
                provider: current.provider,
                eventType: "WEBHOOK_RECEIVED",
                statusCode: input.apply.statusCode,
                statusText: input.apply.statusText,
                location: input.apply.location,
                occurredAt: input.apply.occurredAt,
                trackingUrl: input.apply.trackingUrl,
                rawSafeJson: {
                  webhook: true,
                  eventKeyPresent: true,
                  statusCode: input.apply.statusCode,
                  statusText: input.apply.statusText,
                  location: input.apply.location,
                },
              },
            });
          }
        });
        return "created";
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return "duplicate";
        }
        throw error;
      }
    },
  };
}
