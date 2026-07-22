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
  HeroSlide,
  HeroSlideCreateRequest,
  HeroSlideListResponse,
  HeroSlideReorderRequest,
  HeroSlideStatusActionResponse,
  HeroSlideUpdateRequest,
  HomeSection,
  HomeSectionCreateRequest,
  HomeSectionListResponse,
  HomeSectionReorderRequest,
  HomeSectionUpdateRequest,
  HomeHeroSlide,
  HomeHeroSlideCreateRequest,
  HomeHeroSlideListResponse,
  HomeHeroSlideReorderRequest,
  HomeHeroSlideUpdateRequest,
  HomeFeaturedCategory,
  HomeFeaturedCategoryCreateRequest,
  HomeFeaturedCategoryListResponse,
  HomeFeaturedCategoryReorderRequest,
  HomeFeaturedCategoryUpdateRequest,
  HomeShowcaseProductListResponse,
  HomeShowcaseProductSetRequest,
  Product,
  ProductCategory,
  ProductCategoryCreateRequest,
  ProductCategoryListResponse,
  ProductCategoryUpdateRequest,
  // TODO-159B (ADR-090) — Admin Searchable Selector yanıt tipleri.
  AdminProductSelectorResponse,
  AdminCategorySelectorResponse,
  AttributeDefinition,
  AttributeDefinitionCreateRequest,
  AttributeDefinitionListResponse,
  AttributeDefinitionUpdateRequest,
  AttributeGroup,
  AttributeGroupCreateRequest,
  AttributeGroupListResponse,
  AttributeGroupUpdateRequest,
  AttributeOption,
  AttributeOptionCreateRequest,
  AttributeOptionListResponse,
  AttributeOptionUpdateRequest,
  CategoryAttribute,
  CategoryAttributeCreateRequest,
  CategoryAttributeListResponse,
  CategoryAttributeUpdateRequest,
  ProductCreateRequest,
  ProductListResponse,
  ProductPriceChangeListResponse,
  ProductUpdateRequest,
  // TODO-159A (ADR-089) — Admin Data Grid liste sözleşmesi.
  AdminProductFilterOptionsResponse,
  ProductVariant,
  ProductVariantCreateRequest,
  ProductVariantListResponse,
  ProductVariantUpdateRequest,
  // Faz 2A (ADR-068) — urun/varyant attribute deger tipleri.
  ProductAttributeValueListResponse,
  ProductAttributeValuesReplaceRequest,
  VariantAttributeValueListResponse,
  VariantAttributeValuesReplaceRequest,
  // Faz 2C-1 (ADR-070) — urun-seviyesi varyant eksen secimi tipleri.
  ProductVariantSelectionListResponse,
  ProductVariantSelectionsReplaceRequest,
  // Faz 2C-2 (ADR-071) — Combination Engine onizleme tipi.
  VariantCombinationPreviewResponse,
  // Faz 2C-3 (ADR-072) — ProductVariant uretim (persistence) yanit tipi.
  VariantGenerationResponse,
  // TODO-150 (ADR-073) — Identity Management Engine tipleri.
  IdentityPreviewResponse,
  IdentityApplyResponse,
  IdentityApplyRequest,
  // TODO-151 (ADR-074) — Commercial Engine tipleri.
  CommercialPreviewResponse,
  CommercialPreviewRequest,
  CommercialApplyRequest,
  CommercialApplyResponse,
  // TODO-152 (ADR-076) — Inventory Engine tipleri.
  InventoryWarehouseListResponse,
  InventoryPreviewRequest,
  InventoryPreviewResponse,
  InventoryApplyRequest,
  InventoryApplyResponse,
  // TODO-152A — mağaza-geneli izleme matris.
  InventoryStoreMatrixResponse,
  // ADR-065 Faz 2 (Dilim 4) — Magaza marka ayarlari (logo/favicon).
  StoreSettings,
  StoreSettingsUpdateRequest,
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
  ShippingWebhookInfoResponse,
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
  // TODO-124 — CBS il/ilce listeleri + varis eslemesi onarimi.
  ShippingCbsCitiesResponse,
  ShippingCbsDistrictsRequest,
  ShippingCbsDistrictsResponse,
  ShipmentRepairDestinationRequest,
  ShipmentRepairDestinationResponse,
  ShippingAddressUpdateRequest,
  ShippingAddressUpdateResponse,
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
  // F4A — Kampanya/kupon yonetimi (ADR-058).
  CampaignResponse,
  CampaignListResponse,
  CampaignDetailResponse,
  CampaignCreateRequest,
  CampaignUpdateRequest,
  // F4A.3 — Kupon atama / musteri cuzdani (ADR-060).
  CouponAssignmentRequest,
  CustomerCouponAssignment,
  CustomerCouponAssignmentListResponse,
  // ADR-065 Faz 2 (Dilim 1) — Media kutuphanesi. TODO-159B (ADR-090): liste artık
  // `context`i ortak query haritasında taşır; MediaContext tipi yalnız RE-EXPORT
  // edilir (transport imzasında doğrudan kullanılmaz).
  MediaListResponse,
  MediaUploadResponse,
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
  OrderDiscountLine,
  // F4C (ADR-064) — Satis/kar ozeti tipleri (admin siparis detayi).
  OrderSalesSummary,
  OrderSalesSummaryVatLine,
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
  HeroSlide,
  HeroSlideCreateRequest,
  HeroSlideListResponse,
  HeroSlideReorderRequest,
  HeroSlideStatusActionResponse,
  HeroSlideUpdateRequest,
  HomeSection,
  HomeSectionType,
  HomeSectionCreateRequest,
  HomeSectionListResponse,
  HomeSectionReorderRequest,
  HomeSectionUpdateRequest,
  HomeHeroSlide,
  HomeHeroSlideCreateRequest,
  HomeHeroSlideListResponse,
  HomeHeroSlideReorderRequest,
  HomeHeroSlideUpdateRequest,
  HomeFeaturedCategory,
  HomeFeaturedCategoryCreateRequest,
  HomeFeaturedCategoryListResponse,
  HomeFeaturedCategoryReorderRequest,
  HomeFeaturedCategoryUpdateRequest,
  HomeShowcaseProduct,
  HomeShowcaseProductListResponse,
  HomeShowcaseProductSetRequest,
  // TODO-158B (ADR-087) — Enterprise Theme Engine admin kontrat tipleri.
  ThemeStatus,
  ThemeSummary,
  ThemeVersionSummary,
  ThemeListResponse,
  ThemeDetail,
  ThemeCreateRequest,
  ThemeUpdateRequest,
  ThemeDraftUpdateRequest,
  ThemePublishRequest,
  ThemeRollbackRequest,
  ThemeImportRequest,
  ThemeExportResponse,
  ThemePresetSummary,
  ThemePresetListResponse,
  ThemePreviewResponse,
  Product,
  ProductCategory,
  ProductCategoryCreateRequest,
  ProductCategoryListResponse,
  ProductCategoryUpdateRequest,
  AttributeDefinition,
  AttributeDefinitionCreateRequest,
  AttributeDefinitionListResponse,
  AttributeDefinitionUpdateRequest,
  AttributeGroup,
  AttributeGroupCreateRequest,
  AttributeGroupListResponse,
  AttributeGroupUpdateRequest,
  AttributeOption,
  AttributeOptionCreateRequest,
  AttributeOptionListResponse,
  AttributeOptionUpdateRequest,
  CategoryAttribute,
  CategoryAttributeCreateRequest,
  CategoryAttributeListResponse,
  CategoryAttributeUpdateRequest,
  ProductCreateRequest,
  ProductListResponse,
  ProductPriceVisibility,
  // TODO-159A (ADR-089) — Admin Data Grid ortak liste sözleşmesi tipleri.
  AdminListPagination,
  AdminListSortOrder,
  AdminProductListQuery,
  AdminProductListSortBy,
  AdminProductStockStatus,
  AdminProductFilterOptionsResponse,
  AdminCategoryListQuery,
  AdminCategoryListSortBy,
  AdminCustomerListQuery,
  AdminCustomerListSortBy,
  AdminOrderListSortBy,
  // TODO-159B (ADR-090) — Admin Searchable Selector sözleşmesi tipleri.
  AdminSelectorQueryBase,
  AdminProductSelectorOption,
  AdminProductSelectorQuery,
  AdminProductSelectorResponse,
  AdminProductSelectorSortBy,
  AdminCategorySelectorOption,
  AdminCategorySelectorQuery,
  AdminCategorySelectorResponse,
  AdminCategorySelectorSortBy,
  AdminMediaListQuery,
  AdminMediaListSortBy,
  ProductPrimaryAction,
  ProductPriceChange,
  ProductPriceChangeListResponse,
  ProductSalesMode,
  ProductUpdateRequest,
  ProductVariant,
  ProductVariantCreateRequest,
  ProductVariantListResponse,
  ProductVariantUpdateRequest,
  // Faz 2A (ADR-068) — urun/varyant attribute deger tipleri.
  ProductAttributeValueListResponse,
  ProductAttributeValuesReplaceRequest,
  VariantAttributeValueListResponse,
  VariantAttributeValuesReplaceRequest,
  // Faz 2C-1 (ADR-070) — urun-seviyesi varyant eksen secimi tipleri.
  ProductVariantSelectionListResponse,
  ProductVariantSelectionsReplaceRequest,
  ProductVariantSelectionInput,
  ProductVariantSelectionResponse,
  // Faz 2C-2 (ADR-071) — Combination Engine onizleme tipleri.
  VariantCombinationPreview,
  VariantCombinationPreviewAttribute,
  VariantCombinationPreviewResponse,
  // Faz 2C-3 (ADR-072) — ProductVariant uretim (persistence) tipleri.
  VariantGenerationResponse,
  VariantGenerationVariant,
  VariantGenerationVariantAttribute,
  // TODO-150 (ADR-073) — Identity Management Engine tipleri.
  IdentityPreviewResponse,
  IdentityApplyResponse,
  IdentityApplyRequest,
  IdentityPreviewRow,
  IdentityPreviewField,
  IdentityCollision,
  IdentityField,
  // TODO-151 (ADR-074) — Commercial Engine tipleri.
  CommercialPreviewResponse,
  CommercialPreviewRequest,
  CommercialApplyRequest,
  CommercialApplyResponse,
  CommercialPreviewRow,
  CommercialField,
  CommercialOperation,
  CommercialRule,
  CommercialDirectEdit,
  // TODO-152 (ADR-076) — Inventory Engine tipleri.
  InventoryWarehouse,
  InventoryWarehouseListResponse,
  InventoryPreviewRequest,
  InventoryPreviewResponse,
  InventoryApplyRequest,
  InventoryApplyResponse,
  InventoryPreviewRow,
  InventoryField,
  InventoryOperation,
  InventoryRule,
  InventoryDirectEdit,
  InventoryStockStatus,
  // TODO-152A — mağaza-geneli izleme matris tipleri.
  InventoryStoreMatrixRow,
  InventoryStoreMatrixResponse,
  // ADR-065 Faz 2 (Dilim 4) — Magaza marka ayarlari (logo/favicon).
  StoreSettings,
  StoreSettingsUpdateRequest,
  PublicCampaignBadge,
  PublicCampaignDisplayKind,
  PublicCouponAction,
  PublicWalletCoupon,
  PublicWalletCouponState,
  PublicWalletCouponSource,
  PublicCouponClaimRequest,
  PublicCouponClaimResponse,
  PublicCouponCenterState,
  PublicCouponCenterCoupon,
  PublicCouponCenterResponse,
  PublicProduct,
  PublicProductVariant,
  PublicProductListResponse,
  PublicProductDetail,
  // TODO-158A (ADR-086) — Home Experience public composed projeksiyon tipleri (storefront tüketicisi).
  PublicHomeResponse,
  PublicHomeSection,
  PublicHomeHeroSlide,
  PublicHomeFeaturedCategory,
  // TODO-155/156 (ADR-079) — Public Search & Facet API kontrat tipleri (storefront tuketicisi).
  PublicSearchResponse,
  PublicSearchSort,
  PublicSearchProduct,
  PublicSearchSwatch,
  PublicSearchFacet,
  PublicSearchFacetValue,
  // TODO-156E (ADR-084) — Public Autocomplete & Discovery API kontrat tipleri (storefront tuketicisi).
  PublicAutocompleteResponse,
  PublicAutocompleteProduct,
  PublicAutocompleteCategory,
  PublicAutocompleteBrand,
  PublicCampaignSlidesResponse,
  // ADR-065 Faz 3 (Site Kabuğu) — public marka bilgisi + hero slide'lari.
  PublicStoreInfo,
  PublicHeroSlide,
  PublicHeroSlidesResponse,
  // TODO-158B (ADR-087) — Enterprise Theme Engine public tema (storefront tüketicisi).
  PublicTheme,
  PublicCartItemInput,
  PublicCartRequest,
  PublicCartLineStatus,
  PublicCartLine,
  PublicCouponStatus,
  PublicCouponReason,
  PublicCartDiscountLine,
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
  CustomerCouponStatus,
  CustomerCouponSource,
  CouponAssignmentRequest,
  CustomerCouponAssignment,
  CustomerCouponAssignmentListResponse,
  // ADR-065 Faz 2 (Dilim 1) — Media kutuphanesi.
  MediaContext,
  MediaListResponse,
  MediaUploadResponse,
} from "@commerce-os/contracts";

