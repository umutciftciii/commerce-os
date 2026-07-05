import { hashPassword } from "@commerce-os/auth";
import {
  Prisma,
  type AuditAction,
  type InventoryMovementType,
  type PlatformUserRole,
  type ProductCategoryStatus,
  type ProductPriceVisibility,
  type ProductPrimaryAction,
  type ProductSalesMode,
  type ProductStatus,
  type ProductType,
  type ProductVariantStatus,
  type StoreStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  type AppDataAccess,
  type PaymentAttemptCreateInput,
  type PaymentAttemptOutcomeInput,
  type PaymentAttemptRecord,
  type PaymentProviderConfigCreateInput,
  type PaymentProviderConfigRecord,
  type PaymentProviderConfigUpdateInput,
  type PaymentProviderEventCreateInput,
  type PaymentProviderEventRecord,
  createServer,
} from "../src/server.js";
import type { EngineRatePlan } from "../src/shipping/price-engine.js";
import type { ProviderDisplayMap } from "../src/shipping/checkout-options.js";
import type { CustomerDataAccess } from "../src/customers/index.js";
import type { PaymentProviderStatus, PaymentProviderType } from "@prisma/client";
// F4A — Kampanya/kupon bellek deposu icin kayit tipleri + motor donusumleri.
import {
  isAllowedStatusTransition,
  toEngineCampaign,
  toEngineCoupon,
  type CampaignRecord,
  type OrderDiscountInput,
} from "../src/campaigns/data.js";
import type { CampaignCreateRequest, CampaignUpdateRequest } from "@commerce-os/contracts";
import { deriveIsPublicFromAccessModel } from "@commerce-os/contracts";

const config = {
  APP_ENV: "test" as const,
  SERVICE_NAME: "api-gateway-test",
  LOG_LEVEL: "error" as const,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  INTERNAL_API_TOKEN: "test-internal-token",
  SESSION_SECRET: "test-session-secret-with-enough-length",
  SESSION_TTL_SECONDS: 3600,
  PASSWORD_HASH_PEPPER: "test-pepper",
  ADMIN_AUTH_COOKIE_NAME: "commerce_os_admin_session",
  AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: 60,
  AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: 2,
  API_GATEWAY_PORT: 3000,
  WORKER_CONCURRENCY: 5,
  PAYMENT_SANDBOX_HTTP_ENABLED: false,
};

type UserRecord = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  role: PlatformUserRole;
};

type StoreRecord = {
  id: string;
  name: string;
  slug: string;
  status: StoreStatus;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  domain?: string | null;
};

type PlanRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

