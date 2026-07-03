import type {
  AdminStore,
  AdminStoreCreateRequest,
  AdminStoreListResponse,
  AdminStoreUpdateRequest,
  HealthResponse,
  InventoryAdjustRequest,
  InventoryAdjustmentResponse,
  InventoryItem,
  InventoryListResponse,
  Order,
  OrderCancelRequest,
  OrderCreateRequest,
  OrderLineInput,
  OrderLineUpdateRequest,
  OrderListQuery,
  OrderListResponse,
  OrderUpdateRequest,
  PaymentProviderConfig,
  PaymentProviderConfigCreateRequest,
  PaymentProviderConfigListResponse,
  PaymentProviderConfigUpdateRequest,
  PaymentProviderEventListResponse,
  PaymentProviderReorderRequest,
  PaymentProviderStatusUpdateRequest,
  PaymentProviderTestConnectionResponse,
  Plan,
  PlanCreateRequest,
  PlanListResponse,
  PlanUpdateRequest,
  PlatformLoginRequest,
  PlatformLoginResponse,
  PlatformLogoutResponse,
  PlatformMeResponse,
  Product,
  ProductCategory,
  ProductCategoryCreateRequest,
  ProductCategoryListResponse,
  ProductCategoryUpdateRequest,
  ProductCreateRequest,
  ProductListResponse,
  ProductUpdateRequest,
  ProductVariant,
  ProductVariantCreateRequest,
  ProductVariantListResponse,
  ProductVariantUpdateRequest,
  StoreAdminCustomerListResponse,
  StoreAdminCustomerDetailResponse,
  StoreAdminCustomerUpdateRequest,
  StoreAdminCustomerCreateRequest,
  StoreAdminCustomerCreateResponse,
  StoreAdminCredentialTokenResponse,
  StoreAdminRevokeSessionsResponse,
  CustomerAccount,
  CustomerAddress,
  CustomerAddressInput,
  CustomerIban,
  CustomerIbanInput,
  CustomerCommunicationPreference,
  ShippingProviderConfigResponse,
  ShippingProviderConfigListResponse,
  ShippingProviderConfigCreateRequest,
  ShippingProviderConfigUpdateRequest,
  ShippingCredentialUpsertRequest,
  ShippingProviderTestResponse,
  ShippingWebhookRotateResponse,
  ShipmentSyncAllRequest,
  ShipmentSyncAllResponse,
  ShippingRateRequest,
  ShippingRateResponse,
  ShippingCreateOrderRequest,
  ShippingCreateBarcodeRequest,
  ShippingPrepareRequest,
  ShippingBarcodeActionRequest,
  ShippingSyncRequest,
  ShippingCancelRequest,
  ShippingShipmentMutationResponse,
  // F3C.5 (TODO-121) — provider-agnostic shipment list/detail + generic aksiyonlar.
  ShipmentListQuery,
  ShipmentListResponse,
  ShipmentDetailResponse,
  ShipmentCreateLabelRequest,
  ShipmentCancelRequest,
  ShipmentManualTrackingRequest,
  OrderShippingResponse,
  ShippingRatePlanResponse,
  ShippingRatePlanListResponse,
  ShippingRatePlanCreateRequest,
  ShippingRatePlanUpdateRequest,
  ShippingRateRuleInput,
  ShippingRateRulePatch,
  ShippingRateTierInput,
  ShippingRateZoneInput,
  ShippingSurchargeInput,
  ShippingMatrixApplyRequest,
  ShippingMatrixPreviewResponse,
  ShippingMatrixApplyResponse,
  ShippingImportRequest,
  ShippingImportPreviewResponse,
  ShippingImportApplyResponse,
} from "@commerce-os/contracts";

/**
 * Frontend'in ihtiyac duydugu kontrat tipleri buradan re-export edilir. Boylece
 * app'ler `packages/contracts`'a dogrudan bagimli olmadan (tek type-safe kanal
 * api-client uzerinden) bu tiplere erisir.
 */
export type {
  AdminStore,
  AdminStoreCreateRequest,
  AdminStoreListResponse,
  AdminStoreUpdateRequest,
  HealthResponse,
  InventoryAdjustRequest,
  InventoryAdjustmentResponse,
  InventoryItem,
  InventoryListResponse,
  Order,
  OrderCancelRequest,
  OrderCreateRequest,
  OrderLineInput,
  OrderLineUpdateRequest,
  OrderListQuery,
  OrderListResponse,
  OrderUpdateRequest,
  Plan,
  PlanCreateRequest,
  PlanListResponse,
  PlanUpdateRequest,
  PlatformLoginRequest,
  PlatformLoginResponse,
  PlatformLogoutResponse,
  PlatformMeResponse,
  Product,
  ProductCategory,
  ProductCategoryCreateRequest,
  ProductCategoryListResponse,
  ProductCategoryUpdateRequest,
  ProductCreateRequest,
  ProductListResponse,
  ProductPriceVisibility,
  ProductPrimaryAction,
  ProductSalesMode,
  ProductUpdateRequest,
  ProductVariant,
  ProductVariantCreateRequest,
  ProductVariantListResponse,
  ProductVariantUpdateRequest,
  PublicProduct,
  PublicProductVariant,
  PublicProductListResponse,
  PublicProductDetail,
  PublicCartItemInput,
  PublicCartRequest,
  PublicCartLineStatus,
  PublicCartLine,
  PublicCouponStatus,
  PublicCartSummary,
  PublicCart,
  PublicCheckoutContact,
  PublicCheckoutAddress,
  PublicCheckoutRequest,
  PublicOrderConfirmationLine,
  PublicOrderConfirmation,
  ShippingOption,
  OrderShippingSelection,
  PublicCheckoutBilling,
  PublicBillingSummary,
  PublicAddressSummary,
  PublicPaymentInfo,
  PublicOrderReceipt,
  PublicPaymentCard,
  PublicPaymentScenario,
  PublicPaymentThreeDsAction,
  PublicPaymentRedirect,
  PublicPaymentState,
  PublicPaymentSubmitRequest,
  PublicPaymentResult,
  PublicPaymentAvailability,
  OrderPaymentAttempt,
  OrderBilling,
  CardBrand,
  PlatformUserContract,
  PaymentProviderConfig,
  PaymentProviderConfigCreateRequest,
  PaymentProviderConfigListResponse,
  PaymentProviderConfigUpdateRequest,
  PaymentProviderStatusUpdateRequest,
  PaymentProviderReorderRequest,
  PaymentProviderTestConnectionResponse,
  PaymentProviderEvent,
  PaymentProviderEventListResponse,
  StoreAdminCustomerStatus,
  StoreAdminCustomerSummary,
  StoreAdminCustomerListResponse,
  StoreAdminCustomerDetail,
  StoreAdminCustomerSecurity,
  StoreAdminCustomerDetailResponse,
  StoreAdminCustomerUpdateRequest,
  StoreAdminCustomerCreateRequest,
  StoreAdminCustomerCreateResponse,
  StoreAdminCredentialSetup,
  StoreAdminCredentialTokenResponse,
  StoreAdminRevokeSessionsResponse,
  CustomerActivateRequest,
  CustomerActivateResponse,
} from "@commerce-os/contracts";

