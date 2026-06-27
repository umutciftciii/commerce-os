import type {
  InventoryAdjustRequest,
  InventoryAdjustmentResponse,
  InventoryListResponse,
  Order,
  OrderCancelRequest,
  OrderCreateRequest,
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
  listOrders: () => call<OrderListResponse>("/api/orders"),
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
};