/**
 * Faz 2B (TODO-146) — Dinamik ürün formunun ihtiyaç duyduğu attribute DEĞER tipleri.
 * dataType (renderer component seçimi), tek-değer girdi şekli ve okuma projeksiyonu.
 */
export type {
  AttributeDataType,
  ProductAttributeValueInput,
  ProductAttributeValueResponse,
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
  // TODO-136 — Gönderi oluşturma ödeme ön koşulu (gateway guard + store-admin UI aynı otorite).
  isOrderPaidForShipment,
  // TODO-159A (ADR-089) — Admin Data Grid sayfa boyutu sabitleri (UI seçici + sunucu sınırı
  // AYNI otoriteden okur; UI'da ayrı bir sabit listesi tutulmaz).
  ADMIN_LIST_PAGE_SIZE_OPTIONS,
  ADMIN_LIST_DEFAULT_PAGE_SIZE,
  ADMIN_LIST_MAX_PAGE_SIZE,
  // TODO-159B (ADR-090) — Seçici `ids` çözüm modunun üst sınırı; istemci seçili
  // kayıtları bu boyutta parçalara bölerek çözer (tek istekte sınırsız IN(...) yok).
  ADMIN_SELECTOR_MAX_IDS,
  ADMIN_SELECTOR_DEFAULT_PAGE_SIZE,
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
  ShippingWebhookInfoResponse,
  ShippingWebhookEvent,
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
  // TODO-124 — CBS il/ilce listeleri + varis eslemesi onarimi.
  ShippingCbsCity,
  ShippingCbsDistrict,
  ShippingCbsCitiesResponse,
  ShippingCbsDistrictsRequest,
  ShippingCbsDistrictsResponse,
  ShipmentRepairDestinationRequest,
  ShipmentRepairDestinationResponse,
  ShippingAddressUpdateRequest,
  ShippingAddressUpdateResponse,
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
  // F4A — Kampanya/kupon yonetimi (ADR-058).
  CampaignResponse,
  CampaignListResponse,
  CampaignDetailResponse,
  CampaignCreateRequest,
  CampaignUpdateRequest,
  CampaignStatus,
  CampaignType,
  CampaignDiscountType,
  CampaignCoupon,
  CampaignRedemptionSummary,
  // F4A.4 — Kampanya sunum alanlari (ADR-061).
  CampaignBadgeVariant,
  CampaignCardStyle,
  CampaignAccessModel,
} from "@commerce-os/contracts";
import type {
  ThemeListResponse,
  ThemeDetail,
  ThemeCreateRequest,
  ThemeUpdateRequest,
  ThemeDraftUpdateRequest,
  ThemePublishRequest,
  ThemeRollbackRequest,
  ThemeImportRequest,
  ThemeExportResponse,
  ThemePresetListResponse,
  ThemePreviewResponse,
} from "@commerce-os/contracts";
import { optionalEnvString } from "@commerce-os/utils";

