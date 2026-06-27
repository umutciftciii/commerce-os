import type { PaymentProviderType } from "@prisma/client";
import type { PaymentProviderAdapter } from "../types.js";
import { createDisabledHttpTransport, type PaymentHttpTransport } from "./http.js";
import { MockPaymentAdapter } from "./mock-adapter.js";
import { ProviderApiAdapter } from "./provider-adapter.js";
import { iyzicoContract } from "./contracts/iyzico.js";
import { stripeContract } from "./contracts/stripe.js";
import { paytrContract } from "./contracts/paytr.js";
import { genericRedirectContract } from "./contracts/generic-redirect.js";

/**
 * F3B.2 — Provider type → adapter cozumleyici.
 *
 * MOCK tam calisir (transport gerekmez). IYZICO/STRIPE/PAYTR/GENERIC_REDIRECT
 * provider-specific contract + transport ile yurutulur; transport varsayilan
 * KAPALI (canli HTTP yok). Flag acilinca ayni adapter sandbox/live cagriyi yapar.
 */
export interface PaymentAdapterRegistry {
  get(provider: PaymentProviderType): PaymentProviderAdapter;
}

export function createPaymentAdapterRegistry(
  transport: PaymentHttpTransport = createDisabledHttpTransport(),
): PaymentAdapterRegistry {
  const mock = new MockPaymentAdapter();
  const adapters: Record<PaymentProviderType, PaymentProviderAdapter> = {
    MOCK: mock,
    IYZICO: new ProviderApiAdapter(iyzicoContract, transport),
    STRIPE: new ProviderApiAdapter(stripeContract, transport),
    PAYTR: new ProviderApiAdapter(paytrContract, transport),
    GENERIC_REDIRECT: new ProviderApiAdapter(genericRedirectContract, transport),
  };
  return {
    get(provider: PaymentProviderType): PaymentProviderAdapter {
      return adapters[provider];
    },
  };
}

/** Test/convenience: tekil adapter cozumleyici (varsayilan KAPALI transport). */
export function getPaymentAdapter(
  provider: PaymentProviderType,
  transport?: PaymentHttpTransport,
): PaymentProviderAdapter {
  return createPaymentAdapterRegistry(transport).get(provider);
}

/** MOCK provider yalnizca test/dev/demo ortaminda canli is yapar. */
export function isMockProvider(provider: PaymentProviderType): boolean {
  return provider === "MOCK";
}
