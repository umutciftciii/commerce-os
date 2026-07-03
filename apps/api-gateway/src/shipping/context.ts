import type { AppConfig } from "@commerce-os/config";
import type {
  ShippingCredentialType,
  ShippingProviderConfig,
  ShippingProviderCredential,
} from "@prisma/client";
import { createShippingSecretCipher } from "./encryption.js";
import type {
  ResolvedShippingCredential,
  ResolvedShippingCredentials,
  ShippingActionContext,
} from "./types.js";

/**
 * TODO-129 — Provider config → ShippingActionContext kurulumu (routes.ts closure'indan
 * TASINDI, davranis DEGISMEDI). Hem admin route'lari hem zamanlanmis sync worker'i
 * (sync-service/sync-worker) ayni credential cozme + guard hesaplamasini paylasir.
 * Decrypt edilmis degerler ASLA loglanmaz/serialize edilmez.
 */

export type ConfigWithCredentials = ShippingProviderConfig & {
  credentials: ShippingProviderCredential[];
};

export function decryptShippingCredentials(
  config: AppConfig,
  cfg: ConfigWithCredentials,
): ResolvedShippingCredentials {
  const secret = createShippingSecretCipher(config.SHIPPING_ENCRYPTION_KEY);
  const byType: Partial<Record<ShippingCredentialType, ResolvedShippingCredential>> = {};
  for (const cred of cfg.credentials) {
    byType[cred.type] = {
      type: cred.type,
      key: cred.encryptedKey ? secret.decrypt(cred.encryptedKey) : null,
      secret: cred.encryptedSecret ? secret.decrypt(cred.encryptedSecret) : null,
      customerNumber: cred.encryptedCustomerNumber ? secret.decrypt(cred.encryptedCustomerNumber) : null,
      customerPassword: cred.encryptedCustomerPassword ? secret.decrypt(cred.encryptedCustomerPassword) : null,
      identityType: cred.identityType,
    };
  }
  return { byType };
}

export function buildShippingActionContext(
  config: AppConfig,
  cfg: ConfigWithCredentials,
): ShippingActionContext {
  return {
    provider: cfg.provider,
    mode: cfg.mode,
    credentials: decryptShippingCredentials(config, cfg),
    guards: {
      allowRecipientCreate: config.DHL_ECOMMERCE_ALLOW_RECIPIENT_CREATE && cfg.allowRecipientCreate,
      allowOrderCreate: config.DHL_ECOMMERCE_ALLOW_ORDER_CREATE && cfg.allowOrderCreate,
      allowBarcodeCreate: config.DHL_ECOMMERCE_ALLOW_BARCODE_CREATE && cfg.allowBarcodeCreate,
      allowLabelPurchase: config.GELIVER_ALLOW_LABEL_PURCHASE && cfg.allowLabelPurchase,
      // F3C.3 (ADR-045): cancel, order-create ile ayni provider-config kapisini (allowOrderCreate)
      // ve ayrica DHL_ECOMMERCE_ALLOW_CANCEL env'ini gerektirir. Dedike provider toggle TODO-121.
      allowCancel: config.DHL_ECOMMERCE_ALLOW_CANCEL && cfg.allowOrderCreate,
    },
  };
}
