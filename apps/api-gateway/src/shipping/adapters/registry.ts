import type { ShippingProviderType } from "@prisma/client";
import type { ShippingProviderAdapter } from "../types.js";
import { createDisabledHttpTransport, type ShippingHttpTransport } from "./http.js";
import { MockShippingAdapter } from "./mock-adapter.js";
import { DhlEcommerceAdapter } from "./dhl-ecommerce/adapter.js";
import { GeliverAdapter } from "./geliver/adapter.js";

/**
 * F3C.1 — Provider type → adapter cozumleyici.
 *
 * MOCK tam calisir (transport gerekmez). DHL_ECOMMERCE/GELIVER provider-specific
 * client + transport ile yurutulur; transport varsayilan KAPALI (canli HTTP yok).
 * Flag (SHIPPING_SANDBOX_HTTP_ENABLED) acilinca ayni adapter sandbox/live cagriyi yapar.
 */
export interface ShippingAdapterRegistry {
  get(provider: ShippingProviderType): ShippingProviderAdapter;
}

export function createShippingAdapterRegistry(
  transport: ShippingHttpTransport = createDisabledHttpTransport(),
): ShippingAdapterRegistry {
  const adapters: Record<ShippingProviderType, ShippingProviderAdapter> = {
    MOCK: new MockShippingAdapter(),
    DHL_ECOMMERCE: new DhlEcommerceAdapter(transport),
    GELIVER: new GeliverAdapter(transport),
  };
  return {
    get(provider: ShippingProviderType): ShippingProviderAdapter {
      return adapters[provider];
    },
  };
}

export function getShippingAdapter(
  provider: ShippingProviderType,
  transport?: ShippingHttpTransport,
): ShippingProviderAdapter {
  return createShippingAdapterRegistry(transport).get(provider);
}

/** MOCK yalnizca test/dev/demo ortaminda canli is yapar. */
export function isMockShippingProvider(provider: ShippingProviderType): boolean {
  return provider === "MOCK";
}
