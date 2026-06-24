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
import { type AppDataAccess, createServer } from "../src/server.js";

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
  currency: string;
  status: ProductVariantStatus;
  optionValues: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
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
      currency: "TRY",
      status: "ACTIVE",
      optionValues: { color: "Black", size: "M" },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];
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
  orderSequence = 1;
  readonly auditLogs: AuditRecord[] = [];

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
      currency: string;
      status: ProductVariantStatus;
      optionValues?: Record<string, unknown> | null;
      lowStockThreshold?: number | null;
    },
  ) {
    const variant = {
      id: `variant_${this.variants.length + 1}`,
      productId,
      storeId,
      title: input.title,
      sku: input.sku,
      barcode: input.barcode ?? null,
      priceMinor: input.priceMinor,
      compareAtMinor: input.compareAtMinor ?? null,
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
    return variant;
  }

  async updateVariant(
    storeId: string,
    productId: string,
    variantId: string,
    input: Partial<Omit<VariantRecord, "id" | "storeId" | "productId" | "createdAt" | "updatedAt">> & {
      lowStockThreshold?: number | null;
    },
  ) {
    const variant = this.variants.find(
      (item) => item.storeId === storeId && item.productId === productId && item.id === variantId,
    );
    if (!variant) return null;
    const { lowStockThreshold, ...variantInput } = input;
    Object.assign(variant, variantInput, { updatedAt: new Date("2026-01-03T00:00:00.000Z") });
    const item = this.inventory.find((inventory) => inventory.storeId === storeId && inventory.variantId === variantId);
    if (item && lowStockThreshold !== undefined) item.lowStockThreshold = lowStockThreshold;
    return variant;
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

  orderTotals(lines: Array<{ totalAmount: number }>) {
    const subtotalAmount = lines.reduce((sum, line) => sum + line.totalAmount, 0);
    return { subtotalAmount, discountAmount: 0, shippingAmount: 0, taxAmount: 0, totalAmount: subtotalAmount };
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

  async listOrders(storeId: string, { limit, offset }: { limit: number; offset: number }) {
    const data = this.orders.filter((order) => order.storeId === storeId);
    return { data: data.slice(offset, offset + limit), total: data.length };
  }

  async findOrderById(storeId: string, orderId: string) {
    return this.orders.find((order) => order.storeId === storeId && order.id === orderId) ?? null;
  }

  async createOrder(
    storeId: string,
    input: {
      customerId?: string | null;
      customerEmail: string;
      currency: string;
      lines: Array<{ variantId: string; quantity: number }>;
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
    const totals = this.orderTotals(lines);
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
      placedAt: null,
      cancelledAt: null,
      cancelReason: null,
      createdAt: new Date("2026-01-05T00:00:00.000Z"),
      updatedAt: new Date("2026-01-05T00:00:00.000Z"),
      lines,
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

  async createAuditLog(input: AuditRecord) {
    this.auditLogs.push(input);
  }
}

async function createTestApp() {
  const passwordHash = await hashPassword("local-admin-password", config.PASSWORD_HASH_PEPPER);
  const dataAccess = new MemoryDataAccess(passwordHash);
  const app = createServer(config, {
    dataAccess,
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