/**
 * TODO-155/156 (ADR-079) — Public Search runtime allowlist şeması + sort listesi (DEĞER re-export).
 * YALNIZCA sunucu-tarafı BFF (storefront `lib/server/search.ts`) yanıtı doğrulamak için kullanır;
 * client component'leri arama tiplerini `type`-only import eder (bu değer bundle'a sızmaz). Tek kanal
 * disiplini: storefront `@commerce-os/contracts`'a doğrudan bağlanmaz.
 */
export { publicSearchResponseSchema, PUBLIC_SEARCH_SORTS } from "@commerce-os/contracts";

/**
 * TODO-156E (ADR-084) — Public Autocomplete runtime allowlist şeması (DEĞER re-export). YALNIZCA sunucu-tarafı
 * BFF (storefront `lib/server/autocomplete.ts` / `app/api/autocomplete`) yanıtı doğrulamak için kullanır.
 */
export { publicAutocompleteResponseSchema } from "@commerce-os/contracts";

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
      // TODO-159A (ADR-089) — Admin Data Grid query'si (page/pageSize/search/sort/status).
      list(
        storeId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
      ): Promise<ProductCategoryListResponse>;
      /**
       * TODO-159B (ADR-090) — Kategori seçici ucu. `query.ids` verilirse ÇÖZÜM
       * modudur (arama/sayfalama uygulanmaz; yalnız o kayıtlar döner).
       */
      selector(
        storeId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
      ): Promise<AdminCategorySelectorResponse>;
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
    // Faz 1B (ADR-067) — Attribute katalog cekirdegi. STORE-scoped uclar (store'un
    // kendi tanimlari + PLATFORM okuma). Platform tanim yonetimi ayri: platformAttributes.
    attributes: {
      list(storeId: string, token?: string): Promise<AttributeDefinitionListResponse>;
      create(
        storeId: string,
        input: AttributeDefinitionCreateRequest,
        token?: string,
      ): Promise<AttributeDefinition>;
      get(storeId: string, attributeId: string, token?: string): Promise<AttributeDefinition>;
      update(
        storeId: string,
        attributeId: string,
        input: AttributeDefinitionUpdateRequest,
        token?: string,
      ): Promise<AttributeDefinition>;
      listOptions(
        storeId: string,
        attributeId: string,
        token?: string,
      ): Promise<AttributeOptionListResponse>;
      createOption(
        storeId: string,
        attributeId: string,
        input: AttributeOptionCreateRequest,
        token?: string,
      ): Promise<AttributeOption>;
      updateOption(
        storeId: string,
        attributeId: string,
        optionId: string,
        input: AttributeOptionUpdateRequest,
        token?: string,
      ): Promise<AttributeOption>;
    };
    attributeGroups: {
      list(storeId: string, token?: string): Promise<AttributeGroupListResponse>;
      create(
        storeId: string,
        input: AttributeGroupCreateRequest,
        token?: string,
      ): Promise<AttributeGroup>;
      get(storeId: string, groupId: string, token?: string): Promise<AttributeGroup>;
      update(
        storeId: string,
        groupId: string,
        input: AttributeGroupUpdateRequest,
        token?: string,
      ): Promise<AttributeGroup>;
    };
    categoryAttributes: {
      list(
        storeId: string,
        categoryId: string,
        token?: string,
      ): Promise<CategoryAttributeListResponse>;
      create(
        storeId: string,
        categoryId: string,
        input: CategoryAttributeCreateRequest,
        token?: string,
      ): Promise<CategoryAttribute>;
      update(
        storeId: string,
        categoryId: string,
        categoryAttributeId: string,
        input: CategoryAttributeUpdateRequest,
        token?: string,
      ): Promise<CategoryAttribute>;
      remove(
        storeId: string,
        categoryId: string,
        categoryAttributeId: string,
        token?: string,
      ): Promise<void>;
    };
    // PLATFORM tanim yonetimi (yalniz SUPER_ADMIN). storeId almaz.
    platformAttributes: {
      list(token?: string): Promise<AttributeDefinitionListResponse>;
      create(
        input: AttributeDefinitionCreateRequest,
        token?: string,
      ): Promise<AttributeDefinition>;
      get(attributeId: string, token?: string): Promise<AttributeDefinition>;
      update(
        attributeId: string,
        input: AttributeDefinitionUpdateRequest,
        token?: string,
      ): Promise<AttributeDefinition>;
      listOptions(attributeId: string, token?: string): Promise<AttributeOptionListResponse>;
      createOption(
        attributeId: string,
        input: AttributeOptionCreateRequest,
        token?: string,
      ): Promise<AttributeOption>;
      updateOption(
        attributeId: string,
        optionId: string,
        input: AttributeOptionUpdateRequest,
        token?: string,
      ): Promise<AttributeOption>;
    };
    // ADR-065 Faz 2 (Dilim 4) — Magaza marka ayarlari (1-1). GET satir yoksa tum-null
    // doner (lazy); PATCH upsert (logo/favicon baglar veya null ile kaldirir).
    settings: {
      get(storeId: string, token?: string): Promise<StoreSettings>;
      update(
        storeId: string,
        input: StoreSettingsUpdateRequest,
        token?: string,
      ): Promise<StoreSettings>;
    };
    // ADR-065 Faz 2 (Dilim 5) — Ana sayfa hero slide (CRUD temeli). Siralama ve
    // yayin gecisi ayri checkpoint. remove 204 (yalniz slide; media'ya dokunmaz).
    heroSlides: {
      list(storeId: string, token?: string): Promise<HeroSlideListResponse>;
      create(storeId: string, input: HeroSlideCreateRequest, token?: string): Promise<HeroSlide>;
      get(storeId: string, id: string, token?: string): Promise<HeroSlide>;
      update(
        storeId: string,
        id: string,
        input: HeroSlideUpdateRequest,
        token?: string,
      ): Promise<HeroSlide>;
      remove(storeId: string, id: string, token?: string): Promise<void>;
      reorder(
        storeId: string,
        input: HeroSlideReorderRequest,
        token?: string,
      ): Promise<HeroSlideListResponse>;
      publish(storeId: string, id: string, token?: string): Promise<HeroSlideStatusActionResponse>;
      unpublish(storeId: string, id: string, token?: string): Promise<HeroSlideStatusActionResponse>;
    };
    // TODO-158A (ADR-086) — Home Experience Platform. Section CRUD + tip-özel alt varlıklar
    // (hero slide, featured kategori, manuel showcase ürünleri). sortOrder server-assigned;
    // reorder birebir-set eşleşmesi ister (hero deseni).
    home: {
      sections: {
        list(storeId: string, token?: string): Promise<HomeSectionListResponse>;
        create(
          storeId: string,
          input: HomeSectionCreateRequest,
          token?: string,
        ): Promise<HomeSection>;
        get(storeId: string, sectionId: string, token?: string): Promise<HomeSection>;
        update(
          storeId: string,
          sectionId: string,
          input: HomeSectionUpdateRequest,
          token?: string,
        ): Promise<HomeSection>;
        remove(storeId: string, sectionId: string, token?: string): Promise<void>;
        reorder(
          storeId: string,
          input: HomeSectionReorderRequest,
          token?: string,
        ): Promise<HomeSectionListResponse>;
      };
      heroSlides: {
        list(storeId: string, sectionId: string, token?: string): Promise<HomeHeroSlideListResponse>;
        create(
          storeId: string,
          sectionId: string,
          input: HomeHeroSlideCreateRequest,
          token?: string,
        ): Promise<HomeHeroSlide>;
        update(
          storeId: string,
          sectionId: string,
          id: string,
          input: HomeHeroSlideUpdateRequest,
          token?: string,
        ): Promise<HomeHeroSlide>;
        remove(storeId: string, sectionId: string, id: string, token?: string): Promise<void>;
        reorder(
          storeId: string,
          sectionId: string,
          input: HomeHeroSlideReorderRequest,
          token?: string,
        ): Promise<HomeHeroSlideListResponse>;
      };
      featuredCategories: {
        list(
          storeId: string,
          sectionId: string,
          token?: string,
        ): Promise<HomeFeaturedCategoryListResponse>;
        create(
          storeId: string,
          sectionId: string,
          input: HomeFeaturedCategoryCreateRequest,
          token?: string,
        ): Promise<HomeFeaturedCategory>;
        update(
          storeId: string,
          sectionId: string,
          id: string,
          input: HomeFeaturedCategoryUpdateRequest,
          token?: string,
        ): Promise<HomeFeaturedCategory>;
        remove(storeId: string, sectionId: string, id: string, token?: string): Promise<void>;
        reorder(
          storeId: string,
          sectionId: string,
          input: HomeFeaturedCategoryReorderRequest,
          token?: string,
        ): Promise<HomeFeaturedCategoryListResponse>;
      };
      showcaseProducts: {
        list(
          storeId: string,
          sectionId: string,
          token?: string,
        ): Promise<HomeShowcaseProductListResponse>;
        set(
          storeId: string,
          sectionId: string,
          input: HomeShowcaseProductSetRequest,
          token?: string,
        ): Promise<HomeShowcaseProductListResponse>;
      };
    };
    // TODO-158B (ADR-087) — Enterprise Theme Engine (store Design Token editörü).
    theme: {
      list(storeId: string, token?: string): Promise<ThemeListResponse>;
      create(storeId: string, input: ThemeCreateRequest, token?: string): Promise<ThemeDetail>;
      get(storeId: string, themeId: string, token?: string): Promise<ThemeDetail>;
      update(
        storeId: string,
        themeId: string,
        input: ThemeUpdateRequest,
        token?: string,
      ): Promise<ThemeDetail>;
      remove(storeId: string, themeId: string, token?: string): Promise<void>;
      saveDraft(
        storeId: string,
        themeId: string,
        input: ThemeDraftUpdateRequest,
        token?: string,
      ): Promise<ThemeDetail>;
      publish(
        storeId: string,
        themeId: string,
        input: ThemePublishRequest,
        token?: string,
      ): Promise<ThemeDetail>;
      rollback(
        storeId: string,
        themeId: string,
        input: ThemeRollbackRequest,
        token?: string,
      ): Promise<ThemeDetail>;
      preview(storeId: string, themeId: string, token?: string): Promise<ThemePreviewResponse>;
      export(storeId: string, themeId: string, token?: string): Promise<ThemeExportResponse>;
      import(storeId: string, input: ThemeImportRequest, token?: string): Promise<ThemeDetail>;
      presets(storeId: string, token?: string): Promise<ThemePresetListResponse>;
    };
    // ADR-065 Faz 2 (Dilim 1) — Media kutuphanesi (upload/list/delete). Upload
    // multipart FormData ile; list opsiyonel context filtresiyle; delete 204/409.
    media: {
      /**
       * TODO-159B (ADR-090) — TD-095 kapanışı: medya listesi artık ortak Data Grid
       * query'sini konuşur (`page`/`pageSize`/`search`/`context`/`sortBy`/`sortOrder`/
       * `ids`). Eski `context` argümanı yerine query haritası geçilir.
       */
      list(
        storeId: string,
        query?: Record<string, string | number | undefined>,
        token?: string,
      ): Promise<MediaListResponse>;
      upload(storeId: string, form: FormData, token?: string): Promise<MediaUploadResponse>;
      remove(storeId: string, mediaId: string, token?: string): Promise<void>;
    };
    products: {
      // TODO-159A (ADR-089) — Admin Data Grid: sayfalama/arama/filtre/sıralama query'si
      // sunucuya TAŞINIR. `query` anahtar-değer haritasıdır; boş/undefined değerler atlanır.
      // Doğrulama + allowlist gateway'dedir (istemci sözleşmesi ince kalır).
      list(
        storeId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
      ): Promise<ProductListResponse>;
      /**
       * TODO-159B (ADR-090) — Ürün seçici ucu (hafif projeksiyon). `query.ids`
       * verilirse ÇÖZÜM modudur: arama/sayfalama uygulanmaz, yalnız o kayıtlar
       * döner — seçili ürün kaçıncı sayfada olursa olsun gösterilebilir.
       */
      selector(
        storeId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
      ): Promise<AdminProductSelectorResponse>;
      filterOptions(
        storeId: string,
        token?: string,
      ): Promise<AdminProductFilterOptionsResponse>;
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
        // F4B — Varyant fiyat/liste/maliyet degisikligi gecmisi (yonetim).
        priceChanges(
          storeId: string,
          productId: string,
          variantId: string,
          token?: string,
        ): Promise<ProductPriceChangeListResponse>;
        // Faz 2A (ADR-068) — variantDefining attribute degerleri (internal; UI henuz yok).
        attributeValues: {
          get(
            storeId: string,
            productId: string,
            variantId: string,
            token?: string,
          ): Promise<VariantAttributeValueListResponse>;
          replace(
            storeId: string,
            productId: string,
            variantId: string,
            input: VariantAttributeValuesReplaceRequest,
            token?: string,
          ): Promise<VariantAttributeValueListResponse>;
        };
      };
      // Faz 2A (ADR-068) — urun-seviyesi attribute degerleri (internal; UI henuz yok).
      attributeValues: {
        get(
          storeId: string,
          productId: string,
          token?: string,
        ): Promise<ProductAttributeValueListResponse>;
        replace(
          storeId: string,
          productId: string,
          input: ProductAttributeValuesReplaceRequest,
          token?: string,
        ): Promise<ProductAttributeValueListResponse>;
      };
      // Faz 2C-1 (ADR-070) — urun-seviyesi varyant EKSEN secimi (internal). KOMBINASYON URETMEZ.
      variantSelections: {
        get(
          storeId: string,
          productId: string,
          token?: string,
        ): Promise<ProductVariantSelectionListResponse>;
        replace(
          storeId: string,
          productId: string,
          input: ProductVariantSelectionsReplaceRequest,
          token?: string,
        ): Promise<ProductVariantSelectionListResponse>;
      };
      // Faz 2C-2 (ADR-071) — Combination Engine ONIZLEME (yalniz okuma). ProductVariant/SKU URETMEZ.
      variantCombinations: {
        preview(
          storeId: string,
          productId: string,
          token?: string,
        ): Promise<VariantCombinationPreviewResponse>;
        // Faz 2C-3 (ADR-072) — ProductVariant URETIM (persistence). Govdesiz; kaynak DB recetesidir.
        generate(
          storeId: string,
          productId: string,
          token?: string,
        ): Promise<VariantGenerationResponse>;
      };
      // TODO-150 (ADR-073) — Identity Management Engine (SKU/Barcode/Title pattern motoru).
      identity: {
        preview(
          storeId: string,
          productId: string,
          query: IdentityApplyRequest,
          token?: string,
        ): Promise<IdentityPreviewResponse>;
        apply(
          storeId: string,
          productId: string,
          input: IdentityApplyRequest,
          token?: string,
        ): Promise<IdentityApplyResponse>;
      };
      // TODO-151 (ADR-074) — Commercial Engine (Price/Compare-at/Cost/VAT preview-first bulk).
      commercial: {
        get(storeId: string, productId: string, token?: string): Promise<CommercialPreviewResponse>;
        preview(
          storeId: string,
          productId: string,
          input: CommercialPreviewRequest,
          token?: string,
        ): Promise<CommercialPreviewResponse>;
        apply(
          storeId: string,
          productId: string,
          input: CommercialApplyRequest,
          token?: string,
        ): Promise<CommercialApplyResponse>;
      };
      // TODO-152 (ADR-076) — Inventory Engine (warehouse-aware stok preview-first bulk).
      inventory: {
        get(
          storeId: string,
          productId: string,
          warehouseId?: string,
          token?: string,
        ): Promise<InventoryPreviewResponse>;
        preview(
          storeId: string,
          productId: string,
          input: InventoryPreviewRequest,
          token?: string,
        ): Promise<InventoryPreviewResponse>;
        apply(
          storeId: string,
          productId: string,
          input: InventoryApplyRequest,
          token?: string,
        ): Promise<InventoryApplyResponse>;
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
      // TODO-152 (ADR-076) — store-scoped depo listesi (warehouse selector).
      warehouses(storeId: string, token?: string): Promise<InventoryWarehouseListResponse>;
      // TODO-152A — mağaza-geneli SALT-OKUMA stok matris (izleme merkezi; tüm ürünler, seçili depo).
      storeMatrix(
        storeId: string,
        warehouseId?: string,
        token?: string,
      ): Promise<InventoryStoreMatrixResponse>;
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
      // TODO-159A (ADR-089) — Admin Data Grid query'si (page/pageSize/search/sort/status).
      list(
        storeId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
      ): Promise<StoreAdminCustomerListResponse>;
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
      /** TODO-128 — webhook URL/durum + son olaylar (GUVENLI DTO; secret/raw/imza donmez). */
      webhookInfo(
        storeId: string,
        configId: string,
        token?: string,
        limit?: number,
      ): Promise<ShippingWebhookInfoResponse>;
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
      // TODO-139 — sipariş teslimat adresi snapshot düzenleme (müşteri adres defterini DEĞİL).
      updateAddress(
        storeId: string,
        orderId: string,
        input: ShippingAddressUpdateRequest,
        token?: string,
      ): Promise<ShippingAddressUpdateResponse>;
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
      // TODO-124 — varis il/ilce eslemesi onarimi (CBS-dogrulamali kod secimi).
      repairDestination(
        storeId: string,
        shipmentId: string,
        input: ShipmentRepairDestinationRequest,
        token?: string,
      ): Promise<ShipmentRepairDestinationResponse>;
    };
    // TODO-124 — CBS il/ilce listeleri (store-admin dropdown'lari; TTL cache'li uc).
    cbs: {
      cities(storeId: string, providerConfigId: string, token?: string): Promise<ShippingCbsCitiesResponse>;
      districts(
        storeId: string,
        input: ShippingCbsDistrictsRequest,
        token?: string,
      ): Promise<ShippingCbsDistrictsResponse>;
    };
    // F4A — Kampanya/kupon yonetimi (ADR-058). Store-scoped; secret icermez.
    campaigns: {
      list(storeId: string, token?: string): Promise<CampaignListResponse>;
      create(storeId: string, input: CampaignCreateRequest, token?: string): Promise<CampaignResponse>;
      get(storeId: string, campaignId: string, token?: string): Promise<CampaignDetailResponse>;
      update(
        storeId: string,
        campaignId: string,
        input: CampaignUpdateRequest,
        token?: string,
      ): Promise<CampaignResponse>;
      activate(storeId: string, campaignId: string, token?: string): Promise<CampaignResponse>;
      pause(storeId: string, campaignId: string, token?: string): Promise<CampaignResponse>;
      archive(storeId: string, campaignId: string, token?: string): Promise<CampaignResponse>;
      // F4A.3 — Kupon atama / musteri cuzdani (ADR-060).
      listAssignments(
        storeId: string,
        campaignId: string,
        token?: string,
      ): Promise<CustomerCouponAssignmentListResponse>;
      assign(
        storeId: string,
        campaignId: string,
        input: CouponAssignmentRequest,
        token?: string,
      ): Promise<CustomerCouponAssignment>;
    };
    // F4A.3 — Musteri kupon cuzdani (musteri detayindan) (ADR-060).
    customerCoupons: {
      list(
        storeId: string,
        customerId: string,
        token?: string,
      ): Promise<CustomerCouponAssignmentListResponse>;
      assign(
        storeId: string,
        customerId: string,
        couponId: string,
        token?: string,
      ): Promise<CustomerCouponAssignment>;
    };
  };
}