type AuditRecord = {
  action: AuditAction;
  platformUserId?: string;
  storeId?: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

type CategoryRecord = {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  status: ProductCategoryStatus;
  createdAt: Date;
  updatedAt: Date;
};

type ProductRecord = {
  id: string;
  storeId: string;
  title: string;
  slug: string;
  description: string | null;
  status: ProductStatus;
  type: ProductType;
  vendor: string | null;
  brand: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  salesMode: ProductSalesMode;
  priceVisibility: ProductPriceVisibility;
  primaryAction: ProductPrimaryAction;
  inquiryEnabled: boolean;
  appointmentRequired: boolean;
  whatsappEnabled: boolean;
  purchasable: boolean;
  minOrderQuantity: number;
  maxOrderQuantity: number | null;
  callToActionLabel: string | null;
  whatsappMessageTemplate: string | null;
  inquiryFormTitle: string | null;
  appointmentNote: string | null;
  categoryIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

type VariantRecord = {
  id: string;
  productId: string;
  storeId: string;
  title: string;
  sku: string;
  barcode: string | null;
  priceMinor: number;
  compareAtMinor: number | null;
  costMinor: number | null;
  currency: string;
  status: ProductVariantStatus;
  optionValues: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

// F4B — Fiyat/liste/maliyet degisikligi audit kaydi (mock).
type PriceChangeRecord = {
  id: string;
  storeId: string;
  productId: string;
  variantId: string;
  changedByPlatformUserId: string | null;
  currency: string;
  oldPriceMinor: number | null;
  newPriceMinor: number | null;
  oldCompareAtMinor: number | null;
  newCompareAtMinor: number | null;
  oldCostMinor: number | null;
  newCostMinor: number | null;
  source: "ADMIN_EDIT" | "IMPORT" | "API";
  reason: string | null;
  createdAt: Date;
};

type InventoryRecord = {
  id: string;
  storeId: string;
  variantId: string;
  productId: string;
  sku: string;
  title: string;
  quantityOnHand: number;
  quantityReserved: number;
  lowStockThreshold: number | null;
  updatedAt: Date;
};

type MovementRecord = {
  id: string;
  storeId: string;
  variantId: string;
  type: InventoryMovementType;
  quantityDelta: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  actorUserId: string | null;
  createdAt: Date;
};

type OrderLineRecord = {
  id: string;
  storeId: string;
  orderId: string;
  productId: string;
  variantId: string;
  sku: string;
  title: string;
  variantTitle: string;
  quantity: number;
  unitPriceAmount: number;
  totalAmount: number;
  currency: string;
  createdAt: Date;
};

type ReservationRecord = {
  id: string;
  storeId: string;
  orderId: string;
  orderLineId: string;
  variantId: string;
  quantity: number;
  status: "ACTIVE" | "RELEASED" | "CONSUMED";
  expiresAt: Date | null;
  releasedAt: Date | null;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type EventRecord = {
  id: string;
  storeId: string;
  orderId: string;
  type: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  actorUserId: string | null;
  createdAt: Date;
};

type OrderRecord = {
  id: string;
  storeId: string;
  orderNumber: string;
  customerId: string | null;
  customerEmail: string;
  currency: string;
  status: "DRAFT" | "PLACED" | "CONFIRMED" | "CANCELLED" | "FULFILLED";
  paymentStatus: "UNPAID" | "AUTHORIZED" | "PAID" | "REFUNDED";
  fulfillmentStatus: "UNFULFILLED" | "PARTIAL" | "FULFILLED" | "CANCELLED";
  subtotalAmount: number;
  discountAmount: number;
  shippingAmount: number;
  taxAmount: number;
  totalAmount: number;
  placedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: OrderLineRecord[];
  addresses: Array<{
    id: string;
    storeId: string;
    orderId: string;
    type: "SHIPPING" | "BILLING";
    fullName: string;
    phone: string | null;
    countryCode: string;
    city: string;
    district: string | null;
    addressLine1: string;
    addressLine2: string | null;
    postalCode: string | null;
  }>;
  reservations: ReservationRecord[];
  events: EventRecord[];
};

class MemoryDataAccess implements AppDataAccess {
  throwStoreUniqueTarget: string | null = null;
  throwPlanUnique = false;
  readonly users: UserRecord[];
  readonly sessions = new Map<
    string,
    { id: string; platformUserId: string; tokenHash: string; expiresAt: Date; revokedAt: Date | null }
  >();
  readonly stores: StoreRecord[] = [
    {
      id: "store_demo",
      name: "Demo Store",
      slug: "demo-store",
      status: "ACTIVE",
      metadata: { seeded: true },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      domain: "demo.localhost",
    },
  ];
  readonly domains = new Map<string, string>([["demo.localhost", "store_demo"]]);
  readonly plans: PlanRecord[] = [
    {
      id: "plan_demo",
      code: "demo",
      name: "Demo Plan",
      description: "Seeded demo plan for local development.",
      metadata: { seeded: true },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];
  readonly categories: CategoryRecord[] = [
    {
      id: "cat_apparel",
      storeId: "store_demo",
      name: "Apparel",
      slug: "apparel",
      parentId: null,
      sortOrder: 10,
      status: "ACTIVE",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];
  readonly products: ProductRecord[] = [
    {
      id: "product_hoodie",
      storeId: "store_demo",
      title: "Demo Hoodie",
      slug: "demo-hoodie",
      description: "Seeded hoodie product.",
      status: "ACTIVE",
      type: "PHYSICAL",
      vendor: null,
      brand: "Commerce OS",
      seoTitle: null,
      seoDescription: null,
      salesMode: "ONLINE",
      priceVisibility: "VISIBLE",
      primaryAction: "ADD_TO_CART",
      inquiryEnabled: false,
      appointmentRequired: false,
      whatsappEnabled: false,
      purchasable: true,
      minOrderQuantity: 1,
      maxOrderQuantity: null,
      callToActionLabel: null,
      whatsappMessageTemplate: null,
      inquiryFormTitle: null,
      appointmentNote: null,
      categoryIds: ["cat_apparel"],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];
  readonly variants: VariantRecord[] = [
    {
      id: "variant_hoodie_m",
      productId: "product_hoodie",
      storeId: "store_demo",
      title: "Black / M",
      sku: "DEMO-HOODIE-BLK-M",
      barcode: null,
      priceMinor: 129900,
      compareAtMinor: 149900,
      costMinor: null,
      currency: "TRY",
      status: "ACTIVE",
      optionValues: { color: "Black", size: "M" },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];
  // F4B — Fiyat degisikligi audit gecmisi (mock store).
  readonly priceChanges: PriceChangeRecord[] = [];
  readonly inventory: InventoryRecord[] = [
    {
      id: "inventory_hoodie_m",
      storeId: "store_demo",
      variantId: "variant_hoodie_m",
      productId: "product_hoodie",
      sku: "DEMO-HOODIE-BLK-M",
      title: "Black / M",
      quantityOnHand: 15,
      quantityReserved: 0,
      lowStockThreshold: 10,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];
  readonly movements: MovementRecord[] = [];
  readonly orders: OrderRecord[] = [];
  // F4A — Kampanya/kupon bellek deposu + siparis indirim snapshot/redemption kayitlari.
  readonly campaigns: CampaignRecord[] = [];
  readonly orderDiscounts: Array<
    OrderDiscountInput & { id: string; storeId: string; orderId: string }
  > = [];
  readonly campaignRedemptions: Array<{
    id: string;
    storeId: string;
    campaignId: string;
    couponId: string | null;
    orderId: string;
    customerId: string | null;
    email: string | null;
    discountAmountMinor: number;
    createdAt: Date;
  }> = [];
  // F3B.3 — store-admin müşteri dizini için bellek seed'i (güvenli alanlar).
  readonly customers: Array<{
    id: string;
    storeId: string;
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
  }> = [
    {
      id: "cust_member",
      storeId: "store_demo",
      email: "member@example.local",
      phone: "+905551112233",
      firstName: "Ayşe",
      lastName: "Yılmaz",
      status: "ACTIVE",
      emailVerifiedAt: new Date("2026-02-01T00:00:00.000Z"),
      phoneVerifiedAt: null,
      hasCredential: true,
      orderCount: 2,
      totalSpentMinor: 259800,
      currency: "TRY",
      lastOrderAt: new Date("2026-06-01T00:00:00.000Z"),
      addressCount: 1,
      defaultAddressSummary: "İstanbul, Kadıköy",
      createdAt: new Date("2026-01-15T00:00:00.000Z"),
    },
    {
      id: "cust_guest",
      storeId: "store_demo",
      email: "guest@example.local",
      phone: null,
      firstName: null,
      lastName: null,
      status: "ACTIVE",
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      hasCredential: false,
      orderCount: 0,
      totalSpentMinor: 0,
      currency: "TRY",
      lastOrderAt: null,
      addressCount: 0,
      defaultAddressSummary: null,
      createdAt: new Date("2026-03-20T00:00:00.000Z"),
    },
    {
      id: "cust_other_store",
      storeId: "store_other",
      email: "other@example.local",
      phone: null,
      firstName: "Other",
      lastName: "Tenant",
      status: "ACTIVE",
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      hasCredential: true,
      orderCount: 1,
      totalSpentMinor: 99900,
      currency: "TRY",
      lastOrderAt: new Date("2026-05-01T00:00:00.000Z"),
      addressCount: 1,
      defaultAddressSummary: "İzmir, Konak",
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
    },
  ];
  orderSequence = 1;
  readonly auditLogs: AuditRecord[] = [];
  readonly paymentProviderConfigs: PaymentProviderConfigRecord[] = [];
  readonly paymentAttempts: PaymentAttemptRecord[] = [];
  readonly paymentProviderEvents: PaymentProviderEventRecord[] = [];
  paymentSequence = 1;

  constructor(passwordHash: string) {
    this.users = [
      {
        id: "platform_1",
        email: "platform-admin@example.local",
        name: "Demo Platform Admin",
        passwordHash,
        role: "SUPER_ADMIN",
      },
    ];
  }

  async findPlatformUserByEmail(email: string) {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async createPlatformSession(input: {
    platformUserId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    const session = {
      id: `session_${this.sessions.size + 1}`,
      platformUserId: input.platformUserId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.sessions.set(input.tokenHash, session);
    return { id: session.id, expiresAt: session.expiresAt };
  }

  async findPlatformSessionByTokenHash(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    const user = session ? this.users.find((item) => item.id === session.platformUserId) : null;
    return session && user ? { ...session, platformUser: user } : null;
  }

  async revokePlatformSession(sessionId: string) {
    for (const session of this.sessions.values()) {
      if (session.id === sessionId) {
        session.revokedAt = new Date();
        return true;
      }
    }
    return false;
  }

  async listStores({ limit, offset }: { limit: number; offset: number }) {
    return {
      data: this.stores.slice(offset, offset + limit).map((store) => ({
        ...store,
        domain: store.domain ?? [...this.domains.entries()].find(([, storeId]) => storeId === store.id)?.[0] ?? null,
      })),
      total: this.stores.length,
    };
  }

  async findStoreById(id: string) {
    const store = this.stores.find((item) => item.id === id);
    return store
      ? {
          ...store,
          domain: store.domain ?? [...this.domains.entries()].find(([, storeId]) => storeId === store.id)?.[0] ?? null,
        }
      : null;
  }

  async findStoreBySlug(slug: string) {
    return this.stores.find((store) => store.slug === slug) ?? null;
  }

  async findStoreDomain(domain: string) {
    const storeId = this.domains.get(domain);
    return storeId ? { id: storeId } : null;
  }

  async createStore(input: {
    name: string;
    slug: string;
    status: StoreStatus;
    domain?: string;
    metadata?: Record<string, unknown>;
  }) {
    if (this.throwStoreUniqueTarget) {
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: [this.throwStoreUniqueTarget] },
      });
    }

    const store = {
      id: `store_${this.stores.length + 1}`,
      name: input.name,
      slug: input.slug,
      status: input.status,
      metadata: input.metadata ?? null,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      domain: input.domain ?? null,
    };
    this.stores.push(store);
    if (input.domain) {
      this.domains.set(input.domain, store.id);
    }
    return store;
  }

  async updateStore(
    id: string,
    input: { name?: string; status?: StoreStatus; metadata?: Record<string, unknown> },
  ) {
    const store = this.stores.find((item) => item.id === id);
    if (!store) {
      return null;
    }
    Object.assign(store, input, { updatedAt: new Date("2026-01-03T00:00:00.000Z") });
    return store;
  }

  async listPlans({ limit, offset }: { limit: number; offset: number }) {
    return { data: this.plans.slice(offset, offset + limit), total: this.plans.length };
  }

  async findPlanById(id: string) {
    return this.plans.find((plan) => plan.id === id) ?? null;
  }

  async findPlanByCode(code: string) {
    return this.plans.find((plan) => plan.code === code) ?? null;
  }

  async createPlan(input: {
    code: string;
    name: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }) {
    if (this.throwPlanUnique) {
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["code"] },
      });
    }

    const plan = {
      id: `plan_${this.plans.length + 1}`,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      metadata: input.metadata ?? null,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    };
    this.plans.push(plan);
    return plan;
  }

  async updatePlan(
    id: string,
    input: { name?: string; description?: string | null; metadata?: Record<string, unknown> },
  ) {
    const plan = this.plans.find((item) => item.id === id);
    if (!plan) {
      return null;
    }
    Object.assign(plan, input, { updatedAt: new Date("2026-01-03T00:00:00.000Z") });
    return plan;
  }

  async listCategories(storeId: string, { limit, offset }: { limit: number; offset: number }) {
    const data = this.categories.filter((category) => category.storeId === storeId);
    return { data: data.slice(offset, offset + limit), total: data.length };
  }

  async findCategoryById(storeId: string, categoryId: string) {
    return this.categories.find((category) => category.storeId === storeId && category.id === categoryId) ?? null;
  }

  async findCategoryBySlug(storeId: string, slug: string) {
    return this.categories.find((category) => category.storeId === storeId && category.slug === slug) ?? null;
  }

  async createCategory(
    storeId: string,
    input: { name: string; slug: string; parentId?: string | null; sortOrder: number; status: ProductCategoryStatus },
  ) {
    const category = {
      id: `cat_${this.categories.length + 1}`,
      storeId,
      name: input.name,
      slug: input.slug,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder,
      status: input.status,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    };
    this.categories.push(category);
    return category;
  }

  async updateCategory(
    storeId: string,
    categoryId: string,
    input: { name?: string; slug?: string; parentId?: string | null; sortOrder?: number; status?: ProductCategoryStatus },
  ) {
    const category = this.categories.find((item) => item.storeId === storeId && item.id === categoryId);
    if (!category) return null;
    Object.assign(category, input, { updatedAt: new Date("2026-01-03T00:00:00.000Z") });
    return category;
  }

  async listProducts(storeId: string, { limit, offset }: { limit: number; offset: number }) {
    const data = this.products.filter((product) => product.storeId === storeId);
    return { data: data.slice(offset, offset + limit), total: data.length };
  }

  async findProductById(storeId: string, productId: string) {
    return this.products.find((product) => product.storeId === storeId && product.id === productId) ?? null;
  }

  async findProductBySlug(storeId: string, slug: string) {
    return this.products.find((product) => product.storeId === storeId && product.slug === slug) ?? null;
  }

  async createProduct(
    storeId: string,
    input: {
      title: string;
      slug: string;
      description?: string | null;
      status: ProductStatus;
      type: ProductType;
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
    },
  ) {
    const product = {
      id: `product_${this.products.length + 1}`,
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
      categoryIds: input.categoryIds,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    };
    this.products.push(product);
    return product;
  }

  async updateProduct(
    storeId: string,
    productId: string,
    input: Partial<Omit<ProductRecord, "id" | "storeId" | "createdAt" | "updatedAt">>,
  ) {
    const product = this.products.find((item) => item.storeId === storeId && item.id === productId);
    if (!product) return null;
    Object.assign(product, input, { updatedAt: new Date("2026-01-03T00:00:00.000Z") });
    return product;
  }

  async listVariants(storeId: string, productId: string, { limit, offset }: { limit: number; offset: number }) {
    const data = this.variants.filter((variant) => variant.storeId === storeId && variant.productId === productId);
    return { data: data.slice(offset, offset + limit), total: data.length };
  }

  async findVariantById(storeId: string, productId: string, variantId: string) {
    return (
      this.variants.find(
        (variant) => variant.storeId === storeId && variant.productId === productId && variant.id === variantId,
      ) ?? null
    );
  }

  async findVariantBySku(storeId: string, sku: string) {
    return this.variants.find((variant) => variant.storeId === storeId && variant.sku === sku) ?? null;
  }

  async createVariant(
    storeId: string,
    productId: string,
    input: {
      title: string;
      sku: string;
      barcode?: string | null;
      priceMinor: number;
      compareAtMinor?: number | null;
      costMinor?: number | null;
      currency: string;
      status: ProductVariantStatus;
      optionValues?: Record<string, unknown> | null;
      lowStockThreshold?: number | null;
      changedByPlatformUserId?: string | null;
      priceChangeSource?: "ADMIN_EDIT" | "IMPORT" | "API";
    },
  ) {
    const variant: VariantRecord = {
      id: `variant_${this.variants.length + 1}`,
      productId,
      storeId,
      title: input.title,
      sku: input.sku,
      barcode: input.barcode ?? null,
      priceMinor: input.priceMinor,
      compareAtMinor: input.compareAtMinor ?? null,
      costMinor: input.costMinor ?? null,
      currency: input.currency,
      status: input.status,
      optionValues: input.optionValues ?? null,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    };
    this.variants.push(variant);
    this.inventory.push({
      id: `inventory_${this.inventory.length + 1}`,
      storeId,
      variantId: variant.id,
      productId,
      sku: variant.sku,
      title: variant.title,
      quantityOnHand: 0,
      quantityReserved: 0,
      lowStockThreshold: input.lowStockThreshold ?? null,
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });
    // F4B — Baslangic fiyat audit'i.
    this.priceChanges.push({
      id: `price_change_${this.priceChanges.length + 1}`,
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
      reason: null,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    });
    return variant;
  }

  async updateVariant(
    storeId: string,
    productId: string,
    variantId: string,
    input: Partial<Omit<VariantRecord, "id" | "storeId" | "productId" | "createdAt" | "updatedAt">> & {
      lowStockThreshold?: number | null;
      changedByPlatformUserId?: string | null;
      priceChangeSource?: "ADMIN_EDIT" | "IMPORT" | "API";
      priceChangeReason?: string | null;
    },
  ) {
    const variant = this.variants.find(
      (item) => item.storeId === storeId && item.productId === productId && item.id === variantId,
    );
    if (!variant) return null;
    const { lowStockThreshold, changedByPlatformUserId, priceChangeSource, priceChangeReason, ...variantInput } = input;
    const before = { priceMinor: variant.priceMinor, compareAtMinor: variant.compareAtMinor, costMinor: variant.costMinor };
    Object.assign(variant, variantInput, { updatedAt: new Date("2026-01-03T00:00:00.000Z") });
    const item = this.inventory.find((inventory) => inventory.storeId === storeId && inventory.variantId === variantId);
    if (item && lowStockThreshold !== undefined) item.lowStockThreshold = lowStockThreshold;
    // F4B — Fiyat/liste/maliyetten biri degistiyse audit yaz.
    const priceChanged =
      before.priceMinor !== variant.priceMinor ||
      (before.compareAtMinor ?? null) !== (variant.compareAtMinor ?? null) ||
      (before.costMinor ?? null) !== (variant.costMinor ?? null);
    if (priceChanged) {
      this.priceChanges.push({
        id: `price_change_${this.priceChanges.length + 1}`,
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
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
      });
    }
    return variant;
  }

  async listPriceChanges(storeId: string, variantId: string, { limit, offset }: { limit: number; offset: number }) {
    const data = this.priceChanges
      .filter((change) => change.storeId === storeId && change.variantId === variantId)
      .slice()
      .reverse();
    return { data: data.slice(offset, offset + limit), total: data.length };
  }

  async lowestRecentPriceByStore(storeId: string, sinceDays: number) {
    const since = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    const result = new Map<string, number>();
    for (const change of this.priceChanges) {
      if (change.storeId !== storeId || change.newPriceMinor == null) continue;
      if (change.createdAt.getTime() < since) continue;
      const current = result.get(change.variantId);
      if (current === undefined || change.newPriceMinor < current) result.set(change.variantId, change.newPriceMinor);
    }
    return result;
  }

  async listInventory(storeId: string, { limit, offset }: { limit: number; offset: number }) {
    const data = this.inventory.filter((item) => item.storeId === storeId);
    return { data: data.slice(offset, offset + limit), total: data.length };
  }

  async findInventoryByVariantId(storeId: string, variantId: string) {
    return this.inventory.find((item) => item.storeId === storeId && item.variantId === variantId) ?? null;
  }

  async adjustInventory(
    storeId: string,
    variantId: string,
    input: {
      quantityDelta: number;
      reason?: string;
      referenceType?: string;
      referenceId?: string;
      actorUserId?: string;
    },
  ) {
    const item = this.inventory.find((inventory) => inventory.storeId === storeId && inventory.variantId === variantId);
    if (!item) return null;
    const nextOnHand = item.quantityOnHand + input.quantityDelta;
    if (nextOnHand < 0) return "NEGATIVE_STOCK" as const;
    item.quantityOnHand = nextOnHand;
    item.updatedAt = new Date("2026-01-04T00:00:00.000Z");
    const movement = {
      id: `movement_${this.movements.length + 1}`,
      storeId,
      variantId,
      type: "ADJUSTMENT" as const,
      quantityDelta: input.quantityDelta,
      reason: input.reason ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      actorUserId: input.actorUserId ?? null,
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
    };
    this.movements.push(movement);
    return { item, movement };
  }

  orderTotals(
    lines: Array<{ totalAmount: number }>,
    extras: { discountAmount?: number; shippingAmount?: number } = {},
  ) {
    const subtotalAmount = lines.reduce((sum, line) => sum + line.totalAmount, 0);
    const discountAmount = Math.max(0, Math.min(extras.discountAmount ?? 0, subtotalAmount));
    const shippingAmount = Math.max(0, extras.shippingAmount ?? 0);
    return {
      subtotalAmount,
      discountAmount,
      shippingAmount,
      taxAmount: 0,
      totalAmount: Math.max(0, subtotalAmount - discountAmount + shippingAmount),
    };
  }

  productSalesError(product: ProductRecord, quantity: number) {
    if (product.salesMode === "INQUIRY") return "PRODUCT_REQUIRES_INQUIRY" as const;
    if (product.salesMode === "APPOINTMENT") return "PRODUCT_REQUIRES_APPOINTMENT" as const;
    if (product.salesMode === "WHATSAPP") return "PRODUCT_REQUIRES_WHATSAPP" as const;
    if (product.salesMode === "CATALOG_ONLY") return "PRODUCT_CATALOG_ONLY" as const;
    if (!product.purchasable || product.priceVisibility === "HIDDEN" || product.priceVisibility === "ON_REQUEST") {
      return "PRODUCT_NOT_PURCHASABLE" as const;
    }
    if (quantity < product.minOrderQuantity) return "PRODUCT_ORDER_QUANTITY_OUT_OF_RANGE" as const;
    if (product.maxOrderQuantity !== null && quantity > product.maxOrderQuantity) {
      return "PRODUCT_ORDER_QUANTITY_OUT_OF_RANGE" as const;
    }
    return null;
  }

  async listOrders(
    storeId: string,
    {
      limit,
      offset,
      status,
      paymentStatus,
      fulfillmentStatus,
      search,
      dateFrom,
      dateTo,
    }: {
      limit: number;
      offset: number;
      status?: string;
      paymentStatus?: string;
      fulfillmentStatus?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    // TODO-073 — Gerçek prisma where ile aynı daraltma davranışını taklit eder.
    const fromTs = dateFrom ? Date.parse(`${dateFrom}T00:00:00.000Z`) : undefined;
    const toTs = dateTo ? Date.parse(`${dateTo}T23:59:59.999Z`) : undefined;
    const needle = search?.toLowerCase();
    const matched = this.orders.filter((order) => {
      if (order.storeId !== storeId) return false;
      if (status && order.status !== status) return false;
      if (paymentStatus && order.paymentStatus !== paymentStatus) return false;
      if (fulfillmentStatus && order.fulfillmentStatus !== fulfillmentStatus) return false;
      const createdTs = new Date(order.createdAt).getTime();
      if (fromTs !== undefined && createdTs < fromTs) return false;
      if (toTs !== undefined && createdTs > toTs) return false;
      if (needle) {
        const customer = this.customers.find((c) => c.id === order.customerId);
        const haystack = [
          order.orderNumber,
          order.customerEmail,
          customer?.firstName ?? "",
          customer?.lastName ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    return { data: matched.slice(offset, offset + limit), total: matched.length };
  }

  async listCustomers(storeId: string, { limit, offset }: { limit: number; offset: number }) {
    const matched = this.customers.filter((customer) => customer.storeId === storeId);
    // serializeStoreAdminCustomer zod ile parse eder; fazladan storeId alanı düşer.
    const data = matched.slice(offset, offset + limit);
    return { data, total: matched.length };
  }

  async findOrderById(storeId: string, orderId: string) {
    return this.orders.find((order) => order.storeId === storeId && order.id === orderId) ?? null;
  }

  // F3C.2 — In-memory kargo TARİFE planı (seed ile aynı: FREE_THRESHOLD 4990 / 75000).
  // Testler bunu null'layarak NO_RATE_PLAN, ya da değiştirerek diğer modları sınar.
  shippingRatePlan: EngineRatePlan | null = {
    id: "ratePlan_demo",
    name: "Standart Kargo",
    provider: null,
    status: "ACTIVE",
    isDefault: true,
    pricingMode: "FREE_THRESHOLD",
    currency: "TRY",
    fixedAmountMinor: 4990,
    freeShippingThresholdMinor: 75000,
    deliveryEstimate: null,
    validFrom: null,
    validTo: null,
    rules: [],
  };
  // Müşteri default teslimat adresi (cart quote için); guest senaryoda null.
  defaultShippingAddress: { city: string; district: string | null } | null = null;

  async resolveActiveShippingRatePlan(storeId: string): Promise<EngineRatePlan | null> {
    return storeId === "store_demo" ? this.shippingRatePlan : null;
  }

  // TODO-125 — Cogul kargo secenek testleri icin ayarlanabilir aktif plan listesi.
  // null ise tek-plan davranisina (shippingRatePlan) duser (geriye donuk uyum).
  shippingRatePlansList: EngineRatePlan[] | null = null;
  // TODO-125 — ENABLED provider gorunum bilgisi (provider tipi -> ad/logo).
  shippingProviderDisplays: ProviderDisplayMap = new Map();

  async listActiveShippingRatePlans(storeId: string): Promise<EngineRatePlan[]> {
    if (storeId !== "store_demo") return [];
    if (this.shippingRatePlansList) return this.shippingRatePlansList;
    return this.shippingRatePlan ? [this.shippingRatePlan] : [];
  }

  async listShippingProviderDisplays(storeId: string): Promise<ProviderDisplayMap> {
    return storeId === "store_demo" ? this.shippingProviderDisplays : new Map();
  }

  async findDefaultShippingAddress(
    storeId: string,
    customerId: string,
  ): Promise<{ city: string; district: string | null } | null> {
    // store/customer scope simgesel; in-memory testte tek varsayilan adres tutulur.
    return storeId && customerId ? this.defaultShippingAddress : null;
  }

  // ───────── F4A — Kampanya/kupon veri erisimi (CampaignDataAccess) ─────────
  async listCampaigns(storeId: string) {
    return this.campaigns.filter((campaign) => campaign.storeId === storeId);
  }

  // F4A.1 — Public rozet projeksiyonu icin ACTIVE + isPublic kampanyalar.
  async listPublicActiveCampaigns(storeId: string) {
    const supported = new Set(["COUPON_CODE", "AUTOMATIC_CART", "PRODUCT_DISCOUNT", "CATEGORY_DISCOUNT"]);
    return this.campaigns.filter(
      (campaign) =>
        campaign.storeId === storeId &&
        campaign.status === "ACTIVE" &&
        campaign.isPublic &&
        supported.has(campaign.type),
    );
  }

  async findCampaignById(storeId: string, campaignId: string) {
    const campaign = this.campaigns.find((item) => item.storeId === storeId && item.id === campaignId);
    if (!campaign) return null;
    const redemptions = this.campaignRedemptions.filter(
      (item) => item.storeId === storeId && item.campaignId === campaignId,
    );
    const orderOf = (orderId: string) => this.orders.find((order) => order.id === orderId);
    const totalDiscountMinor = redemptions.reduce((sum, item) => sum + item.discountAmountMinor, 0);
    // F4A.2 (ADR-059) — Snapshot-tabanli analitik (in-memory karsilik).
    const identities = new Set<string>();
    let ordersSubtotalMinor = 0;
    let ordersTotalMinor = 0;
    let lastRedemptionAt: Date | null = null;
    for (const item of redemptions) {
      const identity = item.customerId ?? item.email;
      if (identity) identities.add(identity);
      const order = orderOf(item.orderId);
      ordersSubtotalMinor += order?.subtotalAmount ?? 0;
      ordersTotalMinor += order?.totalAmount ?? 0;
      if (!lastRedemptionAt || item.createdAt > lastRedemptionAt) lastRedemptionAt = item.createdAt;
    }
    return {
      ...campaign,
      recentRedemptions: redemptions.slice(-10).reverse().map((item) => ({
        id: item.id,
        orderId: item.orderId,
        orderNumber: orderOf(item.orderId)?.orderNumber ?? null,
        couponCode:
          campaign.coupons.find((coupon) => coupon.id === item.couponId)?.code ?? null,
        email: item.email,
        discountAmountMinor: item.discountAmountMinor,
        orderTotalMinor: orderOf(item.orderId)?.totalAmount ?? null,
        createdAt: item.createdAt,
      })),
      totalRedemptionCount: redemptions.length,
      totalDiscountMinor,
      analytics: {
        redemptionCount: redemptions.length,
        uniqueCustomerCount: identities.size,
        totalDiscountMinor,
        ordersSubtotalMinor,
        ordersTotalMinor,
        avgDiscountPerOrderMinor:
          redemptions.length > 0 ? Math.round(totalDiscountMinor / redemptions.length) : 0,
        avgOrderTotalMinor:
          redemptions.length > 0 ? Math.round(ordersTotalMinor / redemptions.length) : 0,
        lastRedemptionAt,
      },
    };
  }

  async createCampaign(storeId: string, input: CampaignCreateRequest) {
    for (const productId of input.productIds) {
      if (!this.products.some((item) => item.storeId === storeId && item.id === productId)) {
        return "SCOPE_PRODUCT_NOT_FOUND" as const;
      }
    }
    for (const categoryId of input.categoryIds) {
      if (!this.categories.some((item) => item.storeId === storeId && item.id === categoryId)) {
        return "SCOPE_CATEGORY_NOT_FOUND" as const;
      }
    }
    const normalizedCode = input.couponCode ? input.couponCode.trim().toUpperCase() : null;
    if (input.type === "COUPON_CODE" && normalizedCode) {
      const duplicate = this.campaigns.some(
        (campaign) =>
          campaign.storeId === storeId &&
          campaign.coupons.some((coupon) => coupon.normalizedCode === normalizedCode),
      );
      if (duplicate) return "DUPLICATE_COUPON_CODE" as const;
    }
    const now = new Date("2026-07-05T00:00:00.000Z");
    const id = `camp_${this.campaigns.length + 1}`;
    const campaign: CampaignRecord = {
      id,
      storeId,
      name: input.name,
      description: input.description ?? null,
      status: "DRAFT",
      type: input.type,
      discountType: input.discountType,
      discountValue: input.discountValue,
      maxDiscountAmountMinor: input.maxDiscountAmountMinor ?? null,
      minOrderAmountMinor: input.minOrderAmountMinor ?? null,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      totalUsageLimit: input.totalUsageLimit ?? null,
      perCustomerUsageLimit: input.perCustomerUsageLimit ?? null,
      usageCount: 0,
      stackable: input.stackable,
      priority: input.priority,
      isPublic: deriveIsPublicFromAccessModel(input.accessModel),
      displayTitle: input.displayTitle ?? null,
      shortDescription: input.shortDescription ?? null,
      terms: input.terms ?? null,
      badgeLabel: input.badgeLabel ?? null,
      badgeVariant: input.badgeVariant ?? null,
      cardStyle: input.cardStyle,
      accessModel: input.accessModel,
      displayPriority: input.displayPriority,
      productIds: [...input.productIds],
      categoryIds: [...input.categoryIds],
      coupons:
        input.type === "COUPON_CODE" && normalizedCode
          ? [
              {
                id: `coup_${this.campaigns.length + 1}`,
                code: input.couponCode!.trim(),
                normalizedCode,
                status: "ACTIVE",
                totalUsageLimit: null,
                perCustomerUsageLimit: null,
                usageCount: 0,
                startsAt: null,
                endsAt: null,
                createdAt: now,
                updatedAt: now,
              },
            ]
          : [],
      createdAt: now,
      updatedAt: now,
    };
    this.campaigns.push(campaign);
    return campaign;
  }

  async updateCampaign(storeId: string, campaignId: string, input: CampaignUpdateRequest) {
    const campaign = this.campaigns.find((item) => item.storeId === storeId && item.id === campaignId);
    if (!campaign) return null;
    if (campaign.status === "ARCHIVED") return "ARCHIVED_IMMUTABLE" as const;
    for (const productId of input.productIds ?? []) {
      if (!this.products.some((item) => item.storeId === storeId && item.id === productId)) {
        return "SCOPE_PRODUCT_NOT_FOUND" as const;
      }
    }
    for (const categoryId of input.categoryIds ?? []) {
      if (!this.categories.some((item) => item.storeId === storeId && item.id === categoryId)) {
        return "SCOPE_CATEGORY_NOT_FOUND" as const;
      }
    }
    if (input.name !== undefined) campaign.name = input.name;
    if (input.description !== undefined) campaign.description = input.description ?? null;
    if (input.discountType !== undefined) campaign.discountType = input.discountType;
    if (input.discountValue !== undefined) campaign.discountValue = input.discountValue;
    if (input.maxDiscountAmountMinor !== undefined) campaign.maxDiscountAmountMinor = input.maxDiscountAmountMinor ?? null;
    if (input.minOrderAmountMinor !== undefined) campaign.minOrderAmountMinor = input.minOrderAmountMinor ?? null;
    if (input.startsAt !== undefined) campaign.startsAt = input.startsAt ? new Date(input.startsAt) : null;
    if (input.endsAt !== undefined) campaign.endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (input.totalUsageLimit !== undefined) campaign.totalUsageLimit = input.totalUsageLimit ?? null;
    if (input.perCustomerUsageLimit !== undefined) campaign.perCustomerUsageLimit = input.perCustomerUsageLimit ?? null;
    if (input.stackable !== undefined) campaign.stackable = input.stackable;
    if (input.priority !== undefined) campaign.priority = input.priority;
    if (input.accessModel !== undefined) {
      campaign.accessModel = input.accessModel;
      campaign.isPublic = deriveIsPublicFromAccessModel(input.accessModel);
    }
    if (input.displayTitle !== undefined) campaign.displayTitle = input.displayTitle ?? null;
    if (input.shortDescription !== undefined)
      campaign.shortDescription = input.shortDescription ?? null;
    if (input.terms !== undefined) campaign.terms = input.terms ?? null;
    if (input.badgeLabel !== undefined) campaign.badgeLabel = input.badgeLabel ?? null;
    if (input.badgeVariant !== undefined) campaign.badgeVariant = input.badgeVariant ?? null;
    if (input.cardStyle !== undefined) campaign.cardStyle = input.cardStyle;
    if (input.displayPriority !== undefined) campaign.displayPriority = input.displayPriority;
    if (input.productIds !== undefined) campaign.productIds = [...input.productIds];
    if (input.categoryIds !== undefined) campaign.categoryIds = [...input.categoryIds];
    campaign.updatedAt = new Date("2026-07-05T01:00:00.000Z");
    return campaign;
  }

  async setCampaignStatus(
    storeId: string,
    campaignId: string,
    status: "ACTIVE" | "PAUSED" | "ARCHIVED",
  ) {
    const campaign = this.campaigns.find((item) => item.storeId === storeId && item.id === campaignId);
    if (!campaign) return null;
    if (!isAllowedStatusTransition(campaign.status, status)) return "INVALID_STATUS_TRANSITION" as const;
    campaign.status = status;
    campaign.updatedAt = new Date("2026-07-05T01:00:00.000Z");
    return campaign;
  }

  async loadCampaignDiscountContext(
    storeId: string,
    input: { normalizedCouponCode: string | null; customerId: string | null; email: string | null },
  ) {
    const automaticCampaigns = this.campaigns
      .filter(
        (campaign) =>
          campaign.storeId === storeId &&
          campaign.status === "ACTIVE" &&
          ["AUTOMATIC_CART", "PRODUCT_DISCOUNT", "CATEGORY_DISCOUNT"].includes(campaign.type),
      )
      .map(toEngineCampaign);
    let coupon = null;
    let couponCampaign = null;
    if (input.normalizedCouponCode) {
      for (const campaign of this.campaigns) {
        if (campaign.storeId !== storeId) continue;
        const match = campaign.coupons.find((item) => item.normalizedCode === input.normalizedCouponCode);
        if (match) {
          coupon = toEngineCoupon(match, campaign.id);
          couponCampaign = toEngineCampaign(campaign);
          break;
        }
      }
    }
    const customerUsageByCampaign = new Map<string, number>();
    const customerUsageByCoupon = new Map<string, number>();
    if (input.customerId || input.email) {
      for (const redemption of this.campaignRedemptions) {
        if (redemption.storeId !== storeId) continue;
        const identityMatch =
          (input.customerId && redemption.customerId === input.customerId) ||
          (input.email && redemption.email === input.email);
        if (!identityMatch) continue;
        customerUsageByCampaign.set(
          redemption.campaignId,
          (customerUsageByCampaign.get(redemption.campaignId) ?? 0) + 1,
        );
        if (redemption.couponId) {
          customerUsageByCoupon.set(
            redemption.couponId,
            (customerUsageByCoupon.get(redemption.couponId) ?? 0) + 1,
          );
        }
      }
    }
    return { automaticCampaigns, coupon, couponCampaign, customerUsageByCampaign, customerUsageByCoupon };
  }

  async createOrder(
    storeId: string,
    input: {
      customerId?: string | null;
      customerEmail: string;
      currency: string;
      lines: Array<{ variantId: string; quantity: number }>;
      shippingAmount?: number;
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
      discountAmount?: number;
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
  ) {
    const orderId = `order_${this.orders.length + 1}`;
    const lines: OrderLineRecord[] = [];
    for (const inputLine of input.lines) {
      const variant = this.variants.find((item) => item.storeId === storeId && item.id === inputLine.variantId);
      if (!variant) return "VARIANT_NOT_FOUND" as const;
      const product = this.products.find((item) => item.storeId === storeId && item.id === variant.productId);
      if (!product || product.status !== "ACTIVE" || variant.status !== "ACTIVE" || variant.currency !== input.currency) {
        return "INVALID_VARIANT" as const;
      }
      const salesError = this.productSalesError(product, inputLine.quantity);
      if (salesError) return salesError;
      lines.push({
        id: `line_${lines.length + 1}`,
        storeId,
        orderId,
        productId: product.id,
        variantId: variant.id,
        sku: variant.sku,
        title: product.title,
        variantTitle: variant.title,
        quantity: inputLine.quantity,
        unitPriceAmount: variant.priceMinor,
        totalAmount: variant.priceMinor * inputLine.quantity,
        currency: input.currency,
        createdAt: new Date("2026-01-05T00:00:00.000Z"),
      });
    }
    // F4A — Kampanya kullanim limitleri siparis "transaction"inda yeniden dogrulanir
    // (Prisma impl ile ayni sozlesme): once TUM dogrulama, sonra mutasyon (rollback esdegeri).
    const email = input.customerEmail ? input.customerEmail.trim().toLowerCase() : null;
    const discounts = input.discounts ?? [];
    for (const discountLine of discounts) {
      if (!discountLine.campaignId) continue;
      const campaign = this.campaigns.find(
        (item) => item.storeId === storeId && item.id === discountLine.campaignId,
      );
      if (!campaign || campaign.status !== "ACTIVE") return "CAMPAIGN_NOT_ACTIVE" as const;
      if (campaign.totalUsageLimit !== null && campaign.usageCount >= campaign.totalUsageLimit) {
        return "CAMPAIGN_USAGE_LIMIT" as const;
      }
      if (campaign.perCustomerUsageLimit !== null && (input.customerId || email)) {
        const used = this.campaignRedemptions.filter(
          (item) =>
            item.storeId === storeId &&
            item.campaignId === campaign.id &&
            ((input.customerId && item.customerId === input.customerId) ||
              (email && item.email === email)),
        ).length;
        if (used >= campaign.perCustomerUsageLimit) return "CAMPAIGN_USAGE_LIMIT" as const;
      }
      if (discountLine.couponId) {
        const coupon = campaign.coupons.find((item) => item.id === discountLine.couponId);
        if (!coupon || coupon.status !== "ACTIVE") return "CAMPAIGN_NOT_ACTIVE" as const;
        if (coupon.totalUsageLimit !== null && coupon.usageCount >= coupon.totalUsageLimit) {
          return "COUPON_USAGE_LIMIT" as const;
        }
        if (coupon.perCustomerUsageLimit !== null && (input.customerId || email)) {
          const used = this.campaignRedemptions.filter(
            (item) =>
              item.storeId === storeId &&
              item.couponId === coupon.id &&
              ((input.customerId && item.customerId === input.customerId) ||
                (email && item.email === email)),
          ).length;
          if (used >= coupon.perCustomerUsageLimit) return "COUPON_USAGE_LIMIT" as const;
        }
      }
    }
    const totals = this.orderTotals(lines, {
      discountAmount: input.discountAmount,
      shippingAmount: input.shippingAmount,
    });
    const order: OrderRecord = {
      id: orderId,
      storeId,
      orderNumber: `OS-${String(this.orderSequence).padStart(6, "0")}`,
      customerId: input.customerId ?? null,
      customerEmail: input.customerEmail,
      currency: input.currency,
      status: "DRAFT",
      paymentStatus: "UNPAID",
      fulfillmentStatus: "UNFULFILLED",
      ...totals,
      shippingCurrency: input.shippingSnapshot?.currency ?? null,
      shippingSource: input.shippingSnapshot?.source ?? null,
      shippingRatePlanId: input.shippingSnapshot?.ratePlanId ?? null,
      shippingRatePlanName: input.shippingSnapshot?.ratePlanName ?? null,
      shippingProvider: input.shippingSnapshot?.provider ?? null,
      shippingProviderName: input.shippingSnapshot?.providerName ?? null,
      shippingLogoUrl: input.shippingSnapshot?.logoUrl ?? null,
      shippingEtaText: input.shippingSnapshot?.etaText ?? null,
      placedAt: null,
      cancelledAt: null,
      cancelReason: null,
      billingType: input.billing?.type ?? null,
      billingName: input.billing?.name ?? null,
      billingTaxId: input.billing?.taxId ?? null,
      billingCompanyName: input.billing?.companyName ?? null,
      billingTaxOffice: input.billing?.taxOffice ?? null,
      billingTaxNumber: input.billing?.taxNumber ?? null,
      billingEmail: input.billing?.email ?? null,
      createdAt: new Date("2026-01-05T00:00:00.000Z"),
      updatedAt: new Date("2026-01-05T00:00:00.000Z"),
      lines,
      paymentAttempts: [],
      addresses: input.addresses.map((address, index) => ({
        id: `addr_${index + 1}`,
        storeId,
        orderId,
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
      reservations: [],
      events: [{
        id: "event_1",
        storeId,
        orderId,
        type: "ORDER_CREATED",
        message: "Order draft created.",
        metadata: { lineCount: lines.length },
        actorUserId: input.actorUserId ?? null,
        createdAt: new Date("2026-01-05T00:00:00.000Z"),
      }],
    };
    this.orderSequence += 1;
    this.orders.push(order);
    // F4A — Dogrulama gecti: sayaclar artirilir, snapshot + redemption yazilir.
    for (const discountLine of discounts) {
      if (discountLine.campaignId) {
        const campaign = this.campaigns.find(
          (item) => item.storeId === storeId && item.id === discountLine.campaignId,
        )!;
        campaign.usageCount += 1;
        if (discountLine.couponId) {
          const coupon = campaign.coupons.find((item) => item.id === discountLine.couponId)!;
          coupon.usageCount += 1;
        }
        this.campaignRedemptions.push({
          id: `red_${this.campaignRedemptions.length + 1}`,
          storeId,
          campaignId: discountLine.campaignId,
          couponId: discountLine.couponId,
          orderId,
          customerId: input.customerId ?? null,
          email,
          discountAmountMinor: discountLine.discountAmountMinor,
          createdAt: new Date("2026-07-05T02:00:00.000Z"),
        });
      }
      this.orderDiscounts.push({ ...discountLine, id: `od_${this.orderDiscounts.length + 1}`, storeId, orderId });
    }
    return order;
  }

  async updateOrder(storeId: string, orderId: string, input: { customerEmail?: string; customerId?: string | null }) {
    const order = await this.findOrderById(storeId, orderId);
    if (!order) return null;
    if (order.status !== "DRAFT") return "MUTATION_NOT_ALLOWED" as const;
    if (input.customerEmail) order.customerEmail = input.customerEmail;
    if ("customerId" in input) order.customerId = input.customerId ?? null;
    order.updatedAt = new Date("2026-01-06T00:00:00.000Z");
    return order;
  }

  async addOrderLine(storeId: string, orderId: string, input: { variantId: string; quantity: number }) {
    const order = await this.findOrderById(storeId, orderId);
    if (!order) return null;
    if (order.status !== "DRAFT") return "MUTATION_NOT_ALLOWED" as const;
    const variant = this.variants.find((item) => item.storeId === storeId && item.id === input.variantId);
    if (!variant) return "VARIANT_NOT_FOUND" as const;
    const product = this.products.find((item) => item.storeId === storeId && item.id === variant.productId);
    if (!product || product.status !== "ACTIVE" || variant.status !== "ACTIVE" || variant.currency !== order.currency) {
      return "INVALID_VARIANT" as const;
    }
    const salesError = this.productSalesError(product, input.quantity);
    if (salesError) return salesError;
    order.lines.push({
      id: `line_${order.lines.length + 1}`,
      storeId,
      orderId,
      productId: product.id,
      variantId: variant.id,
      sku: variant.sku,
      title: product.title,
      variantTitle: variant.title,
      quantity: input.quantity,
      unitPriceAmount: variant.priceMinor,
      totalAmount: variant.priceMinor * input.quantity,
      currency: order.currency,
      createdAt: new Date("2026-01-06T00:00:00.000Z"),
    });
    Object.assign(order, this.orderTotals(order.lines));
    return order;
  }

  async updateOrderLine(storeId: string, orderId: string, lineId: string, input: { quantity: number }) {
    const order = await this.findOrderById(storeId, orderId);
    if (!order) return null;
    if (order.status !== "DRAFT") return "MUTATION_NOT_ALLOWED" as const;
    const line = order.lines.find((item) => item.id === lineId);
    if (!line) return "ORDER_LINE_NOT_FOUND" as const;
    const product = this.products.find((item) => item.storeId === storeId && item.id === line.productId);
    if (product) {
      const salesError = this.productSalesError(product, input.quantity);
      if (salesError === "PRODUCT_ORDER_QUANTITY_OUT_OF_RANGE") return salesError;
    }
    line.quantity = input.quantity;
    line.totalAmount = line.unitPriceAmount * input.quantity;
    Object.assign(order, this.orderTotals(order.lines));
    return order;
  }

  async placeOrder(storeId: string, orderId: string, input: { actorUserId?: string }) {
    const order = await this.findOrderById(storeId, orderId);
    if (!order) return null;
    if (order.status === "PLACED") return order;
    if (order.status !== "DRAFT") return "INVALID_STATUS" as const;
    for (const line of order.lines) {
      const variant = this.variants.find((item) => item.storeId === storeId && item.id === line.variantId);
      const product = variant ? this.products.find((item) => item.storeId === storeId && item.id === variant.productId) : null;
      if (!variant || !product || product.status !== "ACTIVE" || variant.status !== "ACTIVE") return "INVALID_VARIANT" as const;
      const salesError = this.productSalesError(product, line.quantity);
      if (salesError) return salesError;
      const item = this.inventory.find((inventory) => inventory.storeId === storeId && inventory.variantId === line.variantId);
      if (!item) return "RESERVATION_FAILED" as const;
      if (item.quantityOnHand - item.quantityReserved < line.quantity) return "INSUFFICIENT_STOCK" as const;
    }
    for (const line of order.lines) {
      const item = this.inventory.find((inventory) => inventory.storeId === storeId && inventory.variantId === line.variantId)!;
      item.quantityReserved += line.quantity;
      item.updatedAt = new Date("2026-01-07T00:00:00.000Z");
      order.reservations.push({
        id: `reservation_${order.reservations.length + 1}`,
        storeId,
        orderId,
        orderLineId: line.id,
        variantId: line.variantId,
        quantity: line.quantity,
        status: "ACTIVE",
        expiresAt: null,
        releasedAt: null,
        consumedAt: null,
        createdAt: new Date("2026-01-07T00:00:00.000Z"),
        updatedAt: new Date("2026-01-07T00:00:00.000Z"),
      });
      this.movements.push({
        id: `movement_${this.movements.length + 1}`,
        storeId,
        variantId: line.variantId,
        type: "SALE_RESERVATION",
        quantityDelta: line.quantity,
        reason: "Order placed.",
        referenceType: "Order",
        referenceId: orderId,
        actorUserId: input.actorUserId ?? null,
        createdAt: new Date("2026-01-07T00:00:00.000Z"),
      });
    }
    order.status = "PLACED";
    order.placedAt = new Date("2026-01-07T00:00:00.000Z");
    return order;
  }

  async cancelOrder(storeId: string, orderId: string, input: { reason?: string; actorUserId?: string }) {
    const order = await this.findOrderById(storeId, orderId);
    if (!order) return null;
    if (order.status === "CANCELLED") return order;
    if (order.status === "FULFILLED") return "INVALID_STATUS" as const;
    for (const reservation of order.reservations.filter((item) => item.status === "ACTIVE")) {
      const item = this.inventory.find((inventory) => inventory.storeId === storeId && inventory.variantId === reservation.variantId);
      if (!item || item.quantityReserved < reservation.quantity) return "RESERVATION_FAILED" as const;
      item.quantityReserved -= reservation.quantity;
      reservation.status = "RELEASED";
      reservation.releasedAt = new Date("2026-01-08T00:00:00.000Z");
      this.movements.push({
        id: `movement_${this.movements.length + 1}`,
        storeId,
        variantId: reservation.variantId,
        type: "SALE_RELEASE",
        quantityDelta: -reservation.quantity,
        reason: "Order cancelled.",
        referenceType: "Order",
        referenceId: orderId,
        actorUserId: input.actorUserId ?? null,
        createdAt: new Date("2026-01-08T00:00:00.000Z"),
      });
    }
    order.status = "CANCELLED";
    order.fulfillmentStatus = "CANCELLED";
    order.cancelReason = input.reason ?? null;
    order.cancelledAt = new Date("2026-01-08T00:00:00.000Z");
    return order;
  }

  // --- F3B.2 Payment provider operasyon altyapisi (in-memory test double) ---
  async listPaymentProviderConfigs(storeId: string) {
    return this.paymentProviderConfigs
      .filter((config) => config.storeId === storeId)
      .sort((a, b) =>
        a.priority !== b.priority
          ? a.priority - b.priority
          : a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1),
      );
  }

  async findPaymentProviderConfigById(storeId: string, configId: string) {
    return (
      this.paymentProviderConfigs.find((config) => config.storeId === storeId && config.id === configId) ??
      null
    );
  }

  async createPaymentProviderConfig(storeId: string, input: PaymentProviderConfigCreateInput) {
    const duplicate = this.paymentProviderConfigs.find(
      (config) => config.storeId === storeId && config.provider === input.provider && config.mode === input.mode,
    );
    if (duplicate) {
      return "PROVIDER_MODE_EXISTS" as const;
    }
    const now = new Date("2026-02-01T00:00:00.000Z");
    const config: PaymentProviderConfigRecord = {
      id: `ppc_${this.paymentSequence++}`,
      storeId,
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
      apiKeyCipher: input.apiKeyCipher ?? null,
      secretKeyCipher: input.secretKeyCipher ?? null,
      webhookSecretCipher: input.webhookSecretCipher ?? null,
      lastTestStatus: null,
      lastTestMessage: null,
      lastTestAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.paymentProviderConfigs.push(config);
    return config;
  }

  async updatePaymentProviderConfig(
    storeId: string,
    configId: string,
    input: PaymentProviderConfigUpdateInput,
  ) {
    const config = this.paymentProviderConfigs.find(
      (item) => item.storeId === storeId && item.id === configId,
    );
    if (!config) {
      return null;
    }
    const nextProvider = input.provider ?? config.provider;
    const nextMode = input.mode ?? config.mode;
    const duplicate = this.paymentProviderConfigs.find(
      (item) =>
        item.id !== configId &&
        item.storeId === storeId &&
        item.provider === nextProvider &&
        item.mode === nextMode,
    );
    if (duplicate) {
      return "PROVIDER_MODE_EXISTS" as const;
    }
    // undefined olan alanlar dokunulmaz (secret cipher dahil); null TEMIZLER.
    for (const key of Object.keys(input) as Array<keyof PaymentProviderConfigUpdateInput>) {
      const value = input[key];
      if (value !== undefined) {
        (config as Record<string, unknown>)[key] = value;
      }
    }
    config.updatedAt = new Date("2026-02-02T00:00:00.000Z");
    return config;
  }

  async setPaymentProviderStatus(storeId: string, configId: string, status: PaymentProviderStatus) {
    const config = this.paymentProviderConfigs.find(
      (item) => item.storeId === storeId && item.id === configId,
    );
    if (!config) {
      return null;
    }
    config.status = status;
    config.updatedAt = new Date("2026-02-02T00:00:00.000Z");
    return config;
  }

  async reorderPaymentProviderPriorities(
    storeId: string,
    items: Array<{ id: string; priority: number }>,
  ) {
    for (const item of items) {
      const config = this.paymentProviderConfigs.find(
        (candidate) => candidate.storeId === storeId && candidate.id === item.id,
      );
      if (!config) {
        return "CONFIG_NOT_FOUND" as const;
      }
    }
    for (const item of items) {
      const config = this.paymentProviderConfigs.find(
        (candidate) => candidate.storeId === storeId && candidate.id === item.id,
      )!;
      config.priority = item.priority;
    }
    return this.listPaymentProviderConfigs(storeId);
  }

  async recordPaymentProviderTest(
    storeId: string,
    configId: string,
    input: { status: string; message: string; at: Date },
  ) {
    const config = this.paymentProviderConfigs.find(
      (item) => item.storeId === storeId && item.id === configId,
    );
    if (!config) {
      return null;
    }
    config.lastTestStatus = input.status;
    config.lastTestMessage = input.message;
    config.lastTestAt = input.at;
    return config;
  }

  async createPaymentAttempt(storeId: string, input: PaymentAttemptCreateInput) {
    const now = new Date("2026-02-03T00:00:00.000Z");
    const attempt: PaymentAttemptRecord = {
      id: `pa_${this.paymentSequence++}`,
      storeId,
      orderId: input.orderId,
      providerConfigId: input.providerConfigId,
      provider: input.provider,
      mode: input.mode,
      method: input.method,
      amount: input.amount,
      currency: input.currency,
      status: input.status,
      threeDsApplied: false,
      scenario: null,
      installmentCount: 1,
      cardBrand: null,
      cardLast4: null,
      providerReference: null,
      failureCode: null,
      failureMessage: null,
      accessTokenHash: input.accessTokenHash,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      paidAt: null,
      failedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.paymentAttempts.push(attempt);
    // Siparise de bagla ki findOrderById gozlemlenebilir denemeleri dondurebilsin.
    const order = this.orders.find((o) => o.storeId === storeId && o.id === input.orderId);
    if (order) order.paymentAttempts.push(attempt);
    return attempt;
  }

  async findPaymentAttemptById(storeId: string, attemptId: string) {
    return (
      this.paymentAttempts.find((attempt) => attempt.storeId === storeId && attempt.id === attemptId) ??
      null
    );
  }

  async findLatestPaymentAttemptForOrder(storeId: string, orderId: string) {
    const matches = this.paymentAttempts
      .filter((attempt) => attempt.storeId === storeId && attempt.orderId === orderId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0] ?? null;
  }

  async recordPaymentAttemptOutcome(storeId: string, input: PaymentAttemptOutcomeInput) {
    const attempt = this.paymentAttempts.find(
      (item) => item.storeId === storeId && item.id === input.attemptId,
    )!;
    attempt.status = input.attemptStatus;
    attempt.threeDsApplied = input.threeDsApplied;
    if (input.scenario !== undefined && input.scenario !== null) attempt.scenario = input.scenario;
    if (input.providerReference !== undefined && input.providerReference !== null) {
      attempt.providerReference = input.providerReference;
    }
    attempt.failureCode = input.failureCode ?? null;
    attempt.failureMessage = input.failureMessage ?? null;
    if (input.installmentCount !== undefined) attempt.installmentCount = input.installmentCount;
    if (input.cardBrand !== undefined) attempt.cardBrand = input.cardBrand;
    if (input.cardLast4 !== undefined) attempt.cardLast4 = input.cardLast4;
    if (input.paidAt !== undefined) attempt.paidAt = input.paidAt;
    if (input.failedAt !== undefined) attempt.failedAt = input.failedAt;
    if (input.clearAccessToken) {
      attempt.accessTokenHash = null;
      attempt.accessTokenExpiresAt = null;
    }
    attempt.updatedAt = new Date("2026-02-04T00:00:00.000Z");
    if (input.orderPaymentStatus) {
      const order = this.orders.find((item) => item.storeId === storeId && item.id === input.orderId);
      if (order) {
        order.paymentStatus = input.orderPaymentStatus;
      }
    }
    this.paymentProviderEvents.push({
      id: `ppe_${this.paymentSequence++}`,
      storeId,
      providerConfigId: attempt.providerConfigId,
      attemptId: attempt.id,
      orderId: input.orderId,
      provider: input.event.provider,
      type: input.event.type,
      eventId: input.event.eventId ?? null,
      message: input.event.message ?? null,
      metadata: (input.event.metadata ?? null) as PaymentProviderEventRecord["metadata"],
      createdAt: new Date("2026-02-04T00:00:00.000Z"),
    });
    return attempt;
  }

  async createPaymentProviderEvent(storeId: string, input: PaymentProviderEventCreateInput) {
    const event: PaymentProviderEventRecord = {
      id: `ppe_${this.paymentSequence++}`,
      storeId,
      providerConfigId: input.providerConfigId ?? null,
      attemptId: input.attemptId ?? null,
      orderId: input.orderId ?? null,
      provider: input.provider,
      type: input.type,
      eventId: input.eventId ?? null,
      message: input.message ?? null,
      metadata: (input.metadata ?? null) as PaymentProviderEventRecord["metadata"],
      createdAt: new Date("2026-02-05T00:00:00.000Z"),
    };
    this.paymentProviderEvents.push(event);
    return event;
  }

  async findPaymentProviderEventByEventId(
    storeId: string,
    provider: PaymentProviderType,
    eventId: string,
  ) {
    return (
      this.paymentProviderEvents.find(
        (event) => event.storeId === storeId && event.provider === provider && event.eventId === eventId,
      ) ?? null
    );
  }

  async listPaymentProviderEvents(
    storeId: string,
    input: { providerConfigId?: string; limit: number; offset: number },
  ) {
    return this.paymentProviderEvents
      .filter(
        (event) =>
          event.storeId === storeId &&
          (input.providerConfigId ? event.providerConfigId === input.providerConfigId : true),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(input.offset, input.offset + input.limit);
  }

  async createAuditLog(input: AuditRecord) {
    this.auditLogs.push(input);
  }
}

// F3B.3 — Store-admin müşteri yönetimi uçları için bellek CustomerDataAccess mock'u.
// Yalnız admin route'larının dokunduğu metotlar gerçekçi; gerisi kullanılmaz (cast).
interface MockCustomer {
  id: string;
  storeId: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  birthDate: Date | null;
  gender: null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  status: "ACTIVE" | "PASSIVE" | "BLOCKED" | "ARCHIVED";
  createdAt: Date;
  hasCredential: boolean;
}

function createCustomerAdminMock() {
  const customers: MockCustomer[] = [
    {
      id: "cust_member",
      storeId: "store_demo",
      email: "member@example.local",
      phone: "+905551112233",
      firstName: "Ayşe",
      lastName: "Yılmaz",
      birthDate: null,
      gender: null,
      emailVerifiedAt: new Date("2026-02-01T00:00:00.000Z"),
      phoneVerifiedAt: null,
      status: "ACTIVE",
      createdAt: new Date("2026-01-15T00:00:00.000Z"),
      hasCredential: true,
    },
    {
      id: "cust_existing_email",
      storeId: "store_demo",
      email: "taken@example.local",
      phone: null,
      firstName: "Veli",
      lastName: "Demir",
      birthDate: null,
      gender: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      status: "ACTIVE",
      createdAt: new Date("2026-01-10T00:00:00.000Z"),
      hasCredential: false,
    },
    {
      id: "cust_other_store",
      storeId: "store_other",
      email: "other@example.local",
      phone: null,
      firstName: "Other",
      lastName: "Tenant",
      birthDate: null,
      gender: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      status: "ACTIVE",
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      hasCredential: true,
    },
  ];
  type Addr = {
    id: string;
    addressName: string;
    fullName: string;
    phone: string | null;
    city: string;
    district: string | null;
    addressLine1: string;
    addressLine2: string | null;
    postalCode: string | null;
    isDefaultShipping: boolean;
    isDefaultBilling: boolean;
    billingType: "INDIVIDUAL" | "CORPORATE" | null;
    tckn: string | null;
    companyName: string | null;
    taxOffice: string | null;
    taxNumber: string | null;
  };
  const addresses = new Map<string, Addr[]>();
  type Iban = { id: string; accountHolderName: string; iban: string; isDefault: boolean };
  const ibans = new Map<string, Iban[]>();
  const prefs = new Map<string, { smsEnabled: boolean; emailEnabled: boolean; phoneEnabled: boolean }>();
  const orders = new Map<
    string,
    {
      orderNumber: string;
      status: string;
      paymentStatus: string;
      fulfillmentStatus: string;
      currency: string;
      totalAmount: number;
      createdAt: Date;
      lines: {
        variantId: string;
        productSlug: string;
        sku: string;
        title: string;
        variantTitle: string;
        quantity: number;
      }[];
    }[]
  >();
  orders.set("cust_member", [
    {
      orderNumber: "OS-0001",
      status: "PLACED",
      paymentStatus: "PAID",
      fulfillmentStatus: "UNFULFILLED",
      currency: "TRY",
      totalAmount: 129900,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      lines: [
        {
          variantId: "variant_tshirt_m",
          productSlug: "tisort",
          sku: "TS-M",
          title: "Tişört",
          variantTitle: "M",
          quantity: 1,
        },
      ],
    },
  ]);
  let seq = 1;
  const find = (storeId: string, id: string) =>
    customers.find((customer) => customer.id === id && customer.storeId === storeId) ?? null;
  const authShape = (customer: MockCustomer) => ({
    id: customer.id,
    storeId: customer.storeId,
    email: customer.email,
    phone: customer.phone,
    firstName: customer.firstName,
    lastName: customer.lastName,
    birthDate: customer.birthDate,
    gender: customer.gender,
    emailVerifiedAt: customer.emailVerifiedAt,
    phoneVerifiedAt: customer.phoneVerifiedAt,
    status: customer.status,
  });

  const mock = {
    async adminFindDetail(storeId: string, id: string) {
      const customer = find(storeId, id);
      if (!customer) return null;
      return { ...authShape(customer), createdAt: customer.createdAt, hasCredential: customer.hasCredential };
    },
    async adminUpdateCustomer(
      storeId: string,
      id: string,
      input: {
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
        phone?: string | null;
        status?: MockCustomer["status"];
        birthDate?: Date | null;
        gender?: null;
      },
    ) {
      const customer = find(storeId, id);
      if (!customer) return "NOT_FOUND" as const;
      if (input.email !== undefined && input.email !== customer.email) {
        if (
          input.email &&
          customers.some((other) => other.storeId === storeId && other.id !== id && other.email === input.email)
        ) {
          return "EMAIL_TAKEN" as const;
        }
        customer.email = input.email;
        customer.emailVerifiedAt = null;
      }
      if (input.phone !== undefined && input.phone !== customer.phone) {
        if (
          input.phone &&
          customers.some((other) => other.storeId === storeId && other.id !== id && other.phone === input.phone)
        ) {
          return "PHONE_TAKEN" as const;
        }
        customer.phone = input.phone;
        customer.phoneVerifiedAt = null;
      }
      if (input.firstName !== undefined) customer.firstName = input.firstName;
      if (input.lastName !== undefined) customer.lastName = input.lastName;
      if (input.status !== undefined) customer.status = input.status;
      if (input.birthDate !== undefined) customer.birthDate = input.birthDate;
      return authShape(customer);
    },
    async listAddresses(_storeId: string, customerId: string) {
      return addresses.get(customerId) ?? [];
    },
    async findAddress(_storeId: string, customerId: string, id: string) {
      return (addresses.get(customerId) ?? []).find((address) => address.id === id) ?? null;
    },
    async createAddress(_storeId: string, customerId: string, input: Omit<Addr, "id" | "isDefaultBilling">) {
      const list = addresses.get(customerId) ?? [];
      const makeDefault = list.length === 0 || input.isDefaultShipping === true;
      if (makeDefault) list.forEach((a) => { a.isDefaultShipping = false; a.isDefaultBilling = false; });
      const created: Addr = {
        ...input,
        id: `addr_${seq++}`,
        isDefaultShipping: makeDefault,
        isDefaultBilling: makeDefault,
      };
      list.push(created);
      addresses.set(customerId, list);
      return created;
    },
    async updateAddress(_storeId: string, customerId: string, id: string, input: Omit<Addr, "id" | "isDefaultBilling">) {
      const list = addresses.get(customerId) ?? [];
      const target = list.find((address) => address.id === id);
      if (!target) return null;
      if (input.isDefaultShipping === true) {
        list.forEach((a) => { a.isDefaultShipping = false; a.isDefaultBilling = false; });
        target.isDefaultShipping = true;
        target.isDefaultBilling = true;
      }
      Object.assign(target, {
        addressName: input.addressName,
        fullName: input.fullName,
        phone: input.phone,
        city: input.city,
        district: input.district,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        postalCode: input.postalCode,
        billingType: input.billingType,
        tckn: input.tckn,
        companyName: input.companyName,
        taxOffice: input.taxOffice,
        taxNumber: input.taxNumber,
      });
      return target;
    },
    async softDeleteAddress(_storeId: string, customerId: string, id: string) {
      const list = addresses.get(customerId) ?? [];
      const index = list.findIndex((address) => address.id === id);
      if (index < 0) return false;
      list.splice(index, 1);
      return true;
    },
    async setDefaultAddress(_storeId: string, customerId: string, id: string) {
      const list = addresses.get(customerId) ?? [];
      const target = list.find((address) => address.id === id);
      if (!target) return false;
      list.forEach((a) => { a.isDefaultShipping = false; a.isDefaultBilling = false; });
      target.isDefaultShipping = true;
      target.isDefaultBilling = true;
      return true;
    },
    async listIbans(_storeId: string, customerId: string) {
      return ibans.get(customerId) ?? [];
    },
    async createIban(_storeId: string, customerId: string, input: { accountHolderName: string; iban: string; isDefault: boolean }) {
      const list = ibans.get(customerId) ?? [];
      const makeDefault = list.length === 0 || input.isDefault;
      if (makeDefault) list.forEach((i) => { i.isDefault = false; });
      const created: Iban = { id: `iban_${seq++}`, accountHolderName: input.accountHolderName, iban: input.iban, isDefault: makeDefault };
      list.push(created);
      ibans.set(customerId, list);
      return created;
    },
    async softDeleteIban(_storeId: string, customerId: string, id: string) {
      const list = ibans.get(customerId) ?? [];
      const index = list.findIndex((iban) => iban.id === id);
      if (index < 0) return false;
      list.splice(index, 1);
      return true;
    },
    async setDefaultIban(_storeId: string, customerId: string, id: string) {
      const list = ibans.get(customerId) ?? [];
      const target = list.find((iban) => iban.id === id);
      if (!target) return false;
      list.forEach((i) => { i.isDefault = false; });
      target.isDefault = true;
      return true;
    },
    async getCommPref(_storeId: string, customerId: string) {
      return prefs.get(customerId) ?? { smsEnabled: false, emailEnabled: true, phoneEnabled: false };
    },
    async upsertCommPref(_storeId: string, customerId: string, input: { smsEnabled: boolean; emailEnabled: boolean; phoneEnabled: boolean }) {
      prefs.set(customerId, input);
    },
    async listOrders(_storeId: string, customerId: string) {
      return orders.get(customerId) ?? [];
    },
    // TODO-087 — detay güvenlik bloğu: bu mock'ta credential/oturum yok.
    async getCredentialMeta() {
      return null;
    },
    async countActiveSessions() {
      return 0;
    },
  };
  return mock as unknown as CustomerDataAccess;
}

async function createTestApp() {
  const passwordHash = await hashPassword("local-admin-password", config.PASSWORD_HASH_PEPPER);
  const dataAccess = new MemoryDataAccess(passwordHash);
  const customerDataAccess = createCustomerAdminMock();
  const app = createServer(config, {
    dataAccess,
    customerDataAccess,
    checkDatabaseHealth: async () => true,
    checkRedisHealth: async () => true,
  });

  async function login() {
    const response = await app.inject({
      method: "POST",
      url: "/auth/platform/login",
      payload: {
        email: "platform-admin@example.local",
        password: "local-admin-password",
      },
    });
    return response.json<{ token: string }>().token;
  }

  return { app, dataAccess, login };
}

describe("api gateway", () => {
  it("responds on /health", async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "api-gateway-test",
    });
    await app.close();
  });

  it("protects internal health routes", async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/internal/health/db" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    await app.close();
  });

  it("allows internal DB and Redis health with a valid token", async () => {
    const { app } = await createTestApp();
    const dbResponse = await app.inject({
      method: "GET",
      url: "/internal/health/db",
      headers: { authorization: `Bearer ${config.INTERNAL_API_TOKEN}` },
    });
    const redisResponse = await app.inject({
      method: "GET",
      url: "/internal/health/redis",
      headers: { authorization: `Bearer ${config.INTERNAL_API_TOKEN}` },
    });
    expect(dbResponse.statusCode).toBe(200);
    expect(redisResponse.statusCode).toBe(200);
    await app.close();
  });

  it("logs in, reads me, and revokes the session on logout", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();

    expect(token).toBeTruthy();
    expect([...dataAccess.sessions.values()][0]?.tokenHash).not.toBe(token);
    expect(dataAccess.auditLogs).toContainEqual(expect.objectContaining({ action: "LOGIN" }));

    const meResponse = await app.inject({
      method: "GET",
      url: "/auth/platform/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json()).toMatchObject({
      user: { email: "platform-admin@example.local", role: "SUPER_ADMIN" },
    });

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/auth/platform/logout",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.json()).toEqual({ revoked: true });
    expect(dataAccess.auditLogs).toContainEqual(expect.objectContaining({ action: "LOGOUT" }));

    const revokedMeResponse = await app.inject({
      method: "GET",
      url: "/auth/platform/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(revokedMeResponse.statusCode).toBe(401);
    await app.close();
  });

  it("rejects invalid credentials and missing me token", async () => {
    const { app } = await createTestApp();
    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/platform/login",
      payload: { email: "platform-admin@example.local", password: "wrong" },
    });
    const meResponse = await app.inject({ method: "GET", url: "/auth/platform/me" });
    expect(loginResponse.statusCode).toBe(401);
    expect(loginResponse.json()).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
    expect(meResponse.statusCode).toBe(401);
    await app.close();
  });

  it("rate limits repeated invalid platform login attempts with the standard error envelope", async () => {
    const { app } = await createTestApp();
    for (let attempt = 0; attempt < config.AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/platform/login",
        payload: { email: "platform-admin@example.local", password: "wrong" },
      });
      expect(response.statusCode).toBe(401);
    }

    const limitedResponse = await app.inject({
      method: "POST",
      url: "/auth/platform/login",
      payload: { email: "platform-admin@example.local", password: "wrong" },
    });
    expect(limitedResponse.statusCode).toBe(429);
    expect(limitedResponse.json()).toMatchObject({ error: { code: "AUTH_RATE_LIMITED" } });
    await app.close();
  });

  it("keeps normal login working and resets the failed-attempt counter after success", async () => {
    const { app } = await createTestApp();
    const failedResponse = await app.inject({
      method: "POST",
      url: "/auth/platform/login",
      payload: { email: "platform-admin@example.local", password: "wrong" },
    });
    expect(failedResponse.statusCode).toBe(401);

    const successResponse = await app.inject({
      method: "POST",
      url: "/auth/platform/login",
      payload: { email: "platform-admin@example.local", password: "local-admin-password" },
    });
    expect(successResponse.statusCode).toBe(200);

    const nextFailedResponse = await app.inject({
      method: "POST",
      url: "/auth/platform/login",
      payload: { email: "platform-admin@example.local", password: "wrong" },
    });
    expect(nextFailedResponse.statusCode).toBe(401);
    await app.close();
  });

  it("rejects expired sessions", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();
    const session = [...dataAccess.sessions.values()][0];
    if (session) {
      session.expiresAt = new Date(Date.now() - 1000);
    }

    const meResponse = await app.inject({
      method: "GET",
      url: "/auth/platform/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(meResponse.statusCode).toBe(401);
    expect(meResponse.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    await app.close();
  });

  it("requires platform admin auth for stores and plans", async () => {
    const { app } = await createTestApp();
    const storesResponse = await app.inject({ method: "GET", url: "/admin/stores" });
    const plansResponse = await app.inject({
      method: "GET",
      url: "/admin/plans",
      headers: { authorization: "Bearer invalid-token" },
    });
    expect(storesResponse.statusCode).toBe(401);
    expect(plansResponse.statusCode).toBe(401);
    await app.close();
  });

  it("lists, creates and updates stores with audit logs", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();

    const listResponse = await app.inject({
      method: "GET",
      url: "/admin/stores",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({ data: [{ slug: "demo-store", domain: "demo.localhost" }] });

    const createResponse = await app.inject({
      method: "POST",
      url: "/admin/stores",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Second Store", slug: "second-store", domain: "second.localhost" },
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({ slug: "second-store", domain: "second.localhost" });

    const getResponse = await app.inject({
      method: "GET",
      url: "/admin/stores/store_2",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({ slug: "second-store", domain: "second.localhost" });

    const duplicateResponse = await app.inject({
      method: "POST",
      url: "/admin/stores",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Duplicate Store", slug: "second-store" },
    });
    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.json()).toMatchObject({ error: { code: "STORE_SLUG_EXISTS" } });

    const updateResponse = await app.inject({
      method: "PATCH",
      url: "/admin/stores/store_2",
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "ACTIVE" },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({ status: "ACTIVE" });
    expect(dataAccess.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "CREATE", entityType: "Store", storeId: "store_2" }),
        expect.objectContaining({ action: "UPDATE", entityType: "Store", storeId: "store_2" }),
      ]),
    );
    await app.close();
  });

  it("maps Prisma store unique constraint races to controlled errors", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();
    dataAccess.throwStoreUniqueTarget = "domain";

    const response = await app.inject({
      method: "POST",
      url: "/admin/stores",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Race Store", slug: "race-store", domain: "race.localhost" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "STORE_DOMAIN_EXISTS" } });
    await app.close();
  });

  it("lists, creates and updates plans with audit logs", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();

    const listResponse = await app.inject({
      method: "GET",
      url: "/admin/plans",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({ data: [{ code: "demo" }] });

    const createResponse = await app.inject({
      method: "POST",
      url: "/admin/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: { code: "growth", name: "Growth" },
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({ code: "growth" });

    const duplicateResponse = await app.inject({
      method: "POST",
      url: "/admin/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: { code: "growth", name: "Growth duplicate" },
    });
    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.json()).toMatchObject({ error: { code: "PLAN_CODE_EXISTS" } });

    const updateResponse = await app.inject({
      method: "PATCH",
      url: "/admin/plans/plan_2",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Growth Plus" },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({ name: "Growth Plus" });
    expect(dataAccess.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "CREATE", entityType: "Plan", entityId: "plan_2" }),
        expect.objectContaining({ action: "UPDATE", entityType: "Plan", entityId: "plan_2" }),
      ]),
    );
    await app.close();
  });

  it("maps Prisma plan unique constraint races to controlled errors", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();
    dataAccess.throwPlanUnique = true;

    const response = await app.inject({
      method: "POST",
      url: "/admin/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: { code: "race", name: "Race Plan" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "PLAN_CODE_EXISTS" } });
    await app.close();
  });

  it("requires platform admin auth for store catalog endpoints", async () => {
    const { app } = await createTestApp();
    const missingToken = await app.inject({ method: "GET", url: "/stores/store_demo/products" });
    const invalidToken = await app.inject({
      method: "GET",
      url: "/stores/store_demo/categories",
      headers: { authorization: "Bearer invalid-token" },
    });
    expect(missingToken.statusCode).toBe(401);
    expect(invalidToken.statusCode).toBe(401);
    await app.close();
  });

  it("lists, creates and updates categories with store-scoped slug validation", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();

    const listResponse = await app.inject({
      method: "GET",
      url: "/stores/store_demo/categories",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({ data: [{ slug: "apparel" }] });

    const createResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/categories",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Sale", slug: "sale", parentId: "cat_apparel" },
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({ slug: "sale", parentId: "cat_apparel" });

    const duplicateResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/categories",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Sale 2", slug: "sale" },
    });
    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.json()).toMatchObject({ error: { code: "CATEGORY_SLUG_EXISTS" } });

    const invalidParentResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/categories",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Bad", slug: "bad", parentId: "other_store_category" },
    });
    expect(invalidParentResponse.statusCode).toBe(400);
    expect(invalidParentResponse.json()).toMatchObject({ error: { code: "CATEGORY_NOT_FOUND" } });

    const updateResponse = await app.inject({
      method: "PATCH",
      url: "/stores/store_demo/categories/cat_2",
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "ARCHIVED", sortOrder: 30 },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({ status: "ARCHIVED", sortOrder: 30 });
    expect(dataAccess.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "CREATE", entityType: "ProductCategory", entityId: "cat_2" }),
        expect.objectContaining({ action: "UPDATE", entityType: "ProductCategory", entityId: "cat_2" }),
      ]),
    );
    await app.close();
  });

  it("lists, creates and updates products with category assignments", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();

    const listResponse = await app.inject({
      method: "GET",
      url: "/stores/store_demo/products",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      data: [{
        slug: "demo-hoodie",
        categoryIds: ["cat_apparel"],
        salesMode: "ONLINE",
        priceVisibility: "VISIBLE",
        primaryAction: "ADD_TO_CART",
        purchasable: true,
      }],
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/products",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: "Demo Tee",
        slug: "demo-tee",
        status: "ACTIVE",
        salesMode: "ONLINE",
        priceVisibility: "VISIBLE",
        primaryAction: "ADD_TO_CART",
        categoryIds: ["cat_apparel"],
      },
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      slug: "demo-tee",
      categoryIds: ["cat_apparel"],
      salesMode: "ONLINE",
      purchasable: true,
    });

    const duplicateResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/products",
      headers: { authorization: `Bearer ${token}` },
      payload: { title: "Duplicate Tee", slug: "demo-tee" },
    });
    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.json()).toMatchObject({ error: { code: "PRODUCT_SLUG_EXISTS" } });

    const inconsistentUpdateResponse = await app.inject({
      method: "PATCH",
      url: "/stores/store_demo/products/product_2",
      headers: { authorization: `Bearer ${token}` },
      payload: { salesMode: "APPOINTMENT" },
    });
    expect(inconsistentUpdateResponse.statusCode).toBe(400);
    expect(inconsistentUpdateResponse.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    const updateResponse = await app.inject({
      method: "PATCH",
      url: "/stores/store_demo/products/product_2",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        status: "ARCHIVED",
        salesMode: "APPOINTMENT",
        priceVisibility: "ON_REQUEST",
        primaryAction: "BOOK_APPOINTMENT",
        appointmentRequired: true,
        purchasable: false,
      },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      status: "ARCHIVED",
      salesMode: "APPOINTMENT",
      primaryAction: "BOOK_APPOINTMENT",
      purchasable: false,
    });
    expect(dataAccess.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "CREATE", entityType: "Product", entityId: "product_2" }),
        expect.objectContaining({ action: "UPDATE", entityType: "Product", entityId: "product_2" }),
      ]),
    );
    await app.close();
  });

  it("creates variants, enforces store-scoped SKU uniqueness and creates inventory items", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();

    const createResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/products/product_hoodie/variants",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: "Black / L",
        sku: "DEMO-HOODIE-BLK-L",
        priceMinor: 129900,
        compareAtMinor: 149900,
        currency: "TRY",
        lowStockThreshold: 8,
      },
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({ sku: "DEMO-HOODIE-BLK-L", priceMinor: 129900 });
    expect(dataAccess.inventory).toContainEqual(
      expect.objectContaining({ variantId: "variant_2", quantityOnHand: 0, lowStockThreshold: 8 }),
    );

    const duplicateResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/products/product_hoodie/variants",
      headers: { authorization: `Bearer ${token}` },
      payload: { title: "Duplicate", sku: "DEMO-HOODIE-BLK-L", priceMinor: 1000 },
    });
    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.json()).toMatchObject({ error: { code: "VARIANT_SKU_EXISTS" } });

    const updateResponse = await app.inject({
      method: "PATCH",
      url: "/stores/store_demo/products/product_hoodie/variants/variant_2",
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "ARCHIVED", priceMinor: 119900 },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({ status: "ARCHIVED", priceMinor: 119900 });
    expect(dataAccess.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "CREATE", entityType: "ProductVariant", entityId: "variant_2" }),
        expect.objectContaining({ action: "UPDATE", entityType: "ProductVariant", entityId: "variant_2" }),
      ]),
    );
    await app.close();
  });

  // F4B — Maliyet/marj + fiyat degisikligi audit.
  it("F4B — tracks cost, enforces cost<=list, and records a price-change audit trail", async () => {
    const { app, login } = await createTestApp();
    const token = await login();
    const auth = { authorization: `Bearer ${token}` };

    // Maliyet liste tavanini (compareAt) asamaz -> 400.
    const badCost = await app.inject({
      method: "POST",
      url: "/stores/store_demo/products/product_hoodie/variants",
      headers: auth,
      payload: { title: "Bad", sku: "F4B-BADCOST", priceMinor: 100000, compareAtMinor: 120000, costMinor: 130000, currency: "TRY" },
    });
    expect(badCost.statusCode).toBe(400);

    // Gecerli maliyet ile olusturma + baslangic audit satiri.
    const created = await app.inject({
      method: "POST",
      url: "/stores/store_demo/products/product_hoodie/variants",
      headers: auth,
      payload: { title: "Cost", sku: "F4B-COST", priceMinor: 100000, compareAtMinor: 120000, costMinor: 60000, currency: "TRY" },
    });
    expect(created.statusCode).toBe(201);
    const variantId = created.json().id as string;
    expect(created.json()).toMatchObject({ costMinor: 60000, compareAtMinor: 120000 });

    // Satis > liste ARTIK 400 DEGIL (yalnizca uyari): compareAt price'in altina cekilebilir.
    const listBelow = await app.inject({
      method: "PATCH",
      url: `/stores/store_demo/products/product_hoodie/variants/${variantId}`,
      headers: auth,
      payload: { compareAtMinor: 90000 },
    });
    expect(listBelow.statusCode).toBe(200);

    // Maliyeti liste tavaninin ustune cikarmaya calismak -> 400 COST_EXCEEDS_LIST.
    const raiseCost = await app.inject({
      method: "PATCH",
      url: `/stores/store_demo/products/product_hoodie/variants/${variantId}`,
      headers: auth,
      payload: { costMinor: 95000 },
    });
    expect(raiseCost.statusCode).toBe(400);
    expect(raiseCost.json()).toMatchObject({ error: { code: "COST_EXCEEDS_LIST" } });

    // Satis fiyatini dusur -> yeni audit satiri.
    const drop = await app.inject({
      method: "PATCH",
      url: `/stores/store_demo/products/product_hoodie/variants/${variantId}`,
      headers: auth,
      payload: { priceMinor: 80000 },
    });
    expect(drop.statusCode).toBe(200);

    // Fiyat gecmisi: en yeni ustte; baslangic + degisiklikler.
    const history = await app.inject({
      method: "GET",
      url: `/stores/store_demo/products/product_hoodie/variants/${variantId}/price-changes`,
      headers: auth,
    });
    expect(history.statusCode).toBe(200);
    const changes = history.json().data as Array<{ newPriceMinor: number | null; source: string }>;
    expect(changes.length).toBeGreaterThanOrEqual(2);
    expect(changes[0]).toMatchObject({ newPriceMinor: 80000, source: "ADMIN_EDIT" });
    // En eski kayit baslangic (create) olmali.
    expect(changes[changes.length - 1]).toMatchObject({ oldPriceMinor: null, newPriceMinor: 100000 });

    await app.close();
  });

  it("lists inventory and records movements for non-negative adjustments", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();
    dataAccess.stores.push({
      id: "store_other",
      name: "Other Store",
      slug: "other-store",
      status: "ACTIVE",
      metadata: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      domain: null,
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/stores/store_demo/inventory",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      data: [{ variantId: "variant_hoodie_m", quantityOnHand: 15, quantityAvailable: 15 }],
    });

    const positiveResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/inventory/variant_hoodie_m/adjust",
      headers: { authorization: `Bearer ${token}` },
      payload: { quantityDelta: 5, reason: "cycle count", referenceType: "manual", referenceId: "adj-1" },
    });
    expect(positiveResponse.statusCode).toBe(200);
    expect(positiveResponse.json()).toMatchObject({
      item: { quantityOnHand: 20, quantityAvailable: 20 },
      movement: { type: "ADJUSTMENT", quantityDelta: 5 },
    });

    const negativeValidResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/inventory/variant_hoodie_m/adjust",
      headers: { authorization: `Bearer ${token}` },
      payload: { quantityDelta: -3 },
    });
    expect(negativeValidResponse.statusCode).toBe(200);
    expect(negativeValidResponse.json()).toMatchObject({ item: { quantityOnHand: 17, quantityAvailable: 17 } });

    const negativeInvalidResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/inventory/variant_hoodie_m/adjust",
      headers: { authorization: `Bearer ${token}` },
      payload: { quantityDelta: -100 },
    });
    expect(negativeInvalidResponse.statusCode).toBe(400);
    expect(negativeInvalidResponse.json()).toMatchObject({
      error: { code: "INVALID_INVENTORY_ADJUSTMENT" },
    });

    const crossStoreResponse = await app.inject({
      method: "POST",
      url: "/stores/store_other/inventory/variant_hoodie_m/adjust",
      headers: { authorization: `Bearer ${token}` },
      payload: { quantityDelta: 1 },
    });
    expect(crossStoreResponse.statusCode).toBe(404);
    expect(crossStoreResponse.json()).toMatchObject({ error: { code: "INVENTORY_ITEM_NOT_FOUND" } });
    expect(dataAccess.movements).toHaveLength(2);
    expect(dataAccess.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "UPDATE",
          entityType: "InventoryItem",
          metadata: expect.objectContaining({ quantityDelta: 5 }),
        }),
      ]),
    );
    await app.close();
  });

  it("creates draft orders with line snapshots and lists/gets them", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();

    const createResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        customerEmail: "buyer@example.com",
        currency: "TRY",
        lines: [{ variantId: "variant_hoodie_m", quantity: 2 }],
        addresses: [{
          type: "SHIPPING",
          fullName: "Demo Buyer",
          countryCode: "TR",
          city: "Istanbul",
          addressLine1: "Smoke Street 1",
        }],
      },
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      status: "DRAFT",
      customerEmail: "buyer@example.com",
      subtotalAmount: 259800,
      lines: [{
        sku: "DEMO-HOODIE-BLK-M",
        title: "Demo Hoodie",
        variantTitle: "Black / M",
        unitPriceAmount: 129900,
        totalAmount: 259800,
      }],
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/stores/store_demo/orders",
      headers: { authorization: `Bearer ${token}` },
    });
    const getResponse = await app.inject({
      method: "GET",
      url: "/stores/store_demo/orders/order_1",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(getResponse.statusCode).toBe(200);
    expect(dataAccess.auditLogs).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "CREATE", entityType: "Order" })]),
    );
    await app.close();
  });

  it("filters orders by status, payment, fulfillment, search and date range (TODO-073)", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();

    for (const email of ["alice@example.com", "bob@example.com", "carol@example.com"]) {
      const res = await app.inject({
        method: "POST",
        url: "/stores/store_demo/orders",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          customerEmail: email,
          currency: "TRY",
          lines: [{ variantId: "variant_hoodie_m", quantity: 1 }],
        },
      });
      expect(res.statusCode).toBe(201);
    }

    const [o1, o2, o3] = dataAccess.orders;
    o1!.status = "PLACED";
    o1!.paymentStatus = "PAID";
    o1!.fulfillmentStatus = "FULFILLED";
    o1!.createdAt = new Date("2026-06-10T10:00:00.000Z");
    o2!.status = "CANCELLED";
    o2!.paymentStatus = "REFUNDED";
    o2!.fulfillmentStatus = "CANCELLED";
    o2!.createdAt = new Date("2026-06-20T10:00:00.000Z");
    o3!.status = "DRAFT";
    o3!.paymentStatus = "UNPAID";
    o3!.fulfillmentStatus = "UNFULFILLED";
    o3!.createdAt = new Date("2026-07-01T10:00:00.000Z");

    const get = (qs: string) =>
      app.inject({
        method: "GET",
        url: `/stores/store_demo/orders${qs}`,
        headers: { authorization: `Bearer ${token}` },
      });
    const emails = (response: Awaited<ReturnType<typeof get>>): string[] =>
      (response.json().data as Array<{ customerEmail: string }>).map((o) => o.customerEmail);

    expect(emails(await get("?status=PLACED"))).toEqual(["alice@example.com"]);
    expect(emails(await get("?paymentStatus=REFUNDED"))).toEqual(["bob@example.com"]);
    expect(emails(await get("?fulfillmentStatus=FULFILLED"))).toEqual(["alice@example.com"]);
    expect(emails(await get("?search=carol"))).toEqual(["carol@example.com"]);

    const dated = await get("?dateFrom=2026-06-01&dateTo=2026-06-30");
    expect(dated.json().pagination.total).toBe(2);

    const combo = await get("?dateFrom=2026-06-01&dateTo=2026-06-30&paymentStatus=PAID");
    expect(emails(combo)).toEqual(["alice@example.com"]);

    const none = await get("?status=PLACED&paymentStatus=REFUNDED");
    expect(none.json().pagination.total).toBe(0);
    expect(none.json().data).toEqual([]);

    const invalid = await get("?status=BOGUS");
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    await app.close();
  });

  it("places orders by reserving stock and blocks oversell", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();

    await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        customerEmail: "buyer@example.com",
        currency: "TRY",
        lines: [{ variantId: "variant_hoodie_m", quantity: 15 }],
      },
    });
    const placeResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders/order_1/place",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(placeResponse.statusCode).toBe(200);
    expect(placeResponse.json()).toMatchObject({
      status: "PLACED",
      reservations: [{ status: "ACTIVE", quantity: 15 }],
    });
    expect(dataAccess.inventory.find((item) => item.variantId === "variant_hoodie_m")).toMatchObject({
      quantityReserved: 15,
    });

    await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        customerEmail: "buyer2@example.com",
        currency: "TRY",
        lines: [{ variantId: "variant_hoodie_m", quantity: 1 }],
      },
    });
    const oversellResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders/order_2/place",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(oversellResponse.statusCode).toBe(409);
    expect(oversellResponse.json()).toMatchObject({ error: { code: "ORDER_INSUFFICIENT_STOCK" } });
    await app.close();
  });

  it("cancels orders by releasing reservations exactly once and blocks later line mutation", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();

    await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        customerEmail: "buyer@example.com",
        currency: "TRY",
        lines: [{ variantId: "variant_hoodie_m", quantity: 3 }],
      },
    });
    await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders/order_1/place",
      headers: { authorization: `Bearer ${token}` },
    });
    const mutationResponse = await app.inject({
      method: "PATCH",
      url: "/stores/store_demo/orders/order_1/lines/line_1",
      headers: { authorization: `Bearer ${token}` },
      payload: { quantity: 1 },
    });
    expect(mutationResponse.statusCode).toBe(409);
    expect(mutationResponse.json()).toMatchObject({ error: { code: "ORDER_MUTATION_NOT_ALLOWED" } });

    const cancelResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders/order_1/cancel",
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: "buyer request" },
    });
    const doubleCancelResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders/order_1/cancel",
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: "repeat" },
    });
    expect(cancelResponse.statusCode).toBe(200);
    expect(doubleCancelResponse.statusCode).toBe(200);
    expect(dataAccess.inventory.find((item) => item.variantId === "variant_hoodie_m")).toMatchObject({
      quantityReserved: 0,
    });
    expect(dataAccess.movements.filter((movement) => movement.type === "SALE_RELEASE")).toHaveLength(1);
    await app.close();
  });

  it("rejects missing auth, cross-store variants and inactive products for orders", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const missingAuth = await app.inject({ method: "GET", url: "/stores/store_demo/orders" });
    expect(missingAuth.statusCode).toBe(401);

    const token = await login();
    dataAccess.stores.push({
      id: "store_other",
      name: "Other Store",
      slug: "other-store",
      status: "ACTIVE",
      metadata: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      domain: null,
    });
    const crossStoreResponse = await app.inject({
      method: "POST",
      url: "/stores/store_other/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        customerEmail: "buyer@example.com",
        currency: "TRY",
        lines: [{ variantId: "variant_hoodie_m", quantity: 1 }],
      },
    });
    expect(crossStoreResponse.statusCode).toBe(404);
    expect(crossStoreResponse.json()).toMatchObject({ error: { code: "VARIANT_NOT_FOUND" } });

    dataAccess.products[0]!.status = "ARCHIVED";
    const inactiveResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        customerEmail: "buyer@example.com",
        currency: "TRY",
        lines: [{ variantId: "variant_hoodie_m", quantity: 1 }],
      },
    });
    expect(inactiveResponse.statusCode).toBe(400);
    expect(inactiveResponse.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });

  it("rejects non-online product sales modes in order create, add-line and place", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();
    dataAccess.products[0]!.salesMode = "INQUIRY";
    dataAccess.products[0]!.primaryAction = "REQUEST_PRICE";
    dataAccess.products[0]!.inquiryEnabled = true;
    dataAccess.products[0]!.purchasable = false;

    const createResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        customerEmail: "buyer@example.com",
        currency: "TRY",
        lines: [{ variantId: "variant_hoodie_m", quantity: 1 }],
      },
    });
    expect(createResponse.statusCode).toBe(400);
    expect(createResponse.json()).toMatchObject({ error: { code: "PRODUCT_REQUIRES_INQUIRY" } });

    dataAccess.products[0]!.salesMode = "ONLINE";
    dataAccess.products[0]!.primaryAction = "ADD_TO_CART";
    dataAccess.products[0]!.inquiryEnabled = false;
    dataAccess.products[0]!.purchasable = true;
    await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        customerEmail: "buyer@example.com",
        currency: "TRY",
        lines: [{ variantId: "variant_hoodie_m", quantity: 1 }],
      },
    });

    dataAccess.products.push({
      ...dataAccess.products[0]!,
      id: "product_catalog",
      slug: "catalog-only-product",
      title: "Catalog Only Product",
      salesMode: "CATALOG_ONLY",
      primaryAction: "NONE",
      purchasable: false,
    });
    dataAccess.variants.push({
      ...dataAccess.variants[0]!,
      id: "variant_catalog",
      productId: "product_catalog",
      sku: "CATALOG-ONLY",
    });
    const addLineResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders/order_1/lines",
      headers: { authorization: `Bearer ${token}` },
      payload: { variantId: "variant_catalog", quantity: 1 },
    });
    expect(addLineResponse.statusCode).toBe(400);
    expect(addLineResponse.json()).toMatchObject({ error: { code: "PRODUCT_CATALOG_ONLY" } });

    dataAccess.products[0]!.salesMode = "WHATSAPP";
    dataAccess.products[0]!.primaryAction = "WHATSAPP";
    dataAccess.products[0]!.whatsappEnabled = true;
    dataAccess.products[0]!.purchasable = false;
    const placeResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders/order_1/place",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(placeResponse.statusCode).toBe(400);
    expect(placeResponse.json()).toMatchObject({ error: { code: "PRODUCT_REQUIRES_WHATSAPP" } });

    dataAccess.products[0]!.salesMode = "ONLINE";
    dataAccess.products[0]!.primaryAction = "ADD_TO_CART";
    dataAccess.products[0]!.priceVisibility = "VISIBLE";
    dataAccess.products[0]!.whatsappEnabled = false;
    dataAccess.products[0]!.purchasable = false;
    const notPurchasableResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        customerEmail: "buyer2@example.com",
        currency: "TRY",
        lines: [{ variantId: "variant_hoodie_m", quantity: 1 }],
      },
    });
    expect(notPurchasableResponse.statusCode).toBe(400);
    expect(notPurchasableResponse.json()).toMatchObject({ error: { code: "PRODUCT_NOT_PURCHASABLE" } });
    await app.close();
  });

  it("rejects excessive order quantity before DB integer overflow", async () => {
    const { app, login } = await createTestApp();
    const token = await login();
    const response = await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        customerEmail: "buyer@example.com",
        currency: "TRY",
        lines: [{ variantId: "variant_hoodie_m", quantity: 10001 }],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });

  it("does not let reservation release make reserved stock negative", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();
    await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        customerEmail: "buyer@example.com",
        currency: "TRY",
        lines: [{ variantId: "variant_hoodie_m", quantity: 2 }],
      },
    });
    await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders/order_1/place",
      headers: { authorization: `Bearer ${token}` },
    });
    const item = dataAccess.inventory.find((inventory) => inventory.variantId === "variant_hoodie_m");
    if (item) item.quantityReserved = 1;

    const response = await app.inject({
      method: "POST",
      url: "/stores/store_demo/orders/order_1/cancel",
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: "corrupt reserved smoke" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "ORDER_RESERVATION_FAILED" } });
    expect(item?.quantityReserved).toBe(1);
    await app.close();
  });
});

