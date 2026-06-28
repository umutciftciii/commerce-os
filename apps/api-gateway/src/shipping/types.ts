import type {
  ShippingCredentialType,
  ShippingProviderMode,
  ShippingProviderType,
} from "@prisma/client";

/**
 * F3C.1 Shipping provider foundation — provider abstraction tipleri.
 *
 * Bu fazda CANLI destructive kargo islemi YOK. MOCK adapter tam calisir; gercek
 * provider'lar (DHL_ECOMMERCE / GELIVER) request mapping uretir ama transport
 * kapaliyken canli HTTP yapmaz. createOrder/createbarcode/label-purchase varsayilan
 * guard altindadir (409). Token/JWT/secret asla normalized result'a/log'a sizmaz.
 */

/* ───────────────────────── Decrypt edilmis credential ───────────────────────── */

/**
 * Tek bir credential tipinin decrypt edilmis hali. ASLA loglanmaz/serialize edilmez.
 * - `key`    : X-IBM-Client-Id (DHL) ya da Geliver API key.
 * - `secret` : X-IBM-Client-Secret (DHL).
 * - DHL IDENTITY tipi ayrica `customerNumber`/`customerPassword`/`identityType` tutar.
 */
export interface ResolvedShippingCredential {
  type: ShippingCredentialType;
  key: string | null;
  secret: string | null;
  customerNumber: string | null;
  customerPassword: string | null;
  identityType: number | null;
}

export interface ResolvedShippingCredentials {
  byType: Partial<Record<ShippingCredentialType, ResolvedShippingCredential>>;
}

/** Birlesik destructive-operasyon izinleri (route'ta env-flag && config.allow* hesaplanir). */
export interface ShippingGuardFlags {
  allowOrderCreate: boolean;
  allowBarcodeCreate: boolean;
  allowLabelPurchase: boolean;
}

export interface ShippingActionContext {
  provider: ShippingProviderType;
  mode: ShippingProviderMode;
  credentials: ResolvedShippingCredentials;
  guards: ShippingGuardFlags;
}

/* ───────────────────────── Normalized result modelleri ───────────────────────── */

/** Sanitize edilmis provider hatasi (ic detay/secret icermez). */
export interface ShippingProviderError {
  code: string;
  message: string;
  retryable?: boolean;
}

/** Token sonucu SANITIZE: JWT/refreshToken ASLA dahil edilmez; yalnizca varlik + sure. */
export interface ShippingAuthResult {
  ok: boolean;
  expiresAt?: string | null;
}

export interface ShippingRateResult {
  amountMinor: number;
  currency: string;
  /** Sanitize edilmis ucret kalemleri (kurus). Secret icermez. */
  breakdownSafe?: Record<string, number>;
}

export interface ShippingOrderCreateResult {
  referenceId: string;
  externalOrderId: string | null;
  externalInvoiceId?: string | null;
  shipperBranchCode?: string | null;
  returnLabelUrl?: string | null;
}

export interface ShippingBarcodeItem {
  pieceNumber: number;
  value: string;
}

export interface ShippingBarcodeResult {
  referenceId: string;
  externalShipmentId: string | null;
  externalInvoiceId: string | null;
  barcodes: ShippingBarcodeItem[];
}

export interface ShippingShipmentStatusResult {
  referenceId: string | null;
  externalShipmentId: string | null;
  statusCode: number | null;
  statusText: string | null;
  isDelivered: boolean;
  trackingUrl: string | null;
  deliveryDateTime?: string | null;
  deliveryTo?: string | null;
}

export interface ShippingTrackingEventResult {
  sequence: number | null;
  statusText: string | null;
  statusCode?: number | null;
  location: string | null;
  occurredAt: string | null;
  trackingUrl?: string | null;
}

export interface ShippingGeoCity {
  code: string;
  name: string;
}

export interface ShippingGeoDistrict {
  code: string;
  name: string;
  cityCode: string;
}

