import type {
  Shipment,
  ShipmentStatus,
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
  // F3C.5 — generic cancel yeteneginin UI'da dogru disabled gosterilmesi icin.
  cancel: boolean;
}

/** Credential "kayitli mi" durumu — GERCEK baglanti testinden BAGIMSIZDIR. */
export type ShippingCredentialStatus = "CONFIGURED" | "INCOMPLETE" | "MISSING";
/** Son GERCEK provider HTTP testinin sonucu (null lastTestStatus => UNTESTED). */
export type SerializedConnectionStatus = "UNTESTED" | "OK" | "FAILED" | "HTTP_DISABLED" | "SKIPPED";

export interface SerializedShippingProviderConfig {
  id: string;
  provider: ShippingProviderType;
  mode: ShippingProviderMode;
  status: ShippingProviderStatus;
  displayName: string;
  // F3C.5 (TODO-121) — public provider logo (secret DEGIL).
  logoUrl: string | null;
  logoAlt: string | null;
  allowRecipientCreate: boolean;
  allowOrderCreate: boolean;
  allowBarcodeCreate: boolean;
  allowLabelPurchase: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastErrorCode: string | null;
  // TODO-094B — "credential kayitli" ile "gercek baglanti dogrulandi" AYRIMI.
  credentialStatus: ShippingCredentialStatus;
  connectionStatus: SerializedConnectionStatus;
  lastProviderHttpStatus: number | null;
  lastProviderTestType: string | null;
  lastProviderTestAt: string | null;
  lastProviderErrorCode: string | null;
  // TODO-104 — webhook secret+token kayitli mi (yalniz boolean; secret/token DONMEZ).
  webhookConfigured: boolean;
  createdAt: string;
  updatedAt: string;
  credentials: SerializedShippingCredential[];
  capabilities: ShippingCapabilities;
}

/** Provider'a gore zorunlu credential tipleri (MOCK credential gerektirmez). */
const REQUIRED_CREDENTIALS: Partial<Record<ShippingProviderType, ShippingCredentialType[]>> = {
  GELIVER: ["DEFAULT"],
  DHL_ECOMMERCE: ["IDENTITY", "STANDARD_COMMAND", "STANDARD_QUERY", "BARCODE_COMMAND"],
};

/** credentialStatus: zorunlu tiplerin kaci `configured`? hepsi/bir kismi/hicbiri. */
export function computeCredentialStatus(
  config: ShippingProviderConfig & { credentials?: ShippingProviderCredential[] },
): ShippingCredentialStatus {
  const required = REQUIRED_CREDENTIALS[config.provider];
  if (!required || required.length === 0) return "CONFIGURED"; // MOCK
  const creds = config.credentials ?? [];
  const setCount = required.filter((type) => creds.some((c) => c.type === type && c.configured)).length;
  if (setCount === 0) return "MISSING";
  if (setCount < required.length) return "INCOMPLETE";
  return "CONFIGURED";
}