describe("api gateway · store-admin customers (F3B.3)", () => {
  it("requires auth for the customers directory", async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/stores/store_demo/customers" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("lists store customers with safe account/membership fields only", async () => {
    const { app, login } = await createTestApp();
    const token = await login();
    const response = await app.inject({
      method: "GET",
      url: "/stores/store_demo/customers",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.pagination.total).toBe(2);
    expect(body.data).toHaveLength(2);

    const member = body.data.find((customer: { id: string }) => customer.id === "cust_member");
    expect(member).toMatchObject({
      email: "member@example.local",
      fullName: "Ayşe Yılmaz",
      status: "ACTIVE",
      emailVerified: true,
      phoneVerified: false,
      hasCredential: true,
      orderCount: 2,
      totalSpentMinor: 259800,
      addressCount: 1,
      defaultAddressSummary: "İstanbul, Kadıköy",
    });

    const guest = body.data.find((customer: { id: string }) => customer.id === "cust_guest");
    expect(guest).toMatchObject({ hasCredential: false, orderCount: 0, defaultAddressSummary: null });

    // PII/secret minimizasyonu: hash/token/OTP/tam PII yüzeye çıkmaz.
    const serialized = response.body;
    for (const leaked of [
      "passwordHash",
      "tokenHash",
      "codeHash",
      "credential",
      "sessions",
      "otpVerifications",
      "tckn",
      "iban",
    ]) {
      expect(serialized).not.toContain(leaked);
    }
    await app.close();
  });

  it("never returns another store's customers (tenant scope)", async () => {
    const { app, login } = await createTestApp();
    const token = await login();
    const response = await app.inject({
      method: "GET",
      url: "/stores/store_demo/customers",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = response.json();
    const ids = body.data.map((customer: { id: string }) => customer.id);
    expect(ids).not.toContain("cust_other_store");
    await app.close();
  });
});

describe("api gateway · store-admin customer detail & management (F3B.3)", () => {
  async function auth() {
    const { app, login } = await createTestApp();
    const token = await login();
    return { app, token, close: () => app.close() };
  }

  it("requires auth for the customer detail", async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/stores/store_demo/customers/cust_member" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns a tenant-scoped detail with addresses/ibans/orders/preferences", async () => {
    const { app, token, close } = await auth();
    const response = await app.inject({
      method: "GET",
      url: "/stores/store_demo/customers/cust_member",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.customer).toMatchObject({ id: "cust_member", fullName: "Ayşe Yılmaz", hasCredential: true });
    expect(body.customer.orderCount).toBe(1);
    expect(body.customer.totalSpentMinor).toBe(129900);
    expect(Array.isArray(body.addresses)).toBe(true);
    expect(Array.isArray(body.ibans)).toBe(true);
    expect(body.orders).toHaveLength(1);
    expect(body.communicationPreference).toMatchObject({ emailEnabled: true });
    // Secret/PII sızıntısı yok.
    for (const leaked of ["passwordHash", "tokenHash", "codeHash", "otp"]) {
      expect(response.body.toLowerCase()).not.toContain(leaked.toLowerCase());
    }
    await close();
  });

  it("returns 404 for a customer from another store", async () => {
    const { app, token, close } = await auth();
    const response = await app.inject({
      method: "GET",
      url: "/stores/store_demo/customers/cust_other_store",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(404);
    await close();
  });

  it("updates basic info and resets email verification when email changes", async () => {
    const { app, token, close } = await auth();
    const response = await app.inject({
      method: "PATCH",
      url: "/stores/store_demo/customers/cust_member",
      headers: { authorization: `Bearer ${token}` },
      payload: { firstName: "Ayşegül", email: "new@example.local" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().customer).toMatchObject({ firstName: "Ayşegül", email: "new@example.local", emailVerified: false });
    await close();
  });

  it("rejects an email already used in the same store (409)", async () => {
    const { app, token, close } = await auth();
    const response = await app.inject({
      method: "PATCH",
      url: "/stores/store_demo/customers/cust_member",
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "taken@example.local" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "EMAIL_TAKEN" } });
    await close();
  });

  it("updates status ACTIVE/PASSIVE/BLOCKED", async () => {
    const { app, token, close } = await auth();
    for (const status of ["PASSIVE", "BLOCKED", "ACTIVE"] as const) {
      const response = await app.inject({
        method: "PATCH",
        url: "/stores/store_demo/customers/cust_member",
        headers: { authorization: `Bearer ${token}` },
        payload: { status },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().customer.status).toBe(status);
    }
    await close();
  });

  it("does not let PATCH touch another store's customer (404)", async () => {
    const { app, token, close } = await auth();
    const response = await app.inject({
      method: "PATCH",
      url: "/stores/store_demo/customers/cust_other_store",
      headers: { authorization: `Bearer ${token}` },
      payload: { firstName: "Hacked" },
    });
    expect(response.statusCode).toBe(404);
    await close();
  });

  it("creates, updates, sets-default and deletes an address with TCKN validation", async () => {
    const { app, token, close } = await auth();
    const base = {
      addressName: "Ev",
      fullName: "Ayşe Yılmaz",
      phone: "5551112233",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine1: "Caferağa Mah.",
    };
    // Geçersiz TCKN reddedilir.
    const bad = await app.inject({
      method: "POST",
      url: "/stores/store_demo/customers/cust_member/addresses",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...base, billingType: "INDIVIDUAL", tckn: "123" },
    });
    expect(bad.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/stores/store_demo/customers/cust_member/addresses",
      headers: { authorization: `Bearer ${token}` },
      payload: base,
    });
    expect(created.statusCode).toBe(201);
    const addressId = created.json().address.id;

    const updated = await app.inject({
      method: "PATCH",
      url: `/stores/store_demo/customers/cust_member/addresses/${addressId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...base, addressName: "İş" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().address.addressName).toBe("İş");

    const def = await app.inject({
      method: "POST",
      url: `/stores/store_demo/customers/cust_member/addresses/${addressId}/default`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(def.statusCode).toBe(200);

    const removed = await app.inject({
      method: "DELETE",
      url: `/stores/store_demo/customers/cust_member/addresses/${addressId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({ deleted: true });
    await close();
  });

  it("rejects a corporate address with an invalid VKN", async () => {
    const { app, token, close } = await auth();
    const response = await app.inject({
      method: "POST",
      url: "/stores/store_demo/customers/cust_member/addresses",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        addressName: "Ofis",
        fullName: "Acme A.Ş.",
        phone: "5551112233",
        city: "İstanbul",
        district: "Şişli",
        addressLine1: "Plaza",
        billingType: "CORPORATE",
        companyName: "Acme",
        taxOffice: "Şişli",
        taxNumber: "123",
      },
    });
    expect(response.statusCode).toBe(400);
    await close();
  });

  it("updates communication preferences", async () => {
    const { app, token, close } = await auth();
    const response = await app.inject({
      method: "PUT",
      url: "/stores/store_demo/customers/cust_member/communication-preferences",
      headers: { authorization: `Bearer ${token}` },
      payload: { smsEnabled: true, emailEnabled: false, phoneEnabled: true },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ smsEnabled: true, emailEnabled: false, phoneEnabled: true });
    await close();
  });

  it("adds an IBAN and returns it masked (never full)", async () => {
    const { app, token, close } = await auth();
    const fullIban = "TR330006100519786457841326";
    const response = await app.inject({
      method: "POST",
      url: "/stores/store_demo/customers/cust_member/ibans",
      headers: { authorization: `Bearer ${token}` },
      payload: { accountHolderName: "Ayşe Yılmaz", iban: fullIban, isDefault: true },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().iban.ibanMasked).toBeTruthy();
    expect(response.body).not.toContain(fullIban);
    await close();
  });

  it("returns only the customer's own orders in detail", async () => {
    const { app, token, close } = await auth();
    const response = await app.inject({
      method: "GET",
      url: "/stores/store_demo/customers/cust_member",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = response.json();
    expect(body.orders.every((order: { orderNumber: string }) => order.orderNumber === "OS-0001")).toBe(true);
    await close();
  });
});

describe("api gateway · public catalog (TD-032)", () => {
  // Bu uclar AUTH GEREKTIRMEZ; token gonderilmeden cagrilir.
  function seedDraftProduct(dataAccess: MemoryDataAccess) {
    dataAccess.products.push({
      ...dataAccess.products[0]!,
      id: "product_draft",
      slug: "draft-product",
      title: "Draft Product",
      status: "DRAFT",
    });
    dataAccess.variants.push({
      ...dataAccess.variants[0]!,
      id: "variant_draft",
      productId: "product_draft",
      sku: "DRAFT-SKU",
    });
  }

  function seedSecondActiveStore(dataAccess: MemoryDataAccess) {
    dataAccess.stores.push({
      id: "store_other",
      name: "Other Store",
      slug: "other-store",
      status: "ACTIVE",
      metadata: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      domain: null,
    });
    dataAccess.products.push({
      ...dataAccess.products[0]!,
      id: "product_other",
      storeId: "store_other",
      slug: "other-product",
      title: "Other Store Product",
      status: "ACTIVE",
    });
    dataAccess.variants.push({
      ...dataAccess.variants[0]!,
      id: "variant_other",
      productId: "product_other",
      storeId: "store_other",
      sku: "OTHER-SKU",
    });
  }

  it("serves the product list without any auth token (200)", async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/public/stores/demo-store/products" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ slug: "demo-hoodie", title: "Demo Hoodie", categoryLabel: "Apparel" });
    expect(body.data[0].variants[0]).toMatchObject({ sku: "DEMO-HOODIE-BLK-M", priceMinor: 129900, inStock: true });
    // F4B — Omnibus: indirim (compareAt 149900 > price 129900) varken lowestPriceMinor
    // dolu gelir; 30 gunde kayit yoksa mevcut satis fiyatina fallback eder.
    expect(body.data[0].variants[0].lowestPriceMinor).toBe(129900);
    await app.close();
  });

  it("serves product detail without any auth token (200)", async () => {
    const { app } = await createTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/public/stores/demo-store/products/demo-hoodie",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      slug: "demo-hoodie",
      description: "Seeded hoodie product.",
      salesMode: "ONLINE",
      priceVisibility: "VISIBLE",
      primaryAction: "ADD_TO_CART",
      variants: [{ sku: "DEMO-HOODIE-BLK-M", available: 15, inStock: true }],
    });
    await app.close();
  });

  it("never exposes draft/inactive products in list or detail", async () => {
    const { app, dataAccess } = await createTestApp();
    seedDraftProduct(dataAccess);

    const listResponse = await app.inject({ method: "GET", url: "/public/stores/demo-store/products" });
    expect(listResponse.json().data.map((p: { slug: string }) => p.slug)).toEqual(["demo-hoodie"]);

    const detailResponse = await app.inject({
      method: "GET",
      url: "/public/stores/demo-store/products/draft-product",
    });
    expect(detailResponse.statusCode).toBe(404);
    expect(detailResponse.json()).toMatchObject({ error: { code: "PRODUCT_NOT_FOUND" } });
    await app.close();
  });

  it("does not leak products from another store (tenant isolation)", async () => {
    const { app, dataAccess } = await createTestApp();
    seedSecondActiveStore(dataAccess);

    const demoList = await app.inject({ method: "GET", url: "/public/stores/demo-store/products" });
    expect(demoList.json().data.map((p: { slug: string }) => p.slug)).toEqual(["demo-hoodie"]);

    // Diger store'un urunu demo-store detayindan da cozulemez.
    const crossDetail = await app.inject({
      method: "GET",
      url: "/public/stores/demo-store/products/other-product",
    });
    expect(crossDetail.statusCode).toBe(404);

    const otherList = await app.inject({ method: "GET", url: "/public/stores/other-store/products" });
    expect(otherList.json().data.map((p: { slug: string }) => p.slug)).toEqual(["other-product"]);
    await app.close();
  });

  it("returns the sales-mode contract fields used by the storefront CTA mapping", async () => {
    const { app, dataAccess } = await createTestApp();
    dataAccess.products[0]!.salesMode = "WHATSAPP";
    dataAccess.products[0]!.primaryAction = "WHATSAPP";
    dataAccess.products[0]!.whatsappEnabled = true;
    dataAccess.products[0]!.purchasable = false;
    dataAccess.products[0]!.priceVisibility = "VISIBLE";

    const response = await app.inject({
      method: "GET",
      url: "/public/stores/demo-store/products/demo-hoodie",
    });
    expect(response.json()).toMatchObject({
      salesMode: "WHATSAPP",
      primaryAction: "WHATSAPP",
      whatsappEnabled: true,
      purchasable: false,
    });
    await app.close();
  });

  it("hides numeric prices when priceVisibility is HIDDEN/ON_REQUEST", async () => {
    const { app, dataAccess } = await createTestApp();
    dataAccess.products[0]!.salesMode = "INQUIRY";
    dataAccess.products[0]!.primaryAction = "REQUEST_PRICE";
    dataAccess.products[0]!.priceVisibility = "ON_REQUEST";
    dataAccess.products[0]!.inquiryEnabled = true;
    dataAccess.products[0]!.purchasable = false;

    const response = await app.inject({
      method: "GET",
      url: "/public/stores/demo-store/products/demo-hoodie",
    });
    expect(response.statusCode).toBe(200);
    const variant = response.json().variants[0];
    expect(variant.priceMinor).toBeNull();
    expect(variant.compareAtMinor).toBeNull();
    // Stok durumu hala public; yalniz numerik fiyat gizlenir.
    expect(variant.inStock).toBe(true);
    // Ham gizli fiyat (129900 / 149900) govdede hicbir yerde gorunmemeli.
    expect(response.body).not.toContain("129900");
    expect(response.body).not.toContain("149900");
    await app.close();
  });

  it("does not serialize admin/internal-only fields", async () => {
    const { app } = await createTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/public/stores/demo-store/products/demo-hoodie",
    });
    const body = response.json();
    for (const internalKey of [
      "storeId",
      "status",
      "type",
      "vendor",
      "seoTitle",
      "seoDescription",
      "categoryIds",
      "createdAt",
      "updatedAt",
    ]) {
      expect(body).not.toHaveProperty(internalKey);
      expect(body.variants[0]).not.toHaveProperty(internalKey);
    }
    await app.close();
  });

  it("returns a safe 404 for an unknown store, inactive store and unknown product", async () => {
    const { app, dataAccess } = await createTestApp();
    dataAccess.stores.push({
      id: "store_suspended",
      name: "Suspended Store",
      slug: "suspended-store",
      status: "SUSPENDED",
      metadata: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      domain: null,
    });

    const unknownStore = await app.inject({ method: "GET", url: "/public/stores/nope/products" });
    expect(unknownStore.statusCode).toBe(404);
    expect(unknownStore.json()).toMatchObject({ error: { code: "STORE_NOT_FOUND" } });

    const inactiveStore = await app.inject({
      method: "GET",
      url: "/public/stores/suspended-store/products",
    });
    expect(inactiveStore.statusCode).toBe(404);
    expect(inactiveStore.json()).toMatchObject({ error: { code: "STORE_NOT_FOUND" } });

    const unknownProduct = await app.inject({
      method: "GET",
      url: "/public/stores/demo-store/products/missing",
    });
    expect(unknownProduct.statusCode).toBe(404);
    expect(unknownProduct.json()).toMatchObject({ error: { code: "PRODUCT_NOT_FOUND" } });
    await app.close();
  });
});

describe("api gateway · public cart + checkout (F3B.1)", () => {
  // Bu uclar AUTH GEREKTIRMEZ; vitrin cookie'si yalnizca {variantId, quantity}
  // referansi gonderir. Fiyat/baslik/salesMode/stok sunucu-otoriterdir.
  const VARIANT = "variant_hoodie_m";

  function cartReq(app: Awaited<ReturnType<typeof createTestApp>>["app"], items: unknown, slug = "demo-store") {
    return app.inject({ method: "POST", url: `/public/stores/${slug}/cart`, payload: { items } });
  }

  const validContact = { fullName: "Ada Lovelace", email: "ada@example.com", phone: "+905551112233" };
  const validAddress = {
    country: "TR",
    city: "Istanbul",
    district: "Kadikoy",
    addressLine1: "Bagdat Cad. 1",
    postalCode: "34000",
  };
  // F3B.2 — Fatura zorunlu. Gecerli T.C. Kimlik No (10000000146) ile bireysel fatura.
  const validBilling = {
    type: "INDIVIDUAL" as const,
    sameAsShipping: true,
    name: "Ada Lovelace",
    tckn: "10000000146",
  };

  function checkoutReq(
    app: Awaited<ReturnType<typeof createTestApp>>["app"],
    payload: unknown,
    slug = "demo-store",
  ) {
    // Test gövdeleri billing belirtmezse varsayilan gecerli bireysel faturayi ekle.
    const withBilling =
      payload && typeof payload === "object" && !Array.isArray(payload) && !("billing" in payload)
        ? { ...(payload as Record<string, unknown>), billing: validBilling }
        : payload;
    return app.inject({ method: "POST", url: `/public/stores/${slug}/checkout`, payload: withBilling });
  }

  // F4A — Bellek deposuna dogrudan ACTIVE kampanya/kupon seed'i (public akis testleri).
  function seedCampaign(
    dataAccess: MemoryDataAccess,
    overrides: Partial<CampaignRecord> = {},
  ): CampaignRecord {
    const now = new Date("2026-07-01T00:00:00.000Z");
    const campaign: CampaignRecord = {
      id: `camp_seed_${dataAccess.campaigns.length + 1}`,
      storeId: "store_demo",
      name: "Kupon Kampanyasi",
      description: null,
      status: "ACTIVE",
      type: "COUPON_CODE",
      discountType: "PERCENT",
      discountValue: 10,
      maxDiscountAmountMinor: null,
      minOrderAmountMinor: null,
      startsAt: null,
      endsAt: null,
      totalUsageLimit: null,
      perCustomerUsageLimit: null,
      usageCount: 0,
      stackable: false,
      priority: 0,
      isPublic: true,
      displayTitle: null,
      shortDescription: null,
      terms: null,
      badgeLabel: null,
      badgeVariant: null,
      cardStyle: "STANDARD",
      accessModel: "AUTO_VISIBLE",
      displayPriority: 0,
      productIds: [],
      categoryIds: [],
      coupons: [],
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    dataAccess.campaigns.push(campaign);
    return campaign;
  }

  function seedCouponCampaign(
    dataAccess: MemoryDataAccess,
    overrides: Partial<CampaignRecord> = {},
    code = "KUPON10",
  ): CampaignRecord {
    const campaign = seedCampaign(dataAccess, overrides);
    campaign.coupons.push({
      id: `coup_seed_${campaign.id}`,
      code,
      normalizedCode: code.toUpperCase(),
      status: "ACTIVE",
      totalUsageLimit: null,
      perCustomerUsageLimit: null,
      usageCount: 0,
      startsAt: null,
      endsAt: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    return campaign;
  }

  // F4A.1 — Public urun listesi/detayi kampanya rozeti tasir (allowlist);
  // isPublic=false kampanya public projeksiyona ASLA girmez.
  it("F4A.1: public product list carries a campaign badge without leaking internals", async () => {
    const { app, dataAccess } = await createTestApp();
    seedCampaign(dataAccess, {
      type: "AUTOMATIC_CART",
      discountType: "PERCENT",
      discountValue: 10,
      minOrderAmountMinor: 100000,
      priority: 5,
    });

    const response = await app.inject({ method: "GET", url: "/public/stores/demo-store/products" });
    expect(response.statusCode).toBe(200);
    const product = response.json().data[0];
    // F4A.3 — Taksonomi alanlari (displayKind/couponAction/endsAt) additive; otomatik
    // kampanyada kod sizmaz (couponCode=null, MANUAL_ONLY).
    expect(product.campaign).toEqual({
      kind: "AUTOMATIC",
      displayKind: "AUTOMATIC_CART_DISCOUNT",
      requiresCouponCode: false,
      discountType: "PERCENT",
      discountValue: 10,
      minOrderAmountMinor: 100000,
      couponCode: null,
      couponAction: "MANUAL_ONLY",
      endsAt: null,
      // F4A.6 — Tek-fiyatli urun (₺1.299) + min-order (₺1.000) karsilaniyor =>
      // guvenli tahmin: %10 x 129900 = 12990 indirim, nihai 116910.
      estimatedDiscountMinor: 12990,
      estimatedFinalUnitPriceMinor: 116910,
      // F4A.4 — Sunum alanlari (ADR-061); seed varsayilanlariyla null/STANDARD.
      displayTitle: null,
      shortDescription: null,
      badgeLabel: null,
      badgeVariant: null,
      cardStyle: "STANDARD",
      terms: null,
    });
    // Ic alanlar (id/priority/usage/stackable) public govdeye sizmaz.
    expect(JSON.stringify(product.campaign)).not.toContain("camp_seed");
    expect(product.campaign.priority).toBeUndefined();
    expect(product.campaign.usageCount).toBeUndefined();
    expect(product.campaign.stackable).toBeUndefined();
    await app.close();
  });

  // F4A.3 — Public kupon kampanyasi: PUBLIC_COUPON + guvenli kod + CLAIM aksiyonu.
  it("F4A.3: public coupon product exposes a safe coupon code and claim action", async () => {
    const { app, dataAccess } = await createTestApp();
    seedCouponCampaign(dataAccess, { discountType: "FIXED_AMOUNT", discountValue: 25000 }, "TEST250");

    const response = await app.inject({ method: "GET", url: "/public/stores/demo-store/products" });
    expect(response.statusCode).toBe(200);
    const product = response.json().data[0];
    expect(product.campaign.kind).toBe("COUPON");
    expect(product.campaign.displayKind).toBe("PUBLIC_COUPON");
    expect(product.campaign.requiresCouponCode).toBe(true);
    expect(product.campaign.couponCode).toBe("TEST250");
    expect(product.campaign.couponAction).toBe("CLAIM");
    // Ic alanlar sizmaz.
    expect(product.campaign.priority).toBeUndefined();
    expect(product.campaign.usageCount).toBeUndefined();
    await app.close();
  });

  it("F4A.1: non-public and paused campaigns never produce a public badge", async () => {
    const { app, dataAccess } = await createTestApp();
    seedCouponCampaign(dataAccess, { isPublic: false }, "GIZLI10");
    seedCampaign(dataAccess, { type: "AUTOMATIC_CART", status: "PAUSED" });

    const response = await app.inject({ method: "GET", url: "/public/stores/demo-store/products" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0].campaign).toBeNull();
    await app.close();
  });

  it("resolves an ONLINE variant into a purchasable cart line (subtotal computed server-side)", async () => {
    const { app } = await createTestApp();
    const response = await cartReq(app, [{ variantId: VARIANT, quantity: 2 }]);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]).toMatchObject({
      variantId: VARIANT,
      productSlug: "demo-hoodie",
      title: "Demo Hoodie",
      variantTitle: "Black / M",
      quantity: 2,
      availableQuantity: 2,
      unitPriceMinor: 129900,
      lineTotalMinor: 259800,
      currency: "TRY",
      status: "OK",
    });
    expect(body.subtotalMinor).toBe(259800);
    expect(body.itemCount).toBe(2);
    expect(body.checkoutReady).toBe(true);
    await app.close();
  });

  it("returns an empty, non-checkout-ready cart for no items", async () => {
    const { app } = await createTestApp();
    const response = await cartReq(app, []);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ lines: [], subtotalMinor: 0, itemCount: 0, checkoutReady: false });
    await app.close();
  });

  for (const mode of ["CATALOG_ONLY", "INQUIRY", "APPOINTMENT", "WHATSAPP"] as const) {
    it(`marks a ${mode} variant UNAVAILABLE and blocks checkout (no price leak)`, async () => {
      const { app, dataAccess } = await createTestApp();
      dataAccess.products[0]!.salesMode = mode;
      dataAccess.products[0]!.purchasable = false;

      const cart = await cartReq(app, [{ variantId: VARIANT, quantity: 1 }]);
      const body = cart.json();
      expect(body.lines[0]).toMatchObject({ status: "UNAVAILABLE", unitPriceMinor: 0, lineTotalMinor: 0 });
      expect(body.checkoutReady).toBe(false);
      // Numerik fiyat (gizli) govdede sizmamali.
      expect(cart.body).not.toContain("129900");

      const checkout = await checkoutReq(app, {
        items: [{ variantId: VARIANT, quantity: 1 }],
        contact: validContact,
        shippingAddress: validAddress,
      });
      expect(checkout.statusCode).toBe(409);
      expect(checkout.json()).toMatchObject({ error: { code: "CART_NOT_READY" } });
      await app.close();
    });
  }

  it("never leaks numeric price for HIDDEN/ON_REQUEST price visibility in the cart", async () => {
    const { app, dataAccess } = await createTestApp();
    dataAccess.products[0]!.salesMode = "INQUIRY";
    dataAccess.products[0]!.priceVisibility = "ON_REQUEST";
    dataAccess.products[0]!.purchasable = false;

    const response = await cartReq(app, [{ variantId: VARIANT, quantity: 1 }]);
    expect(response.json().lines[0]).toMatchObject({ status: "UNAVAILABLE", unitPriceMinor: 0 });
    expect(response.body).not.toContain("129900");
    expect(response.body).not.toContain("149900");
    await app.close();
  });

  it("ignores client-supplied price/title/salesMode (server is authoritative)", async () => {
    const { app } = await createTestApp();
    const response = await cartReq(app, [
      { variantId: VARIANT, quantity: 1, priceMinor: 1, title: "HACKED", salesMode: "CATALOG_ONLY" },
    ]);
    expect(response.statusCode).toBe(200);
    expect(response.json().lines[0]).toMatchObject({
      title: "Demo Hoodie",
      unitPriceMinor: 129900,
      status: "OK",
    });
    await app.close();
  });

  it("clamps quantity to available stock (QUANTITY_ADJUSTED) and blocks checkout until reconciled", async () => {
    const { app } = await createTestApp();
    const response = await cartReq(app, [{ variantId: VARIANT, quantity: 20 }]);
    const body = response.json();
    expect(body.lines[0]).toMatchObject({ availableQuantity: 15, status: "QUANTITY_ADJUSTED" });
    expect(body.checkoutReady).toBe(false);
    await app.close();
  });

  it("marks a zero-stock variant OUT_OF_STOCK and blocks checkout", async () => {
    const { app, dataAccess } = await createTestApp();
    dataAccess.inventory[0]!.quantityOnHand = 0;

    const cart = await cartReq(app, [{ variantId: VARIANT, quantity: 1 }]);
    expect(cart.json().lines[0]).toMatchObject({ status: "OUT_OF_STOCK", availableQuantity: 0, inStock: false });

    const checkout = await checkoutReq(app, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      contact: validContact,
      shippingAddress: validAddress,
    });
    expect(checkout.statusCode).toBe(409);
    await app.close();
  });

  it("drops references to unknown or cross-store variants (tenant isolation + stale reconcile)", async () => {
    const { app, dataAccess } = await createTestApp();
    // Ikinci ACTIVE store + urun/varyant.
    dataAccess.stores.push({
      id: "store_other",
      name: "Other Store",
      slug: "other-store",
      status: "ACTIVE",
      metadata: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      domain: null,
    });
    dataAccess.products.push({ ...dataAccess.products[0]!, id: "product_other", storeId: "store_other", slug: "other-product" });
    dataAccess.variants.push({ ...dataAccess.variants[0]!, id: "variant_other", productId: "product_other", storeId: "store_other", sku: "OTHER-SKU" });

    const cart = await cartReq(app, [
      { variantId: "variant_other", quantity: 1 },
      { variantId: "does-not-exist", quantity: 1 },
    ]);
    expect(cart.json().lines).toHaveLength(0);

    const checkout = await checkoutReq(app, {
      items: [{ variantId: "variant_other", quantity: 1 }],
      contact: validContact,
      shippingAddress: validAddress,
    });
    expect(checkout.statusCode).toBe(409);
    expect(checkout.json()).toMatchObject({ error: { code: "CART_NOT_READY" } });
    await app.close();
  });

  it("rejects checkout with missing/invalid contact fields (no order created)", async () => {
    const { app, dataAccess } = await createTestApp();
    const response = await checkoutReq(app, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      contact: { fullName: "", email: "not-an-email", phone: "" },
      shippingAddress: validAddress,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(dataAccess.orders).toHaveLength(0);
    await app.close();
  });

  it("creates a PLACED, UNPAID order on valid checkout and reserves stock", async () => {
    const { app, dataAccess } = await createTestApp();
    const response = await checkoutReq(app, {
      items: [{ variantId: VARIANT, quantity: 2 }],
      contact: validContact,
      shippingAddress: validAddress,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      status: "PLACED",
      paymentStatus: "UNPAID",
      currency: "TRY",
      subtotalMinor: 259800,
      totalMinor: 259800,
      contactEmail: "ada@example.com",
    });
    expect(body.orderNumber).toMatch(/^OS-/);
    expect(body.lines[0]).toMatchObject({ title: "Demo Hoodie", quantity: 2, unitPriceMinor: 129900, lineTotalMinor: 259800 });
    // Stok rezerve edildi (placeOrder).
    expect(dataAccess.inventory[0]!.quantityReserved).toBe(2);
    await app.close();
  });

  it("does not expose internal/admin fields in cart or order confirmation", async () => {
    const { app } = await createTestApp();
    const cart = (await cartReq(app, [{ variantId: VARIANT, quantity: 1 }])).json();
    expect(cart).not.toHaveProperty("storeId");
    expect(cart.lines[0]).not.toHaveProperty("storeId");

    const confirmation = (
      await checkoutReq(app, {
        items: [{ variantId: VARIANT, quantity: 1 }],
        contact: validContact,
        shippingAddress: validAddress,
      })
    ).json();
    for (const internalKey of ["storeId", "customerId", "reservations", "events", "addresses", "fulfillmentStatus"]) {
      expect(confirmation).not.toHaveProperty(internalKey);
    }
    await app.close();
  });

  it("F3C.2: guest cart defers shipping to address selection (no fake price)", async () => {
    const { app } = await createTestApp();
    // Guest (oturum yok) -> teslimat adresi bilinmiyor -> kargo hesaplanmaz.
    // Subtotal esik ustunde olsa bile cart endpoint'inde ucret 0 + ADDRESS_REQUIRED.
    const body = (await cartReq(app, [{ variantId: VARIANT, quantity: 1 }])).json();
    expect(body.summary).toMatchObject({
      itemsSubtotalMinor: 129900,
      shippingMinor: 0,
      discountMinor: 0,
      grandTotalMinor: 129900,
      taxRatePercent: 20,
      couponStatus: "NONE",
    });
    expect(body.shipping.status).toBe("ADDRESS_REQUIRED");
    expect(body.shipping.amountMinor).toBeNull();
    await app.close();
  });

  it("F3C.2: guest cart below threshold still shows address-required, not a hardcoded fee", async () => {
    const { app, dataAccess } = await createTestApp();
    dataAccess.variants[0]!.priceMinor = 5000; // ₺50 -> esik altinda
    const body = (await cartReq(app, [{ variantId: VARIANT, quantity: 1 }])).json();
    // Eski hardcoded ₺49,90 ARTIK YOK; guest icin ucret adres secilince hesaplanir.
    expect(body.summary).toMatchObject({ itemsSubtotalMinor: 5000, shippingMinor: 0, grandTotalMinor: 5000 });
    expect(body.shipping.status).toBe("ADDRESS_REQUIRED");
    await app.close();
  });

  it("F4A: applies a valid campaign coupon and rejects unknown codes (no DEMO rules)", async () => {
    const { app, dataAccess } = await createTestApp();
    seedCouponCampaign(dataAccess, { discountValue: 10 }, "KUPON10");
    const applied = (await app.inject({
      method: "POST",
      url: "/public/stores/demo-store/cart",
      payload: { items: [{ variantId: VARIANT, quantity: 1 }], couponCode: "kupon10" },
    })).json();
    expect(applied.summary).toMatchObject({
      discountMinor: 12990, // %10 of 129900
      couponCode: "KUPON10",
      couponStatus: "APPLIED",
      grandTotalMinor: 116910,
    });
    expect(applied.summary.discountLines).toEqual([
      { label: "Kupon Kampanyasi", code: "KUPON10", amountMinor: 12990 },
    ]);

    const invalid = (await app.inject({
      method: "POST",
      url: "/public/stores/demo-store/cart",
      payload: { items: [{ variantId: VARIANT, quantity: 1 }], couponCode: "NOPE" },
    })).json();
    expect(invalid.summary).toMatchObject({
      discountMinor: 0,
      couponCode: "NOPE",
      couponStatus: "INVALID",
      couponReason: "NOT_FOUND",
    });
    await app.close();
  });

  it("F4A: persists shipping + campaign discount into the placed order and confirmation", async () => {
    const { app, dataAccess } = await createTestApp();
    dataAccess.variants[0]!.priceMinor = 5000; // esik alti -> kargo ucreti
    seedCouponCampaign(dataAccess, { discountValue: 10 }, "KUPON10");
    const response = await checkoutReq(app, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      contact: validContact,
      shippingAddress: validAddress,
      couponCode: "KUPON10",
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    // subtotal 5000, discount 500 (%10), shipping 4990 -> total 9490.
    expect(body).toMatchObject({
      subtotalMinor: 5000,
      discountMinor: 500,
      shippingMinor: 4990,
      totalMinor: 9490,
      couponCode: "KUPON10",
      couponStatus: "APPLIED",
    });
    // Siparise de yazildi.
    expect(dataAccess.orders[0]!.discountAmount).toBe(500);
    expect(dataAccess.orders[0]!.shippingAmount).toBe(4990);
    expect(dataAccess.orders[0]!.totalAmount).toBe(9490);
    await app.close();
  });

  it("F3C.2: checkout writes the shipping snapshot (source + plan id/name) to the order", async () => {
    const { app, dataAccess } = await createTestApp();
    dataAccess.variants[0]!.priceMinor = 5000; // esik alti -> ucret hesaplanir
    const res = await checkoutReq(app, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      contact: validContact,
      shippingAddress: validAddress,
    });
    expect(res.statusCode).toBe(201);
    const order = dataAccess.orders[0]!;
    expect(order.shippingAmount).toBe(4990);
    expect(order.shippingSource).toBe("STORE_SHIPPING_TARIFF");
    expect(order.shippingRatePlanId).toBe("ratePlan_demo");
    expect(order.shippingRatePlanName).toBe("Standart Kargo");
    // Odeme/total kargoyu icerir: 5000 + 4990.
    expect(res.json().totalMinor).toBe(9990);
    await app.close();
  });

  it("F3C.2: no active rate plan blocks the checkout payment step (SHIPPING_QUOTE_UNAVAILABLE)", async () => {
    const { app, dataAccess } = await createTestApp();
    dataAccess.shippingRatePlan = null; // aktif/default tarife yok
    const res = await checkoutReq(app, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      contact: validContact,
      shippingAddress: validAddress,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("SHIPPING_QUOTE_UNAVAILABLE");
    expect(res.json().error.details.shipping.status).toBe("NO_RATE_PLAN");
    await app.close();
  });

  it("F3C.2: a FIXED store tariff (not the old hardcoded 49.90) drives the fee", async () => {
    const { app, dataAccess } = await createTestApp();
    dataAccess.variants[0]!.priceMinor = 5000;
    dataAccess.shippingRatePlan = {
      ...dataAccess.shippingRatePlan!,
      pricingMode: "FIXED",
      fixedAmountMinor: 2500,
      freeShippingThresholdMinor: null,
    };
    const res = await checkoutReq(app, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      contact: validContact,
      shippingAddress: validAddress,
    });
    const body = res.json();
    expect(body.shippingMinor).toBe(2500); // tarife belirler; 4990 DEGIL
    expect(body.totalMinor).toBe(7500);
    await app.close();
  });

  it("F3C.2: free-shipping threshold yields free shipping at checkout", async () => {
    const { app } = await createTestApp(); // hoodie 129900 >= 75000 esik
    const res = await checkoutReq(app, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      contact: validContact,
      shippingAddress: validAddress,
    });
    expect(res.json().shippingMinor).toBe(0);
    await app.close();
  });

  it("returns a safe 404 for an unknown/inactive store on cart and checkout", async () => {
    const { app } = await createTestApp();
    const cart = await cartReq(app, [{ variantId: VARIANT, quantity: 1 }], "nope");
    expect(cart.statusCode).toBe(404);
    const checkout = await checkoutReq(
      app,
      { items: [{ variantId: VARIANT, quantity: 1 }], contact: validContact, shippingAddress: validAddress },
      "nope",
    );
    expect(checkout.statusCode).toBe(404);
    await app.close();
  });

  // TODO-125 — Checkout kargo sağlayıcı/seçenek seçimi.
  function fixedPlan(over: Partial<EngineRatePlan> & Pick<EngineRatePlan, "id" | "name">): EngineRatePlan {
    return {
      provider: null,
      status: "ACTIVE",
      isDefault: false,
      pricingMode: "FIXED",
      currency: "TRY",
      fixedAmountMinor: 4990,
      freeShippingThresholdMinor: null,
      deliveryEstimate: null,
      validFrom: null,
      validTo: null,
      rules: [],
      ...over,
    };
  }
  function setupMultiPlan(dataAccess: MemoryDataAccess) {
    dataAccess.variants[0]!.priceMinor = 5000; // esik yok; her secenek fiyatlanir
    dataAccess.shippingRatePlansList = [
      fixedPlan({ id: "rp_express", name: "Hızlı Kargo", provider: "DHL_ECOMMERCE", isDefault: true, fixedAmountMinor: 4990, deliveryEstimate: "1-2 iş günü" }),
      fixedPlan({ id: "rp_eco", name: "Ekonomik Kargo", provider: "MOCK", fixedAmountMinor: 2500, deliveryEstimate: "3-5 iş günü" }),
    ];
    // Yalniz ENABLED provider config'ler gorunum saglar (DISABLED olanlar map'te yok).
    dataAccess.shippingProviderDisplays = new Map([
      ["DHL_ECOMMERCE", { displayName: "DHL Express", logoUrl: "https://cdn.example/dhl.png", logoAlt: "DHL" }],
      ["MOCK", { displayName: "Demo Kargo", logoUrl: null, logoAlt: null }],
    ]);
  }

  it("TODO-125: checkout lists multiple priced shipping options with provider name + logo", async () => {
    const { app, dataAccess } = await createTestApp();
    setupMultiPlan(dataAccess);
    const res = await checkoutReq(app, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      contact: validContact,
      shippingAddress: validAddress,
    });
    // Birden cok secenek + secim yapilmadi → SHIPPING_OPTION_REQUIRED (secenekler donulur).
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error.code).toBe("SHIPPING_OPTION_REQUIRED");
    const options = body.error.details.shipping.options as Array<Record<string, unknown>>;
    expect(options).toHaveLength(2);
    const express = options.find((o) => o.optionId === "rp_express")!;
    expect(express).toMatchObject({
      providerType: "DHL_ECOMMERCE",
      providerName: "DHL Express",
      serviceName: "Hızlı Kargo",
      priceMinor: 4990,
      logoUrl: "https://cdn.example/dhl.png",
      available: true,
      estimatedDelivery: "1-2 iş günü",
    });
    const eco = options.find((o) => o.optionId === "rp_eco")!;
    expect(eco).toMatchObject({ providerName: "Demo Kargo", priceMinor: 2500, logoUrl: null });
    await app.close();
  });

  it("TODO-125: selected option recomputes price server-side and persists the provider snapshot", async () => {
    const { app, dataAccess } = await createTestApp();
    setupMultiPlan(dataAccess);
    const res = await checkoutReq(app, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      contact: validContact,
      shippingAddress: validAddress,
      shippingOptionId: "rp_eco",
    });
    expect(res.statusCode).toBe(201);
    const order = dataAccess.orders[0]!;
    expect(order.shippingAmount).toBe(2500);
    expect(order.shippingProvider).toBe("MOCK");
    expect(order.shippingProviderName).toBe("Demo Kargo");
    expect(order.shippingRatePlanId).toBe("rp_eco");
    expect(order.shippingRatePlanName).toBe("Ekonomik Kargo");
    const confirmation = res.json();
    expect(confirmation.totalMinor).toBe(7500); // 5000 + 2500
    expect(confirmation.shippingOption).toMatchObject({
      providerName: "Demo Kargo",
      serviceName: "Ekonomik Kargo",
      amountMinor: 2500,
      estimatedDelivery: "3-5 iş günü",
    });
    await app.close();
  });

  it("TODO-125: choosing a different option changes the order total", async () => {
    const { app, dataAccess } = await createTestApp();
    setupMultiPlan(dataAccess);
    const res = await checkoutReq(app, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      contact: validContact,
      shippingAddress: validAddress,
      shippingOptionId: "rp_express",
    });
    expect(res.statusCode).toBe(201);
    expect(dataAccess.orders[0]!.shippingAmount).toBe(4990);
    expect(res.json().totalMinor).toBe(9990); // 5000 + 4990
    await app.close();
  });

  it("TODO-125: a tampered shipping price is impossible — server ignores it and uses the plan price", async () => {
    const { app, dataAccess } = await createTestApp();
    setupMultiPlan(dataAccess);
    const res = await checkoutReq(app, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      contact: validContact,
      shippingAddress: validAddress,
      shippingOptionId: "rp_eco",
      // Istemci uydurma alanlar gondermeyi denese de sema STRIP eder; ucret plandan gelir.
      shippingAmount: 1,
      shippingMinor: 1,
      priceMinor: 1,
    });
    expect(res.statusCode).toBe(201);
    expect(dataAccess.orders[0]!.shippingAmount).toBe(2500); // 1 DEGIL
    await app.close();
  });

  it("TODO-125: a cross-store / unknown shipping option id is rejected", async () => {
    const { app, dataAccess } = await createTestApp();
    setupMultiPlan(dataAccess);
    const res = await checkoutReq(app, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      contact: validContact,
      shippingAddress: validAddress,
      shippingOptionId: "rp_from_other_store",
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("SHIPPING_OPTION_INVALID");
    expect(dataAccess.orders).toHaveLength(0);
    await app.close();
  });

  it("TODO-125: a single option is auto-selected when none is sent (with provider snapshot)", async () => {
    const { app, dataAccess } = await createTestApp();
    dataAccess.variants[0]!.priceMinor = 5000;
    dataAccess.shippingRatePlansList = [
      fixedPlan({ id: "rp_only", name: "Standart Kargo", provider: "DHL_ECOMMERCE", isDefault: true, fixedAmountMinor: 3000 }),
    ];
    dataAccess.shippingProviderDisplays = new Map([
      ["DHL_ECOMMERCE", { displayName: "DHL Express", logoUrl: null, logoAlt: null }],
    ]);
    const res = await checkoutReq(app, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      contact: validContact,
      shippingAddress: validAddress,
    });
    expect(res.statusCode).toBe(201);
    expect(dataAccess.orders[0]!.shippingAmount).toBe(3000);
    expect(dataAccess.orders[0]!.shippingProviderName).toBe("DHL Express");
    expect(res.json().shippingOption.providerName).toBe("DHL Express");
    await app.close();
  });

  // ───────────────────── F4A — Kampanyalar & Kuponlar (ADR-058) ─────────────────────
  describe("F4A campaigns & coupons", () => {
    it("store admin can create/activate a coupon campaign; invalid discount is rejected", async () => {
      const { app, login } = await createTestApp();
      const token = await login();
      const created = await app.inject({
        method: "POST",
        url: "/stores/store_demo/campaigns",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: "TEST250 Kuponu",
          type: "COUPON_CODE",
          discountType: "FIXED_AMOUNT",
          discountValue: 25000,
          minOrderAmountMinor: 100000,
          totalUsageLimit: 10,
          perCustomerUsageLimit: 1,
          couponCode: "TEST250",
        },
      });
      expect(created.statusCode).toBe(201);
      const body = created.json();
      expect(body).toMatchObject({ status: "DRAFT", type: "COUPON_CODE", discountValue: 25000 });
      expect(body.coupons[0]).toMatchObject({ code: "TEST250", normalizedCode: "TEST250" });

      const activated = await app.inject({
        method: "POST",
        url: `/stores/store_demo/campaigns/${body.id}/activate`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(activated.statusCode).toBe(200);
      expect(activated.json().status).toBe("ACTIVE");

      // Gecersiz yuzde (>100) reddedilir.
      const invalid = await app.inject({
        method: "POST",
        url: "/stores/store_demo/campaigns",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: "Bozuk",
          type: "AUTOMATIC_CART",
          discountType: "PERCENT",
          discountValue: 150,
        },
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().error.code).toBe("VALIDATION_ERROR");
      await app.close();
    });

    it("duplicate coupon code in the same store is rejected; other store can reuse it", async () => {
      const { app, dataAccess, login } = await createTestApp();
      const token = await login();
      seedCouponCampaign(dataAccess, {}, "TEKRAR10");
      const duplicate = await app.inject({
        method: "POST",
        url: "/stores/store_demo/campaigns",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: "Ayni Kod",
          type: "COUPON_CODE",
          discountType: "PERCENT",
          discountValue: 5,
          couponCode: "tekrar10",
        },
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().error.code).toBe("DUPLICATE_COUPON_CODE");

      // Farkli store ayni kodu kullanabilir (store-scoped uniqueness).
      dataAccess.stores.push({ ...dataAccess.stores[0]!, id: "store_other", slug: "other-store", domain: null });
      const other = await app.inject({
        method: "POST",
        url: "/stores/store_other/campaigns",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: "Diger Magaza",
          type: "COUPON_CODE",
          discountType: "PERCENT",
          discountValue: 5,
          couponCode: "TEKRAR10",
        },
      });
      expect(other.statusCode).toBe(201);
      await app.close();
    });

    it("campaign endpoints require store admin auth and campaigns stay store-scoped", async () => {
      const { app, dataAccess, login } = await createTestApp();
      const unauthorized = await app.inject({ method: "GET", url: "/stores/store_demo/campaigns" });
      expect(unauthorized.statusCode).toBe(401);

      const token = await login();
      const campaign = seedCouponCampaign(dataAccess, {}, "GIZLI10");
      dataAccess.stores.push({ ...dataAccess.stores[0]!, id: "store_other", slug: "other-store", domain: null });
      const crossStore = await app.inject({
        method: "GET",
        url: `/stores/store_other/campaigns/${campaign.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(crossStore.statusCode).toBe(404);
      await app.close();
    });

    it("archived campaigns cannot be edited; paused campaigns cannot be used", async () => {
      const { app, dataAccess, login } = await createTestApp();
      const token = await login();
      const archived = seedCouponCampaign(dataAccess, { status: "ARCHIVED" }, "ESKI10");
      const patch = await app.inject({
        method: "PATCH",
        url: `/stores/store_demo/campaigns/${archived.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Yeni Ad" },
      });
      expect(patch.statusCode).toBe(409);
      expect(patch.json().error.code).toBe("ARCHIVED_IMMUTABLE");

      seedCouponCampaign(dataAccess, { status: "PAUSED" }, "DURDU10");
      const cart = (await app.inject({
        method: "POST",
        url: "/public/stores/demo-store/cart",
        payload: { items: [{ variantId: VARIANT, quantity: 1 }], couponCode: "DURDU10" },
      })).json();
      expect(cart.summary).toMatchObject({ couponStatus: "INVALID", couponReason: "INACTIVE", discountMinor: 0 });

      const checkout = await checkoutReq(app, {
        items: [{ variantId: VARIANT, quantity: 1 }],
        contact: validContact,
        shippingAddress: validAddress,
        couponCode: "DURDU10",
      });
      expect(checkout.statusCode).toBe(409);
      expect(checkout.json().error.code).toBe("COUPON_INVALID");
      expect(dataAccess.orders).toHaveLength(0);
      await app.close();
    });

    it("min order amount and expiry produce specific safe reasons on the public quote", async () => {
      const { app, dataAccess } = await createTestApp();
      seedCouponCampaign(dataAccess, { minOrderAmountMinor: 500000 }, "MIN500");
      seedCouponCampaign(dataAccess, { endsAt: new Date("2026-01-01T00:00:00.000Z") }, "BITTI10");

      const min = (await app.inject({
        method: "POST",
        url: "/public/stores/demo-store/cart",
        payload: { items: [{ variantId: VARIANT, quantity: 1 }], couponCode: "MIN500" },
      })).json();
      expect(min.summary).toMatchObject({ couponStatus: "INVALID", couponReason: "MIN_ORDER_NOT_MET" });

      const expired = (await app.inject({
        method: "POST",
        url: "/public/stores/demo-store/cart",
        payload: { items: [{ variantId: VARIANT, quantity: 1 }], couponCode: "BITTI10" },
      })).json();
      expect(expired.summary).toMatchObject({ couponStatus: "INVALID", couponReason: "EXPIRED" });
      await app.close();
    });

    it("checkout revalidates the coupon server-side and writes snapshot + redemption once", async () => {
      const { app, dataAccess } = await createTestApp();
      const campaign = seedCouponCampaign(
        dataAccess,
        { discountType: "FIXED_AMOUNT", discountValue: 25000, totalUsageLimit: 10, perCustomerUsageLimit: 1 },
        "TEST250",
      );
      const response = await checkoutReq(app, {
        items: [{ variantId: VARIANT, quantity: 1 }],
        contact: validContact,
        shippingAddress: validAddress,
        couponCode: " test250 ", // normalize: trim + uppercase
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ discountMinor: 25000, couponCode: "TEST250", couponStatus: "APPLIED" });

      // OrderDiscount snapshot'i yazildi.
      expect(dataAccess.orderDiscounts).toHaveLength(1);
      expect(dataAccess.orderDiscounts[0]).toMatchObject({
        campaignId: campaign.id,
        code: "TEST250",
        discountType: "FIXED_AMOUNT",
        discountAmountMinor: 25000,
      });
      // Redemption BIR KEZ yazildi; sayac artti.
      expect(dataAccess.campaignRedemptions).toHaveLength(1);
      expect(dataAccess.campaignRedemptions[0]).toMatchObject({
        campaignId: campaign.id,
        email: "ada@example.com",
      });
      expect(campaign.usageCount).toBe(1);
      expect(campaign.coupons[0]!.usageCount).toBe(1);
      // Siparis toplami sunucu hesabiyla uyumlu.
      expect(dataAccess.orders[0]!.discountAmount).toBe(25000);
      expect(dataAccess.orders[0]!.totalAmount).toBe(dataAccess.orders[0]!.subtotalAmount - 25000 + dataAccess.orders[0]!.shippingAmount);
      await app.close();
    });

    it("per-customer and total usage limits are enforced at checkout", async () => {
      const { app, dataAccess } = await createTestApp();
      seedCouponCampaign(dataAccess, { perCustomerUsageLimit: 1 }, "BIRKEZ10");
      const first = await checkoutReq(app, {
        items: [{ variantId: VARIANT, quantity: 1 }],
        contact: validContact,
        shippingAddress: validAddress,
        couponCode: "BIRKEZ10",
      });
      expect(first.statusCode).toBe(201);

      // Ayni e-posta ikinci kez kullanamaz.
      const second = await checkoutReq(app, {
        items: [{ variantId: VARIANT, quantity: 1 }],
        contact: validContact,
        shippingAddress: validAddress,
        couponCode: "BIRKEZ10",
      });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("COUPON_INVALID");
      expect(dataAccess.orders).toHaveLength(1);

      // Toplam limit dolduysa farkli musteri de kullanamaz.
      const limited = seedCouponCampaign(dataAccess, { totalUsageLimit: 1, usageCount: 1 }, "DOLU10");
      expect(limited.usageCount).toBe(1);
      const third = await checkoutReq(app, {
        items: [{ variantId: VARIANT, quantity: 1 }],
        contact: { ...validContact, email: "baska@example.com" },
        shippingAddress: validAddress,
        couponCode: "DOLU10",
      });
      expect(third.statusCode).toBe(409);
      await app.close();
    });

    it("cross-store coupons cannot be used on another store", async () => {
      const { app, dataAccess } = await createTestApp();
      // Kupon store_other'a ait; demo-store sepetinde cozulmemeli.
      seedCouponCampaign(dataAccess, { storeId: "store_other" }, "BASKA10");
      const cart = (await app.inject({
        method: "POST",
        url: "/public/stores/demo-store/cart",
        payload: { items: [{ variantId: VARIANT, quantity: 1 }], couponCode: "BASKA10" },
      })).json();
      expect(cart.summary).toMatchObject({ couponStatus: "INVALID", couponReason: "NOT_FOUND", discountMinor: 0 });
      await app.close();
    });

    it("automatic cart campaign applies without a coupon; product scope is honored", async () => {
      const { app, dataAccess } = await createTestApp();
      seedCampaign(dataAccess, {
        name: "Sepette %20",
        type: "AUTOMATIC_CART",
        discountValue: 20,
      });
      const cart = (await cartReq(app, [{ variantId: VARIANT, quantity: 1 }])).json();
      expect(cart.summary).toMatchObject({
        discountMinor: 25980, // %20 of 129900
        couponStatus: "NONE",
      });
      expect(cart.summary.discountLines).toEqual([
        { label: "Sepette %20", code: null, amountMinor: 25980 },
      ]);

      // Kapsam disi urun kampanyasi uygulanmaz.
      dataAccess.campaigns.length = 0;
      seedCampaign(dataAccess, {
        name: "Baska Urunde %50",
        type: "PRODUCT_DISCOUNT",
        discountValue: 50,
        productIds: ["baska_urun"],
      });
      const scoped = (await cartReq(app, [{ variantId: VARIANT, quantity: 1 }])).json();
      expect(scoped.summary.discountMinor).toBe(0);
      await app.close();
    });

    it("regression: checkout without a coupon behaves exactly as before (no discount rows)", async () => {
      const { app, dataAccess } = await createTestApp();
      seedCouponCampaign(dataAccess, {}, "KULLANMA10");
      const response = await checkoutReq(app, {
        items: [{ variantId: VARIANT, quantity: 2 }],
        contact: validContact,
        shippingAddress: validAddress,
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        subtotalMinor: 259800,
        discountMinor: 0,
        totalMinor: 259800,
        couponStatus: "NONE",
      });
      expect(dataAccess.orderDiscounts).toHaveLength(0);
      expect(dataAccess.campaignRedemptions).toHaveLength(0);
      await app.close();
    });
  });
});

