import { ShippingConfigError } from "../errors.js";

/**
 * F3C.1 — Shipping provider HTTP transport (sandbox/live cagri katmani).
 *
 * Gercek saglayici HTTP cagrilari bu fazda KAPALI tutulur (`SHIPPING_SANDBOX_HTTP_ENABLED`
 * env'i ile gate'lenir; varsayilan kapali). Adapter'lar request payload'ini HER ZAMAN
 * uretir (mapping calisir/test edilir); transport kapaliyken gercek ag cagrisi YAPILMAZ
 * ve `SHIPPING_HTTP_DISABLED` doner. Credential/sozlesme sonrasi flag acilinca ayni
 * adapter gercek sandbox/live cagriyi yapar.
 */

export interface ShippingHttpRequest {
  method: "GET" | "POST" | "PUT";
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ShippingHttpResponse {
  status: number;
  body: string;
}

export interface ShippingHttpTransport {
  readonly enabled: boolean;
  send(request: ShippingHttpRequest): Promise<ShippingHttpResponse>;
}

/** Varsayilan transport: HTTP KAPALI. Cagri denenirse kontrollu hata doner. */
export function createDisabledHttpTransport(): ShippingHttpTransport {
  return {
    enabled: false,
    async send(): Promise<ShippingHttpResponse> {
      throw new ShippingConfigError(
        "SHIPPING_HTTP_DISABLED",
        "Kargo saglayici HTTP cagrilari bu ortamda kapali (SHIPPING_SANDBOX_HTTP_ENABLED=false).",
      );
    },
  };
}

/** Gercek transport: `fetch` ile sandbox/live cagri (flag acikken). */
export function createFetchHttpTransport(timeoutMs = 15000): ShippingHttpTransport {
  return {
    enabled: true,
    async send(request: ShippingHttpRequest): Promise<ShippingHttpResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: controller.signal,
        });
        return { status: response.status, body: await response.text() };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
