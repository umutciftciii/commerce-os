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
  // TODO-169 (ADR-269) — Store Admin iade yönetimi kontrat tipleri.
  AdminReturnListQuery,
  // TODO-174A — birleşik iade/refund görünürlüğü (iade talepleri + sipariş iptali geri ödemeleri).
  AdminRefundVisibilityListResponse,
  AdminReturnDetailResponse,
  AdminReturnApproveRequest,
  AdminReturnRejectRequest,
  AdminReturnInspectRequest,
  AdminReturnFastRefundRequest,
  AdminReturnDispositionCreateRequest,
  AdminReturnDispositionCancelRequest,
  AdminReverseShipmentCreateRequest,
  AdminReverseShipmentStatusRequest,
  AdminReverseShipmentTrackingRequest,
  AdminReturnFastRefundContextResponse,
  AdminReturnTransitionRequest,
  AdminOrderReturnsResponse,
  AdminRefundContextResponse,
  AdminRefundResponse,
  AdminInitiateRefundRequest,
  AdminManualCompleteRefundRequest,
  AdminRefundVersionActionRequest,
  AdminCancelRefundRequest,
  PendingWorkSummary,
  // TODO-174B — Store Credit + Order Experience Recovery.
  ExperienceListResponse,
  ExperienceKpiDto,
  AssignableUser,
  RecoveryCaseDetailDto,
  RecoveryActionRequest,
  ManualOpenCaseRequest,
  // TD-174B-1/2 — Order-detail experience summary + recovery/credit reporting.
  OrderExperienceSummaryDto,
  RecoveryReportDto,
  CreditReportDto,
  AdminIssueCreditRequest,
  AdminAdjustCreditRequest,
  CustomerCreditBalanceResponse,
  ShoppingBalanceListResponse,
  ShoppingBalanceDetailDto,
  PaymentProviderConfig,
  PaymentProviderConfigCreateRequest,
  PaymentProviderConfigListResponse,
  PaymentProviderConfigUpdateRequest,
  PaymentProviderEventListResponse,
  PaymentProviderReorderRequest,
  PaymentProviderStatusUpdateRequest,
  PaymentProviderTestConnectionResponse,
  OrderPaymentStateResponse,
  PaymentLinkResponse,
  SendPaymentLinkEmailResponse,
  PaymentRecoveryAttempt,
  CreatePaymentLinkRequest,
  SendPaymentLinkEmailRequest,
  RecordManualPaymentRequest,
  Plan,
  PlanCreateRequest,
  PlanListResponse,
  PlanUpdateRequest,
  // TODO-163 Faz 3 (TD-154) — Plan → Capability editörü (transport imzalarında kullanılan tipler).
  PlanCapabilitiesResponse,
  PlanCapabilitiesUpdateRequest,
  PlanCapabilityPreviewResponse,
  // TODO-164 (ADR-222) — theme-binding transport imzaları.
  ThemeBindingResponse,
  ThemeBindingAssignRequest,
  ThemeBindingListResponse,
  PlatformLoginRequest,
  PlatformLoginResponse,
  PlatformLogoutResponse,
  PlatformMeResponse,
  PlatformSessionExtendResponse,
  HeroSlide,
  HeroSlideCreateRequest,
  HeroSlideListResponse,
  HeroSlideReorderRequest,
  HeroSlideStatusActionResponse,
  HeroSlideUpdateRequest,
  SizeChartContract,
  SizeChartCreateRequest,
  SizeChartUpdateRequest,
  SizeChartAssignRequest,
  // TODO-165A (ADR-165A) — Beden tablosu (SizeChart) SECICI sozlesmesi.
  AdminSizeChartSelectorResponse,
  // TODO-165A Tasks 25/26 — bir ürünün güncel beden tablosu bağlantısı sözleşmesi.
  ProductSizeChartAssignmentResponse,
  // TODO-165A (ADR-165A) — Brand (Marka) sozlesmeleri. NOT: Brand/AdminBrandList*/AdminBrandSelector*
  // (SortBy/Query/Option)/BrandProductRow/PublicBrandSummary/PublicBrandDetail burada import EDİLMEZ
  // (bu dosyada gerçek tip konumunda kullanılmazlar) — aşağıdaki `export type {...} from
  // "@commerce-os/contracts"` bloğu onları BAĞIMSIZ olarak zaten re-export eder (@typescript-eslint/
  // no-unused-vars: kullanılmayan import olurdu).
  BrandListResponse,
  BrandResponse,
  BrandCreateRequest,
  BrandUpdateRequest,
  AdminBrandSelectorResponse,
  // TODO-165A (ADR-165A) Task 15/16 gap — Marka "Bağlı ürünler" listesi (COUNT-ONLY'den yükseltildi).
  BrandProductsResponse,
  // TODO-166 (ADR-265) — Admin Slug & Redirect Management sözleşmeleri.
  AdminRedirectListResponse,
  AdminRedirectResponse,
  AdminRedirectDetailResponse,
  AdminRedirectCreateRequest,
  AdminRedirectUpdateRequest,
  AdminSlugListResponse,
  AdminSlugDetailResponse,
  // TODO-165A (ADR-165A) — ProductTaxonomyValue sozlesmeleri. NOT: ProductTaxonomyTypeContract/
  // ProductTaxonomyStatusContract/ProductTaxonomyValue/ProductTaxonomyQuery yukarıdaki notla aynı
  // sebeple burada import EDİLMEZ (aşağıda bağımsız re-export edilirler).
  ProductTaxonomyListResponse,
  ProductTaxonomyResponse,
  ProductTaxonomyCreateRequest,
  ProductTaxonomyUpdateRequest,
  ProductTaxonomyReorderRequest,
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
  // TODO-160A (ADR-109…113) — SKU Generation & Governance tipleri.
  SkuPreviewResponse,
  SkuRegenerateRequest,
  SkuRegenerateResponse,
  SkuValidateRequest,
  SkuValidateResponse,
  SkuAuditResponse,
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
  StoreAdminCustomerListSummaryResponse,
  AdminReviewListResponse,
  AdminReviewDetailResponse,
  ReviewModerateRequest,
  ReviewModerateResponse,
  // TODO-160 (ADR-102…107) — Influencer Tracking & Attribution.
  InfluencerListResponse,
  InfluencerDetailResponse,
  InfluencerCreateRequest,
  InfluencerUpdateRequest,
  InfluencerCampaignListResponse,
  InfluencerCampaignDetailResponse,
  InfluencerCampaignCreateRequest,
  InfluencerCampaignUpdateRequest,
  TrackingLinkListResponse,
  TrackingLinkDetailResponse,
  TrackingLinkCreateResponse,
  TrackingLinkCreateRequest,
  TrackingLinkUpdateRequest,
  InfluencerAnalyticsResponse,
  InfluencerAggregateAnalyticsResponse,
  CampaignAnalyticsResponse,
  LinkAnalyticsResponse,
  // ADR-268 — Financial Reporting Foundation.
  FinanceSummaryResponse,
  FinanceBreakdownsResponse,
  FinancePaymentReportResponse,
  FinanceDiscountReportResponse,
  // TODO-174 (ADR-275) — İptal raporu (Store Admin; yalnız görüntüleme).
  CancellationReportResponse,
  // TODO-161 (ADR-114…120) — Sponsored Product Management.
  SponsoredCampaignListResponse,
  SponsoredCampaignDetailResponse,
  SponsoredCampaignCreateRequest,
  SponsoredCampaignUpdateRequest,
  SponsoredAnalyticsResponse,
  // TODO-161A (ADR-121…127) — Sponsorship Agreements, Billing & Settlement.
  SponsorAccountListResponse,
  SponsorAccountDetailResponse,
  SponsorAccountCreateRequest,
  SponsorAccountUpdateRequest,
  SponsorshipAgreementListResponse,
  SponsorshipAgreementDetailResponse,
  SponsorshipAgreementCreateRequest,
  SponsorshipAgreementUpdateRequest,
  SponsorshipAgreementCampaignLinkRequest,
  SponsorshipSettlementListResponse,
  SponsorshipSettlementDetailResponse,
  SponsorshipSettlementPreviewRequest,
  SponsorshipCharge,
  SponsorshipChargeListResponse,
  SponsorshipChargeDetailResponse,
  SponsorshipChargeCreateRequest,
  SponsorshipChargeIssueRequest,
  SponsorshipChargeCancelRequest,
  SponsorshipPaymentListResponse,
  SponsorshipPaymentDetailResponse,
  SponsorshipPaymentCreateRequest,
  SponsorshipPaymentReverseRequest,
  SponsorshipDashboardResponse,
  SponsorshipEligibleAgreementListResponse,
  SponsorshipCampaignCommercialSummaryResponse,
  SponsorshipFixedFeeChargeRequest,
  SponsorshipAdvanceCreateRequest,
  SponsorshipAdvanceDetailResponse,
  SponsorshipAdvanceListResponse,
  SponsorshipOpenChargeListResponse,
  SponsorshipAdvanceAllocationRequest,
  SponsorshipAllocationDetailResponse,
  // TODO-161A.1 — Commercial automation (settlement scheduler + retention) operations.
  CommercialAutomationRunRequest,
  CommercialAutomationStatusResponse,
  SettlementSchedulerRunResponse,
  RetentionRunResponse,
  // TD-130 — Recommendation Measurement görünürlük özeti.
  RecommendationSummaryResponse,
  StoreAdminCustomerUpdateRequest,
  StoreAdminCustomerCreateRequest,
  StoreAdminCustomerCreateResponse,
  StoreAdminCredentialTokenResponse,
  StoreAdminRevokeSessionsResponse,
  StoreAdminCustomerErasurePreviewResponse,
  StoreAdminCustomerErasureApplyRequest,
  StoreAdminCustomerErasureApplyResponse,
  StoreAdminCustomerDeactivateResponse,
  StoreAdminCustomerErasureStatusResponse,
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
  ShipmentStatusUpdateRequest,
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
  // TODO-163 (ADR-208…ADR-213) — Tenant Module & Capability Management (internal kullanım).
  StoreModulesResponse,
  StoreModuleState,
} from "@commerce-os/contracts";

