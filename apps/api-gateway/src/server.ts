import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { verifyPassword } from "@commerce-os/auth";
import type { AppConfig } from "@commerce-os/config";
import {
  adminStoreCreateRequestSchema,
  adminStoreListResponseSchema,
  adminStoreSchema,
  adminStoreUpdateRequestSchema,
  healthResponseSchema,
  inventoryAdjustRequestSchema,
  inventoryAdjustmentResponseSchema,
  inventoryItemSchema,
  inventoryListResponseSchema,
  orderCancelRequestSchema,
  orderCreateRequestSchema,
  orderLineInputSchema,
  orderLineUpdateRequestSchema,
  orderListQuerySchema,
  orderListResponseSchema,
  orderSchema,
  orderUpdateRequestSchema,
  pickOrderShipmentStatus,
  paymentProviderConfigCreateRequestSchema,
  paymentProviderConfigListResponseSchema,
  paymentProviderConfigSchema,
  paymentProviderConfigUpdateRequestSchema,
  paymentProviderEventListResponseSchema,
  paymentProviderReorderRequestSchema,
  paymentProviderStatusUpdateRequestSchema,
  paymentProviderTestConnectionResponseSchema,
  planCreateRequestSchema,
  planListResponseSchema,
  planSchema,
  planUpdateRequestSchema,
  platformLoginRequestSchema,
  platformLoginResponseSchema,
  platformLogoutResponseSchema,
  platformMeResponseSchema,
  productCategoryCreateRequestSchema,
  productCategoryListResponseSchema,
  productCategorySchema,
  productCategoryUpdateRequestSchema,
  storeSettingsSchema,
  storeSettingsUpdateRequestSchema,
  productCreateRequestSchema,
  resolvePrimaryCategorySelection,
  productListResponseSchema,
  productPriceChangeListResponseSchema,
  productPriceChangeSchema,
  productSchema,
  productUpdateRequestSchema,
  productVariantCreateRequestSchema,
  productVariantListResponseSchema,
  productVariantSchema,
  productVariantUpdateRequestSchema,
  publicCartRequestSchema,
  publicCartSchema,
  publicCheckoutRequestSchema,
  publicCouponClaimRequestSchema,
  publicCouponClaimResponseSchema,
  publicCouponCenterResponseSchema,
  publicWalletCouponSchema,
  type PublicCouponReason,
  publicOrderConfirmationSchema,
  publicPaymentAvailabilitySchema,
  publicPaymentResultSchema,
  publicPaymentStateSchema,
  publicPaymentSubmitRequestSchema,
  publicProductDetailSchema,
  publicProductListResponseSchema,
  publicCampaignSlidesResponseSchema,
  // ADR-065 (Faz 3/Site Kabuğu) — public marka bilgisi + hero slide'lari.
  publicStoreInfoSchema,
  publicHeroSlidesResponseSchema,
  publicProductSchema,
  storeAdminCustomerListResponseSchema,
  storeAdminCustomerSummarySchema,
  digitsOnly,
  type PublicCheckoutBilling,
} from "@commerce-os/contracts";
import {
  installmentOptionsFor,
  scenarioFromCardNumber,
  validateCard,
} from "./payments/card.js";
import {
  createPrismaCustomerDataAccess,
  registerCustomerAdminRoutes,
  registerCustomerRoutes,
  resolveCustomerFromRequest,
  type CustomerDataAccess,
} from "./customers/index.js";
import { registerShippingAdminRoutes } from "./shipping/routes.js";
import {
  createPrismaShippingWebhookPersistence,
  registerShippingWebhookRoutes,
} from "./shipping/webhook-routes.js";
import { registerShippingRatePlanRoutes } from "./shipping/rate-plan-routes.js";
import { registerMediaAdminRoutes } from "./media/routes.js";
import { LocalDiskDriver } from "./media/local-disk-driver.js";
// ADR-065 (Faz 2/Dilim 3) — kategori GET response'unda imageUrl'u storageKey'den
// turetmek icin. server.ts'in resolveMediaUrl'u ilk tuketen yeri.
import { resolveMediaUrl } from "./media/url.js";
// Faz 3/Dilim 6a+6b — sepet/onay + hesap-siparisleri kapak URL haritasi (paylasilan,
// tek allowlist noktasi; N+1'siz). buildCartCoverUrlMap bunu delege eder.
import { buildProductCoverUrlMap } from "./media/cover.js";
// F4A — Kampanya/kupon modulu (ADR-058): saf indirim motoru + veri erisimi + admin uclari.
import {
  computeDiscounts,
  normalizeCouponCode,
  type DiscountCartLine,
  type DiscountContext,
  type DiscountEngineResult,
} from "./campaigns/discount-engine.js";
import {
  applyOrderDiscountsInTransaction,
  CampaignRedemptionRejection,
  createPrismaCampaignDataAccess,
  type CampaignDataAccess,
  type CampaignRecord,
  type OrderDiscountInput,
  type RedemptionError,
} from "./campaigns/data.js";
import { registerCampaignAdminRoutes } from "./campaigns/routes.js";
import { registerWalletAdminRoutes } from "./campaigns/wallet-routes.js";
// ADR-065 (Faz 2/Dilim 5) — Ana sayfa hero slide yonetimi (CRUD temeli).
import { registerHeroAdminRoutes } from "./hero/routes.js";
import {
  createPrismaHeroDataAccess,
  serializePublicHeroSlide,
  type HeroDataAccess,
} from "./hero/data.js";
// Faz 1B (ADR-067) — Attribute katalog cekirdegi (store + platform CRUD).
import {
  registerPlatformAttributeRoutes,
  registerStoreAttributeRoutes,
} from "./attributes/routes.js";
import { createPrismaAttributeDataAccess, type AttributeDataAccess } from "./attributes/data.js";
import {
  createPrismaAttributeValueDataAccess,
  type AttributeValueDataAccess,
} from "./attribute-values/data.js";
import { createAttributeValueService, attributeValueErrorStatus } from "./attribute-values/service.js";
import { registerAttributeValueRoutes } from "./attribute-values/routes.js";
import {
  createPrismaWalletDataAccess,
  type CouponWithCampaign,
  type WalletDataAccess,
} from "./campaigns/wallet-data.js";
import {
  evaluateCouponClaim,
  projectCouponCenter,
  projectWalletCoupons,
  type CouponCenterUsedEntry,
  type WalletCandidate,
} from "./campaigns/wallet.js";
import { selectPublicCampaignDisplay } from "./campaigns/public-badge.js";
import { campaignAppliesToProduct } from "./campaigns/public-badge.js";
import { selectPublicCampaignSlides } from "./campaigns/public-badge.js";
// F4C (ADR-063/ADR-064) — KDV para matematigi (sunucu otoritesi) + siparis
// satis ozeti turetimi (snapshot-turevi; saf modul).
import { DEFAULT_VAT_RATE_BPS, splitGrossByVat, vatFromNet } from "@commerce-os/utils";
import { buildOrderSalesSummary } from "./orders/sales-summary.js";
import {
  computeStoreShippingQuote,
  listActiveRatePlans,
  resolveActiveRatePlan,
  toEnginePlan,
} from "./shipping/rate-plan-service.js";
import { resolveShippingDims } from "./shipping/price-engine.js";
import type { EngineAddress, EngineCart, EngineRatePlan } from "./shipping/price-engine.js";
import { buildShippingOptions, type ProviderDisplayMap } from "./shipping/checkout-options.js";
import { checkDatabaseHealth, prisma, type TransactionClient } from "@commerce-os/db";
import { createLogger } from "@commerce-os/logger";
import { checkRedisHealth } from "@commerce-os/queues";
import {
  PAYMENT_SCENARIOS,
  PaymentConfigError,
  createDisabledHttpTransport,
  createFetchHttpTransport,
  createPaymentAccessToken,
  createPaymentAdapterRegistry,
  createSecretCipher,
  resolvePaymentProviders,
  serializeProviderConfig,
  verifyPaymentAccessToken,
  type PaymentActionContext,
  type PaymentScenario,
  type ResolvableProviderConfig,
  type ResolvedCredentials,
  type SecretCipher,
} from "./payments/index.js";
import type {
  AuditAction,
  FulfillmentStatus,
  InventoryItem,
  InventoryMovement,
  InventoryReservation,
  Order as PrismaOrder,
  OrderAddress,
  OrderEvent,
  OrderLine,
  OrderStatus,
  PaymentAttempt as PrismaPaymentAttempt,
  PaymentAttemptStatus,
  PaymentMethodType,
  PaymentProviderConfig as PrismaPaymentProviderConfig,
  PaymentProviderEvent as PrismaPaymentProviderEvent,
  PaymentProviderEventType,
  PaymentProviderMode,
  PaymentProviderStatus,
  PaymentProviderType,
  PaymentStatus,
  Plan,
  PlatformSession,
  PlatformUser,
  Product,
  ProductCategory,
  ProductPriceChange,
  ProductPriceVisibility,
  ProductPrimaryAction,
  ProductSalesMode,
  ProductVariant,
  PriceChangeSource,
  ShipmentStatus,
  Store,
  StoreStatus,
  ThreeDsMode,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";

type ProductSalesOrderCode =
  | "PRODUCT_NOT_PURCHASABLE"
  | "PRODUCT_REQUIRES_INQUIRY"
  | "PRODUCT_REQUIRES_APPOINTMENT"
  | "PRODUCT_REQUIRES_WHATSAPP"
  | "PRODUCT_CATALOG_ONLY";
type ProductOrderValidationCode = ProductSalesOrderCode | "PRODUCT_ORDER_QUANTITY_OUT_OF_RANGE";

export interface ServerHealthChecks {
  checkDatabaseHealth?: () => Promise<boolean>;
  checkRedisHealth?: (redisUrl: string) => Promise<boolean>;
}

type PlatformUserRecord = Pick<PlatformUser, "id" | "email" | "name" | "passwordHash" | "role">;
type PlatformSessionRecord = Pick<PlatformSession, "id" | "expiresAt" | "revokedAt"> & {
  platformUser: PlatformUserRecord;
};
type StoreRecord = Pick<Store, "id" | "name" | "slug" | "status" | "metadata" | "createdAt" | "updatedAt"> & {
  domain?: string | null;
};
type PlanRecord = Pick<
  Plan,
  "id" | "code" | "name" | "description" | "metadata" | "createdAt" | "updatedAt"
>;
type CategoryRecord = Pick<
  ProductCategory,
  | "id"
  | "storeId"
  | "name"
  | "slug"
  | "parentId"
  | "sortOrder"
  | "status"
  | "imageId"
  | "createdAt"
  | "updatedAt"
> & { image: { storageKey: string } | null };
// ADR-065 (Faz 2/Dilim 4) — StoreSettings 1-1 kaydi; logo/favicon relation'lari
// yalniz storageKey tasir (URL runtime'da turetilir). storeName burada YOK; her
// zaman requireStorePlatformAdmin'in dondurdugu access.store.name'den gelir.
type StoreSettingsRecord = {
  storeId: string;
  logoMediaId: string | null;
  faviconMediaId: string | null;
  logo: { storageKey: string } | null;
  favicon: { storageKey: string } | null;
};
type ProductRecord = Pick<
  Product,
  | "id"
  | "storeId"
  | "title"
  | "slug"
  | "description"
  | "status"
  | "type"
  | "vendor"
  | "brand"
  | "seoTitle"
  | "seoDescription"
  | "salesMode"
  | "priceVisibility"
  | "primaryAction"
  | "inquiryEnabled"
  | "appointmentRequired"
  | "whatsappEnabled"
  | "purchasable"
  | "minOrderQuantity"
  | "maxOrderQuantity"
  | "callToActionLabel"
  | "whatsappMessageTemplate"
  | "inquiryFormTitle"
  | "appointmentNote"
  | "shippingWeightKg"
  | "shippingDesi"
  // Faz 1A (ADR-067) — ana kategori (admin projeksiyonunda doner; public'te turer).
  | "primaryCategoryId"
  | "createdAt"
  | "updatedAt"
> & { categoryIds: string[]; images: ProductImageRecord[] };
// ADR-065 (Faz 2/Dilim 2) — galeri ogesinin ham hali (storageKey tasinir, url
// serializeProduct'ta baseUrl ile turetilir). Liste yolunda [] kalir (hafif select).
type ProductImageRecord = {
  mediaId: string;
  position: number;
  storageKey: string;
  altText: string | null;
};
type VariantRecord = Pick<
  ProductVariant,
  | "id"
  | "productId"
  | "storeId"
  | "title"
  | "sku"
  | "barcode"
  | "priceMinor"
  | "compareAtMinor"
  | "costMinor"
  // F4C — KDV alanlari (priceMinor KDV DAHIL brut olarak kalir).
  | "netPriceMinor"
  | "vatRateBps"
  | "vatAmountMinor"
  | "currency"
  | "status"
  | "optionValues"
  | "shippingWeightKg"
  | "shippingDesi"
  | "createdAt"
  | "updatedAt"
>;
// F4B — Fiyat/liste/maliyet degisikligi audit kaydi (append-only).
type PriceChangeRecord = Pick<
  ProductPriceChange,
  | "id"
  | "storeId"
  | "productId"
  | "variantId"
  | "changedByPlatformUserId"
  | "currency"
  | "oldPriceMinor"
  | "newPriceMinor"
  | "oldCompareAtMinor"
  | "newCompareAtMinor"
  | "oldCostMinor"
  | "newCostMinor"
  | "source"
  | "reason"
  | "createdAt"
>;
type InventoryRecord = Pick<
  InventoryItem,
  "id" | "storeId" | "variantId" | "quantityOnHand" | "quantityReserved" | "lowStockThreshold" | "updatedAt"
> & { productId: string; sku: string; title: string };
type InventoryMovementRecord = Pick<
  InventoryMovement,
  | "id"
  | "storeId"
  | "variantId"
  | "type"
  | "quantityDelta"
  | "reason"
  | "referenceType"
  | "referenceId"
  | "actorUserId"
  | "createdAt"
>;
type OrderLineRecord = Pick<
  OrderLine,
  | "id"
  | "storeId"
  | "orderId"
  | "productId"
  | "variantId"
  | "sku"
  | "title"
  | "variantTitle"
  | "quantity"
  | "unitPriceAmount"
  | "totalAmount"
  | "currency"
  | "createdAt"
> & {
  // F4C (ADR-063/ADR-064) — Siparis ani KDV/maliyet/liste SNAPSHOT'lari.
  // Additive: eski kayitlarda (F4C oncesi siparisler / memory fixtures) null ya
  // da undefined olabilir; serialize `?? null` ile normalize eder.
  unitNetPriceMinor?: number | null;
  unitVatRateBps?: number | null;
  unitVatAmountMinor?: number | null;
  unitGrossPriceMinor?: number | null;
  unitListPriceMinor?: number | null;
  unitCostMinor?: number | null;
  lineNetAmountMinor?: number | null;
  lineVatAmountMinor?: number | null;
  lineGrossAmountMinor?: number | null;
  lineCostMinor?: number | null;
};
type OrderAddressRecord = Pick<
  OrderAddress,
  | "id"
  | "storeId"
  | "orderId"
  | "type"
  | "fullName"
  | "phone"
  | "countryCode"
  | "city"
  | "district"
  | "addressLine1"
  | "addressLine2"
  | "postalCode"
>;
type InventoryReservationRecord = Pick<
  InventoryReservation,
  | "id"
  | "storeId"
  | "orderId"
  | "orderLineId"
  | "variantId"
  | "quantity"
  | "status"
  | "expiresAt"
  | "releasedAt"
  | "consumedAt"
  | "createdAt"
  | "updatedAt"
>;
type OrderEventRecord = Pick<
  OrderEvent,
  "id" | "storeId" | "orderId" | "type" | "message" | "metadata" | "actorUserId" | "createdAt"
>;
type OrderRecord = Pick<
  PrismaOrder,
  | "id"
  | "storeId"
  | "orderNumber"
  | "customerId"
  | "customerEmail"
  | "currency"
  | "status"
  | "paymentStatus"
  | "fulfillmentStatus"
  | "subtotalAmount"
  | "discountAmount"
  | "shippingAmount"
  | "shippingCurrency"
  | "shippingSource"
  | "shippingRatePlanId"
  | "shippingRatePlanName"
  | "shippingProvider"
  | "shippingProviderName"
  | "shippingLogoUrl"
  | "shippingEtaText"
  | "taxAmount"
  | "totalAmount"
  | "placedAt"
  | "cancelledAt"
  | "cancelReason"
  | "billingType"
  | "billingName"
  | "billingTaxId"
  | "billingCompanyName"
  | "billingTaxOffice"
  | "billingTaxNumber"
  | "billingEmail"
  | "createdAt"
  | "updatedAt"
> & {
  lines: OrderLineRecord[];
  addresses: OrderAddressRecord[];
  reservations: InventoryReservationRecord[];
  events: OrderEventRecord[];
  paymentAttempts: PaymentAttemptRecord[];
  // TODO-135 — Karşılama rozeti için temsili kargo durumu türetilir (yalnız DURUM).
  shipments: { status: ShipmentStatus }[];
  // F4A.2 — Kampanya/kupon indirim SNAPSHOT satırları (OrderDiscount; tarihsel).
  discounts: OrderDiscountRecord[];
};

type OrderDiscountRecord = {
  id: string;
  campaignId: string | null;
  code: string | null;
  label: string;
  discountType: "PERCENT" | "FIXED_AMOUNT";
  discountValue: number;
  discountAmountMinor: number;
  createdAt: Date;
};

// F3B.3 — Store-admin müşteri dizini kaydı. Aggregate alanlar data-access'te
// hesaplanır; hash/token/OTP/tam PII ASLA bu kayda alınmaz.
type StoreAdminCustomerRecord = {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  status: "ACTIVE" | "PASSIVE" | "BLOCKED" | "ARCHIVED";
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  hasCredential: boolean;
  orderCount: number;
  totalSpentMinor: number;
  currency: string;
  lastOrderAt: Date | null;
  addressCount: number;
  defaultAddressSummary: string | null;
  createdAt: Date;
};

// --- F3B.2 Payment data-access record/input tipleri --------------------------
// Secret'lar yalniz ciphertext olarak tasinir; sifreleme/decrypt route katmaninda.
export type PaymentProviderConfigRecord = PrismaPaymentProviderConfig;
export type PaymentAttemptRecord = PrismaPaymentAttempt;
export type PaymentProviderEventRecord = PrismaPaymentProviderEvent;

export interface PaymentProviderConfigCreateInput {
  provider: PaymentProviderType;
  displayName: string;
  status: PaymentProviderStatus;
  mode: PaymentProviderMode;
  priority: number;
  supportedMethods: PaymentMethodType[];
  supportedCurrencies: string[];
  minAmount?: number | null;
  maxAmount?: number | null;
  threeDsMode: ThreeDsMode;
  installmentEnabled: boolean;
  fallbackEnabled: boolean;
  merchantId?: string | null;
  callbackUrl?: string | null;
  apiKeyCipher?: string | null;
  secretKeyCipher?: string | null;
  webhookSecretCipher?: string | null;
}

export interface PaymentProviderConfigUpdateInput {
  displayName?: string;
  status?: PaymentProviderStatus;
  mode?: PaymentProviderMode;
  priority?: number;
  supportedMethods?: PaymentMethodType[];
  supportedCurrencies?: string[];
  minAmount?: number | null;
  maxAmount?: number | null;
  threeDsMode?: ThreeDsMode;
  installmentEnabled?: boolean;
  fallbackEnabled?: boolean;
  merchantId?: string | null;
  callbackUrl?: string | null;
  // undefined => mevcut cipher KORUNUR; null => TEMIZLE; string => DEGISTIR.
  apiKeyCipher?: string | null;
  secretKeyCipher?: string | null;
  webhookSecretCipher?: string | null;
}

export interface PaymentAttemptCreateInput {
  orderId: string;
  providerConfigId: string;
  provider: PaymentProviderType;
  mode: PaymentProviderMode;
  method: PaymentMethodType;
  amount: number;
  currency: string;
  status: PaymentAttemptStatus;
  accessTokenHash: string;
  accessTokenExpiresAt: Date;
}

export interface PaymentAttemptOutcomeInput {
  attemptId: string;
  orderId: string;
  attemptStatus: PaymentAttemptStatus;
  threeDsApplied: boolean;
  scenario?: string | null;
  providerReference?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  // F3B.2 — turetilmis guvenli kart/taksit alanlari (full PAN/CVC ASLA).
  installmentCount?: number;
  cardBrand?: string | null;
  cardLast4?: string | null;
  paidAt?: Date | null;
  failedAt?: Date | null;
  /** null/undefined => order paymentStatus degismez. */
  orderPaymentStatus?: PaymentStatus | null;
  /** true => attempt access token gecersiz kilinir (tek kullanim / final). */
  clearAccessToken: boolean;
  event: {
    type: PaymentProviderEventType;
    provider: PaymentProviderType;
    eventId?: string | null;
    message?: string | null;
    metadata?: Record<string, unknown> | null;
  };
}

export interface PaymentProviderEventCreateInput {
  providerConfigId?: string | null;
  attemptId?: string | null;
  orderId?: string | null;
  provider: PaymentProviderType;
  type: PaymentProviderEventType;
  eventId?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
}

// F4A — Kampanya veri erisimi AppDataAccess'e dahildir; boylece test harness'i
// (MemoryDataAccess) public sepet/checkout indirim akisini DB'siz dogrulayabilir.
export interface AppDataAccess extends CampaignDataAccess {
  findPlatformUserByEmail(email: string): Promise<PlatformUserRecord | null>;
  createPlatformSession(input: {
    platformUserId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<Pick<PlatformSession, "id" | "expiresAt">>;
  findPlatformSessionByTokenHash(tokenHash: string): Promise<PlatformSessionRecord | null>;
  revokePlatformSession(sessionId: string): Promise<boolean>;
  listStores(input: { limit: number; offset: number }): Promise<{ data: StoreRecord[]; total: number }>;
  findStoreById(id: string): Promise<StoreRecord | null>;
  findStoreBySlug(slug: string): Promise<StoreRecord | null>;
  findStoreDomain(domain: string): Promise<{ id: string } | null>;
  createStore(input: {
    name: string;
    slug: string;
    status: StoreStatus;
    domain?: string;
    metadata?: Record<string, unknown>;
  }): Promise<StoreRecord>;
  updateStore(
    id: string,
    input: { name?: string; status?: StoreStatus; metadata?: Record<string, unknown> },
  ): Promise<StoreRecord | null>;
  listPlans(input: { limit: number; offset: number }): Promise<{ data: PlanRecord[]; total: number }>;
  findPlanById(id: string): Promise<PlanRecord | null>;
  findPlanByCode(code: string): Promise<PlanRecord | null>;
  createPlan(input: {
    code: string;
    name: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PlanRecord>;
  updatePlan(
    id: string,
    input: { name?: string; description?: string | null; metadata?: Record<string, unknown> },
  ): Promise<PlanRecord | null>;
  listCategories(
    storeId: string,
    input: { limit: number; offset: number },
  ): Promise<{ data: CategoryRecord[]; total: number }>;
  findCategoryById(storeId: string, categoryId: string): Promise<CategoryRecord | null>;
  findCategoryBySlug(storeId: string, slug: string): Promise<CategoryRecord | null>;
  // ADR-065 (Faz 2/Dilim 3) — imageId'nin ayni store'a ait olup olmadigini ve
  // context'ini dogrulamak icin (cross-tenant baglama reddi). Bulunamazsa null.
  findMediaAssetById(
    storeId: string,
    mediaId: string,
  ): Promise<{ id: string; context: string } | null>;
  createCategory(
    storeId: string,
    input: {
      name: string;
      slug: string;
      parentId?: string | null;
      sortOrder: number;
      status: "ACTIVE" | "ARCHIVED";
      imageId?: string | null;
    },
  ): Promise<CategoryRecord>;
  updateCategory(
    storeId: string,
    categoryId: string,
    input: {
      name?: string;
      slug?: string;
      parentId?: string | null;
      sortOrder?: number;
      status?: "ACTIVE" | "ARCHIVED";
      imageId?: string | null;
    },
  ): Promise<CategoryRecord | null>;
  // ADR-065 (Faz 2/Dilim 4) — magaza marka ayarlari (1-1 singleton). getStoreSettings
  // satir yoksa null doner (R2 lazy; GET tum-null gonderir, olusturma yapmaz).
  // upsertStoreSettings PK=FK storeId uzerinde upsert; update dalinda yalniz verilen
  // anahtarlar yazilir (absent=dokunma, null=temizle ayrimi cagiran tarafta korunur).
  getStoreSettings(storeId: string): Promise<StoreSettingsRecord | null>;
  upsertStoreSettings(
    storeId: string,
    input: { logoMediaId?: string | null; faviconMediaId?: string | null },
  ): Promise<StoreSettingsRecord>;
  listProducts(
    storeId: string,
    input: { limit: number; offset: number },
  ): Promise<{ data: ProductRecord[]; total: number }>;
  findProductById(storeId: string, productId: string): Promise<ProductRecord | null>;
  findProductBySlug(storeId: string, slug: string): Promise<ProductRecord | null>;
  // ADR-065 (Faz 3/Dilim 1) — public vitrin gorsel projeksiyonu icin batched gorsel
  // cekimi (N+1'siz). coverOnly=true → her urunun yalniz kapagi (distinct); false →
  // tam galeri (position ASC). Admin `listProducts`/`productSelect` DEGISMEZ (hafif
  // kalir); bu ayri ve public-yol'a ozgu metod. productId -> gorsel dizisi map'i doner.
  listProductImages(
    storeId: string,
    productIds: string[],
    coverOnly: boolean,
  ): Promise<Map<string, ProductImageRecord[]>>;
  createProduct(
    storeId: string,
    input: {
      title: string;
      slug: string;
      description?: string | null;
      status: "DRAFT" | "ACTIVE" | "ARCHIVED";
      type: "PHYSICAL";
      vendor?: string | null;
      brand?: string | null;
      seoTitle?: string | null;
      seoDescription?: string | null;
      salesMode: ProductSalesMode;
      priceVisibility: ProductPriceVisibility;
      primaryAction: ProductPrimaryAction;
      inquiryEnabled: boolean;
      appointmentRequired: boolean;
      whatsappEnabled: boolean;
      purchasable: boolean;
      minOrderQuantity: number;
      maxOrderQuantity?: number | null;
      callToActionLabel?: string | null;
      whatsappMessageTemplate?: string | null;
      inquiryFormTitle?: string | null;
      appointmentNote?: string | null;
      categoryIds: string[];
      // Faz 1A (ADR-067) — route'ta normalize edilmis ana kategori (assignments'tan biri
      // veya null). Data-access dogrudan yazar; tutarlilik guard'i route katmanindadir.
      primaryCategoryId?: string | null;
      shippingWeightKg?: number | null;
      shippingDesi?: number | null;
    },
  ): Promise<ProductRecord>;
  updateProduct(
    storeId: string,
    productId: string,
    input: {
      title?: string;
      slug?: string;
      description?: string | null;
      status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
      type?: "PHYSICAL";
      vendor?: string | null;
      brand?: string | null;
      seoTitle?: string | null;
      seoDescription?: string | null;
      salesMode?: ProductSalesMode;
      priceVisibility?: ProductPriceVisibility;
      primaryAction?: ProductPrimaryAction;
      inquiryEnabled?: boolean;
      appointmentRequired?: boolean;
      whatsappEnabled?: boolean;
      purchasable?: boolean;
      minOrderQuantity?: number;
      maxOrderQuantity?: number | null;
      callToActionLabel?: string | null;
      whatsappMessageTemplate?: string | null;
      inquiryFormTitle?: string | null;
      appointmentNote?: string | null;
      categoryIds?: string[];
      // Faz 1A (ADR-067) — undefined = dokunma; string/null = route'ta normalize edilmis
      // ana kategori. Assignment + primary yazimi ayni transaction icinde yapilir.
      primaryCategoryId?: string | null;
      shippingWeightKg?: number | null;
      shippingDesi?: number | null;
    },
  ): Promise<ProductRecord | null>;
  // ADR-065 (Faz 2/Dilim 2) — urun galerisini verilen sirali mediaId listesine
  // gore diff'ler (ekle/cikar/reorder tek transaction). [] = tam temizlik.
  // position = dizideki index (kapak = index 0). Product bulunamazsa null.
  updateProductImages(
    storeId: string,
    productId: string,
    orderedMediaIds: string[],
  ): Promise<ProductRecord | null>;
  listVariants(
    storeId: string,
    productId: string,
    input: { limit: number; offset: number },
  ): Promise<{ data: VariantRecord[]; total: number }>;
  findVariantById(storeId: string, productId: string, variantId: string): Promise<VariantRecord | null>;
  findVariantBySku(storeId: string, sku: string): Promise<VariantRecord | null>;
  createVariant(
    storeId: string,
    productId: string,
    input: {
      title: string;
      sku: string;
      barcode?: string | null;
      priceMinor: number;
      compareAtMinor?: number | null;
      costMinor?: number | null;
      // F4C — Sunucuda (route) hesaplanmis KDV cozumu; istemci degeri DEGILDIR.
      netPriceMinor: number;
      vatRateBps: number;
      vatAmountMinor: number;
      currency: string;
      status: "DRAFT" | "ACTIVE" | "ARCHIVED";
      optionValues?: Record<string, unknown> | null;
      lowStockThreshold?: number | null;
      shippingWeightKg?: number | null;
      shippingDesi?: number | null;
      // F4B — Fiyat/liste/maliyet baslangic audit'i icin aktor + kaynak.
      changedByPlatformUserId?: string | null;
      priceChangeSource?: PriceChangeSource;
    },
  ): Promise<VariantRecord>;
  updateVariant(
    storeId: string,
    productId: string,
    variantId: string,
    input: {
      title?: string;
      sku?: string;
      barcode?: string | null;
      priceMinor?: number;
      compareAtMinor?: number | null;
      costMinor?: number | null;
      // F4C — Sunucuda (route) hesaplanmis KDV cozumu; fiyat/oran degisiyorsa
      // UCU BIRDEN verilir (brut+net+KDV tutari tutarli yazilir).
      netPriceMinor?: number;
      vatRateBps?: number;
      vatAmountMinor?: number;
      currency?: string;
      status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
      optionValues?: Record<string, unknown> | null;
      lowStockThreshold?: number | null;
      shippingWeightKg?: number | null;
      shippingDesi?: number | null;
      // F4B — Fiyat/liste/maliyet degisikligi audit'i icin aktor + kaynak + sebep.
      changedByPlatformUserId?: string | null;
      priceChangeSource?: PriceChangeSource;
      priceChangeReason?: string | null;
    },
  ): Promise<VariantRecord | null>;
  // F4B — Varyant fiyat/liste/maliyet degisikligi gecmisi (yonetim; asla public).
  listPriceChanges(
    storeId: string,
    variantId: string,
    input: { limit: number; offset: number },
  ): Promise<{ data: PriceChangeRecord[]; total: number }>;
  // F4B — EU Omnibus: store'daki her variantId -> son N gunun en dusuk SATIS
  // fiyati (minor). 30 gunde fiyat degisikligi olmayan varyant haritada YOKTUR
  // (cagiran mevcut fiyata fallback eder).
  lowestRecentPriceByStore(storeId: string, sinceDays: number): Promise<Map<string, number>>;
  listInventory(
    storeId: string,
    input: { limit: number; offset: number },
  ): Promise<{ data: InventoryRecord[]; total: number }>;
  findInventoryByVariantId(storeId: string, variantId: string): Promise<InventoryRecord | null>;
  adjustInventory(
    storeId: string,
    variantId: string,
    input: {
      quantityDelta: number;
      reason?: string;
      referenceType?: string;
      referenceId?: string;
      actorUserId?: string;
    },
  ): Promise<{ item: InventoryRecord; movement: InventoryMovementRecord } | null | "NEGATIVE_STOCK">;
  listOrders(
    storeId: string,
    input: {
      limit: number;
      offset: number;
      status?: OrderStatus;
      paymentStatus?: PaymentStatus;
      fulfillmentStatus?: FulfillmentStatus;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ): Promise<{ data: OrderRecord[]; total: number }>;
  listCustomers(
    storeId: string,
    input: { limit: number; offset: number },
  ): Promise<{ data: StoreAdminCustomerRecord[]; total: number }>;
  findOrderById(storeId: string, orderId: string): Promise<OrderRecord | null>;
  /**
   * F3C.2 — Magazanin AKTIF DEFAULT kargo TARIFE planini (engine sekli) cozer.
   * Yoksa null. Kargo ucreti bu plandan hesaplanir; provider canli quote DEGIL.
   */
  resolveActiveShippingRatePlan(storeId: string): Promise<EngineRatePlan | null>;
  /**
   * TODO-125 — Magazanin TUM AKTIF kargo TARIFE planlari (checkout secenek listesi).
   * Sira: default once, sonra createdAt artan. Her biri bir kargo SECENEGI'dir.
   */
  listActiveShippingRatePlans(storeId: string): Promise<EngineRatePlan[]>;
  /**
   * TODO-125 — Magazanin ENABLED kargo saglayici config'lerinin PUBLIC gorunum
   * bilgisi (taşıyıcı adi + logo). provider tipine gore map'lenir; secret/credential
   * DONMEZ. Checkout seceneklerine taşıyıcı adi/logo eklemek icin kullanilir.
   */
  listShippingProviderDisplays(storeId: string): Promise<ProviderDisplayMap>;
  /**
   * F3C.2 — Sepet kargo quote PREVIEW'i icin teslimat adresinin sehir/ilce bilgisi.
   * Once isDefaultShipping=true; YOKSA en eski (createdAt asc) kayitli adrese duser —
   * checkout adres defterinin onsecimiyle (default ?? addresses[0]) AYNI sirada — ki
   * default isaretlenmemis ama adresi olan musteride preview ADDRESS_REQUIRED'da
   * takilmasin. Hicbir adres yoksa null. Nihai ucret checkout'ta SECILEN adresten
   * yeniden hesaplanir; bu yalniz onizleme adresidir.
   */
  findDefaultShippingAddress(
    storeId: string,
    customerId: string,
  ): Promise<{ city: string; district: string | null } | null>;
  createOrder(
    storeId: string,
    input: {
      customerId?: string | null;
      customerEmail: string;
      currency: string;
      lines: Array<{ variantId: string; quantity: number }>;
      /** Kargo ucreti (minor); store tarifesinden hesaplanir, verilmezse 0. */
      shippingAmount?: number;
      /**
       * F3C.2/TODO-125 — Kargo ucreti SNAPSHOT meta'si (kaynak + plan kimligi) +
       * SECILEN saglayici/secenek gorunum bilgisi (taşıyıcı/hizmet/logo/ETA).
       */
      shippingSnapshot?: {
        currency: string;
        source: "STORE_FIXED_RULE" | "STORE_SHIPPING_TARIFF" | "MOCK";
        ratePlanId: string | null;
        ratePlanName: string | null;
        provider?: "MOCK" | "GELIVER" | "DHL_ECOMMERCE" | null;
        providerName?: string | null;
        logoUrl?: string | null;
        etaText?: string | null;
      } | null;
      /** Toplam indirim (minor); F4A motor ciktisindan gelir, verilmezse 0. */
      discountAmount?: number;
      /**
       * F4A — Siparis indirim SNAPSHOT satirlari (ADR-058). Kampanyali satirlar
       * icin usage limitleri TRANSACTION icinde atomik yeniden dogrulanir ve
       * CampaignRedemption yazilir; limit asilirsa siparis OLUSMAZ.
       */
      discounts?: OrderDiscountInput[];
      addresses: Array<{
        type: "SHIPPING" | "BILLING";
        fullName: string;
        phone?: string | null;
        countryCode: string;
        city: string;
        district?: string | null;
        addressLine1: string;
        addressLine2?: string | null;
        postalCode?: string | null;
      }>;
      /** F3B.2 — Fatura kimlik/vergi bilgileri (adres OrderAddress BILLING'de). */
      billing?: {
        type: "INDIVIDUAL" | "CORPORATE";
        name?: string | null;
        taxId?: string | null;
        companyName?: string | null;
        taxOffice?: string | null;
        taxNumber?: string | null;
        email?: string | null;
      } | null;
      actorUserId?: string;
    },
  ): Promise<
    | OrderRecord
    | "CUSTOMER_NOT_FOUND"
    | "VARIANT_NOT_FOUND"
    | "INVALID_VARIANT"
    | RedemptionError
    | ProductOrderValidationCode
  >;
  updateOrder(
    storeId: string,
    orderId: string,
    input: { customerId?: string | null; customerEmail?: string; actorUserId?: string },
  ): Promise<OrderRecord | null | "CUSTOMER_NOT_FOUND" | "MUTATION_NOT_ALLOWED">;
  addOrderLine(
    storeId: string,
    orderId: string,
    input: { variantId: string; quantity: number; actorUserId?: string },
  ): Promise<
    OrderRecord | null | "VARIANT_NOT_FOUND" | "INVALID_VARIANT" | "MUTATION_NOT_ALLOWED" | ProductOrderValidationCode
  >;
  updateOrderLine(
    storeId: string,
    orderId: string,
    lineId: string,
    input: { quantity: number; actorUserId?: string },
  ): Promise<OrderRecord | null | "ORDER_LINE_NOT_FOUND" | "MUTATION_NOT_ALLOWED" | ProductOrderValidationCode>;
  placeOrder(
    storeId: string,
    orderId: string,
    input: { actorUserId?: string },
  ): Promise<
    OrderRecord | null | "INVALID_STATUS" | "INVALID_VARIANT" | "INSUFFICIENT_STOCK" | "RESERVATION_FAILED" | ProductOrderValidationCode
  >;
  cancelOrder(
    storeId: string,
    orderId: string,
    input: { reason?: string; actorUserId?: string },
  ): Promise<OrderRecord | null | "INVALID_STATUS" | "RESERVATION_FAILED">;
  // --- F3B.2 Payment provider operasyon altyapisi --------------------------
  listPaymentProviderConfigs(storeId: string): Promise<PaymentProviderConfigRecord[]>;
  findPaymentProviderConfigById(
    storeId: string,
    configId: string,
  ): Promise<PaymentProviderConfigRecord | null>;
  createPaymentProviderConfig(
    storeId: string,
    input: PaymentProviderConfigCreateInput,
  ): Promise<PaymentProviderConfigRecord | "PROVIDER_MODE_EXISTS">;
  updatePaymentProviderConfig(
    storeId: string,
    configId: string,
    input: PaymentProviderConfigUpdateInput,
  ): Promise<PaymentProviderConfigRecord | null | "PROVIDER_MODE_EXISTS">;
  setPaymentProviderStatus(
    storeId: string,
    configId: string,
    status: PaymentProviderStatus,
  ): Promise<PaymentProviderConfigRecord | null>;
  reorderPaymentProviderPriorities(
    storeId: string,
    items: Array<{ id: string; priority: number }>,
  ): Promise<PaymentProviderConfigRecord[] | "CONFIG_NOT_FOUND">;
  recordPaymentProviderTest(
    storeId: string,
    configId: string,
    input: { status: string; message: string; at: Date },
  ): Promise<PaymentProviderConfigRecord | null>;
  createPaymentAttempt(
    storeId: string,
    input: PaymentAttemptCreateInput,
  ): Promise<PaymentAttemptRecord>;
  findPaymentAttemptById(
    storeId: string,
    attemptId: string,
  ): Promise<PaymentAttemptRecord | null>;
  findLatestPaymentAttemptForOrder(
    storeId: string,
    orderId: string,
  ): Promise<PaymentAttemptRecord | null>;
  recordPaymentAttemptOutcome(
    storeId: string,
    input: PaymentAttemptOutcomeInput,
  ): Promise<PaymentAttemptRecord>;
  createPaymentProviderEvent(
    storeId: string,
    input: PaymentProviderEventCreateInput,
  ): Promise<PaymentProviderEventRecord>;
  findPaymentProviderEventByEventId(
    storeId: string,
    provider: PaymentProviderType,
    eventId: string,
  ): Promise<PaymentProviderEventRecord | null>;
  listPaymentProviderEvents(
    storeId: string,
    input: { providerConfigId?: string; limit: number; offset: number },
  ): Promise<PaymentProviderEventRecord[]>;
  createAuditLog(input: {
    action: AuditAction;
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface ServerDependencies extends ServerHealthChecks {
  dataAccess?: AppDataAccess;
  // F3B.3: Storefront musteri hesabi domaini icin ayri port (ADR-032). Varsayilan
  // prisma-backed; testlerde in-memory fake enjekte edilebilir.
  customerDataAccess?: CustomerDataAccess;
  // ADR-065 (Faz 3/Site Kabuğu): Hero slide veri erisimi (admin CRUD + public
  // PUBLISHED listesi). Varsayilan prisma-backed; testlerde fake enjekte edilebilir.
  heroDataAccess?: HeroDataAccess;
  // Faz 1B (ADR-067): Attribute katalog cekirdegi veri erisimi (store + platform
  // CRUD). Varsayilan prisma-backed; testlerde in-memory fake enjekte edilebilir.
  attributeDataAccess?: AttributeDataAccess;
  // Faz 2A (ADR-068): Urun/varyant attribute DEGER veri erisimi. Varsayilan prisma-backed;
  // testlerde in-memory fake enjekte edilebilir (attributeValueService bunun uzerine kurulur).
  attributeValueDataAccess?: AttributeValueDataAccess;
}

const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const idParamSchema = z.object({ id: z.string().min(1) });
const storeParamSchema = z.object({ storeId: z.string().min(1) });
const categoryParamSchema = z.object({ storeId: z.string().min(1), categoryId: z.string().min(1) });
const productParamSchema = z.object({ storeId: z.string().min(1), productId: z.string().min(1) });
const variantParamSchema = z.object({
  storeId: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().min(1),
});
const inventoryParamSchema = z.object({ storeId: z.string().min(1), variantId: z.string().min(1) });
const orderParamSchema = z.object({ storeId: z.string().min(1), orderId: z.string().min(1) });
const orderLineParamSchema = z.object({
  storeId: z.string().min(1),
  orderId: z.string().min(1),
  lineId: z.string().min(1),
});
const maxPostgresInt = 2_147_483_647;

const publicStoreParamSchema = z.object({ storeSlug: z.string().min(1).max(120) });
const publicProductParamSchema = z.object({
  storeSlug: z.string().min(1).max(120),
  productSlug: z.string().min(1).max(120),
});
// Public katalog kompozisyonu icin ust sinir; demo olcekte tum aktif urun/
// varyant/stok kaydini tek seferde toplamaya yeter (pagination query'si bunun
// uzerinde uygulanir).
const PUBLIC_CATALOG_MAX = 200;
// F4B — EU Omnibus "son N gunun en dusuk fiyati" penceresi (gun).
const OMNIBUS_WINDOW_DAYS = 30;

function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

// Faz 1A (ADR-067) — Ana kategori hata kodu -> stabil (Ingilizce) mesaj. i18n
// eslemesi store-admin `messageForError` tarafinda yapilir; kod stabildir.
function primaryCategoryErrorMessage(code: string): string {
  switch (code) {
    case "PRIMARY_CATEGORY_REQUIRED":
      return "A primary category is required when multiple categories are assigned.";
    case "PRIMARY_CATEGORY_NOT_ASSIGNED":
      return "The primary category must be one of the assigned categories.";
    case "PRIMARY_CATEGORY_STORE_MISMATCH":
      return "The primary category does not belong to this store.";
    case "PRIMARY_CATEGORY_ARCHIVED":
      return "An archived category cannot be set as the primary category.";
    case "PRIMARY_CATEGORY_ASSIGNMENT_CONFLICT":
      return "Cannot remove the primary category assignment without selecting a new primary category.";
    default:
      return "Primary category selection is invalid.";
  }
}

function bearerToken(request: FastifyRequest): string | null {
  return request.headers.authorization?.replace(/^Bearer\s+/i, "") || null;
}

function hashSessionToken(token: string, secret: string): string {
  return createHash("sha256").update(`${token}.${secret}`).digest("hex");
}

function serializeStore(store: StoreRecord) {
  return adminStoreSchema.parse({
    ...store,
    domain: store.domain ?? null,
    metadata: store.metadata ?? null,
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
  });
}

type LoginRateLimitEntry = { attempts: number; resetAt: number };

function createLoginRateLimiter(config: AppConfig) {
  const attempts = new Map<string, LoginRateLimitEntry>();
  const windowMs = config.AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS * 1000;
  const maxAttempts = config.AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS;

  function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  function keyForIp(ip: string) {
    return `ip:${ip}`;
  }

  function keyForEmail(email: string) {
    return `email:${normalizeEmail(email)}`;
  }

  function activeEntry(key: string, now: number) {
    const entry = attempts.get(key);
    if (!entry || entry.resetAt <= now) {
      attempts.delete(key);
      return null;
    }
    return entry;
  }

  function isLimited(ip: string, email: string, now = Date.now()) {
    return [keyForIp(ip), keyForEmail(email)].some((key) => {
      const entry = activeEntry(key, now);
      return entry ? entry.attempts >= maxAttempts : false;
    });
  }

  function recordFailure(ip: string, email: string, now = Date.now()) {
    for (const key of [keyForIp(ip), keyForEmail(email)]) {
      const entry = activeEntry(key, now);
      attempts.set(
        key,
        entry
          ? { attempts: entry.attempts + 1, resetAt: entry.resetAt }
          : { attempts: 1, resetAt: now + windowMs },
      );
    }
  }

  function reset(ip: string, email: string) {
    attempts.delete(keyForIp(ip));
    attempts.delete(keyForEmail(email));
  }

  return { isLimited, recordFailure, reset };
}

function serializePlan(plan: PlanRecord) {
  return planSchema.parse({
    ...plan,
    metadata: plan.metadata ?? null,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  });
}

function serializeCategory(category: CategoryRecord, baseUrl?: string) {
  return productCategorySchema.parse({
    ...category,
    parentId: category.parentId ?? null,
    // ADR-065 (Faz 2/Dilim 3) — imageId ham FK; imageUrl storageKey'den runtime'da
    // turetilir (MEDIA_PUBLIC_BASE_URL bos ise /media/<key>, doluysa CDN koku).
    imageId: category.imageId ?? null,
    imageUrl: category.image ? resolveMediaUrl(baseUrl, category.image.storageKey) : null,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  });
}

// ADR-065 (Faz 2/Dilim 4) — marka ayarlari serialize. row null olabilir (R2 lazy:
// henuz StoreSettings satiri yok) -> tum *MediaId/*Url null doner. storeName daima
// disaridan (access.store.name) verilir; satirdan turemez.
function serializeStoreSettings(
  storeId: string,
  storeName: string,
  row: StoreSettingsRecord | null,
  baseUrl?: string,
) {
  return storeSettingsSchema.parse({
    storeId,
    storeName,
    logoMediaId: row?.logoMediaId ?? null,
    logoUrl: row?.logo ? resolveMediaUrl(baseUrl, row.logo.storageKey) : null,
    faviconMediaId: row?.faviconMediaId ?? null,
    faviconUrl: row?.favicon ? resolveMediaUrl(baseUrl, row.favicon.storageKey) : null,
  });
}

function serializeProduct(product: ProductRecord, baseUrl?: string) {
  return productSchema.parse({
    ...product,
    description: product.description ?? null,
    vendor: product.vendor ?? null,
    brand: product.brand ?? null,
    seoTitle: product.seoTitle ?? null,
    seoDescription: product.seoDescription ?? null,
    maxOrderQuantity: product.maxOrderQuantity ?? null,
    callToActionLabel: product.callToActionLabel ?? null,
    whatsappMessageTemplate: product.whatsappMessageTemplate ?? null,
    inquiryFormTitle: product.inquiryFormTitle ?? null,
    appointmentNote: product.appointmentNote ?? null,
    categoryIds: product.categoryIds,
    // ADR-065 (Faz 2/Dilim 2) — position ASC sirali galeri; url storageKey'den
    // runtime'da turetilir. Liste yolunda images bos gelir (hafif select).
    images: product.images.map((image) => ({
      mediaId: image.mediaId,
      url: resolveMediaUrl(baseUrl, image.storageKey),
      altText: image.altText,
      position: image.position,
    })),
    // F3C.2 — Decimal -> number (sema number bekler).
    shippingWeightKg: decimalToNumber(product.shippingWeightKg),
    shippingDesi: decimalToNumber(product.shippingDesi),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  });
}

function serializeVariant(variant: VariantRecord) {
  return productVariantSchema.parse({
    ...variant,
    barcode: variant.barcode ?? null,
    compareAtMinor: variant.compareAtMinor ?? null,
    costMinor: variant.costMinor ?? null,
    // F4C — KDV alanlari; eski kayitlarda (backfill oncesi/memory) guvenli default.
    netPriceMinor: variant.netPriceMinor ?? null,
    vatRateBps: variant.vatRateBps ?? DEFAULT_VAT_RATE_BPS,
    vatAmountMinor: variant.vatAmountMinor ?? null,
    optionValues: variant.optionValues ?? null,
    // F3C.2 — Decimal -> number.
    shippingWeightKg: decimalToNumber(variant.shippingWeightKg),
    shippingDesi: decimalToNumber(variant.shippingDesi),
    createdAt: variant.createdAt.toISOString(),
    updatedAt: variant.updatedAt.toISOString(),
  });
}

function serializePriceChange(change: PriceChangeRecord) {
  return productPriceChangeSchema.parse({
    ...change,
    changedByPlatformUserId: change.changedByPlatformUserId ?? null,
    reason: change.reason ?? null,
    createdAt: change.createdAt.toISOString(),
  });
}

function serializeInventoryItem(item: InventoryRecord) {
  return inventoryItemSchema.parse({
    ...item,
    quantityAvailable: item.quantityOnHand - item.quantityReserved,
    lowStockThreshold: item.lowStockThreshold ?? null,
    updatedAt: item.updatedAt.toISOString(),
  });
}

function serializeInventoryMovement(movement: InventoryMovementRecord) {
  return {
    ...movement,
    reason: movement.reason ?? null,
    referenceType: movement.referenceType ?? null,
    referenceId: movement.referenceId ?? null,
    actorUserId: movement.actorUserId ?? null,
    createdAt: movement.createdAt.toISOString(),
  };
}

/**
 * TODO-125 — Siparise yazilmis SECILEN kargo saglayici/secenek SNAPSHOT'undan
 * musteri/admin-guvenli ozet uretir. Kargo snapshot'i yoksa (eski siparis) null.
 * provider secret/credential/iç alan TASIMAZ; yalniz gorunum bilgisi.
 */
function orderShippingSelectionOf(order: OrderRecord) {
  const hasSelection =
    order.shippingRatePlanId !== null ||
    order.shippingProviderName !== null ||
    order.shippingSource !== null;
  if (!hasSelection) return null;
  return {
    providerType: order.shippingProvider ?? null,
    providerName: order.shippingProviderName ?? order.shippingRatePlanName ?? null,
    serviceName: order.shippingRatePlanName ?? null,
    amountMinor: order.shippingAmount,
    currency: order.shippingCurrency ?? order.currency,
    freeShipping: order.shippingAmount === 0,
    estimatedDelivery: order.shippingEtaText ?? null,
    logoUrl: order.shippingLogoUrl ?? null,
    logoAlt: null,
  };
}

function serializeOrder(order: OrderRecord) {
  return orderSchema.parse({
    ...order,
    customerId: order.customerId ?? null,
    placedAt: order.placedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancelReason: order.cancelReason ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    lines: order.lines.map((line) => ({
      ...line,
      // F4C — Snapshot alanlari; legacy satirlarda null (yeniden HESAPLANMAZ).
      unitNetPriceMinor: line.unitNetPriceMinor ?? null,
      unitVatRateBps: line.unitVatRateBps ?? null,
      unitVatAmountMinor: line.unitVatAmountMinor ?? null,
      unitGrossPriceMinor: line.unitGrossPriceMinor ?? null,
      unitListPriceMinor: line.unitListPriceMinor ?? null,
      unitCostMinor: line.unitCostMinor ?? null,
      lineNetAmountMinor: line.lineNetAmountMinor ?? null,
      lineVatAmountMinor: line.lineVatAmountMinor ?? null,
      lineGrossAmountMinor: line.lineGrossAmountMinor ?? null,
      lineCostMinor: line.lineCostMinor ?? null,
      createdAt: line.createdAt.toISOString(),
    })),
    addresses: order.addresses.map((address) => ({
      ...address,
      phone: address.phone ?? null,
      district: address.district ?? null,
      addressLine2: address.addressLine2 ?? null,
      postalCode: address.postalCode ?? null,
    })),
    reservations: order.reservations.map((reservation) => ({
      ...reservation,
      expiresAt: reservation.expiresAt?.toISOString() ?? null,
      releasedAt: reservation.releasedAt?.toISOString() ?? null,
      consumedAt: reservation.consumedAt?.toISOString() ?? null,
      createdAt: reservation.createdAt.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
    })),
    events: order.events.map((event) => ({
      ...event,
      message: event.message ?? null,
      metadata: (event.metadata as Record<string, unknown> | null) ?? null,
      actorUserId: event.actorUserId ?? null,
      createdAt: event.createdAt.toISOString(),
    })),
    // F3B.2 — Fatura ozeti (admin allowlist). billingType yoksa null.
    billing: order.billingType
      ? {
          type: order.billingType,
          name: order.billingName ?? null,
          taxId: order.billingTaxId ?? null,
          companyName: order.billingCompanyName ?? null,
          taxOffice: order.billingTaxOffice ?? null,
          taxNumber: order.billingTaxNumber ?? null,
          email: order.billingEmail ?? null,
        }
      : null,
    // F3B.2 — Odeme denemeleri (gozlemlenebilirlik). accessTokenHash ASLA serialize edilmez.
    paymentAttempts: (order.paymentAttempts ?? []).map((attempt) => ({
      id: attempt.id,
      provider: attempt.provider,
      mode: attempt.mode,
      method: attempt.method,
      amount: attempt.amount,
      currency: attempt.currency,
      status: attempt.status,
      threeDsApplied: attempt.threeDsApplied,
      scenario: attempt.scenario ?? null,
      installmentCount: attempt.installmentCount,
      cardBrand: attempt.cardBrand ?? null,
      cardLast4: attempt.cardLast4 ?? null,
      providerReference: attempt.providerReference ?? null,
      failureCode: attempt.failureCode ?? null,
      failureMessage: attempt.failureMessage ?? null,
      paidAt: attempt.paidAt?.toISOString() ?? null,
      failedAt: attempt.failedAt?.toISOString() ?? null,
      createdAt: attempt.createdAt.toISOString(),
      updatedAt: attempt.updatedAt.toISOString(),
    })),
    // TODO-125 — Secilen kargo saglayici/secenek ozeti (store-admin siparis detayi).
    shippingSelection: orderShippingSelectionOf(order),
    // TODO-135 — Temsili kargo durumu (Order.fulfillmentStatus MUTATE EDILMEZ; yalniz
    // rozet gosterimi bunun uzerinden turetilir). Birden cok gonderi varsa en ileri.
    shipmentStatus: pickOrderShipmentStatus((order.shipments ?? []).map((s) => s.status)),
    // F4A.2 — Indirim SNAPSHOT satirlari (OrderDiscount). Tarihsel kayittir;
    // guncel kampanya kurallarindan YENIDEN HESAPLANMAZ. scopeSummary/ic metadata
    // sema disi kaldigi icin serialize edilmez.
    discounts: (order.discounts ?? []).map((discount) => ({
      id: discount.id,
      campaignId: discount.campaignId,
      code: discount.code,
      label: discount.label,
      discountType: discount.discountType,
      discountValue: discount.discountValue,
      discountAmountMinor: discount.discountAmountMinor,
      createdAt: discount.createdAt.toISOString(),
    })),
    // F4C (ADR-064) — Satis/kar ozeti: YALNIZ snapshot'lardan deterministik
    // turetilir (satir KDV/maliyet snapshot'i + OrderDiscount + PaymentAttempt).
    // Legacy (F4C oncesi) siparislerde `sales` bolumu null doner.
    salesSummary: buildOrderSalesSummary({
      currency: order.currency,
      subtotalAmount: order.subtotalAmount,
      discountAmount: order.discountAmount,
      shippingAmount: order.shippingAmount,
      totalAmount: order.totalAmount,
      paymentStatus: order.paymentStatus,
      lines: order.lines.map((line) => ({
        quantity: line.quantity,
        totalAmount: line.totalAmount,
        unitPriceAmount: line.unitPriceAmount,
        unitNetPriceMinor: line.unitNetPriceMinor ?? null,
        unitVatRateBps: line.unitVatRateBps ?? null,
        unitVatAmountMinor: line.unitVatAmountMinor ?? null,
        unitGrossPriceMinor: line.unitGrossPriceMinor ?? null,
        unitListPriceMinor: line.unitListPriceMinor ?? null,
        unitCostMinor: line.unitCostMinor ?? null,
        lineNetAmountMinor: line.lineNetAmountMinor ?? null,
        lineVatAmountMinor: line.lineVatAmountMinor ?? null,
        lineGrossAmountMinor: line.lineGrossAmountMinor ?? null,
        lineCostMinor: line.lineCostMinor ?? null,
      })),
      discounts: (order.discounts ?? []).map((discount) => ({
        label: discount.label,
        discountAmountMinor: discount.discountAmountMinor,
      })),
      paymentAttempts: (order.paymentAttempts ?? []).map((attempt) => ({
        status: attempt.status,
        amount: attempt.amount,
      })),
    }),
  });
}

// F3B.3 — Store-admin müşteri özeti. Yalnız güvenli/maskeli alanlar; hash/token/
// OTP/tam PII (TCKN/VKN/IBAN) bu yüzeyde yer almaz.
function serializeStoreAdminCustomer(customer: StoreAdminCustomerRecord) {
  const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  return storeAdminCustomerSummarySchema.parse({
    id: customer.id,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    firstName: customer.firstName ?? null,
    lastName: customer.lastName ?? null,
    fullName: fullName.length > 0 ? fullName : (customer.email ?? customer.phone ?? customer.id),
    status: customer.status,
    emailVerified: Boolean(customer.emailVerifiedAt),
    phoneVerified: Boolean(customer.phoneVerifiedAt),
    hasCredential: customer.hasCredential,
    orderCount: customer.orderCount,
    totalSpentMinor: customer.totalSpentMinor,
    currency: customer.currency,
    lastOrderAt: customer.lastOrderAt?.toISOString() ?? null,
    addressCount: customer.addressCount,
    defaultAddressSummary: customer.defaultAddressSummary ?? null,
    createdAt: customer.createdAt.toISOString(),
  });
}

/**
 * Public katalog DTO insaasi (TD-032). Bu builder'lar ham urun/varyant/stok
 * kayitlarini `publicProduct*` semalariyla (allowlist) serialize eder. Ic/
 * yonetim alanlari semada yer almadigindan `parse` sirasinda dusturulur ve
 * disari cikmaz. Fiyat gizliligi (HIDDEN/ON_REQUEST) durumunda numerik fiyat
 * null'lanir; sayisal fiyat public govdeye girmez.
 */
function isPublicPriceVisible(visibility: ProductPriceVisibility): boolean {
  return visibility === "VISIBLE" || visibility === "STARTING_FROM";
}

function publicCategoryLabel(
  product: Pick<ProductRecord, "categoryIds" | "primaryCategoryId">,
  categoryNames: Map<string, string>,
): string | null {
  // Faz 1A (ADR-067) — kategori etiketi/breadcrumb kaynagi ONCE ana kategoridir;
  // yoksa (legacy/null primary) mevcut "ilk assignment" davranisina fallback (geri
  // uyum: eski urunler ayni etiketi gostermeye devam eder).
  if (product.primaryCategoryId && categoryNames.has(product.primaryCategoryId)) {
    return categoryNames.get(product.primaryCategoryId) ?? null;
  }
  const first = product.categoryIds.find((id) => categoryNames.has(id));
  return first ? (categoryNames.get(first) ?? null) : null;
}

function buildPublicVariant(
  product: Pick<ProductRecord, "priceVisibility">,
  variant: VariantRecord,
  stockByVariantId: Map<string, number>,
  lowestByVariantId: Map<string, number> = new Map(),
) {
  const visible = isPublicPriceVisible(product.priceVisibility);
  const available = stockByVariantId.has(variant.id) ? stockByVariantId.get(variant.id)! : null;
  // F4B — EU Omnibus: yalnizca gecerli bir indirim (compareAt > price) varken ve
  // fiyat gorunurken son N gunun en dusuk SATIS fiyatini yansit; aksi halde null.
  const lowestPriceMinor =
    visible && variant.compareAtMinor != null && variant.compareAtMinor > variant.priceMinor
      ? Math.min(variant.priceMinor, lowestByVariantId.get(variant.id) ?? variant.priceMinor)
      : null;
  return {
    id: variant.id,
    title: variant.title,
    sku: variant.sku,
    priceMinor: visible ? variant.priceMinor : null,
    compareAtMinor: visible ? (variant.compareAtMinor ?? null) : null,
    lowestPriceMinor,
    currency: variant.currency,
    available,
    // Stok bilinmiyorsa (null) urunu yanlislikla tukenmis gostermeyiz.
    inStock: available === null ? true : available > 0,
  };
}

function buildPublicProduct(
  product: ProductRecord,
  activeVariants: VariantRecord[],
  categoryNames: Map<string, string>,
  stockByVariantId: Map<string, number>,
  // F4A.1/F4A.6 — Store-scoped ACTIVE+public kampanyalar; urun icin gosterim seti
  // (birincil + stackable ikincil kupon) BURADA secilir (allowlist projeksiyon).
  publicCampaigns: CampaignRecord[] = [],
  badgeNow: Date = new Date(),
  // F4B — EU Omnibus: variantId -> son N gunun en dusuk SATIS fiyati.
  lowestByVariantId: Map<string, number> = new Map(),
  // ADR-065 (Faz 3/Dilim 1) — MEDIA_PUBLIC_BASE_URL; gorsel url'i storageKey'den
  // turetmek icin (bos ise /media/<key> goreli, doluysa CDN koku). serializeProduct
  // deseniyle simetri. product.images'in ne tasidigina CAGIRAN karar verir (liste=kapak,
  // detay=tam galeri); bu fonksiyon yalniz serialize eder.
  baseUrl?: string,
) {
  const variants = activeVariants.map((variant) =>
    buildPublicVariant(product, variant, stockByVariantId, lowestByVariantId),
  );
  // F4C (ADR-063) — Kart taban fiyati = EN UCUZ gorunur (aktif) varyantin brut
  // fiyati. Vitrin karti artik fiyat ARALIGI gostermez; kampanya "Sepette"
  // tahmini de ayni taban uzerinden hesaplanir (kartla tutarli — F4A.6'daki
  // "yalniz tek-fiyatli urunde tahmin" kurali bilincli olarak bu tabana
  // genisletildi; kart tek fiyat gosterdigi icin tahmin artik yaniltici degil).
  const visiblePriceMinors = variants
    .map((variant) => variant.priceMinor)
    .filter((price): price is number => price !== null);
  const unitPriceMinor = visiblePriceMinors.length > 0 ? Math.min(...visiblePriceMinors) : null;
  const display = selectPublicCampaignDisplay(
    publicCampaigns,
    { id: product.id, categoryIds: product.categoryIds },
    badgeNow,
    unitPriceMinor,
  );
  return publicProductSchema.parse({
    campaign: display.primary,
    secondaryCoupon: display.secondaryCoupon,
    id: product.id,
    slug: product.slug,
    title: product.title,
    brand: product.brand ?? product.vendor ?? null,
    categoryLabel: publicCategoryLabel(product, categoryNames),
    salesMode: product.salesMode,
    priceVisibility: product.priceVisibility,
    primaryAction: product.primaryAction,
    purchasable: product.purchasable,
    whatsappEnabled: product.whatsappEnabled,
    inquiryEnabled: product.inquiryEnabled,
    appointmentRequired: product.appointmentRequired,
    minOrderQuantity: product.minOrderQuantity,
    maxOrderQuantity: product.maxOrderQuantity ?? null,
    variants,
    // ADR-065 (Faz 3/Dilim 1) — ALLOWLIST: yalniz turetilmis url + altText + position.
    // mediaId/storageKey BILINCLI olarak KONULMAZ (public'e sizmaz; publicProductSchema
    // zaten dusturur ama acikca elenir). Dizi position ASC gelir (record'un sirasi).
    images: product.images.map((image) => ({
      url: resolveMediaUrl(baseUrl, image.storageKey),
      altText: image.altText,
      position: image.position,
    })),
  });
}

/**
 * Public sepet cozumlemesi (F3B.1). Bir sepet referansi ({variantId, quantity})
 * yalnizca SUNUCUDAN okunan otoriter veriye (urun/varyant/stok) gore cozulur;
 * istemciden gelen fiyat/baslik/salesMode KABUL EDILMEZ. ONLINE + satilabilir +
 * gorunur fiyatli olmayan varyant UNAVAILABLE; stok yetersizse OUT_OF_STOCK;
 * min/max veya stok nedeniyle adet kisilirsa QUANTITY_ADJUSTED isaretlenir.
 */
interface CartResolvableVariant {
  variantId: string;
  /** F4A — Kampanya urun/kategori kapsam eslesmesi icin (public yanita TASINMAZ). */
  productId: string;
  categoryIds: string[];
  productSlug: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  salesMode: ProductSalesMode;
  purchasable: boolean;
  priceVisibility: ProductPriceVisibility;
  priceMinor: number;
  /** Dilim 6a-refine — Liste (compareAt) fiyati; ustu-cizili gosterim icin (null=yok). */
  compareAtMinor: number | null;
  currency: string;
  minOrderQuantity: number;
  maxOrderQuantity: number | null;
  /** Satilabilir stok adedi; bilinmiyorsa null (tukenmis sayilmaz). */
  available: number | null;
  /** F3C.2 — Kargo olcumu: varyant degeri ?? urun fallback (desi). null = eksik. */
  shippingDesi: number | null;
  /** F3C.2 — Kargo olcumu: varyant degeri ?? urun fallback (kg). null = eksik. */
  shippingWeightKg: number | null;
}

type PublicCartLineResult = ReturnType<typeof buildPublicCartLine>;

function buildPublicCartLine(
  entry: CartResolvableVariant,
  requestedQuantity: number,
  // ADR-065 (Faz 3/Dilim 6a) — Turetilmis kapak URL'i (cagiran batched hazirlar; N+1
  // yok). Gorsel yoksa null → vitrin deterministik yer tutucuya duser. UNAVAILABLE
  // satir da kapak tasir (kullaniciya urunu hatirlatir).
  imageUrl: string | null = null,
  // Dilim 6a-refine — Satir secim durumu (checkbox). false ise satir sepette gorunur
  // ama toplam/checkout'a girmez (secim assemblePublicCart'ta uygulanir).
  selected = true,
) {
  const base = {
    variantId: entry.variantId,
    productSlug: entry.productSlug,
    title: entry.productTitle,
    variantTitle: entry.variantTitle,
    sku: entry.sku,
    quantity: requestedQuantity,
    currency: entry.currency,
    minOrderQuantity: entry.minOrderQuantity,
    maxOrderQuantity: entry.maxOrderQuantity,
    imageUrl,
    selected,
  };

  // ONLINE disi / satilamaz / gizli fiyat -> siparise dusemez, fiyat tasimaz.
  const orderable =
    entry.salesMode === "ONLINE" && entry.purchasable && isPublicPriceVisible(entry.priceVisibility);
  if (!orderable) {
    return {
      ...base,
      availableQuantity: 0,
      unitPriceMinor: 0,
      lineTotalMinor: 0,
      inStock: false,
      status: "UNAVAILABLE" as const,
      compareAtMinor: null,
    };
  }

  // min/max limitlerine gore hedef adet.
  let target = Math.max(requestedQuantity, entry.minOrderQuantity);
  if (entry.maxOrderQuantity !== null) target = Math.min(target, entry.maxOrderQuantity);
  let status: "OK" | "OUT_OF_STOCK" | "QUANTITY_ADJUSTED" =
    target === requestedQuantity ? "OK" : "QUANTITY_ADJUSTED";

  const inStock = entry.available === null ? true : entry.available > 0;
  let availableQuantity = target;
  if (!inStock) {
    availableQuantity = 0;
    status = "OUT_OF_STOCK";
  } else if (entry.available !== null && availableQuantity > entry.available) {
    availableQuantity = entry.available;
    status = "QUANTITY_ADJUSTED";
  }

  const unitPriceMinor = entry.priceMinor;
  // Dilim 6a-refine — Ustu-cizili liste fiyati: yalnizca gecerli indirim varken
  // (compareAt > satis). PDP buy-box compareAt kurali ile simetri.
  const compareAtMinor =
    entry.compareAtMinor != null && entry.compareAtMinor > unitPriceMinor ? entry.compareAtMinor : null;
  return {
    ...base,
    availableQuantity,
    unitPriceMinor,
    lineTotalMinor: unitPriceMinor * availableQuantity,
    inStock,
    status,
    compareAtMinor,
  };
}

/** Ayni varyanttan birden cok satiri tek satira indirger (adetler toplanir). */
function mergeCartItems(items: Array<{ variantId: string; quantity: number }>) {
  const merged = new Map<string, number>();
  for (const item of items) {
    merged.set(item.variantId, Math.min((merged.get(item.variantId) ?? 0) + item.quantity, 999));
  }
  return [...merged.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
}

/** Prisma Decimal (veya number) -> number | null. Eksik olcum null doner. */
function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : value.toNumber();
}

/**
 * Sepet ozeti hesabi. KDV (%20) fiyatlara DAHILDIR; toplam uzerine EKLENMEZ.
 *
 * F4A — Kupon/kampanya indirimi DEMO kural DEGILDIR; kampanya motorundan
 * (campaigns/discount-engine.ts, ADR-058) gelen sonuc kullanilir. Istemciden
 * indirim tutari ASLA alinmaz.
 *
 * F3C.2 — Kargo artik HARDCODED degildir; magaza kargo TARIFE planindan
 * hesaplanir (bkz. ADR-036, price-engine.ts). shipping parametresi quote
 * sonucunu tasir: includeInTotal=false ise (adres yok/plan yok/hata) kargo
 * grand total'a DAHIL EDILMEZ ve 0 gosterilir.
 * grandTotal = itemsSubtotal - discount + shipping.
 */
const CART_TAX_RATE_PERCENT = 20; // KDV (fiyatlara dahil)

interface CartSummaryShipping {
  shippingMinor: number;
  includeInTotal: boolean;
  freeThresholdMinor: number | null;
}

function computeCartSummary(
  subtotalMinor: number,
  currency: string,
  discount: DiscountEngineResult,
  shipping: CartSummaryShipping,
) {
  // Motor indirimi zaten subtotal'i asamaz; defansif olarak yine sinirlanir.
  const discountMinor = Math.max(0, Math.min(discount.discountMinor, subtotalMinor));
  const shippingMinor = shipping.includeInTotal ? Math.max(0, shipping.shippingMinor) : 0;
  const grandTotalMinor = Math.max(0, subtotalMinor - discountMinor + shippingMinor);
  // KDV dahil: grand total icindeki KDV payi = total * rate / (100 + rate).
  const taxIncludedMinor = Math.round(
    (grandTotalMinor * CART_TAX_RATE_PERCENT) / (100 + CART_TAX_RATE_PERCENT),
  );
  return {
    itemsSubtotalMinor: subtotalMinor,
    shippingMinor,
    discountMinor,
    taxIncludedMinor,
    grandTotalMinor,
    currency,
    freeShippingThresholdMinor: shipping.freeThresholdMinor ?? 0,
    taxRatePercent: CART_TAX_RATE_PERCENT,
    couponCode: discount.couponStatus === "NONE" ? null : discount.couponCode,
    couponStatus: discount.couponStatus,
    couponReason: discount.couponStatus === "INVALID" ? discount.couponReason : null,
    // PUBLIC allowlist: yalniz etiket + kod + tutar (kampanya ic metadata'si sizmaz).
    discountLines: discount.discountLines.map((line) => ({
      label: line.label,
      code: line.code,
      amountMinor: line.discountAmountMinor,
    })),
  };
}

/** F4A — Bos/indirimsiz motor sonucu (kupon girilmedi). */
function emptyDiscountResult(): DiscountEngineResult {
  return { discountLines: [], discountMinor: 0, lineDiscounts: [], couponStatus: "NONE", couponReason: null, couponCode: null };
}

/**
 * Sepet kargo olcumu (desi/kg) toplami. Yalniz siparise dusebilecek (UNAVAILABLE
 * olmayan) satirlar sayilir; bir satirda olcum eksikse ilgili missing bayragi
 * set edilir (DESI/WEIGHT tablosu modunda MISSING_DIMENSIONS'a yol acar).
 */
function computeCartDims(
  index: Map<string, CartResolvableVariant>,
  lines: PublicCartLineResult[],
): Pick<EngineCart, "totalDesi" | "totalWeightKg" | "missingDesi" | "missingWeight"> {
  let totalDesi = 0;
  let totalWeightKg = 0;
  let missingDesi = false;
  let missingWeight = false;
  for (const line of lines) {
    if (line.status === "UNAVAILABLE") continue;
    const entry = index.get(line.variantId);
    if (!entry) continue;
    const qty = line.availableQuantity;
    if (entry.shippingDesi == null) missingDesi = true;
    else totalDesi += entry.shippingDesi * qty;
    if (entry.shippingWeightKg == null) missingWeight = true;
    else totalWeightKg += entry.shippingWeightKg * qty;
  }
  return { totalDesi, totalWeightKg, missingDesi, missingWeight };
}

interface CartShippingContext {
  /** TODO-125 — Magazanin TUM aktif tarife planlari (her biri bir kargo secenegi). */
  plans: EngineRatePlan[];
  /** ENABLED provider config gorunum bilgisi (taşıyıcı adi + logo). */
  providerDisplays: ProviderDisplayMap;
  address: EngineAddress | null;
  addressKnown: boolean;
  /** Musterinin sectigi secenek (= ratePlanId); gecersizse guvenli varsayilan. */
  requestedOptionId?: string | null;
  now?: Date;
}

/** F4A — Sepetin indirim motoru girdisi + hesap sonucu (snapshot icin ic alanlar). */
interface CartDiscountContext {
  /** Kullanicinin girdigi ham kupon kodu (normalize motor icinde yapilir). */
  couponCode: string | null;
  context: DiscountContext;
}

/** F4A.3 — Sepet cuzdan baglami: kart adaylari (public/atanmis/claim). */
interface CartWalletContext {
  candidates: WalletCandidate[];
}

function assemblePublicCart(
  storeSlug: string,
  index: Map<string, CartResolvableVariant>,
  items: Array<{ variantId: string; quantity: number }>,
  discountCtx: CartDiscountContext,
  shippingCtx: CartShippingContext,
  walletCtx?: CartWalletContext,
  // ADR-065 (Faz 3/Dilim 6a) — productId -> turetilmis kapak URL'i. Cagiran (cart route)
  // TEK batched listProductImages ile hazirlar (N+1 yok); verilmezse tum satirlar
  // imageUrl:null (geriye-uyumlu — mevcut cagiranlar degismez).
  coverUrlByProductId?: Map<string, string>,
  // Dilim 6a-refine — Secimi kaldirilan variantId'ler (checkbox). Bu satirlar yanitta
  // gorunur (selected:false) ama subtotal/itemCount/checkoutReady/indirim/kargo'ya GIRMEZ.
  deselectedVariantIds?: string[],
) {
  const deselected = new Set(deselectedVariantIds ?? []);
  const lines: PublicCartLineResult[] = [];
  for (const item of mergeCartItems(items)) {
    const entry = index.get(item.variantId);
    // Cozulemeyen referans (silinmis/pasif/baska store) sessizce dusurulur
    // (stale-cart reconciliation): yanit otoriterdir, istemci cookie'sini buna
    // gore yeniden yazar.
    if (!entry) continue;
    lines.push(
      buildPublicCartLine(
        entry,
        item.quantity,
        coverUrlByProductId?.get(entry.productId) ?? null,
        !deselected.has(entry.variantId),
      ),
    );
  }
  // Dilim 6a-refine — SUNUCU-OTORITER secim: toplam/checkout yalnizca SECILI satirlardan
  // hesaplanir. Secilmeyen satir sepette kalir (response'ta yer alir) ama etkilemez.
  const effectiveLines = lines.filter((line) => line.selected);
  const orderableCurrency = lines.find((line) => line.status !== "UNAVAILABLE")?.currency;
  const currency = orderableCurrency ?? lines[0]?.currency ?? "TRY";
  const subtotalMinor = effectiveLines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const itemCount = effectiveLines.reduce(
    (sum, line) => sum + (line.status === "UNAVAILABLE" ? 0 : line.availableQuantity),
    0,
  );
  // En az bir SECILI satir var VE tum SECILI satirlar OK. Secilmeyen sorunlu satir
  // (OUT_OF_STOCK vb.) checkout'u engellemez — kullanici onu secimden cikarip devam eder.
  const checkoutReady = effectiveLines.length > 0 && effectiveLines.every((line) => line.status === "OK");

  // F3C.2/TODO-125 — Kargo ucreti store tarife planindan hesaplanir (provider quote
  // DEGIL). Her aktif plan bir SECENEK'tir; musteri secimi (requestedOptionId)
  // gecerliyse uygulanir, degilse guvenli varsayilan (default/en ucuz) secilir.
  const dims = computeCartDims(index, effectiveLines);
  const engineCart: EngineCart = { subtotalMinor, ...dims };
  const now = shippingCtx.now ?? new Date();
  const optionsResult = buildShippingOptions({
    plans: shippingCtx.plans,
    providerDisplays: shippingCtx.providerDisplays,
    cart: engineCart,
    address: shippingCtx.address,
    addressKnown: shippingCtx.addressKnown,
    requestedOptionId: shippingCtx.requestedOptionId ?? null,
    now,
  });

  // Secili secenegin (yoksa temsili ilk plan / plan yoksa null) quote'u ozet/durum
  // icin kullanilir. Secenekler + secili kimligi shipping yanitina eklenir.
  const quoteForPlan = optionsResult.selected?.plan ?? shippingCtx.plans[0] ?? null;
  const quote = computeStoreShippingQuote(quoteForPlan, engineCart, shippingCtx.address, {
    addressKnown: shippingCtx.addressKnown,
    now,
  });
  const shippingOk = quote.outcome.status === "OK";
  const selectedPlan = optionsResult.selected?.plan ?? null;

  // F4A — Kampanya/kupon indirimi motoru. Indirim yalnizca checkout'a hazir
  // (tum satirlar OK) sepete uygulanir; aksi halde yanlis grand total gosterilmez.
  const discountLines: DiscountCartLine[] = effectiveLines
    .filter((line) => line.status !== "UNAVAILABLE")
    .map((line) => {
      const entry = index.get(line.variantId)!;
      return {
        variantId: line.variantId,
        productId: entry.productId,
        categoryIds: entry.categoryIds,
        quantity: line.availableQuantity,
        lineTotalMinor: line.lineTotalMinor,
      };
    });
  const discount = checkoutReady
    ? computeDiscounts({
        lines: discountLines,
        subtotalMinor,
        couponCode: discountCtx.couponCode,
        context: discountCtx.context,
        now,
      })
    : emptyDiscountResult();

  const summary = computeCartSummary(subtotalMinor, currency, discount, {
    shippingMinor: shippingOk ? quote.outcome.amountMinor ?? 0 : 0,
    includeInTotal: shippingOk,
    freeThresholdMinor: selectedPlan?.freeShippingThresholdMinor ?? null,
  });
  // F4A.3 (ADR-060) — Sepet "Kuponlar" kartlari. Yalniz kapsami bu sepete uyan
  // adaylar gosterilir (kapsamsiz = tum sepet). Durum (APPLIED/AVAILABLE/
  // MIN_ORDER_NOT_MET) uygulanan koda ve alt limite gore hesaplanir.
  const cartProducts = discountLines.map((line) => ({ id: line.productId, categoryIds: line.categoryIds }));
  const applicableCandidates = (walletCtx?.candidates ?? []).filter((candidate) =>
    cartProducts.some((product) => campaignAppliesToProduct(candidate.campaign, product)),
  );
  const availableCoupons = projectWalletCoupons(applicableCandidates, {
    subtotalMinor,
    appliedNormalizedCode:
      discount.couponStatus === "APPLIED" ? normalizeCouponCode(discount.couponCode) : null,
    now,
  });
  // Dilim 6a-refine — Satir bazinda KAMPANYA indirimini (motor pro-rata dagitimindan)
  // her satira isle: kampanya-sonrasi birim/satir fiyati. Vitrin bunu ustu-cizili +
  // indirimli olarak gosterir (compareAt liste fiyatina ONCELIKLI). Indirim yoksa null.
  const lineDiscountByVariant = new Map(discount.lineDiscounts.map((d) => [d.variantId, d.discountMinor]));
  const enrichedLines = lines.map((line) => {
    const applied = lineDiscountByVariant.get(line.variantId) ?? 0;
    if (applied <= 0 || line.status === "UNAVAILABLE") {
      return { ...line, discountedUnitPriceMinor: null, discountedLineTotalMinor: null };
    }
    const discountedLineTotalMinor = line.lineTotalMinor - applied;
    return {
      ...line,
      discountedLineTotalMinor,
      discountedUnitPriceMinor:
        line.availableQuantity > 0 ? Math.round(discountedLineTotalMinor / line.availableQuantity) : null,
    };
  });
  const cart = publicCartSchema.parse({
    storeSlug,
    currency,
    lines: enrichedLines,
    subtotalMinor,
    itemCount,
    checkoutReady,
    summary: { ...summary, availableCoupons },
    shipping: {
      ...quote.response,
      options: optionsResult.options,
      selectedOptionId: optionsResult.selectedOptionId,
    },
  });
  // Motor sonucu (campaignId/couponId ic alanlari) siparis snapshot'i icin
  // AYRICA doner; public yanita yalniz allowlist'lenmis summary yazilmistir.
  return { cart, discount };
}

function toPrismaJsonObject(value: Record<string, unknown> | undefined) {
  return value as Prisma.InputJsonObject | undefined;
}

function isPrismaUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function uniqueConstraintTargets(error: Prisma.PrismaClientKnownRequestError): string[] {
  const target = error.meta?.target;
  return Array.isArray(target) ? target.filter((item): item is string => typeof item === "string") : [];
}

const productSalesOrderErrors = new Set<ProductSalesOrderCode>([
  "PRODUCT_NOT_PURCHASABLE",
  "PRODUCT_REQUIRES_INQUIRY",
  "PRODUCT_REQUIRES_APPOINTMENT",
  "PRODUCT_REQUIRES_WHATSAPP",
  "PRODUCT_CATALOG_ONLY",
]);

function isProductSalesOrderError(value: unknown): value is ProductSalesOrderCode {
  return typeof value === "string" && productSalesOrderErrors.has(value as ProductSalesOrderCode);
}

function productSalesOrderErrorBody(code: string) {
  return errorBody(code, "Product is not available for online order.");
}

function isConsistentProductSalesModel(
  product: Pick<
    ProductRecord,
    "salesMode" | "priceVisibility" | "primaryAction" | "whatsappEnabled" | "purchasable" | "minOrderQuantity" | "maxOrderQuantity"
  >,
) {
  if (product.minOrderQuantity < 1) return false;
  if (product.maxOrderQuantity !== null && product.maxOrderQuantity < product.minOrderQuantity) return false;
  if (product.salesMode === "ONLINE") {
    return (
      product.primaryAction === "ADD_TO_CART" &&
      ["VISIBLE", "STARTING_FROM"].includes(product.priceVisibility)
    );
  }
  if (product.salesMode === "INQUIRY") {
    return ["REQUEST_PRICE", "CONTACT_FORM"].includes(product.primaryAction) && !product.purchasable;
  }
  if (product.salesMode === "APPOINTMENT") {
    return product.primaryAction === "BOOK_APPOINTMENT" && !product.purchasable;
  }
  if (product.salesMode === "WHATSAPP") {
    return product.primaryAction === "WHATSAPP" && product.whatsappEnabled && !product.purchasable;
  }
  return ["NONE", "CONTACT_FORM"].includes(product.primaryAction) && !product.purchasable;
}

function requireInternalToken(config: AppConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = bearerToken(request);
    if (token !== config.INTERNAL_API_TOKEN) {
      await reply.code(401).send(errorBody("UNAUTHORIZED", "Unauthorized."));
    }
  };
}

function createPrismaDataAccess(): AppDataAccess {
  const storeSelect = {
    id: true,
    name: true,
    slug: true,
    status: true,
    metadata: true,
    createdAt: true,
    updatedAt: true,
    domains: {
      orderBy: { createdAt: "asc" },
      take: 1,
      select: { domain: true },
    },
  } satisfies Prisma.StoreSelect;
  const planSelect = {
    id: true,
    code: true,
    name: true,
    description: true,
    metadata: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.PlanSelect;
  const categorySelect = {
    id: true,
    storeId: true,
    name: true,
    slug: true,
    parentId: true,
    sortOrder: true,
    status: true,
    imageId: true,
    // ADR-065 (Faz 2/Dilim 3) — imageUrl'u storageKey'den turetmek icin relation.
    image: { select: { storageKey: true } },
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.ProductCategorySelect;
  // ADR-065 (Faz 2/Dilim 4) — marka ayarlari; logo/favicon URL'lerini storageKey'den
  // turetmek icin relation'lar. storeName join'lenmez (access.store.name kullanilir).
  const storeSettingsSelect = {
    storeId: true,
    logoMediaId: true,
    faviconMediaId: true,
    logo: { select: { storageKey: true } },
    favicon: { select: { storageKey: true } },
  } satisfies Prisma.StoreSettingsSelect;
  const productSelect = {
    id: true,
    storeId: true,
    title: true,
    slug: true,
    description: true,
    status: true,
    type: true,
    vendor: true,
    brand: true,
    seoTitle: true,
    seoDescription: true,
    salesMode: true,
    priceVisibility: true,
    primaryAction: true,
    inquiryEnabled: true,
    appointmentRequired: true,
    whatsappEnabled: true,
    purchasable: true,
    minOrderQuantity: true,
    maxOrderQuantity: true,
    callToActionLabel: true,
    whatsappMessageTemplate: true,
    inquiryFormTitle: true,
    appointmentNote: true,
    shippingWeightKg: true,
    shippingDesi: true,
    // Faz 1A (ADR-067) — ana kategori FK (admin serialize + public label kaynagi).
    primaryCategoryId: true,
    createdAt: true,
    updatedAt: true,
    assignments: { select: { categoryId: true }, orderBy: { createdAt: "asc" } },
  } satisfies Prisma.ProductSelect;
  // ADR-065 (Faz 2/Dilim 2) — tekil urun yollarinda (GET/create/update reload)
  // galeriyi de ceker. Liste yolu HAFIF `productSelect`'te kalir (join yok,
  // images bos doner; liste thumbnail'i ayri follow-up).
  const productDetailSelect = {
    ...productSelect,
    images: {
      select: { mediaId: true, position: true, media: { select: { storageKey: true, altText: true } } },
      orderBy: { position: "asc" },
    },
  } satisfies Prisma.ProductSelect;
  const variantSelect = {
    id: true,
    productId: true,
    storeId: true,
    title: true,
    sku: true,
    barcode: true,
    priceMinor: true,
    compareAtMinor: true,
    costMinor: true,
    // F4C — KDV alanlari (net/oran/tutar); priceMinor brut olarak kalir.
    netPriceMinor: true,
    vatRateBps: true,
    vatAmountMinor: true,
    currency: true,
    status: true,
    optionValues: true,
    shippingWeightKg: true,
    shippingDesi: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.ProductVariantSelect;
  // F4B — Fiyat degisikligi audit projeksiyonu.
  const priceChangeSelect = {
    id: true,
    storeId: true,
    productId: true,
    variantId: true,
    changedByPlatformUserId: true,
    currency: true,
    oldPriceMinor: true,
    newPriceMinor: true,
    oldCompareAtMinor: true,
    newCompareAtMinor: true,
    oldCostMinor: true,
    newCostMinor: true,
    source: true,
    reason: true,
    createdAt: true,
  } satisfies Prisma.ProductPriceChangeSelect;
  const inventorySelect = {
    id: true,
    storeId: true,
    variantId: true,
    quantityOnHand: true,
    quantityReserved: true,
    lowStockThreshold: true,
    updatedAt: true,
    variant: { select: { productId: true, sku: true, title: true } },
  } satisfies Prisma.InventoryItemSelect;
  const movementSelect = {
    id: true,
    storeId: true,
    variantId: true,
    type: true,
    quantityDelta: true,
    reason: true,
    referenceType: true,
    referenceId: true,
    actorUserId: true,
    createdAt: true,
  } satisfies Prisma.InventoryMovementSelect;
  const orderSelect = {
    id: true,
    storeId: true,
    orderNumber: true,
    customerId: true,
    customerEmail: true,
    currency: true,
    status: true,
    paymentStatus: true,
    fulfillmentStatus: true,
    subtotalAmount: true,
    discountAmount: true,
    shippingAmount: true,
    shippingCurrency: true,
    shippingSource: true,
    shippingRatePlanId: true,
    shippingRatePlanName: true,
    shippingProvider: true,
    shippingProviderName: true,
    shippingLogoUrl: true,
    shippingEtaText: true,
    taxAmount: true,
    totalAmount: true,
    placedAt: true,
    cancelledAt: true,
    cancelReason: true,
    billingType: true,
    billingName: true,
    billingTaxId: true,
    billingCompanyName: true,
    billingTaxOffice: true,
    billingTaxNumber: true,
    billingEmail: true,
    createdAt: true,
    updatedAt: true,
    paymentAttempts: { orderBy: { createdAt: "asc" }, select: {
      id: true,
      storeId: true,
      orderId: true,
      providerConfigId: true,
      provider: true,
      mode: true,
      method: true,
      amount: true,
      currency: true,
      status: true,
      threeDsApplied: true,
      scenario: true,
      installmentCount: true,
      cardBrand: true,
      cardLast4: true,
      providerReference: true,
      failureCode: true,
      failureMessage: true,
      accessTokenHash: true,
      accessTokenExpiresAt: true,
      paidAt: true,
      failedAt: true,
      createdAt: true,
      updatedAt: true,
    } },
    lines: { orderBy: { createdAt: "asc" }, select: {
      id: true,
      storeId: true,
      orderId: true,
      productId: true,
      variantId: true,
      sku: true,
      title: true,
      variantTitle: true,
      quantity: true,
      unitPriceAmount: true,
      totalAmount: true,
      currency: true,
      // F4C — Siparis ani KDV/maliyet/liste SNAPSHOT'lari (admin ozet temeli).
      unitNetPriceMinor: true,
      unitVatRateBps: true,
      unitVatAmountMinor: true,
      unitGrossPriceMinor: true,
      unitListPriceMinor: true,
      unitCostMinor: true,
      lineNetAmountMinor: true,
      lineVatAmountMinor: true,
      lineGrossAmountMinor: true,
      lineCostMinor: true,
      createdAt: true,
    } },
    addresses: { orderBy: { type: "asc" }, select: {
      id: true,
      storeId: true,
      orderId: true,
      type: true,
      fullName: true,
      phone: true,
      countryCode: true,
      city: true,
      district: true,
      addressLine1: true,
      addressLine2: true,
      postalCode: true,
    } },
    reservations: { orderBy: { createdAt: "asc" }, select: {
      id: true,
      storeId: true,
      orderId: true,
      orderLineId: true,
      variantId: true,
      quantity: true,
      status: true,
      expiresAt: true,
      releasedAt: true,
      consumedAt: true,
      createdAt: true,
      updatedAt: true,
    } },
    events: { orderBy: { createdAt: "asc" }, select: {
      id: true,
      storeId: true,
      orderId: true,
      type: true,
      message: true,
      metadata: true,
      actorUserId: true,
      createdAt: true,
    } },
    // TODO-135 — Karşılama rozetinin kargo hazırlık durumunu yansıtması için TEMSİLİ
    // shipment durumu (yalnız DURUM alanı; statusText/iç ID/ham payload çekilmez).
    shipments: { select: { status: true } },
    // F4A.2 — Kampanya/kupon indirim SNAPSHOT satırları (OrderDiscount). Yalnız
    // güvenli alanlar; scopeSummary/couponId iç alanları çekilmez.
    discounts: { orderBy: { createdAt: "asc" }, select: {
      id: true,
      campaignId: true,
      code: true,
      label: true,
      discountType: true,
      discountValue: true,
      discountAmountMinor: true,
      createdAt: true,
    } },
  } satisfies Prisma.OrderSelect;

  function withCategoryIds(
    product:
      | Prisma.ProductGetPayload<{ select: typeof productSelect }>
      | Prisma.ProductGetPayload<{ select: typeof productDetailSelect }>,
  ): ProductRecord {
    // ADR-065 (Faz 2/Dilim 2) — detay select'te `images` nested gelir; hafif liste
    // select'te yoktur → [] (join maliyeti yok). storageKey ham tasinir.
    const images: ProductImageRecord[] =
      "images" in product
        ? product.images.map((image) => ({
            mediaId: image.mediaId,
            position: image.position,
            storageKey: image.media.storageKey,
            altText: image.media.altText,
          }))
        : [];
    return {
      ...product,
      categoryIds: product.assignments.map((assignment) => assignment.categoryId),
      images,
    };
  }

  function withInventoryVariant(
    item: Prisma.InventoryItemGetPayload<{ select: typeof inventorySelect }>,
  ): InventoryRecord {
    return {
      ...item,
      productId: item.variant.productId,
      sku: item.variant.sku,
      title: item.variant.title,
    };
  }

  async function reloadOrder(transaction: TransactionClient, storeId: string, orderId: string) {
    return transaction.order.findFirst({ where: { id: orderId, storeId }, select: orderSelect });
  }

  function orderTotals(
    lines: Array<{ totalAmount: number }>,
    extras: { discountAmount?: number; shippingAmount?: number } = {},
  ) {
    const subtotalAmount = lines.reduce((sum, line) => sum + line.totalAmount, 0);
    const discountAmount = Math.max(0, Math.min(extras.discountAmount ?? 0, subtotalAmount));
    const shippingAmount = Math.max(0, extras.shippingAmount ?? 0);
    // KDV fiyatlara dahil (F3B.1 demo); taxAmount ayrica eklenmez.
    return {
      subtotalAmount,
      discountAmount,
      shippingAmount,
      taxAmount: 0,
      totalAmount: Math.max(0, subtotalAmount - discountAmount + shippingAmount),
    };
  }

  function productSalesError(
    product: Pick<
      Product,
      "salesMode" | "purchasable" | "priceVisibility" | "minOrderQuantity" | "maxOrderQuantity"
    >,
    quantity: number,
  ) {
    if (product.salesMode === "INQUIRY") return "PRODUCT_REQUIRES_INQUIRY";
    if (product.salesMode === "APPOINTMENT") return "PRODUCT_REQUIRES_APPOINTMENT";
    if (product.salesMode === "WHATSAPP") return "PRODUCT_REQUIRES_WHATSAPP";
    if (product.salesMode === "CATALOG_ONLY") return "PRODUCT_CATALOG_ONLY";
    if (!product.purchasable || product.priceVisibility === "HIDDEN" || product.priceVisibility === "ON_REQUEST") {
      return "PRODUCT_NOT_PURCHASABLE";
    }
    if (quantity < product.minOrderQuantity) return "PRODUCT_ORDER_QUANTITY_OUT_OF_RANGE";
    if (product.maxOrderQuantity !== null && quantity > product.maxOrderQuantity) {
      return "PRODUCT_ORDER_QUANTITY_OUT_OF_RANGE";
    }
    return null;
  }

  return {
    // F4A — Kampanya/kupon veri erisimi (admin CRUD + public indirim baglami).
    ...createPrismaCampaignDataAccess(),
    findPlatformUserByEmail: (email) =>
      prisma.platformUser.findUnique({
        where: { email },
        select: { id: true, email: true, name: true, passwordHash: true, role: true },
      }),
    createPlatformSession: (input) =>
      prisma.platformSession.create({
        data: input,
        select: { id: true, expiresAt: true },
      }),
    findPlatformSessionByTokenHash: (tokenHash) =>
      prisma.platformSession.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          expiresAt: true,
          revokedAt: true,
          platformUser: {
            select: { id: true, email: true, name: true, passwordHash: true, role: true },
          },
        },
      }),
    revokePlatformSession: async (sessionId) => {
      await prisma.platformSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
      return true;
    },
    listStores: async ({ limit, offset }) => {
      const [data, total] = await Promise.all([
        prisma.store.findMany({
          orderBy: { createdAt: "asc" },
          skip: offset,
          take: limit,
          select: storeSelect,
        }),
        prisma.store.count(),
      ]);
      return { data: data.map((store) => ({ ...store, domain: store.domains[0]?.domain ?? null })), total };
    },
    findStoreById: async (id) => {
      const store = await prisma.store.findUnique({ where: { id }, select: storeSelect });
      return store ? { ...store, domain: store.domains[0]?.domain ?? null } : null;
    },
    findStoreBySlug: (slug) => prisma.store.findUnique({ where: { slug }, select: storeSelect }),
    findStoreDomain: (domain) => prisma.storeDomain.findUnique({ where: { domain }, select: { id: true } }),
    createStore: (input) =>
      prisma.$transaction(async (transaction: TransactionClient) => {
        const store = await transaction.store.create({
          data: {
            name: input.name,
            slug: input.slug,
            status: input.status,
            metadata: toPrismaJsonObject(input.metadata),
          },
          select: storeSelect,
        });
        if (input.domain) {
          await transaction.storeDomain.create({
            data: { storeId: store.id, domain: input.domain, type: "SYSTEM_SUBDOMAIN", status: "PENDING" },
          });
        }
        return { ...store, domain: input.domain ?? null };
      }),
    updateStore: async (id, input) => {
      try {
        const store = await prisma.store.update({
          where: { id },
          data: { ...input, metadata: toPrismaJsonObject(input.metadata) },
          select: storeSelect,
        });
        return { ...store, domain: store.domains[0]?.domain ?? null };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return null;
        }
        throw error;
      }
    },
    listPlans: async ({ limit, offset }) => {
      const [data, total] = await Promise.all([
        prisma.plan.findMany({
          orderBy: { createdAt: "asc" },
          skip: offset,
          take: limit,
          select: planSelect,
        }),
        prisma.plan.count(),
      ]);
      return { data, total };
    },
    findPlanById: (id) => prisma.plan.findUnique({ where: { id }, select: planSelect }),
    findPlanByCode: (code) => prisma.plan.findUnique({ where: { code }, select: planSelect }),
    createPlan: (input) =>
      prisma.plan.create({
        data: { ...input, metadata: toPrismaJsonObject(input.metadata) },
        select: planSelect,
      }),
    updatePlan: async (id, input) => {
      try {
        return await prisma.plan.update({
          where: { id },
          data: { ...input, metadata: toPrismaJsonObject(input.metadata) },
          select: planSelect,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return null;
        }
        throw error;
      }
    },
    listCategories: async (storeId, { limit, offset }) => {
      const [data, total] = await Promise.all([
        prisma.productCategory.findMany({
          where: { storeId },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          skip: offset,
          take: limit,
          select: categorySelect,
        }),
        prisma.productCategory.count({ where: { storeId } }),
      ]);
      return { data, total };
    },
    findCategoryById: (storeId, categoryId) =>
      prisma.productCategory.findFirst({ where: { id: categoryId, storeId }, select: categorySelect }),
    findCategoryBySlug: (storeId, slug) =>
      prisma.productCategory.findUnique({ where: { storeId_slug: { storeId, slug } }, select: categorySelect }),
    findMediaAssetById: (storeId, mediaId) =>
      prisma.mediaAsset.findFirst({
        where: { id: mediaId, storeId },
        select: { id: true, context: true },
      }),
    createCategory: (storeId, input) =>
      prisma.productCategory.create({
        data: { ...input, storeId, parentId: input.parentId ?? null },
        select: categorySelect,
      }),
    updateCategory: async (storeId, categoryId, input) => {
      try {
        return await prisma.productCategory.update({
          where: { id: categoryId, storeId },
          data: input,
          select: categorySelect,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return null;
        }
        throw error;
      }
    },
    getStoreSettings: (storeId) =>
      prisma.storeSettings.findUnique({ where: { storeId }, select: storeSettingsSelect }),
    upsertStoreSettings: (storeId, input) =>
      prisma.storeSettings.upsert({
        where: { storeId },
        // Ilk kayit (R2): absent alanlar null'a dusurulur.
        create: {
          storeId,
          logoMediaId: input.logoMediaId ?? null,
          faviconMediaId: input.faviconMediaId ?? null,
        },
        // Guncelleme: absent=dokunma, null=temizle. Yalniz gonderilen anahtarlari yaz
        // (bir alani set ederken digerinin korunmasi bu spread'e bagli — KRITIK).
        update: {
          ...(input.logoMediaId !== undefined ? { logoMediaId: input.logoMediaId } : {}),
          ...(input.faviconMediaId !== undefined ? { faviconMediaId: input.faviconMediaId } : {}),
        },
        select: storeSettingsSelect,
      }),
    listProducts: async (storeId, { limit, offset }) => {
      const [data, total] = await Promise.all([
        prisma.product.findMany({
          where: { storeId },
          orderBy: { createdAt: "asc" },
          skip: offset,
          take: limit,
          select: productSelect,
        }),
        prisma.product.count({ where: { storeId } }),
      ]);
      return { data: data.map(withCategoryIds), total };
    },
    findProductById: async (storeId, productId) => {
      const product = await prisma.product.findFirst({ where: { id: productId, storeId }, select: productDetailSelect });
      return product ? withCategoryIds(product) : null;
    },
    findProductBySlug: async (storeId, slug) => {
      const product = await prisma.product.findUnique({ where: { storeId_slug: { storeId, slug } }, select: productDetailSelect });
      return product ? withCategoryIds(product) : null;
    },
    // ADR-065 (Faz 3/Dilim 1) — TEK batched sorgu (N+1 yok). orderBy [productId, position ASC]
    // → coverOnly'de distinct her urunun ilk (en dusuk position = kapak) satirini verir.
    // storageKey ham tasinir; url handler'da resolveMediaUrl(baseUrl, ...) ile turetilir.
    listProductImages: async (storeId, productIds, coverOnly) => {
      const map = new Map<string, ProductImageRecord[]>();
      if (productIds.length === 0) return map;
      const rows = await prisma.productImage.findMany({
        where: { storeId, productId: { in: productIds } },
        orderBy: [{ productId: "asc" }, { position: "asc" }],
        ...(coverOnly ? { distinct: ["productId"] } : {}),
        select: {
          productId: true,
          mediaId: true,
          position: true,
          media: { select: { storageKey: true, altText: true } },
        },
      });
      for (const row of rows) {
        const record: ProductImageRecord = {
          mediaId: row.mediaId,
          position: row.position,
          storageKey: row.media.storageKey,
          altText: row.media.altText,
        };
        const existing = map.get(row.productId);
        if (existing) existing.push(record);
        else map.set(row.productId, [record]);
      }
      return map;
    },
    createProduct: (storeId, input) =>
      prisma.$transaction(async (transaction: TransactionClient) => {
        const product = await transaction.product.create({
          data: {
            storeId,
            title: input.title,
            slug: input.slug,
            description: input.description ?? null,
            status: input.status,
            type: input.type,
            vendor: input.vendor ?? null,
            brand: input.brand ?? null,
            seoTitle: input.seoTitle ?? null,
            seoDescription: input.seoDescription ?? null,
            salesMode: input.salesMode,
            priceVisibility: input.priceVisibility,
            primaryAction: input.primaryAction,
            inquiryEnabled: input.inquiryEnabled,
            appointmentRequired: input.appointmentRequired,
            whatsappEnabled: input.whatsappEnabled,
            purchasable: input.purchasable,
            minOrderQuantity: input.minOrderQuantity,
            maxOrderQuantity: input.maxOrderQuantity ?? null,
            callToActionLabel: input.callToActionLabel ?? null,
            whatsappMessageTemplate: input.whatsappMessageTemplate ?? null,
            inquiryFormTitle: input.inquiryFormTitle ?? null,
            appointmentNote: input.appointmentNote ?? null,
            shippingWeightKg: input.shippingWeightKg ?? null,
            shippingDesi: input.shippingDesi ?? null,
            // Faz 1A (ADR-067) — route'ta normalize edilmis ana kategori (assignments'tan
            // biri veya null). Ayni transaction icinde assignment'larla birlikte yazilir.
            primaryCategoryId: input.primaryCategoryId ?? null,
          },
          select: productSelect,
        });
        if (input.categoryIds.length > 0) {
          await transaction.productCategoryAssignment.createMany({
            data: input.categoryIds.map((categoryId) => ({ storeId, productId: product.id, categoryId })),
            skipDuplicates: true,
          });
        }
        const reloaded = await transaction.product.findUniqueOrThrow({ where: { id: product.id }, select: productDetailSelect });
        return withCategoryIds(reloaded);
      }),
    updateProduct: (storeId, productId, input) =>
      prisma.$transaction(async (transaction: TransactionClient) => {
        const existing = await transaction.product.findFirst({ where: { id: productId, storeId }, select: { id: true } });
        if (!existing) return null;
        const { categoryIds, ...data } = input;
        await transaction.product.update({
          where: { id: productId },
          data: {
            ...data,
            description: data.description === undefined ? undefined : data.description,
            vendor: data.vendor === undefined ? undefined : data.vendor,
            brand: data.brand === undefined ? undefined : data.brand,
            seoTitle: data.seoTitle === undefined ? undefined : data.seoTitle,
            seoDescription: data.seoDescription === undefined ? undefined : data.seoDescription,
            maxOrderQuantity: data.maxOrderQuantity === undefined ? undefined : data.maxOrderQuantity,
            callToActionLabel: data.callToActionLabel === undefined ? undefined : data.callToActionLabel,
            whatsappMessageTemplate:
              data.whatsappMessageTemplate === undefined ? undefined : data.whatsappMessageTemplate,
            inquiryFormTitle: data.inquiryFormTitle === undefined ? undefined : data.inquiryFormTitle,
            appointmentNote: data.appointmentNote === undefined ? undefined : data.appointmentNote,
          },
        });
        if (categoryIds) {
          await transaction.productCategoryAssignment.deleteMany({ where: { productId, storeId } });
          if (categoryIds.length > 0) {
            await transaction.productCategoryAssignment.createMany({
              data: categoryIds.map((categoryId) => ({ storeId, productId, categoryId })),
              skipDuplicates: true,
            });
          }
        }
        const product = await transaction.product.findUniqueOrThrow({ where: { id: productId }, select: productDetailSelect });
        return withCategoryIds(product);
      }),
    // ADR-065 (Faz 2/Dilim 2) — galeriyi sirali mediaId listesine gore diff'ler.
    // Tenant/context guard route katmaninda (assertMediaAttachable) yapilir; burasi
    // yalniz kalicilik. @@unique([productId, mediaId]) upsert where anahtaridir →
    // ayni gorsel tekrar create edilmez (ikinci savunma katmani). orderedMediaIds
    // bos ise tum galeri temizlenir (silinecek = mevcut hepsi, eklenecek yok).
    updateProductImages: (storeId, productId, orderedMediaIds) =>
      prisma.$transaction(async (transaction: TransactionClient) => {
        const existing = await transaction.product.findFirst({ where: { id: productId, storeId }, select: { id: true } });
        if (!existing) return null;
        const current = await transaction.productImage.findMany({
          where: { productId, storeId },
          select: { mediaId: true },
        });
        const keep = new Set(orderedMediaIds);
        const toDelete = current.map((image) => image.mediaId).filter((mediaId) => !keep.has(mediaId));
        if (toDelete.length > 0) {
          await transaction.productImage.deleteMany({ where: { productId, storeId, mediaId: { in: toDelete } } });
        }
        for (const [index, mediaId] of orderedMediaIds.entries()) {
          await transaction.productImage.upsert({
            where: { productId_mediaId: { productId, mediaId } },
            create: { storeId, productId, mediaId, position: index },
            update: { position: index },
          });
        }
        const product = await transaction.product.findUniqueOrThrow({ where: { id: productId }, select: productDetailSelect });
        return withCategoryIds(product);
      }),
    listVariants: async (storeId, productId, { limit, offset }) => {
      const [data, total] = await Promise.all([
        prisma.productVariant.findMany({
          where: { storeId, productId },
          orderBy: { createdAt: "asc" },
          skip: offset,
          take: limit,
          select: variantSelect,
        }),
        prisma.productVariant.count({ where: { storeId, productId } }),
      ]);
      return { data, total };
    },
    findVariantById: (storeId, productId, variantId) =>
      prisma.productVariant.findFirst({ where: { id: variantId, storeId, productId }, select: variantSelect }),
    findVariantBySku: (storeId, sku) =>
      prisma.productVariant.findUnique({ where: { storeId_sku: { storeId, sku } }, select: variantSelect }),
    createVariant: (storeId, productId, input) =>
      prisma.$transaction(async (transaction: TransactionClient) => {
        const variant = await transaction.productVariant.create({
          data: {
            storeId,
            productId,
            title: input.title,
            sku: input.sku,
            barcode: input.barcode ?? null,
            priceMinor: input.priceMinor,
            compareAtMinor: input.compareAtMinor ?? null,
            costMinor: input.costMinor ?? null,
            // F4C — Route'ta hesaplanmis KDV cozumu (brut=net+KDV degismezi).
            netPriceMinor: input.netPriceMinor,
            vatRateBps: input.vatRateBps,
            vatAmountMinor: input.vatAmountMinor,
            currency: input.currency,
            status: input.status,
            optionValues: input.optionValues as Prisma.InputJsonObject | undefined,
            shippingWeightKg: input.shippingWeightKg ?? null,
            shippingDesi: input.shippingDesi ?? null,
          },
          select: variantSelect,
        });
        await transaction.inventoryItem.create({
          data: {
            storeId,
            variantId: variant.id,
            quantityOnHand: 0,
            quantityReserved: 0,
            lowStockThreshold: input.lowStockThreshold ?? null,
          },
        });
        // F4B — Baslangic fiyat/liste/maliyet audit'i (Omnibus min-fiyat temeli).
        await transaction.productPriceChange.create({
          data: {
            storeId,
            productId,
            variantId: variant.id,
            changedByPlatformUserId: input.changedByPlatformUserId ?? null,
            currency: variant.currency,
            oldPriceMinor: null,
            newPriceMinor: variant.priceMinor,
            oldCompareAtMinor: null,
            newCompareAtMinor: variant.compareAtMinor,
            oldCostMinor: null,
            newCostMinor: variant.costMinor,
            source: input.priceChangeSource ?? "ADMIN_EDIT",
          },
        });
        return variant;
      }),
    updateVariant: async (storeId, productId, variantId, input) => {
      try {
        // F4B — Kolon-disi alanlari (aktor/kaynak/sebep) Prisma data'sindan ayikla.
        const {
          lowStockThreshold,
          changedByPlatformUserId,
          priceChangeSource,
          priceChangeReason,
          ...variantInput
        } = input;
        return await prisma.$transaction(async (transaction: TransactionClient) => {
          // F4B — Once mevcut degerleri oku (audit diff icin).
          const before = await transaction.productVariant.findFirst({
            where: { id: variantId, storeId, productId },
            select: variantSelect,
          });
          if (!before) {
            throw new Prisma.PrismaClientKnownRequestError("Variant not found.", {
              code: "P2025",
              clientVersion: Prisma.prismaVersion.client,
            });
          }
          const variant = await transaction.productVariant.update({
            where: { id: variantId, storeId, productId },
            data: {
              ...variantInput,
              barcode: variantInput.barcode === undefined ? undefined : variantInput.barcode,
              compareAtMinor:
                variantInput.compareAtMinor === undefined ? undefined : variantInput.compareAtMinor,
              costMinor: variantInput.costMinor === undefined ? undefined : variantInput.costMinor,
              optionValues:
                variantInput.optionValues === undefined
                  ? undefined
                  : (variantInput.optionValues as Prisma.InputJsonObject | Prisma.JsonNullValueInput),
            },
            select: variantSelect,
          });
          if (lowStockThreshold !== undefined) {
            await transaction.inventoryItem.upsert({
              where: { variantId },
              update: { lowStockThreshold },
              create: { storeId, variantId, lowStockThreshold, quantityOnHand: 0, quantityReserved: 0 },
            });
          }
          // F4B — Fiyat/liste/maliyetten en az biri degistiyse audit satiri yaz (ayni transaction).
          const priceChanged =
            before.priceMinor !== variant.priceMinor ||
            (before.compareAtMinor ?? null) !== (variant.compareAtMinor ?? null) ||
            (before.costMinor ?? null) !== (variant.costMinor ?? null);
          if (priceChanged) {
            await transaction.productPriceChange.create({
              data: {
                storeId,
                productId,
                variantId,
                changedByPlatformUserId: changedByPlatformUserId ?? null,
                currency: variant.currency,
                oldPriceMinor: before.priceMinor,
                newPriceMinor: variant.priceMinor,
                oldCompareAtMinor: before.compareAtMinor,
                newCompareAtMinor: variant.compareAtMinor,
                oldCostMinor: before.costMinor,
                newCostMinor: variant.costMinor,
                source: priceChangeSource ?? "ADMIN_EDIT",
                reason: priceChangeReason ?? null,
              },
            });
          }
          return variant;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return null;
        }
        throw error;
      }
    },
    listPriceChanges: async (storeId, variantId, { limit, offset }) => {
      const [data, total] = await Promise.all([
        prisma.productPriceChange.findMany({
          where: { storeId, variantId },
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
          select: priceChangeSelect,
        }),
        prisma.productPriceChange.count({ where: { storeId, variantId } }),
      ]);
      return { data, total };
    },
    lowestRecentPriceByStore: async (storeId, sinceDays) => {
      const result = new Map<string, number>();
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
      // F4B — Son N gunde uygulanan tum yeni SATIS fiyatlarinin variant-bazli minimumu.
      const rows = await prisma.productPriceChange.groupBy({
        by: ["variantId"],
        where: { storeId, createdAt: { gte: since }, newPriceMinor: { not: null } },
        _min: { newPriceMinor: true },
      });
      for (const row of rows) {
        if (row._min.newPriceMinor != null) result.set(row.variantId, row._min.newPriceMinor);
      }
      return result;
    },
    listInventory: async (storeId, { limit, offset }) => {
      const [data, total] = await Promise.all([
        prisma.inventoryItem.findMany({
          where: { storeId },
          orderBy: { updatedAt: "desc" },
          skip: offset,
          take: limit,
          select: inventorySelect,
        }),
        prisma.inventoryItem.count({ where: { storeId } }),
      ]);
      return { data: data.map(withInventoryVariant), total };
    },
    findInventoryByVariantId: async (storeId, variantId) => {
      const item = await prisma.inventoryItem.findFirst({ where: { storeId, variantId }, select: inventorySelect });
      return item ? withInventoryVariant(item) : null;
    },
    adjustInventory: (storeId, variantId, input) =>
      prisma.$transaction(async (transaction: TransactionClient) => {
        const item =
          (await transaction.inventoryItem.findFirst({ where: { storeId, variantId }, select: inventorySelect })) ??
          (await (async () => {
            const variant = await transaction.productVariant.findFirst({
              where: { id: variantId, storeId },
              select: { id: true },
            });
            if (!variant) {
              return null;
            }
            return transaction.inventoryItem.create({
              data: { storeId, variantId, quantityOnHand: 0, quantityReserved: 0 },
              select: inventorySelect,
            });
          })());
        if (!item) {
          return null;
        }
        const nextOnHand = item.quantityOnHand + input.quantityDelta;
        if (nextOnHand < 0) {
          return "NEGATIVE_STOCK";
        }
        const updated = await transaction.inventoryItem.update({
          where: { variantId },
          data: { quantityOnHand: nextOnHand },
          select: inventorySelect,
        });
        const movement = await transaction.inventoryMovement.create({
          data: {
            storeId,
            variantId,
            type: "ADJUSTMENT",
            quantityDelta: input.quantityDelta,
            reason: input.reason,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            actorUserId: input.actorUserId,
          },
          select: movementSelect,
        });
        return { item: withInventoryVariant(updated), movement };
      }),
    listOrders: async (storeId, query) => {
      // TODO-073 — Filtreler DB tarafında uygulanır (where). Store-scope zorunlu:
      // her zaman { storeId } ile başlar; filtreler yalnız o küme içinde daraltır.
      const where: Prisma.OrderWhereInput = { storeId };
      if (query.status) where.status = query.status;
      if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
      if (query.fulfillmentStatus) where.fulfillmentStatus = query.fulfillmentStatus;
      if (query.dateFrom || query.dateTo) {
        const createdAt: Prisma.DateTimeFilter = {};
        // Gün sınırları UTC olarak yorumlanır (dateFrom gün başı, dateTo gün sonu dahil).
        if (query.dateFrom) createdAt.gte = new Date(`${query.dateFrom}T00:00:00.000Z`);
        if (query.dateTo) createdAt.lte = new Date(`${query.dateTo}T23:59:59.999Z`);
        where.createdAt = createdAt;
      }
      if (query.search) {
        const term = query.search;
        where.OR = [
          { orderNumber: { contains: term, mode: "insensitive" } },
          { customerEmail: { contains: term, mode: "insensitive" } },
          { customer: { is: { firstName: { contains: term, mode: "insensitive" } } } },
          { customer: { is: { lastName: { contains: term, mode: "insensitive" } } } },
        ];
      }
      const [data, total] = await Promise.all([
        prisma.order.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: query.offset,
          take: query.limit,
          select: orderSelect,
        }),
        prisma.order.count({ where }),
      ]);
      return { data, total };
    },
    listCustomers: async (storeId, { limit, offset }) => {
      const [rows, total] = await Promise.all([
        prisma.customer.findMany({
          where: { storeId },
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
          select: {
            id: true,
            email: true,
            phone: true,
            firstName: true,
            lastName: true,
            status: true,
            emailVerifiedAt: true,
            phoneVerifiedAt: true,
            createdAt: true,
            // hash/token ASLA seçilmez; yalnız varlık göstergesi için id.
            credential: { select: { id: true } },
            orders: {
              select: { totalAmount: true, currency: true, status: true, createdAt: true },
              orderBy: { createdAt: "desc" },
            },
            addresses: {
              where: { deletedAt: null },
              select: {
                city: true,
                district: true,
                isDefaultShipping: true,
                isDefaultBilling: true,
                createdAt: true,
              },
              orderBy: { createdAt: "asc" },
            },
          },
        }),
        prisma.customer.count({ where: { storeId } }),
      ]);

      const data: StoreAdminCustomerRecord[] = rows.map((row) => {
        // İptal edilenler harcama toplamına dahil edilmez; geri kalan tüm siparişler sayılır.
        const billable = row.orders.filter((order) => order.status !== "CANCELLED");
        const totalSpentMinor = billable.reduce((sum, order) => sum + order.totalAmount, 0);
        const lastOrderAt = row.orders[0]?.createdAt ?? null;
        const currency = billable[0]?.currency ?? row.orders[0]?.currency ?? "TRY";
        const defaultAddress =
          row.addresses.find((address) => address.isDefaultShipping) ??
          row.addresses.find((address) => address.isDefaultBilling) ??
          row.addresses[0] ??
          null;
        const defaultAddressSummary = defaultAddress
          ? [defaultAddress.city, defaultAddress.district].filter(Boolean).join(", ") || null
          : null;
        return {
          id: row.id,
          email: row.email,
          phone: row.phone,
          firstName: row.firstName,
          lastName: row.lastName,
          status: row.status,
          emailVerifiedAt: row.emailVerifiedAt,
          phoneVerifiedAt: row.phoneVerifiedAt,
          hasCredential: row.credential !== null,
          orderCount: row.orders.length,
          totalSpentMinor,
          currency,
          lastOrderAt,
          addressCount: row.addresses.length,
          defaultAddressSummary,
          createdAt: row.createdAt,
        };
      });

      return { data, total };
    },
    findOrderById: (storeId, orderId) =>
      prisma.order.findFirst({ where: { id: orderId, storeId }, select: orderSelect }),
    resolveActiveShippingRatePlan: async (storeId) => {
      const plan = await resolveActiveRatePlan(prisma, storeId);
      return plan ? toEnginePlan(plan) : null;
    },
    listActiveShippingRatePlans: async (storeId) => {
      const plans = await listActiveRatePlans(prisma, storeId);
      return plans.map(toEnginePlan);
    },
    listShippingProviderDisplays: async (storeId) => {
      // Yalniz ENABLED config'ler; secret/credential DONMEZ — yalniz public gorunum.
      const configs = await prisma.shippingProviderConfig.findMany({
        where: { storeId, status: "ENABLED" },
        select: { provider: true, displayName: true, logoUrl: true, logoAlt: true },
      });
      const map: ProviderDisplayMap = new Map();
      for (const c of configs) {
        // Ayni provider tipinde birden cok mode varsa ilk ENABLED gorunum yeterli.
        if (!map.has(c.provider)) {
          map.set(c.provider, { displayName: c.displayName, logoUrl: c.logoUrl, logoAlt: c.logoAlt });
        }
      }
      return map;
    },
    findDefaultShippingAddress: async (storeId, customerId) => {
      // Default ?? en eski adres (checkout adres defteri onsecimiyle ayni sira):
      // isDefaultShipping desc, sonra createdAt asc. Default isaretli adres yoksa
      // ilk kayitli adrese duser ki preview quote hesaplanabilsin.
      const addr = await prisma.customerAddress.findFirst({
        where: { storeId, customerId, deletedAt: null },
        orderBy: [{ isDefaultShipping: "desc" }, { createdAt: "asc" }],
        select: { city: true, district: true },
      });
      return addr ? { city: addr.city, district: addr.district } : null;
    },
    createOrder: async (storeId, input) => {
      try {
        return await prisma.$transaction(async (transaction: TransactionClient) => {
        if (input.customerId) {
          const customer = await transaction.customer.findFirst({
            where: { id: input.customerId, storeId, status: "ACTIVE" },
            select: { id: true },
          });
          if (!customer) return "CUSTOMER_NOT_FOUND";
        }

        const variants = await transaction.productVariant.findMany({
          where: { storeId, id: { in: input.lines.map((line) => line.variantId) } },
          select: {
            id: true,
            productId: true,
            storeId: true,
            title: true,
            sku: true,
            priceMinor: true,
            // F4C — Siparis ani KDV/maliyet/liste SNAPSHOT'i icin kaynak alanlar.
            compareAtMinor: true,
            costMinor: true,
            netPriceMinor: true,
            vatRateBps: true,
            vatAmountMinor: true,
            currency: true,
            status: true,
            product: {
              select: {
                id: true,
                title: true,
                status: true,
                salesMode: true,
                purchasable: true,
                priceVisibility: true,
                minOrderQuantity: true,
                maxOrderQuantity: true,
              },
            },
          },
        });
        const variantById = new Map(variants.map((variant) => [variant.id, variant]));
        const orderLines = [];
        for (const line of input.lines) {
          const variant = variantById.get(line.variantId);
          if (!variant) return "VARIANT_NOT_FOUND";
          if (variant.status !== "ACTIVE" || variant.product.status !== "ACTIVE") return "INVALID_VARIANT";
          if (variant.currency !== input.currency) return "INVALID_VARIANT";
          const salesError = productSalesError(variant.product, line.quantity);
          if (salesError) return salesError;
          const totalAmount = variant.priceMinor * line.quantity;
          if (totalAmount > maxPostgresInt) return "INVALID_VARIANT";
          // F4C (ADR-063/ADR-064) — Siparis ani KDV/maliyet/liste SNAPSHOT'i.
          // Net/KDV varyanttan okunur; (savunmaci) eksikse bruttan ayristirilir.
          // Degismez: unitNet + unitVat = brut; satir toplamlari birim x adet.
          const unitVatRateBps = variant.vatRateBps ?? DEFAULT_VAT_RATE_BPS;
          const unitNetPriceMinor =
            variant.netPriceMinor ?? splitGrossByVat(variant.priceMinor, unitVatRateBps).netMinor;
          const unitVatAmountMinor = variant.priceMinor - unitNetPriceMinor;
          orderLines.push({
            storeId,
            productId: variant.productId,
            variantId: variant.id,
            sku: variant.sku,
            title: variant.product.title,
            variantTitle: variant.title,
            quantity: line.quantity,
            unitPriceAmount: variant.priceMinor,
            totalAmount,
            currency: input.currency,
            unitNetPriceMinor,
            unitVatRateBps,
            unitVatAmountMinor,
            unitGrossPriceMinor: variant.priceMinor,
            // Liste fiyati: admin'in girdigi showroom/liste (compareAt) ?? brut satis.
            unitListPriceMinor: variant.compareAtMinor ?? variant.priceMinor,
            unitCostMinor: variant.costMinor ?? null,
            lineNetAmountMinor: unitNetPriceMinor * line.quantity,
            lineVatAmountMinor: unitVatAmountMinor * line.quantity,
            lineGrossAmountMinor: totalAmount,
            lineCostMinor: variant.costMinor != null ? variant.costMinor * line.quantity : null,
          });
        }

        const counter = await transaction.orderNumberCounter.upsert({
          where: { storeId },
          update: { nextValue: { increment: 1 } },
          create: { storeId, nextValue: 2 },
          select: { nextValue: true },
        });
        const orderNumber = `OS-${String(counter.nextValue - 1).padStart(6, "0")}`;
        const totals = orderTotals(orderLines, {
          discountAmount: input.discountAmount,
          shippingAmount: input.shippingAmount,
        });
        const order = await transaction.order.create({
          data: {
            storeId,
            orderNumber,
            customerId: input.customerId ?? null,
            customerEmail: input.customerEmail,
            currency: input.currency,
            ...totals,
            // F3C.2 — Kargo ucreti SNAPSHOT'i (kaynak + plan kimligi). Tutar totals'da.
            shippingCurrency: input.shippingSnapshot?.currency ?? null,
            shippingSource: input.shippingSnapshot?.source ?? null,
            shippingRatePlanId: input.shippingSnapshot?.ratePlanId ?? null,
            shippingRatePlanName: input.shippingSnapshot?.ratePlanName ?? null,
            // TODO-125 — Secilen saglayici/secenek snapshot'i (tarihsel sabitlik).
            shippingProvider: input.shippingSnapshot?.provider ?? null,
            shippingProviderName: input.shippingSnapshot?.providerName ?? null,
            shippingLogoUrl: input.shippingSnapshot?.logoUrl ?? null,
            shippingEtaText: input.shippingSnapshot?.etaText ?? null,
            // F3B.2 — Fatura kimlik/vergi alanlari (adres OrderAddress BILLING'de).
            billingType: input.billing?.type ?? null,
            billingName: input.billing?.name ?? null,
            billingTaxId: input.billing?.taxId ?? null,
            billingCompanyName: input.billing?.companyName ?? null,
            billingTaxOffice: input.billing?.taxOffice ?? null,
            billingTaxNumber: input.billing?.taxNumber ?? null,
            billingEmail: input.billing?.email ?? null,
            lines: { create: orderLines },
            addresses: {
              create: input.addresses.map((address) => ({
                storeId,
                type: address.type,
                fullName: address.fullName,
                phone: address.phone ?? null,
                countryCode: address.countryCode,
                city: address.city,
                district: address.district ?? null,
                addressLine1: address.addressLine1,
                addressLine2: address.addressLine2 ?? null,
                postalCode: address.postalCode ?? null,
              })),
            },
            events: {
              create: {
                storeId,
                type: "ORDER_CREATED",
                message: "Order draft created.",
                actorUserId: input.actorUserId,
                metadata: { lineCount: orderLines.length },
              },
            },
          },
          select: { id: true },
        });
        // F4A — Indirim SNAPSHOT (OrderDiscount) + kullanim kaydi (CampaignRedemption).
        // Usage limitleri BURADA atomik yeniden dogrulanir; ihlal transaction'i
        // GERI ALIR (throw) — siparis ve sayac artisi kalici olmaz.
        if (input.discounts && input.discounts.length > 0) {
          const redemptionError = await applyOrderDiscountsInTransaction(transaction, storeId, order.id, {
            discounts: input.discounts,
            customerId: input.customerId ?? null,
            email: input.customerEmail ? input.customerEmail.trim().toLowerCase() : null,
          });
          if (redemptionError) throw new CampaignRedemptionRejection(redemptionError);
        }
        return (await reloadOrder(transaction, storeId, order.id))!;
        });
      } catch (error) {
        // F4A — limit ihlali guvenli hata koduna cevrilir (rollback tamamlandi).
        if (error instanceof CampaignRedemptionRejection) return error.code;
        throw error;
      }
    },
    updateOrder: (storeId, orderId, input) =>
      prisma.$transaction(async (transaction: TransactionClient) => {
        const order = await transaction.order.findFirst({
          where: { id: orderId, storeId },
          select: { id: true, status: true },
        });
        if (!order) return null;
        if (order.status !== "DRAFT") return "MUTATION_NOT_ALLOWED";
        if (input.customerId) {
          const customer = await transaction.customer.findFirst({
            where: { id: input.customerId, storeId, status: "ACTIVE" },
            select: { id: true },
          });
          if (!customer) return "CUSTOMER_NOT_FOUND";
        }
        await transaction.order.update({
          where: { id: orderId },
          data: {
            customerId: input.customerId === undefined ? undefined : input.customerId,
            customerEmail: input.customerEmail,
            events: {
              create: {
                storeId,
                type: "ORDER_UPDATED",
                message: "Order draft updated.",
                actorUserId: input.actorUserId,
                metadata: { fields: Object.keys(input).filter((key) => key !== "actorUserId") },
              },
            },
          },
        });
        return (await reloadOrder(transaction, storeId, orderId))!;
      }),
    addOrderLine: (storeId, orderId, input) =>
      prisma.$transaction(async (transaction: TransactionClient) => {
        const order = await transaction.order.findFirst({
          where: { id: orderId, storeId },
          select: { id: true, status: true, currency: true },
        });
        if (!order) return null;
        if (order.status !== "DRAFT") return "MUTATION_NOT_ALLOWED";
        const variant = await transaction.productVariant.findFirst({
          where: { id: input.variantId, storeId },
          select: {
            id: true,
            productId: true,
            title: true,
            sku: true,
            priceMinor: true,
            // F4C — Siparis ani KDV/maliyet/liste SNAPSHOT'i icin kaynak alanlar.
            compareAtMinor: true,
            costMinor: true,
            netPriceMinor: true,
            vatRateBps: true,
            vatAmountMinor: true,
            currency: true,
            status: true,
            product: {
              select: {
                title: true,
                status: true,
                salesMode: true,
                purchasable: true,
                priceVisibility: true,
                minOrderQuantity: true,
                maxOrderQuantity: true,
              },
            },
          },
        });
        if (!variant) return "VARIANT_NOT_FOUND";
        if (variant.status !== "ACTIVE" || variant.product.status !== "ACTIVE" || variant.currency !== order.currency) {
          return "INVALID_VARIANT";
        }
        const salesError = productSalesError(variant.product, input.quantity);
        if (salesError) return salesError;
        const totalAmount = variant.priceMinor * input.quantity;
        if (totalAmount > maxPostgresInt) return "INVALID_VARIANT";
        // F4C — createOrder ile AYNI snapshot kurali (tek semantik).
        const unitVatRateBps = variant.vatRateBps ?? DEFAULT_VAT_RATE_BPS;
        const unitNetPriceMinor =
          variant.netPriceMinor ?? splitGrossByVat(variant.priceMinor, unitVatRateBps).netMinor;
        const unitVatAmountMinor = variant.priceMinor - unitNetPriceMinor;
        await transaction.orderLine.create({
          data: {
            storeId,
            orderId,
            productId: variant.productId,
            variantId: variant.id,
            sku: variant.sku,
            title: variant.product.title,
            variantTitle: variant.title,
            quantity: input.quantity,
            unitPriceAmount: variant.priceMinor,
            totalAmount,
            currency: order.currency,
            unitNetPriceMinor,
            unitVatRateBps,
            unitVatAmountMinor,
            unitGrossPriceMinor: variant.priceMinor,
            unitListPriceMinor: variant.compareAtMinor ?? variant.priceMinor,
            unitCostMinor: variant.costMinor ?? null,
            lineNetAmountMinor: unitNetPriceMinor * input.quantity,
            lineVatAmountMinor: unitVatAmountMinor * input.quantity,
            lineGrossAmountMinor: totalAmount,
            lineCostMinor: variant.costMinor != null ? variant.costMinor * input.quantity : null,
          },
        });
        const lines = await transaction.orderLine.findMany({ where: { orderId }, select: { totalAmount: true } });
        await transaction.order.update({
          where: { id: orderId },
          data: {
            ...orderTotals(lines),
            events: {
              create: {
                storeId,
                type: "ORDER_LINE_ADDED",
                message: "Order line added.",
                actorUserId: input.actorUserId,
                metadata: { variantId: input.variantId, quantity: input.quantity },
              },
            },
          },
        });
        return (await reloadOrder(transaction, storeId, orderId))!;
      }),
    updateOrderLine: (storeId, orderId, lineId, input) =>
      prisma.$transaction(async (transaction: TransactionClient) => {
        const order = await transaction.order.findFirst({
          where: { id: orderId, storeId },
          select: { id: true, status: true },
        });
        if (!order) return null;
        if (order.status !== "DRAFT") return "MUTATION_NOT_ALLOWED";
        const line = await transaction.orderLine.findFirst({
          where: { id: lineId, orderId, storeId },
          select: {
            id: true,
            unitPriceAmount: true,
            // F4C — Adet degisiminde satir toplam snapshot'lari birim snapshot'tan
            // yeniden turetilir (birim degerler siparis ani degerleridir, DEGISMEZ).
            unitNetPriceMinor: true,
            unitVatAmountMinor: true,
            unitCostMinor: true,
            product: { select: { minOrderQuantity: true, maxOrderQuantity: true } },
          },
        });
        if (!line) return "ORDER_LINE_NOT_FOUND";
        if (input.quantity < line.product.minOrderQuantity) return "PRODUCT_ORDER_QUANTITY_OUT_OF_RANGE";
        if (line.product.maxOrderQuantity !== null && input.quantity > line.product.maxOrderQuantity) {
          return "PRODUCT_ORDER_QUANTITY_OUT_OF_RANGE";
        }
        const totalAmount = line.unitPriceAmount * input.quantity;
        if (totalAmount > maxPostgresInt) return "MUTATION_NOT_ALLOWED";
        await transaction.orderLine.update({
          where: { id: lineId },
          data: {
            quantity: input.quantity,
            totalAmount,
            // F4C — Yalniz F4C-snapshot'li satirlarda; legacy satirda null kalir.
            lineNetAmountMinor:
              line.unitNetPriceMinor != null ? line.unitNetPriceMinor * input.quantity : null,
            lineVatAmountMinor:
              line.unitVatAmountMinor != null ? line.unitVatAmountMinor * input.quantity : null,
            lineGrossAmountMinor: line.unitNetPriceMinor != null ? totalAmount : null,
            lineCostMinor: line.unitCostMinor != null ? line.unitCostMinor * input.quantity : null,
          },
        });
        const lines = await transaction.orderLine.findMany({ where: { orderId }, select: { totalAmount: true } });
        await transaction.order.update({
          where: { id: orderId },
          data: {
            ...orderTotals(lines),
            events: {
              create: {
                storeId,
                type: "ORDER_LINE_UPDATED",
                message: "Order line updated.",
                actorUserId: input.actorUserId,
                metadata: { lineId, quantity: input.quantity },
              },
            },
          },
        });
        return (await reloadOrder(transaction, storeId, orderId))!;
      }),
    placeOrder: (storeId, orderId, input) =>
      prisma.$transaction(async (transaction: TransactionClient) => {
        const order = await transaction.order.findFirst({
          where: { id: orderId, storeId },
          select: orderSelect,
        });
        if (!order) return null;
        if (order.status === "PLACED") return order;
        if (order.status !== "DRAFT" || order.lines.length === 0) return "INVALID_STATUS";
        const variants = await transaction.productVariant.findMany({
          where: { storeId, id: { in: order.lines.map((line) => line.variantId) } },
          select: {
            id: true,
            status: true,
            product: {
              select: {
                status: true,
                salesMode: true,
                purchasable: true,
                priceVisibility: true,
                minOrderQuantity: true,
                maxOrderQuantity: true,
              },
            },
          },
        });
        const variantById = new Map(variants.map((variant) => [variant.id, variant]));
        for (const line of order.lines) {
          const variant = variantById.get(line.variantId);
          if (!variant || variant.status !== "ACTIVE" || variant.product.status !== "ACTIVE") return "INVALID_VARIANT";
          const salesError = productSalesError(variant.product, line.quantity);
          if (salesError) return salesError;
          const rows = await transaction.$queryRaw<Array<{ quantityOnHand: number; quantityReserved: number }>>`
            SELECT "quantityOnHand", "quantityReserved"
            FROM "InventoryItem"
            WHERE "storeId" = ${storeId} AND "variantId" = ${line.variantId}
            FOR UPDATE
          `;
          const item = rows[0];
          if (!item) return "RESERVATION_FAILED";
          if (item.quantityOnHand - item.quantityReserved < line.quantity) return "INSUFFICIENT_STOCK";
          await transaction.inventoryItem.update({
            where: { variantId: line.variantId },
            data: { quantityReserved: { increment: line.quantity } },
          });
          await transaction.inventoryReservation.create({
            data: {
              storeId,
              orderId,
              orderLineId: line.id,
              variantId: line.variantId,
              quantity: line.quantity,
              status: "ACTIVE",
            },
          });
          await transaction.inventoryMovement.create({
            data: {
              storeId,
              variantId: line.variantId,
              type: "SALE_RESERVATION",
              quantityDelta: line.quantity,
              reason: "Order placed.",
              referenceType: "Order",
              referenceId: orderId,
              actorUserId: input.actorUserId,
            },
          });
        }
        await transaction.order.update({
          where: { id: orderId },
          data: {
            status: "PLACED",
            placedAt: new Date(),
            events: {
              create: [
                {
                  storeId,
                  type: "ORDER_PLACED",
                  message: "Order placed and inventory reserved.",
                  actorUserId: input.actorUserId,
                  metadata: { lineCount: order.lines.length },
                },
                {
                  storeId,
                  type: "RESERVATION_CREATED",
                  message: "Inventory reservations created.",
                  actorUserId: input.actorUserId,
                  metadata: { lineCount: order.lines.length },
                },
              ],
            },
          },
        });
        return (await reloadOrder(transaction, storeId, orderId))!;
      }),
    cancelOrder: (storeId, orderId, input) =>
      prisma.$transaction(async (transaction: TransactionClient) => {
        const order = await transaction.order.findFirst({
          where: { id: orderId, storeId },
          select: orderSelect,
        });
        if (!order) return null;
        if (order.status === "CANCELLED") return order;
        if (order.status === "FULFILLED") return "INVALID_STATUS";
        const now = new Date();
        const activeReservations = order.reservations.filter((reservation) => reservation.status === "ACTIVE");
        for (const reservation of activeReservations) {
          const rows = await transaction.$queryRaw<Array<{ quantityReserved: number }>>`
            SELECT "quantityReserved"
            FROM "InventoryItem"
            WHERE "storeId" = ${storeId} AND "variantId" = ${reservation.variantId}
            FOR UPDATE
          `;
          const item = rows[0];
          if (!item || item.quantityReserved < reservation.quantity) return "RESERVATION_FAILED";
          await transaction.inventoryItem.update({
            where: { variantId: reservation.variantId },
            data: { quantityReserved: { decrement: reservation.quantity } },
          });
          await transaction.inventoryReservation.update({
            where: { id: reservation.id },
            data: { status: "RELEASED", releasedAt: now },
          });
          await transaction.inventoryMovement.create({
            data: {
              storeId,
              variantId: reservation.variantId,
              type: "SALE_RELEASE",
              quantityDelta: -reservation.quantity,
              reason: "Order cancelled.",
              referenceType: "Order",
              referenceId: orderId,
              actorUserId: input.actorUserId,
            },
          });
        }
        await transaction.order.update({
          where: { id: orderId },
          data: {
            status: "CANCELLED",
            fulfillmentStatus: "CANCELLED",
            cancelledAt: now,
            cancelReason: input.reason,
            events: {
              create: [
                {
                  storeId,
                  type: "ORDER_CANCELLED",
                  message: "Order cancelled.",
                  actorUserId: input.actorUserId,
                  metadata: { reason: input.reason ?? null },
                },
                {
                  storeId,
                  type: "RESERVATION_RELEASED",
                  message: "Active inventory reservations released.",
                  actorUserId: input.actorUserId,
                  metadata: { releasedCount: activeReservations.length },
                },
              ],
            },
          },
        });
        return (await reloadOrder(transaction, storeId, orderId))!;
      }),
    // --- F3B.2 Payment provider operasyon altyapisi ------------------------
    listPaymentProviderConfigs: (storeId) =>
      prisma.paymentProviderConfig.findMany({
        where: { storeId },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
    findPaymentProviderConfigById: (storeId, configId) =>
      prisma.paymentProviderConfig.findFirst({ where: { id: configId, storeId } }),
    createPaymentProviderConfig: async (storeId, input) => {
      try {
        return await prisma.paymentProviderConfig.create({
          data: { storeId, ...input } satisfies Prisma.PaymentProviderConfigUncheckedCreateInput,
        });
      } catch (error) {
        if (isPrismaUniqueConstraintError(error)) {
          return "PROVIDER_MODE_EXISTS";
        }
        throw error;
      }
    },
    updatePaymentProviderConfig: async (storeId, configId, input) => {
      const existing = await prisma.paymentProviderConfig.findFirst({
        where: { id: configId, storeId },
        select: { id: true },
      });
      if (!existing) {
        return null;
      }
      try {
        return await prisma.paymentProviderConfig.update({
          where: { id: configId },
          data: input satisfies Prisma.PaymentProviderConfigUncheckedUpdateInput,
        });
      } catch (error) {
        if (isPrismaUniqueConstraintError(error)) {
          return "PROVIDER_MODE_EXISTS";
        }
        throw error;
      }
    },
    setPaymentProviderStatus: async (storeId, configId, status) => {
      const existing = await prisma.paymentProviderConfig.findFirst({
        where: { id: configId, storeId },
        select: { id: true },
      });
      if (!existing) {
        return null;
      }
      return prisma.paymentProviderConfig.update({ where: { id: configId }, data: { status } });
    },
    reorderPaymentProviderPriorities: async (storeId, items) => {
      const ids = items.map((item) => item.id);
      const owned = await prisma.paymentProviderConfig.findMany({
        where: { storeId, id: { in: ids } },
        select: { id: true },
      });
      if (owned.length !== ids.length) {
        return "CONFIG_NOT_FOUND";
      }
      await prisma.$transaction(
        items.map((item) =>
          prisma.paymentProviderConfig.update({
            where: { id: item.id },
            data: { priority: item.priority },
          }),
        ),
      );
      return prisma.paymentProviderConfig.findMany({
        where: { storeId },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      });
    },
    recordPaymentProviderTest: async (storeId, configId, input) => {
      const existing = await prisma.paymentProviderConfig.findFirst({
        where: { id: configId, storeId },
        select: { id: true },
      });
      if (!existing) {
        return null;
      }
      return prisma.paymentProviderConfig.update({
        where: { id: configId },
        data: { lastTestStatus: input.status, lastTestMessage: input.message, lastTestAt: input.at },
      });
    },
    createPaymentAttempt: (storeId, input) =>
      prisma.paymentAttempt.create({
        data: { storeId, ...input } satisfies Prisma.PaymentAttemptUncheckedCreateInput,
      }),
    findPaymentAttemptById: (storeId, attemptId) =>
      prisma.paymentAttempt.findFirst({ where: { id: attemptId, storeId } }),
    findLatestPaymentAttemptForOrder: (storeId, orderId) =>
      prisma.paymentAttempt.findFirst({
        where: { storeId, orderId },
        orderBy: { createdAt: "desc" },
      }),
    recordPaymentAttemptOutcome: (storeId, input) =>
      prisma.$transaction(async (transaction) => {
        const attempt = await transaction.paymentAttempt.update({
          where: { id: input.attemptId },
          data: {
            status: input.attemptStatus,
            threeDsApplied: input.threeDsApplied,
            scenario: input.scenario ?? undefined,
            providerReference: input.providerReference ?? undefined,
            failureCode: input.failureCode ?? null,
            failureMessage: input.failureMessage ?? null,
            ...(input.installmentCount !== undefined ? { installmentCount: input.installmentCount } : {}),
            ...(input.cardBrand !== undefined ? { cardBrand: input.cardBrand } : {}),
            ...(input.cardLast4 !== undefined ? { cardLast4: input.cardLast4 } : {}),
            ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
            ...(input.failedAt !== undefined ? { failedAt: input.failedAt } : {}),
            ...(input.clearAccessToken
              ? { accessTokenHash: null, accessTokenExpiresAt: null }
              : {}),
          },
        });
        if (input.orderPaymentStatus) {
          await transaction.order.update({
            where: { id: input.orderId },
            data: { paymentStatus: input.orderPaymentStatus },
          });
        }
        await transaction.paymentProviderEvent.create({
          data: {
            storeId,
            providerConfigId: attempt.providerConfigId,
            attemptId: attempt.id,
            orderId: input.orderId,
            provider: input.event.provider,
            type: input.event.type,
            eventId: input.event.eventId ?? null,
            message: input.event.message ?? null,
            metadata: toPrismaJsonObject(input.event.metadata ?? undefined),
          } satisfies Prisma.PaymentProviderEventUncheckedCreateInput,
        });
        return attempt;
      }),
    createPaymentProviderEvent: (storeId, input) =>
      prisma.paymentProviderEvent.create({
        data: {
          storeId,
          providerConfigId: input.providerConfigId ?? null,
          attemptId: input.attemptId ?? null,
          orderId: input.orderId ?? null,
          provider: input.provider,
          type: input.type,
          eventId: input.eventId ?? null,
          message: input.message ?? null,
          metadata: toPrismaJsonObject(input.metadata ?? undefined),
        } satisfies Prisma.PaymentProviderEventUncheckedCreateInput,
      }),
    findPaymentProviderEventByEventId: (storeId, provider, eventId) =>
      prisma.paymentProviderEvent.findFirst({ where: { storeId, provider, eventId } }),
    listPaymentProviderEvents: (storeId, input) =>
      prisma.paymentProviderEvent.findMany({
        where: { storeId, ...(input.providerConfigId ? { providerConfigId: input.providerConfigId } : {}) },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        skip: input.offset,
      }),
    createAuditLog: async (input) => {
      await prisma.auditLog.create({
        data: {
          ...input,
          metadata: toPrismaJsonObject(input.metadata),
        } satisfies Prisma.AuditLogUncheckedCreateInput,
      });
    },
  };
}

export function createServer(
  config: AppConfig,
  dependencies: ServerDependencies = {},
): FastifyInstance {
  const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);
  const dbHealthCheck = dependencies.checkDatabaseHealth ?? checkDatabaseHealth;
  const redisHealthCheck = dependencies.checkRedisHealth ?? checkRedisHealth;
  const dataAccess = dependencies.dataAccess ?? createPrismaDataAccess();
  const customers = dependencies.customerDataAccess ?? createPrismaCustomerDataAccess();
  // F4A.3 (ADR-060) — Musteri kupon cuzdani veri erisimi (atama/claim/apply state).
  const wallet: WalletDataAccess = createPrismaWalletDataAccess();
  const loginRateLimiter = createLoginRateLimiter(config);
  // F3B.2: Payment credential cipher (encryption-at-rest). Dev fallback uyarisi
  // yalnizca bir kez loglanir. Calisma ortami canli mi? (LIVE-MOCK guard icin).
  let cipherWarned = false;
  const secretCipher: SecretCipher = createSecretCipher({
    key: config.PAYMENT_ENCRYPTION_KEY,
    appEnv: config.APP_ENV,
    warn: (message) => {
      if (!cipherWarned) {
        cipherWarned = true;
        logger.warn(message);
      }
    },
  });
  const isLiveEnv = config.APP_ENV === "production" || config.APP_ENV === "staging";
  // F3B.2: Provider adapter registry. Gercek provider HTTP transport'u yalnizca
  // PAYMENT_SANDBOX_HTTP_ENABLED acikken aktiftir (varsayilan KAPALI → bu fazda
  // canli/sandbox cagri yapilmaz; MOCK transport gerektirmez).
  const paymentTransport = config.PAYMENT_SANDBOX_HTTP_ENABLED
    ? createFetchHttpTransport()
    : createDisabledHttpTransport();
  const paymentAdapters = createPaymentAdapterRegistry(paymentTransport);
  // F3B.2: Public checkout handler (yukaridaki) ile odeme yonlendirme uretici
  // (asagidaki F3B.2 blogu) arasinda kopru. Provider yoksa null doner ve checkout
  // response shape'i birebir korunur.
  const paymentRedirectBuilderRef: {
    current:
      | ((
          storeId: string,
          order: OrderRecord,
        ) => Promise<{
          required: true;
          attemptId: string;
          token: string;
          paymentPath: string;
          scenarios: PaymentScenario[];
        } | null>)
      | null;
  } = { current: null };
  const app = Fastify({ logger: false });

  async function authenticatePlatform(request: FastifyRequest, reply: FastifyReply) {
    const token = bearerToken(request);
    if (!token) {
      await reply.code(401).send(errorBody("UNAUTHORIZED", "Unauthorized."));
      return null;
    }

    const session = await dataAccess.findPlatformSessionByTokenHash(
      hashSessionToken(token, config.SESSION_SECRET),
    );
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      await reply.code(401).send(errorBody("UNAUTHORIZED", "Unauthorized."));
      return null;
    }

    return session;
  }

  async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
    const session = await authenticatePlatform(request, reply);
    if (!session) {
      return null;
    }
    if (!["SUPER_ADMIN", "SUPPORT_ADMIN"].includes(session.platformUser.role)) {
      await reply.code(403).send(errorBody("FORBIDDEN", "Forbidden."));
      return null;
    }
    return session;
  }

  async function requireStorePlatformAdmin(
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) {
    const session = await requirePlatformAdmin(request, reply);
    if (!session) {
      return null;
    }
    const store = await dataAccess.findStoreById(storeId);
    if (!store) {
      await reply.code(404).send(errorBody("STORE_ACCESS_DENIED", "Store access denied."));
      return null;
    }
    return { session, store };
  }

  // Faz 1B (ADR-067) — PLATFORM-scope kaynaklari (or. platform attribute'lari) yalniz
  // SUPER_ADMIN yonetebilir. requirePlatformAdmin SUPPORT_ADMIN'e de izin verir; bu
  // guard onu daraltir (mevcut yetkileri BOZMADAN yeni, daha kati bir kapi ekler).
  async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
    const session = await authenticatePlatform(request, reply);
    if (!session) {
      return null;
    }
    if (session.platformUser.role !== "SUPER_ADMIN") {
      await reply.code(403).send(errorBody("FORBIDDEN", "Forbidden."));
      return null;
    }
    return session;
  }

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof z.ZodError) {
      await reply.code(400).send(errorBody("VALIDATION_ERROR", "Validation failed.", error.flatten()));
      return;
    }
    const normalizedError = error instanceof Error ? error : new Error("Unknown error");
    logger.error("request failed", {
      name: normalizedError.name,
      message: normalizedError.message,
    });
    await reply.code(500).send(errorBody("INTERNAL_SERVER_ERROR", "Internal server error."));
  });

  app.addHook("onRequest", async (request) => {
    logger.info("request received", {
      method: request.method,
      url: request.url,
      requestId: request.id,
    });
  });

  app.get("/health", async () =>
    healthResponseSchema.parse({
      status: "ok",
      service: config.SERVICE_NAME,
      timestamp: new Date().toISOString(),
    }),
  );

  app.get("/version", async () => ({
    name: "commerce-os",
    service: config.SERVICE_NAME,
    version: "0.1.0",
  }));

  app.get(
    "/internal/health/db",
    { preHandler: requireInternalToken(config) },
    async (_request, reply) => {
      const ok = await dbHealthCheck();
      return reply.code(ok ? 200 : 503).send({ status: ok ? "ok" : "degraded" });
    },
  );

  app.get(
    "/internal/health/redis",
    { preHandler: requireInternalToken(config) },
    async (_request, reply) => {
      const ok = await redisHealthCheck(config.REDIS_URL);
      return reply.code(ok ? 200 : 503).send({ status: ok ? "ok" : "degraded" });
    },
  );

  // ADR-065 (Faz 3/Site Kabuğu) — hero veri erisimi admin + public route'larca
  // PAYLASILIR (tek instance). Admin listHeroSlides tum durumlari, public
  // listPublishedHeroSlides yalniz PUBLISHED slide'lari okur. Testlerde enjekte edilebilir.
  const heroDataAccess = dependencies.heroDataAccess ?? createPrismaHeroDataAccess();

  // --- Public storefront catalog (auth YOK, store-scoped, salt-okunur) -----
  // TD-032 / TODO-061: Public vitrin bu uclari token'siz cagirir; platform-admin
  // resolver'a ihtiyac kalmaz. Yalnizca ACTIVE store + ACTIVE urun/varyant doner;
  // govde `publicProduct*` semalariyla (allowlist) serialize edilir, ic/yonetim
  // alanlari sizmaz. Yalnizca GET (read-only); mutation ucu yoktur.
  async function resolvePublicStore(slug: string) {
    const store = await dataAccess.findStoreBySlug(slug);
    if (!store || store.status !== "ACTIVE") {
      return null;
    }
    return store;
  }

  async function loadActivePublicProducts(storeId: string) {
    const page = await dataAccess.listProducts(storeId, { limit: PUBLIC_CATALOG_MAX, offset: 0 });
    return page.data.filter((product) => product.status === "ACTIVE");
  }

  async function loadPublicCategoryNames(storeId: string) {
    const page = await dataAccess.listCategories(storeId, { limit: PUBLIC_CATALOG_MAX, offset: 0 });
    return new Map(page.data.map((category) => [category.id, category.name]));
  }

  async function loadPublicStockMap(storeId: string) {
    const page = await dataAccess.listInventory(storeId, { limit: PUBLIC_CATALOG_MAX, offset: 0 });
    return new Map(page.data.map((item) => [item.variantId, item.quantityOnHand - item.quantityReserved]));
  }

  // F4B — EU Omnibus: store'daki her varyant icin son 30 gunun en dusuk satis fiyati.
  async function loadPublicLowestPriceMap(storeId: string) {
    return dataAccess.lowestRecentPriceByStore(storeId, OMNIBUS_WINDOW_DAYS);
  }

  async function loadActivePublicVariants(storeId: string, productId: string) {
    const page = await dataAccess.listVariants(storeId, productId, {
      limit: PUBLIC_CATALOG_MAX,
      offset: 0,
    });
    return page.data.filter((variant) => variant.status === "ACTIVE");
  }

  app.get("/public/stores/:storeSlug/products", async (request, reply) => {
    const params = publicStoreParamSchema.parse(request.params);
    const pagination = paginationQuerySchema.parse(request.query);
    const store = await resolvePublicStore(params.storeSlug);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }
    const [products, categoryNames, stockMap, publicCampaigns, lowestMap] = await Promise.all([
      loadActivePublicProducts(store.id),
      loadPublicCategoryNames(store.id),
      loadPublicStockMap(store.id),
      // F4A.1 — Rozet projeksiyonu icin ACTIVE + isPublic kampanyalar (store-scoped).
      dataAccess.listPublicActiveCampaigns(store.id),
      // F4B — Omnibus: son 30 gunun en dusuk satis fiyati (variant-bazli).
      loadPublicLowestPriceMap(store.id),
    ]);
    const badgeNow = new Date();
    const slice = products.slice(pagination.offset, pagination.offset + pagination.limit);
    // ADR-065 (Faz 3/Dilim 1) — Sayfa slice'i icin TEK batched kapak sorgusu (N+1 yok;
    // yalniz kapak). Record'a enjekte edilir → buildPublicProduct kapagi serialize eder.
    const coverMap = await dataAccess.listProductImages(
      store.id,
      slice.map((product) => product.id),
      true,
    );
    const data = await Promise.all(
      slice.map(async (product) =>
        buildPublicProduct(
          { ...product, images: coverMap.get(product.id) ?? [] },
          await loadActivePublicVariants(store.id, product.id),
          categoryNames,
          stockMap,
          publicCampaigns,
          badgeNow,
          lowestMap,
          config.MEDIA_PUBLIC_BASE_URL,
        ),
      ),
    );
    return publicProductListResponseSchema.parse({
      data,
      pagination: { limit: pagination.limit, offset: pagination.offset, total: products.length },
    });
  });

  app.get("/public/stores/:storeSlug/products/:productSlug", async (request, reply) => {
    const params = publicProductParamSchema.parse(request.params);
    const store = await resolvePublicStore(params.storeSlug);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }
    const products = await loadActivePublicProducts(store.id);
    const product = products.find((item) => item.slug === params.productSlug);
    if (!product) {
      return reply.code(404).send(errorBody("PRODUCT_NOT_FOUND", "Product not found."));
    }
    const [categoryNames, stockMap, publicCampaigns, lowestMap] = await Promise.all([
      loadPublicCategoryNames(store.id),
      loadPublicStockMap(store.id),
      // F4A.1 — Rozet projeksiyonu icin ACTIVE + isPublic kampanyalar (store-scoped).
      dataAccess.listPublicActiveCampaigns(store.id),
      // F4B — Omnibus: son 30 gunun en dusuk satis fiyati (variant-bazli).
      loadPublicLowestPriceMap(store.id),
    ]);
    const badgeNow = new Date();
    const relatedProducts = products.filter((item) => item.id !== product.id).slice(0, 4);
    // ADR-065 (Faz 3/Dilim 1) — Birincil urun TAM galeri (coverOnly=false); ilgili urunler
    // yalniz kapak. Iki batched sorgu (N+1 yok). buildPublicProduct record'un images'ini
    // serialize eder → birincil = tam dizi, ilgili = [kapak].
    const [galleryMap, relatedCoverMap] = await Promise.all([
      dataAccess.listProductImages(store.id, [product.id], false),
      dataAccess.listProductImages(store.id, relatedProducts.map((item) => item.id), true),
    ]);
    const variants = await loadActivePublicVariants(store.id, product.id);
    const summary = buildPublicProduct(
      { ...product, images: galleryMap.get(product.id) ?? [] },
      variants,
      categoryNames,
      stockMap,
      publicCampaigns,
      badgeNow,
      lowestMap,
      config.MEDIA_PUBLIC_BASE_URL,
    );
    const related = await Promise.all(
      relatedProducts.map(async (item) =>
        buildPublicProduct(
          { ...item, images: relatedCoverMap.get(item.id) ?? [] },
          await loadActivePublicVariants(store.id, item.id),
          categoryNames,
          stockMap,
          publicCampaigns,
          badgeNow,
          lowestMap,
          config.MEDIA_PUBLIC_BASE_URL,
        ),
      ),
    );
    return publicProductDetailSchema.parse({
      ...summary,
      description: product.description ?? null,
      callToActionLabel: product.callToActionLabel ?? null,
      whatsappMessageTemplate: product.whatsappMessageTemplate ?? null,
      inquiryFormTitle: product.inquiryFormTitle ?? null,
      appointmentNote: product.appointmentNote ?? null,
      related,
    });
  });

  // F4A / Storefront redesign — Vitrin ust band kampanya slider'i. Store
  // seviyesindeki ACTIVE + isPublic kampanyalarin public-safe slide listesini
  // doner (urun uclariyla AYNI projeksiyon; mock DEGIL, gercek F4A verisi).
  app.get("/public/stores/:storeSlug/campaigns", async (request, reply) => {
    const params = publicStoreParamSchema.parse(request.params);
    const store = await resolvePublicStore(params.storeSlug);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }
    const publicCampaigns = await dataAccess.listPublicActiveCampaigns(store.id);
    const slides = selectPublicCampaignSlides(publicCampaigns, new Date());
    return publicCampaignSlidesResponseSchema.parse({ data: slides });
  });

  // ADR-065 (Faz 3/Site Kabuğu) — Public magaza marka bilgisi (header logo/kelime-
  // isareti + <head> favicon/title). storeName daima resolvePublicStore→store.name;
  // logo/favicon URL'leri StoreSettings satirindan turetilir (lazy: satir yoksa
  // her ikisi de null). ALLOWLIST: logoMediaId/faviconMediaId ham FK'ler DISARIDA
  // (yalniz *Url; buildPublicStoreInfo + publicStoreInfoSchema.parse iki katman).
  app.get("/public/stores/:storeSlug/store-info", async (request, reply) => {
    const params = publicStoreParamSchema.parse(request.params);
    const store = await resolvePublicStore(params.storeSlug);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }
    const settings = await dataAccess.getStoreSettings(store.id);
    return publicStoreInfoSchema.parse({
      storeName: store.name,
      logoUrl: settings?.logo
        ? resolveMediaUrl(config.MEDIA_PUBLIC_BASE_URL, settings.logo.storageKey)
        : null,
      faviconUrl: settings?.favicon
        ? resolveMediaUrl(config.MEDIA_PUBLIC_BASE_URL, settings.favicon.storageKey)
        : null,
    });
  });

  // ADR-065 (Faz 3/Site Kabuğu) — Public hero slide'lari (ana sayfa carousel).
  // Yalniz PUBLISHED (listPublishedHeroSlides DB sorgusunda status filtreler;
  // DRAFT hic yuklenmez), position ASC. ALLOWLIST: serializePublicHeroSlide
  // mediaId/status/zamanlama TASIMAZ. Bos → { data: [] } (vitrin statik hero
  // fallback'ine duser; band deseniyle tutarli).
  app.get("/public/stores/:storeSlug/hero-slides", async (request, reply) => {
    const params = publicStoreParamSchema.parse(request.params);
    const store = await resolvePublicStore(params.storeSlug);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }
    const slides = await heroDataAccess.listPublishedHeroSlides(store.id);
    return publicHeroSlidesResponseSchema.parse({
      data: slides.map((slide) => serializePublicHeroSlide(slide, config.MEDIA_PUBLIC_BASE_URL)),
    });
  });

  // --- Public storefront cart + checkout (auth YOK, store-scoped) -----------
  // F3B.1: Vitrin cookie'si yalnizca {variantId, quantity} referansi tasir.
  // Sepet/checkout gateway tarafinda her istekte ACTIVE store + ACTIVE urun/
  // varyant + stok uzerinden YENIDEN cozulur; fiyat/baslik/salesMode istemciden
  // KABUL EDILMEZ. Tenant izolasyonu iki katmanlidir: (1) index yalnizca bu
  // store'un ACTIVE varyantlarini icerir, (2) order create store-scoped'tur.

  /** Bu store'un ACTIVE urun/varyantlarini variantId -> cozulebilir kayit map'i. */
  async function buildPublicCartIndex(storeId: string) {
    const [products, stockMap] = await Promise.all([
      loadActivePublicProducts(storeId),
      loadPublicStockMap(storeId),
    ]);
    const index = new Map<string, CartResolvableVariant>();
    await Promise.all(
      products.map(async (product) => {
        const variants = await loadActivePublicVariants(storeId, product.id);
        for (const variant of variants) {
          index.set(variant.id, {
            variantId: variant.id,
            productId: product.id,
            categoryIds: product.categoryIds,
            productSlug: product.slug,
            productTitle: product.title,
            variantTitle: variant.title,
            sku: variant.sku,
            salesMode: product.salesMode,
            purchasable: product.purchasable,
            priceVisibility: product.priceVisibility,
            priceMinor: variant.priceMinor,
            compareAtMinor: variant.compareAtMinor ?? null,
            currency: variant.currency,
            minOrderQuantity: product.minOrderQuantity,
            maxOrderQuantity: product.maxOrderQuantity ?? null,
            available: stockMap.has(variant.id) ? stockMap.get(variant.id)! : null,
            // Kargo olcumu: varyant degeri urun-seviyesi fallback'i override eder.
            ...resolveShippingDims(
              { shippingDesi: decimalToNumber(variant.shippingDesi), shippingWeightKg: decimalToNumber(variant.shippingWeightKg) },
              { shippingDesi: decimalToNumber(product.shippingDesi), shippingWeightKg: decimalToNumber(product.shippingWeightKg) },
            ),
          });
        }
      }),
    );
    return index;
  }

  /**
   * ADR-065 (Faz 3/Dilim 6a) — Sepet/onay satirlari icin kapak URL'i haritasi.
   * TEK batched listProductImages(coverOnly=true) cagrisiyla (N+1 YOK) her urunun
   * en dusuk position kapagini alir; storageKey'i resolveMediaUrl ile public URL'e
   * cevirir (MEDIA_PUBLIC_BASE_URL bos ise /media/<key> goreli, doluysa CDN koku).
   * Kapaksiz urun haritada YER ALMAZ (cagiran ?? null ile yer tutucuya duser).
   * mediaId/storageKey disari SIZMAZ — yalniz turetilmis URL doner (allowlist).
   */
  async function buildCartCoverUrlMap(
    storeId: string,
    productIds: string[],
  ): Promise<Map<string, string>> {
    // Dilim 6b ile paylasilan helper'a delege (tek allowlist noktasi, N+1'siz).
    // Arrow wrapper: method REFERANSI degil cagri — dataAccess `this` baglami korunur
    // (bazi implementasyonlar this.* kullanir; detached referans this'i koparirdi).
    return buildProductCoverUrlMap(
      (sid, pids, coverOnly) => dataAccess.listProductImages(sid, pids, coverOnly),
      config.MEDIA_PUBLIC_BASE_URL,
      storeId,
      productIds,
    );
  }

  /**
   * F4A.3 (ADR-060) — Sepet "Kuponlar" kartlari icin cuzdan adaylarini toplar:
   *  (1) PUBLIC: isPublic + ACTIVE kupon kampanyalari (herkes claim edebilir),
   *  (2) ASSIGNED/CLAIMED: oturum acmis musteri/email cuzdani (DB),
   *  (3) CLAIMED: misafir cookie'sinden gelen normalize kod claim'leri.
   * Uygunluk/durum projeksiyon (projectWalletCoupons) tarafinda hesaplanir.
   */
  async function loadCartWalletCandidates(
    storeId: string,
    input: { customerId: string | null; email: string | null; claimedCodes: string[] },
  ): Promise<WalletCandidate[]> {
    const [publicCampaigns, walletEntries, guestClaimed] = await Promise.all([
      dataAccess.listPublicActiveCampaigns(storeId),
      wallet.listWalletEntriesForIdentity(storeId, {
        customerId: input.customerId,
        email: input.email,
      }),
      input.claimedCodes.length > 0
        ? wallet.resolveCouponsWithCampaignByCodes(storeId, input.claimedCodes)
        : Promise.resolve([] as CouponWithCampaign[]),
    ]);
    const candidates: WalletCandidate[] = [];
    for (const campaign of publicCampaigns) {
      if (campaign.type !== "COUPON_CODE") continue;
      for (const coupon of campaign.coupons) {
        candidates.push({ coupon, campaign, source: "PUBLIC" });
      }
    }
    for (const entry of walletEntries) {
      candidates.push({ coupon: entry.coupon, campaign: entry.campaign, source: entry.source });
    }
    for (const item of guestClaimed) {
      candidates.push({ coupon: item.coupon, campaign: item.campaign, source: "CLAIMED" });
    }
    return candidates;
  }

  app.post("/public/stores/:storeSlug/cart", async (request, reply) => {
    const params = publicStoreParamSchema.parse(request.params);
    const body = publicCartRequestSchema.parse(request.body ?? {});
    const store = await resolvePublicStore(params.storeSlug);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }
    const index = await buildPublicCartIndex(store.id);
    // F3C.2/TODO-125 — Kargo SECENEKLERI store tarife planlarindan uretilir. Oturum
    // acmis musteri + default teslimat adresi varsa secenekler fiyatlanir; aksi halde
    // ADDRESS_REQUIRED (taşıyıcılar yine listelenir, fiyatsiz).
    const [plans, providerDisplays] = await Promise.all([
      dataAccess.listActiveShippingRatePlans(store.id),
      dataAccess.listShippingProviderDisplays(store.id),
    ]);
    const cartCustomer = await resolveCustomerFromRequest(request, store.id, { customers, config });
    let address: EngineAddress | null = null;
    let addressKnown = false;
    if (cartCustomer) {
      const def = await dataAccess.findDefaultShippingAddress(store.id, cartCustomer.id);
      if (def) {
        // zoneCode: adresten zon cozumlemesi (city->zone) ileride wire edilecek (TODO);
        // su an null -> zoneId'li kurallar eslesmez, city/district specificity calisir.
        address = { cityCode: def.city, districtCode: def.district, regionCode: null, zoneCode: null };
        addressKnown = true;
      }
    }
    // F4A — Kampanya/kupon baglami DB'den yuklenir; oturum acik musteri varsa
    // per-customer limitleri sepet aninda da degerlendirilir (misafirde checkout'ta).
    const discountContext = await dataAccess.loadCampaignDiscountContext(store.id, {
      normalizedCouponCode: normalizeCouponCode(body.couponCode ?? null),
      customerId: cartCustomer?.id ?? null,
      email: null,
    });
    // F4A.3 — Cuzdan kartlari icin adaylar (public + oturum cuzdani + misafir claim).
    const walletCandidates = await loadCartWalletCandidates(store.id, {
      customerId: cartCustomer?.id ?? null,
      email: cartCustomer?.email ?? null,
      claimedCodes: (body.claimedCodes ?? []).map((code) => normalizeCouponCode(code) ?? "").filter(Boolean),
    });
    // ADR-065 (Faz 3/Dilim 6a) — Sepet satiri kapaklari: variantId'ler index'ten
    // productId'ye cozulur, TEK batched sorguyla kapak URL'leri hazirlanir (N+1 yok).
    const coverUrlByProductId = await buildCartCoverUrlMap(
      store.id,
      body.items.map((item) => index.get(item.variantId)?.productId).filter((id): id is string => Boolean(id)),
    );
    const { cart } = assemblePublicCart(
      store.slug,
      index,
      body.items,
      { couponCode: body.couponCode ?? null, context: discountContext },
      {
        plans,
        providerDisplays,
        address,
        addressKnown,
        requestedOptionId: body.shippingOptionId ?? null,
      },
      { candidates: walletCandidates },
      coverUrlByProductId,
      body.deselectedVariantIds ?? [],
    );
    return cart;
  });

  /**
   * F4A.3 (ADR-060) — Kupon "claim" (cuzdana ekle). Kod sunucuda dogrulanir
   * (ACTIVE + pencere + limit); uygunsa cuzdana eklenir (oturum acmis musteride
   * DB satiri, misafirde yanit + cookie'ye yazma cagiran tarafta). Alt limit/kapsam
   * BURADA reddetmez — bunlar sepet-zamanli kart durumudur. Uygulama (apply) AYRIDIR.
   * PRIVATE kupon kodu bilen musteri tarafindan claim edilebilir; public sizinti YOK.
   */
  app.post("/public/stores/:storeSlug/cart/coupons/claim", async (request, reply) => {
    const params = publicStoreParamSchema.parse(request.params);
    const body = publicCouponClaimRequestSchema.parse(request.body ?? {});
    const store = await resolvePublicStore(params.storeSlug);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }
    const normalizedCode = normalizeCouponCode(body.code);
    const fail = (reason: PublicCouponReason) =>
      publicCouponClaimResponseSchema.parse({ ok: false, coupon: null, reason, normalizedCode });
    if (!normalizedCode) return fail("NOT_FOUND");

    const found = await wallet.findCouponWithCampaignByCode(store.id, normalizedCode);
    if (!found) return fail("NOT_FOUND");
    const now = new Date();
    const reason = evaluateCouponClaim(found.coupon, found.campaign, now);
    if (reason) return fail(reason);

    // Oturum acmis musteride DB cuzdanina yaz (idempotent); misafirde yanit yeter.
    const cartCustomer = await resolveCustomerFromRequest(request, store.id, { customers, config });
    if (cartCustomer) {
      await wallet.upsertClaim(store.id, {
        couponId: found.coupon.id,
        campaignId: found.campaign.id,
        customerId: cartCustomer.id,
        email: cartCustomer.email,
        source: found.campaign.isPublic ? "PUBLIC_CLAIMED" : "CODE_CLAIMED",
      });
    }
    const card = publicWalletCouponSchema.parse({
      code: found.coupon.code,
      discountType: found.campaign.discountType,
      discountValue: found.campaign.discountValue,
      minOrderAmountMinor: found.campaign.minOrderAmountMinor,
      endsAt: (found.coupon.endsAt ?? found.campaign.endsAt)?.toISOString() ?? null,
      state: "AVAILABLE",
      source: found.campaign.isPublic ? "PUBLIC" : "CLAIMED",
    });
    return publicCouponClaimResponseSchema.parse({
      ok: true,
      coupon: card,
      reason: null,
      normalizedCode,
    });
  });

  /**
   * F4A.3 — Cuzdan kuponunu "Kullan"/"Kaldir". Oturum acmis musteride cuzdan
   * satiri APPLIED/AVAILABLE yapilir (MVP: sepet basina tek APPLIED). Indirim
   * KAYNAK DOGRUSU yine couponCode cookie'sidir; bu uc yalniz cuzdan durumu senkronu.
   */
  for (const [action, applied] of [
    ["apply", true],
    ["remove", false],
  ] as const) {
    app.post(`/public/stores/:storeSlug/cart/coupons/${action}`, async (request, reply) => {
      const params = publicStoreParamSchema.parse(request.params);
      const body = z.object({ code: z.string().max(40) }).parse(request.body ?? {});
      const store = await resolvePublicStore(params.storeSlug);
      if (!store) {
        return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
      }
      const normalizedCode = normalizeCouponCode(body.code);
      const cartCustomer = await resolveCustomerFromRequest(request, store.id, { customers, config });
      if (cartCustomer && normalizedCode) {
        await wallet.setAppliedForIdentity(
          store.id,
          { normalizedCode, customerId: cartCustomer.id, email: cartCustomer.email },
          applied,
        );
      }
      return { ok: true };
    });
  }

  /**
   * F4A.5 (ADR-060 devami) — Vitrin "Kuponlarım / Tüm Kuponlar" kupon merkezi.
   * MUSTERI-SCOPED (x-customer-session zorunlu) + STORE-SCOPED. Doner:
   *  - Kullanilabilir: PUBLIC (isPublic + ACTIVE kupon kampanyalari) + bu musteri/
   *    email'e ait cuzdan (ASSIGNED/CLAIMED),
   *  - Kullanildi: bu musteri/email'in KENDI USED gecmisi (siparis numarasi kendi).
   * SEPET-BAGIMSIZ: alt limit burada hesaplanmaz (kart AVAILABLE/EXPIRED). Cikan
   * kartlar allowlist'tir; ic kimlik/limit/istatistik/priority/stackable TASINMAZ.
   * Private kupon YALNIZCA atanmis/claim edilmis oldugunda gorunur (public sizinti YOK).
   */
  app.get("/public/stores/:storeSlug/customer/coupons", async (request, reply) => {
    const params = publicStoreParamSchema.parse(request.params);
    const store = await resolvePublicStore(params.storeSlug);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }
    const customer = await resolveCustomerFromRequest(request, store.id, { customers, config });
    if (!customer) {
      return reply.code(401).send(errorBody("CUSTOMER_UNAUTHORIZED", "Oturum gerekli."));
    }
    const identity = { customerId: customer.id, email: customer.email };
    const [publicCampaigns, walletEntries, usedEntries] = await Promise.all([
      dataAccess.listPublicActiveCampaigns(store.id),
      wallet.listWalletEntriesForIdentity(store.id, identity),
      wallet.listUsedWalletEntriesForIdentity(store.id, identity),
    ]);
    const available: WalletCandidate[] = [];
    for (const campaign of publicCampaigns) {
      if (campaign.type !== "COUPON_CODE") continue;
      for (const coupon of campaign.coupons) {
        available.push({ coupon, campaign, source: "PUBLIC" });
      }
    }
    for (const entry of walletEntries) {
      available.push({ coupon: entry.coupon, campaign: entry.campaign, source: entry.source });
    }
    const used: CouponCenterUsedEntry[] = usedEntries.map((entry) => ({
      coupon: entry.coupon,
      campaign: entry.campaign,
      source: entry.source,
      usedAt: entry.usedAt,
      orderNumber: entry.orderNumber,
    }));
    const coupons = projectCouponCenter(available, used, new Date());
    return publicCouponCenterResponseSchema.parse({ coupons });
  });

  app.post("/public/stores/:storeSlug/checkout", async (request, reply) => {
    const params = publicStoreParamSchema.parse(request.params);
    const body = publicCheckoutRequestSchema.parse(request.body);
    const store = await resolvePublicStore(params.storeSlug);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }

    // F3B.3: Oturum acmis musteri varsa siparis ona baglanir (customerId). Guard
    // storefront tarafinda; burada oturum yoksa customerId null kalir (geriye donuk
    // uyumlu). Oturum store scope'u resolveCustomerFromRequest icinde dogrulanir.
    const checkoutCustomer = await resolveCustomerFromRequest(request, store.id, { customers, config });

    // 1) Sepeti sunucu-otoriter yeniden coz; tum satirlar OK degilse checkout
    //    engellenir (stok/limit/uygunluk reconcile edilmeden siparis olusmaz).
    //    F3C.2 — Kargo quote'u checkout teslimat adresinden hesaplanir (adres her
    //    zaman mevcut → addressKnown=true). Quote OK degilse odeme adimina gecilmez.
    const index = await buildPublicCartIndex(store.id);
    const [plans, providerDisplays] = await Promise.all([
      dataAccess.listActiveShippingRatePlans(store.id),
      dataAccess.listShippingProviderDisplays(store.id),
    ]);
    const checkoutAddress: EngineAddress = {
      cityCode: body.shippingAddress.city,
      districtCode: body.shippingAddress.district ?? null,
      regionCode: null,
      // zoneCode: city->zone cozumlemesi ileride (TODO); su an null.
      zoneCode: null,
    };
    // TODO-125 — Musterinin sectigi kargo secenegi. Ucret ISTEMCIDEN DEGIL, secilen
    // plandan sunucuda yeniden hesaplanir (tamper-proof). Secenek bu mağazaya ait +
    // AKTIF + bu sepet/adres icin uygun olmalidir (cross-store/inactive REDDEDILIR).
    const requestedOptionId = body.shippingOptionId?.trim() || null;
    // F4A — Checkout'ta kimlik (musteri + iletisim e-postasi) ile baglam yuklenir;
    // per-customer limitler burada da degerlendirilir, siparis transaction'inda
    // atomik olarak YENIDEN dogrulanir.
    const checkoutEmail = body.contact.email.trim().toLowerCase();
    const discountContext = await dataAccess.loadCampaignDiscountContext(store.id, {
      normalizedCouponCode: normalizeCouponCode(body.couponCode ?? null),
      customerId: checkoutCustomer?.id ?? null,
      email: checkoutEmail,
    });
    const { cart, discount } = assemblePublicCart(
      store.slug,
      index,
      body.items,
      { couponCode: body.couponCode ?? null, context: discountContext },
      {
        plans,
        providerDisplays,
        address: checkoutAddress,
        addressKnown: true,
        requestedOptionId,
      },
    );
    if (!cart.checkoutReady) {
      return reply.code(409).send(errorBody("CART_NOT_READY", "Cart contains unavailable items.", cart));
    }
    // F4A — Gecersiz kuponla siparis OLUSTURULMAZ (sessiz sifir-indirim yok);
    // istemci acik hata alir ve kuponu duzeltir/kaldirir.
    if (normalizeCouponCode(body.couponCode ?? null) && discount.couponStatus !== "APPLIED") {
      return reply.code(409).send(
        errorBody("COUPON_INVALID", "Coupon cannot be applied.", {
          couponReason: discount.couponReason,
        }),
      );
    }
    const activeOptionIds = new Set(plans.map((p) => p.id));
    const availableOptions = cart.shipping.options.filter((o) => o.available);
    // Tampered/cross-store/inactive secenek kimligi → REDDET (guvenli varsayilana DUSME).
    if (requestedOptionId) {
      if (!activeOptionIds.has(requestedOptionId)) {
        return reply
          .code(409)
          .send(errorBody("SHIPPING_OPTION_INVALID", "Selected shipping option is not valid."));
      }
      if (!availableOptions.some((o) => o.optionId === requestedOptionId)) {
        return reply.code(409).send(
          errorBody("SHIPPING_QUOTE_UNAVAILABLE", "Selected shipping option is unavailable.", {
            shipping: cart.shipping,
          }),
        );
      }
    }
    // Hic uygun secenek yok (tarife yok / kural yok / olcu eksik) → odeme adimi yok.
    if (availableOptions.length === 0 || cart.shipping.status !== "OK") {
      return reply.code(409).send(
        errorBody("SHIPPING_QUOTE_UNAVAILABLE", "Shipping fee could not be calculated.", {
          shipping: cart.shipping,
        }),
      );
    }
    // Birden cok secenek var ama musteri secim yapmadi → secim zorunlu.
    if (!requestedOptionId && availableOptions.length > 1) {
      return reply.code(409).send(
        errorBody("SHIPPING_OPTION_REQUIRED", "Please choose a shipping option.", {
          shipping: cart.shipping,
        }),
      );
    }
    // Secili secenek (assemblePublicCart yukaridaki kurallarla zaten sectiyse).
    const selectedOption =
      cart.shipping.options.find((o) => o.optionId === cart.shipping.selectedOptionId) ?? null;
    if (!selectedOption) {
      return reply.code(409).send(
        errorBody("SHIPPING_QUOTE_UNAVAILABLE", "Shipping fee could not be calculated.", {
          shipping: cart.shipping,
        }),
      );
    }
    // Ozet (kargo/indirim) sunucuda hesaplandi; siparise yansitilir.
    const summary = cart.summary;

    // 2) Siparis taslagini olustur (createOrder salesMode/currency/limit'i ic
    //    katmanda yeniden dogrular). Kargo/indirim siparise yazilir; KDV dahil
    //    oldugundan taxAmount 0. Adres: teslimat zorunlu; fatura verilmezse
    //    teslimatla ayni kabul edilir (bu fazda basit tutulur).
    const shipping = body.shippingAddress;
    // Fatura bilgisi verilmediyse (varsayilan checkout) iletisim/teslimattan
    // TURETILIR: Bireysel, teslimatla ayni adres, ad = iletisim adi, TCKN YOK.
    // Kullanici "Fatura bilgilerim farkli" derse body.billing dolu gelir ve
    // sema tarafinda zaten sikica dogrulanmistir (TCKN/VKN).
    const billingInfo: PublicCheckoutBilling = body.billing ?? {
      type: "INDIVIDUAL",
      sameAsShipping: true,
      name: body.contact.fullName,
      tckn: null,
      companyName: null,
      taxOffice: null,
      taxNumber: null,
      email: null,
    };
    // Fatura adresi: "teslimatla ayni" ise teslimat adresi kopyalanir; degilse
    // ayri fatura adresi kullanilir (sema sameAsShipping=false iken zorunlu kilar).
    const billingAddr = billingInfo.sameAsShipping ? shipping : (body.billingAddress ?? shipping);
    const billingFullName =
      billingInfo.type === "CORPORATE"
        ? (billingInfo.companyName ?? body.contact.fullName)
        : (billingInfo.name ?? body.contact.fullName);
    const order = await dataAccess.createOrder(store.id, {
      customerId: checkoutCustomer?.id ?? null,
      customerEmail: body.contact.email,
      currency: cart.currency,
      lines: cart.lines.map((line) => ({ variantId: line.variantId, quantity: line.availableQuantity })),
      shippingAmount: summary.shippingMinor,
      // F3C.2/TODO-125 — Kargo SNAPSHOT'i siparise yazilir: ucret kaynagi + plan
      // kimligi + SECILEN saglayici/secenek gorunum bilgisi (taşıyıcı/hizmet/logo/ETA).
      // Tarihsel sabitlik: config sonradan degisse bile siparis sabit kalir.
      // Quote source DHL_ECOMMERCE bu fazda olusmaz; defansif olarak TARIFF'e duser.
      shippingSnapshot: {
        currency: cart.shipping.currency ?? cart.currency,
        source:
          cart.shipping.source === "MOCK" || cart.shipping.source === "STORE_FIXED_RULE"
            ? cart.shipping.source
            : "STORE_SHIPPING_TARIFF",
        ratePlanId: selectedOption.optionId,
        ratePlanName: selectedOption.serviceName,
        provider: selectedOption.providerType,
        providerName: selectedOption.providerName,
        logoUrl: selectedOption.logoUrl,
        etaText: selectedOption.estimatedDelivery,
      },
      discountAmount: summary.discountMinor,
      // F4A — Indirim SNAPSHOT satirlari (ADR-058). Usage limitleri createOrder
      // transaction'inda atomik yeniden dogrulanir; redemption orada yazilir.
      discounts: discount.discountLines.map((line) => ({
        campaignId: line.campaignId,
        couponId: line.couponId,
        code: line.code,
        label: line.label,
        discountType: line.discountType,
        discountValue: line.discountValue,
        discountAmountMinor: line.discountAmountMinor,
        scopeSummary: { eligibleSubtotalMinor: line.eligibleSubtotalMinor },
      })),
      billing: {
        type: billingInfo.type,
        name: billingInfo.type === "INDIVIDUAL" ? (billingInfo.name ?? null) : null,
        // TCKN normalize edilerek saklanir; log/event metadata'ya yazilmaz.
        taxId:
          billingInfo.type === "INDIVIDUAL" && billingInfo.tckn ? digitsOnly(billingInfo.tckn) : null,
        companyName: billingInfo.type === "CORPORATE" ? (billingInfo.companyName ?? null) : null,
        taxOffice: billingInfo.type === "CORPORATE" ? (billingInfo.taxOffice ?? null) : null,
        taxNumber:
          billingInfo.type === "CORPORATE" && billingInfo.taxNumber
            ? digitsOnly(billingInfo.taxNumber)
            : null,
        email: billingInfo.email ?? null,
      },
      addresses: [
        {
          type: "SHIPPING",
          fullName: body.contact.fullName,
          phone: body.contact.phone,
          countryCode: shipping.country,
          city: shipping.city,
          district: shipping.district ?? null,
          addressLine1: shipping.addressLine1,
          addressLine2: shipping.addressLine2 ?? null,
          postalCode: shipping.postalCode ?? null,
        },
        {
          type: "BILLING" as const,
          fullName: billingFullName,
          phone: body.contact.phone,
          countryCode: billingAddr.country,
          city: billingAddr.city,
          district: billingAddr.district ?? null,
          addressLine1: billingAddr.addressLine1,
          addressLine2: billingAddr.addressLine2 ?? null,
          postalCode: billingAddr.postalCode ?? null,
        },
      ],
    });
    // Ic hata kodlarini guvenli, jenerik yanitlara esler (ic alan sizdirmaz).
    if (typeof order === "string") {
      if (order === "VARIANT_NOT_FOUND" || order === "INVALID_VARIANT") {
        return reply.code(409).send(errorBody("CART_NOT_READY", "Cart contains unavailable items."));
      }
      // F4A — Quote ile siparis arasindaki yaris kosulu: limit/durum transaction'da
      // yeniden dogrulanir; asilmissa siparis olusmaz ve istemci acik hata alir.
      if (order === "CAMPAIGN_USAGE_LIMIT" || order === "COUPON_USAGE_LIMIT" || order === "CAMPAIGN_NOT_ACTIVE") {
        return reply.code(409).send(
          errorBody("COUPON_INVALID", "Coupon cannot be applied.", {
            couponReason: "USAGE_LIMIT_REACHED",
          }),
        );
      }
      return reply.code(400).send(errorBody("CHECKOUT_REJECTED", "Checkout could not be completed."));
    }

    // 3) Siparisi PLACE et -> stok FOR UPDATE ile yeniden dogrulanip rezerve
    //    edilir. paymentStatus UNPAID (odeme bekliyor) olarak kalir (F3B.2'de
    //    odeme provider'i ile genisletilecek).
    const placed = await dataAccess.placeOrder(store.id, order.id, {});
    if (typeof placed === "string") {
      if (placed === "INSUFFICIENT_STOCK" || placed === "RESERVATION_FAILED") {
        return reply.code(409).send(errorBody("CART_NOT_READY", "Some items went out of stock."));
      }
      return reply.code(400).send(errorBody("CHECKOUT_REJECTED", "Checkout could not be completed."));
    }
    if (!placed) {
      return reply.code(400).send(errorBody("CHECKOUT_REJECTED", "Checkout could not be completed."));
    }

    // F3B.2: Uygun TEST/MOCK provider config varsa odeme yonlendirme objesi
    // uretilir (PaymentAttempt + kisa omurlu access token). Provider yoksa
    // `payment` alani HIC eklenmez → mevcut checkout response shape'i birebir korunur.
    const payment = paymentRedirectBuilderRef.current
      ? await paymentRedirectBuilderRef.current(store.id, placed)
      : null;

    // ADR-065 (Faz 3/Dilim 6a) — Onay satiri kapaklari. Order line'da productId ZATEN
    // var; TEK batched sorguyla kapak URL'leri hazirlanir (N+1 yok). Success ekrani
    // bu URL'leri (cookie yoluyla) thumbnail olarak gosterir. Kapaksiz urun -> null.
    const confirmationCoverUrlByProductId = await buildCartCoverUrlMap(
      store.id,
      placed.lines.map((line) => line.productId),
    );

    return reply.code(201).send(
      publicOrderConfirmationSchema.parse({
        orderNumber: placed.orderNumber,
        status: placed.status,
        paymentStatus: placed.paymentStatus,
        currency: placed.currency,
        subtotalMinor: placed.subtotalAmount,
        shippingMinor: placed.shippingAmount,
        discountMinor: placed.discountAmount,
        taxIncludedMinor: summary.taxIncludedMinor,
        totalMinor: placed.totalAmount,
        couponCode: summary.couponCode,
        couponStatus: summary.couponStatus,
        contactEmail: placed.customerEmail,
        lines: placed.lines.map((line) => ({
          title: line.title,
          variantTitle: line.variantTitle,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceAmount,
          lineTotalMinor: line.totalAmount,
          currency: line.currency,
          imageUrl: confirmationCoverUrlByProductId.get(line.productId) ?? null,
        })),
        createdAt: placed.createdAt.toISOString(),
        // F3B.2 — Success ekrani icin teslimat/fatura ozeti (provider-less akista).
        shippingAddress: safeAddressSummary(placed.addresses.find((a) => a.type === "SHIPPING") ?? null),
        billing: publicBillingSummaryOf(placed),
        // TODO-125 — Secilen kargo saglayici/secenek ozeti (success ekraninda gosterim).
        shippingOption: {
          providerType: selectedOption.providerType,
          providerName: selectedOption.providerName,
          serviceName: selectedOption.serviceName,
          amountMinor: placed.shippingAmount,
          currency: placed.shippingCurrency ?? placed.currency,
          freeShipping: placed.shippingAmount === 0,
          estimatedDelivery: selectedOption.estimatedDelivery,
          logoUrl: selectedOption.logoUrl,
          logoAlt: selectedOption.logoAlt,
        },
        ...(payment ? { payment } : {}),
      }),
    );
  });

  // F3B.2: Checkout ONCESI bilgilendirme — store'da checkout sonrasi test odeme
  // adimini SURDUREN bir provider var mi? `buildPaymentRedirect` ile ayni kosulu
  // yansitir (hasTestPaymentProvider). Secret/credential donmez; sadece boolean.
  app.get("/public/stores/:storeSlug/payment-availability", async (request, reply) => {
    const params = publicStoreParamSchema.parse(request.params);
    const store = await resolvePublicStore(params.storeSlug);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }
    return publicPaymentAvailabilitySchema.parse({
      testPaymentEnabled: await hasTestPaymentProvider(store.id),
    });
  });

  // F3B.3: Storefront musteri hesabi uclari (kayit/giris/otp/oturum, profil,
  // sifre, iletisim tercihi, adres defteri, IBAN, siparislerim). Auth YOK gerektiren
  // public prefix altinda; oturum `x-customer-session` header'i ile cozulur ve
  // store scope + ownership zorunludur. resolvePublicStore yukarida tanimlidir.
  registerCustomerRoutes(app, {
    config,
    customers,
    logger,
    resolvePublicStore,
    // Dilim 6b — siparis satiri thumbnail'i icin kapak gorseli cozumu (DI; Prisma
    // customers modulune sizmaz, ayni tek allowlist noktasi paylasilir). Arrow
    // wrapper `this` baglamini korur (detached method referansi this'i koparirdi).
    listProductImages: (sid, pids, coverOnly) => dataAccess.listProductImages(sid, pids, coverOnly),
  });
  // F3B.3 — Store-admin müşteri yönetimi (platform-admin + store scope guard).
  registerCustomerAdminRoutes(app, {
    config,
    customers,
    logger,
    requireStoreAdmin: async (request, reply, storeId) => {
      const access = await requireStorePlatformAdmin(request, reply, storeId);
      return access ? { actorUserId: access.session.platformUser.id } : null;
    },
  });

  // F3C.1 — Shipping provider foundation (store-admin gateway uclari).
  registerShippingAdminRoutes(app, {
    config,
    requireStoreAdmin: async (request, reply, storeId) => {
      const access = await requireStorePlatformAdmin(request, reply, storeId);
      return access ? { actorUserId: access.session.platformUser.id } : null;
    },
    recordAudit: (input) => dataAccess.createAuditLog(input),
  });

  // TODO-104 (ADR-048) — Public shipping webhook: kullanici auth YOK; per-config
  // HMAC imza + timestamp zorunlu, idempotency inbox'i ile duplicate/replay korumali.
  registerShippingWebhookRoutes(app, {
    config,
    persistence: createPrismaShippingWebhookPersistence(),
  });

  // F3C.2 — Shipping price engine: store kargo TARIFE plani uclari (CRUD + kurallar
  // + set-default). Kargo ucreti bu planlardan hesaplanir; provider canli quote DEGIL.
  registerShippingRatePlanRoutes(app, {
    requireStoreAdmin: async (request, reply, storeId) => {
      const access = await requireStorePlatformAdmin(request, reply, storeId);
      return access ? { actorUserId: access.session.platformUser.id } : null;
    },
    recordAudit: (input) => dataAccess.createAuditLog(input),
  });

  // ADR-065 (Faz 1/Adim 4) — Site-geneli gorsel yonetimi: multipart upload + statik
  // servis. @fastify/multipart yukleme boyutunu MEDIA_MAX_UPLOAD_BYTES ile sinirlar
  // (asimda route 413 doner). @fastify/static yuklenen gorselleri /media/* altinda
  // sunar (MEDIA_PUBLIC_BASE_URL bos ise resolveMediaUrl bu goreli yolu uretir; CDN
  // kokune isaret edilince ayni storageKey CDN'den servis edilir).
  const mediaDir = config.MEDIA_STORAGE_DIR ?? "/app/uploads";
  const mediaMaxBytes = config.MEDIA_MAX_UPLOAD_BYTES ?? 5_242_880;
  app.register(fastifyMultipart, {
    limits: { fileSize: mediaMaxBytes, files: 1 },
  });
  // Statik servis yalniz hazir bir dizin varsa acilir. Uygulama boot'unda dizini
  // olusturmayi dene; basarisizsa (izin/edge/test ortami) upload yine calisir ama
  // local static serve ATLANIR (CDN/base URL varsa zaten gerekmez — @fastify/static
  // gecersiz root ile init'te cokerdi).
  let mediaStaticEnabled = false;
  try {
    mkdirSync(mediaDir, { recursive: true });
    mediaStaticEnabled = true;
  } catch (err) {
    logger.warn("media storage dizini hazirlanamadi; statik servis atlandi", {
      dir: mediaDir,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  if (mediaStaticEnabled) {
    app.register(fastifyStatic, {
      root: mediaDir,
      prefix: "/media/",
      decorateReply: false,
    });
  }
  registerMediaAdminRoutes(app, {
    config,
    storage: new LocalDiskDriver(mediaDir),
    requireStoreAdmin: async (request, reply, storeId) => {
      const access = await requireStorePlatformAdmin(request, reply, storeId);
      return access ? { actorUserId: access.session.platformUser.id } : null;
    },
    recordAudit: (input) => dataAccess.createAuditLog(input),
  });

  // F4A — Kampanya/kupon yonetimi (ADR-058): store-admin CRUD + durum gecisleri.
  registerCampaignAdminRoutes(app, {
    dataAccess,
    requireStoreAdmin: async (request, reply, storeId) => {
      const access = await requireStorePlatformAdmin(request, reply, storeId);
      return access ? { actorUserId: access.session.platformUser.id } : null;
    },
    recordAudit: (input) => dataAccess.createAuditLog(input),
  });

  // ADR-065 (Faz 2/Dilim 5) — Ana sayfa hero slide yonetimi (CRUD temeli). Media
  // guard hero modulunun kendi icindedir (HERO context); server closure'ina bagli
  // degil. dataAccess ayri bir prisma-backed impl'dir (kampanya deseni).
  registerHeroAdminRoutes(app, {
    dataAccess: heroDataAccess,
    mediaBaseUrl: config.MEDIA_PUBLIC_BASE_URL,
    requireStoreAdmin: async (request, reply, storeId) => {
      const access = await requireStorePlatformAdmin(request, reply, storeId);
      return access ? { actorUserId: access.session.platformUser.id } : null;
    },
    recordAudit: (input) => dataAccess.createAuditLog(input),
  });

  // Faz 1B (ADR-067) — Attribute katalog cekirdegi. STORE uclari requireStorePlatformAdmin
  // (kendi STORE tanimlari + PLATFORM okuma); PLATFORM uclari requireSuperAdmin (yalniz
  // SUPER_ADMIN). Ayri prisma-backed data-access (hero/kampanya deseni); test DI ile.
  const attributeDataAccess = dependencies.attributeDataAccess ?? createPrismaAttributeDataAccess();
  registerStoreAttributeRoutes(app, {
    dataAccess: attributeDataAccess,
    requireStoreAdmin: async (request, reply, storeId) => {
      const access = await requireStorePlatformAdmin(request, reply, storeId);
      return access ? { actorUserId: access.session.platformUser.id } : null;
    },
    recordAudit: (input) => dataAccess.createAuditLog(input),
  });
  registerPlatformAttributeRoutes(app, {
    dataAccess: attributeDataAccess,
    requireSuperAdmin: async (request, reply) => {
      const session = await requireSuperAdmin(request, reply);
      return session ? { actorUserId: session.platformUser.id } : null;
    },
    recordAudit: (input) => dataAccess.createAuditLog(input),
  });

  // Faz 2A (ADR-068) — Urun/varyant attribute DEGER katmani. TUM deger yazimlarinin
  // (gomulu product/variant create-update + dedike internal replace uclari) TEK otoritesi.
  // Ayri prisma-backed data-access (attributes/ deseni); test DI ile enjekte edilir.
  const attributeValueDataAccess =
    dependencies.attributeValueDataAccess ?? createPrismaAttributeValueDataAccess();
  const attributeValueService = createAttributeValueService(attributeValueDataAccess);
  registerAttributeValueRoutes(app, {
    service: attributeValueService,
    requireStoreAdmin: async (request, reply, storeId) => {
      const access = await requireStorePlatformAdmin(request, reply, storeId);
      return access ? { actorUserId: access.session.platformUser.id } : null;
    },
    recordAudit: (input) => dataAccess.createAuditLog(input),
  });

  // F4A.3 (ADR-060) — Kupon atama / musteri cuzdani (kampanya + musteri detayi).
  registerWalletAdminRoutes(app, {
    wallet,
    requireStoreAdmin: async (request, reply, storeId) => {
      const access = await requireStorePlatformAdmin(request, reply, storeId);
      return access ? { actorUserId: access.session.platformUser.id } : null;
    },
    recordAudit: (input) => dataAccess.createAuditLog(input),
  });

  app.post("/auth/platform/login", async (request, reply) => {
    const input = platformLoginRequestSchema.parse(request.body);
    if (loginRateLimiter.isLimited(request.ip, input.email)) {
      return reply
        .code(429)
        .send(errorBody("AUTH_RATE_LIMITED", "Too many login attempts. Please try again later."));
    }

    const user = await dataAccess.findPlatformUserByEmail(input.email.toLowerCase());
    const passwordOk = user
      ? await verifyPassword(input.password, user.passwordHash, config.PASSWORD_HASH_PEPPER)
      : false;

    if (!user || !passwordOk) {
      loginRateLimiter.recordFailure(request.ip, input.email);
      return reply
        .code(401)
        .send(errorBody("INVALID_CREDENTIALS", "Invalid email or password."));
    }
    loginRateLimiter.reset(request.ip, input.email);

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + config.SESSION_TTL_SECONDS * 1000);
    const session = await dataAccess.createPlatformSession({
      platformUserId: user.id,
      tokenHash: hashSessionToken(token, config.SESSION_SECRET),
      expiresAt,
      userAgent: request.headers["user-agent"],
      ipAddress: request.ip,
    });

    await dataAccess.createAuditLog({
      action: "LOGIN",
      platformUserId: user.id,
      entityType: "PlatformSession",
      entityId: session.id,
      metadata: { authSurface: "platform" },
    });

    return platformLoginResponseSchema.parse({
      token,
      expiresAt: expiresAt.toISOString(),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  });

  app.post("/auth/platform/logout", async (request, reply) => {
    const session = await authenticatePlatform(request, reply);
    if (!session) {
      return;
    }

    const revoked = await dataAccess.revokePlatformSession(session.id);
    await dataAccess.createAuditLog({
      action: "LOGOUT",
      platformUserId: session.platformUser.id,
      entityType: "PlatformSession",
      entityId: session.id,
      metadata: { authSurface: "platform" },
    });
    return platformLogoutResponseSchema.parse({ revoked });
  });

  app.get("/auth/platform/me", async (request, reply) => {
    const session = await authenticatePlatform(request, reply);
    if (!session) {
      return;
    }

    return platformMeResponseSchema.parse({
      user: {
        id: session.platformUser.id,
        email: session.platformUser.email,
        name: session.platformUser.name,
        role: session.platformUser.role,
      },
      session: { id: session.id, expiresAt: session.expiresAt.toISOString() },
    });
  });

  app.get("/admin/stores", async (request, reply) => {
    const session = await requirePlatformAdmin(request, reply);
    if (!session) {
      return;
    }
    const pagination = paginationQuerySchema.parse(request.query);
    const stores = await dataAccess.listStores(pagination);
    return adminStoreListResponseSchema.parse({
      data: stores.data.map(serializeStore),
      pagination: { ...pagination, total: stores.total },
    });
  });

  app.post("/admin/stores", async (request, reply) => {
    const session = await requirePlatformAdmin(request, reply);
    if (!session) {
      return;
    }
    const input = adminStoreCreateRequestSchema.parse(request.body);
    const [existingSlug, existingDomain] = await Promise.all([
      dataAccess.findStoreBySlug(input.slug),
      input.domain ? dataAccess.findStoreDomain(input.domain) : Promise.resolve(null),
    ]);
    if (existingSlug) {
      return reply.code(409).send(errorBody("STORE_SLUG_EXISTS", "Store slug already exists."));
    }
    if (existingDomain) {
      return reply.code(409).send(errorBody("STORE_DOMAIN_EXISTS", "Store domain already exists."));
    }

    let store: StoreRecord;
    try {
      store = await dataAccess.createStore(input);
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        const targets = uniqueConstraintTargets(error);
        if (targets.includes("domain")) {
          return reply.code(409).send(errorBody("STORE_DOMAIN_EXISTS", "Store domain already exists."));
        }
        return reply.code(409).send(errorBody("STORE_SLUG_EXISTS", "Store slug already exists."));
      }
      throw error;
    }

    await dataAccess.createAuditLog({
      action: "CREATE",
      platformUserId: session.platformUser.id,
      storeId: store.id,
      entityType: "Store",
      entityId: store.id,
      metadata: { fields: Object.keys(input).filter((key) => key !== "metadata") },
    });
    return reply.code(201).send(serializeStore(store));
  });

  app.get("/admin/stores/:id", async (request, reply) => {
    const session = await requirePlatformAdmin(request, reply);
    if (!session) {
      return;
    }
    const params = idParamSchema.parse(request.params);
    const store = await dataAccess.findStoreById(params.id);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }
    return serializeStore(store);
  });

  app.patch("/admin/stores/:id", async (request, reply) => {
    const session = await requirePlatformAdmin(request, reply);
    if (!session) {
      return;
    }
    const params = idParamSchema.parse(request.params);
    const input = adminStoreUpdateRequestSchema.parse(request.body);
    const store = await dataAccess.updateStore(params.id, input);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: session.platformUser.id,
      storeId: store.id,
      entityType: "Store",
      entityId: store.id,
      metadata: { fields: Object.keys(input) },
    });
    return serializeStore(store);
  });

  app.get("/admin/plans", async (request, reply) => {
    const session = await requirePlatformAdmin(request, reply);
    if (!session) {
      return;
    }
    const pagination = paginationQuerySchema.parse(request.query);
    const plans = await dataAccess.listPlans(pagination);
    return planListResponseSchema.parse({
      data: plans.data.map(serializePlan),
      pagination: { ...pagination, total: plans.total },
    });
  });

  app.post("/admin/plans", async (request, reply) => {
    const session = await requirePlatformAdmin(request, reply);
    if (!session) {
      return;
    }
    const input = planCreateRequestSchema.parse(request.body);
    const existingPlan = await dataAccess.findPlanByCode(input.code);
    if (existingPlan) {
      return reply.code(409).send(errorBody("PLAN_CODE_EXISTS", "Plan code already exists."));
    }
    let plan: PlanRecord;
    try {
      plan = await dataAccess.createPlan(input);
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        return reply.code(409).send(errorBody("PLAN_CODE_EXISTS", "Plan code already exists."));
      }
      throw error;
    }

    await dataAccess.createAuditLog({
      action: "CREATE",
      platformUserId: session.platformUser.id,
      entityType: "Plan",
      entityId: plan.id,
      metadata: { fields: Object.keys(input).filter((key) => key !== "metadata") },
    });
    return reply.code(201).send(serializePlan(plan));
  });

  app.get("/admin/plans/:id", async (request, reply) => {
    const session = await requirePlatformAdmin(request, reply);
    if (!session) {
      return;
    }
    const params = idParamSchema.parse(request.params);
    const plan = await dataAccess.findPlanById(params.id);
    if (!plan) {
      return reply.code(404).send(errorBody("PLAN_NOT_FOUND", "Plan not found."));
    }
    return serializePlan(plan);
  });

  app.patch("/admin/plans/:id", async (request, reply) => {
    const session = await requirePlatformAdmin(request, reply);
    if (!session) {
      return;
    }
    const params = idParamSchema.parse(request.params);
    const input = planUpdateRequestSchema.parse(request.body);
    const plan = await dataAccess.updatePlan(params.id, input);
    if (!plan) {
      return reply.code(404).send(errorBody("PLAN_NOT_FOUND", "Plan not found."));
    }
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: session.platformUser.id,
      entityType: "Plan",
      entityId: plan.id,
      metadata: { fields: Object.keys(input) },
    });
    return serializePlan(plan);
  });

  app.get("/stores/:storeId/categories", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const pagination = paginationQuerySchema.parse(request.query);
    const categories = await dataAccess.listCategories(params.storeId, pagination);
    return productCategoryListResponseSchema.parse({
      data: categories.data.map((category) => serializeCategory(category, config.MEDIA_PUBLIC_BASE_URL)),
      pagination: { ...pagination, total: categories.total },
    });
  });

  app.post("/stores/:storeId/categories", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = productCategoryCreateRequestSchema.parse(request.body);
    if (input.parentId && !(await dataAccess.findCategoryById(params.storeId, input.parentId))) {
      return reply.code(400).send(errorBody("CATEGORY_NOT_FOUND", "Parent category not found."));
    }
    // ADR-065 (Faz 2/Dilim 3) — imageId verilirse ayni store'a ait + CATEGORY
    // context olmali (cross-tenant/yanlis-context gorsel baglama reddi).
    if (input.imageId != null && !(await assertMediaAttachable(reply, params.storeId, input.imageId, "CATEGORY"))) {
      return;
    }
    if (await dataAccess.findCategoryBySlug(params.storeId, input.slug)) {
      return reply.code(409).send(errorBody("CATEGORY_SLUG_EXISTS", "Category slug already exists."));
    }
    let category: CategoryRecord;
    try {
      category = await dataAccess.createCategory(params.storeId, input);
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        return reply.code(409).send(errorBody("CATEGORY_SLUG_EXISTS", "Category slug already exists."));
      }
      throw error;
    }
    await dataAccess.createAuditLog({
      action: "CREATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "ProductCategory",
      entityId: category.id,
      metadata: { fields: Object.keys(input) },
    });
    return reply.code(201).send(serializeCategory(category, config.MEDIA_PUBLIC_BASE_URL));
  });

  app.get("/stores/:storeId/categories/:categoryId", async (request, reply) => {
    const params = categoryParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const category = await dataAccess.findCategoryById(params.storeId, params.categoryId);
    if (!category) return reply.code(404).send(errorBody("CATEGORY_NOT_FOUND", "Category not found."));
    return serializeCategory(category, config.MEDIA_PUBLIC_BASE_URL);
  });

  app.patch("/stores/:storeId/categories/:categoryId", async (request, reply) => {
    const params = categoryParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = productCategoryUpdateRequestSchema.parse(request.body);
    if (input.parentId && !(await dataAccess.findCategoryById(params.storeId, input.parentId))) {
      return reply.code(400).send(errorBody("CATEGORY_NOT_FOUND", "Parent category not found."));
    }
    if (input.parentId === params.categoryId) {
      return reply.code(400).send(errorBody("VALIDATION_ERROR", "Category cannot be its own parent."));
    }
    // ADR-065 (Faz 2/Dilim 3) — imageId verilirse tenant+context dogrula. null =
    // gorseli kaldir (dogrulama atlanir, FK NULL yapilir).
    if (input.imageId != null && !(await assertMediaAttachable(reply, params.storeId, input.imageId, "CATEGORY"))) {
      return;
    }
    if (input.slug) {
      const existing = await dataAccess.findCategoryBySlug(params.storeId, input.slug);
      if (existing && existing.id !== params.categoryId) {
        return reply.code(409).send(errorBody("CATEGORY_SLUG_EXISTS", "Category slug already exists."));
      }
    }
    const category = await dataAccess.updateCategory(params.storeId, params.categoryId, input);
    if (!category) return reply.code(404).send(errorBody("CATEGORY_NOT_FOUND", "Category not found."));
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "ProductCategory",
      entityId: category.id,
      metadata: { fields: Object.keys(input) },
    });
    return serializeCategory(category, config.MEDIA_PUBLIC_BASE_URL);
  });

  // ADR-065 (Faz 2/Dilim 4) — magaza marka ayarlari (logo + favicon). StoreSettings
  // 1-1 singleton (PK=FK storeId). R2: satir yoksa 404 DEGIL, tum-null + storeName ile
  // 200 doner (lazy). Kayit yalniz ilk PATCH'te (upsert) acilir. storeName her durumda
  // access.store.name'den gelir (StoreSettings satirindan bagimsiz).
  app.get("/stores/:storeId/settings", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const row = await dataAccess.getStoreSettings(params.storeId);
    return serializeStoreSettings(params.storeId, access.store.name, row, config.MEDIA_PUBLIC_BASE_URL);
  });

  app.patch("/stores/:storeId/settings", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = storeSettingsUpdateRequestSchema.parse(request.body);
    // R3: her media alani icin AYRI BRANDING dogrulamasi (cross-tenant/yanlis-context
    // baglama reddi). null = bagi kaldir -> dogrulama atlanir, FK NULL yapilir.
    if (
      input.logoMediaId != null &&
      !(await assertMediaAttachable(reply, params.storeId, input.logoMediaId, "BRANDING"))
    ) {
      return;
    }
    if (
      input.faviconMediaId != null &&
      !(await assertMediaAttachable(reply, params.storeId, input.faviconMediaId, "BRANDING"))
    ) {
      return;
    }
    const row = await dataAccess.upsertStoreSettings(params.storeId, input);
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "StoreSettings",
      entityId: params.storeId,
      metadata: { fields: Object.keys(input) },
    });
    return serializeStoreSettings(params.storeId, access.store.name, row, config.MEDIA_PUBLIC_BASE_URL);
  });

  // ADR-065 — ortak gorsel baglanabilirlik guard'i (Faz 2/Dilim 3 kategori +
  // Dilim 2 urun galerisi ortak kullanir). Verilen mediaId ayni store'a ait ve
  // beklenen context'te mi? Degilse 400 INVALID_IMAGE_REFERENCE gonderip false
  // doner; gecerliyse true. Yazimdan ONCE cagrilmali (cross-tenant/yanlis-context
  // baglama reddi). validateCategoryIds ile ayni "reply gonder + bool don" deseni.
  async function assertMediaAttachable(
    reply: FastifyReply,
    storeId: string,
    mediaId: string,
    expectedContext: string,
  ): Promise<boolean> {
    const asset = await dataAccess.findMediaAssetById(storeId, mediaId);
    if (!asset || asset.context !== expectedContext) {
      await reply.code(400).send(errorBody("INVALID_IMAGE_REFERENCE", "Image not found for this store."));
      return false;
    }
    return true;
  }

  async function validateCategoryIds(reply: FastifyReply, storeId: string, categoryIds: string[]) {
    const uniqueCategoryIds = [...new Set(categoryIds)];
    for (const categoryId of uniqueCategoryIds) {
      if (!(await dataAccess.findCategoryById(storeId, categoryId))) {
        await reply.code(400).send(errorBody("CATEGORY_NOT_FOUND", "Category not found.", { categoryId }));
        return null;
      }
    }
    return uniqueCategoryIds;
  }

  // Faz 1A (ADR-067) — Ana kategori secimini normalize + dogrular; hata olursa reply
  // gonderir ve null doner (validateCategoryIds deseni). categoryIds ONCEDEN
  // validateCategoryIds'ten gecmis (store'da var + dedup) olmalidir. previousPrimaryId
  // update'te mevcut ana kategoridir: yalniz YENI/DEGISEN ana kategori icin arsiv/store
  // kontrolu yapilir (mevcut arsivli ana kategori ilgisiz update'lerde korunur). Basaride
  // { primaryCategoryId } doner (deger de null olabilir → sarmalanmis).
  async function resolvePrimaryCategory(
    reply: FastifyReply,
    storeId: string,
    categoryIds: string[],
    rawPrimaryCategoryId: string | null | undefined,
    previousPrimaryId: string | null | undefined,
  ): Promise<{ primaryCategoryId: string | null } | null> {
    const resolution = resolvePrimaryCategorySelection({
      categoryIds,
      primaryCategoryId: rawPrimaryCategoryId ?? null,
    });
    if (!resolution.ok) {
      await reply.code(400).send(errorBody(resolution.code, primaryCategoryErrorMessage(resolution.code)));
      return null;
    }
    const resolved = resolution.primaryCategoryId;
    // Yalniz yeni/degistirilen ana kategori icin store + arsiv guard'i (findCategoryById
    // zaten store-scoped; categoryIds gecerli oldugu icin normalde bulunur → STORE_MISMATCH
    // savunma amaclidir). ARCHIVED: arsivli bir kategori ANA kategori olarak SECILEMEZ.
    if (resolved !== null && resolved !== (previousPrimaryId ?? null)) {
      const category = await dataAccess.findCategoryById(storeId, resolved);
      if (!category) {
        await reply
          .code(400)
          .send(errorBody("PRIMARY_CATEGORY_STORE_MISMATCH", primaryCategoryErrorMessage("PRIMARY_CATEGORY_STORE_MISMATCH")));
        return null;
      }
      if (category.status === "ARCHIVED") {
        await reply
          .code(400)
          .send(errorBody("PRIMARY_CATEGORY_ARCHIVED", primaryCategoryErrorMessage("PRIMARY_CATEGORY_ARCHIVED")));
        return null;
      }
    }
    return { primaryCategoryId: resolved };
  }

  app.get("/stores/:storeId/products", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const pagination = paginationQuerySchema.parse(request.query);
    const products = await dataAccess.listProducts(params.storeId, pagination);
    return productListResponseSchema.parse({
      // ADR-065 (Faz 2/Dilim 2) — liste hafif select kullanir; images bos ([]) doner.
      // baseUrl tutarlilik icin gecilir (liste thumbnail'i ayri follow-up).
      data: products.data.map((product) => serializeProduct(product, config.MEDIA_PUBLIC_BASE_URL)),
      pagination: { ...pagination, total: products.total },
    });
  });

  app.post("/stores/:storeId/products", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = productCreateRequestSchema.parse(request.body);
    // Faz 2A (ADR-068) — attributeValues Product kolonu DEGIL: ayiklanir, createProduct'a
    // gecmez; kaliciligi ayri attributeValueService adimidir.
    const { attributeValues, ...productInput } = input;
    const categoryIds = await validateCategoryIds(reply, params.storeId, input.categoryIds);
    if (!categoryIds) return;
    // Faz 1A (ADR-067) — ana kategori normalize + dogrula (STABIL kodlar). Tek
    // kategoride null → otomatik o kategori; coklu kategoride primary yoksa REQUIRED.
    const primary = await resolvePrimaryCategory(reply, params.storeId, categoryIds, input.primaryCategoryId, undefined);
    if (!primary) return;
    // Faz 2A — attribute degerleri URUN OLUSTURULMADAN ONCE dogrulanir (gecersizse hicbir
    // yazim olmaz). undefined = eski davranis (attribute yazilmaz, geriye donuk uyumlu).
    let attributeEntries: Awaited<ReturnType<typeof attributeValueService.prepareProductValues>> | null = null;
    if (attributeValues !== undefined) {
      attributeEntries = await attributeValueService.prepareProductValues({
        storeId: params.storeId,
        primaryCategoryId: primary.primaryCategoryId,
        values: attributeValues,
      });
      if (!attributeEntries.ok) {
        // Faz 2B (TODO-146) — attributeDefinitionId `details`'e konur ki store-admin
        // dinamik formu hatayı doğru alana bağlayabilsin (dedike PUT ucuyla tutarlı bilgi).
        return reply
          .code(attributeValueErrorStatus(attributeEntries.error.code))
          .send(
            errorBody(
              attributeEntries.error.code,
              attributeEntries.error.message,
              attributeEntries.error.attributeDefinitionId
                ? { attributeDefinitionId: attributeEntries.error.attributeDefinitionId }
                : undefined,
            ),
          );
      }
    }
    if (await dataAccess.findProductBySlug(params.storeId, input.slug)) {
      return reply.code(409).send(errorBody("PRODUCT_SLUG_EXISTS", "Product slug already exists."));
    }
    let product: ProductRecord;
    try {
      product = await dataAccess.createProduct(params.storeId, {
        ...productInput,
        categoryIds,
        primaryCategoryId: primary.primaryCategoryId,
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        return reply.code(409).send(errorBody("PRODUCT_SLUG_EXISTS", "Product slug already exists."));
      }
      throw error;
    }
    // Faz 2A — dogrulanmis degerler urun olustuktan sonra yazilir (tek yol: service).
    if (attributeEntries?.ok) {
      await attributeValueService.persistProductValues(params.storeId, product.id, attributeEntries.entries);
    }
    await dataAccess.createAuditLog({
      action: "CREATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "Product",
      entityId: product.id,
      metadata: { fields: Object.keys(input) },
    });
    return reply.code(201).send(serializeProduct(product, config.MEDIA_PUBLIC_BASE_URL));
  });

  app.get("/stores/:storeId/products/:productId", async (request, reply) => {
    const params = productParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const product = await dataAccess.findProductById(params.storeId, params.productId);
    if (!product) return reply.code(404).send(errorBody("PRODUCT_NOT_FOUND", "Product not found."));
    return serializeProduct(product, config.MEDIA_PUBLIC_BASE_URL);
  });

  app.patch("/stores/:storeId/products/:productId", async (request, reply) => {
    const params = productParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = productUpdateRequestSchema.parse(request.body);
    const current = await dataAccess.findProductById(params.storeId, params.productId);
    if (!current) return reply.code(404).send(errorBody("PRODUCT_NOT_FOUND", "Product not found."));
    const categoryIds =
      input.categoryIds === undefined
        ? undefined
        : await validateCategoryIds(reply, params.storeId, input.categoryIds);
    if (categoryIds === null) return;
    if (input.slug) {
      const existing = await dataAccess.findProductBySlug(params.storeId, input.slug);
      if (existing && existing.id !== params.productId) {
        return reply.code(409).send(errorBody("PRODUCT_SLUG_EXISTS", "Product slug already exists."));
      }
    }
    if (!isConsistentProductSalesModel({ ...current, ...input })) {
      return reply.code(400).send(errorBody("VALIDATION_ERROR", "Product sales model fields are inconsistent."));
    }
    // ADR-065 (Faz 2/Dilim 2) — galeri verildiyse her mediaId ayni store'a ait +
    // PRODUCT context olmali. TUM liste yazimdan ONCE dogrulanir (biri gecersizse
    // 400, hicbir yazim olmadan). imageMediaIds Product kolonu DEGIL → updateProduct'a
    // gecmeden ayiklanir; kalicilik ayri updateProductImages diff'i ile yapilir.
    const {
      imageMediaIds,
      primaryCategoryId: rawPrimaryCategoryId,
      attributeValues,
      ...productInput
    } = input;
    if (imageMediaIds !== undefined) {
      for (const mediaId of imageMediaIds) {
        if (!(await assertMediaAttachable(reply, params.storeId, mediaId, "PRODUCT"))) return;
      }
    }
    // Faz 1A (ADR-067) — Ana kategori cozumlemesi YALNIZ categoryIds VEYA
    // primaryCategoryId gonderildiginde calisir; boylece legacy (null-primary) urunun
    // ilgisiz alan update'i ana kategoriye DOKUNMAZ (kaydedilebilirlik korunur).
    // resolvedPrimary undefined = dokunma; string/null = ayni transaction'da yaz.
    let resolvedPrimary: string | null | undefined = undefined;
    const primaryProvided = rawPrimaryCategoryId !== undefined;
    if (categoryIds !== undefined || primaryProvided) {
      const effectiveCategoryIds = categoryIds ?? current.categoryIds;
      // ASSIGNMENT_CONFLICT: mevcut ana kategori yeni listeden cikariliyor, yeni ana
      // kategori verilmemis ve birden cok kategori kaliyor (tek kalirsa asagida
      // otomatik normalize edilir → cakisma degil). Ana kategori sessizce kaldirilamaz.
      if (
        categoryIds !== undefined &&
        current.primaryCategoryId &&
        !effectiveCategoryIds.includes(current.primaryCategoryId) &&
        !primaryProvided &&
        effectiveCategoryIds.length > 1
      ) {
        return reply
          .code(409)
          .send(
            errorBody(
              "PRIMARY_CATEGORY_ASSIGNMENT_CONFLICT",
              primaryCategoryErrorMessage("PRIMARY_CATEGORY_ASSIGNMENT_CONFLICT"),
            ),
          );
      }
      // primary gonderilmediyse: mevcut ana kategori YENI sette hala varsa korunur;
      // aksi halde null → resolve normalize eder (bosalirsa null, tek kalirsa o kategori).
      const effectivePrimaryRaw = primaryProvided
        ? rawPrimaryCategoryId
        : current.primaryCategoryId && effectiveCategoryIds.includes(current.primaryCategoryId)
          ? current.primaryCategoryId
          : null;
      const primary = await resolvePrimaryCategory(
        reply,
        params.storeId,
        effectiveCategoryIds,
        effectivePrimaryRaw,
        current.primaryCategoryId,
      );
      if (!primary) return;
      resolvedPrimary = primary.primaryCategoryId;
    }
    // Faz 2A (ADR-068) — attribute degerleri, GUNCELLEME sonrasi ETKIN ana kategoriye gore
    // dogrulanir (kategori/primary ayni patch'te degisebilir). undefined = dokunma (eski
    // davranis). Gecersizse hicbir yazim yapilmadan don.
    const effectivePrimaryCategoryId =
      resolvedPrimary === undefined ? current.primaryCategoryId : resolvedPrimary;
    let attributeEntries: Awaited<ReturnType<typeof attributeValueService.prepareProductValues>> | null = null;
    if (attributeValues !== undefined) {
      attributeEntries = await attributeValueService.prepareProductValues({
        storeId: params.storeId,
        primaryCategoryId: effectivePrimaryCategoryId,
        values: attributeValues,
      });
      if (!attributeEntries.ok) {
        // Faz 2B (TODO-146) — attributeDefinitionId `details`'e (alan eşlemesi için).
        return reply
          .code(attributeValueErrorStatus(attributeEntries.error.code))
          .send(
            errorBody(
              attributeEntries.error.code,
              attributeEntries.error.message,
              attributeEntries.error.attributeDefinitionId
                ? { attributeDefinitionId: attributeEntries.error.attributeDefinitionId }
                : undefined,
            ),
          );
      }
    }
    let product: ProductRecord = current;
    const hasProductFieldChange =
      Object.keys(productInput).length > 0 || categoryIds !== undefined || resolvedPrimary !== undefined;
    if (hasProductFieldChange) {
      const updated = await dataAccess.updateProduct(params.storeId, params.productId, {
        ...productInput,
        ...(categoryIds === undefined ? {} : { categoryIds }),
        ...(resolvedPrimary === undefined ? {} : { primaryCategoryId: resolvedPrimary }),
      });
      if (!updated) return reply.code(404).send(errorBody("PRODUCT_NOT_FOUND", "Product not found."));
      product = updated;
    }
    if (imageMediaIds !== undefined) {
      const updated = await dataAccess.updateProductImages(params.storeId, params.productId, imageMediaIds);
      if (!updated) return reply.code(404).send(errorBody("PRODUCT_NOT_FOUND", "Product not found."));
      product = updated;
    }
    // Faz 2A — dogrulanmis degerler yazilir (tek yol: service). Replace-set: [] tumunu temizler.
    if (attributeEntries?.ok) {
      await attributeValueService.persistProductValues(params.storeId, params.productId, attributeEntries.entries);
    }
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "Product",
      entityId: product.id,
      metadata: { fields: Object.keys(input) },
    });
    return serializeProduct(product, config.MEDIA_PUBLIC_BASE_URL);
  });

  app.get("/stores/:storeId/products/:productId/variants", async (request, reply) => {
    const params = productParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    if (!(await dataAccess.findProductById(params.storeId, params.productId))) {
      return reply.code(404).send(errorBody("PRODUCT_NOT_FOUND", "Product not found."));
    }
    const pagination = paginationQuerySchema.parse(request.query);
    const variants = await dataAccess.listVariants(params.storeId, params.productId, pagination);
    return productVariantListResponseSchema.parse({
      data: variants.data.map(serializeVariant),
      pagination: { ...pagination, total: variants.total },
    });
  });

  app.post("/stores/:storeId/products/:productId/variants", async (request, reply) => {
    const params = productParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const parentProduct = await dataAccess.findProductById(params.storeId, params.productId);
    if (!parentProduct) {
      return reply.code(404).send(errorBody("PRODUCT_NOT_FOUND", "Product not found."));
    }
    const input = productVariantCreateRequestSchema.parse(request.body);
    // Faz 2A (ADR-068) — attributeValues ProductVariant kolonu DEGIL: ayiklanir, createVariant'a
    // gecmez; yalniz variantDefining attribute'lar kabul edilir (service guard).
    const { attributeValues, ...variantInput } = input;
    if (await dataAccess.findVariantBySku(params.storeId, input.sku)) {
      return reply.code(409).send(errorBody("VARIANT_SKU_EXISTS", "Variant SKU already exists."));
    }
    // Faz 2A — degerler VARYANT OLUSTURULMADAN once dogrulanir (urunun ana kategorisine gore).
    let variantAttributeEntries:
      | Awaited<ReturnType<typeof attributeValueService.prepareVariantValues>>
      | null = null;
    if (attributeValues !== undefined) {
      variantAttributeEntries = await attributeValueService.prepareVariantValues({
        storeId: params.storeId,
        primaryCategoryId: parentProduct.primaryCategoryId,
        values: attributeValues,
      });
      if (!variantAttributeEntries.ok) {
        return reply
          .code(attributeValueErrorStatus(variantAttributeEntries.error.code))
          .send(errorBody(variantAttributeEntries.error.code, variantAttributeEntries.error.message));
      }
    }
    // F4C (ADR-063) — KDV cozumu SUNUCUDA: yeni istemci KDV HARIC net gonderir
    // (vat=round(net*bps/10000), brut=net+vat priceMinor'a yazilir); legacy
    // istemci yalniz brut gonderirse net/KDV bruttan ayristirilir (brut korunur).
    // Istemcinin hesapladigi KDV tutari hicbir kosulda kabul edilmez.
    const createVatRateBps = input.vatRateBps ?? DEFAULT_VAT_RATE_BPS;
    const createPricing =
      input.netPriceMinor !== undefined
        ? vatFromNet(input.netPriceMinor, createVatRateBps)
        : splitGrossByVat(input.priceMinor!, createVatRateBps);
    // F4B kurali hesaplanan brut ile kesinlestirilir: maliyet <= liste tavani.
    const createListCeiling = input.compareAtMinor ?? createPricing.grossMinor;
    if (input.costMinor != null && input.costMinor > createListCeiling) {
      return reply
        .code(400)
        .send(
          errorBody(
            "COST_EXCEEDS_LIST",
            "costMinor must be less than or equal to the list price (compareAtMinor ?? priceMinor).",
          ),
        );
    }
    let variant: VariantRecord;
    try {
      variant = await dataAccess.createVariant(params.storeId, params.productId, {
        ...variantInput,
        priceMinor: createPricing.grossMinor,
        netPriceMinor: createPricing.netMinor,
        vatRateBps: createVatRateBps,
        vatAmountMinor: createPricing.vatMinor,
        // F4B — Baslangic fiyat audit'i icin aktor.
        changedByPlatformUserId: access.session.platformUser.id,
        priceChangeSource: "ADMIN_EDIT",
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        return reply.code(409).send(errorBody("VARIANT_SKU_EXISTS", "Variant SKU already exists."));
      }
      throw error;
    }
    // Faz 2A — dogrulanmis variantDefining degerleri yazilir (tek yol: service).
    if (variantAttributeEntries?.ok) {
      await attributeValueService.persistVariantValues(params.storeId, variant.id, variantAttributeEntries.entries);
    }
    await dataAccess.createAuditLog({
      action: "CREATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "ProductVariant",
      entityId: variant.id,
      metadata: { fields: Object.keys(input) },
    });
    return reply.code(201).send(serializeVariant(variant));
  });

  app.patch("/stores/:storeId/products/:productId/variants/:variantId", async (request, reply) => {
    const params = variantParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const current = await dataAccess.findVariantById(params.storeId, params.productId, params.variantId);
    if (!current) return reply.code(404).send(errorBody("VARIANT_NOT_FOUND", "Variant not found."));
    // Faz 2A (ADR-068) — attributeValues ProductVariant kolonu DEGIL: ayiklanir; kaliciligi
    // ayri attributeValueService adimidir. Kalan alanlar mevcut fiyat/KDV akisina girer.
    const { attributeValues, ...rawInput } = productVariantUpdateRequestSchema.parse(request.body);
    // F4C (ADR-063) — KDV cozumu SUNUCUDA (patch + mevcut birlesik durum):
    //  - net verildiyse: vat=round(net*bps/10000), brut=net+vat (net ANKOR'dur).
    //  - yalniz brut verildiyse (legacy): net/KDV bruttan ayristirilir.
    //  - yalniz oran degistiyse: net SABIT kalir, KDV+brut yeniden hesaplanir
    //    (mevcut kayitta net yoksa onceki bruttan ayristirilarak turetilir).
    const patchVatRateBps = rawInput.vatRateBps ?? current.vatRateBps ?? DEFAULT_VAT_RATE_BPS;
    const hasPricingChange =
      rawInput.netPriceMinor !== undefined ||
      rawInput.priceMinor !== undefined ||
      rawInput.vatRateBps !== undefined;
    let pricingPatch: {
      priceMinor?: number;
      netPriceMinor?: number;
      vatRateBps?: number;
      vatAmountMinor?: number;
    } = {};
    if (hasPricingChange) {
      const pricing =
        rawInput.netPriceMinor !== undefined
          ? vatFromNet(rawInput.netPriceMinor, patchVatRateBps)
          : rawInput.priceMinor !== undefined
            ? splitGrossByVat(rawInput.priceMinor, patchVatRateBps)
            : vatFromNet(
                current.netPriceMinor ?? splitGrossByVat(current.priceMinor, patchVatRateBps).netMinor,
                patchVatRateBps,
              );
      pricingPatch = {
        priceMinor: pricing.grossMinor,
        netPriceMinor: pricing.netMinor,
        vatRateBps: patchVatRateBps,
        vatAmountMinor: pricing.vatMinor,
      };
    }
    // F4B — Birlestirilmis (patch + mevcut) durum uzerinden liste tavani hesabi.
    // NOT: satis > liste ARTIK 400 degil (karar: yalnizca storefront'ta rozet turemez).
    const resultPrice = pricingPatch.priceMinor ?? current.priceMinor;
    const resultCompareAt =
      rawInput.compareAtMinor !== undefined ? rawInput.compareAtMinor : current.compareAtMinor;
    const resultCost = rawInput.costMinor !== undefined ? rawInput.costMinor : current.costMinor;
    const listCeiling = resultCompareAt ?? resultPrice;
    if (resultCost != null && resultCost > listCeiling) {
      return reply
        .code(400)
        .send(
          errorBody(
            "COST_EXCEEDS_LIST",
            "costMinor must be less than or equal to the list price (compareAtMinor ?? priceMinor).",
          ),
        );
    }
    if (rawInput.sku) {
      const existing = await dataAccess.findVariantBySku(params.storeId, rawInput.sku);
      if (existing && existing.id !== params.variantId) {
        return reply.code(409).send(errorBody("VARIANT_SKU_EXISTS", "Variant SKU already exists."));
      }
    }
    // Faz 2A (ADR-068) — variantDefining attribute degerleri, VARYANT GUNCELLENMEDEN once
    // urunun ana kategorisine gore dogrulanir. undefined = dokunma (eski davranis).
    let variantAttributeEntries:
      | Awaited<ReturnType<typeof attributeValueService.prepareVariantValues>>
      | null = null;
    if (attributeValues !== undefined) {
      const parentProduct = await dataAccess.findProductById(params.storeId, params.productId);
      if (!parentProduct) return reply.code(404).send(errorBody("PRODUCT_NOT_FOUND", "Product not found."));
      variantAttributeEntries = await attributeValueService.prepareVariantValues({
        storeId: params.storeId,
        primaryCategoryId: parentProduct.primaryCategoryId,
        values: attributeValues,
      });
      if (!variantAttributeEntries.ok) {
        return reply
          .code(attributeValueErrorStatus(variantAttributeEntries.error.code))
          .send(errorBody(variantAttributeEntries.error.code, variantAttributeEntries.error.message));
      }
    }
    const variant = await dataAccess.updateVariant(params.storeId, params.productId, params.variantId, {
      ...rawInput,
      // F4C — Sunucuda cozulen tutarli KDV uclusu (brut=net+KDV) yazilir;
      // istemcinin ham netPriceMinor/vatRateBps'i oldugu gibi GECMEZ.
      ...pricingPatch,
      // F4B — Fiyat/liste/maliyet degisiklik audit'i icin aktor.
      changedByPlatformUserId: access.session.platformUser.id,
      priceChangeSource: "ADMIN_EDIT",
    });
    if (!variant) return reply.code(404).send(errorBody("VARIANT_NOT_FOUND", "Variant not found."));
    // Faz 2A — dogrulanmis variantDefining degerleri yazilir (tek yol: service).
    if (variantAttributeEntries?.ok) {
      await attributeValueService.persistVariantValues(params.storeId, params.variantId, variantAttributeEntries.entries);
    }
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "ProductVariant",
      entityId: variant.id,
      metadata: { fields: Object.keys(rawInput) },
    });
    return serializeVariant(variant);
  });

  // F4B — Varyant fiyat/liste/maliyet degisikligi gecmisi (yonetim; maliyet iceriр).
  app.get(
    "/stores/:storeId/products/:productId/variants/:variantId/price-changes",
    async (request, reply) => {
      const params = variantParamSchema.parse(request.params);
      const access = await requireStorePlatformAdmin(request, reply, params.storeId);
      if (!access) return;
      if (!(await dataAccess.findVariantById(params.storeId, params.productId, params.variantId))) {
        return reply.code(404).send(errorBody("VARIANT_NOT_FOUND", "Variant not found."));
      }
      const pagination = paginationQuerySchema.parse(request.query);
      const changes = await dataAccess.listPriceChanges(params.storeId, params.variantId, pagination);
      return productPriceChangeListResponseSchema.parse({
        data: changes.data.map(serializePriceChange),
        pagination: { ...pagination, total: changes.total },
      });
    },
  );

  app.get("/stores/:storeId/inventory", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const pagination = paginationQuerySchema.parse(request.query);
    const inventory = await dataAccess.listInventory(params.storeId, pagination);
    return inventoryListResponseSchema.parse({
      data: inventory.data.map(serializeInventoryItem),
      pagination: { ...pagination, total: inventory.total },
    });
  });

  app.get("/stores/:storeId/inventory/:variantId", async (request, reply) => {
    const params = inventoryParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const item = await dataAccess.findInventoryByVariantId(params.storeId, params.variantId);
    if (!item) return reply.code(404).send(errorBody("INVENTORY_ITEM_NOT_FOUND", "Inventory item not found."));
    return serializeInventoryItem(item);
  });

  app.post("/stores/:storeId/inventory/:variantId/adjust", async (request, reply) => {
    const params = inventoryParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = inventoryAdjustRequestSchema.parse(request.body);
    const result = await dataAccess.adjustInventory(params.storeId, params.variantId, {
      ...input,
      actorUserId: access.session.platformUser.id,
    });
    if (!result) return reply.code(404).send(errorBody("INVENTORY_ITEM_NOT_FOUND", "Inventory item not found."));
    if (result === "NEGATIVE_STOCK") {
      return reply
        .code(400)
        .send(errorBody("INVALID_INVENTORY_ADJUSTMENT", "Inventory adjustment would make stock negative."));
    }
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "InventoryItem",
      entityId: result.item.id,
      metadata: {
        variantId: params.variantId,
        quantityDelta: input.quantityDelta,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      },
    });
    return inventoryAdjustmentResponseSchema.parse({
      item: serializeInventoryItem(result.item),
      movement: serializeInventoryMovement(result.movement),
    });
  });

  app.get("/stores/:storeId/orders", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    // TODO-073 — Operasyonel filtreler. Store-scope yukarıda zorlanır; filtreler
    // yalnız o mağaza içinde daraltır, başka mağaza siparişine erişim açmaz.
    const query = orderListQuerySchema.parse(request.query);
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const orders = await dataAccess.listOrders(params.storeId, { ...query, limit, offset });
    return orderListResponseSchema.parse({
      data: orders.data.map(serializeOrder),
      pagination: { limit, offset, total: orders.total },
    });
  });

  // F3B.3 — Store-admin müşteri dizini. Store-scope zorunlu; başka mağaza müşterisi
  // dönmez. Response yalnız güvenli/maskeli alanlar taşır (hash/token/OTP/tam PII yok).
  app.get("/stores/:storeId/customers", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const pagination = paginationQuerySchema.parse(request.query);
    const customers = await dataAccess.listCustomers(params.storeId, pagination);
    return storeAdminCustomerListResponseSchema.parse({
      data: customers.data.map(serializeStoreAdminCustomer),
      pagination: { ...pagination, total: customers.total },
    });
  });

  app.post("/stores/:storeId/orders", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = orderCreateRequestSchema.parse(request.body);
    const order = await dataAccess.createOrder(params.storeId, {
      ...input,
      actorUserId: access.session.platformUser.id,
    });
    if (order === "CUSTOMER_NOT_FOUND") {
      return reply.code(404).send(errorBody("CUSTOMER_NOT_FOUND", "Customer not found."));
    }
    if (order === "VARIANT_NOT_FOUND") {
      return reply.code(404).send(errorBody("VARIANT_NOT_FOUND", "Variant not found."));
    }
    if (order === "INVALID_VARIANT") {
      return reply.code(400).send(errorBody("VALIDATION_ERROR", "Variant is not active or currency does not match."));
    }
    if (order === "PRODUCT_ORDER_QUANTITY_OUT_OF_RANGE") {
      return reply.code(400).send(errorBody("VALIDATION_ERROR", "Order line quantity is outside product limits."));
    }
    if (isProductSalesOrderError(order)) {
      return reply.code(400).send(productSalesOrderErrorBody(order));
    }
    // F4A — Admin siparis olusturma kampanya indirimi TASIMAZ (discounts input'u
    // yok); bu kodlar yalniz public checkout'ta olusabilir. Defansif jenerik yanit.
    if (order === "CAMPAIGN_USAGE_LIMIT" || order === "COUPON_USAGE_LIMIT" || order === "CAMPAIGN_NOT_ACTIVE") {
      return reply.code(409).send(errorBody("CAMPAIGN_REJECTED", "Campaign could not be applied."));
    }
    await dataAccess.createAuditLog({
      action: "CREATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "Order",
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber, lineCount: order.lines.length },
    });
    return reply.code(201).send(serializeOrder(order));
  });

  app.get("/stores/:storeId/orders/:orderId", async (request, reply) => {
    const params = orderParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const order = await dataAccess.findOrderById(params.storeId, params.orderId);
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Order not found."));
    return serializeOrder(order);
  });

  app.patch("/stores/:storeId/orders/:orderId", async (request, reply) => {
    const params = orderParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = orderUpdateRequestSchema.parse(request.body);
    const order = await dataAccess.updateOrder(params.storeId, params.orderId, {
      ...input,
      actorUserId: access.session.platformUser.id,
    });
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Order not found."));
    if (order === "CUSTOMER_NOT_FOUND") {
      return reply.code(404).send(errorBody("CUSTOMER_NOT_FOUND", "Customer not found."));
    }
    if (order === "MUTATION_NOT_ALLOWED") {
      return reply.code(409).send(errorBody("ORDER_MUTATION_NOT_ALLOWED", "Order mutation is not allowed."));
    }
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "Order",
      entityId: order.id,
      metadata: { fields: Object.keys(input) },
    });
    return serializeOrder(order);
  });

  app.post("/stores/:storeId/orders/:orderId/lines", async (request, reply) => {
    const params = orderParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = orderLineInputSchema.parse(request.body);
    const order = await dataAccess.addOrderLine(params.storeId, params.orderId, {
      ...input,
      actorUserId: access.session.platformUser.id,
    });
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Order not found."));
    if (order === "VARIANT_NOT_FOUND") {
      return reply.code(404).send(errorBody("VARIANT_NOT_FOUND", "Variant not found."));
    }
    if (order === "INVALID_VARIANT") {
      return reply.code(400).send(errorBody("VALIDATION_ERROR", "Variant is not active or currency does not match."));
    }
    if (order === "PRODUCT_ORDER_QUANTITY_OUT_OF_RANGE") {
      return reply.code(400).send(errorBody("VALIDATION_ERROR", "Order line quantity is outside product limits."));
    }
    if (isProductSalesOrderError(order)) {
      return reply.code(400).send(productSalesOrderErrorBody(order));
    }
    if (order === "MUTATION_NOT_ALLOWED") {
      return reply.code(409).send(errorBody("ORDER_MUTATION_NOT_ALLOWED", "Order mutation is not allowed."));
    }
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "OrderLine",
      entityId: order.lines.at(-1)?.id,
      metadata: { orderId: params.orderId, variantId: input.variantId, quantity: input.quantity },
    });
    return reply.code(201).send(serializeOrder(order));
  });

  app.patch("/stores/:storeId/orders/:orderId/lines/:lineId", async (request, reply) => {
    const params = orderLineParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = orderLineUpdateRequestSchema.parse(request.body);
    const order = await dataAccess.updateOrderLine(params.storeId, params.orderId, params.lineId, {
      ...input,
      actorUserId: access.session.platformUser.id,
    });
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Order not found."));
    if (order === "ORDER_LINE_NOT_FOUND") {
      return reply.code(404).send(errorBody("ORDER_LINE_NOT_FOUND", "Order line not found."));
    }
    if (order === "MUTATION_NOT_ALLOWED") {
      return reply.code(409).send(errorBody("ORDER_MUTATION_NOT_ALLOWED", "Order mutation is not allowed."));
    }
    if (order === "PRODUCT_ORDER_QUANTITY_OUT_OF_RANGE") {
      return reply.code(400).send(errorBody("VALIDATION_ERROR", "Order line quantity is outside product limits."));
    }
    if (isProductSalesOrderError(order)) {
      return reply.code(400).send(productSalesOrderErrorBody(order));
    }
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "OrderLine",
      entityId: params.lineId,
      metadata: { orderId: params.orderId, quantity: input.quantity },
    });
    return serializeOrder(order);
  });

  app.post("/stores/:storeId/orders/:orderId/place", async (request, reply) => {
    const params = orderParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const order = await dataAccess.placeOrder(params.storeId, params.orderId, {
      actorUserId: access.session.platformUser.id,
    });
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Order not found."));
    if (order === "INVALID_STATUS") {
      return reply.code(409).send(errorBody("ORDER_INVALID_STATUS", "Order cannot be placed in its current status."));
    }
    if (order === "INVALID_VARIANT") {
      return reply.code(400).send(errorBody("VALIDATION_ERROR", "Variant is not active or currency does not match."));
    }
    if (order === "PRODUCT_ORDER_QUANTITY_OUT_OF_RANGE") {
      return reply.code(400).send(errorBody("VALIDATION_ERROR", "Order line quantity is outside product limits."));
    }
    if (isProductSalesOrderError(order)) {
      return reply.code(400).send(productSalesOrderErrorBody(order));
    }
    if (order === "INSUFFICIENT_STOCK") {
      return reply.code(409).send(errorBody("ORDER_INSUFFICIENT_STOCK", "Insufficient stock for order reservation."));
    }
    if (order === "RESERVATION_FAILED") {
      return reply.code(409).send(errorBody("ORDER_RESERVATION_FAILED", "Inventory reservation failed."));
    }
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "Order",
      entityId: order.id,
      metadata: { status: order.status, reservations: order.reservations.length },
    });
    return serializeOrder(order);
  });

  app.post("/stores/:storeId/orders/:orderId/cancel", async (request, reply) => {
    const params = orderParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = orderCancelRequestSchema.parse(request.body ?? {});
    const order = await dataAccess.cancelOrder(params.storeId, params.orderId, {
      ...input,
      actorUserId: access.session.platformUser.id,
    });
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Order not found."));
    if (order === "INVALID_STATUS") {
      return reply.code(409).send(errorBody("ORDER_INVALID_STATUS", "Order cannot be cancelled in its current status."));
    }
    if (order === "RESERVATION_FAILED") {
      return reply.code(409).send(errorBody("ORDER_RESERVATION_FAILED", "Inventory reservation release failed."));
    }
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "Order",
      entityId: order.id,
      metadata: { status: order.status, reason: input.reason ?? null },
    });
    return serializeOrder(order);
  });

  // ========================================================================
  // F3B.2 — Payment provider operasyon altyapisi (provider-ready; canli odeme YOK)
  // ========================================================================
  const paymentProviderParamSchema = z.object({
    storeId: z.string().min(1),
    configId: z.string().min(1),
  });
  const publicOrderPaymentParamSchema = z.object({
    storeSlug: z.string().min(1),
    orderId: z.string().min(1),
  });
  const publicPaymentTokenQuerySchema = z.object({ token: z.string().min(1) });
  const paymentWebhookParamSchema = z.object({ provider: z.string().min(1) });
  const paymentWebhookBodySchema = z
    .object({ storeId: z.string().min(1), eventId: z.string().min(1) })
    .passthrough();

  /** Secret cipher'lari decrypt eder; cozulemezse null (sizdirmaz). */
  function decryptCredentials(config: PaymentProviderConfigRecord): ResolvedCredentials {
    const dec = (cipher: string | null) => {
      if (!cipher) return null;
      try {
        return secretCipher.decrypt(cipher);
      } catch {
        return null;
      }
    };
    return {
      apiKey: dec(config.apiKeyCipher),
      secretKey: dec(config.secretKeyCipher),
      webhookSecret: dec(config.webhookSecretCipher),
      merchantId: config.merchantId ?? null,
    };
  }

  function toResolvable(config: PaymentProviderConfigRecord): ResolvableProviderConfig {
    return {
      id: config.id,
      provider: config.provider,
      status: config.status,
      mode: config.mode,
      priority: config.priority,
      supportedMethods: config.supportedMethods,
      supportedCurrencies: config.supportedCurrencies,
      minAmount: config.minAmount,
      maxAmount: config.maxAmount,
      fallbackEnabled: config.fallbackEnabled,
      createdAt: config.createdAt,
    };
  }

  function buildActionContext(
    config: PaymentProviderConfigRecord,
    attempt: PaymentAttemptRecord,
  ): PaymentActionContext {
    return {
      provider: attempt.provider,
      mode: attempt.mode,
      threeDsMode: config.threeDsMode,
      method: attempt.method,
      amount: attempt.amount,
      currency: attempt.currency,
      credentials: decryptCredentials(config),
    };
  }

  /** undefined => dokunma; null/"" => temizle; deger => encrypt. */
  function encryptOptionalSecret(value: string | null | undefined): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    return secretCipher.encrypt(value);
  }

  function serializeConfig(config: PaymentProviderConfigRecord) {
    return paymentProviderConfigSchema.parse(serializeProviderConfig(config, { cipher: secretCipher }));
  }

  function serializeProviderEvent(event: PaymentProviderEventRecord) {
    return {
      id: event.id,
      provider: event.provider,
      type: event.type,
      providerConfigId: event.providerConfigId,
      attemptId: event.attemptId,
      orderId: event.orderId,
      eventId: event.eventId,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
    };
  }

  /**
   * Checkout ONCESI bilgilendirme: store'da checkout sonrasi test odeme adimini
   * SURDUREN bir provider var mi? `buildPaymentRedirect` ile AYNI kosulu yansitir
   * (bu fazda yalnizca MOCK test akisini surdurur; LIVE ortamda MOCK devre disi).
   * Tutar/para-birimi'ne bagli min/maks kapsam disi (cart-bagimsiz ipucu); kesin
   * karar yine checkout aninda `buildPaymentRedirect` tarafindan verilir.
   */
  async function hasTestPaymentProvider(storeId: string): Promise<boolean> {
    if (isLiveEnv) {
      return false;
    }
    const configs = await dataAccess.listPaymentProviderConfigs(storeId);
    // Herhangi bir ENABLED + TEST + CARD provider odeme adimini SURDURUR. MOCK tam
    // calisir; gercek provider odeme sayfasini gosterir ama submit'te kontrollu hata
    // doner (fake success yok). CTA "Ödeme adımına ilerle" buna gore gosterilir.
    return configs.some(
      (candidate) =>
        candidate.status === "ENABLED" &&
        candidate.mode === "TEST" &&
        candidate.supportedMethods.includes("CARD"),
    );
  }

  /**
   * Checkout sonrasi: uygun bir TEST/MOCK provider varsa PaymentAttempt + kisa
   * omurlu access token uretir ve odeme yonlendirme objesi doner. Provider yoksa
   * NULL doner — bu durumda checkout response shape'i BIREBIR korunur (zero-regression).
   * Bu fazda yalnizca MOCK operasyonel; stub provider'lar test akisini SURMEZ.
   */
  async function buildPaymentRedirect(storeId: string, order: OrderRecord) {
    const configs = await dataAccess.listPaymentProviderConfigs(storeId);
    const resolved = resolvePaymentProviders(configs.map(toResolvable), {
      currency: order.currency,
      amount: order.totalAmount,
      method: "CARD",
      mode: "TEST",
      isLiveEnv,
    });
    // Test odeme akisini bu fazda yalnizca MOCK adapter TAMAMLAYABILIR; gercek
    // provider'lar (IYZICO/STRIPE/PAYTR) submit'te kontrollu hata doner (fake
    // success YOK). Bu nedenle uygun adaylar arasinda MOCK varsa onceligi MOCK'a
    // verir — priority sirasi gercek bir provider'i one alsa bile. Boylece "MOCK
    // aktifken test odeme calismiyor" durumu olusmaz. MOCK yoksa birincil gercek
    // provider secilir (kullanici odeme ekraninda kontrollu hata/yonlendirme gorur).
    const primary = resolved.find((candidate) => candidate.provider === "MOCK") ?? resolved[0];
    if (!primary) {
      return null;
    }
    const accessToken = createPaymentAccessToken(config.SESSION_SECRET);
    const attempt = await dataAccess.createPaymentAttempt(storeId, {
      orderId: order.id,
      providerConfigId: primary.id,
      provider: primary.provider,
      mode: "TEST",
      method: "CARD",
      amount: order.totalAmount,
      currency: order.currency,
      status: "CREATED",
      accessTokenHash: accessToken.tokenHash,
      accessTokenExpiresAt: accessToken.expiresAt,
    });
    await dataAccess.createPaymentProviderEvent(storeId, {
      providerConfigId: primary.id,
      attemptId: attempt.id,
      orderId: order.id,
      provider: primary.provider,
      type: "PAYMENT_CREATED",
      message: "Payment attempt created (test flow).",
    });
    return {
      required: true as const,
      attemptId: attempt.id,
      token: accessToken.token,
      paymentPath: `/checkout/payment?orderId=${order.id}&token=${accessToken.token}`,
      scenarios: [...PAYMENT_SCENARIOS],
    };
  }
  // Checkout handler buildPaymentRedirect'i kullanir (asagidaki public checkout).
  paymentRedirectBuilderRef.current = buildPaymentRedirect;

  // --- Admin: provider config yonetimi (store-scoped, maskeli yanit) --------
  app.get("/stores/:storeId/payment-providers", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const configs = await dataAccess.listPaymentProviderConfigs(params.storeId);
    return paymentProviderConfigListResponseSchema.parse({ data: configs.map(serializeConfig) });
  });

  app.post("/stores/:storeId/payment-providers", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = paymentProviderConfigCreateRequestSchema.parse(request.body);
    if (input.minAmount != null && input.maxAmount != null && input.minAmount > input.maxAmount) {
      return reply.code(400).send(errorBody("PAYMENT_AMOUNT_RANGE_INVALID", "minAmount maxAmount'tan buyuk olamaz."));
    }
    const created = await dataAccess.createPaymentProviderConfig(params.storeId, {
      provider: input.provider,
      displayName: input.displayName,
      status: input.status,
      mode: input.mode,
      priority: input.priority,
      supportedMethods: input.supportedMethods,
      supportedCurrencies: input.supportedCurrencies,
      minAmount: input.minAmount ?? null,
      maxAmount: input.maxAmount ?? null,
      threeDsMode: input.threeDsMode,
      installmentEnabled: input.installmentEnabled,
      fallbackEnabled: input.fallbackEnabled,
      merchantId: input.merchantId ?? null,
      callbackUrl: input.callbackUrl ?? null,
      apiKeyCipher: encryptOptionalSecret(input.apiKey),
      secretKeyCipher: encryptOptionalSecret(input.secretKey),
      webhookSecretCipher: encryptOptionalSecret(input.webhookSecret),
    });
    if (created === "PROVIDER_MODE_EXISTS") {
      return reply.code(409).send(errorBody("PAYMENT_PROVIDER_MODE_EXISTS", "Bu provider+mode zaten tanimli."));
    }
    await dataAccess.createAuditLog({
      action: "CREATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "PaymentProviderConfig",
      entityId: created.id,
      // Secret degerleri DEGIL, yalnizca hangi alanlarin set edildigi loglanir.
      metadata: { provider: created.provider, mode: created.mode, fields: Object.keys(input) },
    });
    return reply.code(201).send(serializeConfig(created));
  });

  app.get("/stores/:storeId/payment-providers/:configId", async (request, reply) => {
    const params = paymentProviderParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const config = await dataAccess.findPaymentProviderConfigById(params.storeId, params.configId);
    if (!config) return reply.code(404).send(errorBody("PAYMENT_PROVIDER_NOT_FOUND", "Provider config not found."));
    return serializeConfig(config);
  });

  app.patch("/stores/:storeId/payment-providers/:configId", async (request, reply) => {
    const params = paymentProviderParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = paymentProviderConfigUpdateRequestSchema.parse(request.body);
    const existing = await dataAccess.findPaymentProviderConfigById(params.storeId, params.configId);
    if (!existing) return reply.code(404).send(errorBody("PAYMENT_PROVIDER_NOT_FOUND", "Provider config not found."));
    const effectiveMin = input.minAmount !== undefined ? input.minAmount : existing.minAmount;
    const effectiveMax = input.maxAmount !== undefined ? input.maxAmount : existing.maxAmount;
    if (effectiveMin != null && effectiveMax != null && effectiveMin > effectiveMax) {
      return reply.code(400).send(errorBody("PAYMENT_AMOUNT_RANGE_INVALID", "minAmount maxAmount'tan buyuk olamaz."));
    }
    const { apiKey, secretKey, webhookSecret, ...rest } = input;
    const updated = await dataAccess.updatePaymentProviderConfig(params.storeId, params.configId, {
      ...rest,
      apiKeyCipher: encryptOptionalSecret(apiKey),
      secretKeyCipher: encryptOptionalSecret(secretKey),
      webhookSecretCipher: encryptOptionalSecret(webhookSecret),
    });
    if (updated === "PROVIDER_MODE_EXISTS") {
      return reply.code(409).send(errorBody("PAYMENT_PROVIDER_MODE_EXISTS", "Bu provider+mode zaten tanimli."));
    }
    if (!updated) return reply.code(404).send(errorBody("PAYMENT_PROVIDER_NOT_FOUND", "Provider config not found."));
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "PaymentProviderConfig",
      entityId: updated.id,
      metadata: { fields: Object.keys(input) },
    });
    return serializeConfig(updated);
  });

  app.post("/stores/:storeId/payment-providers/:configId/status", async (request, reply) => {
    const params = paymentProviderParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = paymentProviderStatusUpdateRequestSchema.parse(request.body);
    const updated = await dataAccess.setPaymentProviderStatus(params.storeId, params.configId, input.status);
    if (!updated) return reply.code(404).send(errorBody("PAYMENT_PROVIDER_NOT_FOUND", "Provider config not found."));
    await dataAccess.createPaymentProviderEvent(params.storeId, {
      providerConfigId: updated.id,
      provider: updated.provider,
      type: "STATUS_CHANGED",
      message: `Status ${updated.status}.`,
    });
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "PaymentProviderConfig",
      entityId: updated.id,
      metadata: { status: updated.status },
    });
    return serializeConfig(updated);
  });

  app.post("/stores/:storeId/payment-providers/reorder", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = paymentProviderReorderRequestSchema.parse(request.body);
    const result = await dataAccess.reorderPaymentProviderPriorities(params.storeId, input.items);
    if (result === "CONFIG_NOT_FOUND") {
      return reply.code(404).send(errorBody("PAYMENT_PROVIDER_NOT_FOUND", "One or more configs not found."));
    }
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "PaymentProviderConfig",
      metadata: { reordered: input.items.length },
    });
    return paymentProviderConfigListResponseSchema.parse({ data: result.map(serializeConfig) });
  });

  app.post("/stores/:storeId/payment-providers/:configId/test-connection", async (request, reply) => {
    const params = paymentProviderParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const config = await dataAccess.findPaymentProviderConfigById(params.storeId, params.configId);
    if (!config) return reply.code(404).send(errorBody("PAYMENT_PROVIDER_NOT_FOUND", "Provider config not found."));
    const adapter = paymentAdapters.get(config.provider);
    let result: { ok: boolean; message: string };
    try {
      result = await adapter.testConnection({
        context: { provider: config.provider, mode: config.mode, credentials: decryptCredentials(config) },
      });
    } catch (error) {
      if (error instanceof PaymentConfigError) {
        result = { ok: false, message: `${error.code}: ${error.message}` };
      } else {
        throw error;
      }
    }
    const testedAt = new Date();
    await dataAccess.recordPaymentProviderTest(params.storeId, params.configId, {
      status: result.ok ? "OK" : "FAILED",
      message: result.message,
      at: testedAt,
    });
    await dataAccess.createPaymentProviderEvent(params.storeId, {
      providerConfigId: config.id,
      provider: config.provider,
      type: "CONNECTION_TEST",
      message: result.message,
    });
    return paymentProviderTestConnectionResponseSchema.parse({
      ok: result.ok,
      message: result.message,
      testedAt: testedAt.toISOString(),
    });
  });

  app.get("/stores/:storeId/payment-providers/:configId/events", async (request, reply) => {
    const params = paymentProviderParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const config = await dataAccess.findPaymentProviderConfigById(params.storeId, params.configId);
    if (!config) return reply.code(404).send(errorBody("PAYMENT_PROVIDER_NOT_FOUND", "Provider config not found."));
    const pagination = paginationQuerySchema.parse(request.query);
    const events = await dataAccess.listPaymentProviderEvents(params.storeId, {
      providerConfigId: params.configId,
      ...pagination,
    });
    return paymentProviderEventListResponseSchema.parse({ data: events.map(serializeProviderEvent) });
  });

  app.get("/stores/:storeId/payment-events", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const pagination = paginationQuerySchema.parse(request.query);
    const events = await dataAccess.listPaymentProviderEvents(params.storeId, pagination);
    return paymentProviderEventListResponseSchema.parse({ data: events.map(serializeProviderEvent) });
  });

  // --- Public: test odeme akisi (token-korumalı; secret/credential ASLA donmez) ---
  /** Token + order payable + attempt TEST/MOCK dogrulamasi yapip baglami yukler. */
  async function loadPublicPaymentContext(
    storeSlug: string,
    orderId: string,
    token: string,
    reply: FastifyReply,
  ) {
    const store = await resolvePublicStore(storeSlug);
    if (!store) {
      await reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
      return null;
    }
    const attempt = await dataAccess.findLatestPaymentAttemptForOrder(store.id, orderId);
    if (!attempt) {
      await reply.code(404).send(errorBody("PAYMENT_NOT_FOUND", "Payment attempt not found."));
      return null;
    }
    if (!verifyPaymentAccessToken(token, attempt, config.SESSION_SECRET)) {
      await reply.code(403).send(errorBody("PAYMENT_TOKEN_INVALID", "Payment token invalid or expired."));
      return null;
    }
    // Bu fazda yalnizca TEST mod attempt'leri ilerletilebilir. MOCK tam calisir;
    // gercek provider (IYZICO/STRIPE/PAYTR) submit'te KONTROLLU hata doner (fake yok).
    if (attempt.mode !== "TEST") {
      await reply.code(409).send(errorBody("PAYMENT_NOT_AVAILABLE", "Payment method not available."));
      return null;
    }
    const order = await dataAccess.findOrderById(store.id, orderId);
    if (!order) {
      await reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Order not found."));
      return null;
    }
    const providerConfig = await dataAccess.findPaymentProviderConfigById(store.id, attempt.providerConfigId);
    if (!providerConfig) {
      await reply.code(409).send(errorBody("PAYMENT_NOT_AVAILABLE", "Payment provider not available."));
      return null;
    }
    return { store, attempt, order, providerConfig };
  }

  /** KDV-dahil gostergesi (%20 dahil): toplam - round(toplam / 1.2). */
  function taxIncludedOf(totalMinor: number): number {
    return totalMinor - Math.round(totalMinor / 1.2);
  }

  function safeAddressSummary(address: OrderAddressRecord | null) {
    if (!address) return null;
    return {
      fullName: address.fullName,
      phone: address.phone ?? null,
      country: address.countryCode,
      city: address.city,
      district: address.district ?? null,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 ?? null,
      postalCode: address.postalCode ?? null,
    };
  }

  /** Public fatura ozeti — bireysel TCKN CLIENT'A DONMEZ (PII allowlist). */
  function publicBillingSummaryOf(order: OrderRecord) {
    if (!order.billingType) return null;
    const addresses = order.addresses ?? [];
    const shipping = addresses.find((a) => a.type === "SHIPPING") ?? null;
    const billing = addresses.find((a) => a.type === "BILLING") ?? null;
    const sameAsShipping =
      !!shipping &&
      !!billing &&
      shipping.addressLine1 === billing.addressLine1 &&
      shipping.city === billing.city &&
      (shipping.postalCode ?? null) === (billing.postalCode ?? null);
    return {
      type: order.billingType,
      name: order.billingName ?? null,
      companyName: order.billingCompanyName ?? null,
      taxOffice: order.billingTaxOffice ?? null,
      taxNumber: order.billingTaxNumber ?? null,
      email: order.billingEmail ?? null,
      sameAsShipping,
    };
  }

  function publicPaymentInfoOf(attempt: PaymentAttemptRecord) {
    return {
      attemptId: attempt.id,
      provider: attempt.provider,
      mode: attempt.mode,
      method: attempt.method,
      status: attempt.status,
      threeDsApplied: attempt.threeDsApplied,
      cardBrand: attempt.cardBrand ?? null,
      cardLast4: attempt.cardLast4 ?? null,
      installmentCount: attempt.installmentCount,
      providerReference: attempt.providerReference ?? null,
      paidAt: attempt.paidAt?.toISOString() ?? null,
    };
  }

  /** Token-korumalı GUVENLI siparis fisi (success ekrani + odeme sayfasi ozeti). */
  function buildPublicReceipt(order: OrderRecord, attempt: PaymentAttemptRecord | null) {
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      currency: order.currency,
      subtotalMinor: order.subtotalAmount,
      shippingMinor: order.shippingAmount,
      discountMinor: order.discountAmount,
      taxIncludedMinor: taxIncludedOf(order.totalAmount),
      totalMinor: order.totalAmount,
      couponCode: null,
      contactEmail: order.customerEmail,
      lines: (order.lines ?? []).map((line) => ({
        title: line.title,
        variantTitle: line.variantTitle,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceAmount,
        lineTotalMinor: line.totalAmount,
        currency: line.currency,
      })),
      shippingAddress: safeAddressSummary(
        (order.addresses ?? []).find((a) => a.type === "SHIPPING") ?? null,
      ),
      billing: publicBillingSummaryOf(order),
      payment: attempt ? publicPaymentInfoOf(attempt) : null,
      createdAt: order.createdAt.toISOString(),
    };
  }

  app.get("/public/stores/:storeSlug/orders/:orderId/payment", async (request, reply) => {
    const params = publicOrderPaymentParamSchema.parse(request.params);
    const query = publicPaymentTokenQuerySchema.parse(request.query);
    const ctx = await loadPublicPaymentContext(params.storeSlug, params.orderId, query.token, reply);
    if (!ctx) return;
    const installmentOptions = installmentOptionsFor({
      installmentEnabled: ctx.providerConfig.installmentEnabled,
      method: ctx.attempt.method,
    });
    return publicPaymentStateSchema.parse({
      orderNumber: ctx.order.orderNumber,
      paymentStatus: ctx.order.paymentStatus,
      currency: ctx.order.currency,
      totalMinor: ctx.order.totalAmount,
      subtotalMinor: ctx.order.subtotalAmount,
      shippingMinor: ctx.order.shippingAmount,
      discountMinor: ctx.order.discountAmount,
      taxIncludedMinor: taxIncludedOf(ctx.order.totalAmount),
      contactEmail: ctx.order.customerEmail,
      provider: ctx.attempt.provider,
      mode: ctx.attempt.mode,
      method: ctx.attempt.method,
      threeDsMode: ctx.providerConfig.threeDsMode,
      installmentEnabled: ctx.providerConfig.installmentEnabled,
      installmentOptions,
      attempt: {
        id: ctx.attempt.id,
        status: ctx.attempt.status,
        threeDsApplied: ctx.attempt.threeDsApplied,
      },
      scenarios: [...PAYMENT_SCENARIOS],
      lines: ctx.order.lines.map((line) => ({
        title: line.title,
        variantTitle: line.variantTitle,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceAmount,
        lineTotalMinor: line.totalAmount,
        currency: line.currency,
      })),
      shippingAddress: safeAddressSummary(ctx.order.addresses.find((a) => a.type === "SHIPPING") ?? null),
      billing: publicBillingSummaryOf(ctx.order),
    });
  });

  app.post("/public/stores/:storeSlug/orders/:orderId/payment", async (request, reply) => {
    const params = publicOrderPaymentParamSchema.parse(request.params);
    const body = publicPaymentSubmitRequestSchema.parse(request.body);
    const ctx = await loadPublicPaymentContext(params.storeSlug, params.orderId, body.token, reply);
    if (!ctx) return;
    if (ctx.order.paymentStatus !== "UNPAID") {
      return reply.code(409).send(errorBody("PAYMENT_NOT_PAYABLE", "Order is not awaiting payment."));
    }

    // Gercek provider (IYZICO/STRIPE/PAYTR/GENERIC_REDIRECT): bu fazda canli/sandbox
    // tahsilat YOK. Credential olsun olmasin FAKE SUCCESS URETILMEZ — kontrollu hata.
    // (Secret/credential ASLA serialize edilmez; sadece guvenli kod/mesaj doner.)
    if (ctx.attempt.provider !== "MOCK") {
      await dataAccess.createPaymentProviderEvent(ctx.store.id, {
        providerConfigId: ctx.providerConfig.id,
        attemptId: ctx.attempt.id,
        orderId: ctx.order.id,
        provider: ctx.attempt.provider,
        type: "PAYMENT_FAILED",
        message: "Live/sandbox charge not available in this phase; no fake success.",
      });
      return reply
        .code(409)
        .send(
          errorBody(
            "PAYMENT_PROVIDER_NOT_CONFIGURED",
            "Bu sağlayıcı için test ödeme çalıştırılamıyor. Sağlayıcı test bilgileri eksik veya canlı tahsilat bu fazda kapalı.",
          ),
        );
    }

    // Kart girdisi (yeni akis) varsa SUNUCU-OTORITER dogrulanir ve senaryo karttan
    // turetilir. Full PAN/CVC ASLA saklanmaz; yalniz marka + son 4 turetilir.
    let scenario: PaymentScenario;
    let cardBrand: string | null = null;
    let cardLast4: string | null = null;
    if (body.card) {
      const validation = validateCard(body.card);
      if (!validation.ok) {
        return reply.code(400).send(
          errorBody(
            validation.code,
            validation.code === "CARD_EXPIRED"
              ? "Kartın son kullanma tarihi geçersiz."
              : "Kart numarası geçersiz.",
          ),
        );
      }
      cardBrand = validation.brand;
      cardLast4 = validation.last4;
      scenario = scenarioFromCardNumber(body.card.number);
    } else {
      scenario = body.scenario as PaymentScenario;
    }

    // Taksit: provider config + tutara gore izin verilenle sinirla (aksi halde tek cekim).
    const installmentOptions = installmentOptionsFor({
      installmentEnabled: ctx.providerConfig.installmentEnabled,
      method: ctx.attempt.method,
    });
    const installmentCount = installmentOptions.includes(body.installmentCount)
      ? body.installmentCount
      : 1;

    const adapter = paymentAdapters.get("MOCK");
    const result = await adapter.confirmPayment({
      context: buildActionContext(ctx.providerConfig, ctx.attempt),
      attemptId: ctx.attempt.id,
      currentStatus: ctx.attempt.status,
      scenario,
      ...(body.threeDsAction ? { threeDsOutcome: body.threeDsAction } : {}),
    });

    let orderPaymentStatus: PaymentStatus | null = null;
    let eventType: PaymentProviderEventType = "STATUS_CHANGED";
    let clearAccessToken = false;
    let paidAt: Date | null = null;
    let failedAt: Date | null = null;
    switch (result.status) {
      case "PAID":
        orderPaymentStatus = "PAID";
        eventType = "PAYMENT_CONFIRMED";
        clearAccessToken = true;
        paidAt = new Date();
        break;
      case "AUTHORIZED":
        orderPaymentStatus = "AUTHORIZED";
        eventType = "PAYMENT_CONFIRMED";
        clearAccessToken = true;
        paidAt = new Date();
        break;
      case "REQUIRES_ACTION":
        eventType = "STATUS_CHANGED";
        break;
      case "CANCELLED":
        eventType = "PAYMENT_CANCELLED";
        failedAt = new Date();
        break;
      case "FAILED":
      default:
        eventType = "PAYMENT_FAILED";
        failedAt = new Date();
        break;
    }

    await dataAccess.recordPaymentAttemptOutcome(ctx.store.id, {
      attemptId: ctx.attempt.id,
      orderId: ctx.order.id,
      attemptStatus: result.status,
      threeDsApplied: result.threeDsApplied ?? false,
      scenario,
      providerReference: result.providerReference ?? null,
      failureCode: result.failureCode ?? null,
      failureMessage: result.failureMessage ?? null,
      installmentCount,
      cardBrand,
      cardLast4,
      paidAt: paidAt ?? undefined,
      failedAt: failedAt ?? undefined,
      orderPaymentStatus,
      clearAccessToken,
      event: {
        type: eventType,
        provider: "MOCK",
        // PAN/CVC ASLA loglanmaz; yalniz senaryo + taksit + maskeli son 4.
        message: `Mock payment ${scenario} → ${result.status}.`,
        metadata: { scenario, installmentCount, cardLast4 },
      },
    });

    const updatedOrder = await dataAccess.findOrderById(ctx.store.id, ctx.order.id);
    const succeeded = result.status === "PAID" || result.status === "AUTHORIZED";
    const updatedAttempt =
      updatedOrder?.paymentAttempts?.find((a) => a.id === ctx.attempt.id) ?? null;
    return publicPaymentResultSchema.parse({
      orderNumber: ctx.order.orderNumber,
      paymentStatus: updatedOrder?.paymentStatus ?? ctx.order.paymentStatus,
      attempt: {
        id: ctx.attempt.id,
        status: result.status,
        threeDsApplied: result.threeDsApplied ?? false,
        failureCode: result.failureCode ?? null,
        failureMessage: result.failureMessage ?? null,
        cardBrand,
        cardLast4,
        installmentCount,
        providerReference: result.providerReference ?? null,
      },
      requiresAction: result.status === "REQUIRES_ACTION",
      receipt: succeeded && updatedOrder ? buildPublicReceipt(updatedOrder, updatedAttempt) : null,
    });
  });

  // --- Webhook shell: imza dogrulamasi placeholder; idempotency + event log hazir ---
  app.post("/payments/webhooks/:provider", async (request, reply) => {
    const params = paymentWebhookParamSchema.parse(request.params);
    const providerUpper = params.provider.toUpperCase();
    const validProviders: PaymentProviderType[] = ["MOCK", "IYZICO", "STRIPE", "PAYTR", "GENERIC_REDIRECT"];
    if (!validProviders.includes(providerUpper as PaymentProviderType)) {
      return reply.code(404).send(errorBody("PAYMENT_PROVIDER_UNKNOWN", "Unknown payment provider."));
    }
    const provider = providerUpper as PaymentProviderType;
    const body = paymentWebhookBodySchema.parse(request.body ?? {});
    const store = await dataAccess.findStoreById(body.storeId);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }
    // Idempotency: ayni (store, provider, eventId) daha once islendiyse no-op.
    const existing = await dataAccess.findPaymentProviderEventByEventId(store.id, provider, body.eventId);
    if (existing) {
      return reply.code(200).send({ received: true, duplicate: true });
    }
    // Bu fazda imza dogrulamasi placeholder'dir (gercek verification sonraki faz).
    const signature = (request.headers["x-payment-signature"] as string | undefined) ?? null;
    const adapter = paymentAdapters.get(provider);
    const result = await adapter.handleWebhook({
      provider,
      credentials: { apiKey: null, secretKey: null, webhookSecret: null, merchantId: null },
      signature,
      rawBody: JSON.stringify(request.body ?? {}),
      payload: request.body ?? {},
    });
    await dataAccess.createPaymentProviderEvent(store.id, {
      provider,
      type: "WEBHOOK_RECEIVED",
      eventId: body.eventId,
      message: "Webhook received (shell; signature verification deferred).",
      metadata: { signatureValid: result.signatureValid, handled: result.handled },
    });
    return reply.code(200).send({ received: true, duplicate: false });
  });

  return app;
}
