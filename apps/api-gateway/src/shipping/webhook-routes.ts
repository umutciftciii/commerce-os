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
 *
 * TODO-130 (ADR-055): imza dogrulama SONRASI payload, provider-ozel ham webhook
 * adapter'i (webhook-adapters.ts) ile normalize edilir. PLATFORM sozlesmesi tum
 * saglayicilar icin calismaya devam eder; DHL_ECOMMERCE(=MNG) grounded ham sekilleri
 * cozulur, Geliver ornek payload gelene kadar guvenli IGNORED_UNSUPPORTED kalir.
 * Eslestirme onceligi: externalShipmentId → trackingNumber → referenceId.
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
import { shippingWebhookAckResponseSchema } from "@commerce-os/contracts";
import { z } from "zod";
import { createShippingSecretCipher } from "./encryption.js";
import { ShippingConfigError } from "./errors.js";
import { mapProviderStatusToShipmentStatus } from "./routes.js";
import { parseProviderDate, shipmentTrackingEventKey } from "./status-map.js";
import {
  computeNormalizedWebhookEventKey,
  normalizeShippingWebhookPayload,
  type NormalizedShipmentWebhookEvent,
  type WebhookUnsupportedReason,
} from "./webhook-adapters.js";
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
  /**
   * TODO-130 — Coklu hareketli ham payload'larin (trackshipment-benzeri) EK hareketleri.
   * Route tarafinda dogal anahtarla (shipmentTrackingEventKey) dedupe EDILMIS gelir;
   * her biri ayri WEBHOOK_RECEIVED event'i olarak yazilir. Tekil platform payload'inda bos.
   */
  additionalEvents?: WebhookAdditionalEventInput[];
}

export interface WebhookAdditionalEventInput {
  statusCode: number | null;
  statusText: string | null;
  location: string | null;
  occurredAt: Date | null;
  trackingUrl: string | null;
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
  /**
   * TODO-130 — Gonderinin mevcut timeline dogal anahtarlari (TRACKING_UPDATED +
   * WEBHOOK_RECEIVED; shipmentTrackingEventKey formati). Coklu hareketli ham payload
   * dedupe'u icin OPSIYONEL: tanimsizsa ek hareket dedupe'u atlanmaz, ek hareket YAZILMAZ
   * (guvenli taraf — duplicate event riski sifir).
   */
  listShipmentEventKeys?(shipmentId: string): Promise<string[]>;
}

