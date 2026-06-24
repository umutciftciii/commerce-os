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
} from "@commerce-os/contracts";
import { checkDatabaseHealth, prisma, type TransactionClient } from "@commerce-os/db";
import { createLogger } from "@commerce-os/logger";
import { checkRedisHealth } from "@commerce-os/queues";
import type {
  AuditAction,
  InventoryItem,
  InventoryMovement,
  Plan,
  PlatformSession,
  PlatformUser,
  Product,
  ProductCategory,
  ProductVariant,
  Store,
  StoreStatus,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";

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
      categoryIds: string[];
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
      categoryIds?: string[];
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
    categoryIds: product.categoryIds,
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
  const loginRateLimiter = createLoginRateLimiter(config);
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

  return app;
}
