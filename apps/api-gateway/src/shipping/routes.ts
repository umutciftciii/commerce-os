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
  isOrderPaidForShipment,
  type PaymentStatus,
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
  shippingWebhookInfoResponseSchema,
  shipmentRepairDestinationRequestSchema,
  shipmentRepairDestinationResponseSchema,
  shippingAddressUpdateRequestSchema,
  shippingAddressUpdateResponseSchema,
} from "@commerce-os/contracts";
import { z } from "zod";
import { ShippingConfigError } from "./errors.js";
import { resolveRecipientEmail } from "./recipient.js";
import { createCbsLookupService, type CbsLookupTarget } from "./cbs-resolver.js";
import {
  BARCODE_ERROR_DESTINATION_BRANCH_NOT_FOUND,
  classifyBarcodeProviderError,
} from "./adapters/dhl-ecommerce/mappers.js";
import { createShippingSecretCipher, type ShippingSecretCipher } from "./encryption.js";
import {
  createDisabledHttpTransport,
  createFetchHttpTransport,
  type ShippingHttpTransport,
} from "./adapters/http.js";
import { createShippingAdapterRegistry } from "./adapters/registry.js";
import {
  buildShipmentProviderInfo,
  buildShippingWebhookUrl,
  computeShipmentActionCapabilities,
  computeShippingCapabilities,
  manualTrackingNextStatus,
  serializeShippingProviderConfig,
  serializeShippingWebhookEvent,
  shipmentKpiBucket,
  type SerializedShippingProviderConfig,
  type ShippingEnvGuards,
} from "./serialize.js";
import type { ShippingActionContext } from "./types.js";
import { buildShippingActionContext } from "./context.js";
import { generateShippingWebhookSecret, generateShippingWebhookToken } from "./webhook.js";
import {
  createPrismaShipmentSyncPersistence,
  createShipmentSyncService,
  type ShipmentSyncService,
} from "./sync-service.js";

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
// TODO-128 — webhook son olaylar limiti; varsayilan 20, ust sinir 50 (DoS/agirlik onlemi).
const webhookEventsQuery = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
});

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
      // TODO-132 — alici e-posta lokal dogrulamasi (saglayici cagrisindan ONCE).
      RECIPIENT_EMAIL_REQUIRED: 422,
      RECIPIENT_EMAIL_INVALID: 422,
      // TODO-124 — CBS il/ilce eslemesi: prepare oncesi cozumleme basarisiz (422,
      // saglayici CAGRILMADI) + onarim kod dogrulamasi + repair uygunluk hatasi.
      ADDRESS_DISTRICT_CODE_REQUIRED: 422,
      CBS_CODE_INVALID: 422,
      REPAIR_NOT_APPLICABLE: 409,
      // TODO-139 — gönderi taşınırken/teslim edildikten sonra adres snapshot kilidi.
      SHIPMENT_ADDRESS_LOCKED: 409,
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

  // TODO-129 — credential cozme + guard hesaplamasi context.ts'e TASINDI (davranis ayni);
  // zamanlanmis sync worker'i ile paylasilir. Bu wrapper mevcut cagri noktalarini korur.
  function buildContext(cfg: ConfigWithCredentials): ShippingActionContext {
    return buildShippingActionContext(config, cfg);
  }

  // TODO-129 — manuel tekil sync + sync-all + zamanlanmis worker AYNI cekirdegi kullanir.
  const syncService: ShipmentSyncService = createShipmentSyncService({
    config,
    registry,
    persistence: createPrismaShipmentSyncPersistence(),
  });

  // TODO-124 — CBS il/ilce lookup'i (TTL cache'li; saglayici asiri CAGRILMAZ).
  const cbsLookup = createCbsLookupService();

  function cbsTarget(cfg: ConfigWithCredentials, ctx: ShippingActionContext): CbsLookupTarget {
    return { cacheKey: cfg.id, adapter: registry.get(cfg.provider), context: ctx };
  }

  /**
   * TODO-124 — DHL/MNG icin alici il/ilce kodlarini SAGLAYICI CAGRISINDAN ONCE cozer.
   *  - Gecerli sakli kod cifti aynen korunur (OS-000050 yolu).
   *  - CBS exact match → kodlar + KANONIK adlar payload'a girer.
   *  - CBS verisi varken il/ilce ESLESMEZSE saglayici cagrilmadan 422
   *    ADDRESS_DISTRICT_CODE_REQUIRED (bozuk saglayici kaydi/varis subesi hatasi
   *    olusmadan admin'e aksiyon mesaji).
   *  - CBS'e ulasilamiyorsa / il-ilce metni yoksa BLOKLAMAZ: mevcut isim-bazli
   *    davranis surer (OS-000041/43 regresyonu). Serbest adres metninden ilce
   *    TAHMIN EDILMEZ (fuzzy yok).
   */
  async function resolveDhlRecipientGeo<T extends { cityCode?: number; districtCode?: number; cityName?: string; districtName?: string }>(
    cfg: ConfigWithCredentials,
    ctx: ShippingActionContext,
    recipient: T,
  ): Promise<T> {
    if (cfg.provider !== "DHL_ECOMMERCE") return recipient;
    const resolution = await cbsLookup.resolveRecipientGeo(cbsTarget(cfg, ctx), recipient);
    if (resolution.status === "MATCHED") {
      return {
        ...recipient,
        cityCode: resolution.cityCode!,
        districtCode: resolution.districtCode!,
        cityName: resolution.cityName ?? recipient.cityName,
        districtName: resolution.districtName ?? recipient.districtName,
      };
    }
    if (resolution.status === "CITY_NOT_MATCHED" || resolution.status === "DISTRICT_NOT_MATCHED") {
      throw new ShippingConfigError(
        "ADDRESS_DISTRICT_CODE_REQUIRED",
        "Alıcı il/ilçe bilgisi kargo firmasında eşleşmedi. Lütfen adres il/ilçe bilgisini düzeltin.",
      );
    }
    // ALREADY_CODED (kodlar recipient'ta zaten var) / INPUT_MISSING / CBS_UNAVAILABLE.
    return recipient;
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

  /**
   * TODO-136 — Gönderi oluşturma ödeme ön koşulu. Ödemesi ALINMAMIŞ sipariş kargoya
   * VERİLEMEZ: sağlayıcıya İSTEK ATILMADAN, Shipment/ShipmentEvent kaydı OLUŞTURULMADAN
   * 409 ORDER_PAYMENT_REQUIRED döner (DUPLICATE_SHIPMENT ile aynı "sipariş durumu çatışması"
   * konvansiyonu). Uygunluk `isOrderPaidForShipment` (PAID/AUTHORIZED) ile belirlenir; UI
   * "Gönderi Oluştur"u ayrıca gizler/pasifleştirir ama backend guard NİHAİ otoritedir.
   * Döner: uygunsa `true`; değilse yanıtı gönderip `false`.
   */
  function ensureOrderPaidForShipment(
    order: { paymentStatus: PaymentStatus },
    reply: FastifyReply,
  ): boolean {
    if (isOrderPaidForShipment(order.paymentStatus)) return true;
    reply
      .code(409)
      .send(
        errorBody(
          "ORDER_PAYMENT_REQUIRED",
          "Ödeme alınmadan gönderi oluşturulamaz. Gönderi oluşturmak için siparişin ödemesi tamamlanmalıdır.",
          { paymentStatus: order.paymentStatus },
        ),
      );
    return false;
  }

  /**
   * TODO-132 — Sağlayıcıya giden alıcı e-postası SUNUCU-otoriterdir: sipariş
   * seviyesindeki e-posta (Order.customerEmail) → bağlı Customer.email fallback'i.
   * Geçerli e-posta yoksa sağlayıcı ÇAĞRILMADAN RECIPIENT_EMAIL_REQUIRED/INVALID
   * fırlatılır (422). Client'tan gelen recipient.email GÜVENİLMEZ, üzerine yazılır.
   */
  async function resolveOrderRecipientEmail(order: { id: string; customerEmail: string; customerId: string | null }): Promise<string> {
    const customer = order.customerId
      ? await prisma.customer.findUnique({ where: { id: order.customerId }, select: { email: true } })
      : null;
    const resolution = resolveRecipientEmail([order.customerEmail, customer?.email]);
    if (!resolution.ok) {
      throw new ShippingConfigError(
        resolution.code,
        resolution.code === "RECIPIENT_EMAIL_REQUIRED"
          ? "Kargo gönderisi için alıcı e-posta adresi gerekli; siparişte veya müşteri kaydında e-posta bulunamadı."
          : "Siparişteki/müşteri kaydındaki alıcı e-posta adresi geçerli değil.",
      );
    }
    return resolution.email;
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
    // TODO-136 — Ödeme alınmadan gönderi oluşturulamaz (sağlayıcı çağrısı/Shipment YOK).
    if (!ensureOrderPaidForShipment(order, reply)) return;
    const cfg = await loadConfig(params.storeId, input.providerConfigId);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));
    try {
      const ctx = buildContext(cfg);
      // TODO-132 — DHL/MNG saglayicisina giden alici e-postasi sunucuda cozulur
      // (Order.customerEmail → Customer.email); gecersizse saglayici CAGRILMADAN 422.
      // TODO-124 — il/ilce kodlari da saglayici cagrisindan ONCE CBS'ten cozulur.
      const recipient =
        cfg.provider === "DHL_ECOMMERCE"
          ? await resolveDhlRecipientGeo(cfg, ctx, {
              ...input.recipient,
              email: await resolveOrderRecipientEmail(order),
            })
          : input.recipient;
      const result = await registry.get(cfg.provider).createOrder({
        context: ctx,
        referenceId: input.referenceId,
        shipmentServiceType: input.shipmentServiceType,
        packagingType: input.packagingType,
        paymentType: input.paymentType,
        deliveryType: input.deliveryType,
        content: input.content,
        recipient,
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
      // TODO-124 — TTL cache uzerinden (repair dropdown'lari da bunu kullanir).
      const cities = await cbsLookup.getCities(cbsTarget(cfg, buildContext(cfg)));
      return { cities };
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  // TODO-124 — CBS ilce listesi (repair/eslestirme dropdown'i icin; TTL cache'li).
  app.post("/stores/:storeId/shipping/dhl/cbs/districts", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = z
      .object({ providerConfigId: z.string().min(1), cityCode: z.coerce.number().int().positive() })
      .parse(request.body);
    const cfg = await loadConfig(params.storeId, body.providerConfigId);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));
    try {
      const districts = await cbsLookup.getDistricts(cbsTarget(cfg, buildContext(cfg)), String(body.cityCode));
      return { districts };
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

  // TODO-139 — Teslimat adresi snapshot'ı YALNIZ sağlayıcıya/taşımaya devredilmeden önce
  // düzeltilebilir. TODO-124 repair guard'ıyla birebir tutarlı: barkod/etiket oluştuğunda
  // (LABEL_CREATED) veya gönderi hareket ettiğinde (IN_TRANSIT+) KİLİTLİDİR. Aktif gönderi
  // YOKSA (iptal/başarısız → duplicate guard aktif saymaz) yalnız OrderAddress güncellenir.
  const ADDRESS_EDITABLE_SHIPMENT_STATUSES: ShipmentStatus[] = ["DRAFT", "ORDER_CREATED", "LABEL_PENDING"];

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
    // TODO-124 — errorCode: sinif­landirilmis barkod hatasi (or.
    // DESTINATION_BRANCH_NOT_FOUND) ya da null (generic retryable).
    | { kind: "retryable"; errorCode: string | null };

  /**
   * TODO-124 — barkod "retryable" 409 yaniti. Varis subesi sinif­landirmasi
   * PROVIDER_DESTINATION_BRANCH_UNRESOLVED olarak ozellesir (UI onarim CTA'sini
   * buna gore acar); diger domain hatalari mevcut BARCODE_RETRYABLE_ERROR kalir.
   */
  function sendBarcodeRetryableError(reply: FastifyReply, errorCode: string | null) {
    if (errorCode === BARCODE_ERROR_DESTINATION_BRANCH_NOT_FOUND) {
      return reply.code(409).send(
        errorBody(
          "PROVIDER_DESTINATION_BRANCH_UNRESOLVED",
          "Varış şubesi bulunamadı. Alıcı il/ilçe bilgisi kargo firmasında eşleşmedi; adres il/ilçe eşlemesini düzeltip tekrar deneyin.",
          { retryable: true },
        ),
      );
    }
    return reply.code(409).send(
      errorBody(
        "BARCODE_RETRYABLE_ERROR",
        "Varış şubesi/hat kodu belirlenemedi. Adres bilgisi kontrol edilmeli veya işlem daha sonra tekrar denenmeli.",
        { retryable: true },
      ),
    );
  }

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
      // TODO-124 — MNG 20001 "VARIŞ ŞUBESİ BULUNAMADI" → DESTINATION_BRANCH_NOT_FOUND.
      // Sinif­landirilan hatada admin-guvenli TR kopya yazilir (raw saglayici metni
      // musteri DTO'suna zaten cikmiyor; admin'e de aksiyon alinabilir mesaj gider).
      // Shipment.lastBarcodeErrorCode TODO-123 retry worker'inin "admin duzeltmesine
      // kadar SKIP" sinyalidir; durum ILERLEMEZ, retry mumkun kalir (ADR-045).
      const classified = classifyBarcodeProviderError(result.providerErrorCode, result.providerErrorMessage);
      const statusText =
        classified === BARCODE_ERROR_DESTINATION_BRANCH_NOT_FOUND
          ? "Varış şubesi bulunamadı. Alıcı il/ilçe bilgisi kargo firmasında eşleşmedi."
          : result.providerErrorMessage;
      const failed = await prisma.shipment.update({
        where: { id: shipment.id },
        data: { lastBarcodeErrorCode: classified ?? "BARCODE_PROVIDER_ERROR" },
      });
      await recordShipmentEvent(storeId, failed, "BARCODE_FAILED", {
        statusText,
        rawSafeJson: {
          providerError: true,
          errorCode: classified,
          providerErrorCode: result.providerErrorCode,
          message: result.providerErrorMessage,
          shipmentIdPresent: Boolean(result.externalShipmentId),
          barcodeCount: result.barcodes.length,
        },
      });
      return { kind: "retryable", errorCode: classified };
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
        // Bos-200 pending saglayici DOMAIN hatasi degildir → sinif­landirma sifirlanir.
        data: { status: "LABEL_PENDING", barcodeJsonSafe, lastBarcodeErrorCode: null },
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
        // Basarili barkod → onceki sinif­landirilmis hata temizlenir.
        lastBarcodeErrorCode: null,
      },
    });
    await recordShipmentEvent(storeId, updated, "BARCODE_CREATED", {
      statusText: "Barkod oluşturuldu",
      rawSafeJson: barcodeJsonSafe,
    });
    return { kind: "label", shipment: await reloadShipment(updated.id) };
  }

  // getshipmentstatus + trackshipment → durum/hareket senkronu (terminal/regresyon korumali).
  // TODO-129 — cekirdek sync-service.ts'e TASINDI; manuel uc + zamanlanmis worker ayni
  // mantigi kullanir (drift yok). Ek olarak STATUS_CHANGED artik yalniz gercek degisimde
  // yazilir (tekrarlanan sync duplicate event uretmez). Saglayici hatasi FIRLATILIR
  // (mevcut sendShippingError davranisi korunur); firlatmadan once sanitize hata kodu
  // + backoff metadata'si Shipment'a yazilir.
  async function applySync(_storeId: string, shipment: Shipment, cfg: ConfigWithCredentials) {
    await syncService.syncShipmentWithProvider(shipment, cfg);
    return reloadShipment(shipment.id);
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
    // TODO-136 — Ödeme alınmadan gönderi oluşturulamaz: createRecipient/createOrder ÇAĞRILMAZ,
    // Shipment/ShipmentEvent OLUŞTURULMAZ (backend NİHAİ otorite).
    if (!ensureOrderPaidForShipment(order, reply)) return;

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
      // TODO-132 — alici e-postasi sunucuda cozulur (Order.customerEmail → Customer.email);
      // gecerli e-posta yoksa saglayici CAGRILMADAN 422 doner. MNG bos e-postayi 400 kod
      // 26039 ile reddettiginden email: "" ASLA gonderilmez.
      // TODO-124 — il/ilce kodlari CBS'ten cozulur; CBS verisi varken eslesme yoksa
      // saglayici CAGRILMADAN 422 ADDRESS_DISTRICT_CODE_REQUIRED (bozuk MNG kaydi +
      // barkodda 20001 "VARIŞ ŞUBESİ BULUNAMADI" bu adimda onlenir).
      const recipient = await resolveDhlRecipientGeo(cfg, ctx, {
        ...input.recipient,
        email: await resolveOrderRecipientEmail(order),
      });
      const adapter = registry.get(cfg.provider);
      // 1) createRecipient — varis sube/hat kodu tespiti (guard altinda).
      await adapter.createRecipient({
        context: ctx,
        referenceId,
        recipient,
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
        recipient,
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
          recipientName: recipient.fullName ?? null,
          // Cozulmus (sunucu-otoriter) e-posta persist edilir; client input DEGIL.
          recipientEmail: recipient.email,
          recipientPhone: recipient.phone ?? null,
          recipientCityCode: recipient.cityCode ?? null,
          recipientDistrictCode: recipient.districtCode ?? null,
          recipientCityName: recipient.cityName ?? null,
          recipientDistrictName: recipient.districtName ?? null,
          recipientAddress: recipient.address ?? null,
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
    // TODO-136 — Manuel taslak da olsa ödeme alınmadan gönderi kaydı OLUŞTURULMAZ.
    if (!ensureOrderPaidForShipment(order, reply)) return;

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
        return sendBarcodeRetryableError(reply, r.errorCode);
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
      // TODO-129 — degisiklik yoksa sync event yazilmaz; son sync ani Shipment.lastSyncAt'ten.
      lastSyncedAt: s.lastSyncAt ? s.lastSyncAt.toISOString() : ev.lastSyncedAt,
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
        return sendBarcodeRetryableError(reply, r.errorCode);
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

  /* ───────────── TODO-124 varis il/ilce eslemesi onarimi ─────────────
   * Kullanim: barkod MNG 20001 "VARIŞ ŞUBESİ BULUNAMADI" ile dustugunde (or.
   * OS-000053) admin CBS-dogrulamali il/ilce kodu secer. Akis:
   *  1) Kodlar CBS listesinden SUNUCUDA dogrulanir (CBS_CODE_INVALID yoksa kayit yok).
   *  2) Shipment recipient SNAPSHOT'i guncellenir (tarihsel musteri adresi MUTASYONA
   *     UGRAMAZ); lastBarcodeErrorCode sifirlanir (TODO-123 skip sinyali kalkar).
   *  3) Ayni referenceId ile createRecipient saglayiciya YENIDEN iletilir (guard'li).
   *     Saglayici reddederse yerel duzeltme KORUNUR, providerResent=false + sanitize
   *     kod doner — sahte basari YOK. MNG'nin mevcut siparis kaydini guncelledigi
   *     GARANTI DEGILDIR; UI bu sinirlamayi acikca soyler.
   * Duplicate guard'a dokunulmaz: yeni Shipment ACILMAZ, yalniz mevcut kayit onarilir. */
  app.post("/stores/:storeId/shipping/shipments/:shipmentId/repair-destination", async (request, reply) => {
    const params = shipmentIdParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shipmentRepairDestinationRequestSchema.parse(request.body);
    const loaded = await loadStoreShipmentWithCfg(params.storeId, params.shipmentId);
    if (!loaded) return reply.code(404).send(errorBody("SHIPMENT_NOT_FOUND", "Gönderi bulunamadı."));
    const { shipment, cfg } = loaded;
    if (cfg.provider !== "DHL_ECOMMERCE") {
      return reply
        .code(409)
        .send(errorBody("REPAIR_NOT_APPLICABLE", "İl/ilçe eşleme onarımı yalnız DHL/MNG gönderileri için geçerlidir."));
    }
    // Barkod OLUSMUS/tasima baslamis gonderide varis eslemesi degistirilemez.
    if (shipment.status !== "ORDER_CREATED" && shipment.status !== "LABEL_PENDING") {
      return reply
        .code(409)
        .send(errorBody("REPAIR_NOT_APPLICABLE", "Bu gönderi durumunda il/ilçe eşlemesi düzeltilemez."));
    }
    try {
      const ctx = buildContext(cfg);
      // 1) Kod dogrulama — CBS listesinde YOKSA kayit yapilmaz (CBS_CODE_INVALID 422).
      const canonical = await cbsLookup.validateCodes(cbsTarget(cfg, ctx), input.cityCode, input.districtCode);
      // 2) Yerel snapshot duzeltmesi (yalniz Shipment; siparis/musteri adresi degismez).
      const repaired = await prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          recipientCityCode: input.cityCode,
          recipientDistrictCode: input.districtCode,
          recipientCityName: canonical.cityName,
          recipientDistrictName: canonical.districtName,
          lastBarcodeErrorCode: null,
        },
      });
      // 3) Saglayiciya duzeltilmis alici kaydini yeniden ilet (ayni referenceId; guard'li).
      let providerResent = false;
      let providerErrorCode: string | null = null;
      try {
        await registry.get(cfg.provider).createRecipient({
          context: ctx,
          referenceId: shipment.referenceId,
          recipient: {
            fullName: shipment.recipientName ?? undefined,
            email: shipment.recipientEmail ?? undefined,
            phone: shipment.recipientPhone ?? undefined,
            cityCode: input.cityCode,
            districtCode: input.districtCode,
            cityName: canonical.cityName,
            districtName: canonical.districtName,
            address: shipment.recipientAddress ?? undefined,
          },
          explicitConfirm: input.explicitConfirm,
        });
        providerResent = true;
      } catch (error) {
        // Yerel duzeltme KORUNUR; saglayici hatasi sanitize kodla rapor edilir.
        if (!(error instanceof ShippingConfigError)) throw error;
        providerErrorCode = error.code;
      }
      await recordShipmentEvent(params.storeId, repaired, "DESTINATION_REPAIRED", {
        statusText: providerResent
          ? "Varış il/ilçe eşlemesi düzeltildi; alıcı kaydı sağlayıcıya yeniden iletildi."
          : "Varış il/ilçe eşlemesi düzeltildi (sağlayıcıya yeniden iletilemedi; barkod denemesi düzeltilmiş kodlarla yapılacak).",
        rawSafeJson: {
          repaired: true,
          cityCode: input.cityCode,
          districtCode: input.districtCode,
          providerResent,
          providerErrorCode,
        },
      });
      await deps.recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Shipment",
        entityId: repaired.id,
        metadata: { provider: cfg.provider, action: "shipment.repair-destination", providerResent },
      });
      return reply.send(
        shipmentRepairDestinationResponseSchema.parse({
          shipment: serializeShipment(await reloadShipment(repaired.id)),
          providerResent,
          providerErrorCode,
        }),
      );
    } catch (error) {
      return sendShippingError(reply, error);
    }
  });

  /* ───────────── TODO-139 sipariş teslimat adresi snapshot düzenleme ─────────────
   * Admin, siparişin teslimat adresini (OrderAddress SHIPPING) — ve gönderi hâlâ güvenli
   * düzenlenebilir durumdaysa Shipment alıcı snapshot'ını — düzeltir. Bu MÜŞTERİ adres
   * defterini/profilini DEĞİL, yalnız BU siparişi etkiler. Duplicate guard'a dokunulmaz;
   * otomatik yeni gönderi OLUŞTURULMAZ. il/ilçe kodu client'tan gelse bile CBS'e karşı
   * YENİDEN doğrulanır (0/negatif ASLA kaydedilmez; exact-match, fuzzy YOK). */
  app.patch("/stores/:storeId/orders/:orderId/shipping/address", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingAddressUpdateRequestSchema.parse(request.body);
    const order = await requireOrder(params.storeId, params.orderId);
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Sipariş bulunamadı."));

    // Aktif gönderi (iptal/başarısız hariç) varsa yalnız güvenli durumda düzenlenebilir.
    const activeShipment = await findActiveShipment(params.storeId, order.id);
    if (activeShipment && !ADDRESS_EDITABLE_SHIPMENT_STATUSES.includes(activeShipment.status)) {
      return reply.code(409).send(
        errorBody(
          "SHIPMENT_ADDRESS_LOCKED",
          "Kargoya verilmiş/teslim aşamasındaki siparişlerde teslimat adresi değiştirilemez.",
          { shipmentId: activeShipment.id, status: activeShipment.status },
        ),
      );
    }

    // Gönderi düzenlenebilir & DHL ise CBS ile il/ilçe kodu çözümü/doğrulaması.
    const cfg = activeShipment ? await loadConfig(params.storeId, activeShipment.providerConfigId) : null;
    const isDhl = cfg?.provider === "DHL_ECOMMERCE";
    const providerRepairSupported = isDhl;

    let resolvedCityCode: number | null = null;
    let resolvedDistrictCode: number | null = null;
    let resolvedCityName: string | null = input.cityName;
    let resolvedDistrictName: string | null = input.districtName ?? null;
    let cbsMatched = false;

    try {
      if (isDhl && cfg) {
        const ctx = buildContext(cfg);
        const target = cbsTarget(cfg, ctx);
        if (input.cityCode != null && input.districtCode != null) {
          // Client CBS dropdown'undan kod seçti → CBS'e karşı YENİDEN doğrula (körü körüne güvenme).
          const canonical = await cbsLookup.validateCodes(target, input.cityCode, input.districtCode);
          resolvedCityCode = input.cityCode;
          resolvedDistrictCode = input.districtCode;
          resolvedCityName = canonical.cityName;
          resolvedDistrictName = canonical.districtName;
          cbsMatched = true;
        } else {
          // Kod verilmedi → yeni il/ilçe adından exact-match çöz (fuzzy YOK). Eşleşmezse kod
          // null bırakılır (bayat kod persist EDİLMEZ; barkod adımında CBS tekrar denenir).
          const resolution = await cbsLookup.resolveRecipientGeo(target, {
            cityName: input.cityName,
            districtName: input.districtName ?? undefined,
          });
          if (resolution.status === "MATCHED") {
            resolvedCityCode = resolution.cityCode;
            resolvedDistrictCode = resolution.districtCode;
            resolvedCityName = resolution.cityName ?? input.cityName;
            resolvedDistrictName = resolution.districtName ?? input.districtName ?? null;
            cbsMatched = true;
          }
        }
      }
    } catch (error) {
      return sendShippingError(reply, error);
    }

    const existingShippingAddr = await prisma.orderAddress.findFirst({
      where: { orderId: order.id, storeId: params.storeId, type: "SHIPPING" },
    });
    const countryCode = input.countryCode ?? existingShippingAddr?.countryCode ?? "TR";

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1) Sipariş teslimat snapshot'ı (OrderAddress SHIPPING). Yoksa oluştur (yalnız bu sipariş).
        const addrData = {
          fullName: input.recipientName,
          phone: input.recipientPhone ?? null,
          countryCode,
          city: input.cityName,
          district: input.districtName ?? null,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2 ?? null,
          postalCode: input.postalCode ?? null,
        };
        const shippingAddress = existingShippingAddr
          ? await tx.orderAddress.update({ where: { id: existingShippingAddr.id }, data: addrData })
          : await tx.orderAddress.create({
              data: { storeId: params.storeId, orderId: order.id, type: "SHIPPING", ...addrData },
            });

        // 2) Sipariş olayı (müşteri adres defteri DEĞİL; yalnız bu sipariş).
        await tx.orderEvent.create({
          data: {
            storeId: params.storeId,
            orderId: order.id,
            type: "SHIPPING_ADDRESS_UPDATED",
            message: "Teslimat adresi güncellendi (bu sipariş).",
            actorUserId: access.actorUserId,
            metadata: { cbsMatched, hasShipment: Boolean(activeShipment), shipmentId: activeShipment?.id ?? null },
          },
        });

        // 3) Gönderi alıcı snapshot'ı (varsa & düzenlenebilir). Kod eşleşince lastBarcodeErrorCode temizlenir.
        let updatedShipment: Shipment | null = null;
        if (activeShipment) {
          updatedShipment = await tx.shipment.update({
            where: { id: activeShipment.id },
            data: {
              recipientName: input.recipientName,
              recipientPhone: input.recipientPhone ?? null,
              recipientCityName: resolvedCityName,
              recipientDistrictName: resolvedDistrictName,
              recipientAddress: input.addressLine1,
              // Yeni eşleşen kod persist edilir; eşleşmeyen DHL adresinde bayat kod NULL'lanır
              // (0/negatif ASLA). DHL olmayan sağlayıcıda kod alanı kullanılmaz → dokunma.
              recipientCityCode: cbsMatched ? resolvedCityCode : isDhl ? null : activeShipment.recipientCityCode,
              recipientDistrictCode: cbsMatched
                ? resolvedDistrictCode
                : isDhl
                  ? null
                  : activeShipment.recipientDistrictCode,
              ...(cbsMatched ? { lastBarcodeErrorCode: null } : {}),
            },
          });
        }
        return { shippingAddress, updatedShipment };
      });

      // 4) Sağlayıcı kayıt onarımı (yalnız güvenli & desteklenen & geçerli kodlu). Yerel snapshot
      // KORUNUR; başarısızlık sanitize kodla raporlanır (sahte başarı YOK, yeni gönderi YOK).
      let providerResent = false;
      let providerErrorCode: string | null = null;
      if (result.updatedShipment && isDhl && cbsMatched && cfg) {
        try {
          await registry.get(cfg.provider).createRecipient({
            context: buildContext(cfg),
            referenceId: result.updatedShipment.referenceId,
            recipient: {
              fullName: input.recipientName,
              email: result.updatedShipment.recipientEmail ?? undefined,
              phone: input.recipientPhone ?? undefined,
              cityCode: resolvedCityCode ?? undefined,
              districtCode: resolvedDistrictCode ?? undefined,
              cityName: resolvedCityName ?? undefined,
              districtName: resolvedDistrictName ?? undefined,
              address: input.addressLine1,
            },
            explicitConfirm: input.explicitConfirm,
          });
          providerResent = true;
        } catch (error) {
          if (!(error instanceof ShippingConfigError)) throw error;
          providerErrorCode = error.code;
        }
      }

      // 5) Gönderi olayı — DESTINATION_REPAIRED yeniden kullanılır (yeni enum/migration YOK).
      if (result.updatedShipment) {
        await recordShipmentEvent(params.storeId, result.updatedShipment, "DESTINATION_REPAIRED", {
          statusText: providerResent
            ? "Teslimat adresi güncellendi; alıcı kaydı sağlayıcıya yeniden iletildi."
            : "Teslimat adresi güncellendi (sağlayıcı kaydı otomatik güncellenemeyebilir; gerekirse yeni gönderi).",
          rawSafeJson: {
            addressUpdated: true,
            cbsMatched,
            cityCode: resolvedCityCode,
            districtCode: resolvedDistrictCode,
            providerResent,
            providerErrorCode,
          },
        });
      }

      await deps.recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Order",
        entityId: order.id,
        metadata: {
          action: "order.shipping-address.update",
          cbsMatched,
          shipmentId: result.updatedShipment?.id ?? null,
          providerResent,
        },
      });

      const finalShipment = result.updatedShipment ? await reloadShipment(result.updatedShipment.id) : null;
      const a = result.shippingAddress;
      return reply.send(
        shippingAddressUpdateResponseSchema.parse({
          shippingAddress: {
            id: a.id,
            storeId: a.storeId,
            orderId: a.orderId,
            type: a.type,
            fullName: a.fullName,
            phone: a.phone ?? null,
            countryCode: a.countryCode,
            city: a.city,
            district: a.district ?? null,
            addressLine1: a.addressLine1,
            addressLine2: a.addressLine2 ?? null,
            postalCode: a.postalCode ?? null,
          },
          shipment: finalShipment ? serializeShipment(finalShipment) : null,
          cbsMatched,
          providerRepairSupported,
          providerResent,
          providerErrorCode,
        }),
      );
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

  /* ───────────── TODO-128 webhook bilgi + son olaylar (store-admin gozlem) ─────────────
   * Tekil, YETKILI uc. Tam webhook URL'si YALNIZ burada doner (bulk config DTO'sunda
   * token asla yer almaz; rotate ile ayni admin-gorunur token deseni). Son olaylar
   * ShipmentWebhookInbox'tan {storeId, providerConfigId} SCOPED cekilir → cross-store
   * sizinti IMKANSIZ. DTO KESIN ALLOWLIST: payloadHash/raw/imza/secret/header DONMEZ. */
  app.get("/stores/:storeId/shipping/providers/:id/webhook", async (request, reply) => {
    const params = providerParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const query = webhookEventsQuery.parse(request.query);
    const cfg = await loadConfig(params.storeId, params.id);
    if (!cfg) return reply.code(404).send(errorBody("SHIPPING_PROVIDER_NOT_FOUND", "Sağlayıcı bulunamadı."));
    const events = await prisma.shipmentWebhookInbox.findMany({
      where: { storeId: params.storeId, providerConfigId: cfg.id },
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
    return reply.send(
      shippingWebhookInfoResponseSchema.parse({
        webhookConfigured: Boolean(cfg.webhookToken && cfg.webhookSecretCipher),
        webhookUrl: buildShippingWebhookUrl(config.PUBLIC_WEBHOOK_BASE_URL, cfg.webhookToken),
        webhookBaseUrlConfigured: Boolean(config.PUBLIC_WEBHOOK_BASE_URL),
        events: events.map(serializeShippingWebhookEvent),
      }),
    );
  });

  /* ───────────── TODO-100 store-level toplu tracking sync ─────────────
   * Terminal olmayan gonderileri cekirdek sync servisi (sync-service.ts) ile senkronlar.
   * Provider-agnostic: adapter registry dispatch eder; DHL Bulk Query gibi saglayici-ozel
   * toplu uclar ILERIDE bu ucun arkasina takilir. Gonderi basina hata TUM isi durdurmaz;
   * kod bazli ozet doner.
   * TODO-129 — zamanlanmis worker AYNI cekirdegi kullanir; manuel uc force=true ile
   * stale-after/backoff/attempt filtrelerini ATLAR (admin "simdi tazele" niyeti). */
  app.post("/stores/:storeId/shipping/shipments/sync-all", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shipmentSyncAllRequestSchema.parse(request.body ?? {});
    const summary = await syncService.syncEligibleShipments({
      storeId: params.storeId,
      force: true,
      batchSize: input.limit,
    });

    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "Shipment",
      metadata: {
        action: "shipment.sync-all",
        scanned: summary.scanned,
        synced: summary.synced,
        failed: summary.failed,
        skipped: summary.skipped,
      },
    });
    return reply.send(
      shipmentSyncAllResponseSchema.parse({
        scanned: summary.scanned,
        synced: summary.synced,
        failed: summary.failed,
        skipped: summary.skipped,
        results: summary.results.map((r) => ({
          shipmentId: r.shipmentId,
          ok: r.ok,
          status: r.status,
          errorCode: r.errorCode,
        })),
      }),
    );
  });
}

