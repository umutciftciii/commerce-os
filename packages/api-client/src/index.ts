import type {
  AdminStore,
  AdminStoreCreateRequest,
  AdminStoreListResponse,
  AdminStoreUpdateRequest,
  HealthResponse,
  Plan,
  PlanCreateRequest,
  PlanListResponse,
  PlanUpdateRequest,
  PlatformLoginRequest,
  PlatformLoginResponse,
  PlatformLogoutResponse,
  PlatformMeResponse,
} from "@commerce-os/contracts";

/**
 * commerce-os API client — FOUNDATION PLACEHOLDER.
 *
 * This is an intentionally thin, type-safe client over the API gateway. It only
 * exposes the public health/version endpoints today. It does NOT implement auth,
 * tokens, sessions or per-domain resources yet (see docs/TECHNICAL_DEBT.md TD-002).
 * The shape is designed to grow: add resource groups (stores, products, orders…)
 * without breaking existing callers.
 */

export const DEFAULT_API_GATEWAY_URL = "http://localhost:4000";

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

export interface ApiClient {
  readonly baseUrl: string;
  health(): Promise<HealthResponse>;
  version(): Promise<VersionResponse>;
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
      throw new Error(`API gateway request failed: ${path} (${response.status})`);
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
    },
  };
}
