import { hashPassword } from "@commerce-os/auth";
import { Prisma, type AuditAction, type PlatformUserRole, type StoreStatus } from "@prisma/client";
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
});