// TODO-177 (ADR-289) — Platform support question-set request/response types (admin.support methods).
import type {
  PlatformSupportQuestionSetCreateRequest,
  PlatformSupportQuestionSetUpdateRequest,
  PlatformSupportVersionCreateRequest,
  PlatformSupportVersionEditRequest,
  PlatformSupportMappingUpsertRequest,
  PlatformSupportTopicDefaultUpsertRequest,
  PlatformSupportQuestionSetListResponse,
  PlatformSupportQuestionSetDetailResponse,
  PlatformSupportGraphValidationResponse,
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
  // TODO-174B — Order Experience Recovery + Store Credit (consumer'lara re-export).
  ExperienceListResponse,
  ExperienceListRow,
  ExperienceKpiDto,
  AssignableUser,
  RecoveryCaseDetailDto,
  RecoveryActivityDto,
  RecoveryActionRequest,
  ManualOpenCaseRequest,
  // TD-174B-1/2 — Order-detail experience summary + recovery/credit reporting.
  OrderExperienceSummaryDto,
  RecoveryReportDto,
  CreditReportDto,
  AdminIssueCreditRequest,
  AdminAdjustCreditRequest,
  CreditLedgerEntryDto,
  CustomerCreditBalanceResponse,
  ShoppingBalanceListResponse,
  ShoppingBalanceDetailDto,
  ShoppingBalanceRowDto,
  ShoppingBalanceSummaryDto,
  CreditLotDto,
  CreditSourceTypeDto,
  CreditLotStatusDto,
  // TODO-163 (ADR-208…ADR-213) — Tenant Module & Capability Management.
  StoreModuleState,
  StoreModuleMatrixEntry,
  StoreModulesResponse,
  StoreModuleDisablePreviewResponse,
  PublicStoreCapabilitiesResponse,
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
  // TODO-169 (ADR-269) — Store Admin iade yönetimi kontrat tipleri (store-admin tüketir).
  ReturnStatusValue,
  ReturnResolutionTypeValue,
  ReturnReasonValue,
  AdminReturnListItem,
  AdminReturnListQuery,
  AdminReturnListResponse,
  AdminRefundVisibilityListResponse,
  AdminRefundVisibilityItem,
  RefundOriginValue,
  // TODO-175 (ADR-285) — Refund destination (müşteri tercihi: orijinal ödeme / alışveriş bakiyesi).
  RefundDestinationValue,
  OrderRefundStatusValue,
  AdminReturnDetail,
  AdminReturnItem,
  AdminReturnHistoryEntry,
  AdminReturnRefundIntent,
  AdminReturnAttachment,
  AdminReturnDetailResponse,
  AdminReturnApproveRequest,
  AdminReturnRejectRequest,
  AdminReturnInspectRequest,
  AdminReturnFastRefundRequest,
  AdminReturnDispositionCreateRequest,
  AdminReturnDispositionCancelRequest,
  AdminReverseShipmentCreateRequest,
  AdminReverseShipmentStatusRequest,
  AdminReverseShipmentTrackingRequest,
  AdminReturnFastRefundContext,
  AdminReturnFastRefundContextResponse,
  AdminReturnTransitionRequest,
  // TODO-169 (blocker #6/#8) — ortak iade özeti projeksiyonu + sipariş-iade entegrasyonu.
  ReturnOrderSummary,
  ReturnWindowState,
  AdminOrderReturnsResponse,
  // TODO-170-recovery — Bekleyen İş Özeti (sidebar + dashboard).
  PendingWorkSummary,
  Plan,
  PlanCreateRequest,
  PlanListResponse,
  PlanUpdateRequest,
  // TODO-163 Faz 3 (TD-154) — Plan → Capability editörü.
  PlanCapabilityStatus,
  PlanCapabilityMatrixEntry,
  PlanCapabilitiesResponse,
  PlanCapabilitiesUpdateRequest,
  PlanCapabilityPreviewResponse,
  PlatformLoginRequest,
  PlatformLoginResponse,
  PlatformLogoutResponse,
  PlatformMeResponse,
  PlatformSessionExtendResponse,
  CustomerSessionExtendResponse,
  SessionTiming,
  HeroSlide,
  HeroSlideCreateRequest,
  HeroSlideListResponse,
  HeroSlideReorderRequest,
  HeroSlideStatusActionResponse,
  HeroSlideUpdateRequest,
  SizeChartContract,
  SizeChartCreateRequest,
  SizeChartUpdateRequest,
  SizeChartAssignRequest,
  // TODO-165A (ADR-165A) — Beden tablosu (SizeChart) SECICI sozlesmesi.
  AdminSizeChartSelectorSortBy,
  AdminSizeChartSelectorQuery,
  AdminSizeChartSelectorOption,
  AdminSizeChartSelectorResponse,
  // TODO-165A Tasks 25/26 — bir ürünün güncel beden tablosu bağlantısı sözleşmesi.
  ProductSizeChartAssignmentResponse,
  // TODO-166 (ADR-265) — Admin Slug & Redirect Management sozlesmeleri.
  AdminRedirect,
  AdminRedirectDetail,
  AdminRedirectListResponse,
  AdminRedirectResponse,
  AdminRedirectDetailResponse,
  AdminRedirectListQuery,
  AdminRedirectCreateRequest,
  AdminRedirectUpdateRequest,
  AdminSlugRecord,
  AdminSlugDetail,
  AdminSlugListResponse,
  AdminSlugDetailResponse,
  AdminSlugListQuery,
  // TODO-165A (ADR-165A) — Brand (Marka) sozlesmeleri.
  Brand,
  BrandListResponse,
  BrandResponse,
  BrandCreateRequest,
  BrandUpdateRequest,
  AdminBrandListSortBy,
  AdminBrandListQuery,
  AdminBrandSelectorSortBy,
  AdminBrandSelectorQuery,
  AdminBrandSelectorOption,
  AdminBrandSelectorResponse,
  // TODO-165A (ADR-165A) Task 15/16 gap — Marka "Bağlı ürünler" listesi (COUNT-ONLY'den yükseltildi).
  BrandProductRow,
  BrandProductsResponse,
  PublicBrandSummary,
  PublicBrandDetail,
  // TODO-165A (ADR-165A) Task 18 -- Public brand liste/detay govde sozlesmeleri.
  PublicBrandListResponse,
  PublicBrandDetailResponse,
  // TODO-165A (ADR-165A) — ProductTaxonomyValue sozlesmeleri.
  ProductTaxonomyTypeContract,
  ProductTaxonomyStatusContract,
  ProductTaxonomyValue,
  ProductTaxonomyListResponse,
  ProductTaxonomyResponse,
  ProductTaxonomyCreateRequest,
  ProductTaxonomyUpdateRequest,
  ProductTaxonomyReorderRequest,
  ProductTaxonomyQuery,
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
  ThemeDuplicateRequest,
  ThemePreviewTokenResponse,
  ThemeRollbackRequest,
  ThemeImportRequest,
  ThemeExportResponse,
  ThemePresetSummary,
  ThemePresetListResponse,
  ThemePreviewResponse,
  // TODO-164 (ADR-217/221/222) — Tenant theme compatibility + Platform Admin binding.
  ThemeCompatibilityIssue,
  ThemeBindingResponse,
  ThemeBindingAssignRequest,
  ThemeBindingListResponse,
  ThemeBindingSummary,
  // TODO-164B Dilim 2 (ADR-238…245) — Platform Theme Library / Designer / Rollout.
  StoreOverridePolicyContract,
  FieldPolicyProjection,
  LibraryTemplateSummary,
  LibraryListResponse,
  LibraryTemplateCreateRequest,
  ThemePolicyUpdateRequest,
  ThemeChangeSummary,
  ThemeFieldChange,
  TemplateUsageResponse,
  AssignableStoresResponse,
  ThemeAssignPreviewRequest,
  ThemeAssignPreviewResponse,
  ThemeAssignRequest,
  RolloutSummaryResponse,
  LibraryPreviewTokenRequest,
  PlatformThemeStatusResponse,
  ThemeStageAssetsRequest,
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
  // TODO-160A (ADR-109…113) — SKU Generation & Governance tipleri.
  SkuPreviewResponse,
  SkuPreviewRow,
  SkuRegenerateRequest,
  SkuRegenerateResponse,
  SkuValidateRequest,
  SkuValidateResponse,
  SkuAuditResponse,
  SkuAuditRow,
  SkuSource,
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
  // TODO-159C (ADR-092) — server-side matris liste query'si + sayfadan bağımsız özet.
  AdminInventoryMatrixSortBy,
  AdminInventoryMatrixListQuery,
  InventoryStoreMatrixSummary,
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
  // TODO-165 (ADR-247/249/250) — Public PDP fashion projeksiyon tipleri (storefront tüketicisi).
  PublicFashionProjection,
  // TODO-158A (ADR-086) — Home Experience public composed projeksiyon tipleri (storefront tüketicisi).
  PublicHomeResponse,
  PublicHomeSection,
  PublicHomeHeroSlide,
  PublicHomeFeaturedCategory,
  // TODO-162 (ADR-202) — Katman B viewer-specific Discovery projeksiyon tipleri (storefront tüketicisi).
  PublicHomeDiscoveryResponse,
  PublicHomeDiscoveryRequest,
  PublicDiscoverySection,
  // TODO-162 (ADR-205) — Home Discovery section-analytics (event domain) kontrat tipleri.
  HomeDiscoveryEventType,
  HomeDiscoveryEventRequest,
  HomeDiscoveryEventResponse,
  HomeDiscoverySummaryResponse,
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
  // TODO-168 (ADR-267) — Cart Change Awareness tipleri.
  CartChangeType,
  CartChangeSeverity,
  PublicCartLineChange,
  PublicCartChange,
  PublicCartLineSnapshot,
  PublicCartChangeContext,
  CartChangeEventType,
  CartChangeEventPlacement,
  CartChangeEventRequest,
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
  OrderPaymentStateResponse,
  PaymentLinkResponse,
  SendPaymentLinkEmailResponse,
  PaymentRecoveryAttempt,
  CreatePaymentLinkRequest,
  SendPaymentLinkEmailRequest,
  RecordManualPaymentRequest,
  PublicPayResolveResponse,
  PublicPayResultResponse,
  PublicPayStartRequest,
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
  StoreAdminCustomerErasurePreviewResponse,
  StoreAdminCustomerErasureApplyRequest,
  StoreAdminCustomerErasureApplyResponse,
  StoreAdminCustomerDeactivateResponse,
  StoreAdminCustomerErasureStatusResponse,
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
  // TODO-159D (ADR-093) — Customer Lists & Wishlist tipleri (type-only re-export).
  CustomerListType,
  CustomerListVisibility,
  CustomerListItemAvailability,
  CustomerListSummary,
  CustomerListListResponse,
  CustomerListItem,
  CustomerListDetail,
  CustomerListDetailResponse,
  CustomerListMutationResponse,
  CustomerListCreateRequest,
  CustomerListRenameRequest,
  CustomerListAddItemRequest,
  CustomerListAddItemResponse,
  CustomerListMoveItemRequest,
  CustomerListCopyItemRequest,
  CustomerListItemMutationResponse,
  CustomerListBatchAddToCartRequest,
  CustomerListCartCandidate,
  CustomerListSkippedItem,
  CustomerListBatchAddToCartResponse,
  CustomerWishlistToggleRequest,
  CustomerWishlistToggleResponse,
  CustomerWishlistStatusRequest,
  CustomerWishlistStatusResponse,
  CustomerWishlistMergeRequest,
  CustomerWishlistMergeResponse,
  StoreAdminCustomerListSummaryResponse,
  // TODO-167 (ADR-266) — Persistent Cart (customer cart) tipleri (type-only re-export).
  CartStatus,
  CustomerCartProjection,
  CustomerCartResponse,
  CustomerCartStaleResponse,
  CustomerCartAddLineRequest,
  CustomerCartSetLineRequest,
  CustomerCartDeleteLineRequest,
  CustomerCartReconcileRequest,
  CustomerCartMergeRequest,
  CustomerCartMergeResult,
  CustomerCartMergeResponse,
} from "@commerce-os/contracts";

/**
 * TODO-159E (ADR-094) — Product Reviews & Ratings kontrat tipleri (type-only re-export).
 * Public tipler ALLOWLIST'tir (customerId/email/orderId/orderLineId/moderationNote taşımaz).
 */
export type {
  ProductReviewStatus,
  ReviewPublicSort,
  ReviewModerationAction,
  ReviewEligibilityReason,
  RatingDistribution,
  ReviewSummary,
  ReviewSummaryResponse,
  ReviewSummaryBatchRequest,
  ReviewSummaryBatchResponse,
  PublicReview,
  ReviewPublicListQuery,
  ReviewPublicListResponse,
  CustomerReview,
  ReviewEligibleOrderLine,
  // TODO-174A — Sipariş deneyimi değerlendirmesi (ProductReview'dan AYRIK).
  OrderExperienceEligibility,
  OrderExperienceListResponse,
  OrderExperienceReviewResponse,
  OrderExperienceReviewCreateInput,
  CustomerReviewsResponse,
  ReviewEligibilityResponse,
  ReviewCreateRequest,
  ReviewUpdateRequest,
  CustomerReviewMutationResponse,
  ReviewHelpfulRequest,
  ReviewHelpfulResponse,
  AdminReviewSummary,
  AdminReviewDetail,
  AdminReviewListQuery,
  AdminReviewListResponse,
  AdminReviewDetailResponse,
  ReviewModerateRequest,
  ReviewModerateResponse,
  // TODO-160 (ADR-102…107) — Influencer Tracking & Attribution (consumer tipleri).
  InfluencerStatus,
  InfluencerCampaignStatus,
  TrackingLinkTargetType,
  TrackingLinkStatus,
  InfluencerSummary,
  InfluencerDetail,
  InfluencerListQuery,
  InfluencerListResponse,
  InfluencerDetailResponse,
  InfluencerCreateRequest,
  InfluencerUpdateRequest,
  InfluencerCampaignSummary,
  InfluencerCampaignListQuery,
  InfluencerCampaignListResponse,
  InfluencerCampaignDetailResponse,
  InfluencerCampaignCreateRequest,
  InfluencerCampaignUpdateRequest,
  TrackingLinkSummary,
  TrackingLinkListQuery,
  TrackingLinkListResponse,
  TrackingLinkDetailResponse,
  TrackingLinkCreateResponse,
  TrackingLinkCreateRequest,
  TrackingLinkUpdateRequest,
  InfluencerAnalyticsQuery,
  InfluencerAnalyticsResponse,
  AttributionKpiSummary,
  AttributionDailyPoint,
  AttributionInfluencerBreakdown,
  AttributionCampaignBreakdown,
  AttributionTopLink,
  AttributionTopProduct,
  // Influencer Campaign Lifecycle & Granular Analytics (ADR-170…176) — consumer tipleri.
  TrackingDenyReason,
  TerminalReasonBucket,
  AttributionCurrencyRevenue,
  AttributionMetricBody,
  AttributionInfluencerTotals,
  AttributionCampaignRow,
  AttributionLinkRow,
  AttributionUtmBreakdown,
  AttributionRecentOrder,
  InfluencerAggregateAnalyticsResponse,
  CampaignAnalyticsResponse,
  LinkAnalyticsResponse,
  // TODO-161 (ADR-114…120) — Sponsored Product Management (consumer tipleri).
  SponsoredCampaignStatus,
  SponsoredPlacementType,
  SponsoredEventType,
  SponsoredCampaignSummary,
  SponsoredCampaignDetail,
  SponsoredCampaignPlacementProduct,
  SponsoredCampaignListQuery,
  SponsoredCampaignListResponse,
  SponsoredCampaignDetailResponse,
  SponsoredCampaignCreateRequest,
  SponsoredCampaignUpdateRequest,
  SponsoredAnalyticsQuery,
  SponsoredAnalyticsResponse,
  SponsoredKpiSummary,
  SponsoredDailyPoint,
  SponsoredCampaignBreakdown,
  SponsoredProductBreakdown,
  SponsoredPlacementBreakdown,
  SponsoredTopSearchTerm,
  // TODO-161A (ADR-121…127) — Sponsorship Agreements, Billing & Settlement (consumer tipleri).
  SponsorAccountStatus,
  SponsorshipAgreementStatus,
  SponsorshipPricingModel,
  SponsorshipSettlementPeriod,
  SponsorshipSettlementStatus,
  SponsorshipChargeType,
  SponsorshipChargeStatus,
  SponsorshipChargeDisplayStatus,
  SponsorshipPaymentMethod,
  SponsoredCommercialMode,
  SponsorAccountSummary,
  SponsorAccountDetail,
  SponsorAccountCreateRequest,
  SponsorAccountUpdateRequest,
  SponsorAccountListQuery,
  SponsorAccountListResponse,
  SponsorAccountDetailResponse,
  SponsorshipAgreementCampaignLink,
  SponsorshipAgreementSummary,
  SponsorshipAgreementDetail,
  SponsorshipAgreementCreateRequest,
  SponsorshipAgreementUpdateRequest,
  SponsorshipAgreementCampaignLinkRequest,
  SponsorshipAgreementListQuery,
  SponsorshipAgreementListResponse,
  SponsorshipAgreementDetailResponse,
  SponsorshipSettlement,
  SponsorshipSettlementPreviewRequest,
  SponsorshipSettlementListQuery,
  SponsorshipSettlementListResponse,
  SponsorshipSettlementDetailResponse,
  SponsorshipCharge,
  SponsorshipChargeListQuery,
  SponsorshipChargeListResponse,
  SponsorshipChargeDetailResponse,
  SponsorshipChargeCreateRequest,
  SponsorshipChargeIssueRequest,
  SponsorshipChargeCancelRequest,
  SponsorshipPayment,
  SponsorshipPaymentCreateRequest,
  SponsorshipPaymentReverseRequest,
  SponsorshipPaymentListQuery,
  SponsorshipPaymentListResponse,
  SponsorshipPaymentDetailResponse,
  SponsorshipCurrencyKpi,
  SponsorshipDashboardBreakdownRow,
  SponsorshipDashboardQuery,
  SponsorshipDashboardResponse,
} from "@commerce-os/contracts";