/**
 * F3B.2 — Paylasilan dogrulama yardimcilari (DEGER re-export). Vitrin (client UX)
 * ve diger tuketiciler, gateway ile AYNI dogrulama otoritesini kullanir.
 */
export {
  isValidTckn,
  isValidTaxNumber,
  luhnValid,
  detectCardBrand,
  cardLast4,
  digitsOnly,
  // F3B.3 — Musteri hesabi/adres defteri dogrulama yardimcilari (client UX).
  isValidIban,
  normalizeIban,
  maskIban,
  maskTaxId,
  isValidTrPhone,
  normalizeTrPhone,
  classifyIdentifier,
  // TODO-135 — Sipariş rozetlerinin kargo hazırlık durumunu türetmesi için paylaşılan
  // (saf) gösterim yardımcıları. store-admin + storefront AYNI otoriteyi kullanır.
  getOrderFulfillmentDisplay,
  pickOrderShipmentStatus,
} from "@commerce-os/contracts";

/**
 * F3B.3 — Storefront musteri hesabi kontrat tipleri (type-only re-export).
 */
export type {
  CustomerAccount,
  CustomerAddress,
  CustomerAddressInput,
  CustomerAddressListResponse,
  CustomerIban,
  CustomerIbanInput,
  CustomerIbanListResponse,
  CustomerCommunicationPreference,
  CustomerProfileUpdateRequest,
  CustomerPasswordChangeRequest,
  CustomerLoginRequest,
  CustomerRegisterStartRequest,
  CustomerRegisterCompleteRequest,
  CustomerOtpChallengeResponse,
  CustomerSessionResponse,
  CustomerMeResponse,
  CustomerOrderSummary,
  CustomerOrderListResponse,
  CustomerOrderDetailLine,
  CustomerOrderAddressSummary,
  CustomerOrderBillingSummary,
  CustomerOrderPaymentSummary,
  CustomerOrderShipmentEvent,
  CustomerOrderShipment,
  CustomerOrderDetail,
  CustomerOrderDetailResponse,
  // TODO-135 — Kargo hazırlık durumundan türetilen karşılama rozeti gösterim tipleri.
  OrderFulfillmentDisplay,
  OrderSummaryShipmentStatus,
} from "@commerce-os/contracts";

/**
 * F3C.1 — Shipping provider foundation kontrat tipleri (type-only re-export).
 * RESPONSE tipleri ALLOWLIST'tir (secret/ciphertext/JWT/customerPassword içermez).
 */
export type {
  ShippingProviderConfigResponse,
  ShippingProviderConfigListResponse,
  ShippingProviderConfigCreateRequest,
  ShippingProviderConfigUpdateRequest,
  ShippingProviderStatusUpdateRequest,
  ShippingCredentialUpsertRequest,
  ShippingProviderTestResponse,
  ShippingWebhookRotateResponse,
  ShipmentSyncAllRequest,
  ShipmentSyncAllResponse,
  ShippingRateRequest,
  ShippingRateResponse,
  ShippingCreateOrderRequest,
  ShippingCreateBarcodeRequest,
  ShippingPrepareRequest,
  ShippingBarcodeActionRequest,
  ShippingSyncRequest,
  ShippingCancelRequest,
  ShippingShipmentMutationResponse,
  ShipmentEventResponse,
  ShipmentEventType,
  ShipmentStatusValue,
  OrderShippingResponse,
  ShipmentResponse,
  // F3C.5 (TODO-121) — provider-agnostic shipment list/detail + generic aksiyonlar.
  ShipmentProviderInfo,
  ShipmentActionCapabilities,
  ShipmentListItem,
  ShipmentListKpi,
  ShipmentListResponse,
  ShipmentListQuery,
  ShipmentDetail,
  ShipmentDetailResponse,
  ShipmentManualTrackingRequest,
  ShipmentCreateLabelRequest,
  ShipmentCancelRequest,
  ShippingRatePlanResponse,
  ShippingRatePlanListResponse,
  ShippingRatePlanCreateRequest,
  ShippingRatePlanUpdateRequest,
  ShippingRateRuleInput,
  ShippingRateRulePatch,
  ShippingRateTierInput,
  ShippingRateZoneInput,
  ShippingSurchargeInput,
  ShippingChargeType,
  ShippingRateRule,
  ShippingMatrixApplyRequest,
  ShippingMatrixPreviewResponse,
  ShippingMatrixApplyResponse,
  ShippingImportRequest,
  ShippingImportPreviewResponse,
  ShippingImportApplyResponse,
  CartShippingQuoteResponse,
} from "@commerce-os/contracts";

/**
 * commerce-os API client — thin, type-safe client over the API gateway.
 *
 * Exposes public health/version, internal DB/Redis health (token-gated), platform
 * auth (login/me/logout) and platform-admin store/plan helpers. Bearer token is
 * passed per call or via {@link ApiClientOptions.token}. Failed requests throw an
 * {@link ApiError} carrying the gateway error `code`/`status` so callers can map to
 * user-facing messages. Commerce per-domain resources (products, orders…) are not
 * implemented yet; the shape is designed to grow without breaking existing callers.
 */

export const DEFAULT_API_GATEWAY_URL = "http://localhost:4000";

/**
 * API gateway hata zarfini ({ error: { code, message, details } }) tasiyan tipli
 * hata. UI/BFF katmani ham status yerine `code` uzerinden kullanici dostu
 * (Turkce) mesaj uretebilir. Token veya gizli deger tasimaz.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly apiMessage: string;
  readonly details?: unknown;

  constructor(status: number, code: string, apiMessage: string, details?: unknown) {
    super(`API gateway request failed: ${code} (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.apiMessage = apiMessage;
    this.details = details;
  }
}

function isErrorEnvelope(
  value: unknown,
): value is { error: { code?: unknown; message?: unknown; details?: unknown } } {
  return typeof value === "object" && value !== null && "error" in value;
}

export interface ApiClientOptions {
  /** Base URL of the API gateway, e.g. http://localhost:4000 */
  baseUrl?: string;
  /** Optional fetch override (defaults to the global fetch). Useful in tests. */
  fetch?: typeof fetch;
  /** Optional bearer token for platform-admin endpoints. */
  token?: string;
}

