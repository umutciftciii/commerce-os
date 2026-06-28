import type {
  CalculateRateInput,
  CreateBarcodeInput,
  CreateOrderInput,
  CreateReturnOrderInput,
  HandleWebhookInput,
  ListGeoDistrictsInput,
  ReferenceLookupInput,
  ShippingBarcodeResult,
  ShippingGeoResult,
  ShippingOrderCreateResult,
  ShippingProviderAdapter,
  ShippingRateResult,
  ShippingShipmentStatusResult,
  ShippingTrackingEventResult,
  TestConnectionResult,
  WebhookResult,
} from "../types.js";

/**
 * F3C.1 — MOCK kargo saglayici adapter (TAM CALISIR).
 *
 * Gercek kargo islemi YAPMAZ; deterministik test sonuclari uretir. Credential
 * gerektirmez. Store-admin akislarini ve UI'yi gercek bir saglayici sozlesmesi
 * olmadan test etmek icin kullanilir. Destructive degildir; bu yuzden guard'a
 * tabi degildir (DHL/Geliver guard'lari kendi adapter'larindadir).
 */
export class MockShippingAdapter implements ShippingProviderAdapter {
  readonly provider = "MOCK" as const;

  async testConnection(): Promise<TestConnectionResult> {
    // MOCK gercek ag cagrisi yapmaz; "OK" burada gercek bir baglanti dogrulamasi DEGIL,
    // dahili test akisinin hazir oldugudur. testType=MOCK ile bu net ayirt edilir.
    return {
      ok: true,
      status: "OK",
      message: "Mock kargo sağlayıcı hazır (test modu, credential gerekmez).",
      providerHttpStatus: null,
      testType: "MOCK",
    };
  }

  async calculateRate(input: CalculateRateInput): Promise<ShippingRateResult> {
    // Deterministik: parca basina sabit + desi/kg agirlikli kurus ucret.
    const totalDesi = input.pieces.reduce((sum, p) => sum + Math.max(p.desi, p.kg), 0);
    const amountMinor = 2990 + totalDesi * 500;
    return {
      amountMinor,
      currency: "TRY",
      breakdownSafe: { base: 2990, weight: totalDesi * 500 },
    };
  }

  async createOrder(input: CreateOrderInput): Promise<ShippingOrderCreateResult> {
    return {
      referenceId: input.referenceId,
      externalOrderId: `mock_order_${input.referenceId}`,
      externalInvoiceId: null,
    };
  }

  async createReturnOrder(input: CreateReturnOrderInput): Promise<ShippingOrderCreateResult> {
    return {
      referenceId: input.referenceId,
      externalOrderId: `mock_return_${input.referenceId}`,
      returnLabelUrl: `https://mock.local/return/${input.referenceId}`,
    };
  }

  async createBarcodeOrLabel(input: CreateBarcodeInput): Promise<ShippingBarcodeResult> {
    return {
      referenceId: input.referenceId,
      externalShipmentId: `mock_ship_${input.referenceId}`,
      externalInvoiceId: `mock_inv_${input.referenceId}`,
      barcodes: input.pieces.map((_, i) => ({ pieceNumber: i + 1, value: `MOCKBARCODE${i + 1}` })),
    };
  }

  async getOrder(input: ReferenceLookupInput): Promise<ShippingShipmentStatusResult> {
    return this.statusStub(input);
  }

  async getShipment(input: ReferenceLookupInput): Promise<ShippingShipmentStatusResult> {
    return this.statusStub(input);
  }

  async getShipmentStatus(input: ReferenceLookupInput): Promise<ShippingShipmentStatusResult> {
    return this.statusStub(input);
  }

  async trackShipment(input: ReferenceLookupInput): Promise<ShippingTrackingEventResult[]> {
    return [
      {
        sequence: 1,
        statusText: "Gönderi Hazırlandı",
        statusCode: 1,
        location: "Mock Şube",
        occurredAt: new Date(0).toISOString(),
        trackingUrl: `https://mock.local/track/${input.referenceId ?? input.shipmentId ?? "x"}`,
      },
    ];
  }

  async cancelShipment(): Promise<{ cancelled: boolean }> {
    return { cancelled: true };
  }

  async handleWebhook(input: HandleWebhookInput): Promise<WebhookResult> {
    const eventId =
      input.payload && typeof input.payload === "object" && "eventId" in input.payload
        ? String((input.payload as Record<string, unknown>).eventId)
        : null;
    return { handled: true, eventId, signatureValid: true };
  }

  async listGeoCities(): Promise<ShippingGeoResult> {
    return {
      cities: [
        { code: "34", name: "İstanbul" },
        { code: "06", name: "Ankara" },
        { code: "35", name: "İzmir" },
      ],
    };
  }

  async listGeoDistricts(input: ListGeoDistrictsInput): Promise<ShippingGeoResult> {
    return {
      districts: [
        { code: "56", name: "Kadıköy", cityCode: input.cityCode },
        { code: "57", name: "Beşiktaş", cityCode: input.cityCode },
      ],
    };
  }

  private statusStub(input: ReferenceLookupInput): ShippingShipmentStatusResult {
    return {
      referenceId: input.referenceId ?? null,
      externalShipmentId: input.shipmentId ?? `mock_ship_${input.referenceId ?? "x"}`,
      statusCode: 1,
      statusText: "Gönderi Hazırlandı",
      isDelivered: false,
      trackingUrl: `https://mock.local/track/${input.referenceId ?? input.shipmentId ?? "x"}`,
    };
  }
}
