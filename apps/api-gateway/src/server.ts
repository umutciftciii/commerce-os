import { createHash, randomBytes } from "node:crypto";
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
  productCreateRequestSchema,
  productListResponseSchema,
  productSchema,
  productUpdateRequestSchema,
  productVariantCreateRequestSchema,
  productVariantListResponseSchema,
  productVariantSchema,
  productVariantUpdateRequestSchema,
  publicCartRequestSchema,
  publicCartSchema,
  publicCheckoutRequestSchema,
  publicOrderConfirmationSchema,
  publicPaymentAvailabilitySchema,
  publicPaymentResultSchema,
  publicPaymentStateSchema,
  publicPaymentSubmitRequestSchema,
  publicProductDetailSchema,
  publicProductListResponseSchema,
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
import { registerShippingRatePlanRoutes } from "./shipping/rate-plan-routes.js";
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
  ProductPriceVisibility,
  ProductPrimaryAction,
  ProductSalesMode,
  ProductVariant,
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
  "id" | "storeId" | "name" | "slug" | "parentId" | "sortOrder" | "status" | "createdAt" | "updatedAt"
>;
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
  | "createdAt"
  | "updatedAt"
> & { categoryIds: string[] };
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
  | "currency"
  | "status"
  | "optionValues"
  | "shippingWeightKg"
  | "shippingDesi"
  | "createdAt"
  | "updatedAt"
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
>;
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

export interface AppDataAccess {
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
  createCategory(
    storeId: string,
    input: {
      name: string;
      slug: string;
      parentId?: string | null;
      sortOrder: number;
      status: "ACTIVE" | "ARCHIVED";
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
    },
  ): Promise<CategoryRecord | null>;
  listProducts(
    storeId: string,
    input: { limit: number; offset: number },
  ): Promise<{ data: ProductRecord[]; total: number }>;
  findProductById(storeId: string, productId: string): Promise<ProductRecord | null>;
  findProductBySlug(storeId: string, slug: string): Promise<ProductRecord | null>;
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
      shippingWeightKg?: number | null;
      shippingDesi?: number | null;
    },
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
      currency: string;
      status: "DRAFT" | "ACTIVE" | "ARCHIVED";
      optionValues?: Record<string, unknown> | null;
      lowStockThreshold?: number | null;
      shippingWeightKg?: number | null;
      shippingDesi?: number | null;
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
      currency?: string;
      status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
      optionValues?: Record<string, unknown> | null;
      lowStockThreshold?: number | null;
      shippingWeightKg?: number | null;
      shippingDesi?: number | null;
    },
  ): Promise<VariantRecord | null>;
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
      /** Opsiyonel demo indirim tutari (minor); verilmezse 0. */
      discountAmount?: number;
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
    OrderRecord | "CUSTOMER_NOT_FOUND" | "VARIANT_NOT_FOUND" | "INVALID_VARIANT" | ProductOrderValidationCode
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

function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
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

function serializeCategory(category: CategoryRecord) {
  return productCategorySchema.parse({
    ...category,
    parentId: category.parentId ?? null,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  });
}

function serializeProduct(product: ProductRecord) {
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
    optionValues: variant.optionValues ?? null,
    // F3C.2 — Decimal -> number.
    shippingWeightKg: decimalToNumber(variant.shippingWeightKg),
    shippingDesi: decimalToNumber(variant.shippingDesi),
    createdAt: variant.createdAt.toISOString(),
    updatedAt: variant.updatedAt.toISOString(),
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
  product: Pick<ProductRecord, "categoryIds">,
  categoryNames: Map<string, string>,
): string | null {
  const first = product.categoryIds.find((id) => categoryNames.has(id));
  return first ? (categoryNames.get(first) ?? null) : null;
}