// TODO-129 — Durum esleme/sync saf yardimcilari status-map.ts'e TASINDI (davranis ayni);
// buradan re-export geriye donuk uyumluluk icindir (webhook-routes + mevcut testler).
export {
  mapProviderStatusToShipmentStatus,
  parseProviderDate,
  shipmentTrackingEventKey,
  SYNCABLE_SHIPMENT_STATUSES,
} from "./status-map.js";

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
    // TODO-124 — varis eslemesi goruntuleme/onarim icin recipient SNAPSHOT'i (admin API;
    // musteri DTO'su DEGIL). Secret/raw saglayici verisi icermez.
    recipientCityCode: s.recipientCityCode,
    recipientDistrictCode: s.recipientDistrictCode,
    recipientCityName: s.recipientCityName,
    recipientDistrictName: s.recipientDistrictName,
    recipientAddress: s.recipientAddress,
    // TODO-124 — son barkod denemesinin sinif­landirilmis hata kodu (TODO-123 girdisi).
    lastBarcodeErrorCode: s.lastBarcodeErrorCode,
    // TODO-129 — degisiklik yoksa sync event yazilmaz; son sync ani Shipment.lastSyncAt'ten
    // (yoksa eski davranis: son sync event'inin ani).
    lastSyncedAt: s.lastSyncAt
      ? s.lastSyncAt.toISOString()
      : lastSync
        ? lastSync.createdAt.toISOString()
        : null,
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
