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
  InventoryAdjustRequest,
  InventoryAdjustmentResponse,
  InventoryListResponse,
  Order,
  OrderCancelRequest,
  OrderCreateRequest,
  OrderListQuery,
  OrderListResponse,
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
  SendPaymentLinkEmailRequest,
  SendPaymentLinkEmailResponse,
  PaymentRecoveryAttempt,
  CreatePaymentLinkRequest,
  RecordManualPaymentRequest,
  PlatformMeResponse,
  PlatformUserContract,
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
  StoreSettings,
  StoreSettingsUpdateRequest,
  ProductCreateRequest,
  ProductListResponse,
  AdminProductFilterOptionsResponse,
  ProductPriceChangeListResponse,
  ProductUpdateRequest,
  ProductVariant,
  ProductVariantCreateRequest,
  ProductVariantListResponse,
  ProductVariantUpdateRequest,
  ProductAttributeValueListResponse,
  ProductVariantSelectionListResponse,
  VariantCombinationPreviewResponse,
  VariantGenerationResponse,
  IdentityApplyRequest,
  IdentityApplyResponse,
  IdentityPreviewResponse,
  CommercialPreviewResponse,
  CommercialPreviewRequest,
  CommercialApplyRequest,
  CommercialApplyResponse,
  InventoryPreviewResponse,
  InventoryPreviewRequest,
  InventoryApplyRequest,
  InventoryApplyResponse,
  InventoryWarehouseListResponse,
  InventoryStoreMatrixResponse,
  StoreAdminCustomerListResponse,
  StoreAdminCustomerDetailResponse,
  StoreAdminCustomerListSummaryResponse,
  AdminReviewListResponse,
  AdminReviewDetailResponse,
  ReviewModerateRequest,
  ReviewModerateResponse,
  StoreAdminCustomerUpdateRequest,
  StoreAdminCustomerCreateRequest,
  StoreAdminCustomerSummary,
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
  ShippingWebhookInfoResponse,
  ShippingWebhookRotateResponse,
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
  // F4A — Kampanya/kupon yönetimi (ADR-058).
  CampaignResponse,
  CampaignListResponse,
  CampaignDetailResponse,
  CampaignCreateRequest,
  CampaignUpdateRequest,
  CouponAssignmentRequest,
  CustomerCouponAssignment,
  CustomerCouponAssignmentListResponse,
  // ADR-065 Faz 2 (Dilim 1) — Media kutuphanesi.
  MediaContext,
  MediaListResponse,
  MediaUploadResponse,
  // TODO-159B (ADR-090) — Admin Searchable Selector yanıt tipleri.
  AdminProductSelectorResponse,
  AdminCategorySelectorResponse,
} from "@commerce-os/api-client";

/**
 * Tarayici -> ayni-origin BFF (/api/*) istemcisi. Gateway'e dogrudan gitmez
 * (CORS/secret yok); tum cagrilar store-admin-web route handler'lari uzerinden
 * gecer ve secili mağaza bağlami server-side cozulur. Hata durumunda makine-okunur
 * `code` tasiyan {@link UiError} firlatir.
 */
/**
 * Bir BFF hatasinin yapilandirilmis ek verisi (gateway `error.details`'ten tasinir).
 * ADR-065: MEDIA_IN_USE 409'unda `usedIn` gorselin hangi tablolarda kullanildigini verir.
 */
export interface UiErrorDetails {
  usedIn?: string[];
  // Faz 2B (TODO-146) — attribute değer hatalarını doğru form alanına bağlamak için
  // backend `error.details.attributeDefinitionId` taşınır (gömülü product create/update
  // akışı; dedike PUT üst-seviye taşır ama bu UI gömülü akışı kullanır).
  attributeDefinitionId?: string;
}

export class UiError extends Error {
  readonly code: string;
  readonly details?: UiErrorDetails;
  constructor(code: string, details?: UiErrorDetails) {
    super(code);
    this.name = "UiError";
    this.code = code;
    this.details = details;
  }
}

export type StoreUser = PlatformUserContract;

export interface StoreContext {
  id: string;
  name: string;
  slug: string;
  status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "CLOSED";
}

export interface DashboardSummary {
  store: StoreContext;
  products: { total: number; active: number };
  categories: { total: number };
  inventory: { records: number; lowStock: number; totalOnHand: number };
}

/**
 * TODO-087 — BFF'in döndürdüğü TEK SEFERLİK aktivasyon/parola-sıfırlama linki.
 * `link` raw token'ı içerir; UI'da bir kez gösterilir, tekrar çağrılamaz.
 */
export interface ActivationInfo {
  link: string;
  purpose: "ADMIN_ACTIVATION" | "ADMIN_PASSWORD_RESET";
  expiresAt: string;
}

export interface CreateCustomerResult {
  customer: StoreAdminCustomerSummary;
  activation: ActivationInfo | null;
}

/**
 * TODO-159A (ADR-089) — Admin Data Grid liste query'si. Anahtarlar BFF allowlist'i
 * ile aynıdır; boş/undefined değerler URL'e yazılmaz.
 */
export type AdminListRequestQuery = Record<string, string | number | undefined>;

function listQueryString(query?: AdminListRequestQuery): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

let csrfTokenCache: { token: string; headerName: string } | null = null;

export function resetCsrfTokenCacheForTest(): void {
  csrfTokenCache = null;
}

