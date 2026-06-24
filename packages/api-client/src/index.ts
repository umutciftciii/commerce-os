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
  ProductUpdateRequest,
  ProductVariant,
  ProductVariantCreateRequest,
  ProductVariantListResponse,
  ProductVariantUpdateRequest,
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
  ProductUpdateRequest,
  ProductVariant,
  ProductVariantCreateRequest,
  ProductVariantListResponse,
  ProductVariantUpdateRequest,
  PlatformUserContract,
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
      list(storeId: string, token?: string): Promise<OrderListResponse>;
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
        list: (storeId, token) => getJson<OrderListResponse>(`/stores/${storeId}/orders`, token),
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
    },
  };
}
