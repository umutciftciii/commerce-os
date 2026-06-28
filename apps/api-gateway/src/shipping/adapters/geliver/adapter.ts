import { ShippingConfigError } from "../../errors.js";
import type { ShippingHttpRequest, ShippingHttpResponse, ShippingHttpTransport } from "../http.js";
import { assertLabelPurchaseAllowed } from "../guards.js";
import type {
  CreateBarcodeInput,
  CreateOrderInput,
  CreateReturnOrderInput,
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

/**
 * F3C.1 — Geliver adapter foundation.
 *
 * Auth: tek API token (DEFAULT credential), `Authorization: Bearer <token>`.
 * Base: https://api.geliver.io/api/v1 (SDK `geliver-js` referans alindi).
 *
 * Bu fazda CANLI etiket satin alma (transactions.acceptOffer) varsayilan KAPALIdir
 * (LABEL_PURCHASE_DISABLED guard). Canli `shipments.create` KULLANILMAZ; yalnizca
 * `shipments.createTest` (test/dry-run) ve test gonderi okuma yapilir. Transport
 * varsayilan KAPALI: canli HTTP yalniz SHIPPING_SANDBOX_HTTP_ENABLED acikken.
 *
 * NOT: Geliver REST endpoint yollari SDK metod adlarindan turetilmistir; canli
 * dogrulama bu fazda YAPILMAMISTIR (transport kapali). createTest dogrulamasi
 * credential + canli smoke ile sonraki fazda netlestirilecek.
 */
export class GeliverAdapter implements ShippingProviderAdapter {
  readonly provider = "GELIVER" as const;
  private readonly baseUrl = "https://api.geliver.io/api/v1";

  constructor(private readonly transport: ShippingHttpTransport) {}

  private requireToken(ctx: ShippingActionContext): ResolvedShippingCredential {
    const cred = ctx.credentials.byType.DEFAULT;
    if (!cred || !cred.key) {
      throw new ShippingConfigError("CONFIG_INCOMPLETE", "Geliver API anahtarı eksik.");
    }
    return cred;
  }

  private authHeaders(cred: ResolvedShippingCredential): Record<string, string> {
    return {
      Authorization: `Bearer ${cred.key ?? ""}`,
      "Content-Type": "application/json",
    };
  }

  async testConnection(input: TestConnectionInput): Promise<TestConnectionResult> {
    this.requireToken(input.context);
    if (!this.transport.enabled) {
      // Transport KAPALI: API anahtari kayitli ama GERCEK cagri YOK. "OK" DONMEZ.
      return {
        ok: false,
        status: "HTTP_DISABLED",
        message:
          "Geliver API anahtarı kayıtlı; gerçek API çağrısı yapılmadı (SHIPPING_SANDBOX_HTTP_ENABLED=false).",
        providerHttpStatus: null,
        testType: "GEO_CITIES",
      };
    }
    const cred = this.requireToken(input.context);
    // Canli: hafif bir GET (geo/cities) ile token gecerliligini dogrula. Bearer ASLA loglanmaz.
    const response = await this.transport.send({
      method: "GET",
      url: `${this.baseUrl}/geo/cities`,
      headers: this.authHeaders(cred),
    });
    const ok = response.status >= 200 && response.status < 300;
    return {
      ok,
      status: ok ? "OK" : "FAILED",
      message: ok
        ? "Geliver bağlantısı doğrulandı (gerçek API çağrısı)."
        : "Geliver bağlantısı doğrulanamadı (gerçek API çağrısı).",
      providerHttpStatus: response.status,
      testType: "GEO_CITIES",
    };
  }

  async calculateRate(): Promise<ShippingRateResult> {
    // Geliver'da ucret teklifleri asenkron offer akisiyla gelir; bu fazda quote
    // foundation yok. TODO(F3C.x): offer polling -> normalized rate.
    throw new ShippingConfigError("NOT_IMPLEMENTED", "Geliver ücret hesabı bu fazda etkin değil.");
  }

  /** createOrder = Geliver TEST gonderi (createTest). Canli shipments.create KULLANILMAZ. */
  async createOrder(input: CreateOrderInput): Promise<ShippingOrderCreateResult> {
    const cred = this.requireToken(input.context);
    const request = this.buildCreateTestRequest(input, cred);
    const response = await this.transport.send(request); // transport kapaliysa SHIPPING_HTTP_DISABLED.
    const json = parseJson(response);
    const rec = asRecord(json);
    return {
      referenceId: input.referenceId,
      externalOrderId: typeof rec.id === "string" ? rec.id : null,
    };
  }

  async createReturnOrder(input: CreateReturnOrderInput): Promise<ShippingOrderCreateResult> {
    // transactions.createReturn — etiket satin alimina denk; guard altinda.
    assertLabelPurchaseAllowed(input.context, input.explicitConfirm);
    throw new ShippingConfigError("NOT_IMPLEMENTED", "Geliver iade akışı bu fazda etkin değil.");
  }

  /** createBarcodeOrLabel = Geliver etiket satin alma (acceptOffer). GUARD altinda. */
  async createBarcodeOrLabel(input: CreateBarcodeInput): Promise<ShippingBarcodeResult> {
    assertLabelPurchaseAllowed(input.context, input.explicitConfirm);
    // Guard gecse bile bu fazda canli acceptOffer YAPILMAZ.
    throw new ShippingConfigError(
      "NOT_IMPLEMENTED",
      "Geliver canlı etiket satın alma bu fazda etkin değil.",
    );
  }

  async getOrder(input: ReferenceLookupInput): Promise<ShippingShipmentStatusResult> {
    return this.getTestShipment(input);
  }

  async getShipment(input: ReferenceLookupInput): Promise<ShippingShipmentStatusResult> {
    return this.getTestShipment(input);
  }

  async getShipmentStatus(input: ReferenceLookupInput): Promise<ShippingShipmentStatusResult> {
    return this.getTestShipment(input);
  }

  async trackShipment(input: ReferenceLookupInput): Promise<ShippingTrackingEventResult[]> {
    const status = await this.getTestShipment(input);
    return status.statusText
      ? [
          {
            sequence: 1,
            statusText: status.statusText,
            statusCode: status.statusCode,
            location: null,
            occurredAt: null,
            trackingUrl: status.trackingUrl,
          },
        ]
      : [];
  }

  async cancelShipment(): Promise<{ cancelled: boolean }> {
    throw new ShippingConfigError("NOT_IMPLEMENTED", "Geliver iptal bu fazda etkin değil.");
  }

  async handleWebhook(): Promise<WebhookResult> {
    return { handled: false, eventId: null, signatureValid: false };
  }

  async listGeoCities(input: ListGeoCitiesInput): Promise<ShippingGeoResult> {
    const cred = this.requireToken(input.context);
    const response = await this.transport.send({
      method: "GET",
      url: `${this.baseUrl}/geo/cities`,
      headers: this.authHeaders(cred),
    });
    const arr = Array.isArray(parseJson(response)) ? (parseJson(response) as unknown[]) : [];
    return {
      cities: arr.map((c) => {
        const rec = asRecord(c);
        return { code: String(rec.code ?? rec.id ?? ""), name: String(rec.name ?? "") };
      }),
    };
  }

  async listGeoDistricts(input: ListGeoDistrictsInput): Promise<ShippingGeoResult> {
    const cred = this.requireToken(input.context);
    const response = await this.transport.send({
      method: "GET",
      url: `${this.baseUrl}/geo/districts?cityCode=${encodeURIComponent(input.cityCode)}`,
      headers: this.authHeaders(cred),
    });
    const arr = Array.isArray(parseJson(response)) ? (parseJson(response) as unknown[]) : [];
    return {
      districts: arr.map((d) => {
        const rec = asRecord(d);
        return {
          code: String(rec.code ?? rec.id ?? ""),
          name: String(rec.name ?? ""),
          cityCode: input.cityCode,
        };
      }),
    };
  }

  /** shipments.createTest request mapping (TEST gonderi; canli create degil). */
  private buildCreateTestRequest(
    input: CreateOrderInput,
    cred: ResolvedShippingCredential,
  ): ShippingHttpRequest {
    return {
      method: "POST",
      url: `${this.baseUrl}/shipments/test`,
      headers: this.authHeaders(cred),
      body: JSON.stringify({
        test: true,
        recipientName: input.recipient.fullName ?? "",
        recipientPhone: input.recipient.phone ?? "",
        recipientCity: input.recipient.cityName ?? "",
        recipientDistrict: input.recipient.districtName ?? "",
        recipientAddress: input.recipient.address ?? "",
        length: 1,
        width: 1,
        height: 1,
        weight: input.pieces.reduce((s, p) => s + p.kg, 0) || 1,
        referenceId: input.referenceId,
      }),
    };
  }

  private async getTestShipment(input: ReferenceLookupInput): Promise<ShippingShipmentStatusResult> {
    const cred = this.requireToken(input.context);
    const id = input.shipmentId ?? input.referenceId ?? "";
    const response = await this.transport.send({
      method: "GET",
      url: `${this.baseUrl}/shipments/${encodeURIComponent(id)}`,
      headers: this.authHeaders(cred),
    });
    const rec = asRecord(parseJson(response));
    return {
      referenceId: input.referenceId ?? null,
      externalShipmentId: typeof rec.id === "string" ? rec.id : input.shipmentId ?? null,
      statusCode: typeof rec.statusCode === "number" ? rec.statusCode : null,
      statusText: typeof rec.status === "string" ? rec.status : null,
      isDelivered: rec.status === "delivered",
      trackingUrl: typeof rec.trackingUrl === "string" ? rec.trackingUrl : null,
    };
  }
}

function parseJson(response: ShippingHttpResponse): unknown {
  try {
    return JSON.parse(response.body) as unknown;
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