async function csrfHeaders(): Promise<Record<string, string>> {
  if (!csrfTokenCache) {
    let response: Response;
    try {
      response = await fetch("/api/auth/csrf");
    } catch {
      throw new UiError("NETWORK");
    }
    if (!response.ok) {
      throw new UiError("CSRF_TOKEN_INVALID");
    }
    const body = (await response.json()) as { csrfToken?: unknown; headerName?: unknown };
    if (typeof body.csrfToken !== "string" || typeof body.headerName !== "string") {
      throw new UiError("CSRF_TOKEN_INVALID");
    }
    csrfTokenCache = { token: body.csrfToken, headerName: body.headerName };
  }
  return { [csrfTokenCache.headerName]: csrfTokenCache.token };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    // FormData govdesinde content-type'i SET ETMEYIZ: tarayici multipart boundary'yi
    // kendisi ekler (ADR-065 media upload). Diger govdeler icin JSON zorlanir.
    const isForm = init?.body instanceof FormData;
    response = await fetch(path, {
      ...init,
      headers: isForm
        ? { ...(init?.headers ?? {}) }
        : { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new UiError("NETWORK");
  }

  if (!response.ok) {
    let code = "UNKNOWN";
    let details: UiErrorDetails | undefined;
    try {
      const body: unknown = await response.json();
      const errorObj =
        typeof body === "object" && body !== null && "error" in body
          ? (body as {
              error?: {
                code?: unknown;
                details?: { usedIn?: unknown; attributeDefinitionId?: unknown };
              };
            }).error
          : undefined;
      if (typeof errorObj?.code === "string") {
        code = errorObj.code;
      }
      // Structured details (ADR-065 MEDIA_IN_USE → usedIn: string[]).
      const usedIn = errorObj?.details?.usedIn;
      if (Array.isArray(usedIn) && usedIn.every((entry) => typeof entry === "string")) {
        details = { ...details, usedIn: usedIn as string[] };
      }
      // Faz 2B (TODO-146) — attribute değer hatası hangi attribute'a ait (alan eşlemesi).
      const attributeDefinitionId = errorObj?.details?.attributeDefinitionId;
      if (typeof attributeDefinitionId === "string") {
        details = { ...details, attributeDefinitionId };
      }
    } catch {
      // Govde JSON degil — genel UNKNOWN kodu kullanilir.
    }
    throw new UiError(code, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function mutatingCall<T>(path: string, init: RequestInit): Promise<T> {
  const headers = await csrfHeaders();
  return call<T>(path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
}

/**
 * TODO-073 — Sipariş filtre query string'i. Yalnız tanımlı/boş-olmayan filtreler
 * eklenir. Çıktı baştaki `?` ile gelir veya boştur.
 */
export function orderListQueryString(query?: OrderListQuery): string {
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
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

/** F3C.5 (TODO-121) — shipment liste filtre sorgu dizesi (boş/undefined atlanır). */
function shipmentListQuery(query?: ShipmentListQuery): string {
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

// TODO-150 (ADR-073) — Identity preview query-string (pattern'lar + seqStart + regenerate).
function identityQueryString(query: IdentityApplyRequest): string {
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

export const storeApi = {
  // Auth / session
  login: (email: string, password: string) =>
    call<{ user: StoreUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => call<PlatformMeResponse>("/api/auth/me"),
  logout: () => mutatingCall<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  // Store context
  storeContext: () => call<{ store: StoreContext }>("/api/store/context"),

  // Dashboard
  dashboardSummary: () => call<DashboardSummary>("/api/dashboard/summary"),

  // Categories
  // TODO-159A (ADR-089) — Data Grid query'si (page/pageSize/search/sortBy/sortOrder/status).
  // Argümansız çağrı ESKİ davranıştır (gateway varsayılanları).
  listCategories: (query?: AdminListRequestQuery) =>
    call<ProductCategoryListResponse>(`/api/catalog/categories${listQueryString(query)}`),
  // TODO-159B (ADR-090) — Kategori seçici ucu. `ids` verilirse çözüm modudur
  // (seçili kayıt arama/sayfa dışında kalsa bile döner).
  listCategorySelector: (query?: AdminListRequestQuery) =>
    call<AdminCategorySelectorResponse>(
      `/api/catalog/categories/selector${listQueryString(query)}`,
    ),
  createCategory: (input: ProductCategoryCreateRequest) =>
    mutatingCall<ProductCategory>("/api/catalog/categories", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateCategory: (categoryId: string, input: ProductCategoryUpdateRequest) =>
    mutatingCall<ProductCategory>(`/api/catalog/categories/${categoryId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  // Faz 1B (ADR-067) — Attribute katalog cekirdegi (tanim + grup + secenek).
  listAttributes: () => call<AttributeDefinitionListResponse>("/api/catalog/attributes"),
  createAttribute: (input: AttributeDefinitionCreateRequest) =>
    mutatingCall<AttributeDefinition>("/api/catalog/attributes", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateAttribute: (attributeId: string, input: AttributeDefinitionUpdateRequest) =>
    mutatingCall<AttributeDefinition>(`/api/catalog/attributes/${attributeId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  listAttributeOptions: (attributeId: string) =>
    call<AttributeOptionListResponse>(`/api/catalog/attributes/${attributeId}/options`),
  createAttributeOption: (attributeId: string, input: AttributeOptionCreateRequest) =>
    mutatingCall<AttributeOption>(`/api/catalog/attributes/${attributeId}/options`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateAttributeOption: (
    attributeId: string,
    optionId: string,
    input: AttributeOptionUpdateRequest,
  ) =>
    mutatingCall<AttributeOption>(`/api/catalog/attributes/${attributeId}/options/${optionId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  listAttributeGroups: () => call<AttributeGroupListResponse>("/api/catalog/attribute-groups"),
  createAttributeGroup: (input: AttributeGroupCreateRequest) =>
    mutatingCall<AttributeGroup>("/api/catalog/attribute-groups", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateAttributeGroup: (groupId: string, input: AttributeGroupUpdateRequest) =>
    mutatingCall<AttributeGroup>(`/api/catalog/attribute-groups/${groupId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  // Faz 1B (ADR-067) — Kategori-attribute davranis baglama (tek sahip).
  listCategoryAttributes: (categoryId: string) =>
    call<CategoryAttributeListResponse>(`/api/catalog/categories/${categoryId}/attributes`),
  createCategoryAttribute: (categoryId: string, input: CategoryAttributeCreateRequest) =>
    mutatingCall<CategoryAttribute>(`/api/catalog/categories/${categoryId}/attributes`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateCategoryAttribute: (
    categoryId: string,
    categoryAttributeId: string,
    input: CategoryAttributeUpdateRequest,
  ) =>
    mutatingCall<CategoryAttribute>(
      `/api/catalog/categories/${categoryId}/attributes/${categoryAttributeId}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
  removeCategoryAttribute: (categoryId: string, categoryAttributeId: string) =>
    mutatingCall<void>(
      `/api/catalog/categories/${categoryId}/attributes/${categoryAttributeId}`,
      { method: "DELETE" },
    ),

  // Products
  // TODO-159A (ADR-089) — server-side arama/filtre/sıralama/sayfalama.
  listProducts: (query?: AdminListRequestQuery) =>
    call<ProductListResponse>(`/api/catalog/products${listQueryString(query)}`),
  // TODO-159B (ADR-090) — Ürün seçici ucu (hafif projeksiyon + `ids` çözüm modu).
  listProductSelector: (query?: AdminListRequestQuery) =>
    call<AdminProductSelectorResponse>(`/api/catalog/products/selector${listQueryString(query)}`),
  // Filtre açılırlarının DISTINCT marka/tedarikçi kaynağı (liste sayfalandığı için
  // istemcide türetilemez).
  listProductFilterOptions: () =>
    call<AdminProductFilterOptionsResponse>("/api/catalog/products/filter-options"),
  getProduct: (productId: string) =>
    call<Product>(`/api/catalog/products/${productId}`),
  createProduct: (input: ProductCreateRequest) =>
    mutatingCall<Product>("/api/catalog/products", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateProduct: (productId: string, input: ProductUpdateRequest) =>
    mutatingCall<Product>(`/api/catalog/products/${productId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  // Faz 2B (TODO-146) — düzenleme ekranında mevcut attribute DEĞERLERİNİ okur
  // (round-trip). Yazma gömülü product create/update `attributeValues` ile gider.
  getProductAttributeValues: (productId: string) =>
    call<ProductAttributeValueListResponse>(
      `/api/catalog/products/${productId}/attribute-values`,
    ),
  // Faz 2C-1 (ADR-070) — düzenleme ekranında mevcut varyant EKSEN seçimini okur
  // (round-trip). Yazma gömülü product create/update `variantSelections` ile gider.
  getProductVariantSelections: (productId: string) =>
    call<ProductVariantSelectionListResponse>(
      `/api/catalog/products/${productId}/variant-selections`,
    ),
  // Faz 2C-2 (ADR-071) — düzenleme ekranında ürünün kalıcı eksen reçetesinden ÜRETİLECEK
  // varyant kombinasyonlarının ÖNİZLEMESİNİ okur (yalnız okuma; ProductVariant/SKU ÜRETMEZ).
  getVariantCombinationPreview: (productId: string) =>
    call<VariantCombinationPreviewResponse>(
      `/api/catalog/products/${productId}/variant-combinations/preview`,
    ),
  // Faz 2C-3 (ADR-072) — kalıcı varyant ÜRETİMİ (persistence). Gövdesiz POST; sunucu reçeteden
  // hedef kombinasyonları üretip mevcut varyantlarla diff'ler (create/keep/restore/archive).
  generateVariantCombinations: (productId: string) =>
    call<VariantGenerationResponse>(
      `/api/catalog/products/${productId}/variant-combinations/generate`,
      { method: "POST" },
    ),
  // TODO-150 (ADR-073) — Identity Management Engine. Preview yalnız-okuma + deterministik; apply
  // server-authoritative (yalnız değişen varyantları tek transaction'da yazar). Pattern query'de taşınır.
  getIdentityPreview: (productId: string, query: IdentityApplyRequest) =>
    call<IdentityPreviewResponse>(
      `/api/catalog/products/${productId}/identity/preview${identityQueryString(query)}`,
    ),
  applyIdentity: (productId: string, input: IdentityApplyRequest) =>
    mutatingCall<IdentityApplyResponse>(`/api/catalog/products/${productId}/identity/apply`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // TODO-151 (ADR-074) — Commercial Engine. Matris okuma + rule/direct-edit preview (yalnız-okuma) +
  // server-authoritative apply (stale-guard + yalnız değişen alanları tek transaction'da yazar).
  getCommercialMatrix: (productId: string) =>
    call<CommercialPreviewResponse>(`/api/catalog/products/${productId}/commercial`),
  previewCommercial: (productId: string, input: CommercialPreviewRequest) =>
    call<CommercialPreviewResponse>(`/api/catalog/products/${productId}/commercial/preview`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  applyCommercial: (productId: string, input: CommercialApplyRequest) =>
    mutatingCall<CommercialApplyResponse>(`/api/catalog/products/${productId}/commercial/apply`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // Variants
  listVariants: (productId: string) =>
    call<ProductVariantListResponse>(`/api/catalog/products/${productId}/variants`),
  createVariant: (productId: string, input: ProductVariantCreateRequest) =>
    mutatingCall<ProductVariant>(`/api/catalog/products/${productId}/variants`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateVariant: (productId: string, variantId: string, input: ProductVariantUpdateRequest) =>
    mutatingCall<ProductVariant>(`/api/catalog/products/${productId}/variants/${variantId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  // F4B — Varyant fiyat/liste/maliyet degisikligi gecmisi.
  listPriceChanges: (productId: string, variantId: string) =>
    call<ProductPriceChangeListResponse>(
      `/api/catalog/products/${productId}/variants/${variantId}/price-changes`,
    ),

  // Inventory
  listInventory: () => call<InventoryListResponse>("/api/catalog/inventory"),
  adjustInventory: (variantId: string, input: InventoryAdjustRequest) =>
    mutatingCall<InventoryAdjustmentResponse>(`/api/catalog/inventory/${variantId}/adjust`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // TODO-152 (ADR-076) — Inventory Engine. Depo listesi + matris okuma + rule/direct-edit preview
  // (yalnız-okuma) + server-authoritative apply (stale-guard + advisory-lock + append-only audit).
  listWarehouses: () => call<InventoryWarehouseListResponse>("/api/catalog/warehouses"),
  // TODO-152A — Mağaza-geneli SALT-OKUMA matris (global izleme merkezi; seçili depo).
  // TODO-159C (ADR-092) — sunucu-otoriter sayfalama/arama/filtre/sıralama query'si taşınır.
  getStoreInventoryMatrix: (query?: AdminListRequestQuery) =>
    call<InventoryStoreMatrixResponse>(`/api/catalog/inventory/matrix${listQueryString(query)}`),
  getInventoryMatrix: (productId: string, warehouseId?: string) =>
    call<InventoryPreviewResponse>(
      `/api/catalog/products/${productId}/inventory${
        warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : ""
      }`,
    ),
  previewInventory: (productId: string, input: InventoryPreviewRequest) =>
    call<InventoryPreviewResponse>(`/api/catalog/products/${productId}/inventory/preview`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  applyInventory: (productId: string, input: InventoryApplyRequest) =>
    mutatingCall<InventoryApplyResponse>(`/api/catalog/products/${productId}/inventory/apply`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // Orders (F2G) — lifecycle aksiyonlari mutating; CSRF zorunlu.
  // TODO-073 — Operasyonel filtreler query string olarak BFF'e taşınır.
  listOrders: (query?: OrderListQuery) =>
    call<OrderListResponse>(`/api/orders${orderListQueryString(query)}`),
  getOrder: (orderId: string) => call<Order>(`/api/orders/${orderId}`),
  createOrder: (input: OrderCreateRequest) =>
    mutatingCall<Order>("/api/orders", { method: "POST", body: JSON.stringify(input) }),
  placeOrder: (orderId: string) =>
    mutatingCall<Order>(`/api/orders/${orderId}/place`, { method: "POST" }),
  cancelOrder: (orderId: string, input: OrderCancelRequest = {}) =>
    mutatingCall<Order>(`/api/orders/${orderId}/cancel`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // TODO-159F — Order Payment Recovery & Collection (mevcut sipariş tahsilatı).
  getOrderPayment: (orderId: string) =>
    call<OrderPaymentStateResponse>(`/api/orders/${orderId}/payment`),
  createOrderPaymentLink: (orderId: string, input: CreatePaymentLinkRequest = {}) =>
    mutatingCall<PaymentLinkResponse>(`/api/orders/${orderId}/payment-link`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  regenerateOrderPaymentLink: (orderId: string, input: CreatePaymentLinkRequest = {}) =>
    mutatingCall<PaymentLinkResponse>(`/api/orders/${orderId}/payment-link/regenerate`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  emailOrderPaymentLink: (orderId: string, input: SendPaymentLinkEmailRequest = {}) =>
    mutatingCall<SendPaymentLinkEmailResponse>(`/api/orders/${orderId}/payment-link/email`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  recordManualPayment: (orderId: string, input: RecordManualPaymentRequest) =>
    mutatingCall<PaymentRecoveryAttempt>(`/api/orders/${orderId}/manual-payment`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // Reviews (TODO-159E / ADR-094) — moderasyon dizini + detay + moderate. Mutasyon CSRF'li.
  listReviews: (query?: AdminListRequestQuery) =>
    call<AdminReviewListResponse>(`/api/reviews${listQueryString(query)}`),
  getReview: (id: string) => call<AdminReviewDetailResponse>(`/api/reviews/${id}`),
  moderateReview: (id: string, input: ReviewModerateRequest) =>
    mutatingCall<ReviewModerateResponse>(`/api/reviews/${id}/moderate`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // Customers (F3B.3) — dizin + detay + yönetim. Mutasyonlar CSRF'li.
  listCustomers: (query?: AdminListRequestQuery) =>
    call<StoreAdminCustomerListResponse>(`/api/customers${listQueryString(query)}`),
  getCustomer: (id: string) => call<StoreAdminCustomerDetailResponse>(`/api/customers/${id}`),
  // TODO-159D (ADR-093) — Müşteri liste/wishlist salt-okunur özeti (gizlilik-güvenli).
  getCustomerListSummary: (id: string) =>
    call<StoreAdminCustomerListSummaryResponse>(`/api/customers/${id}/list-summary`),
  // TODO-087 — müşteri oluşturma + admin tetikli credential/oturum yönetimi.
  createCustomer: (input: StoreAdminCustomerCreateRequest) =>
    mutatingCall<CreateCustomerResult>("/api/customers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateCustomer: (id: string, input: StoreAdminCustomerUpdateRequest) =>
    mutatingCall<{ customer: CustomerAccount }>(`/api/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  createCustomerCredential: (id: string) =>
    mutatingCall<{ activation: ActivationInfo }>(`/api/customers/${id}/credential`, {
      method: "POST",
    }),
  resetCustomerCredential: (id: string) =>
    mutatingCall<{ activation: ActivationInfo }>(`/api/customers/${id}/credential/reset`, {
      method: "POST",
    }),
  revokeCustomerSessions: (id: string) =>
    mutatingCall<StoreAdminRevokeSessionsResponse>(`/api/customers/${id}/sessions/revoke`, {
      method: "POST",
    }),
  updateCustomerCommPref: (id: string, input: CustomerCommunicationPreference) =>
    mutatingCall<CustomerCommunicationPreference>(`/api/customers/${id}/communication-preferences`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  createCustomerAddress: (id: string, input: CustomerAddressInput) =>
    mutatingCall<{ address: CustomerAddress }>(`/api/customers/${id}/addresses`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateCustomerAddress: (id: string, addressId: string, input: CustomerAddressInput) =>
    mutatingCall<{ address: CustomerAddress }>(`/api/customers/${id}/addresses/${addressId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteCustomerAddress: (id: string, addressId: string) =>
    mutatingCall<{ deleted: boolean }>(`/api/customers/${id}/addresses/${addressId}`, {
      method: "DELETE",
    }),
  setDefaultCustomerAddress: (id: string, addressId: string) =>
    mutatingCall<{ updated: boolean }>(`/api/customers/${id}/addresses/${addressId}/default`, {
      method: "POST",
    }),
  createCustomerIban: (id: string, input: CustomerIbanInput) =>
    mutatingCall<{ iban: CustomerIban }>(`/api/customers/${id}/ibans`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteCustomerIban: (id: string, ibanId: string) =>
    mutatingCall<{ deleted: boolean }>(`/api/customers/${id}/ibans/${ibanId}`, {
      method: "DELETE",
    }),
  setDefaultCustomerIban: (id: string, ibanId: string) =>
    mutatingCall<{ updated: boolean }>(`/api/customers/${id}/ibans/${ibanId}/default`, {
      method: "POST",
    }),

  // Payment providers (F3B.2) — secret'lar BFF/gateway'de maskeli; mutating aksiyonlar CSRF'li.
  listPaymentProviders: () =>
    call<PaymentProviderConfigListResponse>("/api/payment-providers"),
  createPaymentProvider: (input: PaymentProviderConfigCreateRequest) =>
    mutatingCall<PaymentProviderConfig>("/api/payment-providers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getPaymentProvider: (configId: string) =>
    call<PaymentProviderConfig>(`/api/payment-providers/${configId}`),
  updatePaymentProvider: (configId: string, input: PaymentProviderConfigUpdateRequest) =>
    mutatingCall<PaymentProviderConfig>(`/api/payment-providers/${configId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  setPaymentProviderStatus: (configId: string, input: PaymentProviderStatusUpdateRequest) =>
    mutatingCall<PaymentProviderConfig>(`/api/payment-providers/${configId}/status`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  reorderPaymentProviders: (input: PaymentProviderReorderRequest) =>
    mutatingCall<PaymentProviderConfigListResponse>("/api/payment-providers/reorder", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  testPaymentProviderConnection: (configId: string) =>
    mutatingCall<PaymentProviderTestConnectionResponse>(
      `/api/payment-providers/${configId}/test-connection`,
      { method: "POST" },
    ),
  listPaymentProviderEvents: (configId: string) =>
    call<PaymentProviderEventListResponse>(`/api/payment-providers/${configId}/events`),

  // F3C.1 — Kargo sağlayıcıları. Secret alanlar gateway'de maskeli döner; bu katman
  // yalnızca BFF pass-through'a fetch yapar. Plain secret hiçbir yanıtta dönmez.
  listShippingProviders: () =>
    call<ShippingProviderConfigListResponse>("/api/shipping/providers"),
  createShippingProvider: (input: ShippingProviderConfigCreateRequest) =>
    mutatingCall<ShippingProviderConfigResponse>("/api/shipping/providers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateShippingProvider: (configId: string, input: ShippingProviderConfigUpdateRequest) =>
    mutatingCall<ShippingProviderConfigResponse>(`/api/shipping/providers/${configId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  upsertShippingCredential: (configId: string, input: ShippingCredentialUpsertRequest) =>
    mutatingCall<ShippingProviderConfigResponse>(`/api/shipping/providers/${configId}/credentials`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteShippingCredential: (configId: string, type: string) =>
    mutatingCall<ShippingProviderConfigResponse>(
      `/api/shipping/providers/${configId}/credentials/${type}`,
      { method: "DELETE" },
    ),
  testShippingProvider: (configId: string) =>
    mutatingCall<ShippingProviderTestResponse>(`/api/shipping/providers/${configId}/test`, {
      method: "POST",
    }),
  // TODO-128 — Webhook durumu/URL'si + son olaylar (güvenli DTO; secret/raw/imza dönmez).
  getShippingWebhookInfo: (configId: string, limit?: number) =>
    call<ShippingWebhookInfoResponse>(
      `/api/shipping/providers/${configId}/webhook${typeof limit === "number" ? `?limit=${limit}` : ""}`,
    ),
  // TODO-128/104 — Secret/token yeniler; yeni secret yanıtta YALNIZ BİR KEZ döner.
  rotateShippingWebhook: (configId: string) =>
    mutatingCall<ShippingWebhookRotateResponse>(`/api/shipping/providers/${configId}/webhook/rotate`, {
      method: "POST",
    }),
  getOrderShipping: (orderId: string) =>
    call<OrderShippingResponse>(`/api/orders/${orderId}/shipping`),
  calculateOrderShippingRate: (orderId: string, input: ShippingRateRequest) =>
    mutatingCall<ShippingRateResponse>(`/api/orders/${orderId}/shipping/rate`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createOrderShipment: (orderId: string, input: ShippingCreateOrderRequest) =>
    mutatingCall<{ referenceId: string; externalOrderId: string | null }>(
      `/api/orders/${orderId}/shipping/create-order`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  createOrderShipmentBarcode: (orderId: string, input: ShippingCreateBarcodeRequest) =>
    mutatingCall<{ referenceId: string; externalShipmentId: string | null; barcodeCount: number }>(
      `/api/orders/${orderId}/shipping/create-barcode`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  // F3C.3 — DHL sipariş sonrası operasyon admin aksiyonları (BFF pass-through).
  prepareDhlShipment: (orderId: string, input: ShippingPrepareRequest) =>
    mutatingCall<ShippingShipmentMutationResponse>(`/api/orders/${orderId}/shipping/dhl/prepare`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  // F3C.5 (TODO-126) — manuel gönderi hazırlama (online prepare fallback'i; provider'a İSTEK ATMAZ).
  createShipmentDraft: (orderId: string, input: ShippingPrepareRequest) =>
    mutatingCall<ShippingShipmentMutationResponse>(`/api/orders/${orderId}/shipping/shipment-draft`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createDhlBarcode: (orderId: string, input: ShippingBarcodeActionRequest) =>
    mutatingCall<ShippingShipmentMutationResponse>(`/api/orders/${orderId}/shipping/dhl/barcode`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  syncDhlShipment: (orderId: string, input: ShippingSyncRequest) =>
    mutatingCall<ShippingShipmentMutationResponse>(`/api/orders/${orderId}/shipping/dhl/sync`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  cancelDhlShipment: (orderId: string, input: ShippingCancelRequest) =>
    mutatingCall<ShippingShipmentMutationResponse>(`/api/orders/${orderId}/shipping/dhl/cancel`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  // TODO-139 — sipariş teslimat adresi snapshot düzenleme (müşteri adres defterini DEĞİL).
  updateOrderShippingAddress: (orderId: string, input: ShippingAddressUpdateRequest) =>
    mutatingCall<ShippingAddressUpdateResponse>(`/api/orders/${orderId}/shipping/address`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  // F3C.5 (TODO-121) — store-level shipment domain (provider-agnostic). UI generic kalır;
  // DHL yalnızca provider displayName/logo olarak görünür. Secret/ZPL içermez.
  listShipments: (query?: ShipmentListQuery) =>
    call<ShipmentListResponse>(`/api/shipping/shipments${shipmentListQuery(query)}`),
  getShipment: (shipmentId: string) =>
    call<ShipmentDetailResponse>(`/api/shipping/shipments/${shipmentId}`),
  createShipmentLabel: (shipmentId: string, input: ShipmentCreateLabelRequest) =>
    mutatingCall<ShippingShipmentMutationResponse>(`/api/shipping/shipments/${shipmentId}/create-label`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  syncShipment: (shipmentId: string) =>
    mutatingCall<ShippingShipmentMutationResponse>(`/api/shipping/shipments/${shipmentId}/sync`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  cancelShipment: (shipmentId: string, input: ShipmentCancelRequest) =>
    mutatingCall<ShippingShipmentMutationResponse>(`/api/shipping/shipments/${shipmentId}/cancel`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  setShipmentManualTracking: (shipmentId: string, input: ShipmentManualTrackingRequest) =>
    mutatingCall<ShippingShipmentMutationResponse>(`/api/shipping/shipments/${shipmentId}/manual-tracking`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  // TODO-124 — varış il/ilçe eşlemesi onarımı + CBS il/ilçe listeleri (dropdown).
  repairShipmentDestination: (shipmentId: string, input: ShipmentRepairDestinationRequest) =>
    mutatingCall<ShipmentRepairDestinationResponse>(
      `/api/shipping/shipments/${shipmentId}/repair-destination`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  getCbsCities: (providerConfigId: string) =>
    mutatingCall<ShippingCbsCitiesResponse>("/api/shipping/cbs/cities", {
      method: "POST",
      body: JSON.stringify({ providerConfigId }),
    }),
  getCbsDistricts: (providerConfigId: string, cityCode: number) =>
    mutatingCall<ShippingCbsDistrictsResponse>("/api/shipping/cbs/districts", {
      method: "POST",
      body: JSON.stringify({ providerConfigId, cityCode }),
    }),

  // F3C.2 — Kargo TARİFE planları (price engine). Provider canlı quote DEĞİL;
  // ücret store tarifesinden hesaplanır. Secret içermez.
  listShippingRatePlans: () =>
    call<ShippingRatePlanListResponse>("/api/shipping/rate-plans"),
  createShippingRatePlan: (input: ShippingRatePlanCreateRequest) =>
    mutatingCall<ShippingRatePlanResponse>("/api/shipping/rate-plans", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateShippingRatePlan: (planId: string, input: ShippingRatePlanUpdateRequest) =>
    mutatingCall<ShippingRatePlanResponse>(`/api/shipping/rate-plans/${planId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteShippingRatePlan: (planId: string) =>
    mutatingCall<{ ok: boolean }>(`/api/shipping/rate-plans/${planId}`, { method: "DELETE" }),
  setDefaultShippingRatePlan: (planId: string) =>
    mutatingCall<ShippingRatePlanResponse>(`/api/shipping/rate-plans/${planId}/default`, {
      method: "POST",
    }),
  addShippingRateRule: (planId: string, input: ShippingRateRuleInput) =>
    mutatingCall<ShippingRatePlanResponse>(`/api/shipping/rate-plans/${planId}/rules`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateShippingRateRule: (planId: string, ruleId: string, input: ShippingRateRulePatch) =>
    mutatingCall<ShippingRatePlanResponse>(`/api/shipping/rate-plans/${planId}/rules/${ruleId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteShippingRateRule: (planId: string, ruleId: string) =>
    mutatingCall<ShippingRatePlanResponse>(`/api/shipping/rate-plans/${planId}/rules/${ruleId}`, {
      method: "DELETE",
    }),
  addShippingRateTier: (planId: string, input: ShippingRateTierInput) =>
    mutatingCall<ShippingRatePlanResponse>(`/api/shipping/rate-plans/${planId}/tiers`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteShippingRateTier: (planId: string, tierId: string) =>
    mutatingCall<ShippingRatePlanResponse>(`/api/shipping/rate-plans/${planId}/tiers/${tierId}`, {
      method: "DELETE",
    }),
  addShippingRateZone: (planId: string, input: ShippingRateZoneInput) =>
    mutatingCall<ShippingRatePlanResponse>(`/api/shipping/rate-plans/${planId}/zones`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteShippingRateZone: (planId: string, zoneId: string) =>
    mutatingCall<ShippingRatePlanResponse>(`/api/shipping/rate-plans/${planId}/zones/${zoneId}`, {
      method: "DELETE",
    }),
  addShippingSurcharge: (planId: string, input: ShippingSurchargeInput) =>
    mutatingCall<ShippingRatePlanResponse>(`/api/shipping/rate-plans/${planId}/surcharges`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteShippingSurcharge: (planId: string, surchargeId: string) =>
    mutatingCall<ShippingRatePlanResponse>(`/api/shipping/rate-plans/${planId}/surcharges/${surchargeId}`, {
      method: "DELETE",
    }),
  previewShippingMatrix: (planId: string, input: ShippingMatrixApplyRequest) =>
    mutatingCall<ShippingMatrixPreviewResponse>(`/api/shipping/rate-plans/${planId}/matrix/preview`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  applyShippingMatrix: (planId: string, input: ShippingMatrixApplyRequest) =>
    mutatingCall<ShippingMatrixApplyResponse>(`/api/shipping/rate-plans/${planId}/matrix/apply`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  previewShippingImport: (planId: string, input: ShippingImportRequest) =>
    mutatingCall<ShippingImportPreviewResponse>(`/api/shipping/rate-plans/${planId}/import/preview`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  applyShippingImport: (planId: string, input: ShippingImportRequest) =>
    mutatingCall<ShippingImportApplyResponse>(`/api/shipping/rate-plans/${planId}/import/apply`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // F4A — Kampanya/kupon yönetimi (ADR-058). İndirim hesabı SUNUCUDADIR;
  // bu ekran yalnız kampanya tanımını yönetir.
  listCampaigns: () => call<CampaignListResponse>("/api/campaigns"),
  createCampaign: (input: CampaignCreateRequest) =>
    mutatingCall<CampaignResponse>("/api/campaigns", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getCampaign: (campaignId: string) =>
    call<CampaignDetailResponse>(`/api/campaigns/${campaignId}`),
  updateCampaign: (campaignId: string, input: CampaignUpdateRequest) =>
    mutatingCall<CampaignResponse>(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  campaignStatusAction: (campaignId: string, action: "activate" | "pause" | "archive") =>
    mutatingCall<CampaignResponse>(`/api/campaigns/${campaignId}/${action}`, { method: "POST" }),

  // F4A.3 — Kupon atama / musteri cuzdani (ADR-060). Ortak backend; iki UI.
  listCampaignAssignments: (campaignId: string) =>
    call<CustomerCouponAssignmentListResponse>(`/api/campaigns/${campaignId}/assignments`),
  assignCampaignCoupon: (campaignId: string, input: CouponAssignmentRequest) =>
    mutatingCall<CustomerCouponAssignment>(`/api/campaigns/${campaignId}/assignments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  listCustomerCoupons: (customerId: string) =>
    call<CustomerCouponAssignmentListResponse>(`/api/customers/${customerId}/coupons`),
  assignCustomerCoupon: (customerId: string, couponId: string) =>
    mutatingCall<CustomerCouponAssignment>(`/api/customers/${customerId}/coupons`, {
      method: "POST",
      body: JSON.stringify({ couponId }),
    }),

  // ADR-065 Faz 2 (Dilim 1) — Media kutuphanesi. upload multipart FormData ile
  // (content-type call icinde otomatik atlanir); list opsiyonel context filtresiyle;
  // delete 204 (kullanimdaysa 409 MEDIA_IN_USE → UiError.details.usedIn).
  // TODO-159B (ADR-090) — TD-095 kapanışı: gerçek sayfalama/arama/sıralama query'si.
  // Eski `context` argümanı yerine ortak query haritası geçilir.
  listMedia: (query?: AdminListRequestQuery) =>
    call<MediaListResponse>(`/api/media${listQueryString(query)}`),
  uploadMedia: (input: { file: File; context: MediaContext; altText?: string }) => {
    const form = new FormData();
    form.append("context", input.context);
    const altText = input.altText?.trim();
    if (altText) form.append("altText", altText);
    form.append("file", input.file, input.file.name);
    return mutatingCall<MediaUploadResponse>("/api/media", { method: "POST", body: form });
  },
  deleteMedia: (mediaId: string) =>
    mutatingCall<void>(`/api/media/${mediaId}`, { method: "DELETE" }),

  // ADR-065 Faz 2 (Dilim 4) — Magaza marka ayarlari (logo/favicon). get lazy (tum-null),
  // update upsert (PATCH; logoMediaId/faviconMediaId null=kaldir).
  getStoreSettings: () => call<StoreSettings>("/api/store/settings"),
  updateStoreSettings: (input: StoreSettingsUpdateRequest) =>
    mutatingCall<StoreSettings>("/api/store/settings", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  // ADR-065 Faz 2 (Dilim 5) — Ana sayfa hero slide (CRUD temeli). Sıralama ve yayın
  // geçişi ayrı checkpoint. delete 204 (yalnız slide kaydı; media'ya dokunmaz).
  listHeroSlides: () => call<HeroSlideListResponse>("/api/hero-slides"),
  createHeroSlide: (input: HeroSlideCreateRequest) =>
    mutatingCall<HeroSlide>("/api/hero-slides", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateHeroSlide: (id: string, input: HeroSlideUpdateRequest) =>
    mutatingCall<HeroSlide>(`/api/hero-slides/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteHeroSlide: (id: string) =>
    mutatingCall<void>(`/api/hero-slides/${id}`, { method: "DELETE" }),
  // Checkpoint B — sıralama: sıralı id listesi (uyumsuz set → 400 HERO_REORDER_MISMATCH).
  reorderHeroSlides: (input: HeroSlideReorderRequest) =>
    mutatingCall<HeroSlideListResponse>("/api/hero-slides/reorder", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  // Checkpoint C — yayın durumu geçişi (publish → PUBLISHED, unpublish → DRAFT).
  publishHeroSlide: (id: string) =>
    mutatingCall<HeroSlideStatusActionResponse>(`/api/hero-slides/${id}/publish`, { method: "POST" }),
  unpublishHeroSlide: (id: string) =>
    mutatingCall<HeroSlideStatusActionResponse>(`/api/hero-slides/${id}/unpublish`, { method: "POST" }),

  // TODO-158A (ADR-086) — Home Experience Platform: section CRUD + tip-özel alt varlıklar.
  listHomeSections: () => call<HomeSectionListResponse>("/api/home/sections"),
  createHomeSection: (input: HomeSectionCreateRequest) =>
    mutatingCall<HomeSection>("/api/home/sections", { method: "POST", body: JSON.stringify(input) }),
  getHomeSection: (sectionId: string) => call<HomeSection>(`/api/home/sections/${sectionId}`),
  updateHomeSection: (sectionId: string, input: HomeSectionUpdateRequest) =>
    mutatingCall<HomeSection>(`/api/home/sections/${sectionId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteHomeSection: (sectionId: string) =>
    mutatingCall<void>(`/api/home/sections/${sectionId}`, { method: "DELETE" }),
  reorderHomeSections: (input: HomeSectionReorderRequest) =>
    mutatingCall<HomeSectionListResponse>("/api/home/sections/reorder", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // HERO_SLIDER alt varlığı (section-scoped).
  listHomeHeroSlides: (sectionId: string) =>
    call<HomeHeroSlideListResponse>(`/api/home/sections/${sectionId}/hero-slides`),
  createHomeHeroSlide: (sectionId: string, input: HomeHeroSlideCreateRequest) =>
    mutatingCall<HomeHeroSlide>(`/api/home/sections/${sectionId}/hero-slides`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateHomeHeroSlide: (sectionId: string, id: string, input: HomeHeroSlideUpdateRequest) =>
    mutatingCall<HomeHeroSlide>(`/api/home/sections/${sectionId}/hero-slides/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteHomeHeroSlide: (sectionId: string, id: string) =>
    mutatingCall<void>(`/api/home/sections/${sectionId}/hero-slides/${id}`, { method: "DELETE" }),
  reorderHomeHeroSlides: (sectionId: string, input: HomeHeroSlideReorderRequest) =>
    mutatingCall<HomeHeroSlideListResponse>(`/api/home/sections/${sectionId}/hero-slides/reorder`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // FEATURED_CATEGORIES alt varlığı (section-scoped).
  listHomeFeaturedCategories: (sectionId: string) =>
    call<HomeFeaturedCategoryListResponse>(`/api/home/sections/${sectionId}/featured-categories`),
  createHomeFeaturedCategory: (sectionId: string, input: HomeFeaturedCategoryCreateRequest) =>
    mutatingCall<HomeFeaturedCategory>(`/api/home/sections/${sectionId}/featured-categories`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateHomeFeaturedCategory: (
    sectionId: string,
    id: string,
    input: HomeFeaturedCategoryUpdateRequest,
  ) =>
    mutatingCall<HomeFeaturedCategory>(`/api/home/sections/${sectionId}/featured-categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteHomeFeaturedCategory: (sectionId: string, id: string) =>
    mutatingCall<void>(`/api/home/sections/${sectionId}/featured-categories/${id}`, {
      method: "DELETE",
    }),
  reorderHomeFeaturedCategories: (sectionId: string, input: HomeFeaturedCategoryReorderRequest) =>
    mutatingCall<HomeFeaturedCategoryListResponse>(
      `/api/home/sections/${sectionId}/featured-categories/reorder`,
      { method: "POST", body: JSON.stringify(input) },
    ),

  // PRODUCT_SHOWCASE (MANUAL) alt varlığı — replace-set.
  listHomeShowcaseProducts: (sectionId: string) =>
    call<HomeShowcaseProductListResponse>(`/api/home/sections/${sectionId}/showcase-products`),
  setHomeShowcaseProducts: (sectionId: string, input: HomeShowcaseProductSetRequest) =>
    mutatingCall<HomeShowcaseProductListResponse>(
      `/api/home/sections/${sectionId}/showcase-products`,
      { method: "PUT", body: JSON.stringify(input) },
    ),

  // TODO-158B (ADR-087) — Enterprise Theme Engine (Design Token editörü).
  listThemes: () => call<ThemeListResponse>("/api/theme"),
  themePresets: () => call<ThemePresetListResponse>("/api/theme/presets"),
  getTheme: (themeId: string) => call<ThemeDetail>(`/api/theme/${themeId}`),
  createTheme: (input: ThemeCreateRequest) =>
    mutatingCall<ThemeDetail>("/api/theme", { method: "POST", body: JSON.stringify(input) }),
  updateTheme: (themeId: string, input: ThemeUpdateRequest) =>
    mutatingCall<ThemeDetail>(`/api/theme/${themeId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteTheme: (themeId: string) =>
    mutatingCall<void>(`/api/theme/${themeId}`, { method: "DELETE" }),
  saveThemeDraft: (themeId: string, input: ThemeDraftUpdateRequest) =>
    mutatingCall<ThemeDetail>(`/api/theme/${themeId}/draft`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  publishTheme: (themeId: string, input: ThemePublishRequest) =>
    mutatingCall<ThemeDetail>(`/api/theme/${themeId}/publish`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  rollbackTheme: (themeId: string, input: ThemeRollbackRequest) =>
    mutatingCall<ThemeDetail>(`/api/theme/${themeId}/rollback`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  previewTheme: (themeId: string) =>
    call<ThemePreviewResponse>(`/api/theme/${themeId}/preview`),
  exportTheme: (themeId: string) =>
    call<ThemeExportResponse>(`/api/theme/${themeId}/export`),
  importTheme: (input: ThemeImportRequest) =>
    mutatingCall<ThemeDetail>("/api/theme/import", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
