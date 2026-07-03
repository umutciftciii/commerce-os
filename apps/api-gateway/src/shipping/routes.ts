/**
 * F3C.1 — Shipping provider foundation: store-admin gateway uclari.
 *
 * Guvenlik:
 *  - Tum uclar requireStoreAdmin (platform admin + store scope) ile korunur.
 *  - Store izolasyonu: tum sorgular {id, storeId} ile scoped; baska store'un
 *    provider/credential/shipment verisi gorunmez (404).
 *  - Secret alanlar yalnizca create/update REQUEST body'sinde plain alinir,
 *    AES-256-GCM ile sifrelenip saklanir. RESPONSE allowlist'tir (serialize.ts):
 *    secret/ciphertext/JWT/customerPassword ASLA donmez; yalniz configured +
 *    maskedKey + *Set boolean'lari.
 *  - SHIPPING_ENCRYPTION_KEY yoksa credential save/test/decrypt -> CONFIG_MISSING
 *    (hicbir ortamda fallback yok).
 *  - Canli createOrder/createbarcode/label-purchase varsayilan guard altinda (409).
 *  - Audit log yalniz alan ADLARINI yazar; secret degerleri ASLA.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@commerce-os/config";
import { prisma } from "@commerce-os/db";
import type {
  Shipment,
  ShipmentEvent,
  ShipmentEventType,
  ShipmentStatus,
  ShippingCredentialType,
  ShippingProviderConfig,
  ShippingProviderCredential,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import {
  orderShippingResponseSchema,
  shipmentCancelRequestSchema,
  shipmentCreateLabelRequestSchema,
  shipmentDetailResponseSchema,
  shipmentListQuerySchema,
  shipmentListResponseSchema,
  shipmentManualTrackingRequestSchema,
  shippingBarcodeActionRequestSchema,
  shippingCancelRequestSchema,
  shippingCreateBarcodeRequestSchema,
  shippingCreateOrderRequestSchema,
  shippingCredentialUpsertRequestSchema,
  shippingPrepareRequestSchema,
  shippingProviderConfigCreateRequestSchema,
  shippingProviderConfigListResponseSchema,
  shippingProviderConfigUpdateRequestSchema,
  shippingProviderTestResponseSchema,
  shippingRateRequestSchema,
  shippingRateResponseSchema,
  shippingShipmentMutationResponseSchema,
  shippingSyncRequestSchema,
  shipmentSyncAllRequestSchema,
  shipmentSyncAllResponseSchema,
  shippingWebhookRotateResponseSchema,
} from "@commerce-os/contracts";
import { z } from "zod";
import { ShippingConfigError } from "./errors.js";
import { createShippingSecretCipher, type ShippingSecretCipher } from "./encryption.js";
import {
  createDisabledHttpTransport,
  createFetchHttpTransport,
  type ShippingHttpTransport,
} from "./adapters/http.js";
import { createShippingAdapterRegistry } from "./adapters/registry.js";
import {
  buildShipmentProviderInfo,
  computeShipmentActionCapabilities,
  computeShippingCapabilities,
  manualTrackingNextStatus,
  serializeShippingProviderConfig,
  shipmentKpiBucket,
  type SerializedShippingProviderConfig,
  type ShippingEnvGuards,
} from "./serialize.js";
import type {
  ResolvedShippingCredential,
  ResolvedShippingCredentials,
  ShippingActionContext,
} from "./types.js";
import { generateShippingWebhookSecret, generateShippingWebhookToken } from "./webhook.js";

export interface ShippingAdminRoutesDeps {
  config: AppConfig;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  recordAudit: (input: {
    action: "CREATE" | "UPDATE" | "DELETE";
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

type ConfigWithCredentials = ShippingProviderConfig & {
  credentials: ShippingProviderCredential[];
};

const storeParam = z.object({ storeId: z.string().min(1) });
const providerParam = z.object({ storeId: z.string().min(1), id: z.string().min(1) });
const credentialParam = z.object({
  storeId: z.string().min(1),
  id: z.string().min(1),
  type: z.string().min(1),
});
const orderParam = z.object({ storeId: z.string().min(1), orderId: z.string().min(1) });

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

/** ShippingConfigError -> guvenli HTTP yaniti (ic detay/secret sizdirmadan). */
function sendShippingError(reply: FastifyReply, error: unknown): never | FastifyReply {
  if (error instanceof ShippingConfigError) {
    const statusByCode: Record<string, number> = {
      CONFIG_MISSING: 500,
      CONFIG_INVALID: 500,
      CONFIG_INCOMPLETE: 409,
      TEST_BASE_URL_MISSING: 409,
      RECIPIENT_CREATE_DISABLED: 409,
      ORDER_CREATE_DISABLED: 409,
      BARCODE_CREATE_DISABLED: 409,
      LABEL_PURCHASE_DISABLED: 409,
      SHIPPING_HTTP_DISABLED: 409,
      SHIPPING_HTTP_TIMEOUT: 504,
      NOT_IMPLEMENTED: 409,
      ENDPOINT_UNRESOLVED: 409,
      OPERATION_NOT_SUPPORTED: 409,
      DUPLICATE_SHIPMENT: 409,
      // F3C.3 (ADR-045) cancel + barcode operasyon hatalari.
      CANCEL_DISABLED: 409,
      CANCEL_REQUIRES_SHIPMENT_ID: 409,
      CONFIRMATION_REQUIRED: 409,
      NO_ACTIVE_SHIPMENT: 409,
      CANCEL_FAILED: 502,
      BARCODE_RETRYABLE_ERROR: 409,
      PROVIDER_OPERATION_FAILED: 502,
      AUTH_FAILED: 502,
      // F3C.6 — saglayici sorgu hatasi normalize (HTTP >=400 basari gibi parse edilmez).
      PROVIDER_SHIPMENT_NOT_FOUND: 404,
      PROVIDER_QUERY_FAILED: 502,
    };
    // NOT_IMPLEMENTED (adapter capability) UI'da net gosterilsin diye OPERATION_NOT_SUPPORTED'a eslenir.
    const code = error.code === "NOT_IMPLEMENTED" ? "OPERATION_NOT_SUPPORTED" : error.code;
    const status = statusByCode[code] ?? 400;
    return reply.code(status).send(errorBody(code, error.message));
  }
  throw error;
}

