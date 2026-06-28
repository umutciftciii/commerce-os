import type {
  ShippingCredentialType,
  ShippingProviderConfig,
  ShippingProviderCredential,
  ShippingProviderMode,
  ShippingProviderStatus,
  ShippingProviderType,
} from "@prisma/client";

/**
 * F3C.1 — Shipping provider config'i CLIENT-GUVENLI sekilde serialize eder.
 *
 * KESIN ALLOWLIST. Secret alanlar (encryptedKey/encryptedSecret/encryptedCustomerNumber/
 * encryptedCustomerPassword) ASLA duz metin/ciphertext olarak DONMEZ. Credential icin
 * yalnizca: type + configured + maskedKey (son-4) + identityType + ekstra alanlarin
 * "set mi?" boolean'lari + son test ozeti doner.
 */

export interface SerializedShippingCredential {
  type: ShippingCredentialType;
  configured: boolean;
  maskedKey: string | null;
  /** Secret/customerPassword DONMEZ; yalnizca "set mi?" bilgisi. */
  secretSet: boolean;
  customerNumberSet: boolean;
  customerPasswordSet: boolean;
  identityType: number | null;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastErrorCode: string | null;
}

export interface SerializedShippingProviderConfig {
  id: string;
  provider: ShippingProviderType;
  mode: ShippingProviderMode;
  status: ShippingProviderStatus;
  displayName: string;
  allowOrderCreate: boolean;
  allowBarcodeCreate: boolean;
  allowLabelPurchase: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
  credentials: SerializedShippingCredential[];
}

export function serializeShippingCredential(
  cred: ShippingProviderCredential,
): SerializedShippingCredential {
  return {
    type: cred.type,
    configured: cred.configured,
    maskedKey: cred.maskedKey,
    secretSet: Boolean(cred.encryptedSecret),
    customerNumberSet: Boolean(cred.encryptedCustomerNumber),
    customerPasswordSet: Boolean(cred.encryptedCustomerPassword),
    identityType: cred.identityType,
    lastTestedAt: cred.lastTestedAt ? cred.lastTestedAt.toISOString() : null,
    lastTestStatus: cred.lastTestStatus,
    lastErrorCode: cred.lastErrorCode,
  };
}

export function serializeShippingProviderConfig(
  config: ShippingProviderConfig & { credentials?: ShippingProviderCredential[] },
): SerializedShippingProviderConfig {
  return {
    id: config.id,
    provider: config.provider,
    mode: config.mode,
    status: config.status,
    displayName: config.displayName,
    allowOrderCreate: config.allowOrderCreate,
    allowBarcodeCreate: config.allowBarcodeCreate,
    allowLabelPurchase: config.allowLabelPurchase,
    lastTestedAt: config.lastTestedAt ? config.lastTestedAt.toISOString() : null,
    lastTestStatus: config.lastTestStatus,
    lastErrorCode: config.lastErrorCode,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
    credentials: (config.credentials ?? []).map(serializeShippingCredential),
  };
}
