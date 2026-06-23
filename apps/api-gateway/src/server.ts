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
  planCreateRequestSchema,
  planListResponseSchema,
  planSchema,
  planUpdateRequestSchema,
  platformLoginRequestSchema,
  platformLoginResponseSchema,
  platformLogoutResponseSchema,
  platformMeResponseSchema,
} from "@commerce-os/contracts";
import { checkDatabaseHealth, prisma, type TransactionClient } from "@commerce-os/db";
import { createLogger } from "@commerce-os/logger";
import { checkRedisHealth } from "@commerce-os/queues";
import type {
  AuditAction,
  Plan,
  PlatformSession,
  PlatformUser,
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

  return app;
}