export function registerShippingAdminRoutes(
  app: FastifyInstance,
  deps: ShippingAdminRoutesDeps,
): void {
  const { config } = deps;

  // Canli destructive operasyon ortam bayraklari → capability hesaplamasinda kullanilir.
  const envGuards: ShippingEnvGuards = {
    orderCreate: config.DHL_ECOMMERCE_ALLOW_ORDER_CREATE,
    barcodeCreate: config.DHL_ECOMMERCE_ALLOW_BARCODE_CREATE,
    labelPurchase: config.GELIVER_ALLOW_LABEL_PURCHASE,
    cancel: config.DHL_ECOMMERCE_ALLOW_CANCEL,
  };
  const serialize = (cfg: ConfigWithCredentials): SerializedShippingProviderConfig =>
    serializeShippingProviderConfig(cfg, envGuards);

  const transport: ShippingHttpTransport = config.SHIPPING_SANDBOX_HTTP_ENABLED
    ? createFetchHttpTransport(config.DHL_ECOMMERCE_HTTP_TIMEOUT_MS)
    : createDisabledHttpTransport();
  // DHL TEST/LIVE base URL + x-api-version env'den cozulur. TEST base URL yoksa
  // adapter TEST modunda TEST_BASE_URL_MISSING doner (canli host'a fallback YOK).
  const registry = createShippingAdapterRegistry(transport, {
    testBaseUrl: config.DHL_ECOMMERCE_TEST_BASE_URL ?? null,
    liveBaseUrl: config.DHL_ECOMMERCE_LIVE_BASE_URL,
    apiVersion: config.DHL_ECOMMERCE_API_VERSION ?? null,
  });

  /** Lazy cipher: yalnizca credential save/test/decrypt aninda kurulur. Key yoksa CONFIG_MISSING. */
  function cipher(): ShippingSecretCipher {
    return createShippingSecretCipher(config.SHIPPING_ENCRYPTION_KEY);
  }

  async function loadConfig(storeId: string, id: string): Promise<ConfigWithCredentials | null> {
    return prisma.shippingProviderConfig.findFirst({
      where: { id, storeId },
      include: { credentials: true },
    });
  }

  function decryptCredentials(cfg: ConfigWithCredentials): ResolvedShippingCredentials {
    const secret = cipher();
    const byType: Partial<Record<ShippingCredentialType, ResolvedShippingCredential>> = {};
    for (const cred of cfg.credentials) {
      byType[cred.type] = {
        type: cred.type,
        key: cred.encryptedKey ? secret.decrypt(cred.encryptedKey) : null,
        secret: cred.encryptedSecret ? secret.decrypt(cred.encryptedSecret) : null,
        customerNumber: cred.encryptedCustomerNumber ? secret.decrypt(cred.encryptedCustomerNumber) : null,
        customerPassword: cred.encryptedCustomerPassword ? secret.decrypt(cred.encryptedCustomerPassword) : null,
        identityType: cred.identityType,
      };
    }
    return { byType };
  }

  function buildContext(cfg: ConfigWithCredentials): ShippingActionContext {
    return {
      provider: cfg.provider,
      mode: cfg.mode,
      credentials: decryptCredentials(cfg),
      guards: {
        allowRecipientCreate: config.DHL_ECOMMERCE_ALLOW_RECIPIENT_CREATE && cfg.allowRecipientCreate,
        allowOrderCreate: config.DHL_ECOMMERCE_ALLOW_ORDER_CREATE && cfg.allowOrderCreate,
        allowBarcodeCreate: config.DHL_ECOMMERCE_ALLOW_BARCODE_CREATE && cfg.allowBarcodeCreate,
        allowLabelPurchase: config.GELIVER_ALLOW_LABEL_PURCHASE && cfg.allowLabelPurchase,
        // F3C.3 (ADR-045): cancel, order-create ile ayni provider-config kapisini (allowOrderCreate)
        // ve ayrica DHL_ECOMMERCE_ALLOW_CANCEL env'ini gerektirir. Dedike provider toggle TODO-121.
        allowCancel: config.DHL_ECOMMERCE_ALLOW_CANCEL && cfg.allowOrderCreate,
      },
    };
  }

  /* ───────────── Provider config CRUD ───────────── */

  app.get("/stores/:storeId/shipping/providers", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const configs = await prisma.shippingProviderConfig.findMany({
      where: { storeId: params.storeId },
      include: { credentials: true },
      orderBy: { createdAt: "asc" },
    });
    return shippingProviderConfigListResponseSchema.parse({
      data: configs.map(serialize),
    });
  });

  app.post("/stores/:storeId/shipping/providers", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingProviderConfigCreateRequestSchema.parse(request.body);
    const existing = await prisma.shippingProviderConfig.findUnique({
      where: {
        storeId_provider_mode: {
          storeId: params.storeId,
          provider: input.provider,
          mode: input.mode,
        },
      },
    });
    if (existing) {
      return reply
        .code(409)
        .send(errorBody("SHIPPING_PROVIDER_MODE_EXISTS", "Bu sağlayıcı+mod zaten tanımlı."));
    }
    const created = await prisma.shippingProviderConfig.create({
      data: {
        storeId: params.storeId,
        provider: input.provider,
        displayName: input.displayName,
        mode: input.mode,
        status: input.status,
        logoUrl: input.logoUrl ?? null,
        logoAlt: input.logoAlt ?? null,
        allowRecipientCreate: input.allowRecipientCreate,
        allowOrderCreate: input.allowOrderCreate,
        allowBarcodeCreate: input.allowBarcodeCreate,
        allowLabelPurchase: input.allowLabelPurchase,
      },
      include: { credentials: true },
    });
    await deps.recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingProviderConfig",
      entityId: created.id,
      metadata: { provider: created.provider, mode: created.mode },
    });
    return reply.code(201).send(serialize(created));
  });

  app.get("/stores/:storeId/shipping/providers/:id", async (request, reply) => {
    const params = providerParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const cfg = await loadConfig(params.storeId, params.id);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));
    return serialize(cfg);
  });

  app.patch("/stores/:storeId/shipping/providers/:id", async (request, reply) => {
    const params = providerParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingProviderConfigUpdateRequestSchema.parse(request.body);
    const cfg = await loadConfig(params.storeId, params.id);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));
    const updated = await prisma.shippingProviderConfig.update({
      where: { id: cfg.id },
      data: {
        displayName: input.displayName,
        mode: input.mode,
        status: input.status,
        // "" => temizle (null); URL => degistir; undefined => koru.
        logoUrl: input.logoUrl === "" ? null : input.logoUrl,
        logoAlt: input.logoAlt === "" ? null : input.logoAlt,
        allowRecipientCreate: input.allowRecipientCreate,
        allowOrderCreate: input.allowOrderCreate,
        allowBarcodeCreate: input.allowBarcodeCreate,
        allowLabelPurchase: input.allowLabelPurchase,
      },
      include: { credentials: true },
    });
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingProviderConfig",
      entityId: updated.id,
      metadata: { fields: Object.keys(input) },
    });
    return serialize(updated);
  });

  /* ───────────── Credential upsert / clear ───────────── */

  app.post("/stores/:storeId/shipping/providers/:id/credentials", async (request, reply) => {
    const params = providerParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingCredentialUpsertRequestSchema.parse(request.body);
    const cfg = await loadConfig(params.storeId, params.id);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));

    let secret: ShippingSecretCipher;
    try {
      secret = cipher();
    } catch (error) {
      return sendShippingError(reply, error);
    }

    // Secret semantigi: undefined -> KORU, "" -> TEMIZLE, dolu -> DEGISTIR.
    const existing = cfg.credentials.find((c) => c.type === input.type);
    const enc = (value: string | null | undefined, current: string | null): string | null => {
      if (value === undefined) return current;
      if (value === "" || value === null) return null;
      return secret.encrypt(value);
    };
    const encryptedKey = enc(input.key, existing?.encryptedKey ?? null);
    const encryptedSecret = enc(input.secret, existing?.encryptedSecret ?? null);
    const encryptedCustomerNumber = enc(input.customerNumber, existing?.encryptedCustomerNumber ?? null);
    const encryptedCustomerPassword = enc(input.customerPassword, existing?.encryptedCustomerPassword ?? null);
    const identityType =
      input.identityType !== undefined ? input.identityType : existing?.identityType ?? null;
    // maskedKey: yeni key girildiyse son-4; aksi halde mevcut korunur/temizlenir.
    let maskedKey: string | null;
    if (input.key === undefined) {
      maskedKey = existing?.maskedKey ?? null;
    } else if (input.key === "" || input.key === null) {
      maskedKey = null;
    } else {
      maskedKey = secret.mask(input.key);
    }
    const configured = computeConfigured(input.type, {
      encryptedKey,
      encryptedSecret,
      encryptedCustomerNumber,
      encryptedCustomerPassword,
    });

    await prisma.shippingProviderCredential.upsert({
      where: { providerConfigId_type: { providerConfigId: cfg.id, type: input.type } },
      create: {
        providerConfigId: cfg.id,
        type: input.type,
        encryptedKey,
        encryptedSecret,
        encryptedCustomerNumber,
        encryptedCustomerPassword,
        identityType,
        maskedKey,
        configured,
      },
      update: {
        encryptedKey,
        encryptedSecret,
        encryptedCustomerNumber,
        encryptedCustomerPassword,
        identityType,
        maskedKey,
        configured,
      },
    });
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingProviderCredential",
      entityId: cfg.id,
      // Yalniz hangi credential tipinin/alanlarinin set edildigi; secret DEGERI ASLA.
      metadata: { credentialType: input.type, fields: Object.keys(input).filter((k) => k !== "type") },
    });
    const reloaded = await loadConfig(params.storeId, params.id);
    return serialize(reloaded!);
  });

  app.delete("/stores/:storeId/shipping/providers/:id/credentials/:type", async (request, reply) => {
    const params = credentialParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const parsedType = shippingCredentialUpsertRequestSchema.shape.type.safeParse(params.type);
    if (!parsedType.success) {
      return reply.code(400).send(errorBody("SHIPPING_CREDENTIAL_TYPE_INVALID", "Geçersiz credential tipi."));
    }
    const cfg = await loadConfig(params.storeId, params.id);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));
    await prisma.shippingProviderCredential.deleteMany({
      where: { providerConfigId: cfg.id, type: parsedType.data },
    });
    await deps.recordAudit({
      action: "DELETE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingProviderCredential",
      entityId: cfg.id,
      metadata: { credentialType: parsedType.data },
    });
    const reloaded = await loadConfig(params.storeId, params.id);
    return serialize(reloaded!);
  });

  /* ───────────── Test connection ───────────── */

  app.post("/stores/:storeId/shipping/providers/:id/test", async (request, reply) => {
    const params = providerParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const cfg = await loadConfig(params.storeId, params.id);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));

    const adapter = registry.get(cfg.provider);
    const testedAt = new Date();
    let ok = false;
    let message: string;
    let errorCode: string | null = null;
    // connectionStatus GERCEK testin sonucu: OK yalniz canli HTTP basariliysa.
    let connectionStatus: "OK" | "FAILED" | "HTTP_DISABLED" | "SKIPPED" = "FAILED";
    let providerHttpStatus: number | null = null;
    let testType: string | null = null;
    try {
      const result = await adapter.testConnection({ context: buildContext(cfg) });
      ok = result.ok;
      message = result.message;
      connectionStatus = result.status;
      providerHttpStatus = result.providerHttpStatus ?? null;
      testType = result.testType ?? null;
    } catch (error) {
      if (error instanceof ShippingConfigError) {
        ok = false;
        message = error.message;
        errorCode = error.code;
        // Transport kapaliyken read-only metot/SHIPPING_HTTP_DISABLED hatasi gercek
        // bir baglanti basarisizligi DEGILdir — HTTP_DISABLED olarak ayirt edilir.
        connectionStatus = error.code === "SHIPPING_HTTP_DISABLED" ? "HTTP_DISABLED" : "FAILED";
      } else {
        throw error;
      }
    }
    await prisma.shippingProviderConfig.update({
      where: { id: cfg.id },
      data: {
        lastTestedAt: testedAt,
        // OK ASLA gercek cagri olmadan yazilmaz; HTTP_DISABLED/SKIPPED/FAILED da olabilir.
        lastTestStatus: connectionStatus,
        lastErrorCode: errorCode,
        lastProviderHttpStatus: providerHttpStatus,
        lastProviderTestType: testType,
      },
    });
    return shippingProviderTestResponseSchema.parse({
      ok,
      status: connectionStatus,
      message,
      testedAt: testedAt.toISOString(),
      providerHttpStatus,
      testType,
      errorCode,
    });
  });

  /* ───────────── Order detail shipping operasyonlari ───────────── */

  async function requireOrder(storeId: string, orderId: string) {
    return prisma.order.findFirst({ where: { id: orderId, storeId } });
  }

  app.post("/stores/:storeId/orders/:orderId/shipping/rate", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingRateRequestSchema.parse(request.body);
    const order = await requireOrder(params.storeId, params.orderId);
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Sipariş bulunamadı."));
    const cfg = await loadConfig(params.storeId, input.providerConfigId);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));
    // Capability guard: rate desteklenmiyorsa adapter'a gitmeden net kod don.
    if (!computeShippingCapabilities(cfg, envGuards).canCalculateRate) {
      return reply
        .code(409)
        .send(
          errorBody("OPERATION_NOT_SUPPORTED", "Bu sağlayıcı için bu işlem desteklenmiyor.", {
            operation: "RATE",
            provider: cfg.provider,
          }),
        );
    }
    try {
      const result = await registry.get(cfg.provider).calculateRate({
        context: buildContext(cfg),
        shipmentServiceType: input.shipmentServiceType,
        packagingType: input.packagingType,
        paymentType: input.paymentType,
        pickUpType: input.pickUpType,
        deliveryType: input.deliveryType,
        recipient: input.recipient,
        pieces: input.pieces,
      });
      await prisma.shipmentQuote.create({
        data: {
          storeId: params.storeId,
          orderId: order.id,
          providerConfigId: cfg.id,
          provider: cfg.provider,
          amountMinor: result.amountMinor,
          currency: result.currency,
          rawSafeJson: result.breakdownSafe ?? undefined,
        },
      });
      return shippingRateResponseSchema.parse(result);
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  app.post("/stores/:storeId/orders/:orderId/shipping/create-order", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingCreateOrderRequestSchema.parse(request.body);
    const order = await requireOrder(params.storeId, params.orderId);
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Sipariş bulunamadı."));
    const cfg = await loadConfig(params.storeId, input.providerConfigId);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));
    try {
      const result = await registry.get(cfg.provider).createOrder({
        context: buildContext(cfg),
        referenceId: input.referenceId,
        shipmentServiceType: input.shipmentServiceType,
        packagingType: input.packagingType,
        paymentType: input.paymentType,
        deliveryType: input.deliveryType,
        content: input.content,
        recipient: input.recipient,
        pieces: input.pieces,
        explicitConfirm: input.explicitConfirm,
      });
      const shipment = await persistOrderShipment(params.storeId, order.id, cfg, input.referenceId, result.externalOrderId, result.externalInvoiceId);
      await deps.recordAudit({
        action: "CREATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Shipment",
        entityId: shipment.id,
        metadata: { provider: cfg.provider, action: "createOrder" },
      });
      return reply.code(201).send({ referenceId: result.referenceId, externalOrderId: result.externalOrderId });
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  app.post("/stores/:storeId/orders/:orderId/shipping/create-barcode", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingCreateBarcodeRequestSchema.parse(request.body);
    const order = await requireOrder(params.storeId, params.orderId);
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Sipariş bulunamadı."));
    const cfg = await loadConfig(params.storeId, input.providerConfigId);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));
    try {
      const result = await registry.get(cfg.provider).createBarcodeOrLabel({
        context: buildContext(cfg),
        referenceId: input.referenceId,
        packagingType: input.packagingType,
        pieces: input.pieces,
        explicitConfirm: input.explicitConfirm,
      });
      return reply.code(201).send({
        referenceId: result.referenceId,
        externalShipmentId: result.externalShipmentId,
        barcodeCount: result.barcodes.length,
      });
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  app.get("/stores/:storeId/orders/:orderId/shipping", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const order = await requireOrder(params.storeId, params.orderId);
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Sipariş bulunamadı."));
    const shipments = await prisma.shipment.findMany({
      where: { storeId: params.storeId, orderId: order.id },
      orderBy: { createdAt: "desc" },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
    return orderShippingResponseSchema.parse({
      shipments: shipments.map(serializeShipment),
    });
  });

  /* ───────────── DHL CBS read-only preview (en guvenli canli smoke adayi) ───────────── */

  app.post("/stores/:storeId/shipping/dhl/cbs/preview", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = z.object({ providerConfigId: z.string().min(1) }).parse(request.body);
    const cfg = await loadConfig(params.storeId, body.providerConfigId);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));
    try {
      const result = await registry.get(cfg.provider).listGeoCities({ context: buildContext(cfg) });
      return { cities: result.cities ?? [] };
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  async function persistOrderShipment(
    storeId: string,
    orderId: string,
    cfg: ConfigWithCredentials,
    referenceId: string,
    externalOrderId: string | null,
    externalInvoiceId?: string | null,
  ) {
    return prisma.shipment.upsert({
      where: { storeId_referenceId: { storeId, referenceId } },
      create: {
        storeId,
        orderId,
        providerConfigId: cfg.id,
        provider: cfg.provider,
        referenceId,
        status: "ORDER_CREATED",
        externalOrderId,
        externalInvoiceId: externalInvoiceId ?? null,
      },
      update: {
        status: "ORDER_CREATED",
        externalOrderId,
        externalInvoiceId: externalInvoiceId ?? null,
      },
    });
  }

  /* ───────────── F3C.3 DHL post-order operasyon admin aksiyonlari ─────────────
   * prepare = createRecipient + createOrder; barcode = createbarcode; sync =
   * getshipmentstatus + trackshipment. Checkout DHL operasyon cagrisi YAPMAZ.
   * referenceId order'dan turetilir (client'tan GELMEZ); cross-store {storeId} ile scoped.
   * Provider raw response SANITIZE edilmeden DB'ye yazilmaz; ZPL/secret asla tutulmaz. */

  // Aktif = iptal/basarisiz OLMAYAN en yeni shipment (duplicate createOrder guard'i icin).
  const ACTIVE_SHIPMENT_STATUSES: ShipmentStatus[] = [
    "DRAFT",
    "ORDER_CREATED",
    // F3C.3 (ADR-045): barkod bos 200 (LABEL_PENDING) retry edilebilir; dagitim ara
    // durumlari ve teslim-edilemedi (DELIVERY_FAILED, FINAL DEGIL) hala AKTIF sayilir →
    // duplicate prepare guard createOrder'i TEKRAR cagirmaz.
    "LABEL_PENDING",
    "LABEL_CREATED",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "DELIVERY_FAILED",
    "RETURNED",
  ];

  async function findActiveShipment(storeId: string, orderId: string) {
    return prisma.shipment.findFirst({
      where: { storeId, orderId, status: { in: ACTIVE_SHIPMENT_STATUSES } },
      orderBy: { createdAt: "desc" },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
  }

  async function reloadShipment(id: string) {
    return prisma.shipment.findUniqueOrThrow({
      where: { id },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
  }

  async function recordShipmentEvent(
    storeId: string,
    shipment: Shipment,
    eventType: ShipmentEventType,
    data: {
      statusCode?: number | null;
      statusText?: string | null;
      location?: string | null;
      occurredAt?: Date | null;
      trackingUrl?: string | null;
      rawSafeJson?: Prisma.InputJsonValue;
    },
  ) {
    await prisma.shipmentEvent.create({
      data: {
        storeId,
        shipmentId: shipment.id,
        provider: shipment.provider,
        eventType,
        statusCode: data.statusCode ?? null,
        statusText: data.statusText ?? null,
        location: data.location ?? null,
        occurredAt: data.occurredAt ?? null,
        trackingUrl: data.trackingUrl ?? null,
        rawSafeJson: data.rawSafeJson,
      },
    });
  }

  // Sipariş kargo adresinden + paket olcusunden parca listesi (createbarcode icin yeniden uretilebilir).
  function rebuildPieces(shipment: Shipment) {
    const count = Math.max(1, shipment.pieceCount);
    return Array.from({ length: count }, (_, i) => ({
      barcode: `${shipment.referenceId.toUpperCase()}_PARCA${i + 1}`,
      desi: shipment.totalDesi / count || 0,
      kg: shipment.totalKg / count || 0,
    }));
  }

  /* ───────────── F3C.5 (TODO-121) paylasilan aksiyon helper'lari ─────────────
   * Hem order-scoped DHL route'lari hem store-level generic shipment route'lari
   * AYNI mantigi kullanir (provider adapter dispatch + sanitize + event/audit).
   * UI provider-agnostic; backend mantik tek yerde. */

  type CreateLabelResult =
    | { kind: "label" | "pending"; shipment: Awaited<ReturnType<typeof reloadShipment>> }
    | { kind: "retryable" };

  // createbarcode/createLabel — ADR-045 normalize (bos 200 → LABEL_PENDING; varis/hat
  // routing hatasi → retryable). Raw ZPL DB'ye YAZILMAZ; yalniz sanitize ozet + boolean.
  async function applyCreateLabel(
    storeId: string,
    shipment: Shipment,
    cfg: ConfigWithCredentials,
    opts: { packagingType?: number; explicitConfirm: boolean },
  ): Promise<CreateLabelResult> {
    const result = await registry.get(cfg.provider).createBarcodeOrLabel({
      context: buildContext(cfg),
      referenceId: shipment.referenceId,
      packagingType: opts.packagingType ?? shipment.packagingType ?? undefined,
      pieces: rebuildPieces(shipment),
      explicitConfirm: opts.explicitConfirm,
    });

    if (result.providerErrorMessage) {
      await recordShipmentEvent(storeId, shipment, "BARCODE_FAILED", {
        statusText: result.providerErrorMessage,
        rawSafeJson: {
          providerError: true,
          message: result.providerErrorMessage,
          shipmentIdPresent: Boolean(result.externalShipmentId),
          barcodeCount: result.barcodes.length,
        },
      });
      return { kind: "retryable" };
    }

    const shipmentIdPresent = Boolean(result.externalShipmentId);
    const barcodeCount = result.barcodes.length;
    const zplPresent = result.barcodes.some((b) => b.labelPresent);
    const incomplete = result.providerReturnedEmptyPayload || (!shipmentIdPresent && barcodeCount === 0);
    const barcodeJsonSafe = {
      referenceId: result.referenceId,
      shipmentId: result.externalShipmentId,
      invoiceId: result.externalInvoiceId,
      barcodeCount,
      zplPresent,
      shipmentIdPresent,
      invoiceIdPresent: Boolean(result.externalInvoiceId),
      providerReturnedEmptyPayload: incomplete,
      pieces: result.barcodes.map((b) => ({ pieceNumber: b.pieceNumber, barcodePresent: Boolean(b.barcode) })),
    } satisfies Prisma.InputJsonValue;

    if (incomplete) {
      const pendingUpdated = await prisma.shipment.update({
        where: { id: shipment.id },
        data: { status: "LABEL_PENDING", barcodeJsonSafe },
      });
      await recordShipmentEvent(storeId, pendingUpdated, "BARCODE_PENDING", {
        statusText: "Barkod henüz üretilemedi (sağlayıcı boş yanıt)",
        rawSafeJson: barcodeJsonSafe,
      });
      return { kind: "pending", shipment: await reloadShipment(pendingUpdated.id) };
    }

    const updated = await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        status: "LABEL_CREATED",
        externalShipmentId: result.externalShipmentId,
        externalInvoiceId: result.externalInvoiceId ?? shipment.externalInvoiceId,
        trackingNumber: result.externalShipmentId ?? shipment.trackingNumber,
        barcodeJsonSafe,
      },
    });
    await recordShipmentEvent(storeId, updated, "BARCODE_CREATED", {
      statusText: "Barkod oluşturuldu",
      rawSafeJson: barcodeJsonSafe,
    });
    return { kind: "label", shipment: await reloadShipment(updated.id) };
  }

  // getshipmentstatus + trackshipment → durum/hareket senkronu (terminal/regresyon korumali).
  async function applySync(storeId: string, shipment: Shipment, cfg: ConfigWithCredentials) {
    const ctx = buildContext(cfg);
    const lookup = { context: ctx, referenceId: shipment.referenceId, shipmentId: shipment.externalShipmentId ?? undefined };
    const adapter = registry.get(cfg.provider);
    const status = await adapter.getShipmentStatus(lookup);
    const track = await adapter.trackShipment(lookup).catch(() => []);

    const nextStatus = mapProviderStatusToShipmentStatus(status, shipment.status);
    const updated = await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        status: nextStatus,
        shipmentStatusCode: status.statusCode ?? shipment.shipmentStatusCode,
        trackingUrl: status.trackingUrl ?? shipment.trackingUrl,
        trackingNumber: status.externalShipmentId ?? shipment.trackingNumber,
      },
    });
    await recordShipmentEvent(storeId, updated, "STATUS_CHANGED", {
      statusCode: status.statusCode,
      statusText: status.statusText,
      trackingUrl: status.trackingUrl,
      occurredAt: parseProviderDate(status.deliveryDateTime ?? null),
      rawSafeJson: {
        statusCode: status.statusCode,
        statusText: status.statusText,
        isDelivered: status.isDelivered,
        deliveryTo: status.deliveryTo ?? null,
      },
    });
    // F3C.6 — trackshipment kumulatif liste dondugu icin daha once yazilmis hareketler
    // atlanir (idempotent sync; musteri timeline'inda duplikasyon olusmaz).
    const existingTrackEvents = await prisma.shipmentEvent.findMany({
      where: { shipmentId: updated.id, eventType: "TRACKING_UPDATED" },
      select: { statusText: true, location: true, occurredAt: true },
    });
    const seenTrackKeys = new Set(existingTrackEvents.map(shipmentTrackingEventKey));
    for (const ev of track) {
      const occurredAt = parseProviderDate(ev.occurredAt);
      const key = shipmentTrackingEventKey({ statusText: ev.statusText, location: ev.location, occurredAt });
      if (seenTrackKeys.has(key)) continue;
      seenTrackKeys.add(key);
      await recordShipmentEvent(storeId, updated, "TRACKING_UPDATED", {
        statusCode: ev.statusCode ?? null,
        statusText: ev.statusText,
        location: ev.location,
        occurredAt,
        trackingUrl: ev.trackingUrl ?? status.trackingUrl,
        rawSafeJson: { sequence: ev.sequence, statusText: ev.statusText, location: ev.location, occurredAt: ev.occurredAt },
      });
    }
    return reloadShipment(updated.id);
  }

  // cancelshipment — explicit onay + shipmentId ZORUNLU (ADR-045). Guard'lar burada thrown.
  async function applyCancel(
    storeId: string,
    shipment: Shipment,
    cfg: ConfigWithCredentials,
    explicitConfirm: boolean,
  ) {
    if (explicitConfirm !== true) {
      throw new ShippingConfigError("CONFIRMATION_REQUIRED", "Kargo kaydını iptal için onay (explicitConfirm) gerekir.");
    }
    if (!shipment.externalShipmentId) {
      throw new ShippingConfigError(
        "CANCEL_REQUIRES_SHIPMENT_ID",
        "İptal için önce barkod/gönderi oluşturulmalı (gönderi no yok).",
      );
    }
    await registry.get(cfg.provider).cancelShipment({
      context: buildContext(cfg),
      referenceId: shipment.referenceId,
      shipmentId: shipment.externalShipmentId,
      explicitConfirm,
    });
    const cancelled = await prisma.shipment.update({
      where: { id: shipment.id },
      data: { status: "CANCELLED" },
    });
    await recordShipmentEvent(storeId, cancelled, "CANCELLED", {
      statusText: "Gönderi/barkod kaydı iptal edildi",
      rawSafeJson: { cancelled: true, shipmentIdPresent: true },
    });
    return reloadShipment(cancelled.id);
  }

  // Manuel takip no — saglayiciya CAGRI YOK; admin elle girer. Takip no operasyonel
  // olarak "kargo sureci basladi" demektir: hazirlik asamasindaki gönderi IN_TRANSIT'e
  // ilerler (regres yok; ileri/terminal durumlar korunur). MANUAL_TRACKING event yazilir.
  // DHL createbarcode sonrasi OTOMATIK handoff'a DONUS YOK (ADR-046).
  async function applyManualTracking(
    storeId: string,
    shipment: Shipment,
    trackingNumber: string,
    trackingUrl: string | undefined,
  ) {
    const nextStatus = manualTrackingNextStatus(shipment.status);
    const updated = await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        trackingNumber,
        trackingUrl: trackingUrl ?? shipment.trackingUrl,
        status: nextStatus,
      },
    });
    await recordShipmentEvent(storeId, updated, "MANUAL_TRACKING", {
      statusText: "Manuel takip numarası eklendi.",
      trackingUrl: trackingUrl ?? null,
      rawSafeJson: {
        manual: true,
        trackingNumberPresent: true,
        statusFrom: shipment.status,
        statusTo: nextStatus,
      },
    });
    return reloadShipment(updated.id);
  }

  app.post("/stores/:storeId/orders/:orderId/shipping/dhl/prepare", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingPrepareRequestSchema.parse(request.body);
    const order = await requireOrder(params.storeId, params.orderId);
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Sipariş bulunamadı."));
    const cfg = await loadConfig(params.storeId, input.providerConfigId);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));

    // Duplicate guard: aktif gonderi varsa TEKRAR createOrder cagirma.
    const existing = await findActiveShipment(params.storeId, order.id);
    if (existing) {
      return reply.code(409).send(
        errorBody("DUPLICATE_SHIPMENT", "Bu sipariş için DHL gönderi kaydı zaten oluşturulmuş.", {
          shipmentId: existing.id,
          referenceId: existing.referenceId,
        }),
      );
    }

    const referenceId = order.orderNumber; // server-derived; client'tan gelen referenceId GUVENILMEZ
    const ctx = buildContext(cfg);
    try {
      const adapter = registry.get(cfg.provider);
      // 1) createRecipient — varis sube/hat kodu tespiti (guard altinda).
      await adapter.createRecipient({
        context: ctx,
        referenceId,
        recipient: input.recipient,
        explicitConfirm: input.explicitConfirm,
      });
      // 2) createOrder — DHL gonderi kaydi (guard altinda). 2xx = "kargo talebi olusturuldu".
      const orderResult = await adapter.createOrder({
        context: ctx,
        referenceId,
        shipmentServiceType: input.shipmentServiceType,
        packagingType: input.packagingType,
        paymentType: input.paymentType,
        deliveryType: input.deliveryType,
        content: input.content,
        recipient: input.recipient,
        pieces: input.pieces,
        explicitConfirm: input.explicitConfirm,
      });

      const totalKg = input.pieces.reduce((sum, p) => sum + (p.kg ?? 0), 0);
      const totalDesi = input.pieces.reduce((sum, p) => sum + (p.desi ?? 0), 0);
      const shipment = await prisma.shipment.create({
        data: {
          storeId: params.storeId,
          orderId: order.id,
          providerConfigId: cfg.id,
          provider: cfg.provider,
          referenceId,
          status: "ORDER_CREATED",
          externalOrderId: orderResult.externalOrderId,
          externalInvoiceId: orderResult.externalInvoiceId ?? null,
          pieceCount: input.pieces.length,
          totalKg,
          totalDesi,
          packagingType: input.packagingType ?? null,
          shipmentServiceType: input.shipmentServiceType ?? null,
          paymentType: input.paymentType ?? null,
          deliveryType: input.deliveryType ?? null,
          recipientName: input.recipient.fullName ?? null,
          recipientEmail: input.recipient.email ?? null,
          recipientPhone: input.recipient.phone ?? null,
          recipientCityCode: input.recipient.cityCode ?? null,
          recipientDistrictCode: input.recipient.districtCode ?? null,
          recipientCityName: input.recipient.cityName ?? null,
          recipientDistrictName: input.recipient.districtName ?? null,
          recipientAddress: input.recipient.address ?? null,
        },
      });
      await recordShipmentEvent(params.storeId, shipment, "ORDER_CREATED", {
        statusText: "Kargo talebi oluşturuldu (DHL gönderi kaydı)",
        rawSafeJson: {
          referenceId: orderResult.referenceId,
          externalOrderId: orderResult.externalOrderId,
          externalInvoiceId: orderResult.externalInvoiceId ?? null,
          shipperBranchCode: orderResult.shipperBranchCode ?? null,
        },
      });
      await deps.recordAudit({
        action: "CREATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Shipment",
        entityId: shipment.id,
        metadata: { provider: cfg.provider, action: "dhl.prepare" },
      });
      return reply
        .code(201)
        .send(shippingShipmentMutationResponseSchema.parse({ shipment: serializeShipment(await reloadShipment(shipment.id)), alreadyExisted: false }));
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  /* F3C.5 (TODO-126) — MANUEL gönderi hazırlama (online prepare fallback'i). Sağlayıcıya
   * İSTEK ATMAZ: yerel ORDER_CREATED shipment kaydı oluşturur (recipient/pieces siparişten).
   * Online "Gönderi Oluştur" sağlayıcı hatası verdiğinde admin bu uçla manuel devam eder;
   * ardından shipment detayında "Manuel Takip No Gir" ile takip no girip IN_TRANSIT'e ilerletir. */
  app.post("/stores/:storeId/orders/:orderId/shipping/shipment-draft", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingPrepareRequestSchema.parse(request.body);
    const order = await requireOrder(params.storeId, params.orderId);
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Sipariş bulunamadı."));
    const cfg = await loadConfig(params.storeId, input.providerConfigId);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));

    const existing = await findActiveShipment(params.storeId, order.id);
    if (existing) {
      return reply.code(409).send(
        errorBody("DUPLICATE_SHIPMENT", "Bu sipariş için zaten aktif bir gönderi kaydı var.", {
          shipmentId: existing.id,
          referenceId: existing.referenceId,
        }),
      );
    }

    const referenceId = order.orderNumber; // server-derived; client referenceId GUVENILMEZ
    const totalKg = input.pieces.reduce((sum, p) => sum + (p.kg ?? 0), 0);
    const totalDesi = input.pieces.reduce((sum, p) => sum + (p.desi ?? 0), 0);
    try {
      const shipment = await prisma.shipment.create({
        data: {
          storeId: params.storeId,
          orderId: order.id,
          providerConfigId: cfg.id,
          provider: cfg.provider,
          referenceId,
          status: "ORDER_CREATED",
          pieceCount: input.pieces.length,
          totalKg,
          totalDesi,
          packagingType: input.packagingType ?? null,
          recipientName: input.recipient.fullName ?? null,
          recipientEmail: input.recipient.email ?? null,
          recipientPhone: input.recipient.phone ?? null,
          recipientCityName: input.recipient.cityName ?? null,
          recipientDistrictName: input.recipient.districtName ?? null,
          recipientAddress: input.recipient.address ?? null,
        },
      });
      // Provider'a CAGRI YOK; manuel kayit isaretli event.
      await recordShipmentEvent(params.storeId, shipment, "ORDER_CREATED", {
        statusText: "Gönderi kaydı manuel hazırlandı (sağlayıcıya istek atılmadı).",
        rawSafeJson: { manual: true, providerCallSkipped: true, referenceId },
      });
      await deps.recordAudit({
        action: "CREATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Shipment",
        entityId: shipment.id,
        metadata: { provider: cfg.provider, action: "shipment.manual-draft" },
      });
      return reply
        .code(201)
        .send(shippingShipmentMutationResponseSchema.parse({ shipment: serializeShipment(await reloadShipment(shipment.id)), alreadyExisted: false }));
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  app.post("/stores/:storeId/orders/:orderId/shipping/dhl/barcode", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingBarcodeActionRequestSchema.parse(request.body);
    const order = await requireOrder(params.storeId, params.orderId);
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Sipariş bulunamadı."));
    const shipment = await findActiveShipment(params.storeId, order.id);
    if (!shipment) {
      return reply.code(409).send(errorBody("NO_ACTIVE_SHIPMENT", "Önce “Kargo Hazırlığı Başlat” ile DHL gönderi kaydı oluşturun."));
    }
    const cfg = await loadConfig(params.storeId, shipment.providerConfigId);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));
    try {
      const r = await applyCreateLabel(params.storeId, shipment, cfg, {
        packagingType: input.packagingType ?? undefined,
        explicitConfirm: input.explicitConfirm,
      });
      // F3C.3 (ADR-045) — saglayici domain hatasi (varis sube/hat kodu): retryable 409.
      if (r.kind === "retryable") {
        return reply.code(409).send(
          errorBody(
            "BARCODE_RETRYABLE_ERROR",
            "Varış şubesi/hat kodu belirlenemedi. Adres bilgisi kontrol edilmeli veya işlem daha sonra tekrar denenmeli.",
            { retryable: true },
          ),
        );
      }
      await deps.recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Shipment",
        entityId: r.shipment.id,
        metadata: { provider: cfg.provider, action: "dhl.barcode", result: r.kind === "pending" ? "pending" : "label" },
      });
      return reply.send(shippingShipmentMutationResponseSchema.parse({ shipment: serializeShipment(r.shipment), alreadyExisted: false }));
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  app.post("/stores/:storeId/orders/:orderId/shipping/dhl/sync", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    shippingSyncRequestSchema.parse(request.body);
    const order = await requireOrder(params.storeId, params.orderId);
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Sipariş bulunamadı."));
    const shipment = await findActiveShipment(params.storeId, order.id);
    if (!shipment) {
      return reply.code(409).send(errorBody("NO_ACTIVE_SHIPMENT", "Senkronlanacak aktif DHL gönderisi yok."));
    }
    const cfg = await loadConfig(params.storeId, shipment.providerConfigId);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));
    try {
      const updated = await applySync(params.storeId, shipment, cfg);
      return reply.send(shippingShipmentMutationResponseSchema.parse({ shipment: serializeShipment(updated), alreadyExisted: false }));
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  app.post("/stores/:storeId/orders/:orderId/shipping/dhl/cancel", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingCancelRequestSchema.parse(request.body);
    const order = await requireOrder(params.storeId, params.orderId);
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Sipariş bulunamadı."));
    const shipment = await findActiveShipment(params.storeId, order.id);
    if (!shipment) {
      return reply.code(409).send(errorBody("NO_ACTIVE_SHIPMENT", "İptal edilecek aktif DHL gönderisi yok."));
    }
    const cfg = await loadConfig(params.storeId, shipment.providerConfigId);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));
    try {
      const cancelled = await applyCancel(params.storeId, shipment, cfg, input.explicitConfirm);
      await deps.recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Shipment",
        entityId: cancelled.id,
        metadata: { provider: cfg.provider, action: "dhl.cancel" },
      });
      return reply.send(shippingShipmentMutationResponseSchema.parse({ shipment: serializeShipment(cancelled), alreadyExisted: false }));
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  /* ───────────── F3C.5 (TODO-121) store-level shipment list/detail + generic aksiyonlar ─────────────
   * Shipment = lojistik domain; order-detayindan BAGIMSIZ liste/detay ekranlarini besler.
   * Generic aksiyonlar (create-label/sync/cancel/manual-tracking) shipment id uzerinden mevcut
   * adapter dispatch helper'larina baglanir; UI provider-agnostic kalir (DHL yalniz displayName+logo).
   * Store izolasyonu: tum sorgular {id, storeId} ile scoped (baska store'un gönderisi 404). */

  const shipmentIdParam = z.object({ storeId: z.string().min(1), shipmentId: z.string().min(1) });

  function customerDisplayName(order: {
    customerEmail: string;
    customer: { firstName: string | null; lastName: string | null } | null;
  }): string | null {
    const name = [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ").trim();
    return name || order.customerEmail || null;
  }

  // Son STATUS/TRACKING event'inden son senkron + saglayici durumu; en son location → işlem noktası.
  function lastEventSummary(events: ShipmentEvent[]) {
    const last = events.length > 0 ? events[events.length - 1] : null;
    const syncEvents = events.filter((e) => e.eventType === "STATUS_CHANGED" || e.eventType === "TRACKING_UPDATED");
    const lastSync = syncEvents.length > 0 ? syncEvents[syncEvents.length - 1] : null;
    const lastWithLocation = [...events].reverse().find((e) => e.location);
    return {
      lastEventType: last?.eventType ?? null,
      lastEventLocation: lastWithLocation?.location ?? null,
      lastProviderStatus: lastSync?.statusText ?? null,
      lastSyncedAt: lastSync ? lastSync.createdAt.toISOString() : null,
    };
  }

  function serializeShipmentListItem(
    s: Shipment & { events: ShipmentEvent[] },
    providerCfg: ShippingProviderConfig | null,
    order: {
      orderNumber: string;
      customerEmail: string;
      customer: { firstName: string | null; lastName: string | null } | null;
    },
  ) {
    const barcode = (s.barcodeJsonSafe ?? null) as { zplPresent?: boolean } | null;
    const ev = lastEventSummary(s.events);
    return {
      id: s.id,
      orderId: s.orderId,
      orderNumber: order.orderNumber,
      customerName: customerDisplayName(order),
      provider: buildShipmentProviderInfo(s.provider, providerCfg),
      referenceId: s.referenceId,
      status: s.status,
      trackingNumber: s.trackingNumber,
      trackingUrl: s.trackingUrl,
      barcodeHasLabel: Boolean(barcode?.zplPresent),
      lastEventType: ev.lastEventType,
      lastEventLocation: ev.lastEventLocation,
      lastProviderStatus: ev.lastProviderStatus,
      lastSyncedAt: ev.lastSyncedAt,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  app.get("/stores/:storeId/shipping/shipments", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const query = shipmentListQuerySchema.parse(request.query);

    const where: Prisma.ShipmentWhereInput = { storeId: params.storeId };
    if (query.provider) where.provider = query.provider;
    // Hizli filtreler — explicit status verilirse onu uygula (asagida override).
    if (query.flag === "PROBLEM") where.status = { in: ["DELIVERY_FAILED", "RETURNED", "FAILED"] };
    else if (query.flag === "AWAITING_LABEL") where.status = "LABEL_PENDING";
    else if (query.flag === "UNDELIVERABLE") where.status = "DELIVERY_FAILED";
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }
    if (query.search) {
      const s = query.search;
      where.OR = [
        { referenceId: { contains: s, mode: "insensitive" } },
        { trackingNumber: { contains: s, mode: "insensitive" } },
        { recipientName: { contains: s, mode: "insensitive" } },
        { order: { is: { orderNumber: { contains: s, mode: "insensitive" } } } },
        { order: { is: { customerEmail: { contains: s, mode: "insensitive" } } } },
      ];
    }

    const [rows, total, kpiGroups] = await Promise.all([
      prisma.shipment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.take ?? 50,
        skip: query.skip ?? 0,
        include: {
          providerConfig: true,
          order: { include: { customer: true } },
          events: { orderBy: { createdAt: "asc" } },
        },
      }),
      prisma.shipment.count({ where }),
      // KPI = magazadaki TUM gönderiler (genel bakis; liste filtresinden bagimsiz).
      prisma.shipment.groupBy({ by: ["status"], where: { storeId: params.storeId }, _count: { _all: true } }),
    ]);

    const kpi = { prepared: 0, awaitingLabel: 0, inTransit: 0, delivered: 0, problem: 0 };
    for (const g of kpiGroups) {
      const bucket = shipmentKpiBucket(g.status);
      if (bucket) kpi[bucket] += g._count._all;
    }

    return shipmentListResponseSchema.parse({
      data: rows.map((r) => serializeShipmentListItem(r, r.providerConfig, r.order)),
      total,
      kpi,
    });
  });

  app.get("/stores/:storeId/shipping/shipments/:shipmentId", async (request, reply) => {
    const params = shipmentIdParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const shipment = await prisma.shipment.findFirst({
      where: { id: params.shipmentId, storeId: params.storeId },
      include: {
        providerConfig: { include: { credentials: true } },
        order: { include: { customer: true } },
        events: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!shipment) return reply.code(404).send(errorBody("SHIPMENT_NOT_FOUND", "Gönderi bulunamadı."));
    const base = serializeShipment(shipment);
    return shipmentDetailResponseSchema.parse({
      shipment: {
        ...base,
        orderNumber: shipment.order.orderNumber,
        customerName: customerDisplayName(shipment.order),
        customerEmail: shipment.order.customerEmail,
        providerInfo: buildShipmentProviderInfo(shipment.provider, shipment.providerConfig),
        actions: computeShipmentActionCapabilities(shipment.providerConfig, shipment, envGuards),
      },
    });
  });

  async function loadStoreShipmentWithCfg(storeId: string, shipmentId: string) {
    const shipment = await prisma.shipment.findFirst({
      where: { id: shipmentId, storeId },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
    if (!shipment) return null;
    const cfg = await loadConfig(storeId, shipment.providerConfigId);
    if (!cfg) return null;
    return { shipment, cfg };
  }

  // Generic "Barkod/Etiket Oluştur" — shipment id uzerinden; UI provider-agnostic.
  app.post("/stores/:storeId/shipping/shipments/:shipmentId/create-label", async (request, reply) => {
    const params = shipmentIdParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shipmentCreateLabelRequestSchema.parse(request.body);
    const loaded = await loadStoreShipmentWithCfg(params.storeId, params.shipmentId);
    if (!loaded) return reply.code(404).send(errorBody("SHIPMENT_NOT_FOUND", "Gönderi bulunamadı."));
    if (loaded.shipment.status !== "ORDER_CREATED" && loaded.shipment.status !== "LABEL_PENDING") {
      return reply.code(409).send(errorBody("LABEL_NOT_APPLICABLE", "Bu gönderi durumunda barkod/etiket oluşturulamaz."));
    }
    try {
      const r = await applyCreateLabel(params.storeId, loaded.shipment, loaded.cfg, {
        packagingType: input.packagingType ?? undefined,
        explicitConfirm: input.explicitConfirm,
      });
      if (r.kind === "retryable") {
        return reply.code(409).send(
          errorBody(
            "BARCODE_RETRYABLE_ERROR",
            "Varış şubesi/hat kodu belirlenemedi. Adres bilgisi kontrol edilmeli veya işlem daha sonra tekrar denenmeli.",
            { retryable: true },
          ),
        );
      }
      await deps.recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Shipment",
        entityId: r.shipment.id,
        metadata: { provider: loaded.cfg.provider, action: "shipment.create-label", result: r.kind },
      });
      return reply.send(shippingShipmentMutationResponseSchema.parse({ shipment: serializeShipment(r.shipment), alreadyExisted: false }));
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  // Generic "Durumu Güncelle" — saglayici status/track senkronu (provider destekliyorsa).
  app.post("/stores/:storeId/shipping/shipments/:shipmentId/sync", async (request, reply) => {
    const params = shipmentIdParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const loaded = await loadStoreShipmentWithCfg(params.storeId, params.shipmentId);
    if (!loaded) return reply.code(404).send(errorBody("SHIPMENT_NOT_FOUND", "Gönderi bulunamadı."));
    try {
      const updated = await applySync(params.storeId, loaded.shipment, loaded.cfg);
      return reply.send(shippingShipmentMutationResponseSchema.parse({ shipment: serializeShipment(updated), alreadyExisted: false }));
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  // Generic "Gönderi Kaydını İptal Et" — explicit onay zorunlu (adapter dispatch).
  app.post("/stores/:storeId/shipping/shipments/:shipmentId/cancel", async (request, reply) => {
    const params = shipmentIdParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shipmentCancelRequestSchema.parse(request.body);
    const loaded = await loadStoreShipmentWithCfg(params.storeId, params.shipmentId);
    if (!loaded) return reply.code(404).send(errorBody("SHIPMENT_NOT_FOUND", "Gönderi bulunamadı."));
    try {
      const cancelled = await applyCancel(params.storeId, loaded.shipment, loaded.cfg, input.explicitConfirm);
      await deps.recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Shipment",
        entityId: cancelled.id,
        metadata: { provider: loaded.cfg.provider, action: "shipment.cancel" },
      });
      return reply.send(shippingShipmentMutationResponseSchema.parse({ shipment: serializeShipment(cancelled), alreadyExisted: false }));
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  // Generic "Manuel Takip No Gir" — saglayiciya CAGRI YOK; admin elle girer.
  app.post("/stores/:storeId/shipping/shipments/:shipmentId/manual-tracking", async (request, reply) => {
    const params = shipmentIdParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shipmentManualTrackingRequestSchema.parse(request.body);
    const loaded = await loadStoreShipmentWithCfg(params.storeId, params.shipmentId);
    if (!loaded) return reply.code(404).send(errorBody("SHIPMENT_NOT_FOUND", "Gönderi bulunamadı."));
    if (loaded.shipment.status === "CANCELLED" || loaded.shipment.status === "FAILED") {
      return reply.code(409).send(errorBody("SHIPMENT_INACTIVE", "İptal/başarısız gönderiye manuel takip girilemez."));
    }
    try {
      const updated = await applyManualTracking(params.storeId, loaded.shipment, input.trackingNumber, input.trackingUrl);
      await deps.recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Shipment",
        entityId: updated.id,
        metadata: { provider: loaded.cfg.provider, action: "shipment.manual-tracking" },
      });
      return reply.send(shippingShipmentMutationResponseSchema.parse({ shipment: serializeShipment(updated), alreadyExisted: false }));
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  /* ───────────── TODO-104 webhook secret/token rotate ─────────────
   * Secret yalniz BU yanit icinde BIR KEZ plain doner (ADR-035 deseni); DB'de
   * AES-256-GCM ciphertext saklanir, config response'unda ASLA gorunmez.
   * Rotate eski token+secret'i ANINDA gecersiz kilar. Audit yalniz alan ADI yazar. */
  app.post("/stores/:storeId/shipping/providers/:id/webhook/rotate", async (request, reply) => {
    const params = providerParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const cfg = await loadConfig(params.storeId, params.id);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));
    try {
      const webhookSecret = generateShippingWebhookSecret();
      const webhookToken = generateShippingWebhookToken();
      await prisma.shippingProviderConfig.update({
        where: { id: cfg.id },
        data: { webhookToken, webhookSecretCipher: cipher().encrypt(webhookSecret) },
      });
      await deps.recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "ShippingProviderConfig",
        entityId: cfg.id,
        metadata: { provider: cfg.provider, action: "webhook.rotate", fields: ["webhookToken", "webhookSecretCipher"] },
      });
      return reply.send(
        shippingWebhookRotateResponseSchema.parse({
          webhookPath: `/public/shipping/webhooks/${webhookToken}`,
          webhookSecret,
          rotatedAt: new Date().toISOString(),
        }),
      );
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  /* ───────────── TODO-100 store-level toplu tracking sync ─────────────
   * Terminal olmayan gonderileri mevcut applySync (getShipmentStatus+trackShipment)
   * ile senkronlar. Provider-agnostic: adapter registry dispatch eder; DHL Bulk
   * Query gibi saglayici-ozel toplu uclar ILERIDE bu ucun arkasina takilir.
   * Gonderi basina hata TUM isi durdurmaz; kod bazli ozet doner. */
  app.post("/stores/:storeId/shipping/shipments/sync-all", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shipmentSyncAllRequestSchema.parse(request.body ?? {});
    const shipments = await prisma.shipment.findMany({
      where: { storeId: params.storeId, status: { in: SYNCABLE_SHIPMENT_STATUSES } },
      orderBy: { updatedAt: "asc" },
      take: input.limit,
    });

    const cfgCache = new Map<string, ConfigWithCredentials | null>();
    const results: { shipmentId: string; ok: boolean; status: ShipmentStatus | null; errorCode: string | null }[] = [];
    let synced = 0;
    let failed = 0;
    let skipped = 0;

    for (const shipment of shipments) {
      let cfg = cfgCache.get(shipment.providerConfigId);
      if (cfg === undefined) {
        cfg = await loadConfig(params.storeId, shipment.providerConfigId);
        cfgCache.set(shipment.providerConfigId, cfg);
      }
      if (!cfg || cfg.status !== "ENABLED") {
        skipped += 1;
        results.push({ shipmentId: shipment.id, ok: false, status: shipment.status, errorCode: "PROVIDER_DISABLED" });
        continue;
      }
      try {
        const updated = await applySync(params.storeId, shipment, cfg);
        synced += 1;
        results.push({ shipmentId: shipment.id, ok: true, status: updated.status, errorCode: null });
      } catch (error) {
        failed += 1;
        const code = error instanceof ShippingConfigError ? error.code : "SYNC_FAILED";
        results.push({ shipmentId: shipment.id, ok: false, status: shipment.status, errorCode: code });
      }
    }

    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "Shipment",
      metadata: { action: "shipment.sync-all", scanned: shipments.length, synced, failed, skipped },
    });
    return reply.send(
      shipmentSyncAllResponseSchema.parse({ scanned: shipments.length, synced, failed, skipped, results }),
    );
  });
}

// F3C.6 — Saglayici tarih parser'i. OpenAPI formatlarina gore (dd-MM-yyyy HH:mm:ss
// eventDateTime/deliveryDateTime, dd.MM.yyyy jwtExpireDate, yyyy-MM-dd eventDateTime2,
// dd-MM-yyyy salt-tarih estimatedDeliveryDate). gun-once (dd?MM?yyyy) kalibi Date.parse'tan
// ONCE denenir: aksi halde JS "05-02-2019"u ABD MM-DD sayip YANLIS tarihe cevirir.
// Saat kismi opsiyoneldir. Cozulemeyen deger null'a duser (event kaydi kaybolmaz).
// F3C.6 — trackshipment KUMULATIF hareket listesi doner; ayni hareketin tekrar sync'te
// yeniden TRACKING_UPDATED yazilmamasi icin dogal anahtar. occurredAt parse edilmis Date
// uzerinden (ms) kurulur ki ham format farklari (dd-MM vs yyyy-MM-dd) ayni ani ayni saysın.
export function shipmentTrackingEventKey(e: {
  statusText: string | null;
  location: string | null;
  occurredAt: Date | null;
}): string {
  return `${e.statusText ?? ""}|${e.location ?? ""}|${e.occurredAt ? e.occurredAt.getTime() : ""}`;
}

export function parseProviderDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{2})[./-](\d{2})[./-](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, dd, mm, yyyy, hh, mi, ss] = m;
    const d = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh ?? "0"),
      Number(mi ?? "0"),
      Number(ss ?? "0"),
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = Date.parse(value);
  return Number.isNaN(iso) ? null : new Date(iso);
}

// F3C.3 (ADR-045) — DHL statusCode (0-7) → ic ShipmentStatus eslemesi (DHL yanitiyla
// netlestirildi). 3 ("teslim birimine ulasti") IN_TRANSIT alt-durumudur (ham kod
// shipmentStatusCode'da, ham metin statusText'te saklanir). 5/7 FINAL; 6 (teslim
// edilemedi) FINAL DEGIL → takip gerektirir.
// F3C.6: OpenAPI'deki 8 (Destek_Gerekiyor) BILEREK eslenmemistir — ic durumda karsiligi
// yok; bilinmeyen kod gibi mevcut durum korunur (ilerletilmez), ham kod/metin event'te kalir.
const DHL_STATUS_TO_SHIPMENT: Record<number, ShipmentStatus> = {
  0: "ORDER_CREATED",
  1: "LABEL_CREATED",
  2: "IN_TRANSIT",
  3: "IN_TRANSIT",
  4: "OUT_FOR_DELIVERY",
  5: "DELIVERED",
  6: "DELIVERY_FAILED",
  7: "RETURNED",
};

// Durum siralamasi (regresyon koruması). Eski/yanlis sync 0/1 kodu, lokal olarak
// ilerlemis durumu (or. LABEL_CREATED) GERI cekmemeli. Final durumlar en yuksek rank.
const SHIPMENT_STATUS_RANK: Record<ShipmentStatus, number> = {
  DRAFT: 0,
  ORDER_CREATED: 1,
  LABEL_PENDING: 1,
  LABEL_CREATED: 2,
  IN_TRANSIT: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERY_FAILED: 4,
  DELIVERED: 5,
  RETURNED: 5,
  CANCELLED: 5,
  FAILED: 5,
};

const TERMINAL_SHIPMENT_STATUSES: ShipmentStatus[] = ["DELIVERED", "RETURNED", "CANCELLED", "FAILED"];

// TODO-100 — toplu sync'e giren durumlar: terminal olmayan + saglayicida karsiligi
// olan gonderiler. DRAFT haric (henuz provider order'i yok → sync anlamsiz).
export const SYNCABLE_SHIPMENT_STATUSES: ShipmentStatus[] = [
  "ORDER_CREATED",
  "LABEL_PENDING",
  "LABEL_CREATED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERY_FAILED",
];

// getshipmentstatus durum → ic ShipmentStatus. Bilinmeyen/null kodda mevcut durum korunur;
// terminal durumdan geri donulmez; ileri olmayan koda regres edilmez.
export function mapProviderStatusToShipmentStatus(
  status: { statusCode: number | null; isDelivered: boolean },
  current: ShipmentStatus,
): ShipmentStatus {
  if (TERMINAL_SHIPMENT_STATUSES.includes(current)) return current;
  if (status.isDelivered) return "DELIVERED";
  if (status.statusCode == null) return current;
  const mapped = DHL_STATUS_TO_SHIPMENT[status.statusCode];
  if (!mapped) return current;
  // Final hedefe (DELIVERED/RETURNED) her zaman gec; aksi halde geri gitme.
  if (TERMINAL_SHIPMENT_STATUSES.includes(mapped)) return mapped;
  return SHIPMENT_STATUS_RANK[mapped] >= SHIPMENT_STATUS_RANK[current] ? mapped : current;
}

// Shipment (+events) → contract DTO. Secret/ZPL icermez; lastSynced/lastStatus event'ten turetilir.
export function serializeShipment(s: Shipment & { events: ShipmentEvent[] }) {
  const syncEvents = s.events.filter(
    (e) => e.eventType === "STATUS_CHANGED" || e.eventType === "TRACKING_UPDATED",
  );
  const lastSync = syncEvents.length > 0 ? syncEvents[syncEvents.length - 1] : null;
  const barcode = (s.barcodeJsonSafe ?? null) as { zplPresent?: boolean } | null;
  return {
    id: s.id,
    orderId: s.orderId,
    provider: s.provider,
    referenceId: s.referenceId,
    status: s.status,
    externalOrderId: s.externalOrderId,
    externalShipmentId: s.externalShipmentId,
    externalInvoiceId: s.externalInvoiceId,
    trackingNumber: s.trackingNumber,
    trackingUrl: s.trackingUrl,
    labelUrl: s.labelUrl,
    shipmentStatusCode: s.shipmentStatusCode,
    barcodeHasLabel: Boolean(barcode?.zplPresent),
    recipientName: s.recipientName,
    lastSyncedAt: lastSync ? lastSync.createdAt.toISOString() : null,
    lastProviderStatus: lastSync?.statusText ?? null,
    events: s.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      statusCode: e.statusCode,
      statusText: e.statusText,
      location: e.location,
      occurredAt: e.occurredAt ? e.occurredAt.toISOString() : null,
      trackingUrl: e.trackingUrl,
      createdAt: e.createdAt.toISOString(),
    })),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** configured: DEFAULT/diger tipler key varligi; IDENTITY tum zorunlu alanlar. */
function computeConfigured(
  type: ShippingCredentialType,
  enc: {
    encryptedKey: string | null;
    encryptedSecret: string | null;
    encryptedCustomerNumber: string | null;
    encryptedCustomerPassword: string | null;
  },
): boolean {
  if (type === "IDENTITY") {
    return Boolean(
      enc.encryptedKey && enc.encryptedSecret && enc.encryptedCustomerNumber && enc.encryptedCustomerPassword,
    );
  }
  return Boolean(enc.encryptedKey);
}
