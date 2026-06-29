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
  ShippingCredentialType,
  ShippingProviderConfig,
  ShippingProviderCredential,
} from "@prisma/client";
import {
  orderShippingResponseSchema,
  shippingCreateBarcodeRequestSchema,
  shippingCreateOrderRequestSchema,
  shippingCredentialUpsertRequestSchema,
  shippingProviderConfigCreateRequestSchema,
  shippingProviderConfigListResponseSchema,
  shippingProviderConfigUpdateRequestSchema,
  shippingProviderTestResponseSchema,
  shippingRateRequestSchema,
  shippingRateResponseSchema,
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
  computeShippingCapabilities,
  serializeShippingProviderConfig,
  type SerializedShippingProviderConfig,
  type ShippingEnvGuards,
} from "./serialize.js";
import type {
  ResolvedShippingCredential,
  ResolvedShippingCredentials,
  ShippingActionContext,
} from "./types.js";

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
      NOT_IMPLEMENTED: 409,
      OPERATION_NOT_SUPPORTED: 409,
      AUTH_FAILED: 502,
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
  };
  const serialize = (cfg: ConfigWithCredentials): SerializedShippingProviderConfig =>
    serializeShippingProviderConfig(cfg, envGuards);

  const transport: ShippingHttpTransport = config.SHIPPING_SANDBOX_HTTP_ENABLED
    ? createFetchHttpTransport()
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
    });
    return orderShippingResponseSchema.parse({
      shipments: shipments.map((s) => ({
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
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
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
