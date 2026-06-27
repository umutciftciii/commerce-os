import type {
  PaymentMethodType,
  PaymentProviderMode,
  PaymentProviderStatus,
  PaymentProviderType,
  ThreeDsMode,
} from "@prisma/client";
import type { SecretCipher } from "./encryption.js";

/**
 * F3B.2 — Provider config'i CLIENT-GUVENLI sekilde serialize eder.
 *
 * Secret alanlar (apiKey/secretKey/webhookSecret) ASLA duz metin/ciphertext olarak
 * donmez. apiKey icin yalnizca maskeli son-4 gosterilir (opsiyonel cipher ile);
 * secretKey/webhookSecret icin yalnizca "set mi?" boolean'i doner.
 */

export interface ProviderConfigRecord {
  id: string;
  storeId: string;
  provider: PaymentProviderType;
  displayName: string;
  status: PaymentProviderStatus;
  mode: PaymentProviderMode;
  priority: number;
  supportedMethods: PaymentMethodType[];
  supportedCurrencies: string[];
  minAmount: number | null;
  maxAmount: number | null;
  threeDsMode: ThreeDsMode;
  installmentEnabled: boolean;
  fallbackEnabled: boolean;
  merchantId: string | null;
  callbackUrl: string | null;
  apiKeyCipher: string | null;
  secretKeyCipher: string | null;
  webhookSecretCipher: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  lastTestAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedProviderConfig {
  id: string;
  provider: PaymentProviderType;
  displayName: string;
  status: PaymentProviderStatus;
  mode: PaymentProviderMode;
  priority: number;
  supportedMethods: PaymentMethodType[];
  supportedCurrencies: string[];
  minAmount: number | null;
  maxAmount: number | null;
  threeDsMode: ThreeDsMode;
  installmentEnabled: boolean;
  fallbackEnabled: boolean;
  merchantId: string | null;
  callbackUrl: string | null;
  apiKeySet: boolean;
  apiKeyMasked: string | null;
  secretKeySet: boolean;
  webhookSecretSet: boolean;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  lastTestAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function serializeProviderConfig(
  config: ProviderConfigRecord,
  options: { cipher?: SecretCipher } = {},
): SerializedProviderConfig {
  const apiKeySet = Boolean(config.apiKeyCipher);
  let apiKeyMasked: string | null = null;
  if (apiKeySet) {
    if (options.cipher) {
      try {
        apiKeyMasked = options.cipher.mask(options.cipher.decrypt(config.apiKeyCipher!));
      } catch {
        // Cozulemezse (ornegin anahtar degisti) sizdirmadan jenerik maske.
        apiKeyMasked = "••••";
      }
    } else {
      apiKeyMasked = "••••";
    }
  }

  return {
    id: config.id,
    provider: config.provider,
    displayName: config.displayName,
    status: config.status,
    mode: config.mode,
    priority: config.priority,
    supportedMethods: config.supportedMethods,
    supportedCurrencies: config.supportedCurrencies,
    minAmount: config.minAmount,
    maxAmount: config.maxAmount,
    threeDsMode: config.threeDsMode,
    installmentEnabled: config.installmentEnabled,
    fallbackEnabled: config.fallbackEnabled,
    merchantId: config.merchantId,
    callbackUrl: config.callbackUrl,
    apiKeySet,
    apiKeyMasked,
    secretKeySet: Boolean(config.secretKeyCipher),
    webhookSecretSet: Boolean(config.webhookSecretCipher),
    lastTestStatus: config.lastTestStatus,
    lastTestMessage: config.lastTestMessage,
    lastTestAt: config.lastTestAt ? config.lastTestAt.toISOString() : null,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}