// TODO-161A.2 (ADR-128/129) — birleşik ticari akış kontrat tipleri (type-only re-export;
// store-admin BFF + UI bunları api-client üzerinden import eder).
export type {
  SponsorshipEligibleAgreement,
  SponsorshipEligibleAgreementListResponse,
  SponsorshipCampaignCommercialSummary,
  SponsorshipCampaignCommercialSummaryResponse,
  SponsorshipAdvance,
  SponsorshipAllocation,
  SponsorshipFixedFeeChargeRequest,
  SponsorshipAdvanceCreateRequest,
  SponsorshipAdvanceAllocationRequest,
  SponsorshipAdvanceListResponse,
  SponsorshipAdvanceDetailResponse,
  SponsorshipAllocationDetailResponse,
  SponsorshipOpenChargeListResponse,
} from "@commerce-os/contracts";

// TODO-161A.1 — Commercial automation operations kontrat tipleri (type-only re-export;
// store-admin BFF + UI bunları api-client üzerinden import eder).
export type {
  CommercialAutomationRunRequest,
  CommercialAutomationStatusResponse,
  SettlementSchedulerRunResponse,
  RetentionRunResponse,
} from "@commerce-os/contracts";

// TD-130 — Recommendation Measurement görünürlük özeti kontrat tipi (type-only re-export).
export type { RecommendationSummaryResponse } from "@commerce-os/contracts";