/** connectionStatus: persistli lastTestStatus -> bilinen degerlerden biri; yoksa UNTESTED. */
export function deriveConnectionStatus(lastTestStatus: string | null): SerializedConnectionStatus {
  switch (lastTestStatus) {
    case "OK":
    case "FAILED":
    case "HTTP_DISABLED":
    case "SKIPPED":
      return lastTestStatus;
    default:
      return "UNTESTED";
  }
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

/* ─────────────────── F3C.5 (TODO-121) Provider-agnostic shipment operasyonu ───────────────────
 * Generic (provider-agnostic) aksiyon yetenekleri, KPI gruplari ve provider gorunum DTO'su.
 * UI bu projeksiyonlara gore CTA acar/kapatir; provider-spesifik mantik backend'de kalir. */

export interface GenericShipmentCapabilities {
  canPrepare: boolean;
  canCreateLabel: boolean;
  canSync: boolean;
  canCancel: boolean;
  canManualTracking: boolean;
  disabledReason: string | null;
}

export interface SerializedShipmentProviderInfo {
  configId: string | null;
  type: ShippingProviderType;
  displayName: string;
  status: ShippingProviderStatus | null;
  logoUrl: string | null;
  logoAlt: string | null;
}

/** Provider config silinmis/yok ise generic gorunum icin makul fallback ad. */
const PROVIDER_FALLBACK_NAME: Record<ShippingProviderType, string> = {
  MOCK: "MOCK",
  GELIVER: "Geliver",
  DHL_ECOMMERCE: "DHL eCommerce",
};

export function buildShipmentProviderInfo(
  provider: ShippingProviderType,
  config: (ShippingProviderConfig & { credentials?: ShippingProviderCredential[] }) | null,
): SerializedShipmentProviderInfo {
  return {
    configId: config?.id ?? null,
    type: provider,
    displayName: config?.displayName ?? PROVIDER_FALLBACK_NAME[provider],
    status: config?.status ?? null,
    logoUrl: config?.logoUrl ?? null,
    logoAlt: config?.logoAlt ?? null,
  };
}

/** Yalniz DHL operasyonel status/track sync uygular; MOCK/GELIVER icin sync desteklenmez. */
const SYNC_PROVIDERS: ShippingProviderType[] = ["DHL_ECOMMERCE"];
/** Iptal/basarisiz OLMAYAN durumlar aktif sayilir (aksiyonlar bunlara bagli). */
function isActiveShipmentStatus(status: ShipmentStatus): boolean {
  return status !== "CANCELLED" && status !== "FAILED";
}

/** Hazirlik asamasi durumlari — manuel takip no girilince IN_TRANSIT'e ilerler. */
const MANUAL_TRACKING_PREP_STATUSES: ShipmentStatus[] = [
  "DRAFT",
  "ORDER_CREATED",
  "LABEL_PENDING",
  "LABEL_CREATED",
];

/**
 * Manuel takip no = admin'in operasyonel "kargo sureci basladi" sinyali. Hazirlik
 * asamasindaki gönderi IN_TRANSIT'e ilerler; daha ileri/terminal durumlar KORUNUR
 * (regres yok). Bu ilerletme YALNIZ explicit manuel tracking aksiyonu icindir —
 * DHL createbarcode sonrasi OTOMATIK "kargoya verildi" handoff DEGILDIR (ADR-046).
 */
export function manualTrackingNextStatus(current: ShipmentStatus): ShipmentStatus {
  return MANUAL_TRACKING_PREP_STATUSES.includes(current) ? "IN_TRANSIT" : current;
}

/**
 * Provider capability + shipment durumu → generic (provider-agnostic) aksiyon yetkileri.
 * DHL mevcutta prepare/barcode/sync/cancel destekler; Geliver/MOCK desteklemedigi
 * aksiyonda disabled doner. canManualTracking saglayiciya CAGRI YAPMAZ → aktif shipment'te
 * her zaman acik. Backend gercek guard'lari ayrica uygular (capability yalniz UI ipucu).
 */
export function computeShipmentActionCapabilities(
  config: (ShippingProviderConfig & { credentials?: ShippingProviderCredential[] }) | null,
  shipment: Pick<Shipment, "status" | "externalShipmentId" | "provider">,
  env: ShippingEnvGuards,
): GenericShipmentCapabilities {
  const active = isActiveShipmentStatus(shipment.status);
  const enabled = config?.status === "ENABLED";
  const base = config ? computeShippingCapabilities(config, env) : null;

  const canPrepare = Boolean(enabled && base && shipment.status === "DRAFT" && base.canCreateOrder);
  const canCreateLabel = Boolean(
    enabled &&
      base &&
      active &&
      (shipment.status === "ORDER_CREATED" || shipment.status === "LABEL_PENDING") &&
      (base.canCreateBarcode || base.canPurchaseLabel || base.canCreateTestShipment),
  );
  const canSync = Boolean(enabled && active && SYNC_PROVIDERS.includes(shipment.provider));
  const canCancel = Boolean(
    enabled && active && shipment.externalShipmentId && base?.canCreateOrder && env.cancel,
  );
  // Manuel takip: provider'a cagri YOK; aktif gönderide her zaman mumkun.
  const canManualTracking = active;

  const none = !canPrepare && !canCreateLabel && !canSync && !canCancel && !canManualTracking;
  const disabledReason = none ? (active ? "PROVIDER_ACTIONS_DISABLED" : "SHIPMENT_INACTIVE") : null;
  return { canPrepare, canCreateLabel, canSync, canCancel, canManualTracking, disabledReason };
}

/** KPI kartlari icin shipment durum kovasi (null => sayilmaz: DRAFT/CANCELLED). */
export type ShipmentKpiBucket = "prepared" | "awaitingLabel" | "inTransit" | "delivered" | "problem";
export function shipmentKpiBucket(status: ShipmentStatus): ShipmentKpiBucket | null {
  switch (status) {
    case "ORDER_CREATED":
    case "LABEL_CREATED":
      return "prepared";
    case "LABEL_PENDING":
      return "awaitingLabel";
    case "IN_TRANSIT":
    case "OUT_FOR_DELIVERY":
      return "inTransit";
    case "DELIVERED":
      return "delivered";
    case "DELIVERY_FAILED":
    case "RETURNED":
    case "FAILED":
      return "problem";
    default:
      return null;
  }
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
    logoUrl: config.logoUrl ?? null,
    logoAlt: config.logoAlt ?? null,
    allowRecipientCreate: config.allowRecipientCreate,
    allowOrderCreate: config.allowOrderCreate,
    allowBarcodeCreate: config.allowBarcodeCreate,
    allowLabelPurchase: config.allowLabelPurchase,
    lastTestedAt: config.lastTestedAt ? config.lastTestedAt.toISOString() : null,
    lastTestStatus: config.lastTestStatus,
    lastErrorCode: config.lastErrorCode,
    credentialStatus: computeCredentialStatus(config),
    connectionStatus: deriveConnectionStatus(config.lastTestStatus),
    lastProviderHttpStatus: config.lastProviderHttpStatus ?? null,
    lastProviderTestType: config.lastProviderTestType ?? null,
    lastProviderTestAt: config.lastTestedAt ? config.lastTestedAt.toISOString() : null,
    lastProviderErrorCode: config.lastErrorCode,
    webhookConfigured: Boolean(config.webhookToken && config.webhookSecretCipher),
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
    credentials: (config.credentials ?? []).map(serializeShippingCredential),
    capabilities: computeShippingCapabilities(config, env),
  };
}