/**
 * Resolve the gateway base URL from an explicit value, then the
 * API_GATEWAY_URL environment variable, then a localhost default.
 * Trailing slashes are trimmed for safe path concatenation.
 *
 * TD-038: `API_GATEWAY_URL` opsiyoneldir. Bos/whitespace deger (`API_GATEWAY_URL=`)
 * "yok" kabul edilir ve varsayilana duser; boylece env_file'da bos birakilan bir
 * anahtar, default gateway URL'ini ARTIK bypass etmez (aksi halde `""` ile fetch
 * bozuk goreli URL'e giderdi). Tum web app'ler (storefront/store-admin/admin)
 * gateway URL'ini bu tek noktadan cozer.
 */
export function resolveApiGatewayUrl(explicit?: string): string {
  const fromEnv =
    typeof process !== "undefined" ? optionalEnvString(process.env.API_GATEWAY_URL) : undefined;
  return (optionalEnvString(explicit) ?? fromEnv ?? DEFAULT_API_GATEWAY_URL).replace(/\/+$/, "");
}

/**
 * TODO-073 — Sipariş listesi filtre sorgu dizesi. Yalnız tanımlı/boş-olmayan
 * filtreler eklenir; `undefined` ve boş string atlanır. Deterministik sıra
 * (anahtar bazlı) testleri sade tutar. Çıktı baştaki `?` ile gelir veya boştur.
 */
