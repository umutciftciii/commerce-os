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

/**
 * Turetilmis yetenek (capability) bayraklari. UI bunlara gore CTA'lari acar/kapatir;
 * provider "test OK" olmasi rate/create/label desteklendigi anlamina GELMEZ. Tum
 * yetenekler provider ENABLED + ilgili credential + (destructive icin) env guard'a baglidir.
 * `destructiveActionsDisabledReason` bir i18n hata KODudur (UI lokalize eder) ya da null.
 */
export interface ShippingCapabilities {
  canTestConnection: boolean;
  canCalculateRate: boolean;
  canCreateTestShipment: boolean;
  canCreateOrder: boolean;
  canCreateBarcode: boolean;
  canPurchaseLabel: boolean;
  destructiveActionsDisabledReason: string | null;
}

/** Server ortam bayraklari (route'tan gelir): canli destructive operasyon izinleri. */
export interface ShippingEnvGuards {
  orderCreate: boolean;
  barcodeCreate: boolean;
  labelPurchase: boolean;
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
  capabilities: ShippingCapabilities;
}

/**
 * Provider tipi + status + configured credential + env guard'larina gore turetilmis
 * yetenekleri hesaplar. Geliver `calculateRate` DESTEKLENMEZ (offer akisi yok);
 * DHL `calculateRate` yalniz STANDARD_QUERY credential + ENABLED ise; tum destructive
 * operasyonlar provider izni + env guard gerektirir.
 */
export function computeShippingCapabilities(
  config: ShippingProviderConfig & { credentials?: ShippingProviderCredential[] },
  env: ShippingEnvGuards,
): ShippingCapabilities {
  const enabled = config.status === "ENABLED";
  const creds = config.credentials ?? [];
  const has = (type: ShippingCredentialType): boolean => creds.some((c) => c.type === type && c.configured);

  switch (config.provider) {
    case "MOCK":
      return {
        canTestConnection: true,
        canCalculateRate: enabled,
        canCreateTestShipment: enabled,
        canCreateOrder: enabled,
        canCreateBarcode: enabled,
        canPurchaseLabel: false,
        destructiveActionsDisabledReason: null,
      };
    case "GELIVER": {
      const canLabel = enabled && config.allowLabelPurchase && env.labelPurchase;
      return {
        canTestConnection: true,
        canCalculateRate: false,
        canCreateTestShipment: enabled && has("DEFAULT"),
        canCreateOrder: false,
        canCreateBarcode: false,
        canPurchaseLabel: canLabel,
        destructiveActionsDisabledReason: canLabel ? null : "LABEL_PURCHASE_DISABLED",
      };
    }
    case "DHL_ECOMMERCE": {
      const canOrder = enabled && config.allowOrderCreate && env.orderCreate;
      const canBarcode = enabled && config.allowBarcodeCreate && env.barcodeCreate;
      return {
        canTestConnection: true,
        canCalculateRate: enabled && has("STANDARD_QUERY"),
        canCreateTestShipment: false,
        canCreateOrder: canOrder,
        canCreateBarcode: canBarcode,
        canPurchaseLabel: false,
        destructiveActionsDisabledReason: canOrder || canBarcode ? null : "ORDER_CREATE_DISABLED",
      };
    }
    default:
      return {
        canTestConnection: true,
        canCalculateRate: false,
        canCreateTestShipment: false,
        canCreateOrder: false,
        canCreateBarcode: false,
        canPurchaseLabel: false,
        destructiveActionsDisabledReason: null,
      };
  }
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
  env: ShippingEnvGuards,
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
    capabilities: computeShippingCapabilities(config, env),
  };
}
