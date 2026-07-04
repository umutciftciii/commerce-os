import type {
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
  PlatformMeResponse,
  PlatformUserContract,
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
} from "@commerce-os/api-client";

/**
 * Tarayici -> ayni-origin BFF (/api/*) istemcisi. Gateway'e dogrudan gitmez
 * (CORS/secret yok); tum cagrilar store-admin-web route handler'lari uzerinden
 * gecer ve secili mağaza bağlami server-side cozulur. Hata durumunda makine-okunur
 * `code` tasiyan {@link UiError} firlatir.
 */
export class UiError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "UiError";
    this.code = code;
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
    response = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new UiError("NETWORK");
  }

  if (!response.ok) {
    let code = "UNKNOWN";
    try {
      const body: unknown = await response.json();
      if (
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error?: { code?: unknown } }).error?.code === "string"
      ) {
        code = (body as { error: { code: string } }).error.code;
      }
    } catch {
      // Govde JSON degil — genel UNKNOWN kodu kullanilir.
    }
    throw new UiError(code);
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
  listCategories: () => call<ProductCategoryListResponse>("/api/catalog/categories"),
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

  // Products
  listProducts: () => call<ProductListResponse>("/api/catalog/products"),
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

  // Inventory
  listInventory: () => call<InventoryListResponse>("/api/catalog/inventory"),
  adjustInventory: (variantId: string, input: InventoryAdjustRequest) =>
    mutatingCall<InventoryAdjustmentResponse>(`/api/catalog/inventory/${variantId}/adjust`, {
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

  // Customers (F3B.3) — dizin + detay + yönetim. Mutasyonlar CSRF'li.
  listCustomers: () => call<StoreAdminCustomerListResponse>("/api/customers"),
  getCustomer: (id: string) => call<StoreAdminCustomerDetailResponse>(`/api/customers/${id}`),
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
};
