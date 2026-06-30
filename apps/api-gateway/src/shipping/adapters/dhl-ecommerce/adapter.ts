import { ShippingConfigError } from "../../errors.js";
import type { ShippingHttpResponse, ShippingHttpTransport } from "../http.js";
import {
  assertBarcodeCreateAllowed,
  assertCancelAllowed,
  assertOrderCreateAllowed,
  assertRecipientCreateAllowed,
} from "../guards.js";
import type {
  CalculateRateInput,
  CancelShipmentInput,
  CreateBarcodeInput,
  CreateOrderInput,
  CreateRecipientInput,
  CreateRecipientResult,
  CreateReturnOrderInput,
  DhlEndpointConfig,
  ListGeoCitiesInput,
  ListGeoDistrictsInput,
  ReferenceLookupInput,
  ResolvedShippingCredential,
  ShippingActionContext,
  ShippingBarcodeResult,
  ShippingGeoResult,
  ShippingOrderCreateResult,
  ShippingProviderAdapter,
  ShippingRateResult,
  ShippingShipmentStatusResult,
  ShippingTrackingEventResult,
  TestConnectionInput,
  TestConnectionResult,
  WebhookResult,
} from "../../types.js";
import {
  buildCalculateRequest,
  buildCancelShipmentRequest,
  buildCbsGetRequest,
  buildCreateBarcodeRequest,
  buildCreateOrderRequest,
  buildCreateRecipientRequest,
  buildIdentityTokenRequest,
  buildQueryGetRequest,
} from "./client.js";

/** Env yoksa makul varsayilan: LIVE host bilinir, TEST host yok (TEST_BASE_URL_MISSING). */
export const DEFAULT_DHL_ENDPOINTS: DhlEndpointConfig = {
  testBaseUrl: null,
  liveBaseUrl: "https://api.mngkargo.com.tr",
  apiVersion: null,
};
import {
  mapCalculateResponse,
  mapCitiesResponse,
  mapCreateBarcodeResponse,
  mapCreateOrderResponse,
  mapDistrictsResponse,
  mapShipmentStatusResponse,
  mapTokenResponse,
  mapTrackResponse,
} from "./mappers.js";

/**
 * F3C.1 — DHL eCommerce (api.mngkargo.com.tr) adapter.
 *
 * Bu fazda CANLI destructive islem (createOrder/createbarcode) varsayilan KAPALIdir
 * (ctx.guards + explicitConfirm). Transport varsayilan KAPALI: read/quote metotlari
 * mapping uretir ama canli HTTP yalniz `SHIPPING_SANDBOX_HTTP_ENABLED` acikken yapilir;
 * aksi halde SHIPPING_HTTP_DISABLED doner. JWT/secret asla loglanmaz/serialize edilmez.
 *
 * TODO(F3C.x): Identity refresh-token akisi (OpenAPI'de /refresh belirsiz) ve token
 * kalici/dagitik cache. Su an cache yalnizca process-ici, kisa omurlu.
 */
export class DhlEcommerceAdapter implements ShippingProviderAdapter {
  readonly provider = "DHL_ECOMMERCE" as const;
  /** Process-ici, kisa omurlu JWT cache. Plain token DB'ye yazilmaz/loglanmaz. */
  private readonly tokenCache = new Map<string, { token: string; expiresAtMs: number }>();
  private readonly endpoints: DhlEndpointConfig;

  constructor(
    private readonly transport: ShippingHttpTransport,
    endpoints: DhlEndpointConfig = DEFAULT_DHL_ENDPOINTS,
  ) {
    this.endpoints = endpoints;
  }

  /**
   * Mode'a gore host cozumler:
   *  - TEST: testBaseUrl; YOKSA TEST_BASE_URL_MISSING (CANLI host'a fallback YOK).
   *  - LIVE: liveBaseUrl.
   */
  private resolveHost(ctx: ShippingActionContext): string {
    if (ctx.mode === "TEST") {
      if (!this.endpoints.testBaseUrl) {
        throw new ShippingConfigError(
          "TEST_BASE_URL_MISSING",
          "DHL eCommerce TEST modu icin test base URL tanimli degil (DHL_ECOMMERCE_TEST_BASE_URL).",
        );
      }
      return this.endpoints.testBaseUrl;
    }
    return this.endpoints.liveBaseUrl;
  }