function buildPublicVariant(
  product: Pick<ProductRecord, "priceVisibility">,
  variant: VariantRecord,
  stockByVariantId: Map<string, number>,
) {
  const visible = isPublicPriceVisible(product.priceVisibility);
  const available = stockByVariantId.has(variant.id) ? stockByVariantId.get(variant.id)! : null;
  return {
    id: variant.id,
    title: variant.title,
    sku: variant.sku,
    priceMinor: visible ? variant.priceMinor : null,
    compareAtMinor: visible ? (variant.compareAtMinor ?? null) : null,
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
) {
  return publicProductSchema.parse({
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
    variants: activeVariants.map((variant) => buildPublicVariant(product, variant, stockByVariantId)),
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
  productSlug: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  salesMode: ProductSalesMode;
  purchasable: boolean;
  priceVisibility: ProductPriceVisibility;
  priceMinor: number;
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

function buildPublicCartLine(entry: CartResolvableVariant, requestedQuantity: number) {
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
  return {
    ...base,
    availableQuantity,
    unitPriceMinor,
    lineTotalMinor: unitPriceMinor * availableQuantity,
    inStock,
    status,
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
 * Kupon: yalnizca DEMO_COUPON_CODE (DEMO10) %10 indirim uygular.
 *
 * F3C.2 — Kargo artik HARDCODED degildir; magaza kargo TARIFE planindan
 * hesaplanir (bkz. ADR-036, price-engine.ts). shipping parametresi quote
 * sonucunu tasir: includeInTotal=false ise (adres yok/plan yok/hata) kargo
 * grand total'a DAHIL EDILMEZ ve 0 gosterilir.
 * grandTotal = itemsSubtotal - discount + shipping.
 */
const CART_TAX_RATE_PERCENT = 20; // KDV (fiyatlara dahil)
const DEMO_COUPON_CODE = "DEMO10";
const DEMO_COUPON_RATE_PERCENT = 10;

interface CartSummaryShipping {
  shippingMinor: number;
  includeInTotal: boolean;
  freeThresholdMinor: number | null;
}

function computeCartSummary(
  subtotalMinor: number,
  currency: string,
  couponCode: string | null | undefined,
  shipping: CartSummaryShipping,
) {
  const code = couponCode?.trim().toUpperCase() || null;
  let discountMinor = 0;
  let couponStatus: "NONE" | "APPLIED" | "INVALID" = "NONE";
  if (code) {
    if (code === DEMO_COUPON_CODE && subtotalMinor > 0) {
      discountMinor = Math.round((subtotalMinor * DEMO_COUPON_RATE_PERCENT) / 100);
      couponStatus = "APPLIED";
    } else {
      couponStatus = "INVALID";
    }
  }
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
    couponCode: couponStatus === "NONE" ? null : code,
    couponStatus,
  };
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

function assemblePublicCart(
  storeSlug: string,
  index: Map<string, CartResolvableVariant>,
  items: Array<{ variantId: string; quantity: number }>,
  couponCode: string | null | undefined,
  shippingCtx: CartShippingContext,
) {
  const lines: PublicCartLineResult[] = [];
  for (const item of mergeCartItems(items)) {
    const entry = index.get(item.variantId);
    // Cozulemeyen referans (silinmis/pasif/baska store) sessizce dusurulur
    // (stale-cart reconciliation): yanit otoriterdir, istemci cookie'sini buna
    // gore yeniden yazar.
    if (!entry) continue;
    lines.push(buildPublicCartLine(entry, item.quantity));
  }
  const orderableCurrency = lines.find((line) => line.status !== "UNAVAILABLE")?.currency;
  const currency = orderableCurrency ?? lines[0]?.currency ?? "TRY";
  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const itemCount = lines.reduce(
    (sum, line) => sum + (line.status === "UNAVAILABLE" ? 0 : line.availableQuantity),
    0,
  );
  const checkoutReady = lines.length > 0 && lines.every((line) => line.status === "OK");

  // F3C.2/TODO-125 — Kargo ucreti store tarife planindan hesaplanir (provider quote
  // DEGIL). Her aktif plan bir SECENEK'tir; musteri secimi (requestedOptionId)
  // gecerliyse uygulanir, degilse guvenli varsayilan (default/en ucuz) secilir.
  const dims = computeCartDims(index, lines);
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

  // Kupon indirimi yalnizca checkout'a hazir (tum satirlar OK) sepete uygulanir;
  // aksi halde yanlis bir grand total gosterilmez.
  const summary = computeCartSummary(subtotalMinor, currency, checkoutReady ? couponCode : null, {
    shippingMinor: shippingOk ? quote.outcome.amountMinor ?? 0 : 0,
    includeInTotal: shippingOk,
    freeThresholdMinor: selectedPlan?.freeShippingThresholdMinor ?? null,
  });
  return publicCartSchema.parse({
    storeSlug,
    currency,
    lines,
    subtotalMinor,
    itemCount,
    checkoutReady,
    summary,
    shipping: {
      ...quote.response,
      options: optionsResult.options,
      selectedOptionId: optionsResult.selectedOptionId,
    },
  });
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
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.ProductCategorySelect;
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
    createdAt: true,
    updatedAt: true,
    assignments: { select: { categoryId: true }, orderBy: { createdAt: "asc" } },
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
    currency: true,
    status: true,
    optionValues: true,
    shippingWeightKg: true,
    shippingDesi: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.ProductVariantSelect;
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
  } satisfies Prisma.OrderSelect;

  function withCategoryIds(product: Prisma.ProductGetPayload<{ select: typeof productSelect }>): ProductRecord {
    return { ...product, categoryIds: product.assignments.map((assignment) => assignment.categoryId) };
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
      const product = await prisma.product.findFirst({ where: { id: productId, storeId }, select: productSelect });
      return product ? withCategoryIds(product) : null;
    },
    findProductBySlug: async (storeId, slug) => {
      const product = await prisma.product.findUnique({ where: { storeId_slug: { storeId, slug } }, select: productSelect });
      return product ? withCategoryIds(product) : null;
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
          },
          select: productSelect,
        });
        if (input.categoryIds.length > 0) {
          await transaction.productCategoryAssignment.createMany({
            data: input.categoryIds.map((categoryId) => ({ storeId, productId: product.id, categoryId })),
            skipDuplicates: true,
          });
        }
        const reloaded = await transaction.product.findUniqueOrThrow({ where: { id: product.id }, select: productSelect });
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
        const product = await transaction.product.findUniqueOrThrow({ where: { id: productId }, select: productSelect });
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
        return variant;
      }),
    updateVariant: async (storeId, productId, variantId, input) => {
      try {
        const { lowStockThreshold, ...variantInput } = input;
        return await prisma.$transaction(async (transaction: TransactionClient) => {
          const variant = await transaction.productVariant.update({
            where: { id: variantId, storeId, productId },
            data: {
              ...variantInput,
              barcode: variantInput.barcode === undefined ? undefined : variantInput.barcode,
              compareAtMinor:
                variantInput.compareAtMinor === undefined ? undefined : variantInput.compareAtMinor,
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
          return variant;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return null;
        }
        throw error;
      }
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
    createOrder: (storeId, input) =>
      prisma.$transaction(async (transaction: TransactionClient) => {
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
        return (await reloadOrder(transaction, storeId, order.id))!;
      }),
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
          data: { quantity: input.quantity, totalAmount },
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
    const [products, categoryNames, stockMap] = await Promise.all([
      loadActivePublicProducts(store.id),
      loadPublicCategoryNames(store.id),
      loadPublicStockMap(store.id),
    ]);
    const slice = products.slice(pagination.offset, pagination.offset + pagination.limit);
    const data = await Promise.all(
      slice.map(async (product) =>
        buildPublicProduct(
          product,
          await loadActivePublicVariants(store.id, product.id),
          categoryNames,
          stockMap,
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
    const [categoryNames, stockMap] = await Promise.all([
      loadPublicCategoryNames(store.id),
      loadPublicStockMap(store.id),
    ]);
    const variants = await loadActivePublicVariants(store.id, product.id);
    const summary = buildPublicProduct(product, variants, categoryNames, stockMap);
    const related = await Promise.all(
      products
        .filter((item) => item.id !== product.id)
        .slice(0, 4)
        .map(async (item) =>
          buildPublicProduct(
            item,
            await loadActivePublicVariants(store.id, item.id),
            categoryNames,
            stockMap,
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
            productSlug: product.slug,
            productTitle: product.title,
            variantTitle: variant.title,
            sku: variant.sku,
            salesMode: product.salesMode,
            purchasable: product.purchasable,
            priceVisibility: product.priceVisibility,
            priceMinor: variant.priceMinor,
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
    return assemblePublicCart(store.slug, index, body.items, body.couponCode ?? null, {
      plans,
      providerDisplays,
      address,
      addressKnown,
      requestedOptionId: body.shippingOptionId ?? null,
    });
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
    const cart = assemblePublicCart(store.slug, index, body.items, body.couponCode ?? null, {
      plans,
      providerDisplays,
      address: checkoutAddress,
      addressKnown: true,
      requestedOptionId,
    });
    if (!cart.checkoutReady) {
      return reply.code(409).send(errorBody("CART_NOT_READY", "Cart contains unavailable items.", cart));
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
  registerCustomerRoutes(app, { config, customers, logger, resolvePublicStore });
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

  // F3C.2 — Shipping price engine: store kargo TARIFE plani uclari (CRUD + kurallar
  // + set-default). Kargo ucreti bu planlardan hesaplanir; provider canli quote DEGIL.
  registerShippingRatePlanRoutes(app, {
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
      data: categories.data.map(serializeCategory),
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
    return reply.code(201).send(serializeCategory(category));
  });

  app.get("/stores/:storeId/categories/:categoryId", async (request, reply) => {
    const params = categoryParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const category = await dataAccess.findCategoryById(params.storeId, params.categoryId);
    if (!category) return reply.code(404).send(errorBody("CATEGORY_NOT_FOUND", "Category not found."));
    return serializeCategory(category);
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
    return serializeCategory(category);
  });

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

  app.get("/stores/:storeId/products", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const pagination = paginationQuerySchema.parse(request.query);
    const products = await dataAccess.listProducts(params.storeId, pagination);
    return productListResponseSchema.parse({
      data: products.data.map(serializeProduct),
      pagination: { ...pagination, total: products.total },
    });
  });

  app.post("/stores/:storeId/products", async (request, reply) => {
    const params = storeParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = productCreateRequestSchema.parse(request.body);
    const categoryIds = await validateCategoryIds(reply, params.storeId, input.categoryIds);
    if (!categoryIds) return;
    if (await dataAccess.findProductBySlug(params.storeId, input.slug)) {
      return reply.code(409).send(errorBody("PRODUCT_SLUG_EXISTS", "Product slug already exists."));
    }
    let product: ProductRecord;
    try {
      product = await dataAccess.createProduct(params.storeId, { ...input, categoryIds });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        return reply.code(409).send(errorBody("PRODUCT_SLUG_EXISTS", "Product slug already exists."));
      }
      throw error;
    }
    await dataAccess.createAuditLog({
      action: "CREATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "Product",
      entityId: product.id,
      metadata: { fields: Object.keys(input) },
    });
    return reply.code(201).send(serializeProduct(product));
  });

  app.get("/stores/:storeId/products/:productId", async (request, reply) => {
    const params = productParamSchema.parse(request.params);
    const access = await requireStorePlatformAdmin(request, reply, params.storeId);
    if (!access) return;
    const product = await dataAccess.findProductById(params.storeId, params.productId);
    if (!product) return reply.code(404).send(errorBody("PRODUCT_NOT_FOUND", "Product not found."));
    return serializeProduct(product);
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
    const product = await dataAccess.updateProduct(params.storeId, params.productId, {
      ...input,
      ...(categoryIds === undefined ? {} : { categoryIds }),
    });
    if (!product) return reply.code(404).send(errorBody("PRODUCT_NOT_FOUND", "Product not found."));
    await dataAccess.createAuditLog({
      action: "UPDATE",
      platformUserId: access.session.platformUser.id,
      storeId: params.storeId,
      entityType: "Product",
      entityId: product.id,
      metadata: { fields: Object.keys(input) },
    });
    return serializeProduct(product);
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
    if (!(await dataAccess.findProductById(params.storeId, params.productId))) {
      return reply.code(404).send(errorBody("PRODUCT_NOT_FOUND", "Product not found."));
    }
    const input = productVariantCreateRequestSchema.parse(request.body);
    if (await dataAccess.findVariantBySku(params.storeId, input.sku)) {
      return reply.code(409).send(errorBody("VARIANT_SKU_EXISTS", "Variant SKU already exists."));
    }
    let variant: VariantRecord;
    try {
      variant = await dataAccess.createVariant(params.storeId, params.productId, input);
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        return reply.code(409).send(errorBody("VARIANT_SKU_EXISTS", "Variant SKU already exists."));
      }
      throw error;
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
    const rawInput = productVariantUpdateRequestSchema.parse(request.body);
    const candidatePrice = rawInput.priceMinor ?? current.priceMinor;
    if (rawInput.compareAtMinor !== undefined && rawInput.compareAtMinor !== null && rawInput.compareAtMinor < candidatePrice) {
      return reply.code(400).send(errorBody("VALIDATION_ERROR", "compareAtMinor must be greater than or equal to priceMinor."));
    }
    if (rawInput.sku) {
      const existing = await dataAccess.findVariantBySku(params.storeId, rawInput.sku);
      if (existing && existing.id !== params.variantId) {
        return reply.code(409).send(errorBody("VARIANT_SKU_EXISTS", "Variant SKU already exists."));
      }
    }
    const variant = await dataAccess.updateVariant(params.storeId, params.productId, params.variantId, rawInput);
    if (!variant) return reply.code(404).send(errorBody("VARIANT_NOT_FOUND", "Variant not found."));
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