export interface ShippingWebhookRoutesDeps {
  config: Pick<AppConfig, "SHIPPING_ENCRYPTION_KEY">;
  persistence: ShippingWebhookPersistence;
  now?: () => Date;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

/** TODO-130 — Unsupported nedeninin admin-gorunur SANITIZE ozeti (raw payload tasimaz). */
const UNSUPPORTED_REASON_TEXT: Record<WebhookUnsupportedReason, string> = {
  INVALID_JSON: "Geçersiz JSON",
  UNSUPPORTED_PAYLOAD: "Sözleşme dışı payload",
  AMBIGUOUS_SHIPMENT_IDS: "Payload birden fazla gönderi kimliği taşıyor",
  GELIVER_SAMPLE_REQUIRED: "Geliver ham formatı desteklenmiyor (örnek payload gerekli)",
};

/** Ayni-gonderi eventlerinin kimliklerini birlestirir (ilk non-null kazanir). */
function collectWebhookIdentifiers(events: NormalizedShipmentWebhookEvent[]): {
  referenceId: string | undefined;
  trackingNumber: string | undefined;
  externalShipmentId: string | undefined;
} {
  return {
    referenceId: events.find((e) => e.referenceId)?.referenceId ?? undefined,
    trackingNumber: events.find((e) => e.trackingNumber)?.trackingNumber ?? undefined,
    externalShipmentId: events.find((e) => e.externalShipmentId)?.externalShipmentId ?? undefined,
  };
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
      // TODO-130 (ADR-055) — Provider-ozel ham payload adapter'i: PLATFORM sozlesmesi
      // her saglayici icin oncelikli; DHL_ECOMMERCE(=MNG) icin grounded ham sekiller,
      // Geliver icin ornek gelene kadar guvenli unsupported.
      const normalized = jsonValid
        ? normalizeShippingWebhookPayload(cfg.provider, parsedJson)
        : ({ supported: false, reason: "INVALID_JSON" } as const);

      const baseDelivery = {
        storeId: cfg.storeId,
        providerConfigId: cfg.id,
        provider: cfg.provider,
        payloadHash,
      };

      if (!normalized.supported) {
        const outcome = await deps.persistence.recordDelivery({
          ...baseDelivery,
          eventKey: computeShippingWebhookEventKey(null, rawBody),
          outcome: "IGNORED_UNSUPPORTED",
          statusCode: null,
          statusText: UNSUPPORTED_REASON_TEXT[normalized.reason],
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

      const events = normalized.events;
      // Kronolojik son hareket ozet/primary event'tir (payload'lar eski→yeni gelir;
      // durum ilerletme fold'u siradan BAGIMSIZDIR — rank regresyonu engeller).
      const primary = events[events.length - 1]!;
      // PLATFORM yolu mevcut idempotency anahtarini AYNEN korur (evt:<id> / sha256:<rawBody>);
      // ham sekiller volatil alan icermeyen normalize deterministik anahtar kullanir.
      const eventKey =
        normalized.format === "PLATFORM"
          ? computeShippingWebhookEventKey(primary.eventId, rawBody)
          : computeNormalizedWebhookEventKey(cfg.provider, events);

      // Guvenli eslestirme onceligi (TODO-130): externalShipmentId → trackingNumber →
      // referenceId; hepsi {storeId, providerConfigId} scoped. PII/adres ile ESLENMEZ,
      // webhook'tan shipment YARATILMAZ.
      const ids = collectWebhookIdentifiers(events);
      const hasIdentifier = Boolean(ids.referenceId || ids.trackingNumber || ids.externalShipmentId);
      let shipment: WebhookShipmentRecord | null = null;
      if (ids.externalShipmentId) {
        shipment = await deps.persistence.findShipment(cfg.storeId, cfg.id, {
          externalShipmentId: ids.externalShipmentId,
        });
      }
      if (!shipment && ids.trackingNumber) {
        shipment = await deps.persistence.findShipment(cfg.storeId, cfg.id, {
          trackingNumber: ids.trackingNumber,
        });
      }
      if (!shipment && ids.referenceId) {
        shipment = await deps.persistence.findShipment(cfg.storeId, cfg.id, {
          referenceId: ids.referenceId,
        });
      }

      if (!shipment) {
        const outcome = await deps.persistence.recordDelivery({
          ...baseDelivery,
          eventKey,
          outcome: hasIdentifier ? "IGNORED_UNKNOWN_SHIPMENT" : "IGNORED_UNSUPPORTED",
          statusCode: primary.statusCode,
          statusText: primary.statusText,
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
      // regres edilmez (sync ile AYNI normalize esleme fold edilir — drift yok).
      // TODO-140 — Kod'a EK olarak hareket METNI (statusText) de kanit sayilir: kod
      // tasimayan "AKTARMADA"/"TRANSFER MERKEZINDE" hareketi IN_TRANSIT'e ilerletir. Regresyon
      // korumasi + terminal koruma mapProviderStatusToShipmentStatus icinde (sync ile ayni yol).
      // KAPSAM: yalniz HAREKET (trackshipment / DHL_TRACKING) push'u metinle ilerler; durum
      // push'u (getshipmentstatus / DHL_STATUS) metni TEK BASINA kanit sayilmaz (ADR-055/TODO-130
      // kurali korunur — kod/isDelivered gerekir). PLATFORM sozlesmesi kod-gudumlu kalir.
      const movementTextPromotes = normalized.format === "DHL_TRACKING";
      let nextStatus = shipment.status;
      for (const ev of events) {
        nextStatus = mapProviderStatusToShipmentStatus(
          {
            statusCode: ev.statusCode,
            isDelivered: ev.isDelivered,
            statusText: movementTextPromotes ? ev.statusText : null,
          },
          nextStatus,
        );
      }

      // occurredAt: PLATFORM ISO bekler (mevcut parser); ham MNG/DHL tarihleri
      // dd-MM-yyyy varyantlarini parseProviderDate ile guvenli cozer.
      const parseOccurredAt =
        normalized.format === "PLATFORM" ? parseWebhookOccurredAt : parseProviderDate;

      // Coklu hareket: primary disindaki hareketler dogal anahtarla dedupe edilir
      // (mevcut TRACKING_UPDATED/WEBHOOK_RECEIVED timeline'ina karsi — duplicate event yok).
      // Persistence anahtar listesi sunmuyorsa ek hareket YAZILMAZ (guvenli taraf).
      const additionalEvents: WebhookAdditionalEventInput[] = [];
      if (events.length > 1 && deps.persistence.listShipmentEventKeys) {
        const seen = new Set(await deps.persistence.listShipmentEventKeys(shipment.id));
        for (const ev of events.slice(0, -1)) {
          const occurredAt = parseOccurredAt(ev.occurredAtRaw);
          const key = shipmentTrackingEventKey({
            statusText: ev.statusText,
            location: ev.location,
            occurredAt,
          });
          if (seen.has(key)) continue;
          seen.add(key);
          additionalEvents.push({
            statusCode: ev.statusCode,
            statusText: ev.statusText,
            location: ev.location,
            occurredAt,
            trackingUrl: ev.trackingUrl,
          });
        }
      }

      const outcome = await deps.persistence.recordDelivery({
        ...baseDelivery,
        eventKey,
        outcome: "ACCEPTED",
        statusCode: primary.statusCode,
        statusText: primary.statusText,
        apply: {
          shipmentId: shipment.id,
          nextStatus,
          statusCode: primary.statusCode,
          statusText: primary.statusText,
          location: primary.location,
          occurredAt: parseOccurredAt(primary.occurredAtRaw),
          trackingUrl: primary.trackingUrl,
          trackingNumber: primary.trackingNumber,
          additionalEvents,
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

    async listShipmentEventKeys(shipmentId) {
      // TODO-130 — webhook + sync timeline'inin dogal anahtarlari (dedupe kapisi).
      const rows = await prisma.shipmentEvent.findMany({
        where: { shipmentId, eventType: { in: ["TRACKING_UPDATED", "WEBHOOK_RECEIVED"] } },
        select: { statusText: true, location: true, occurredAt: true },
      });
      return rows.map(shipmentTrackingEventKey);
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
            // TODO-130 — coklu hareketli ham payload'in onceden dedupe edilmis EK
            // hareketleri (kronolojik olarak primary'den once). Sanitize alanlar disinda
            // hicbir sey tasinmaz.
            for (const ev of input.apply.additionalEvents ?? []) {
              await tx.shipmentEvent.create({
                data: {
                  storeId: input.storeId,
                  shipmentId: input.apply.shipmentId,
                  provider: current.provider,
                  eventType: "WEBHOOK_RECEIVED",
                  statusCode: ev.statusCode,
                  statusText: ev.statusText,
                  location: ev.location,
                  occurredAt: ev.occurredAt,
                  trackingUrl: ev.trackingUrl,
                  rawSafeJson: {
                    webhook: true,
                    eventKeyPresent: true,
                    statusCode: ev.statusCode,
                    statusText: ev.statusText,
                    location: ev.location,
                  },
                },
              });
            }
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