  private get apiVersion(): string | null {
    return this.endpoints.apiVersion;
  }

  private requireCredential(
    ctx: ShippingActionContext,
    type: ResolvedShippingCredential["type"],
  ): ResolvedShippingCredential {
    const cred = ctx.credentials.byType[type];
    if (!cred || !cred.key || !cred.secret) {
      throw new ShippingConfigError(
        "CONFIG_INCOMPLETE",
        `DHL eCommerce için ${type} kimlik bilgisi eksik.`,
      );
    }
    return cred;
  }

  private requireIdentity(ctx: ShippingActionContext): ResolvedShippingCredential {
    const identity = ctx.credentials.byType.IDENTITY;
    if (!identity || !identity.key || !identity.secret || !identity.customerNumber || !identity.customerPassword) {
      throw new ShippingConfigError(
        "CONFIG_INCOMPLETE",
        "DHL eCommerce için IDENTITY kimlik bilgisi (müşteri no/şifre + X-IBM) eksik.",
      );
    }
    return identity;
  }

  /** JWT alir/cache'ler. Transport kapaliyken SHIPPING_HTTP_DISABLED firlatir. */
  private async getToken(ctx: ShippingActionContext): Promise<string> {
    const identity = this.requireIdentity(ctx);
    const cacheKey = identity.customerNumber!;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAtMs > Date.now() + 30_000) {
      return cached.token;
    }
    const request = buildIdentityTokenRequest(identity, this.resolveHost(ctx), this.apiVersion);
    const response = await this.transport.send(request); // transport kapaliysa burada hata.
    const json = parseJson(response);
    const auth = mapTokenResponse(json);
    if (!auth.ok) {
      throw new ShippingConfigError("AUTH_FAILED", "DHL eCommerce kimlik doğrulaması başarısız.");
    }
    // Plain JWT yalnizca process-ici cache'te tutulur; loglanmaz/DB'ye yazilmaz.
    const token = String((json as Record<string, unknown>).jwt);
    this.tokenCache.set(cacheKey, { token, expiresAtMs: Date.now() + 5 * 60_000 });
    return token;
  }

  async testConnection(input: TestConnectionInput): Promise<TestConnectionResult> {
    const ctx = input.context;
    // IDENTITY + minimum required credential'larin VARLIK + formatini dogrular.
    const identity = this.requireIdentity(ctx);
    for (const type of ["STANDARD_COMMAND", "STANDARD_QUERY", "BARCODE_COMMAND"] as const) {
      this.requireCredential(ctx, type);
    }
    if (!this.transport.enabled) {
      // Transport KAPALI: GERCEK cagri YOK ve host cozulmez (TEST_BASE_URL_MISSING
      // yalniz GERCEK cagri denenince anlamli). "OK" DONMEZ: HTTP_DISABLED.
      return {
        ok: false,
        status: "HTTP_DISABLED",
        message:
          "DHL eCommerce kimlik bilgileri kayıtlı; gerçek API çağrısı yapılmadı (SHIPPING_SANDBOX_HTTP_ENABLED=false).",
        providerHttpStatus: null,
        testType: "IDENTITY_TOKEN",
      };
    }
    // Transport ACIK: gercek Identity token cagrisi. HTTP status + jwt varligi raporlanir;
    // JWT/secret ASLA sonuca/loga girmez (yalniz process-ici cache'e).
    const response = await this.transport.send(
      buildIdentityTokenRequest(identity, this.resolveHost(ctx), this.apiVersion),
    );
    const json = parseJson(response);
    const auth = mapTokenResponse(json);
    if (auth.ok) {
      const token = String((json as Record<string, unknown>).jwt);
      this.tokenCache.set(identity.customerNumber!, { token, expiresAtMs: Date.now() + 5 * 60_000 });
    }
    return {
      ok: auth.ok,
      status: auth.ok ? "OK" : "FAILED",
      message: auth.ok
        ? "DHL eCommerce kimlik doğrulaması başarılı (gerçek API çağrısı)."
        : "DHL eCommerce kimlik doğrulaması başarısız (gerçek API çağrısı).",
      providerHttpStatus: response.status,
      testType: "IDENTITY_TOKEN",
    };
  }

  async calculateRate(input: CalculateRateInput): Promise<ShippingRateResult> {
    const product = this.requireCredential(input.context, "STANDARD_QUERY");
    const token = await this.getToken(input.context);
    const response = await this.transport.send(
      buildCalculateRequest(input, product, token, this.resolveHost(input.context), this.apiVersion),
    );
    return mapCalculateResponse(parseJson(response));
  }

  /**
   * Plus Command / createRecipient — paketleme öncesi varış şube tespiti için alıcı
   * adresini DHL'e iletir. Destructive/operasyonel kabul edilir; default GUARD altında.
   * Bu fazda canlı/sandbox createRecipient YOK (guard kapalı); skeleton hazır.
   */
  async createRecipient(input: CreateRecipientInput): Promise<CreateRecipientResult> {
    assertRecipientCreateAllowed(input.context, input.explicitConfirm);
    const product = this.requireCredential(input.context, "PLUS_COMMAND");
    const token = await this.getToken(input.context);
    const response = await this.transport.send(
      buildCreateRecipientRequest(input, product, token, this.resolveHost(input.context), this.apiVersion),
    );
    const rec = (parseJson(response) ?? {}) as Record<string, unknown>;
    return {
      referenceId: input.referenceId,
      externalRecipientId:
        typeof rec.recipientId === "string"
          ? rec.recipientId
          : typeof rec.id === "string"
            ? rec.id
            : null,
      destinationBranchCode: typeof rec.branchCode === "string" ? rec.branchCode : null,
      destinationBranchName: typeof rec.branchName === "string" ? rec.branchName : null,
    };
  }

  async createOrder(input: CreateOrderInput): Promise<ShippingOrderCreateResult> {
    assertOrderCreateAllowed(input.context, input.explicitConfirm);
    const product = this.requireCredential(input.context, "STANDARD_COMMAND");
    const token = await this.getToken(input.context);
    const response = await this.transport.send(
      buildCreateOrderRequest(input, product, token, this.resolveHost(input.context), this.apiVersion),
    );
    return mapCreateOrderResponse(parseJson(response), input.referenceId);
  }

  async createReturnOrder(input: CreateReturnOrderInput): Promise<ShippingOrderCreateResult> {
    // TODO(F3C.x): createReturnOrder canli akisi. Su an guard + skeleton.
    assertOrderCreateAllowed(input.context, input.explicitConfirm);
    throw new ShippingConfigError("NOT_IMPLEMENTED", "createReturnOrder bu fazda etkin değil.");
  }

  async createBarcodeOrLabel(input: CreateBarcodeInput): Promise<ShippingBarcodeResult> {
    assertBarcodeCreateAllowed(input.context, input.explicitConfirm);
    const product = this.requireCredential(input.context, "BARCODE_COMMAND");
    const token = await this.getToken(input.context);
    const response = await this.transport.send(
      buildCreateBarcodeRequest(input, product, token, this.resolveHost(input.context), this.apiVersion),
    );
    // F3C.3 (ADR-045): HTTP status mapper'a gecer — 200+bos payload (pending) ile
    // 4xx/domain hata (routing/hat kodu) ayrimi icin gereklidir.
    return mapCreateBarcodeResponse(parseJson(response), input.referenceId, response.status);
  }

  async getOrder(input: ReferenceLookupInput): Promise<ShippingShipmentStatusResult> {
    return this.queryStatus(input, `/getorder/${encodeURIComponent(input.referenceId ?? "")}`);
  }

  async getShipment(input: ReferenceLookupInput): Promise<ShippingShipmentStatusResult> {
    const suffix = input.shipmentId
      ? `/getshipmentByShipmentId/${encodeURIComponent(input.shipmentId)}`
      : `/getshipment/${encodeURIComponent(input.referenceId ?? "")}`;
    return this.queryStatus(input, suffix);
  }

  async getShipmentStatus(input: ReferenceLookupInput): Promise<ShippingShipmentStatusResult> {
    const suffix = input.shipmentId
      ? `/getshipmentstatusByShipmentId/${encodeURIComponent(input.shipmentId)}`
      : `/getshipmentstatus/${encodeURIComponent(input.referenceId ?? "")}`;
    return this.queryStatus(input, suffix);
  }

  async trackShipment(input: ReferenceLookupInput): Promise<ShippingTrackingEventResult[]> {
    const product = this.requireCredential(input.context, "STANDARD_QUERY");
    const token = await this.getToken(input.context);
    const suffix = input.shipmentId
      ? `/trackshipmentByShipmentId/${encodeURIComponent(input.shipmentId)}`
      : `/trackshipment/${encodeURIComponent(input.referenceId ?? "")}`;
    const response = await this.transport.send(
      buildQueryGetRequest(suffix, product, token, this.resolveHost(input.context), this.apiVersion),
    );
    return mapTrackResponse(parseJson(response));
  }

  async cancelShipment(input: CancelShipmentInput): Promise<{ cancelled: boolean }> {
    // F3C.3 (ADR-045) netlestirmesi: cancel ucu TEYIT EDILDI →
    // PUT /mngapi/api/barcodecmdapi/cancelshipment, govde { referenceId, shipmentId }.
    // Guard: env DHL_ECOMMERCE_ALLOW_CANCEL && providerConfig && explicitConfirm.
    assertCancelAllowed(input.context, input.explicitConfirm);
    if (!input.shipmentId) {
      // shipmentId YOKSA saglayiciya cagri YAPILMAZ (route da onceden dogrular).
      throw new ShippingConfigError(
        "CANCEL_REQUIRES_SHIPMENT_ID",
        "DHL kargo iptali icin gönderi (shipmentId) gereklidir; önce barkod/gönderi oluşturulmalı.",
      );
    }
    const product = this.requireCredential(input.context, "BARCODE_COMMAND");
    const token = await this.getToken(input.context);
    const response = await this.transport.send(
      buildCancelShipmentRequest(input, product, token, this.resolveHost(input.context), this.apiVersion),
    );
    if (response.status >= 200 && response.status < 300) {
      return { cancelled: true };
    }
    // 4xx/5xx → saglayici domain hatasi (or. fiziksel teslim yapildi). Raw body/secret sizdirma.
    throw new ShippingConfigError(
      "CANCEL_FAILED",
      "DHL kargo iptali sağlayıcı tarafından reddedildi (gönderi fiziksel olarak işleme alınmış olabilir).",
    );
  }

  async handleWebhook(): Promise<WebhookResult> {
    // TODO(F3C.x): DHL webhook dogrulama. Su an no-op.
    return { handled: false, eventId: null, signatureValid: false };
  }

  async listGeoCities(input: ListGeoCitiesInput): Promise<ShippingGeoResult> {
    const product = this.requireCredential(input.context, "CBS_INFO");
    const response = await this.transport.send(
      buildCbsGetRequest("/getcities", product, this.resolveHost(input.context), this.apiVersion),
    );
    return mapCitiesResponse(parseJson(response));
  }

  async listGeoDistricts(input: ListGeoDistrictsInput): Promise<ShippingGeoResult> {
    const product = this.requireCredential(input.context, "CBS_INFO");
    const response = await this.transport.send(
      buildCbsGetRequest(
        `/getdistricts/${encodeURIComponent(input.cityCode)}`,
        product,
        this.resolveHost(input.context),
        this.apiVersion,
      ),
    );
    return mapDistrictsResponse(parseJson(response));
  }

  private async queryStatus(
    input: ReferenceLookupInput,
    suffix: string,
  ): Promise<ShippingShipmentStatusResult> {
    const product = this.requireCredential(input.context, "STANDARD_QUERY");
    const token = await this.getToken(input.context);
    const response = await this.transport.send(
      buildQueryGetRequest(suffix, product, token, this.resolveHost(input.context), this.apiVersion),
    );
    return mapShipmentStatusResponse(parseJson(response));
  }
}

function parseJson(response: ShippingHttpResponse): unknown {
  try {
    return JSON.parse(response.body) as unknown;
  } catch {
    return {};
  }
}