describe("api gateway · payment providers (F3B.2)", () => {
  const STORE = "store_demo";
  const SLUG = "demo-store";
  const VARIANT = "variant_hoodie_m";
  const contact = { fullName: "Ada Lovelace", email: "ada@example.com", phone: "+905551112233" };
  const address = { country: "TR", city: "Istanbul", district: "Kadikoy", addressLine1: "Bagdat Cad. 1" };

  function createProvider(
    app: Awaited<ReturnType<typeof createTestApp>>["app"],
    token: string,
    overrides: Record<string, unknown> = {},
  ) {
    return app.inject({
      method: "POST",
      url: `/stores/${STORE}/payment-providers`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        provider: "MOCK",
        displayName: "Mock TEST",
        status: "ENABLED",
        mode: "TEST",
        supportedMethods: ["CARD"],
        supportedCurrencies: ["TRY"],
        ...overrides,
      },
    });
  }

  function checkout(app: Awaited<ReturnType<typeof createTestApp>>["app"]) {
    return app.inject({
      method: "POST",
      url: `/public/stores/${SLUG}/checkout`,
      payload: {
        items: [{ variantId: VARIANT, quantity: 1 }],
        contact,
        shippingAddress: address,
        // F3B.2 — Fatura zorunlu (gecerli T.C. Kimlik No ile bireysel).
        billing: { type: "INDIVIDUAL", sameAsShipping: true, name: "Ada Lovelace", tckn: "10000000146" },
      },
    });
  }

  it("requires platform admin auth for provider listing", async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: "GET", url: `/stores/${STORE}/payment-providers` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("creates a provider, masks secrets in the response, and never leaks plaintext", async () => {
    const { app, login } = await createTestApp();
    const token = await login();
    const res = await createProvider(app, token, {
      apiKey: "ak_secret_value_1234",
      secretKey: "sk_secret_value_abcd",
      webhookSecret: "wh_secret_value_zzzz",
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ apiKeySet: true, secretKeySet: true, webhookSecretSet: true });
    expect(body.apiKeyMasked).toBe("••••1234");
    expect(body.secretKey).toBeUndefined();
    // Secret leakage guard: hicbir duz metin secret yanitta gorunmemeli.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("ak_secret_value_1234");
    expect(raw).not.toContain("sk_secret_value_abcd");
    expect(raw).not.toContain("wh_secret_value_zzzz");
    await app.close();
  });

  it("preserves an existing secret when the field is omitted, replaces it when provided", async () => {
    const { app, dataAccess, login } = await createTestApp();
    const token = await login();
    await createProvider(app, token, { apiKey: "ak_first_1111", secretKey: "sk_keep_2222" });
    const stored = dataAccess.paymentProviderConfigs[0]!;
    const originalSecretCipher = stored.secretKeyCipher;
    const originalApiCipher = stored.apiKeyCipher;

    // Secret alanlari gonderilmez → korunur.
    const keep = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE}/payment-providers/${stored.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: "Renamed" },
    });
    expect(keep.statusCode).toBe(200);
    expect(stored.secretKeyCipher).toBe(originalSecretCipher);
    expect(stored.apiKeyCipher).toBe(originalApiCipher);

    // Yeni apiKey gonderilir → degisir; secretKey hala korunur.
    const replace = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE}/payment-providers/${stored.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { apiKey: "ak_second_9999" },
    });
    expect(replace.statusCode).toBe(200);
    expect(stored.apiKeyCipher).not.toBe(originalApiCipher);
    expect(stored.secretKeyCipher).toBe(originalSecretCipher);
    await app.close();
  });

  it("rejects a duplicate provider+mode and enforces amount range", async () => {
    const { app, login } = await createTestApp();
    const token = await login();
    await createProvider(app, token);
    const dup = await createProvider(app, token);
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toMatchObject({ error: { code: "PAYMENT_PROVIDER_MODE_EXISTS" } });

    const badRange = await createProvider(app, token, { provider: "STRIPE", minAmount: 5000, maxAmount: 1000 });
    expect(badRange.statusCode).toBe(400);
    expect(badRange.json()).toMatchObject({ error: { code: "PAYMENT_AMOUNT_RANGE_INVALID" } });
    await app.close();
  });

  it("toggles status and reorders priorities deterministically", async () => {
    const { app, login } = await createTestApp();
    const token = await login();
    const a = (await createProvider(app, token, { provider: "MOCK", priority: 50 })).json();
    const b = (await createProvider(app, token, { provider: "STRIPE", priority: 20, apiKey: "k", secretKey: "s" })).json();

    const disabled = await app.inject({
      method: "POST",
      url: `/stores/${STORE}/payment-providers/${a.id}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "DISABLED" },
    });
    expect(disabled.json().status).toBe("DISABLED");

    const reorder = await app.inject({
      method: "POST",
      url: `/stores/${STORE}/payment-providers/reorder`,
      headers: { authorization: `Bearer ${token}` },
      payload: { items: [{ id: a.id, priority: 5 }, { id: b.id, priority: 90 }] },
    });
    expect(reorder.statusCode).toBe(200);
    expect(reorder.json().data.map((c: { id: string }) => c.id)).toEqual([a.id, b.id]);
    await app.close();
  });

  it("runs a mock test-connection and records the result", async () => {
    const { app, login } = await createTestApp();
    const token = await login();
    const config = (await createProvider(app, token)).json();
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE}/payment-providers/${config.id}/test-connection`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    await app.close();
  });

  it("ignores duplicate webhooks by external event id (idempotency shell)", async () => {
    const { app } = await createTestApp();
    const first = await app.inject({
      method: "POST",
      url: "/payments/webhooks/mock",
      payload: { storeId: STORE, eventId: "evt_1" },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ received: true, duplicate: false });
    const second = await app.inject({
      method: "POST",
      url: "/payments/webhooks/mock",
      payload: { storeId: STORE, eventId: "evt_1" },
    });
    expect(second.json()).toEqual({ received: true, duplicate: true });
    await app.close();
  });

  it("REGRESSION: checkout with no provider keeps the exact response shape (no payment field, UNPAID)", async () => {
    const { app } = await createTestApp();
    const res = await checkout(app);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.payment).toBeUndefined();
    expect(body.paymentStatus).toBe("UNPAID");
    await app.close();
  });

  it("wires a token-protected test payment when a MOCK TEST provider exists (success → PAID)", async () => {
    const { app, login } = await createTestApp();
    const token = await login();
    await createProvider(app, token);

    const res = await checkout(app);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.paymentStatus).toBe("UNPAID");
    expect(body.payment).toMatchObject({ required: true });
    const url = new URL(`http://x${body.payment.paymentPath}`);
    const orderId = url.searchParams.get("orderId")!;
    const accessToken = body.payment.token as string;

    // State: dogru token ile 200; token'siz/yanlis token ile reddedilir.
    const state = await app.inject({
      method: "GET",
      url: `/public/stores/${SLUG}/orders/${orderId}/payment?token=${accessToken}`,
    });
    expect(state.statusCode).toBe(200);
    expect(state.json().attempt.status).toBe("CREATED");

    const wrongToken = await app.inject({
      method: "GET",
      url: `/public/stores/${SLUG}/orders/${orderId}/payment?token=not-the-token`,
    });
    expect(wrongToken.statusCode).toBe(403);

    // Submit success → order PAID; state/credential sizdirmaz.
    const submit = await app.inject({
      method: "POST",
      url: `/public/stores/${SLUG}/orders/${orderId}/payment`,
      payload: { token: accessToken, scenario: "success" },
    });
    expect(submit.statusCode).toBe(200);
    expect(submit.json()).toMatchObject({ paymentStatus: "PAID", attempt: { status: "PAID" } });

    // Token tek kullanim: PAID sonrasi yeniden gonderim reddedilir.
    const replay = await app.inject({
      method: "POST",
      url: `/public/stores/${SLUG}/orders/${orderId}/payment`,
      payload: { token: accessToken, scenario: "success" },
    });
    expect(replay.statusCode).toBe(403);
    await app.close();
  });

  it("keeps the order UNPAID and the attempt FAILED on a failure scenario", async () => {
    const { app, login } = await createTestApp();
    const token = await login();
    await createProvider(app, token);
    const body = (await checkout(app)).json();
    const orderId = new URL(`http://x${body.payment.paymentPath}`).searchParams.get("orderId")!;

    const submit = await app.inject({
      method: "POST",
      url: `/public/stores/${SLUG}/orders/${orderId}/payment`,
      payload: { token: body.payment.token, scenario: "failure" },
    });
    expect(submit.statusCode).toBe(200);
    expect(submit.json()).toMatchObject({ paymentStatus: "UNPAID", attempt: { status: "FAILED" } });
    await app.close();
  });

  // F3B.2 — Test kart formu akisi: senaryo karttan turetilir; maskeli kart + taksit
  // yazilir; FULL PAN/CVC hicbir response'ta gorunmez.
  it("pays via the card form (success card → PAID), stores masked card + installment, never leaks the PAN", async () => {
    const { app, login } = await createTestApp();
    const token = await login();
    await createProvider(app, token, { installmentEnabled: true });
    const body = (await checkout(app)).json();
    const orderId = new URL(`http://x${body.payment.paymentPath}`).searchParams.get("orderId")!;

    const submit = await app.inject({
      method: "POST",
      url: `/public/stores/${SLUG}/orders/${orderId}/payment`,
      payload: {
        token: body.payment.token,
        card: { holder: "ADA LOVELACE", number: "5528790000000008", expMonth: 12, expYear: 2030, cvc: "123" },
        installmentCount: 3,
      },
    });
    expect(submit.statusCode).toBe(200);
    const result = submit.json();
    expect(result).toMatchObject({
      paymentStatus: "PAID",
      attempt: { status: "PAID", cardBrand: "MASTERCARD", cardLast4: "0008", installmentCount: 3 },
    });
    expect(result.receipt).not.toBeNull();
    expect(result.receipt.payment).toMatchObject({ cardLast4: "0008", installmentCount: 3 });
    // FULL PAN / CVC hicbir yerde gorunmez.
    const raw = JSON.stringify(result);
    expect(raw).not.toContain("5528790000000008");
    expect(raw).not.toContain("123");
    await app.close();
  });

  it("derives a declined scenario from a known failure test card (order stays UNPAID)", async () => {
    const { app, login } = await createTestApp();
    const token = await login();
    await createProvider(app, token);
    const body = (await checkout(app)).json();
    const orderId = new URL(`http://x${body.payment.paymentPath}`).searchParams.get("orderId")!;

    const submit = await app.inject({
      method: "POST",
      url: `/public/stores/${SLUG}/orders/${orderId}/payment`,
      payload: {
        token: body.payment.token,
        card: { holder: "T", number: "4000000000000002", expMonth: 1, expYear: 2031, cvc: "000" },
      },
    });
    expect(submit.statusCode).toBe(200);
    expect(submit.json()).toMatchObject({ paymentStatus: "UNPAID", attempt: { status: "FAILED", cardLast4: "0002" } });
    await app.close();
  });

  it("rejects an invalid (non-Luhn) card number without faking success", async () => {
    const { app, login } = await createTestApp();
    const token = await login();
    await createProvider(app, token);
    const body = (await checkout(app)).json();
    const orderId = new URL(`http://x${body.payment.paymentPath}`).searchParams.get("orderId")!;

    const submit = await app.inject({
      method: "POST",
      url: `/public/stores/${SLUG}/orders/${orderId}/payment`,
      payload: {
        token: body.payment.token,
        card: { holder: "T", number: "1234567812345678", expMonth: 12, expYear: 2030, cvc: "123" },
      },
    });
    expect(submit.statusCode).toBe(400);
    expect(submit.json().error.code).toBe("CARD_NUMBER_INVALID");
    await app.close();
  });

  it("returns a controlled error for a non-MOCK provider (IYZICO) instead of a fake success", async () => {
    const { app, login } = await createTestApp();
    const token = await login();
    // Yalniz IYZICO TEST provider (MOCK yok). Odeme adimi gosterilir ama submit
    // kontrollu hata doner; ASLA fake success.
    await createProvider(app, token, { provider: "IYZICO", displayName: "Iyzico TEST" });
    const body = (await checkout(app)).json();
    expect(body.payment).toMatchObject({ required: true });
    const orderId = new URL(`http://x${body.payment.paymentPath}`).searchParams.get("orderId")!;

    const submit = await app.inject({
      method: "POST",
      url: `/public/stores/${SLUG}/orders/${orderId}/payment`,
      payload: {
        token: body.payment.token,
        card: { holder: "T", number: "5528790000000008", expMonth: 12, expYear: 2030, cvc: "123" },
      },
    });
    expect(submit.statusCode).toBe(409);
    expect(submit.json().error.code).toBe("PAYMENT_PROVIDER_NOT_CONFIGURED");
    // Siparis odenmemis kalir.
    const state = await app.inject({
      method: "GET",
      url: `/public/stores/${SLUG}/orders/${orderId}/payment?token=${body.payment.token}`,
    });
    expect(state.json().paymentStatus).toBe("UNPAID");
    await app.close();
  });

  it("blocks checkout when corporate billing is missing tax details and accepts a valid corporate billing", async () => {
    const { app } = await createTestApp();
    const invalid = await app.inject({
      method: "POST",
      url: `/public/stores/${SLUG}/checkout`,
      payload: {
        items: [{ variantId: VARIANT, quantity: 1 }],
        contact,
        shippingAddress: address,
        billing: { type: "CORPORATE", sameAsShipping: true, companyName: "Acme A.Ş." },
      },
    });
    expect(invalid.statusCode).toBe(400);

    const valid = await app.inject({
      method: "POST",
      url: `/public/stores/${SLUG}/checkout`,
      payload: {
        items: [{ variantId: VARIANT, quantity: 1 }],
        contact,
        shippingAddress: address,
        billing: {
          type: "CORPORATE",
          sameAsShipping: true,
          companyName: "Acme A.Ş.",
          taxOffice: "Kadıköy",
          taxNumber: "1234567890",
        },
      },
    });
    expect(valid.statusCode).toBe(201);
    await app.close();
  });

  it("derives billing from contact/shipping when billing is omitted (no TCKN required)", async () => {
    const { app } = await createTestApp();
    // Varsayilan checkout: fatura bilgisi GONDERILMEZ → sunucu iletisim/teslimattan
    // turetir ve T.C. Kimlik No ISTEMEZ. (checkoutReq helper'i degil, dogrudan
    // inject — boylece otomatik billing enjeksiyonu devreye girmez.)
    const res = await app.inject({
      method: "POST",
      url: `/public/stores/${SLUG}/checkout`,
      payload: {
        items: [{ variantId: VARIANT, quantity: 1 }],
        contact,
        shippingAddress: address,
      },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("prefers the MOCK provider for the test flow even when a real provider has higher priority", async () => {
    const { app, login } = await createTestApp();
    const token = await login();
    // IYZICO daha yuksek oncelikli (kucuk priority) ama test odemeyi tamamlayamaz;
    // MOCK daha dusuk oncelikli. Checkout yine de MOCK attempt'i uretmeli ki
    // "MOCK aktifken test odeme calismiyor" durumu olusmasin.
    await createProvider(app, token, { provider: "IYZICO", displayName: "Iyzico TEST", priority: 10 });
    await createProvider(app, token, { provider: "MOCK", displayName: "Mock TEST", priority: 90 });
    const body = (await checkout(app)).json();
    expect(body.payment).toMatchObject({ required: true });
    const orderId = new URL(`http://x${body.payment.paymentPath}`).searchParams.get("orderId")!;

    const state = await app.inject({
      method: "GET",
      url: `/public/stores/${SLUG}/orders/${orderId}/payment?token=${body.payment.token}`,
    });
    expect(state.json().provider).toBe("MOCK");

    // Ve MOCK ile gercek test karti basarili odemeyi tamamlar.
    const submit = await app.inject({
      method: "POST",
      url: `/public/stores/${SLUG}/orders/${orderId}/payment`,
      payload: {
        token: body.payment.token,
        card: { holder: "T", number: "5528790000000008", expMonth: 12, expYear: 2030, cvc: "123" },
      },
    });
    expect(submit.statusCode).toBe(200);
    expect(submit.json()).toMatchObject({ paymentStatus: "PAID", attempt: { status: "PAID" } });
    await app.close();
  });
});
