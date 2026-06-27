import { PaymentConfigError } from "../types.js";

/**
 * F3B.2 — Payment provider HTTP transport (sandbox/live cagri katmani).
 *
 * Gercek provider HTTP cagrilari bu fazda KAPALI tutulur (`PAYMENT_SANDBOX_HTTP_ENABLED`
 * env'i ile gate'lenir; varsayilan kapali). Adapter'lar request payload'i HER ZAMAN
 * uretir (provider contract mapping calisir/test edilir); ancak transport kapaliyken
 * gercek ag cagrisi YAPILMAZ ve `SANDBOX_HTTP_DISABLED` doner. Sozlesme/test credential
 * sonrasi flag acilinca ayni adapter gercek sandbox/live cagriyi yapar.
 */

export interface PaymentHttpRequest {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface PaymentHttpResponse {
  status: number;
  body: string;
}

export interface PaymentHttpTransport {
  /** HTTP cagrilari acik mi? (sandbox-ready ⇄ sandbox-disabled ayrimi icin) */
  readonly enabled: boolean;
  send(request: PaymentHttpRequest): Promise<PaymentHttpResponse>;
}

/** Varsayilan transport: HTTP KAPALI. Cagri denenirse kontrollu hata doner. */
export function createDisabledHttpTransport(): PaymentHttpTransport {
  return {
    enabled: false,
    async send(): Promise<PaymentHttpResponse> {
      throw new PaymentConfigError(
        "SANDBOX_HTTP_DISABLED",
        "Provider HTTP cagrilari bu ortamda kapali (PAYMENT_SANDBOX_HTTP_ENABLED=false).",
      );
    },
  };
}

/** Gercek transport: `fetch` ile sandbox/live cagri (flag acikken). */
export function createFetchHttpTransport(timeoutMs = 15000): PaymentHttpTransport {
  return {
    enabled: true,
    async send(request: PaymentHttpRequest): Promise<PaymentHttpResponse> {
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