export interface VersionResponse {
  name: string;
  service: string;
  version: string;
}

export interface InternalHealthResponse {
  status: "ok" | "degraded";
}

export interface ApiClient {
  readonly baseUrl: string;
  health(): Promise<HealthResponse>;
  version(): Promise<VersionResponse>;
  /**
   * Internal DB/Redis health. Yalnizca gecerli `INTERNAL_API_TOKEN` ile cagrilir;
   * bu token client bundle'a girmemeli, sadece server tarafindan saglanmalidir.
   */
  internal: {
    dbHealth(token: string): Promise<InternalHealthResponse>;
    redisHealth(token: string): Promise<InternalHealthResponse>;
  };
  auth: {
    platformLogin(input: PlatformLoginRequest): Promise<PlatformLoginResponse>;
    platformLogout(token?: string): Promise<PlatformLogoutResponse>;
    platformMe(token?: string): Promise<PlatformMeResponse>;
  };
  admin: {
    stores: {
      list(token?: string): Promise<AdminStoreListResponse>;
      create(input: AdminStoreCreateRequest, token?: string): Promise<AdminStore>;
      get(id: string, token?: string): Promise<AdminStore>;
      update(id: string, input: AdminStoreUpdateRequest, token?: string): Promise<AdminStore>;
    };
    plans: {
      list(token?: string): Promise<PlanListResponse>;
      create(input: PlanCreateRequest, token?: string): Promise<Plan>;
      get(id: string, token?: string): Promise<Plan>;
      update(id: string, input: PlanUpdateRequest, token?: string): Promise<Plan>;
    };
    categories: {
      list(storeId: string, token?: string): Promise<ProductCategoryListResponse>;
      create(
        storeId: string,
        input: ProductCategoryCreateRequest,
        token?: string,
      ): Promise<ProductCategory>;
      get(storeId: string, categoryId: string, token?: string): Promise<ProductCategory>;
      update(
        storeId: string,
        categoryId: string,
        input: ProductCategoryUpdateRequest,
        token?: string,
      ): Promise<ProductCategory>;
    };
    products: {
      list(storeId: string, token?: string): Promise<ProductListResponse>;
      create(storeId: string, input: ProductCreateRequest, token?: string): Promise<Product>;
      get(storeId: string, productId: string, token?: string): Promise<Product>;
      update(
        storeId: string,
        productId: string,
        input: ProductUpdateRequest,
        token?: string,
      ): Promise<Product>;
      variants: {
        list(
          storeId: string,
          productId: string,
          token?: string,
        ): Promise<ProductVariantListResponse>;
        create(
          storeId: string,
          productId: string,
          input: ProductVariantCreateRequest,
          token?: string,
        ): Promise<ProductVariant>;
        update(
          storeId: string,
          productId: string,
          variantId: string,
          input: ProductVariantUpdateRequest,
          token?: string,
        ): Promise<ProductVariant>;
      };
    };
    inventory: {
      list(storeId: string, token?: string): Promise<InventoryListResponse>;
      get(storeId: string, variantId: string, token?: string): Promise<InventoryItem>;
      adjust(
        storeId: string,
        variantId: string,
        input: InventoryAdjustRequest,
        token?: string,
      ): Promise<InventoryAdjustmentResponse>;
    };
    orders: {
      list(storeId: string, query?: OrderListQuery, token?: string): Promise<OrderListResponse>;
      create(storeId: string, input: OrderCreateRequest, token?: string): Promise<Order>;
      get(storeId: string, orderId: string, token?: string): Promise<Order>;
      update(storeId: string, orderId: string, input: OrderUpdateRequest, token?: string): Promise<Order>;
      addLine(storeId: string, orderId: string, input: OrderLineInput, token?: string): Promise<Order>;
      updateLine(
        storeId: string,
        orderId: string,
        lineId: string,
        input: OrderLineUpdateRequest,
        token?: string,
      ): Promise<Order>;
      place(storeId: string, orderId: string, token?: string): Promise<Order>;
      cancel(storeId: string, orderId: string, input?: OrderCancelRequest, token?: string): Promise<Order>;
    };
    customers: {
      list(storeId: string, token?: string): Promise<StoreAdminCustomerListResponse>;
      create(
        storeId: string,
        input: StoreAdminCustomerCreateRequest,
        token?: string,
      ): Promise<StoreAdminCustomerCreateResponse>;
      get(storeId: string, customerId: string, token?: string): Promise<StoreAdminCustomerDetailResponse>;
      update(
        storeId: string,
        customerId: string,
        input: StoreAdminCustomerUpdateRequest,
        token?: string,
      ): Promise<{ customer: CustomerAccount }>;
      createCredential(
        storeId: string,
        customerId: string,
        token?: string,
      ): Promise<StoreAdminCredentialTokenResponse>;
      resetCredential(
        storeId: string,
        customerId: string,
        token?: string,
      ): Promise<StoreAdminCredentialTokenResponse>;
      revokeSessions(
        storeId: string,
        customerId: string,
        token?: string,
      ): Promise<StoreAdminRevokeSessionsResponse>;
      updateCommunicationPreferences(
        storeId: string,
        customerId: string,
        input: CustomerCommunicationPreference,
        token?: string,
      ): Promise<CustomerCommunicationPreference>;
      addresses: {
        create(
          storeId: string,
          customerId: string,
          input: CustomerAddressInput,
          token?: string,
        ): Promise<{ address: CustomerAddress }>;
        update(
          storeId: string,
          customerId: string,
          addressId: string,
          input: CustomerAddressInput,
          token?: string,
        ): Promise<{ address: CustomerAddress }>;
        remove(
          storeId: string,
          customerId: string,
          addressId: string,
          token?: string,
        ): Promise<{ deleted: boolean }>;
        setDefault(
          storeId: string,
          customerId: string,
          addressId: string,
          token?: string,
        ): Promise<{ updated: boolean }>;
      };
      ibans: {
        create(
          storeId: string,
          customerId: string,
          input: CustomerIbanInput,
          token?: string,
        ): Promise<{ iban: CustomerIban }>;
        remove(
          storeId: string,
          customerId: string,
          ibanId: string,
          token?: string,
        ): Promise<{ deleted: boolean }>;
        setDefault(
          storeId: string,
          customerId: string,
          ibanId: string,
          token?: string,
        ): Promise<{ updated: boolean }>;
      };
    };
    paymentProviders: {
      list(storeId: string, token?: string): Promise<PaymentProviderConfigListResponse>;
      create(
        storeId: string,
        input: PaymentProviderConfigCreateRequest,
        token?: string,
      ): Promise<PaymentProviderConfig>;
      get(storeId: string, configId: string, token?: string): Promise<PaymentProviderConfig>;
      update(
        storeId: string,
        configId: string,
        input: PaymentProviderConfigUpdateRequest,
        token?: string,
      ): Promise<PaymentProviderConfig>;
      setStatus(
        storeId: string,
        configId: string,
        input: PaymentProviderStatusUpdateRequest,
        token?: string,
      ): Promise<PaymentProviderConfig>;
      reorder(
        storeId: string,
        input: PaymentProviderReorderRequest,
        token?: string,
      ): Promise<PaymentProviderConfigListResponse>;
      testConnection(
        storeId: string,
        configId: string,
        token?: string,
      ): Promise<PaymentProviderTestConnectionResponse>;
      events(storeId: string, configId: string, token?: string): Promise<PaymentProviderEventListResponse>;
      storeEvents(storeId: string, token?: string): Promise<PaymentProviderEventListResponse>;
    };
    shippingProviders: {
      list(storeId: string, token?: string): Promise<ShippingProviderConfigListResponse>;
      create(
        storeId: string,
        input: ShippingProviderConfigCreateRequest,
        token?: string,
      ): Promise<ShippingProviderConfigResponse>;
      get(storeId: string, configId: string, token?: string): Promise<ShippingProviderConfigResponse>;
      update(
        storeId: string,
        configId: string,
        input: ShippingProviderConfigUpdateRequest,
        token?: string,
      ): Promise<ShippingProviderConfigResponse>;
      upsertCredential(
        storeId: string,
        configId: string,
        input: ShippingCredentialUpsertRequest,
        token?: string,
      ): Promise<ShippingProviderConfigResponse>;
      deleteCredential(
        storeId: string,
        configId: string,
        type: string,
        token?: string,
      ): Promise<ShippingProviderConfigResponse>;
      test(storeId: string, configId: string, token?: string): Promise<ShippingProviderTestResponse>;
      /** TODO-104 — webhook secret/token uretir/dondurur; secret yalniz bu yanitta BIR KEZ. */
      rotateWebhook(
        storeId: string,
        configId: string,
        token?: string,
      ): Promise<ShippingWebhookRotateResponse>;
      /** TODO-100 — terminal olmayan gonderileri toplu tracking sync'ten gecirir. */
      syncAllShipments(
        storeId: string,
        input: ShipmentSyncAllRequest,
        token?: string,
      ): Promise<ShipmentSyncAllResponse>;
    };
    shippingRatePlans: {
      list(storeId: string, token?: string): Promise<ShippingRatePlanListResponse>;
      create(
        storeId: string,
        input: ShippingRatePlanCreateRequest,
        token?: string,
      ): Promise<ShippingRatePlanResponse>;
      get(storeId: string, planId: string, token?: string): Promise<ShippingRatePlanResponse>;
      update(
        storeId: string,
        planId: string,
        input: ShippingRatePlanUpdateRequest,
        token?: string,
      ): Promise<ShippingRatePlanResponse>;
      remove(storeId: string, planId: string, token?: string): Promise<void>;
      setDefault(storeId: string, planId: string, token?: string): Promise<ShippingRatePlanResponse>;
      addRule(
        storeId: string,
        planId: string,
        input: ShippingRateRuleInput,
        token?: string,
      ): Promise<ShippingRatePlanResponse>;
      updateRule(
        storeId: string,
        planId: string,
        ruleId: string,
        input: ShippingRateRulePatch,
        token?: string,
      ): Promise<ShippingRatePlanResponse>;
      deleteRule(
        storeId: string,
        planId: string,
        ruleId: string,
        token?: string,
      ): Promise<ShippingRatePlanResponse>;
      addTier(
        storeId: string,
        planId: string,
        input: ShippingRateTierInput,
        token?: string,
      ): Promise<ShippingRatePlanResponse>;
      deleteTier(
        storeId: string,
        planId: string,
        tierId: string,
        token?: string,
      ): Promise<ShippingRatePlanResponse>;
      addZone(
        storeId: string,
        planId: string,
        input: ShippingRateZoneInput,
        token?: string,
      ): Promise<ShippingRatePlanResponse>;
      deleteZone(
        storeId: string,
        planId: string,
        zoneId: string,
        token?: string,
      ): Promise<ShippingRatePlanResponse>;
      addSurcharge(
        storeId: string,
        planId: string,
        input: ShippingSurchargeInput,
        token?: string,
      ): Promise<ShippingRatePlanResponse>;
      deleteSurcharge(
        storeId: string,
        planId: string,
        surchargeId: string,
        token?: string,
      ): Promise<ShippingRatePlanResponse>;
      matrixPreview(
        storeId: string,
        planId: string,
        input: ShippingMatrixApplyRequest,
        token?: string,
      ): Promise<ShippingMatrixPreviewResponse>;
      matrixApply(
        storeId: string,
        planId: string,
        input: ShippingMatrixApplyRequest,
        token?: string,
      ): Promise<ShippingMatrixApplyResponse>;
      importPreview(
        storeId: string,
        planId: string,
        input: ShippingImportRequest,
        token?: string,
      ): Promise<ShippingImportPreviewResponse>;
      importApply(
        storeId: string,
        planId: string,
        input: ShippingImportRequest,
        token?: string,
      ): Promise<ShippingImportApplyResponse>;
    };
    orderShipping: {
      get(storeId: string, orderId: string, token?: string): Promise<OrderShippingResponse>;
      rate(
        storeId: string,
        orderId: string,
        input: ShippingRateRequest,
        token?: string,
      ): Promise<ShippingRateResponse>;
      createOrder(
        storeId: string,
        orderId: string,
        input: ShippingCreateOrderRequest,
        token?: string,
      ): Promise<{ referenceId: string; externalOrderId: string | null }>;
      createBarcode(
        storeId: string,
        orderId: string,
        input: ShippingCreateBarcodeRequest,
        token?: string,
      ): Promise<{ referenceId: string; externalShipmentId: string | null; barcodeCount: number }>;
      // F3C.3 — DHL post-order operasyon admin aksiyonlari.
      dhlPrepare(
        storeId: string,
        orderId: string,
        input: ShippingPrepareRequest,
        token?: string,
      ): Promise<ShippingShipmentMutationResponse>;
      // F3C.5 (TODO-126) — manuel gönderi hazırlama (provider'a İSTEK ATMAZ; online prepare fallback'i).
      shipmentDraft(
        storeId: string,
        orderId: string,
        input: ShippingPrepareRequest,
        token?: string,
      ): Promise<ShippingShipmentMutationResponse>;
      dhlBarcode(
        storeId: string,
        orderId: string,
        input: ShippingBarcodeActionRequest,
        token?: string,
      ): Promise<ShippingShipmentMutationResponse>;
      dhlSync(
        storeId: string,
        orderId: string,
        input: ShippingSyncRequest,
        token?: string,
      ): Promise<ShippingShipmentMutationResponse>;
      dhlCancel(
        storeId: string,
        orderId: string,
        input: ShippingCancelRequest,
        token?: string,
      ): Promise<ShippingShipmentMutationResponse>;
    };
    // F3C.5 (TODO-121) — store-level shipment domain (provider-agnostic).
    shipments: {
      list(storeId: string, query?: ShipmentListQuery, token?: string): Promise<ShipmentListResponse>;
      get(storeId: string, shipmentId: string, token?: string): Promise<ShipmentDetailResponse>;
      createLabel(
        storeId: string,
        shipmentId: string,
        input: ShipmentCreateLabelRequest,
        token?: string,
      ): Promise<ShippingShipmentMutationResponse>;
      sync(storeId: string, shipmentId: string, token?: string): Promise<ShippingShipmentMutationResponse>;
      cancel(
        storeId: string,
        shipmentId: string,
        input: ShipmentCancelRequest,
        token?: string,
      ): Promise<ShippingShipmentMutationResponse>;
      manualTracking(
        storeId: string,
        shipmentId: string,
        input: ShipmentManualTrackingRequest,
        token?: string,
      ): Promise<ShippingShipmentMutationResponse>;
    };
  };
}

