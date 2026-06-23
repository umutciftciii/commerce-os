import type { HealthResponse } from "@commerce-os/contracts";

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

  async function getJson<T>(path: string): Promise<T> {
    const response = await doFetch(`${baseUrl}${path}`);
    if (!response.ok) {
      throw new Error(`API gateway request failed: ${path} (${response.status})`);
    }
    return (await response.json()) as T;
  }

  return {
    baseUrl,
    health: () => getJson<HealthResponse>("/health"),
    version: () => getJson<VersionResponse>("/version"),
  };
}
