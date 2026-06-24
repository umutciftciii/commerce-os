import { hashPassword } from "@commerce-os/auth";
import {
  Prisma,
  type AuditAction,
  type InventoryMovementType,
  type PlatformUserRole,
  type ProductCategoryStatus,
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
    expect(listResponse.json()).toMatchObject({ data: [{ slug: "demo-hoodie", categoryIds: ["cat_apparel"] }] });

    const createResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/products",
      headers: { authorization: `Bearer ${token}` },
      payload: { title: "Demo Tee", slug: "demo-tee", status: "ACTIVE", categoryIds: ["cat_apparel"] },
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({ slug: "demo-tee", categoryIds: ["cat_apparel"] });

    const duplicateResponse = await app.inject({
      method: "POST",
      url: "/stores/store_demo/products",
      headers: { authorization: `Bearer ${token}` },
      payload: { title: "Duplicate Tee", slug: "demo-tee" },
    });
    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.json()).toMatchObject({ error: { code: "PRODUCT_SLUG_EXISTS" } });

    const updateResponse = await app.inject({
      method: "PATCH",
      url: "/stores/store_demo/products/product_2",
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "ARCHIVED" },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({ status: "ARCHIVED" });
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
});