export interface ShippingGeoResult {
  cities?: ShippingGeoCity[];
  districts?: ShippingGeoDistrict[];
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

export interface WebhookResult {
  handled: boolean;
  eventId?: string | null;
  signatureValid: boolean;
}

/* ───────────────────────── Input tipleri ───────────────────────── */

export interface ShipmentPieceInput {
  barcode?: string;
  desi: number;
  kg: number;
  content?: string;
}

export interface ShipmentRecipientInput {
  fullName?: string;
  email?: string;
  phone?: string;
  cityCode?: number;
  districtCode?: number;
  cityName?: string;
  districtName?: string;
  address?: string;
}

export interface TestConnectionInput {
  context: ShippingActionContext;
}

export interface CalculateRateInput {
  context: ShippingActionContext;
  shipmentServiceType?: number;
  packagingType?: number;
  paymentType?: number;
  pickUpType?: number;
  deliveryType?: number;
  recipient: ShipmentRecipientInput;
  pieces: ShipmentPieceInput[];
}

export interface CreateOrderInput {
  context: ShippingActionContext;
  referenceId: string;
  shipmentServiceType?: number;
  packagingType?: number;
  paymentType?: number;
  deliveryType?: number;
  content?: string;
  recipient: ShipmentRecipientInput;
  pieces: ShipmentPieceInput[];
  /** Destructive guard: canli createOrder yalniz bu true iken (+ env+config izni) calisir. */
  explicitConfirm?: boolean;
}

export interface CreateReturnOrderInput extends Omit<CreateOrderInput, "recipient"> {
  shipper: ShipmentRecipientInput;
}

export interface CreateBarcodeInput {
  context: ShippingActionContext;
  referenceId: string;
  packagingType?: number;
  pieces: ShipmentPieceInput[];
  /** Destructive guard: canli createbarcode/label yalniz bu true iken calisir. */
  explicitConfirm?: boolean;
}

export interface ReferenceLookupInput {
  context: ShippingActionContext;
  referenceId?: string;
  shipmentId?: string;
}

export interface CancelShipmentInput {
  context: ShippingActionContext;
  referenceId: string;
  shipmentId?: string;
  explicitConfirm?: boolean;
}

export interface HandleWebhookInput {
  provider: ShippingProviderType;
  signature: string | null;
  rawBody: string;
  payload: unknown;
}

export interface ListGeoCitiesInput {
  context: ShippingActionContext;
}

export interface ListGeoDistrictsInput {
  context: ShippingActionContext;
  cityCode: string;
}

/* ───────────────────────── Adapter sozlesmesi ───────────────────────── */

export interface ShippingProviderAdapter {
  readonly provider: ShippingProviderType;
  testConnection(input: TestConnectionInput): Promise<TestConnectionResult>;
  calculateRate(input: CalculateRateInput): Promise<ShippingRateResult>;
  createOrder(input: CreateOrderInput): Promise<ShippingOrderCreateResult>;
  createReturnOrder(input: CreateReturnOrderInput): Promise<ShippingOrderCreateResult>;
  createBarcodeOrLabel(input: CreateBarcodeInput): Promise<ShippingBarcodeResult>;
  getOrder(input: ReferenceLookupInput): Promise<ShippingShipmentStatusResult>;
  getShipment(input: ReferenceLookupInput): Promise<ShippingShipmentStatusResult>;
  getShipmentStatus(input: ReferenceLookupInput): Promise<ShippingShipmentStatusResult>;
  trackShipment(input: ReferenceLookupInput): Promise<ShippingTrackingEventResult[]>;
  cancelShipment(input: CancelShipmentInput): Promise<{ cancelled: boolean }>;
  handleWebhook(input: HandleWebhookInput): Promise<WebhookResult>;
  listGeoCities(input: ListGeoCitiesInput): Promise<ShippingGeoResult>;
  listGeoDistricts(input: ListGeoDistrictsInput): Promise<ShippingGeoResult>;
}
