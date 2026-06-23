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
  PlatformMeResponse,
  PlatformUserContract,
} from "@commerce-os/api-client";

/**
 * Tarayici -> ayni-origin BFF (/api/*) istemcisi. Gateway'e dogrudan gitmez
 * (CORS/secret yok); tum cagrilar admin-web route handler'lari uzerinden gecer.
 * Hata durumunda makine-okunur `code` tasiyan {@link UiError} firlatir.
 */
export class UiError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "UiError";
    this.code = code;
  }
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

export type AdminUser = PlatformUserContract;

export interface SystemHealth {
  health: HealthResponse;
  version: { name: string; service: string; version: string };
  gatewayUrl: string;
}

export type InternalProbe = "ok" | "degraded" | "unknown";

export type SystemInternal =
  | { available: false }
  | { available: true; db: InternalProbe; redis: InternalProbe };

export const adminApi = {
  // Auth
  login: (email: string, password: string) =>
    call<{ user: AdminUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => call<PlatformMeResponse>("/api/auth/me"),
  logout: () => mutatingCall<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  // Stores
  listStores: () => call<AdminStoreListResponse>("/api/admin/stores"),
  createStore: (input: AdminStoreCreateRequest) =>
    mutatingCall<AdminStore>("/api/admin/stores", { method: "POST", body: JSON.stringify(input) }),
  updateStore: (id: string, input: AdminStoreUpdateRequest) =>
    mutatingCall<AdminStore>(`/api/admin/stores/${id}`, { method: "PATCH", body: JSON.stringify(input) }),

  // Plans
  listPlans: () => call<PlanListResponse>("/api/admin/plans"),
  createPlan: (input: PlanCreateRequest) =>
    mutatingCall<Plan>("/api/admin/plans", { method: "POST", body: JSON.stringify(input) }),
  updatePlan: (id: string, input: PlanUpdateRequest) =>
    mutatingCall<Plan>(`/api/admin/plans/${id}`, { method: "PATCH", body: JSON.stringify(input) }),

  // System health
  systemHealth: () => call<SystemHealth>("/api/system/health"),
  systemInternal: () => call<SystemInternal>("/api/system/internal"),
};