/**
 * Resolve the gateway base URL from an explicit value, then the
 * API_GATEWAY_URL environment variable, then a localhost default.
 * Trailing slashes are trimmed for safe path concatenation.
 */
export function resolveApiGatewayUrl(explicit?: string): string {
  const fromEnv = typeof process !== "undefined" ? process.env.API_GATEWAY_URL : undefined;
  return (explicit ?? fromEnv ?? DEFAULT_API_GATEWAY_URL).replace(/\/+$/, "");
}

/**
 * TODO-073 — Sipariş listesi filtre sorgu dizesi. Yalnız tanımlı/boş-olmayan
 * filtreler eklenir; `undefined` ve boş string atlanır. Deterministik sıra
 * (anahtar bazlı) testleri sade tutar. Çıktı baştaki `?` ile gelir veya boştur.
 */
function orderListQueryString(query?: OrderListQuery): string {
  if (!query) return "";
  const params = new URLSearchParams();
  const append = (key: string, value: string | number | undefined): void => {
    if (value === undefined) return;
    const str = String(value).trim();
    if (str.length > 0) params.set(key, str);
  };
  append("status", query.status);
  append("paymentStatus", query.paymentStatus);
  append("fulfillmentStatus", query.fulfillmentStatus);
  append("search", query.search);
  append("dateFrom", query.dateFrom);
  append("dateTo", query.dateTo);
  // limit/offset yalnız varsayılan dışıysa taşınır (pagination korunur).
  if (query.limit !== undefined) append("limit", query.limit);
  if (query.offset !== undefined && query.offset > 0) append("offset", query.offset);
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

/** F3C.5 (TODO-121) — shipment liste filtre sorgu dizesi (boş/undefined atlanır). */
function shipmentListQueryString(query?: ShipmentListQuery): string {
  if (!query) return "";
  const params = new URLSearchParams();
  const append = (key: string, value: string | number | undefined): void => {
    if (value === undefined) return;
    const str = String(value).trim();
    if (str.length > 0) params.set(key, str);
  };
  append("search", query.search);
  append("status", query.status);
  append("provider", query.provider);
  append("dateFrom", query.dateFrom);
  append("dateTo", query.dateTo);
  append("flag", query.flag);
  if (query.take !== undefined) append("take", query.take);
  if (query.skip !== undefined && query.skip > 0) append("skip", query.skip);
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = resolveApiGatewayUrl(options.baseUrl);
  const doFetch = options.fetch ?? fetch;

  async function requestJson<T>(
    path: string,
    init: RequestInit = {},
    token = options.token,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has("content-type") && init.body) {
      headers.set("content-type", "application/json");
    }
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }

    const response = await doFetch(`${baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      let code = "UNKNOWN";
      let message = `API gateway request failed: ${path} (${response.status})`;
      let details: unknown;
      try {
        const body: unknown = await response.json();
        if (isErrorEnvelope(body)) {
          if (typeof body.error.code === "string") code = body.error.code;
          if (typeof body.error.message === "string") message = body.error.message;
          details = body.error.details;
        }
      } catch {
        // Govde JSON degilse status tabanli genel hata ile devam edilir.
      }
      throw new ApiError(response.status, code, message, details);
    }
    return (await response.json()) as T;
  }

  function getJson<T>(path: string, token?: string): Promise<T> {
    return requestJson<T>(path, {}, token);
  }

  function sendJson<T>(path: string, method: string, body?: unknown, token?: string): Promise<T> {
    return requestJson<T>(
      path,
      { method, body: body === undefined ? undefined : JSON.stringify(body) },
      token,
    );
  }

  return {
    baseUrl,
    health: () => getJson<HealthResponse>("/health"),
    version: () => getJson<VersionResponse>("/version"),
    internal: {
      dbHealth: (token) => getJson<InternalHealthResponse>("/internal/health/db", token),
      redisHealth: (token) => getJson<InternalHealthResponse>("/internal/health/redis", token),
    },
    auth: {
      platformLogin: (input) =>
        sendJson<PlatformLoginResponse>("/auth/platform/login", "POST", input),
      platformLogout: (token) =>
        sendJson<PlatformLogoutResponse>("/auth/platform/logout", "POST", undefined, token),
      platformMe: (token) => getJson<PlatformMeResponse>("/auth/platform/me", token),
    },
    admin: {
      stores: {
        list: (token) => getJson<AdminStoreListResponse>("/admin/stores", token),
        create: (input, token) => sendJson<AdminStore>("/admin/stores", "POST", input, token),
        get: (id, token) => getJson<AdminStore>(`/admin/stores/${id}`, token),
        update: (id, input, token) =>
          sendJson<AdminStore>(`/admin/stores/${id}`, "PATCH", input, token),
      },
      plans: {
        list: (token) => getJson<PlanListResponse>("/admin/plans", token),
        create: (input, token) => sendJson<Plan>("/admin/plans", "POST", input, token),
        get: (id, token) => getJson<Plan>(`/admin/plans/${id}`, token),
        update: (id, input, token) =>
          sendJson<Plan>(`/admin/plans/${id}`, "PATCH", input, token),
      },
      categories: {
        list: (storeId, token) =>
          getJson<ProductCategoryListResponse>(`/stores/${storeId}/categories`, token),
        create: (storeId, input, token) =>
          sendJson<ProductCategory>(`/stores/${storeId}/categories`, "POST", input, token),
        get: (storeId, categoryId, token) =>
          getJson<ProductCategory>(`/stores/${storeId}/categories/${categoryId}`, token),
        update: (storeId, categoryId, input, token) =>
          sendJson<ProductCategory>(
            `/stores/${storeId}/categories/${categoryId}`,
            "PATCH",
            input,
            token,
          ),
      },
      products: {
        list: (storeId, token) =>
          getJson<ProductListResponse>(`/stores/${storeId}/products`, token),
        create: (storeId, input, token) =>
          sendJson<Product>(`/stores/${storeId}/products`, "POST", input, token),
        get: (storeId, productId, token) =>
          getJson<Product>(`/stores/${storeId}/products/${productId}`, token),
        update: (storeId, productId, input, token) =>
          sendJson<Product>(`/stores/${storeId}/products/${productId}`, "PATCH", input, token),
        variants: {
          list: (storeId, productId, token) =>
            getJson<ProductVariantListResponse>(
              `/stores/${storeId}/products/${productId}/variants`,
              token,
            ),
          create: (storeId, productId, input, token) =>
            sendJson<ProductVariant>(
              `/stores/${storeId}/products/${productId}/variants`,
              "POST",
              input,
              token,
            ),
          update: (storeId, productId, variantId, input, token) =>
            sendJson<ProductVariant>(
              `/stores/${storeId}/products/${productId}/variants/${variantId}`,
              "PATCH",
              input,
              token,
            ),
        },
      },
      inventory: {
        list: (storeId, token) => getJson<InventoryListResponse>(`/stores/${storeId}/inventory`, token),
        get: (storeId, variantId, token) =>
          getJson<InventoryItem>(`/stores/${storeId}/inventory/${variantId}`, token),
        adjust: (storeId, variantId, input, token) =>
          sendJson<InventoryAdjustmentResponse>(
            `/stores/${storeId}/inventory/${variantId}/adjust`,
            "POST",
            input,
            token,
          ),
      },
      orders: {
        list: (storeId, query, token) =>
          getJson<OrderListResponse>(`/stores/${storeId}/orders${orderListQueryString(query)}`, token),
        create: (storeId, input, token) =>
          sendJson<Order>(`/stores/${storeId}/orders`, "POST", input, token),
        get: (storeId, orderId, token) =>
          getJson<Order>(`/stores/${storeId}/orders/${orderId}`, token),
        update: (storeId, orderId, input, token) =>
          sendJson<Order>(`/stores/${storeId}/orders/${orderId}`, "PATCH", input, token),
        addLine: (storeId, orderId, input, token) =>
          sendJson<Order>(`/stores/${storeId}/orders/${orderId}/lines`, "POST", input, token),
        updateLine: (storeId, orderId, lineId, input, token) =>
          sendJson<Order>(
            `/stores/${storeId}/orders/${orderId}/lines/${lineId}`,
            "PATCH",
            input,
            token,
          ),
        place: (storeId, orderId, token) =>
          sendJson<Order>(`/stores/${storeId}/orders/${orderId}/place`, "POST", undefined, token),
        cancel: (storeId, orderId, input = {}, token) =>
          sendJson<Order>(`/stores/${storeId}/orders/${orderId}/cancel`, "POST", input, token),
      },
      customers: {
        list: (storeId, token) =>
          getJson<StoreAdminCustomerListResponse>(`/stores/${storeId}/customers`, token),
        create: (storeId, input, token) =>
          sendJson<StoreAdminCustomerCreateResponse>(
            `/stores/${storeId}/customers`,
            "POST",
            input,
            token,
          ),
        get: (storeId, customerId, token) =>
          getJson<StoreAdminCustomerDetailResponse>(
            `/stores/${storeId}/customers/${customerId}`,
            token,
          ),
        update: (storeId, customerId, input, token) =>
          sendJson<{ customer: CustomerAccount }>(
            `/stores/${storeId}/customers/${customerId}`,
            "PATCH",
            input,
            token,
          ),
        createCredential: (storeId, customerId, token) =>
          sendJson<StoreAdminCredentialTokenResponse>(
            `/stores/${storeId}/customers/${customerId}/credential`,
            "POST",
            undefined,
            token,
          ),
        resetCredential: (storeId, customerId, token) =>
          sendJson<StoreAdminCredentialTokenResponse>(
            `/stores/${storeId}/customers/${customerId}/credential/reset`,
            "POST",
            undefined,
            token,
          ),
        revokeSessions: (storeId, customerId, token) =>
          sendJson<StoreAdminRevokeSessionsResponse>(
            `/stores/${storeId}/customers/${customerId}/sessions/revoke`,
            "POST",
            undefined,
            token,
          ),
        updateCommunicationPreferences: (storeId, customerId, input, token) =>
          sendJson<CustomerCommunicationPreference>(
            `/stores/${storeId}/customers/${customerId}/communication-preferences`,
            "PUT",
            input,
            token,
          ),
        addresses: {
          create: (storeId, customerId, input, token) =>
            sendJson<{ address: CustomerAddress }>(
              `/stores/${storeId}/customers/${customerId}/addresses`,
              "POST",
              input,
              token,
            ),
          update: (storeId, customerId, addressId, input, token) =>
            sendJson<{ address: CustomerAddress }>(
              `/stores/${storeId}/customers/${customerId}/addresses/${addressId}`,
              "PATCH",
              input,
              token,
            ),
          remove: (storeId, customerId, addressId, token) =>
            sendJson<{ deleted: boolean }>(
              `/stores/${storeId}/customers/${customerId}/addresses/${addressId}`,
              "DELETE",
              undefined,
              token,
            ),
          setDefault: (storeId, customerId, addressId, token) =>
            sendJson<{ updated: boolean }>(
              `/stores/${storeId}/customers/${customerId}/addresses/${addressId}/default`,
              "POST",
              undefined,
              token,
            ),
        },
        ibans: {
          create: (storeId, customerId, input, token) =>
            sendJson<{ iban: CustomerIban }>(
              `/stores/${storeId}/customers/${customerId}/ibans`,
              "POST",
              input,
              token,
            ),
          remove: (storeId, customerId, ibanId, token) =>
            sendJson<{ deleted: boolean }>(
              `/stores/${storeId}/customers/${customerId}/ibans/${ibanId}`,
              "DELETE",
              undefined,
              token,
            ),
          setDefault: (storeId, customerId, ibanId, token) =>
            sendJson<{ updated: boolean }>(
              `/stores/${storeId}/customers/${customerId}/ibans/${ibanId}/default`,
              "POST",
              undefined,
              token,
            ),
        },
      },
      paymentProviders: {
        list: (storeId, token) =>
          getJson<PaymentProviderConfigListResponse>(`/stores/${storeId}/payment-providers`, token),
        create: (storeId, input, token) =>
          sendJson<PaymentProviderConfig>(`/stores/${storeId}/payment-providers`, "POST", input, token),
        get: (storeId, configId, token) =>
          getJson<PaymentProviderConfig>(`/stores/${storeId}/payment-providers/${configId}`, token),
        update: (storeId, configId, input, token) =>
          sendJson<PaymentProviderConfig>(
            `/stores/${storeId}/payment-providers/${configId}`,
            "PATCH",
            input,
            token,
          ),
        setStatus: (storeId, configId, input, token) =>
          sendJson<PaymentProviderConfig>(
            `/stores/${storeId}/payment-providers/${configId}/status`,
            "POST",
            input,
            token,
          ),
        reorder: (storeId, input, token) =>
          sendJson<PaymentProviderConfigListResponse>(
            `/stores/${storeId}/payment-providers/reorder`,
            "POST",
            input,
            token,
          ),
        testConnection: (storeId, configId, token) =>
          sendJson<PaymentProviderTestConnectionResponse>(
            `/stores/${storeId}/payment-providers/${configId}/test-connection`,
            "POST",
            undefined,
            token,
          ),
        events: (storeId, configId, token) =>
          getJson<PaymentProviderEventListResponse>(
            `/stores/${storeId}/payment-providers/${configId}/events`,
            token,
          ),
        storeEvents: (storeId, token) =>
          getJson<PaymentProviderEventListResponse>(`/stores/${storeId}/payment-events`, token),
      },
      shippingProviders: {
        list: (storeId, token) =>
          getJson<ShippingProviderConfigListResponse>(`/stores/${storeId}/shipping/providers`, token),
        create: (storeId, input, token) =>
          sendJson<ShippingProviderConfigResponse>(`/stores/${storeId}/shipping/providers`, "POST", input, token),
        get: (storeId, configId, token) =>
          getJson<ShippingProviderConfigResponse>(`/stores/${storeId}/shipping/providers/${configId}`, token),
        update: (storeId, configId, input, token) =>
          sendJson<ShippingProviderConfigResponse>(
            `/stores/${storeId}/shipping/providers/${configId}`,
            "PATCH",
            input,
            token,
          ),
        upsertCredential: (storeId, configId, input, token) =>
          sendJson<ShippingProviderConfigResponse>(
            `/stores/${storeId}/shipping/providers/${configId}/credentials`,
            "POST",
            input,
            token,
          ),
        deleteCredential: (storeId, configId, type, token) =>
          sendJson<ShippingProviderConfigResponse>(
            `/stores/${storeId}/shipping/providers/${configId}/credentials/${type}`,
            "DELETE",
            undefined,
            token,
          ),
        test: (storeId, configId, token) =>
          sendJson<ShippingProviderTestResponse>(
            `/stores/${storeId}/shipping/providers/${configId}/test`,
            "POST",
            undefined,
            token,
          ),
        rotateWebhook: (storeId, configId, token) =>
          sendJson<ShippingWebhookRotateResponse>(
            `/stores/${storeId}/shipping/providers/${configId}/webhook/rotate`,
            "POST",
            undefined,
            token,
          ),
        syncAllShipments: (storeId, input, token) =>
          sendJson<ShipmentSyncAllResponse>(
            `/stores/${storeId}/shipping/shipments/sync-all`,
            "POST",
            input,
            token,
          ),
      },
      shippingRatePlans: {
        list: (storeId, token) =>
          getJson<ShippingRatePlanListResponse>(`/stores/${storeId}/shipping/rate-plans`, token),
        create: (storeId, input, token) =>
          sendJson<ShippingRatePlanResponse>(`/stores/${storeId}/shipping/rate-plans`, "POST", input, token),
        get: (storeId, planId, token) =>
          getJson<ShippingRatePlanResponse>(`/stores/${storeId}/shipping/rate-plans/${planId}`, token),
        update: (storeId, planId, input, token) =>
          sendJson<ShippingRatePlanResponse>(
            `/stores/${storeId}/shipping/rate-plans/${planId}`,
            "PATCH",
            input,
            token,
          ),
        remove: (storeId, planId, token) =>
          sendJson<void>(`/stores/${storeId}/shipping/rate-plans/${planId}`, "DELETE", undefined, token),
        setDefault: (storeId, planId, token) =>
          sendJson<ShippingRatePlanResponse>(
            `/stores/${storeId}/shipping/rate-plans/${planId}/default`,
            "POST",
            undefined,
            token,
          ),
        addRule: (storeId, planId, input, token) =>
          sendJson<ShippingRatePlanResponse>(
            `/stores/${storeId}/shipping/rate-plans/${planId}/rules`,
            "POST",
            input,
            token,
          ),
        updateRule: (storeId, planId, ruleId, input, token) =>
          sendJson<ShippingRatePlanResponse>(
            `/stores/${storeId}/shipping/rate-plans/${planId}/rules/${ruleId}`,
            "PATCH",
            input,
            token,
          ),
        deleteRule: (storeId, planId, ruleId, token) =>
          sendJson<ShippingRatePlanResponse>(
            `/stores/${storeId}/shipping/rate-plans/${planId}/rules/${ruleId}`,
            "DELETE",
            undefined,
            token,
          ),
        addTier: (storeId, planId, input, token) =>
          sendJson<ShippingRatePlanResponse>(
            `/stores/${storeId}/shipping/rate-plans/${planId}/tiers`,
            "POST",
            input,
            token,
          ),
        deleteTier: (storeId, planId, tierId, token) =>
          sendJson<ShippingRatePlanResponse>(
            `/stores/${storeId}/shipping/rate-plans/${planId}/tiers/${tierId}`,
            "DELETE",
            undefined,
            token,
          ),
        addZone: (storeId, planId, input, token) =>
          sendJson<ShippingRatePlanResponse>(
            `/stores/${storeId}/shipping/rate-plans/${planId}/zones`,
            "POST",
            input,
            token,
          ),
        deleteZone: (storeId, planId, zoneId, token) =>
          sendJson<ShippingRatePlanResponse>(
            `/stores/${storeId}/shipping/rate-plans/${planId}/zones/${zoneId}`,
            "DELETE",
            undefined,
            token,
          ),
        addSurcharge: (storeId, planId, input, token) =>
          sendJson<ShippingRatePlanResponse>(
            `/stores/${storeId}/shipping/rate-plans/${planId}/surcharges`,
            "POST",
            input,
            token,
          ),
        deleteSurcharge: (storeId, planId, surchargeId, token) =>
          sendJson<ShippingRatePlanResponse>(
            `/stores/${storeId}/shipping/rate-plans/${planId}/surcharges/${surchargeId}`,
            "DELETE",
            undefined,
            token,
          ),
        matrixPreview: (storeId, planId, input, token) =>
          sendJson<ShippingMatrixPreviewResponse>(
            `/stores/${storeId}/shipping/rate-plans/${planId}/matrix/preview`,
            "POST",
            input,
            token,
          ),
        matrixApply: (storeId, planId, input, token) =>
          sendJson<ShippingMatrixApplyResponse>(
            `/stores/${storeId}/shipping/rate-plans/${planId}/matrix/apply`,
            "POST",
            input,
            token,
          ),
        importPreview: (storeId, planId, input, token) =>
          sendJson<ShippingImportPreviewResponse>(
            `/stores/${storeId}/shipping/rate-plans/${planId}/import/preview`,
            "POST",
            input,
            token,
          ),
        importApply: (storeId, planId, input, token) =>
          sendJson<ShippingImportApplyResponse>(
            `/stores/${storeId}/shipping/rate-plans/${planId}/import/apply`,
            "POST",
            input,
            token,
          ),
      },
      orderShipping: {
        get: (storeId, orderId, token) =>
          getJson<OrderShippingResponse>(`/stores/${storeId}/orders/${orderId}/shipping`, token),
        rate: (storeId, orderId, input, token) =>
          sendJson<ShippingRateResponse>(
            `/stores/${storeId}/orders/${orderId}/shipping/rate`,
            "POST",
            input,
            token,
          ),
        createOrder: (storeId, orderId, input, token) =>
          sendJson<{ referenceId: string; externalOrderId: string | null }>(
            `/stores/${storeId}/orders/${orderId}/shipping/create-order`,
            "POST",
            input,
            token,
          ),
        createBarcode: (storeId, orderId, input, token) =>
          sendJson<{ referenceId: string; externalShipmentId: string | null; barcodeCount: number }>(
            `/stores/${storeId}/orders/${orderId}/shipping/create-barcode`,
            "POST",
            input,
            token,
          ),
        dhlPrepare: (storeId, orderId, input, token) =>
          sendJson<ShippingShipmentMutationResponse>(
            `/stores/${storeId}/orders/${orderId}/shipping/dhl/prepare`,
            "POST",
            input,
            token,
          ),
        // F3C.5 (TODO-126) — manuel gönderi hazırlama (provider'a İSTEK ATMAZ; online prepare fallback'i).
        shipmentDraft: (storeId, orderId, input, token) =>
          sendJson<ShippingShipmentMutationResponse>(
            `/stores/${storeId}/orders/${orderId}/shipping/shipment-draft`,
            "POST",
            input,
            token,
          ),
        dhlBarcode: (storeId, orderId, input, token) =>
          sendJson<ShippingShipmentMutationResponse>(
            `/stores/${storeId}/orders/${orderId}/shipping/dhl/barcode`,
            "POST",
            input,
            token,
          ),
        dhlSync: (storeId, orderId, input, token) =>
          sendJson<ShippingShipmentMutationResponse>(
            `/stores/${storeId}/orders/${orderId}/shipping/dhl/sync`,
            "POST",
            input,
            token,
          ),
        dhlCancel: (storeId, orderId, input, token) =>
          sendJson<ShippingShipmentMutationResponse>(
            `/stores/${storeId}/orders/${orderId}/shipping/dhl/cancel`,
            "POST",
            input,
            token,
          ),
      },
      shipments: {
        list: (storeId, query, token) =>
          getJson<ShipmentListResponse>(
            `/stores/${storeId}/shipping/shipments${shipmentListQueryString(query)}`,
            token,
          ),
        get: (storeId, shipmentId, token) =>
          getJson<ShipmentDetailResponse>(`/stores/${storeId}/shipping/shipments/${shipmentId}`, token),
        createLabel: (storeId, shipmentId, input, token) =>
          sendJson<ShippingShipmentMutationResponse>(
            `/stores/${storeId}/shipping/shipments/${shipmentId}/create-label`,
            "POST",
            input,
            token,
          ),
        sync: (storeId, shipmentId, token) =>
          sendJson<ShippingShipmentMutationResponse>(
            `/stores/${storeId}/shipping/shipments/${shipmentId}/sync`,
            "POST",
            {},
            token,
          ),
        cancel: (storeId, shipmentId, input, token) =>
          sendJson<ShippingShipmentMutationResponse>(
            `/stores/${storeId}/shipping/shipments/${shipmentId}/cancel`,
            "POST",
            input,
            token,
          ),
        manualTracking: (storeId, shipmentId, input, token) =>
          sendJson<ShippingShipmentMutationResponse>(
            `/stores/${storeId}/shipping/shipments/${shipmentId}/manual-tracking`,
            "POST",
            input,
            token,
          ),
      },
    },
  };
}