// ADR-268 — Financial Reporting Foundation kontrat tipleri (type-only re-export).
export type {
  FinanceSummaryResponse,
  FinanceBreakdownsResponse,
  FinancePaymentReportResponse,
  FinanceDiscountReportResponse,
  // TODO-174 (ADR-275) — İptal raporu (Store Admin; yalnız görüntüleme).
  CancellationReportResponse,
  CancellationReportQuery,
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
  ShipmentStatusUpdateRequest,
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
  ThemeDuplicateRequest,
  ThemePreviewTokenResponse,
  ThemeRollbackRequest,
  ThemeImportRequest,
  ThemeExportResponse,
  ThemePresetListResponse,
  ThemePreviewResponse,
  // TODO-164B Dilim 2 — Platform Theme Library / Designer / Rollout transport tipleri.
  LibraryListResponse,
  LibraryTemplateCreateRequest,
  ThemePolicyUpdateRequest,
  ThemeChangeSummary,
  TemplateUsageResponse,
  AssignableStoresResponse,
  ThemeAssignPreviewRequest,
  ThemeAssignPreviewResponse,
  ThemeAssignRequest,
  RolloutSummaryResponse,
  LibraryPreviewTokenRequest,
  PlatformThemeStatusResponse,
  ThemeStageAssetsRequest,
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
 * TODO-165A (ADR-165A) Task 18 — Public Brand allowlist şemaları (DEĞER re-export). YALNIZCA sunucu-tarafı
 * BFF (storefront `lib/server/brands.ts`) yanıtı doğrulamak için kullanır; contracts'a doğrudan bağlanmaz.
 */
export {
  publicBrandSummarySchema,
  publicBrandDetailSchema,
  publicBrandListResponseSchema,
  publicBrandDetailResponseSchema,
} from "@commerce-os/contracts";

/**
 * TODO-156E (ADR-084) — Public Autocomplete runtime allowlist şeması (DEĞER re-export). YALNIZCA sunucu-tarafı
 * BFF (storefront `lib/server/autocomplete.ts` / `app/api/autocomplete`) yanıtı doğrulamak için kullanır.
 */
export { publicAutocompleteResponseSchema } from "@commerce-os/contracts";

/**
 * TODO-159D (ADR-093) — Customer Lists & Wishlist sunucu-otoriter SINIR sabitleri (DEĞER
 * re-export). Storefront BFF (lib/server/wishlist*.ts, list-actions.ts) istekleri sunucuya
 * göndermeden önce aynı üst sınırlarla kırpar; contracts'a doğrudan bağlanmaz.
 */
export {
  CUSTOMER_LIST_NAME_MAX_LENGTH,
  CUSTOMER_LIST_MAX_PER_CUSTOMER,
  CUSTOMER_LIST_MAX_ITEMS,
  CUSTOMER_LIST_ITEM_NOTE_MAX_LENGTH,
  CUSTOMER_LIST_BATCH_ADD_MAX,
  CUSTOMER_WISHLIST_STATUS_MAX_IDS,
  CUSTOMER_WISHLIST_MERGE_MAX_ITEMS,
  CUSTOMER_LIST_ITEM_QUANTITY_MAX,
  // TODO-167 (ADR-266) — Persistent Cart sunucu-otoriter sinir sabitleri (DEGER re-export).
  CART_MAX_LINES,
  CART_MAX_QUANTITY,
} from "@commerce-os/contracts";

/**
 * TODO-159E (ADR-094) — Product Reviews & Ratings sunucu-otoriter SINIR sabitleri +
 * enum değerleri (DEĞER re-export). Storefront BFF (lib/server/reviews*.ts) ve store-admin
 * BFF, istekleri sunucuya göndermeden aynı üst sınırlarla kırpar; contracts'a doğrudan bağlanmaz.
 */
export {
  REVIEW_RATING_MIN,
  REVIEW_RATING_MAX,
  REVIEW_TITLE_MAX_LENGTH,
  REVIEW_BODY_MIN_LENGTH,
  REVIEW_BODY_MAX_LENGTH,
  REVIEW_MODERATION_NOTE_MAX_LENGTH,
  REVIEW_SUMMARY_MAX_IDS,
  REVIEW_PUBLIC_DEFAULT_PAGE_SIZE,
} from "@commerce-os/contracts";

// TODO-177 (ADR-289) — Ürün Desteği DTO tipleri (store-admin/platform-admin/storefront BFF için).
export type {
  SupportTicketStatusDto,
  SupportTopicDto,
  SupportActorTypeDto,
  SupportQuestionTypeDto,
  SupportMappingScopeDto,
  SupportAnswerValue,
  SupportQuestionGraphDto,
  SupportResolveRequest,
  SupportResolveResponse,
  SupportTicketCreateRequest,
  SupportMessageCreateRequest,
  CustomerSupportTicketDetail,
  AdminSupportTicketListResponse,
  AdminSupportTicketDetail,
  AdminSupportActionRequest,
  PlatformSupportVersionEditRequest,
  PlatformSupportQuestionSetCreateRequest,
  PlatformSupportQuestionSetUpdateRequest,
  PlatformSupportVersionCreateRequest,
  PlatformSupportMappingUpsertRequest,
  PlatformSupportTopicDefaultUpsertRequest,
  PlatformSupportQuestionSetSummary,
  PlatformSupportVersionDto,
  PlatformSupportQuestionSetDetail,
  PlatformSupportQuestionSetListResponse,
  PlatformSupportQuestionSetDetailResponse,
  PlatformSupportGraphValidationResponse,
  SupportQuestionDto,
  SupportTransitionDto,
} from "@commerce-os/contracts";
export {
  supportResolveRequestSchema,
  supportTicketCreateRequestSchema,
  supportMessageCreateRequestSchema,
  adminSupportActionRequestSchema,
  platformSupportVersionEditRequestSchema,
  SUPPORT_MESSAGE_MAX,
  SUPPORT_MAX_ATTACHMENTS,
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

// TODO-165 (ADR-249) — Beden tablosu (SizeChart) response zarflari. Gateway her okuma/mutasyon
// ucunda { data } dondurur (list { data: [] }). Contracts type alias tanimlamadigi icin burada
// turetilir; re-export ile tuketicilere acilir.
export interface SizeChartResponse {
  data: SizeChartContract;
}
export interface SizeChartListResponse {
  data: SizeChartContract[];
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
    // ADR-271 — oturum uzatma (token rotate; absolute degismez). Aktif token gerekir.
    platformExtend(token?: string): Promise<PlatformSessionExtendResponse>;
  };
  admin: {
    stores: {
      list(token?: string): Promise<AdminStoreListResponse>;
      create(input: AdminStoreCreateRequest, token?: string): Promise<AdminStore>;
      get(id: string, token?: string): Promise<AdminStore>;
      update(id: string, input: AdminStoreUpdateRequest, token?: string): Promise<AdminStore>;
      // TODO-164 (ADR-222) — "Tema ve Marka": theme-binding görüntüle + theme-key ata.
      themeBinding: {
        get(id: string, token?: string): Promise<ThemeBindingResponse>;
        assign(
          id: string,
          input: ThemeBindingAssignRequest,
          token?: string,
        ): Promise<ThemeBindingResponse>;
      };
    };
    // TODO-164 — fleet "Tema Yönetimi" listesi (store-scope'suz platform admin).
    themeBindings: {
      list(token?: string): Promise<ThemeBindingListResponse>;
    };
    // TODO-164B Dilim 2 — Platform Theme Library / Designer / Rollout (SUPER_ADMIN).
    themeLibrary: {
      list(token?: string): Promise<LibraryListResponse>;
      create(input: LibraryTemplateCreateRequest, token?: string): Promise<ThemeDetail>;
      get(themeId: string, token?: string): Promise<ThemeDetail>;
      updateMeta(themeId: string, input: ThemeUpdateRequest, token?: string): Promise<ThemeDetail>;
      saveDraft(themeId: string, input: ThemeDraftUpdateRequest, token?: string): Promise<ThemeDetail>;
      setPolicy(themeId: string, input: ThemePolicyUpdateRequest, token?: string): Promise<ThemeDetail>;
      publish(themeId: string, input: ThemePublishRequest, token?: string): Promise<ThemeDetail>;
      archive(themeId: string, token?: string): Promise<ThemeDetail>;
      duplicate(themeId: string, input: ThemeDuplicateRequest, token?: string): Promise<ThemeDetail>;
      rollback(themeId: string, input: ThemeRollbackRequest, token?: string): Promise<ThemeDetail>;
      previewToken(
        themeId: string,
        input: LibraryPreviewTokenRequest,
        token?: string,
      ): Promise<ThemePreviewTokenResponse>;
      stageAssets(themeId: string, input: ThemeStageAssetsRequest, token?: string): Promise<ThemeDetail>;
      diff(
        themeId: string,
        query: { from?: string; to?: string },
        token?: string,
      ): Promise<ThemeChangeSummary>;
      usage(themeId: string, token?: string): Promise<TemplateUsageResponse>;
      assignableStores(token?: string): Promise<AssignableStoresResponse>;
      assignPreview(
        themeId: string,
        input: ThemeAssignPreviewRequest,
        token?: string,
      ): Promise<ThemeAssignPreviewResponse>;
      assign(themeId: string, input: ThemeAssignRequest, token?: string): Promise<RolloutSummaryResponse>;
      updateApply(
        themeId: string,
        input: ThemeAssignRequest,
        token?: string,
      ): Promise<RolloutSummaryResponse>;
    };
    plans: {
      list(token?: string): Promise<PlanListResponse>;
      create(input: PlanCreateRequest, token?: string): Promise<Plan>;
      get(id: string, token?: string): Promise<Plan>;
      update(id: string, input: PlanUpdateRequest, token?: string): Promise<Plan>;
      // TODO-163 Faz 3 (TD-154) — Plan → Capability editörü (platform-admin).
      capabilities: {
        get(id: string, token?: string): Promise<PlanCapabilitiesResponse>;
        preview(
          id: string,
          input: PlanCapabilitiesUpdateRequest,
          token?: string,
        ): Promise<PlanCapabilityPreviewResponse>;
        apply(
          id: string,
          input: PlanCapabilitiesUpdateRequest,
          token?: string,
        ): Promise<PlanCapabilitiesResponse>;
      };
    };
    // TODO-177 (ADR-289) — Ürün Desteği question-set yönetimi (platform-only; /platform/support/*).
    support: {
      list(token?: string): Promise<PlatformSupportQuestionSetListResponse>;
      create(
        input: PlatformSupportQuestionSetCreateRequest,
        token?: string,
      ): Promise<PlatformSupportQuestionSetDetailResponse>;
      get(id: string, token?: string): Promise<PlatformSupportQuestionSetDetailResponse>;
      update(
        id: string,
        input: PlatformSupportQuestionSetUpdateRequest,
        token?: string,
      ): Promise<PlatformSupportQuestionSetDetailResponse>;
      createVersion(
        id: string,
        input: PlatformSupportVersionCreateRequest,
        token?: string,
      ): Promise<PlatformSupportQuestionSetDetailResponse>;
      editVersion(
        versionId: string,
        input: PlatformSupportVersionEditRequest,
        token?: string,
      ): Promise<{ ok: boolean }>;
      validateVersion(
        versionId: string,
        token?: string,
      ): Promise<PlatformSupportGraphValidationResponse>;
      publishVersion(versionId: string, token?: string): Promise<{ ok: boolean }>;
      archiveVersion(versionId: string, token?: string): Promise<{ ok: boolean }>;
      upsertMapping(
        storeId: string,
        input: PlatformSupportMappingUpsertRequest,
        token?: string,
      ): Promise<{ ok: boolean }>;
      deleteMapping(
        storeId: string,
        input: Omit<PlatformSupportMappingUpsertRequest, "questionSetId">,
        token?: string,
      ): Promise<{ ok: boolean }>;
      upsertTopicDefault(
        input: PlatformSupportTopicDefaultUpsertRequest,
        token?: string,
      ): Promise<{ ok: boolean }>;
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
    // TODO-165 (ADR-249) — Moda dikeyi beden tablosu (SizeChart). DRAFT taslak + PUBLISHED revizyon;
    // publish/rollback/archive durum geçişleri; assignment STORE/CATEGORY/PRODUCT kapsamı. Tüm uçlar
    // store-admin + FASHION_VERTICAL capability gerektirir (enforcement gateway'de). Her uç { data }.
    sizeCharts: {
      list(storeId: string, token?: string): Promise<SizeChartListResponse>;
      get(storeId: string, id: string, token?: string): Promise<SizeChartResponse>;
      create(
        storeId: string,
        input: SizeChartCreateRequest,
        token?: string,
      ): Promise<SizeChartResponse>;
      update(
        storeId: string,
        id: string,
        input: SizeChartUpdateRequest,
        token?: string,
      ): Promise<SizeChartResponse>;
      publish(storeId: string, id: string, token?: string): Promise<SizeChartResponse>;
      rollback(
        storeId: string,
        id: string,
        revisionId: string,
        token?: string,
      ): Promise<SizeChartResponse>;
      archive(storeId: string, id: string, token?: string): Promise<SizeChartResponse>;
      assign(
        storeId: string,
        id: string,
        input: SizeChartAssignRequest,
        token?: string,
      ): Promise<SizeChartResponse>;
      unassign(
        storeId: string,
        id: string,
        assignmentId: string,
        token?: string,
      ): Promise<SizeChartResponse>;
      /**
       * TODO-165A (Task 13, ADR-090 desenini mirror eder) — Beden tablosu SEÇİCİ ucu.
       * `query.ids` verilirse ÇÖZÜM modudur (arama/sayfalama uygulanmaz; sira korunur).
       */
      selector(
        storeId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
      ): Promise<AdminSizeChartSelectorResponse>;
      /**
       * TODO-165A Tasks 25/26 — bir ürünün GÜNCEL beden tablosu bağlantısı (PRODUCT-scope
       * doğrudan atama + PRODUCT>CATEGORY>STORE önceliğiyle çözülmüş etkin chart).
       * `categoryId` opsiyoneldir (istemci ürünün ana kategorisini biliyorsa gönderir).
       */
      getProductAssignment(
        storeId: string,
        productId: string,
        categoryId?: string,
        token?: string,
      ): Promise<ProductSizeChartAssignmentResponse>;
    };
    // TODO-165A (ADR-165A) — Marka (Brand) yonetimi. list/selector query'si buildQueryString
    // ile kurulur (Task 4 pattern); selector `query.ids` verilirse COZUM modudur (arama/
    // sayfalama uygulanmaz; route katmani istemcinin verdigi sirayi korur).
    brands: {
      list(
        storeId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
      ): Promise<BrandListResponse>;
      selector(
        storeId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
      ): Promise<AdminBrandSelectorResponse>;
      create(storeId: string, input: BrandCreateRequest, token?: string): Promise<BrandResponse>;
      get(storeId: string, brandId: string, token?: string): Promise<BrandResponse>;
      update(
        storeId: string,
        brandId: string,
        input: BrandUpdateRequest,
        token?: string,
      ): Promise<BrandResponse>;
      archive(storeId: string, brandId: string, token?: string): Promise<BrandResponse>;
      restore(storeId: string, brandId: string, token?: string): Promise<BrandResponse>;
      /**
       * TODO-165A (ADR-165A) Task 15/16 gap — marka "Bağlı ürünler" listesi (COUNT-ONLY'den
       * GERÇEK sayfalanmış listeye yükseltildi). query: page/pageSize/search.
       */
      products(
        storeId: string,
        brandId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
      ): Promise<BrandProductsResponse>;
    };
    // TODO-166 (ADR-265) — Admin Slug & Redirect Management (SEO modülü).
    redirects: {
      list(
        storeId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
      ): Promise<AdminRedirectListResponse>;
      get(storeId: string, redirectId: string, token?: string): Promise<AdminRedirectDetailResponse>;
      create(storeId: string, input: AdminRedirectCreateRequest, token?: string): Promise<AdminRedirectResponse>;
      update(
        storeId: string,
        redirectId: string,
        input: AdminRedirectUpdateRequest,
        token?: string,
      ): Promise<AdminRedirectResponse>;
      remove(storeId: string, redirectId: string, token?: string): Promise<void>;
    };
    slugs: {
      list(
        storeId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
      ): Promise<AdminSlugListResponse>;
      get(
        storeId: string,
        entityType: string,
        entityId: string,
        token?: string,
      ): Promise<AdminSlugDetailResponse>;
    };
    // TODO-165A (ADR-165A) — Governed Product Taxonomy (Malzeme/Sezon/Yaka vb.) yonetimi.
    // reorder body'si `type` tasir (store+type icin TAM ACTIVE kume beklenir; kismi kume
    // sunucuda 400 TAXONOMY_REORDER_INCOMPLETE ile reddedilir).
    productTaxonomy: {
      list(
        storeId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
      ): Promise<ProductTaxonomyListResponse>;
      get(storeId: string, valueId: string, token?: string): Promise<ProductTaxonomyResponse>;
      create(
        storeId: string,
        input: ProductTaxonomyCreateRequest,
        token?: string,
      ): Promise<ProductTaxonomyResponse>;
      update(
        storeId: string,
        valueId: string,
        input: ProductTaxonomyUpdateRequest,
        token?: string,
      ): Promise<ProductTaxonomyResponse>;
      reorder(
        storeId: string,
        input: ProductTaxonomyReorderRequest,
        token?: string,
      ): Promise<ProductTaxonomyListResponse>;
      archive(storeId: string, valueId: string, token?: string): Promise<ProductTaxonomyResponse>;
      restore(storeId: string, valueId: string, token?: string): Promise<ProductTaxonomyResponse>;
      delete(storeId: string, valueId: string, token?: string): Promise<void>;
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
      // TODO-164A — Custom Theme Builder.
      duplicate(
        storeId: string,
        themeId: string,
        input: ThemeDuplicateRequest,
        token?: string,
      ): Promise<ThemeDetail>;
      archive(storeId: string, themeId: string, token?: string): Promise<ThemeDetail>;
      previewToken(
        storeId: string,
        themeId: string,
        token?: string,
      ): Promise<ThemePreviewTokenResponse>;
      // TODO-164B Dilim 2 — aktif platform teması durumu (Store Admin banner).
      platformStatus(storeId: string, token?: string): Promise<PlatformThemeStatusResponse>;
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
      // TODO-160A (ADR-109…113) — SKU Generation & Governance (deterministik SKU + collision + audit).
      sku: {
        preview(
          storeId: string,
          productId: string,
          input: SkuRegenerateRequest,
          token?: string,
        ): Promise<SkuPreviewResponse>;
        regenerate(
          storeId: string,
          productId: string,
          input: SkuRegenerateRequest,
          token?: string,
        ): Promise<SkuRegenerateResponse>;
        validate(
          storeId: string,
          input: SkuValidateRequest,
          token?: string,
        ): Promise<SkuValidateResponse>;
        audit(storeId: string, limit: number | undefined, token?: string): Promise<SkuAuditResponse>;
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
      // TODO-152A — mağaza-geneli SALT-OKUMA stok matris (izleme merkezi; seçili depo).
      // TODO-159C (ADR-092) — sunucu-otoriter sayfalama/arama/filtre/sıralama. `query`
      // anahtar-değer haritasıdır (page/pageSize/search/sortBy/sortOrder/warehouseId/…);
      // boş/undefined değerler atlanır. Doğrulama + allowlist gateway'dedir.
      storeMatrix(
        storeId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
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
    // TODO-169 (ADR-269) — Store Admin iade operasyonları. Tümü store-scoped
    // (requireStorePlatformAdmin); mutasyonlar state-machine + yetki + version'dan geçer.
    returns: {
      list(
        storeId: string,
        query?: AdminReturnListQuery,
        token?: string,
      ): Promise<AdminRefundVisibilityListResponse>;
      get(storeId: string, returnId: string, token?: string): Promise<AdminReturnDetailResponse>;
      transition(
        storeId: string,
        returnId: string,
        input: AdminReturnTransitionRequest,
        token?: string,
      ): Promise<AdminReturnDetailResponse>;
      reject(
        storeId: string,
        returnId: string,
        input: AdminReturnRejectRequest,
        token?: string,
      ): Promise<AdminReturnDetailResponse>;
      approve(
        storeId: string,
        returnId: string,
        input: AdminReturnApproveRequest,
        token?: string,
      ): Promise<AdminReturnDetailResponse>;
      inspect(
        storeId: string,
        returnId: string,
        input: AdminReturnInspectRequest,
        token?: string,
      ): Promise<AdminReturnDetailResponse>;
      // TD-FR-7 Faz 1 / Task 4/5 — "İadeyi yap": inceleme kararı + (kabul varsa) refund
      // başlatma TEK aksiyonda. Aynı istek şekli (AdminReturnInspectRequest) `/inspect`
      // ile paylaşılır; gateway `adminReturnInspectRequestSchema`'yı reuse eder. Başarısız
      // refund orkestrasyonu (ör. EXCEEDS_REFUNDABLE/CURRENCY_MISMATCH) 4xx döner — inceleme
      // kararı ZATEN commit edilmiştir (geri alınmaz), yalnız refund'ın kendisi başarısız olur.
      inspectDecision(
        storeId: string,
        returnId: string,
        input: AdminReturnInspectRequest,
        token?: string,
      ): Promise<AdminReturnDetailResponse>;
      // TODO-172 (ADR-273) — Fast Refund Controls: teslim alma + inceleme atlanarak doğrudan iade
      // (AYRI güçlü yetki SUPER_ADMIN, backend-enforced). fastRefundContext bounded risk/uygunluk özeti.
      fastRefund(
        storeId: string,
        returnId: string,
        input: AdminReturnFastRefundRequest,
        token?: string,
      ): Promise<AdminReturnDetailResponse>;
      fastRefundContext(
        storeId: string,
        returnId: string,
        token?: string,
      ): Promise<AdminReturnFastRefundContextResponse>;
      // TODO-169 (blocker #6) — sipariş detayına iade entegrasyonu (özet + o siparişin talepleri).
      orderReturns(storeId: string, orderId: string, token?: string): Promise<AdminOrderReturnsResponse>;
      // TODO-173 (ADR-274) — reddedilen adet disposition + reverse shipment (STORE_RETURN_TO_CUSTOMER).
      // Tümü güncellenmiş iade detayını döndürür (UI reprojection).
      setDisposition(
        storeId: string,
        returnId: string,
        input: AdminReturnDispositionCreateRequest,
        token?: string,
      ): Promise<AdminReturnDetailResponse>;
      cancelDisposition(
        storeId: string,
        returnId: string,
        dispositionId: string,
        input: AdminReturnDispositionCancelRequest,
        token?: string,
      ): Promise<AdminReturnDetailResponse>;
      createReverseShipment(
        storeId: string,
        returnId: string,
        input: AdminReverseShipmentCreateRequest,
        token?: string,
      ): Promise<AdminReturnDetailResponse>;
      reverseShipmentStatus(
        storeId: string,
        returnId: string,
        shipmentId: string,
        input: AdminReverseShipmentStatusRequest,
        token?: string,
      ): Promise<AdminReturnDetailResponse>;
      reverseShipmentTracking(
        storeId: string,
        returnId: string,
        shipmentId: string,
        input: AdminReverseShipmentTrackingRequest,
        token?: string,
      ): Promise<AdminReturnDetailResponse>;
    };
    // TODO-170 (ADR-272) — Refund Ledger & Payment Reversal (para iadesi başlat/yenile/tekrar/iptal/manuel).
    refunds: {
      returnContext(storeId: string, returnId: string, token?: string): Promise<AdminRefundContextResponse>;
      orderContext(storeId: string, orderId: string, token?: string): Promise<AdminRefundContextResponse>;
      initiate(
        storeId: string,
        returnId: string,
        input: AdminInitiateRefundRequest,
        token?: string,
      ): Promise<AdminRefundResponse>;
      refresh(storeId: string, refundId: string, token?: string): Promise<AdminRefundResponse>;
      retry(
        storeId: string,
        refundId: string,
        input: AdminRefundVersionActionRequest,
        token?: string,
      ): Promise<AdminRefundResponse>;
      manualComplete(
        storeId: string,
        refundId: string,
        input: AdminManualCompleteRefundRequest,
        token?: string,
      ): Promise<AdminRefundResponse>;
      cancel(
        storeId: string,
        refundId: string,
        input: AdminCancelRefundRequest,
        token?: string,
      ): Promise<AdminRefundResponse>;
    };
    // TODO-174B (ADR-283) — Order Experience Recovery Operations.
    orderExperience: {
      list(
        storeId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
      ): Promise<ExperienceListResponse>;
      kpi(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<ExperienceKpiDto>;
      caseDetail(storeId: string, caseId: string, token?: string): Promise<RecoveryCaseDetailDto>;
      action(storeId: string, caseId: string, input: RecoveryActionRequest, token?: string): Promise<RecoveryCaseDetailDto>;
      openManual(storeId: string, input: ManualOpenCaseRequest, token?: string): Promise<RecoveryCaseDetailDto>;
      // TD-174B-2 — Recovery raporu (trend + zamanlama + outcome + goodwill).
      report(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<RecoveryReportDto>;
      // TD-174B-1 — Tek-sipariş deneyim özeti (order-detail kartı). Review yoksa null.
      byOrder(storeId: string, orderId: string, token?: string): Promise<OrderExperienceSummaryDto | null>;
      // TODO-174B.2 — "Kullanıcıya ata" için store'un yetkili kullanıcıları.
      assignableUsers(storeId: string, token?: string): Promise<AssignableUser[]>;
    };
    // TODO-174B (ADR-281) — Customer Shopping Balance / Store Credit.
    customerCredit: {
      balance(
        storeId: string,
        customerId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
      ): Promise<CustomerCreditBalanceResponse>;
      issue(
        storeId: string,
        customerId: string,
        input: AdminIssueCreditRequest,
        token?: string,
      ): Promise<CustomerCreditBalanceResponse>;
      // Manuel düzeltme (CREDIT ekle / DEBIT çıkar) — SUPER_ADMIN.
      adjust(
        storeId: string,
        customerId: string,
        input: AdminAdjustCreditRequest,
        token?: string,
      ): Promise<CustomerCreditBalanceResponse>;
    };
    // TODO-170-recovery — Bekleyen İş Özeti (sidebar sayaçları + Dashboard kartı; bounded aggregate).
    pendingWork: {
      get(storeId: string, token?: string): Promise<PendingWorkSummary>;
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
      // TODO-159D (ADR-093) — Müşteri liste/wishlist salt-okunur özeti (gizlilik-güvenli).
      getListSummary(
        storeId: string,
        customerId: string,
        token?: string,
      ): Promise<StoreAdminCustomerListSummaryResponse>;
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
      // TD-131 (ADR-149…155) — Customer Data Erasure Workflow.
      deactivate(
        storeId: string,
        customerId: string,
        token?: string,
      ): Promise<StoreAdminCustomerDeactivateResponse>;
      erasurePreview(
        storeId: string,
        customerId: string,
        token?: string,
      ): Promise<StoreAdminCustomerErasurePreviewResponse>;
      erasureApply(
        storeId: string,
        customerId: string,
        input: StoreAdminCustomerErasureApplyRequest,
        token?: string,
      ): Promise<StoreAdminCustomerErasureApplyResponse>;
      erasureStatus(
        storeId: string,
        customerId: string,
        token?: string,
      ): Promise<StoreAdminCustomerErasureStatusResponse>;
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
    // TODO-159E (ADR-094) — Product Reviews moderasyonu (Admin Data Grid + detay + moderate).
    reviews: {
      list(
        storeId: string,
        token?: string,
        query?: Record<string, string | number | undefined>,
      ): Promise<AdminReviewListResponse>;
      get(storeId: string, reviewId: string, token?: string): Promise<AdminReviewDetailResponse>;
      moderate(
        storeId: string,
        reviewId: string,
        input: ReviewModerateRequest,
        token?: string,
      ): Promise<ReviewModerateResponse>;
    };
    // TODO-163 (ADR-208…ADR-210) — Tenant Module & Capability Management (effective matris + override).
    modules: {
      list(storeId: string, token?: string): Promise<StoreModulesResponse>;
      setOverride(
        storeId: string,
        moduleKey: string,
        state: StoreModuleState,
        token?: string,
      ): Promise<StoreModulesResponse>;
    };
    // TODO-160 (ADR-102…107) — Influencer Tracking & Attribution (admin CRUD + dashboard + CSV).
    influencers: {
      list(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<InfluencerListResponse>;
      get(storeId: string, influencerId: string, token?: string): Promise<InfluencerDetailResponse>;
      create(storeId: string, input: InfluencerCreateRequest, token?: string): Promise<InfluencerDetailResponse>;
      update(storeId: string, influencerId: string, input: InfluencerUpdateRequest, token?: string): Promise<InfluencerDetailResponse>;
      listCampaigns(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<InfluencerCampaignListResponse>;
      getCampaign(storeId: string, campaignId: string, token?: string): Promise<InfluencerCampaignDetailResponse>;
      createCampaign(storeId: string, input: InfluencerCampaignCreateRequest, token?: string): Promise<InfluencerCampaignDetailResponse>;
      updateCampaign(storeId: string, campaignId: string, input: InfluencerCampaignUpdateRequest, token?: string): Promise<InfluencerCampaignDetailResponse>;
      listLinks(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<TrackingLinkListResponse>;
      getLink(storeId: string, linkId: string, token?: string): Promise<TrackingLinkDetailResponse>;
      createLink(storeId: string, input: TrackingLinkCreateRequest, token?: string): Promise<TrackingLinkCreateResponse>;
      updateLink(storeId: string, linkId: string, input: TrackingLinkUpdateRequest, token?: string): Promise<TrackingLinkDetailResponse>;
      regenerateLink(storeId: string, linkId: string, token?: string): Promise<TrackingLinkCreateResponse>;
      analytics(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<InfluencerAnalyticsResponse>;
      exportAnalytics(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<string>;
      // Granüler 3-seviyeli dashboard (ADR-174).
      aggregateAnalytics(storeId: string, influencerId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<InfluencerAggregateAnalyticsResponse>;
      campaignAnalytics(storeId: string, campaignId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<CampaignAnalyticsResponse>;
      linkAnalytics(storeId: string, linkId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<LinkAnalyticsResponse>;
    };
    // ADR-268 — Financial Reporting Foundation (Finans > Raporlar).
    finance: {
      summary(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<FinanceSummaryResponse>;
      breakdowns(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<FinanceBreakdownsResponse>;
      payments(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<FinancePaymentReportResponse>;
      discounts(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<FinanceDiscountReportResponse>;
      exportSummary(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<string>;
      exportProducts(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<string>;
      exportOrders(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<string>;
      exportPayments(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<string>;
      exportDiscounts(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<string>;
      // TODO-174 (ADR-275) — İptal raporu (yalnız görüntüleme; taksonomi CRUD yok).
      cancellations(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<CancellationReportResponse>;
      // TD-174B-2 — Alışveriş bakiyesi (store credit) finansal raporu.
      creditReport(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<CreditReportDto>;
    };
    // Shopping Balance Admin (Müşteri Bakiye Yönetimi) — merkezî per-müşteri bakiye listesi + detay.
    shoppingBalance: {
      list(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<ShoppingBalanceListResponse>;
      detail(storeId: string, customerId: string, token?: string): Promise<ShoppingBalanceDetailDto>;
    };
    // TODO-161 (ADR-114…120) — Sponsored Product Management (kampanya CRUD + dashboard + CSV).
    sponsoredProducts: {
      list(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<SponsoredCampaignListResponse>;
      get(storeId: string, campaignId: string, token?: string): Promise<SponsoredCampaignDetailResponse>;
      create(storeId: string, input: SponsoredCampaignCreateRequest, token?: string): Promise<SponsoredCampaignDetailResponse>;
      update(storeId: string, campaignId: string, input: SponsoredCampaignUpdateRequest, token?: string): Promise<SponsoredCampaignDetailResponse>;
      analytics(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<SponsoredAnalyticsResponse>;
      exportAnalytics(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<string>;
    };
    // TODO-161A (ADR-121…127) — Sponsorship Agreements, Billing & Settlement (store-admin).
    sponsorship: {
      listSponsors(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<SponsorAccountListResponse>;
      getSponsor(storeId: string, id: string, token?: string): Promise<SponsorAccountDetailResponse>;
      createSponsor(storeId: string, input: SponsorAccountCreateRequest, token?: string): Promise<SponsorAccountDetailResponse>;
      updateSponsor(storeId: string, id: string, input: SponsorAccountUpdateRequest, token?: string): Promise<SponsorAccountDetailResponse>;
      listAgreements(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<SponsorshipAgreementListResponse>;
      getAgreement(storeId: string, id: string, token?: string): Promise<SponsorshipAgreementDetailResponse>;
      createAgreement(storeId: string, input: SponsorshipAgreementCreateRequest, token?: string): Promise<SponsorshipAgreementDetailResponse>;
      updateAgreement(storeId: string, id: string, input: SponsorshipAgreementUpdateRequest, token?: string): Promise<SponsorshipAgreementDetailResponse>;
      linkCampaign(storeId: string, agreementId: string, input: SponsorshipAgreementCampaignLinkRequest, token?: string): Promise<SponsorshipAgreementDetailResponse>;
      unlinkCampaign(storeId: string, agreementId: string, campaignId: string, token?: string): Promise<SponsorshipAgreementDetailResponse>;
      previewSettlement(storeId: string, agreementId: string, input: SponsorshipSettlementPreviewRequest, token?: string): Promise<SponsorshipSettlementDetailResponse>;
      listSettlements(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<SponsorshipSettlementListResponse>;
      getSettlement(storeId: string, id: string, token?: string): Promise<SponsorshipSettlementDetailResponse>;
      finalizeSettlement(storeId: string, id: string, token?: string): Promise<SponsorshipSettlementDetailResponse>;
      deleteSettlement(storeId: string, id: string, token?: string): Promise<void>;
      createCharge(storeId: string, settlementId: string, input: Omit<SponsorshipChargeCreateRequest, "settlementId">, token?: string): Promise<SponsorshipChargeDetailResponse>;
      createRefundAdjustment(storeId: string, settlementId: string, token?: string): Promise<{ data: SponsorshipCharge | null }>;
      listCharges(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<SponsorshipChargeListResponse>;
      getCharge(storeId: string, id: string, token?: string): Promise<SponsorshipChargeDetailResponse>;
      issueCharge(storeId: string, id: string, input: SponsorshipChargeIssueRequest, token?: string): Promise<SponsorshipChargeDetailResponse>;
      cancelCharge(storeId: string, id: string, input: SponsorshipChargeCancelRequest, token?: string): Promise<SponsorshipChargeDetailResponse>;
      exportCharges(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<string>;
      recordPayment(storeId: string, chargeId: string, input: SponsorshipPaymentCreateRequest, token?: string): Promise<SponsorshipPaymentDetailResponse>;
      listPayments(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<SponsorshipPaymentListResponse>;
      reversePayment(storeId: string, id: string, input: SponsorshipPaymentReverseRequest, token?: string): Promise<SponsorshipPaymentDetailResponse>;
      exportPayments(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<string>;
      dashboard(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<SponsorshipDashboardResponse>;
      // TODO-161A.2 (ADR-128/129) — birleşik ticari akış.
      listEligibleAgreements(storeId: string, sponsorId: string, token?: string): Promise<SponsorshipEligibleAgreementListResponse>;
      campaignCommercialSummary(storeId: string, campaignId: string, token?: string): Promise<SponsorshipCampaignCommercialSummaryResponse>;
      createFixedFeeCharge(storeId: string, agreementId: string, input: SponsorshipFixedFeeChargeRequest, token?: string): Promise<SponsorshipChargeDetailResponse>;
      createAdvance(storeId: string, agreementId: string, input: SponsorshipAdvanceCreateRequest, token?: string): Promise<SponsorshipAdvanceDetailResponse>;
      listAdvances(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<SponsorshipAdvanceListResponse>;
      listOpenCharges(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<SponsorshipOpenChargeListResponse>;
      allocateAdvance(storeId: string, input: SponsorshipAdvanceAllocationRequest, token?: string): Promise<SponsorshipAllocationDetailResponse>;
    };
    // TODO-161A.1 — Commercial automation operations (settlement scheduler + attribution retention).
    // Platform-admin auth, store-scoped. Retention APPLY (dryRun=false) is destructive.
    commercialAutomation: {
      getStatus(storeId: string, token?: string): Promise<CommercialAutomationStatusResponse>;
      runSettlementScheduler(storeId: string, input: CommercialAutomationRunRequest, token?: string): Promise<SettlementSchedulerRunResponse>;
      runRetention(storeId: string, input: CommercialAutomationRunRequest, token?: string): Promise<RetentionRunResponse>;
    };
    // TD-130 — Recommendation Measurement görünürlük özeti (platform-admin, store-scope; salt-okunur funnel).
    recommendations: {
      summary(storeId: string, token?: string, query?: Record<string, string | number | undefined>): Promise<RecommendationSummaryResponse>;
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
    // TODO-159F — Order Payment Recovery & Collection (mevcut sipariş tahsilatı).
    payments: {
      getOrderPayment(
        storeId: string,
        orderId: string,
        token?: string,
      ): Promise<OrderPaymentStateResponse>;
      createLink(
        storeId: string,
        orderId: string,
        input: CreatePaymentLinkRequest,
        token?: string,
      ): Promise<PaymentLinkResponse>;
      regenerateLink(
        storeId: string,
        orderId: string,
        input: CreatePaymentLinkRequest,
        token?: string,
      ): Promise<PaymentLinkResponse>;
      emailLink(
        storeId: string,
        orderId: string,
        input: SendPaymentLinkEmailRequest,
        token?: string,
      ): Promise<SendPaymentLinkEmailResponse>;
      recordManualPayment(
        storeId: string,
        orderId: string,
        input: RecordManualPaymentRequest,
        token?: string,
      ): Promise<PaymentRecoveryAttempt>;
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
      // TODO-162 — operatör manuel durum ilerletme (entegre süreç dışı teslim akışı).
      manualStatus(
        storeId: string,
        shipmentId: string,
        input: ShipmentStatusUpdateRequest,
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
   * TODO-160 — CSV/ham metin yanıtı (JSON değil). Attribution export ucu text/csv
   * döndürür; BFF bunu passthrough eder. Hata zarfı JSON ise ApiError'a çevrilir.
   */
  async function getText(path: string, token?: string): Promise<string> {
    const headers = new Headers();
    if (token) headers.set("authorization", `Bearer ${token}`);
    const response = await doFetch(`${baseUrl}${path}`, { headers });
    if (!response.ok) {
      let code = "UNKNOWN";
      let message = `API gateway request failed: ${path} (${response.status})`;
      try {
        const body: unknown = await response.json();
        if (isErrorEnvelope(body)) {
          if (typeof body.error.code === "string") code = body.error.code;
          if (typeof body.error.message === "string") message = body.error.message;
        }
      } catch {
        /* metin/boş gövde: status tabanlı genel hata. */
      }
      throw new ApiError(response.status, code, message);
    }
    return response.text();
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
      platformExtend: (token) =>
        sendJson<PlatformSessionExtendResponse>("/auth/platform/extend", "POST", undefined, token),
    },
    admin: {
      stores: {
        list: (token) => getJson<AdminStoreListResponse>("/admin/stores", token),
        create: (input, token) => sendJson<AdminStore>("/admin/stores", "POST", input, token),
        get: (id, token) => getJson<AdminStore>(`/admin/stores/${id}`, token),
        update: (id, input, token) =>
          sendJson<AdminStore>(`/admin/stores/${id}`, "PATCH", input, token),
        themeBinding: {
          get: (id, token) =>
            getJson<ThemeBindingResponse>(`/admin/stores/${id}/theme-binding`, token),
          assign: (id, input, token) =>
            sendJson<ThemeBindingResponse>(`/admin/stores/${id}/theme-binding`, "PUT", input, token),
        },
      },
      themeBindings: {
        list: (token) => getJson<ThemeBindingListResponse>("/admin/theme-bindings", token),
      },
      // TODO-164B Dilim 2 — Platform Theme Library / Designer / Rollout (SUPER_ADMIN).
      themeLibrary: {
        list: (token) => getJson<LibraryListResponse>("/admin/theme-library", token),
        create: (input, token) => sendJson<ThemeDetail>("/admin/theme-library", "POST", input, token),
        get: (themeId, token) => getJson<ThemeDetail>(`/admin/theme-library/${themeId}`, token),
        updateMeta: (themeId, input, token) =>
          sendJson<ThemeDetail>(`/admin/theme-library/${themeId}`, "PATCH", input, token),
        saveDraft: (themeId, input, token) =>
          sendJson<ThemeDetail>(`/admin/theme-library/${themeId}/draft`, "PUT", input, token),
        setPolicy: (themeId, input, token) =>
          sendJson<ThemeDetail>(`/admin/theme-library/${themeId}/policy`, "PUT", input, token),
        publish: (themeId, input, token) =>
          sendJson<ThemeDetail>(`/admin/theme-library/${themeId}/publish`, "POST", input, token),
        archive: (themeId, token) =>
          sendJson<ThemeDetail>(`/admin/theme-library/${themeId}/archive`, "POST", {}, token),
        duplicate: (themeId, input, token) =>
          sendJson<ThemeDetail>(`/admin/theme-library/${themeId}/duplicate`, "POST", input, token),
        rollback: (themeId, input, token) =>
          sendJson<ThemeDetail>(`/admin/theme-library/${themeId}/rollback`, "POST", input, token),
        previewToken: (themeId, input, token) =>
          sendJson<ThemePreviewTokenResponse>(
            `/admin/theme-library/${themeId}/preview-token`,
            "POST",
            input,
            token,
          ),
        stageAssets: (themeId, input, token) =>
          sendJson<ThemeDetail>(`/admin/theme-library/${themeId}/stage-assets`, "POST", input, token),
        diff: (themeId, query, token) =>
          getJson<ThemeChangeSummary>(
            `/admin/theme-library/${themeId}/diff${buildQueryString(query)}`,
            token,
          ),
        usage: (themeId, token) =>
          getJson<TemplateUsageResponse>(`/admin/theme-library/${themeId}/usage`, token),
        assignableStores: (token) =>
          getJson<AssignableStoresResponse>("/admin/theme-library/assignable-stores", token),
        assignPreview: (themeId, input, token) =>
          sendJson<ThemeAssignPreviewResponse>(
            `/admin/theme-library/${themeId}/assign/preview`,
            "POST",
            input,
            token,
          ),
        assign: (themeId, input, token) =>
          sendJson<RolloutSummaryResponse>(`/admin/theme-library/${themeId}/assign`, "POST", input, token),
        updateApply: (themeId, input, token) =>
          sendJson<RolloutSummaryResponse>(
            `/admin/theme-library/${themeId}/update/apply`,
            "POST",
            input,
            token,
          ),
      },
      plans: {
        list: (token) => getJson<PlanListResponse>("/admin/plans", token),
        create: (input, token) => sendJson<Plan>("/admin/plans", "POST", input, token),
        get: (id, token) => getJson<Plan>(`/admin/plans/${id}`, token),
        update: (id, input, token) =>
          sendJson<Plan>(`/admin/plans/${id}`, "PATCH", input, token),
        // TODO-163 Faz 3 (TD-154) — Plan → Capability editörü.
        capabilities: {
          get: (id, token) =>
            getJson<PlanCapabilitiesResponse>(`/admin/plans/${id}/capabilities`, token),
          preview: (id, input, token) =>
            sendJson<PlanCapabilityPreviewResponse>(
              `/admin/plans/${id}/capabilities/preview`,
              "POST",
              input,
              token,
            ),
          apply: (id, input, token) =>
            sendJson<PlanCapabilitiesResponse>(
              `/admin/plans/${id}/capabilities`,
              "PUT",
              input,
              token,
            ),
        },
      },
      // TODO-177 (ADR-289) — Ürün Desteği question-set yönetimi (/platform/support/*).
      support: {
        list: (token) =>
          getJson<PlatformSupportQuestionSetListResponse>("/platform/support/question-sets", token),
        create: (input, token) =>
          sendJson<PlatformSupportQuestionSetDetailResponse>(
            "/platform/support/question-sets",
            "POST",
            input,
            token,
          ),
        get: (id, token) =>
          getJson<PlatformSupportQuestionSetDetailResponse>(
            `/platform/support/question-sets/${id}`,
            token,
          ),
        update: (id, input, token) =>
          sendJson<PlatformSupportQuestionSetDetailResponse>(
            `/platform/support/question-sets/${id}`,
            "PATCH",
            input,
            token,
          ),
        createVersion: (id, input, token) =>
          sendJson<PlatformSupportQuestionSetDetailResponse>(
            `/platform/support/question-sets/${id}/versions`,
            "POST",
            input,
            token,
          ),
        editVersion: (versionId, input, token) =>
          sendJson<{ ok: boolean }>(
            `/platform/support/versions/${versionId}`,
            "PATCH",
            input,
            token,
          ),
        validateVersion: (versionId, token) =>
          sendJson<PlatformSupportGraphValidationResponse>(
            `/platform/support/versions/${versionId}/validate`,
            "POST",
            undefined,
            token,
          ),
        publishVersion: (versionId, token) =>
          sendJson<{ ok: boolean }>(
            `/platform/support/versions/${versionId}/publish`,
            "POST",
            undefined,
            token,
          ),
        archiveVersion: (versionId, token) =>
          sendJson<{ ok: boolean }>(
            `/platform/support/versions/${versionId}/archive`,
            "POST",
            undefined,
            token,
          ),
        upsertMapping: (storeId, input, token) =>
          sendJson<{ ok: boolean }>(
            `/platform/support/stores/${storeId}/mappings`,
            "PUT",
            input,
            token,
          ),
        deleteMapping: (storeId, input, token) =>
          sendJson<{ ok: boolean }>(
            `/platform/support/stores/${storeId}/mappings`,
            "DELETE",
            input,
            token,
          ),
        upsertTopicDefault: (input, token) =>
          sendJson<{ ok: boolean }>(`/platform/support/topic-defaults`, "PUT", input, token),
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
      // TODO-165 (ADR-249) — Beden tablosu (SizeChart) proxy'si. rollback body { revisionId };
      // assign body { scope, categoryId?, productId? }. Publish/rollback/archive/assign/unassign
      // güncel çizelgeyi ({ data }) döner.
      sizeCharts: {
        list: (storeId, token) =>
          getJson<SizeChartListResponse>(`/stores/${storeId}/size-charts`, token),
        get: (storeId, id, token) =>
          getJson<SizeChartResponse>(`/stores/${storeId}/size-charts/${id}`, token),
        create: (storeId, input, token) =>
          sendJson<SizeChartResponse>(`/stores/${storeId}/size-charts`, "POST", input, token),
        update: (storeId, id, input, token) =>
          sendJson<SizeChartResponse>(`/stores/${storeId}/size-charts/${id}`, "PATCH", input, token),
        publish: (storeId, id, token) =>
          sendJson<SizeChartResponse>(
            `/stores/${storeId}/size-charts/${id}/publish`,
            "POST",
            undefined,
            token,
          ),
        rollback: (storeId, id, revisionId, token) =>
          sendJson<SizeChartResponse>(
            `/stores/${storeId}/size-charts/${id}/rollback`,
            "POST",
            { revisionId },
            token,
          ),
        archive: (storeId, id, token) =>
          sendJson<SizeChartResponse>(
            `/stores/${storeId}/size-charts/${id}/archive`,
            "POST",
            undefined,
            token,
          ),
        assign: (storeId, id, input, token) =>
          sendJson<SizeChartResponse>(
            `/stores/${storeId}/size-charts/${id}/assignments`,
            "POST",
            input,
            token,
          ),
        unassign: (storeId, id, assignmentId, token) =>
          requestJson<SizeChartResponse>(
            `/stores/${storeId}/size-charts/${id}/assignments/${assignmentId}`,
            { method: "DELETE" },
            token,
          ),
        selector: (storeId, token, query) =>
          getJson<AdminSizeChartSelectorResponse>(
            `/stores/${storeId}/size-charts/selector${buildQueryString(query)}`,
            token,
          ),
        getProductAssignment: (storeId, productId, categoryId, token) =>
          getJson<ProductSizeChartAssignmentResponse>(
            `/stores/${storeId}/products/${productId}/size-chart-assignment${buildQueryString({ categoryId })}`,
            token,
          ),
      },
      // TODO-165A (ADR-165A) — Marka (Brand) proxy'si. selector `ids` verilirse cozum modu
      // (route katmani sirayi korur); list/selector query'si buildQueryString ile kurulur.
      brands: {
        list: (storeId, token, query) =>
          getJson<BrandListResponse>(`/stores/${storeId}/brands${buildQueryString(query)}`, token),
        selector: (storeId, token, query) =>
          getJson<AdminBrandSelectorResponse>(
            `/stores/${storeId}/brands/selector${buildQueryString(query)}`,
            token,
          ),
        create: (storeId, input, token) =>
          sendJson<BrandResponse>(`/stores/${storeId}/brands`, "POST", input, token),
        get: (storeId, brandId, token) =>
          getJson<BrandResponse>(`/stores/${storeId}/brands/${brandId}`, token),
        update: (storeId, brandId, input, token) =>
          sendJson<BrandResponse>(`/stores/${storeId}/brands/${brandId}`, "PATCH", input, token),
        archive: (storeId, brandId, token) =>
          sendJson<BrandResponse>(
            `/stores/${storeId}/brands/${brandId}/archive`,
            "POST",
            undefined,
            token,
          ),
        restore: (storeId, brandId, token) =>
          sendJson<BrandResponse>(
            `/stores/${storeId}/brands/${brandId}/restore`,
            "POST",
            undefined,
            token,
          ),
        products: (storeId, brandId, token, query) =>
          getJson<BrandProductsResponse>(
            `/stores/${storeId}/brands/${brandId}/products${buildQueryString(query)}`,
            token,
          ),
      },
      // TODO-166 (ADR-265) — Admin Slug & Redirect Management proxy'si (store-scoped).
      redirects: {
        list: (storeId, token, query) =>
          getJson<AdminRedirectListResponse>(
            `/stores/${storeId}/seo/redirects${buildQueryString(query)}`,
            token,
          ),
        get: (storeId, redirectId, token) =>
          getJson<AdminRedirectDetailResponse>(`/stores/${storeId}/seo/redirects/${redirectId}`, token),
        create: (storeId, input, token) =>
          sendJson<AdminRedirectResponse>(`/stores/${storeId}/seo/redirects`, "POST", input, token),
        update: (storeId, redirectId, input, token) =>
          sendJson<AdminRedirectResponse>(
            `/stores/${storeId}/seo/redirects/${redirectId}`,
            "PATCH",
            input,
            token,
          ),
        remove: (storeId, redirectId, token) =>
          sendJson<void>(`/stores/${storeId}/seo/redirects/${redirectId}`, "DELETE", undefined, token),
      },
      slugs: {
        list: (storeId, token, query) =>
          getJson<AdminSlugListResponse>(`/stores/${storeId}/seo/slugs${buildQueryString(query)}`, token),
        get: (storeId, entityType, entityId, token) =>
          getJson<AdminSlugDetailResponse>(
            `/stores/${storeId}/seo/slugs/${entityType}/${entityId}`,
            token,
          ),
      },
      // TODO-165A (ADR-165A) — Governed Product Taxonomy proxy'si. reorder body { type,
      // orderedIds } TAM-KUME kurali sunucuda dogrulanir (kismi kume 400 doner).
      productTaxonomy: {
        list: (storeId, token, query) =>
          getJson<ProductTaxonomyListResponse>(
            `/stores/${storeId}/product-taxonomy${buildQueryString(query)}`,
            token,
          ),
        get: (storeId, valueId, token) =>
          getJson<ProductTaxonomyResponse>(`/stores/${storeId}/product-taxonomy/${valueId}`, token),
        create: (storeId, input, token) =>
          sendJson<ProductTaxonomyResponse>(
            `/stores/${storeId}/product-taxonomy`,
            "POST",
            input,
            token,
          ),
        update: (storeId, valueId, input, token) =>
          sendJson<ProductTaxonomyResponse>(
            `/stores/${storeId}/product-taxonomy/${valueId}`,
            "PATCH",
            input,
            token,
          ),
        reorder: (storeId, input, token) =>
          sendJson<ProductTaxonomyListResponse>(
            `/stores/${storeId}/product-taxonomy/reorder`,
            "POST",
            input,
            token,
          ),
        archive: (storeId, valueId, token) =>
          sendJson<ProductTaxonomyResponse>(
            `/stores/${storeId}/product-taxonomy/${valueId}/archive`,
            "POST",
            undefined,
            token,
          ),
        restore: (storeId, valueId, token) =>
          sendJson<ProductTaxonomyResponse>(
            `/stores/${storeId}/product-taxonomy/${valueId}/restore`,
            "POST",
            undefined,
            token,
          ),
        delete: (storeId, valueId, token) =>
          sendJson<void>(`/stores/${storeId}/product-taxonomy/${valueId}`, "DELETE", undefined, token),
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
        // TODO-164A — Custom Theme Builder.
        duplicate: (storeId, themeId, input, token) =>
          sendJson<ThemeDetail>(
            `/stores/${storeId}/themes/${themeId}/duplicate`,
            "POST",
            input,
            token,
          ),
        archive: (storeId, themeId, token) =>
          sendJson<ThemeDetail>(`/stores/${storeId}/themes/${themeId}/archive`, "POST", {}, token),
        previewToken: (storeId, themeId, token) =>
          sendJson<ThemePreviewTokenResponse>(
            `/stores/${storeId}/themes/${themeId}/preview-token`,
            "POST",
            {},
            token,
          ),
        platformStatus: (storeId, token) =>
          getJson<PlatformThemeStatusResponse>(`/stores/${storeId}/theme/platform-status`, token),
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
        // TODO-160A (ADR-109…113) — SKU Generation & Governance.
        sku: {
          preview: (storeId, productId, input, token) =>
            sendJson<SkuPreviewResponse>(
              `/stores/${storeId}/products/${productId}/sku/preview`,
              "POST",
              input,
              token,
            ),
          regenerate: (storeId, productId, input, token) =>
            sendJson<SkuRegenerateResponse>(
              `/stores/${storeId}/products/${productId}/sku/regenerate`,
              "POST",
              input,
              token,
            ),
          validate: (storeId, input, token) =>
            sendJson<SkuValidateResponse>(`/stores/${storeId}/sku/validate`, "POST", input, token),
          audit: (storeId, limit, token) =>
            getJson<SkuAuditResponse>(
              `/stores/${storeId}/sku/audit${limit !== undefined ? `?limit=${limit}` : ""}`,
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
        storeMatrix: (storeId, token, query) =>
          getJson<InventoryStoreMatrixResponse>(
            `/stores/${storeId}/inventory/matrix${buildQueryString(query)}`,
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
      // TODO-169 (ADR-269) — İade yönetimi. Liste query'si allowlist gateway'de doğrulanır.
      returns: {
        list: (storeId, query, token) =>
          getJson<AdminRefundVisibilityListResponse>(
            `/stores/${storeId}/returns${buildQueryString(
              query as Record<string, string | number | undefined> | undefined,
            )}`,
            token,
          ),
        get: (storeId, returnId, token) =>
          getJson<AdminReturnDetailResponse>(`/stores/${storeId}/returns/${returnId}`, token),
        transition: (storeId, returnId, input, token) =>
          sendJson<AdminReturnDetailResponse>(
            `/stores/${storeId}/returns/${returnId}/transition`,
            "POST",
            input,
            token,
          ),
        reject: (storeId, returnId, input, token) =>
          sendJson<AdminReturnDetailResponse>(
            `/stores/${storeId}/returns/${returnId}/reject`,
            "POST",
            input,
            token,
          ),
        approve: (storeId, returnId, input, token) =>
          sendJson<AdminReturnDetailResponse>(
            `/stores/${storeId}/returns/${returnId}/approve`,
            "POST",
            input,
            token,
          ),
        inspect: (storeId, returnId, input, token) =>
          sendJson<AdminReturnDetailResponse>(
            `/stores/${storeId}/returns/${returnId}/inspect`,
            "POST",
            input,
            token,
          ),
        inspectDecision: (storeId, returnId, input, token) =>
          sendJson<AdminReturnDetailResponse>(
            `/stores/${storeId}/returns/${returnId}/inspect-decision`,
            "POST",
            input,
            token,
          ),
        fastRefund: (storeId, returnId, input, token) =>
          sendJson<AdminReturnDetailResponse>(
            `/stores/${storeId}/returns/${returnId}/fast-refund`,
            "POST",
            input,
            token,
          ),
        fastRefundContext: (storeId, returnId, token) =>
          getJson<AdminReturnFastRefundContextResponse>(
            `/stores/${storeId}/returns/${returnId}/fast-refund-context`,
            token,
          ),
        orderReturns: (storeId, orderId, token) =>
          getJson<AdminOrderReturnsResponse>(
            `/stores/${storeId}/orders/${orderId}/return-summary`,
            token,
          ),
        setDisposition: (storeId, returnId, input, token) =>
          sendJson<AdminReturnDetailResponse>(
            `/stores/${storeId}/returns/${returnId}/dispositions`,
            "POST",
            input,
            token,
          ),
        cancelDisposition: (storeId, returnId, dispositionId, input, token) =>
          sendJson<AdminReturnDetailResponse>(
            `/stores/${storeId}/returns/${returnId}/dispositions/${dispositionId}/cancel`,
            "POST",
            input,
            token,
          ),
        createReverseShipment: (storeId, returnId, input, token) =>
          sendJson<AdminReturnDetailResponse>(
            `/stores/${storeId}/returns/${returnId}/reverse-shipments`,
            "POST",
            input,
            token,
          ),
        reverseShipmentStatus: (storeId, returnId, shipmentId, input, token) =>
          sendJson<AdminReturnDetailResponse>(
            `/stores/${storeId}/returns/${returnId}/reverse-shipments/${shipmentId}/status`,
            "POST",
            input,
            token,
          ),
        reverseShipmentTracking: (storeId, returnId, shipmentId, input, token) =>
          sendJson<AdminReturnDetailResponse>(
            `/stores/${storeId}/returns/${returnId}/reverse-shipments/${shipmentId}/tracking`,
            "POST",
            input,
            token,
          ),
      },
      refunds: {
        returnContext: (storeId, returnId, token) =>
          getJson<AdminRefundContextResponse>(
            `/stores/${storeId}/returns/${returnId}/refund-context`,
            token,
          ),
        orderContext: (storeId, orderId, token) =>
          getJson<AdminRefundContextResponse>(
            `/stores/${storeId}/orders/${orderId}/refund-context`,
            token,
          ),
        initiate: (storeId, returnId, input, token) =>
          sendJson<AdminRefundResponse>(`/stores/${storeId}/returns/${returnId}/refund`, "POST", input, token),
        refresh: (storeId, refundId, token) =>
          sendJson<AdminRefundResponse>(`/stores/${storeId}/refunds/${refundId}/refresh`, "POST", undefined, token),
        retry: (storeId, refundId, input, token) =>
          sendJson<AdminRefundResponse>(`/stores/${storeId}/refunds/${refundId}/retry`, "POST", input, token),
        manualComplete: (storeId, refundId, input, token) =>
          sendJson<AdminRefundResponse>(
            `/stores/${storeId}/refunds/${refundId}/manual-complete`,
            "POST",
            input,
            token,
          ),
        cancel: (storeId, refundId, input, token) =>
          sendJson<AdminRefundResponse>(`/stores/${storeId}/refunds/${refundId}/cancel`, "POST", input, token),
      },
      // TODO-174B (ADR-283) — Order Experience Recovery Operations.
      orderExperience: {
        list: (storeId, token, query) =>
          getJson<ExperienceListResponse>(`/stores/${storeId}/order-experience${buildQueryString(query)}`, token),
        kpi: (storeId, token, query) =>
          getJson<ExperienceKpiDto>(`/stores/${storeId}/order-experience/kpi${buildQueryString(query)}`, token),
        caseDetail: (storeId, caseId, token) =>
          getJson<RecoveryCaseDetailDto>(`/stores/${storeId}/order-experience/cases/${caseId}`, token),
        action: (storeId, caseId, input, token) =>
          sendJson<RecoveryCaseDetailDto>(`/stores/${storeId}/order-experience/cases/${caseId}/actions`, "POST", input, token),
        openManual: (storeId, input, token) =>
          sendJson<RecoveryCaseDetailDto>(`/stores/${storeId}/order-experience/cases`, "POST", input, token),
        report: (storeId, token, query) =>
          getJson<RecoveryReportDto>(`/stores/${storeId}/order-experience/report${buildQueryString(query)}`, token),
        byOrder: (storeId, orderId, token) =>
          getJson<OrderExperienceSummaryDto | null>(`/stores/${storeId}/order-experience/orders/${orderId}`, token),
        assignableUsers: (storeId, token) =>
          getJson<AssignableUser[]>(`/stores/${storeId}/order-experience/assignable-users`, token),
      },
      // TODO-174B (ADR-281) — Customer Shopping Balance / Store Credit.
      customerCredit: {
        balance: (storeId, customerId, token, query) =>
          getJson<CustomerCreditBalanceResponse>(
            `/stores/${storeId}/customers/${customerId}/credit${buildQueryString(query)}`,
            token,
          ),
        issue: (storeId, customerId, input, token) =>
          sendJson<CustomerCreditBalanceResponse>(
            `/stores/${storeId}/customers/${customerId}/credit`,
            "POST",
            input,
            token,
          ),
        adjust: (storeId, customerId, input, token) =>
          sendJson<CustomerCreditBalanceResponse>(
            `/stores/${storeId}/customers/${customerId}/credit/adjust`,
            "POST",
            input,
            token,
          ),
      },
      pendingWork: {
        get: (storeId, token) =>
          getJson<PendingWorkSummary>(`/stores/${storeId}/pending-work-summary`, token),
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
        getListSummary: (storeId, customerId, token) =>
          getJson<StoreAdminCustomerListSummaryResponse>(
            `/stores/${storeId}/customers/${customerId}/list-summary`,
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
        deactivate: (storeId, customerId, token) =>
          sendJson<StoreAdminCustomerDeactivateResponse>(
            `/stores/${storeId}/customers/${customerId}/deactivate`,
            "POST",
            undefined,
            token,
          ),
        erasurePreview: (storeId, customerId, token) =>
          sendJson<StoreAdminCustomerErasurePreviewResponse>(
            `/stores/${storeId}/customers/${customerId}/erasure/preview`,
            "POST",
            undefined,
            token,
          ),
        erasureApply: (storeId, customerId, input, token) =>
          sendJson<StoreAdminCustomerErasureApplyResponse>(
            `/stores/${storeId}/customers/${customerId}/erasure/apply`,
            "POST",
            input,
            token,
          ),
        erasureStatus: (storeId, customerId, token) =>
          getJson<StoreAdminCustomerErasureStatusResponse>(
            `/stores/${storeId}/customers/${customerId}/erasure/status`,
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
      // TODO-159E (ADR-094) — Product Reviews moderasyonu.
      reviews: {
        list: (storeId, token, query) =>
          getJson<AdminReviewListResponse>(
            `/stores/${storeId}/reviews${buildQueryString(query)}`,
            token,
          ),
        get: (storeId, reviewId, token) =>
          getJson<AdminReviewDetailResponse>(`/stores/${storeId}/reviews/${reviewId}`, token),
        moderate: (storeId, reviewId, input, token) =>
          sendJson<ReviewModerateResponse>(
            `/stores/${storeId}/reviews/${reviewId}/moderate`,
            "POST",
            input,
            token,
          ),
      },
      // TODO-163 (ADR-208…ADR-210) — Tenant Module & Capability Management.
      modules: {
        list: (storeId, token) =>
          getJson<StoreModulesResponse>(`/stores/${storeId}/modules`, token),
        setOverride: (storeId, moduleKey, state, token) =>
          sendJson<StoreModulesResponse>(
            `/stores/${storeId}/modules/${moduleKey}`,
            "PUT",
            { state },
            token,
          ),
      },
      // TODO-160 (ADR-102…107) — Influencer Tracking & Attribution.
      influencers: {
        list: (storeId, token, query) =>
          getJson<InfluencerListResponse>(`/stores/${storeId}/influencers${buildQueryString(query)}`, token),
        get: (storeId, influencerId, token) =>
          getJson<InfluencerDetailResponse>(`/stores/${storeId}/influencers/${influencerId}`, token),
        create: (storeId, input, token) =>
          sendJson<InfluencerDetailResponse>(`/stores/${storeId}/influencers`, "POST", input, token),
        update: (storeId, influencerId, input, token) =>
          sendJson<InfluencerDetailResponse>(`/stores/${storeId}/influencers/${influencerId}`, "PATCH", input, token),
        listCampaigns: (storeId, token, query) =>
          getJson<InfluencerCampaignListResponse>(`/stores/${storeId}/influencer-campaigns${buildQueryString(query)}`, token),
        getCampaign: (storeId, campaignId, token) =>
          getJson<InfluencerCampaignDetailResponse>(`/stores/${storeId}/influencer-campaigns/${campaignId}`, token),
        createCampaign: (storeId, input, token) =>
          sendJson<InfluencerCampaignDetailResponse>(`/stores/${storeId}/influencer-campaigns`, "POST", input, token),
        updateCampaign: (storeId, campaignId, input, token) =>
          sendJson<InfluencerCampaignDetailResponse>(`/stores/${storeId}/influencer-campaigns/${campaignId}`, "PATCH", input, token),
        listLinks: (storeId, token, query) =>
          getJson<TrackingLinkListResponse>(`/stores/${storeId}/influencer-tracking-links${buildQueryString(query)}`, token),
        getLink: (storeId, linkId, token) =>
          getJson<TrackingLinkDetailResponse>(`/stores/${storeId}/influencer-tracking-links/${linkId}`, token),
        createLink: (storeId, input, token) =>
          sendJson<TrackingLinkCreateResponse>(`/stores/${storeId}/influencer-tracking-links`, "POST", input, token),
        updateLink: (storeId, linkId, input, token) =>
          sendJson<TrackingLinkDetailResponse>(`/stores/${storeId}/influencer-tracking-links/${linkId}`, "PATCH", input, token),
        regenerateLink: (storeId, linkId, token) =>
          sendJson<TrackingLinkCreateResponse>(`/stores/${storeId}/influencer-tracking-links/${linkId}/regenerate`, "POST", undefined, token),
        analytics: (storeId, token, query) =>
          getJson<InfluencerAnalyticsResponse>(`/stores/${storeId}/influencer-analytics${buildQueryString(query)}`, token),
        exportAnalytics: (storeId, token, query) =>
          getText(`/stores/${storeId}/influencer-analytics/export${buildQueryString(query)}`, token),
        aggregateAnalytics: (storeId, influencerId, token, query) =>
          getJson<InfluencerAggregateAnalyticsResponse>(`/stores/${storeId}/influencers/${influencerId}/analytics${buildQueryString(query)}`, token),
        campaignAnalytics: (storeId, campaignId, token, query) =>
          getJson<CampaignAnalyticsResponse>(`/stores/${storeId}/influencer-campaigns/${campaignId}/analytics${buildQueryString(query)}`, token),
        linkAnalytics: (storeId, linkId, token, query) =>
          getJson<LinkAnalyticsResponse>(`/stores/${storeId}/influencer-tracking-links/${linkId}/analytics${buildQueryString(query)}`, token),
      },
      // ADR-268 — Financial Reporting Foundation (Finans > Raporlar).
      finance: {
        summary: (storeId, token, query) =>
          getJson<FinanceSummaryResponse>(`/stores/${storeId}/finance/summary${buildQueryString(query)}`, token),
        breakdowns: (storeId, token, query) =>
          getJson<FinanceBreakdownsResponse>(`/stores/${storeId}/finance/breakdowns${buildQueryString(query)}`, token),
        payments: (storeId, token, query) =>
          getJson<FinancePaymentReportResponse>(`/stores/${storeId}/finance/payments${buildQueryString(query)}`, token),
        discounts: (storeId, token, query) =>
          getJson<FinanceDiscountReportResponse>(`/stores/${storeId}/finance/discounts${buildQueryString(query)}`, token),
        exportSummary: (storeId, token, query) =>
          getText(`/stores/${storeId}/finance/summary/export${buildQueryString(query)}`, token),
        exportProducts: (storeId, token, query) =>
          getText(`/stores/${storeId}/finance/products/export${buildQueryString(query)}`, token),
        exportOrders: (storeId, token, query) =>
          getText(`/stores/${storeId}/finance/orders/export${buildQueryString(query)}`, token),
        exportPayments: (storeId, token, query) =>
          getText(`/stores/${storeId}/finance/payments/export${buildQueryString(query)}`, token),
        exportDiscounts: (storeId, token, query) =>
          getText(`/stores/${storeId}/finance/discounts/export${buildQueryString(query)}`, token),
        // TODO-174 (ADR-275) — İptal raporu (yalnız görüntüleme; taksonomi CRUD yok).
        cancellations: (storeId, token, query) =>
          getJson<CancellationReportResponse>(`/stores/${storeId}/reports/cancellations${buildQueryString(query)}`, token),
        // TD-174B-2 — Alışveriş bakiyesi (store credit) finansal raporu.
        creditReport: (storeId, token, query) =>
          getJson<CreditReportDto>(`/stores/${storeId}/finance/credit-report${buildQueryString(query)}`, token),
      },
      // Shopping Balance Admin (Müşteri Bakiye Yönetimi).
      shoppingBalance: {
        list: (storeId, token, query) =>
          getJson<ShoppingBalanceListResponse>(`/stores/${storeId}/shopping-balance${buildQueryString(query)}`, token),
        detail: (storeId, customerId, token) =>
          getJson<ShoppingBalanceDetailDto>(`/stores/${storeId}/shopping-balance/${customerId}`, token),
      },
      // TODO-161 (ADR-114…120) — Sponsored Product Management.
      sponsoredProducts: {
        list: (storeId, token, query) =>
          getJson<SponsoredCampaignListResponse>(`/stores/${storeId}/sponsored-campaigns${buildQueryString(query)}`, token),
        get: (storeId, campaignId, token) =>
          getJson<SponsoredCampaignDetailResponse>(`/stores/${storeId}/sponsored-campaigns/${campaignId}`, token),
        create: (storeId, input, token) =>
          sendJson<SponsoredCampaignDetailResponse>(`/stores/${storeId}/sponsored-campaigns`, "POST", input, token),
        update: (storeId, campaignId, input, token) =>
          sendJson<SponsoredCampaignDetailResponse>(`/stores/${storeId}/sponsored-campaigns/${campaignId}`, "PATCH", input, token),
        analytics: (storeId, token, query) =>
          getJson<SponsoredAnalyticsResponse>(`/stores/${storeId}/sponsored-analytics${buildQueryString(query)}`, token),
        exportAnalytics: (storeId, token, query) =>
          getText(`/stores/${storeId}/sponsored-analytics/export${buildQueryString(query)}`, token),
      },
      // TODO-161A (ADR-121…127) — Sponsorship Agreements, Billing & Settlement.
      sponsorship: {
        listSponsors: (storeId, token, query) =>
          getJson<SponsorAccountListResponse>(`/stores/${storeId}/sponsors${buildQueryString(query)}`, token),
        getSponsor: (storeId, id, token) => getJson<SponsorAccountDetailResponse>(`/stores/${storeId}/sponsors/${id}`, token),
        createSponsor: (storeId, input, token) => sendJson<SponsorAccountDetailResponse>(`/stores/${storeId}/sponsors`, "POST", input, token),
        updateSponsor: (storeId, id, input, token) => sendJson<SponsorAccountDetailResponse>(`/stores/${storeId}/sponsors/${id}`, "PATCH", input, token),
        listAgreements: (storeId, token, query) =>
          getJson<SponsorshipAgreementListResponse>(`/stores/${storeId}/sponsorship-agreements${buildQueryString(query)}`, token),
        getAgreement: (storeId, id, token) => getJson<SponsorshipAgreementDetailResponse>(`/stores/${storeId}/sponsorship-agreements/${id}`, token),
        createAgreement: (storeId, input, token) => sendJson<SponsorshipAgreementDetailResponse>(`/stores/${storeId}/sponsorship-agreements`, "POST", input, token),
        updateAgreement: (storeId, id, input, token) => sendJson<SponsorshipAgreementDetailResponse>(`/stores/${storeId}/sponsorship-agreements/${id}`, "PATCH", input, token),
        linkCampaign: (storeId, agreementId, input, token) =>
          sendJson<SponsorshipAgreementDetailResponse>(`/stores/${storeId}/sponsorship-agreements/${agreementId}/campaigns`, "POST", input, token),
        unlinkCampaign: (storeId, agreementId, campaignId, token) =>
          sendJson<SponsorshipAgreementDetailResponse>(`/stores/${storeId}/sponsorship-agreements/${agreementId}/campaigns/${campaignId}`, "DELETE", undefined, token),
        previewSettlement: (storeId, agreementId, input, token) =>
          sendJson<SponsorshipSettlementDetailResponse>(`/stores/${storeId}/sponsorship-agreements/${agreementId}/settlements/preview`, "POST", input, token),
        listSettlements: (storeId, token, query) =>
          getJson<SponsorshipSettlementListResponse>(`/stores/${storeId}/sponsorship-settlements${buildQueryString(query)}`, token),
        getSettlement: (storeId, id, token) => getJson<SponsorshipSettlementDetailResponse>(`/stores/${storeId}/sponsorship-settlements/${id}`, token),
        finalizeSettlement: (storeId, id, token) =>
          sendJson<SponsorshipSettlementDetailResponse>(`/stores/${storeId}/sponsorship-settlements/${id}/finalize`, "POST", undefined, token),
        deleteSettlement: (storeId, id, token) =>
          requestJson<void>(`/stores/${storeId}/sponsorship-settlements/${id}`, { method: "DELETE" }, token),
        createCharge: (storeId, settlementId, input, token) =>
          sendJson<SponsorshipChargeDetailResponse>(`/stores/${storeId}/sponsorship-settlements/${settlementId}/charge`, "POST", input, token),
        createRefundAdjustment: (storeId, settlementId, token) =>
          sendJson<{ data: SponsorshipCharge | null }>(`/stores/${storeId}/sponsorship-settlements/${settlementId}/refund-adjustment`, "POST", undefined, token),
        listCharges: (storeId, token, query) =>
          getJson<SponsorshipChargeListResponse>(`/stores/${storeId}/sponsorship-charges${buildQueryString(query)}`, token),
        getCharge: (storeId, id, token) => getJson<SponsorshipChargeDetailResponse>(`/stores/${storeId}/sponsorship-charges/${id}`, token),
        issueCharge: (storeId, id, input, token) =>
          sendJson<SponsorshipChargeDetailResponse>(`/stores/${storeId}/sponsorship-charges/${id}/issue`, "POST", input, token),
        cancelCharge: (storeId, id, input, token) =>
          sendJson<SponsorshipChargeDetailResponse>(`/stores/${storeId}/sponsorship-charges/${id}/cancel`, "POST", input, token),
        exportCharges: (storeId, token, query) =>
          getText(`/stores/${storeId}/sponsorship-charges/export${buildQueryString(query)}`, token),
        recordPayment: (storeId, chargeId, input, token) =>
          sendJson<SponsorshipPaymentDetailResponse>(`/stores/${storeId}/sponsorship-charges/${chargeId}/payments`, "POST", input, token),
        listPayments: (storeId, token, query) =>
          getJson<SponsorshipPaymentListResponse>(`/stores/${storeId}/sponsorship-payments${buildQueryString(query)}`, token),
        reversePayment: (storeId, id, input, token) =>
          sendJson<SponsorshipPaymentDetailResponse>(`/stores/${storeId}/sponsorship-payments/${id}/reverse`, "POST", input, token),
        exportPayments: (storeId, token, query) =>
          getText(`/stores/${storeId}/sponsorship-payments/export${buildQueryString(query)}`, token),
        dashboard: (storeId, token, query) =>
          getJson<SponsorshipDashboardResponse>(`/stores/${storeId}/sponsorship-dashboard${buildQueryString(query)}`, token),
        // TODO-161A.2 (ADR-128/129) — birleşik ticari akış.
        listEligibleAgreements: (storeId, sponsorId, token) =>
          getJson<SponsorshipEligibleAgreementListResponse>(`/stores/${storeId}/sponsors/${sponsorId}/eligible-agreements`, token),
        campaignCommercialSummary: (storeId, campaignId, token) =>
          getJson<SponsorshipCampaignCommercialSummaryResponse>(`/stores/${storeId}/sponsored-campaigns/${campaignId}/commercial-summary`, token),
        createFixedFeeCharge: (storeId, agreementId, input, token) =>
          sendJson<SponsorshipChargeDetailResponse>(`/stores/${storeId}/sponsorship-agreements/${agreementId}/fixed-fee-charge`, "POST", input, token),
        createAdvance: (storeId, agreementId, input, token) =>
          sendJson<SponsorshipAdvanceDetailResponse>(`/stores/${storeId}/sponsorship-agreements/${agreementId}/advances`, "POST", input, token),
        listAdvances: (storeId, token, query) =>
          getJson<SponsorshipAdvanceListResponse>(`/stores/${storeId}/sponsorship-advances${buildQueryString(query)}`, token),
        listOpenCharges: (storeId, token, query) =>
          getJson<SponsorshipOpenChargeListResponse>(`/stores/${storeId}/sponsorship-open-charges${buildQueryString(query)}`, token),
        allocateAdvance: (storeId, input, token) =>
          sendJson<SponsorshipAllocationDetailResponse>(`/stores/${storeId}/sponsorship-advance-allocations`, "POST", input, token),
      },
      // TODO-161A.1 — Commercial automation operations (settlement scheduler + attribution retention).
      commercialAutomation: {
        getStatus: (storeId, token) =>
          getJson<CommercialAutomationStatusResponse>(`/stores/${storeId}/commercial-automation/status`, token),
        runSettlementScheduler: (storeId, input, token) =>
          sendJson<SettlementSchedulerRunResponse>(`/stores/${storeId}/commercial-automation/settlement-scheduler/run`, "POST", input, token),
        runRetention: (storeId, input, token) =>
          sendJson<RetentionRunResponse>(`/stores/${storeId}/commercial-automation/retention/run`, "POST", input, token),
      },
      // TD-130 — Recommendation Measurement görünürlük özeti.
      recommendations: {
        summary: (storeId, token, query) =>
          getJson<RecommendationSummaryResponse>(`/stores/${storeId}/recommendation-events/summary${buildQueryString(query)}`, token),
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
      payments: {
        getOrderPayment: (storeId, orderId, token) =>
          getJson<OrderPaymentStateResponse>(`/stores/${storeId}/orders/${orderId}/payment`, token),
        createLink: (storeId, orderId, input, token) =>
          sendJson<PaymentLinkResponse>(
            `/stores/${storeId}/orders/${orderId}/payment-link`,
            "POST",
            input,
            token,
          ),
        regenerateLink: (storeId, orderId, input, token) =>
          sendJson<PaymentLinkResponse>(
            `/stores/${storeId}/orders/${orderId}/payment-link/regenerate`,
            "POST",
            input,
            token,
          ),
        emailLink: (storeId, orderId, input, token) =>
          sendJson<SendPaymentLinkEmailResponse>(
            `/stores/${storeId}/orders/${orderId}/payment-link/email`,
            "POST",
            input,
            token,
          ),
        recordManualPayment: (storeId, orderId, input, token) =>
          sendJson<PaymentRecoveryAttempt>(
            `/stores/${storeId}/orders/${orderId}/manual-payment`,
            "POST",
            input,
            token,
          ),
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
        // TODO-162 — operatör manuel durum ilerletme.
        manualStatus: (storeId, shipmentId, input, token) =>
          sendJson<ShippingShipmentMutationResponse>(
            `/stores/${storeId}/shipping/shipments/${shipmentId}/status`,
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