// TODO-150 (ADR-073) — Identity preview GET query-string'i (pattern'lar + seqStart + regenerate).
function identityPreviewQuery(query: IdentityApplyRequest): string {
  const params = new URLSearchParams();
  if (query.sku !== undefined) params.set("sku", query.sku);
  if (query.barcode !== undefined) params.set("barcode", query.barcode);
  if (query.title !== undefined) params.set("title", query.title);
  if (query.seqStart !== undefined) params.set("seqStart", String(query.seqStart));
  if (query.regenerateCustomTitles !== undefined) {
    params.set("regenerateCustomTitles", query.regenerateCustomTitles ? "true" : "false");
  }
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

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
  // TODO-159A (ADR-089) — Data Grid sayfalama + sıralama alanları.
  append("sortBy", query.sortBy);
  append("sortOrder", query.sortOrder);
  if (query.page !== undefined && query.page > 1) append("page", query.page);
  if (query.pageSize !== undefined) append("pageSize", query.pageSize);
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
    // FormData govdesinde content-type'i EL ILE koymayiz: fetch (undici) multipart
    // boundary'yi kendisi ekler. Aksi halde boundary'siz "multipart/form-data" ile
    // sunucu govdeyi parse edemez. Yalniz JSON govdeler icin content-type basariz.
    if (!headers.has("content-type") && init.body && !(init.body instanceof FormData)) {
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
    // 204 No Content (or empty body): parse etmeye calisma; T=void kullananlar icin.
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  function getJson<T>(path: string, token?: string): Promise<T> {
    return requestJson<T>(path, {}, token);
  }

  /**
   * TODO-159A (ADR-089) — Admin liste query'sini deterministik bir query string'e
   * çevirir. undefined/boş değerler ATLANIR (varsayılanı gereksiz yere URL'e
   * yazmamak için); anahtar sırası verilen sıradır.
   */
  function buildQueryString(query?: Record<string, string | number | undefined>): string {
    if (!query) return "";
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === "") continue;
      params.set(key, String(value));
    }
    const serialized = params.toString();
    return serialized ? `?${serialized}` : "";
  }

  function sendJson<T>(path: string, method: string, body?: unknown, token?: string): Promise<T> {
    return requestJson<T>(
      path,
      { method, body: body === undefined ? undefined : JSON.stringify(body) },
      token,
    );
  }

  // Multipart (FormData) gonderimi: JSON.stringify YAPMAZ; content-type'i requestJson
  // FormData branch'i sayesinde fetch/undici boundary ile kendisi koyar (ADR-065 media).
  function sendForm<T>(path: string, form: FormData, token?: string): Promise<T> {
    return requestJson<T>(path, { method: "POST", body: form }, token);
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
        list: (storeId, token, query) =>
          getJson<ProductCategoryListResponse>(
            `/stores/${storeId}/categories${buildQueryString(query)}`,
            token,
          ),
        selector: (storeId, token, query) =>
          getJson<AdminCategorySelectorResponse>(
            `/stores/${storeId}/categories/selector${buildQueryString(query)}`,
            token,
          ),
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
      // Faz 1B (ADR-067) — Attribute katalog cekirdegi (store-scoped).
      attributes: {
        list: (storeId, token) =>
          getJson<AttributeDefinitionListResponse>(`/stores/${storeId}/attributes`, token),
        create: (storeId, input, token) =>
          sendJson<AttributeDefinition>(`/stores/${storeId}/attributes`, "POST", input, token),
        get: (storeId, attributeId, token) =>
          getJson<AttributeDefinition>(`/stores/${storeId}/attributes/${attributeId}`, token),
        update: (storeId, attributeId, input, token) =>
          sendJson<AttributeDefinition>(
            `/stores/${storeId}/attributes/${attributeId}`,
            "PATCH",
            input,
            token,
          ),
        listOptions: (storeId, attributeId, token) =>
          getJson<AttributeOptionListResponse>(
            `/stores/${storeId}/attributes/${attributeId}/options`,
            token,
          ),
        createOption: (storeId, attributeId, input, token) =>
          sendJson<AttributeOption>(
            `/stores/${storeId}/attributes/${attributeId}/options`,
            "POST",
            input,
            token,
          ),
        updateOption: (storeId, attributeId, optionId, input, token) =>
          sendJson<AttributeOption>(
            `/stores/${storeId}/attributes/${attributeId}/options/${optionId}`,
            "PATCH",
            input,
            token,
          ),
      },
      attributeGroups: {
        list: (storeId, token) =>
          getJson<AttributeGroupListResponse>(`/stores/${storeId}/attribute-groups`, token),
        create: (storeId, input, token) =>
          sendJson<AttributeGroup>(`/stores/${storeId}/attribute-groups`, "POST", input, token),
        get: (storeId, groupId, token) =>
          getJson<AttributeGroup>(`/stores/${storeId}/attribute-groups/${groupId}`, token),
        update: (storeId, groupId, input, token) =>
          sendJson<AttributeGroup>(
            `/stores/${storeId}/attribute-groups/${groupId}`,
            "PATCH",
            input,
            token,
          ),
      },
      categoryAttributes: {
        list: (storeId, categoryId, token) =>
          getJson<CategoryAttributeListResponse>(
            `/stores/${storeId}/categories/${categoryId}/attributes`,
            token,
          ),
        create: (storeId, categoryId, input, token) =>
          sendJson<CategoryAttribute>(
            `/stores/${storeId}/categories/${categoryId}/attributes`,
            "POST",
            input,
            token,
          ),
        update: (storeId, categoryId, categoryAttributeId, input, token) =>
          sendJson<CategoryAttribute>(
            `/stores/${storeId}/categories/${categoryId}/attributes/${categoryAttributeId}`,
            "PATCH",
            input,
            token,
          ),
        remove: (storeId, categoryId, categoryAttributeId, token) =>
          sendJson<void>(
            `/stores/${storeId}/categories/${categoryId}/attributes/${categoryAttributeId}`,
            "DELETE",
            undefined,
            token,
          ),
      },
      // Faz 1B (ADR-067) — PLATFORM tanim yonetimi (yalniz SUPER_ADMIN).
      platformAttributes: {
        list: (token) => getJson<AttributeDefinitionListResponse>(`/admin/attributes`, token),
        create: (input, token) =>
          sendJson<AttributeDefinition>(`/admin/attributes`, "POST", input, token),
        get: (attributeId, token) =>
          getJson<AttributeDefinition>(`/admin/attributes/${attributeId}`, token),
        update: (attributeId, input, token) =>
          sendJson<AttributeDefinition>(`/admin/attributes/${attributeId}`, "PATCH", input, token),
        listOptions: (attributeId, token) =>
          getJson<AttributeOptionListResponse>(`/admin/attributes/${attributeId}/options`, token),
        createOption: (attributeId, input, token) =>
          sendJson<AttributeOption>(`/admin/attributes/${attributeId}/options`, "POST", input, token),
        updateOption: (attributeId, optionId, input, token) =>
          sendJson<AttributeOption>(
            `/admin/attributes/${attributeId}/options/${optionId}`,
            "PATCH",
            input,
            token,
          ),
      },
      // ADR-065 Faz 2 (Dilim 4) — Magaza marka ayarlari. get lazy (tum-null); update
      // upsert (PATCH; null=kaldir).
      settings: {
        get: (storeId, token) => getJson<StoreSettings>(`/stores/${storeId}/settings`, token),
        update: (storeId, input, token) =>
          sendJson<StoreSettings>(`/stores/${storeId}/settings`, "PATCH", input, token),
      },
      // ADR-065 Faz 2 (Dilim 5) — Ana sayfa hero slide (CRUD temeli). remove DELETE
      // 204 (yalniz slide kaydi; media'ya dokunmaz).
      heroSlides: {
        list: (storeId, token) =>
          getJson<HeroSlideListResponse>(`/stores/${storeId}/hero-slides`, token),
        create: (storeId, input, token) =>
          sendJson<HeroSlide>(`/stores/${storeId}/hero-slides`, "POST", input, token),
        get: (storeId, id, token) =>
          getJson<HeroSlide>(`/stores/${storeId}/hero-slides/${id}`, token),
        update: (storeId, id, input, token) =>
          sendJson<HeroSlide>(`/stores/${storeId}/hero-slides/${id}`, "PATCH", input, token),
        remove: (storeId, id, token) =>
          requestJson<void>(`/stores/${storeId}/hero-slides/${id}`, { method: "DELETE" }, token),
        reorder: (storeId, input, token) =>
          sendJson<HeroSlideListResponse>(`/stores/${storeId}/hero-slides/reorder`, "POST", input, token),
        publish: (storeId, id, token) =>
          sendJson<HeroSlideStatusActionResponse>(
            `/stores/${storeId}/hero-slides/${id}/publish`,
            "POST",
            undefined,
            token,
          ),
        unpublish: (storeId, id, token) =>
          sendJson<HeroSlideStatusActionResponse>(
            `/stores/${storeId}/hero-slides/${id}/unpublish`,
            "POST",
            undefined,
            token,
          ),
      },
      // TODO-158A (ADR-086) — Home Experience Platform. Section CRUD + tip-özel alt varlıklar.
      home: {
        sections: {
          list: (storeId, token) =>
            getJson<HomeSectionListResponse>(`/stores/${storeId}/home/sections`, token),
          create: (storeId, input, token) =>
            sendJson<HomeSection>(`/stores/${storeId}/home/sections`, "POST", input, token),
          get: (storeId, sectionId, token) =>
            getJson<HomeSection>(`/stores/${storeId}/home/sections/${sectionId}`, token),
          update: (storeId, sectionId, input, token) =>
            sendJson<HomeSection>(
              `/stores/${storeId}/home/sections/${sectionId}`,
              "PATCH",
              input,
              token,
            ),
          remove: (storeId, sectionId, token) =>
            requestJson<void>(
              `/stores/${storeId}/home/sections/${sectionId}`,
              { method: "DELETE" },
              token,
            ),
          reorder: (storeId, input, token) =>
            sendJson<HomeSectionListResponse>(
              `/stores/${storeId}/home/sections/reorder`,
              "POST",
              input,
              token,
            ),
        },
        heroSlides: {
          list: (storeId, sectionId, token) =>
            getJson<HomeHeroSlideListResponse>(
              `/stores/${storeId}/home/sections/${sectionId}/hero-slides`,
              token,
            ),
          create: (storeId, sectionId, input, token) =>
            sendJson<HomeHeroSlide>(
              `/stores/${storeId}/home/sections/${sectionId}/hero-slides`,
              "POST",
              input,
              token,
            ),
          update: (storeId, sectionId, id, input, token) =>
            sendJson<HomeHeroSlide>(
              `/stores/${storeId}/home/sections/${sectionId}/hero-slides/${id}`,
              "PATCH",
              input,
              token,
            ),
          remove: (storeId, sectionId, id, token) =>
            requestJson<void>(
              `/stores/${storeId}/home/sections/${sectionId}/hero-slides/${id}`,
              { method: "DELETE" },
              token,
            ),
          reorder: (storeId, sectionId, input, token) =>
            sendJson<HomeHeroSlideListResponse>(
              `/stores/${storeId}/home/sections/${sectionId}/hero-slides/reorder`,
              "POST",
              input,
              token,
            ),
        },
        featuredCategories: {
          list: (storeId, sectionId, token) =>
            getJson<HomeFeaturedCategoryListResponse>(
              `/stores/${storeId}/home/sections/${sectionId}/featured-categories`,
              token,
            ),
          create: (storeId, sectionId, input, token) =>
            sendJson<HomeFeaturedCategory>(
              `/stores/${storeId}/home/sections/${sectionId}/featured-categories`,
              "POST",
              input,
              token,
            ),
          update: (storeId, sectionId, id, input, token) =>
            sendJson<HomeFeaturedCategory>(
              `/stores/${storeId}/home/sections/${sectionId}/featured-categories/${id}`,
              "PATCH",
              input,
              token,
            ),
          remove: (storeId, sectionId, id, token) =>
            requestJson<void>(
              `/stores/${storeId}/home/sections/${sectionId}/featured-categories/${id}`,
              { method: "DELETE" },
              token,
            ),
          reorder: (storeId, sectionId, input, token) =>
            sendJson<HomeFeaturedCategoryListResponse>(
              `/stores/${storeId}/home/sections/${sectionId}/featured-categories/reorder`,
              "POST",
              input,
              token,
            ),
        },
        showcaseProducts: {
          list: (storeId, sectionId, token) =>
            getJson<HomeShowcaseProductListResponse>(
              `/stores/${storeId}/home/sections/${sectionId}/showcase-products`,
              token,
            ),
          set: (storeId, sectionId, input, token) =>
            sendJson<HomeShowcaseProductListResponse>(
              `/stores/${storeId}/home/sections/${sectionId}/showcase-products`,
              "PUT",
              input,
              token,
            ),
        },
      },
      // TODO-158B (ADR-087) — Enterprise Theme Engine. Design Token CRUD + versiyon
      // + publish/rollback + import/export + canlı önizleme + preset katalog.
      theme: {
        list: (storeId, token) => getJson<ThemeListResponse>(`/stores/${storeId}/themes`, token),
        create: (storeId, input, token) =>
          sendJson<ThemeDetail>(`/stores/${storeId}/themes`, "POST", input, token),
        get: (storeId, themeId, token) =>
          getJson<ThemeDetail>(`/stores/${storeId}/themes/${themeId}`, token),
        update: (storeId, themeId, input, token) =>
          sendJson<ThemeDetail>(`/stores/${storeId}/themes/${themeId}`, "PATCH", input, token),
        remove: (storeId, themeId, token) =>
          requestJson<void>(`/stores/${storeId}/themes/${themeId}`, { method: "DELETE" }, token),
        saveDraft: (storeId, themeId, input, token) =>
          sendJson<ThemeDetail>(`/stores/${storeId}/themes/${themeId}/draft`, "PUT", input, token),
        publish: (storeId, themeId, input, token) =>
          sendJson<ThemeDetail>(
            `/stores/${storeId}/themes/${themeId}/publish`,
            "POST",
            input,
            token,
          ),
        rollback: (storeId, themeId, input, token) =>
          sendJson<ThemeDetail>(
            `/stores/${storeId}/themes/${themeId}/rollback`,
            "POST",
            input,
            token,
          ),
        preview: (storeId, themeId, token) =>
          getJson<ThemePreviewResponse>(`/stores/${storeId}/themes/${themeId}/preview`, token),
        export: (storeId, themeId, token) =>
          getJson<ThemeExportResponse>(`/stores/${storeId}/themes/${themeId}/export`, token),
        import: (storeId, input, token) =>
          sendJson<ThemeDetail>(`/stores/${storeId}/themes/import`, "POST", input, token),
        presets: (storeId, token) =>
          getJson<ThemePresetListResponse>(`/stores/${storeId}/theme/presets`, token),
      },
      // ADR-065 Faz 2 (Dilim 1) — Media kutuphanesi. upload multipart FormData ile
      // (sendForm — JSON.stringify YOK); remove 204 (kullanimdaysa 409 MEDIA_IN_USE).
      media: {
        list: (storeId, query, token) =>
          getJson<MediaListResponse>(`/stores/${storeId}/media${buildQueryString(query)}`, token),
        upload: (storeId, form, token) =>
          sendForm<MediaUploadResponse>(`/stores/${storeId}/media`, form, token),
        remove: (storeId, mediaId, token) =>
          requestJson<void>(`/stores/${storeId}/media/${mediaId}`, { method: "DELETE" }, token),
      },
      products: {
        list: (storeId, token, query) =>
          getJson<ProductListResponse>(
            `/stores/${storeId}/products${buildQueryString(query)}`,
            token,
          ),
        selector: (storeId, token, query) =>
          getJson<AdminProductSelectorResponse>(
            `/stores/${storeId}/products/selector${buildQueryString(query)}`,
            token,
          ),
        filterOptions: (storeId, token) =>
          getJson<AdminProductFilterOptionsResponse>(
            `/stores/${storeId}/products/filter-options`,
            token,
          ),
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
          priceChanges: (storeId, productId, variantId, token) =>
            getJson<ProductPriceChangeListResponse>(
              `/stores/${storeId}/products/${productId}/variants/${variantId}/price-changes`,
              token,
            ),
          attributeValues: {
            get: (storeId, productId, variantId, token) =>
              getJson<VariantAttributeValueListResponse>(
                `/stores/${storeId}/products/${productId}/variants/${variantId}/attribute-values`,
                token,
              ),
            replace: (storeId, productId, variantId, input, token) =>
              sendJson<VariantAttributeValueListResponse>(
                `/stores/${storeId}/products/${productId}/variants/${variantId}/attribute-values`,
                "PUT",
                input,
                token,
              ),
          },
        },
        attributeValues: {
          get: (storeId, productId, token) =>
            getJson<ProductAttributeValueListResponse>(
              `/stores/${storeId}/products/${productId}/attribute-values`,
              token,
            ),
          replace: (storeId, productId, input, token) =>
            sendJson<ProductAttributeValueListResponse>(
              `/stores/${storeId}/products/${productId}/attribute-values`,
              "PUT",
              input,
              token,
            ),
        },
        variantSelections: {
          get: (storeId, productId, token) =>
            getJson<ProductVariantSelectionListResponse>(
              `/stores/${storeId}/products/${productId}/variant-selections`,
              token,
            ),
          replace: (storeId, productId, input, token) =>
            sendJson<ProductVariantSelectionListResponse>(
              `/stores/${storeId}/products/${productId}/variant-selections`,
              "PUT",
              input,
              token,
            ),
        },
        variantCombinations: {
          preview: (storeId, productId, token) =>
            getJson<VariantCombinationPreviewResponse>(
              `/stores/${storeId}/products/${productId}/variant-combinations/preview`,
              token,
            ),
          generate: (storeId, productId, token) =>
            sendJson<VariantGenerationResponse>(
              `/stores/${storeId}/products/${productId}/variant-combinations/generate`,
              "POST",
              {},
              token,
            ),
        },
        // TODO-150 (ADR-073) — Identity Management Engine (SKU/Barcode/Title pattern motoru).
        identity: {
          preview: (storeId, productId, query, token) =>
            getJson<IdentityPreviewResponse>(
              `/stores/${storeId}/products/${productId}/identity/preview${identityPreviewQuery(query)}`,
              token,
            ),
          apply: (storeId, productId, input, token) =>
            sendJson<IdentityApplyResponse>(
              `/stores/${storeId}/products/${productId}/identity/apply`,
              "POST",
              input,
              token,
            ),
        },
        // TODO-151 (ADR-074) — Commercial Engine (Price/Compare-at/Cost/VAT preview-first bulk).
        commercial: {
          get: (storeId, productId, token) =>
            getJson<CommercialPreviewResponse>(
              `/stores/${storeId}/products/${productId}/commercial`,
              token,
            ),
          preview: (storeId, productId, input, token) =>
            sendJson<CommercialPreviewResponse>(
              `/stores/${storeId}/products/${productId}/commercial/preview`,
              "POST",
              input,
              token,
            ),
          apply: (storeId, productId, input, token) =>
            sendJson<CommercialApplyResponse>(
              `/stores/${storeId}/products/${productId}/commercial/apply`,
              "POST",
              input,
              token,
            ),
        },
        // TODO-152 (ADR-076) — Inventory Engine (warehouse-aware stok preview-first bulk).
        inventory: {
          get: (storeId, productId, warehouseId, token) =>
            getJson<InventoryPreviewResponse>(
              `/stores/${storeId}/products/${productId}/inventory${
                warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : ""
              }`,
              token,
            ),
          preview: (storeId, productId, input, token) =>
            sendJson<InventoryPreviewResponse>(
              `/stores/${storeId}/products/${productId}/inventory/preview`,
              "POST",
              input,
              token,
            ),
          apply: (storeId, productId, input, token) =>
            sendJson<InventoryApplyResponse>(
              `/stores/${storeId}/products/${productId}/inventory/apply`,
              "POST",
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
        warehouses: (storeId, token) =>
          getJson<InventoryWarehouseListResponse>(`/stores/${storeId}/warehouses`, token),
        storeMatrix: (storeId, warehouseId, token) =>
          getJson<InventoryStoreMatrixResponse>(
            `/stores/${storeId}/inventory/matrix${
              warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : ""
            }`,
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
        list: (storeId, token, query) =>
          getJson<StoreAdminCustomerListResponse>(
            `/stores/${storeId}/customers${buildQueryString(query)}`,
            token,
          ),
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
        webhookInfo: (storeId, configId, token, limit) =>
          getJson<ShippingWebhookInfoResponse>(
            `/stores/${storeId}/shipping/providers/${configId}/webhook${
              typeof limit === "number" ? `?limit=${encodeURIComponent(String(limit))}` : ""
            }`,
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
        updateAddress: (storeId, orderId, input, token) =>
          sendJson<ShippingAddressUpdateResponse>(
            `/stores/${storeId}/orders/${orderId}/shipping/address`,
            "PATCH",
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
        // TODO-124 — varis il/ilce eslemesi onarimi.
        repairDestination: (storeId, shipmentId, input, token) =>
          sendJson<ShipmentRepairDestinationResponse>(
            `/stores/${storeId}/shipping/shipments/${shipmentId}/repair-destination`,
            "POST",
            input,
            token,
          ),
      },
      cbs: {
        cities: (storeId, providerConfigId, token) =>
          sendJson<ShippingCbsCitiesResponse>(
            `/stores/${storeId}/shipping/dhl/cbs/preview`,
            "POST",
            { providerConfigId },
            token,
          ),
        districts: (storeId, input, token) =>
          sendJson<ShippingCbsDistrictsResponse>(
            `/stores/${storeId}/shipping/dhl/cbs/districts`,
            "POST",
            input,
            token,
          ),
      },
      // F4A — Kampanya/kupon yonetimi (ADR-058).
      campaigns: {
        list: (storeId, token) => getJson<CampaignListResponse>(`/stores/${storeId}/campaigns`, token),
        create: (storeId, input, token) =>
          sendJson<CampaignResponse>(`/stores/${storeId}/campaigns`, "POST", input, token),
        get: (storeId, campaignId, token) =>
          getJson<CampaignDetailResponse>(`/stores/${storeId}/campaigns/${campaignId}`, token),
        update: (storeId, campaignId, input, token) =>
          sendJson<CampaignResponse>(`/stores/${storeId}/campaigns/${campaignId}`, "PATCH", input, token),
        activate: (storeId, campaignId, token) =>
          sendJson<CampaignResponse>(`/stores/${storeId}/campaigns/${campaignId}/activate`, "POST", undefined, token),
        pause: (storeId, campaignId, token) =>
          sendJson<CampaignResponse>(`/stores/${storeId}/campaigns/${campaignId}/pause`, "POST", undefined, token),
        archive: (storeId, campaignId, token) =>
          sendJson<CampaignResponse>(`/stores/${storeId}/campaigns/${campaignId}/archive`, "POST", undefined, token),
        listAssignments: (storeId, campaignId, token) =>
          getJson<CustomerCouponAssignmentListResponse>(
            `/stores/${storeId}/campaigns/${campaignId}/assignments`,
            token,
          ),
        assign: (storeId, campaignId, input, token) =>
          sendJson<CustomerCouponAssignment>(
            `/stores/${storeId}/campaigns/${campaignId}/assignments`,
            "POST",
            input,
            token,
          ),
      },
      customerCoupons: {
        list: (storeId, customerId, token) =>
          getJson<CustomerCouponAssignmentListResponse>(
            `/stores/${storeId}/customers/${customerId}/coupons`,
            token,
          ),
        assign: (storeId, customerId, couponId, token) =>
          sendJson<CustomerCouponAssignment>(
            `/stores/${storeId}/customers/${customerId}/coupons`,
            "POST",
            { couponId },
            token,
          ),
      },
    },
  };
}
