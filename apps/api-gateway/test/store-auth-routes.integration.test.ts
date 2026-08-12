/**
 * Store-auth routes (Faz B, TODO-B3) — GERÇEK-DB entegrasyon testleri.
 *
 * CALISTIRMA: DATABASE_URL verilmezse SKIP (CI-safe). Fastify inject; tenant `x-store-admin-tenant`
 * header'ından. Güvenlik değişmezleri: TÜM login başarısızlıkları aynı jenerik 401
 * INVALID_CREDENTIALS (enumeration yok); PlatformUser fallback yok; başarısız denemeler audit
 * YAZMAZ; response body'lerde passwordHash/tokenHash/linkedPlatformUserId/sessionId ASLA yok.
 */
import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { prisma } from "@commerce-os/db";
import { hashPassword, verifyPassword } from "@commerce-os/auth";
import { resolveSessionPolicy } from "@commerce-os/config";
import type { StoreUserRole, StoreUserStatus } from "@prisma/client";
import { createStoreAuthData } from "../src/store-auth/data.js";
import { registerStoreAuthRoutes, type StoreAuthRouteDeps } from "../src/store-auth/routes.js";

const hasTestDb = Boolean(process.env.DATABASE_URL);
const created: string[] = [];

const TEST_SECRET = "test-secret";
const hashToken = (t: string) => createHash("sha256").update(`${t}.${TEST_SECRET}`).digest("hex");

async function makeStore(): Promise<{ storeId: string; slug: string }> {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `sar-store-${sfx}`;
  const slug = `sar-${sfx}`;
  await prisma.store.create({ data: { id: storeId, name: `SAR ${sfx}`, slug } });
  created.push(storeId);
  return { storeId, slug };
}

async function makeStoreUser(
  storeId: string,
  over: {
    email: string;
    password?: string | null; // null = legacy null-passwordHash; undefined = default password
    status?: StoreUserStatus;
    role?: StoreUserRole;
    name?: string | null;
  },
): Promise<{ userId: string; password: string | null }> {
  const password = over.password === null ? null : (over.password ?? "correct-horse-battery-staple");
  const passwordHash = password ? await hashPassword(password) : null;
  const user = await prisma.storeUser.create({
    data: {
      storeId,
      email: over.email.toLowerCase(),
      name: over.name ?? "Test User",
      passwordHash,
      status: over.status ?? "ACTIVE",
      role: over.role ?? "ADMIN",
    },
    select: { id: true },
  });
  return { userId: user.id, password };
}

interface CapturedAudit {
  action: string;
  storeId?: string;
  actorKind?: string;
  actorStoreUserId?: string;
  actorName?: string | null;
  actorEmail?: string | null;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

function buildApp(): { app: FastifyInstance; audits: CapturedAudit[] } {
  const audits: CapturedAudit[] = [];
  const app = Fastify();
  const deps: StoreAuthRouteDeps = {
    data: createStoreAuthData(prisma),
    policy: resolveSessionPolicy({}),
    hashToken,
    verifyPassword: (pw, hash) => verifyPassword(pw, hash, ""),
    createAuditLog: async (input) => {
      audits.push(input as CapturedAudit);
    },
    loginRateLimiter: {
      isLimited: () => false,
      recordFailure() {},
      reset() {},
    },
  };
  registerStoreAuthRoutes(app, deps);
  return { app, audits };
}

// Recursively asserts none of the forbidden internal keys appear anywhere in a value tree.
function assertNoForbiddenKeys(value: unknown, forbidden: string[], path = "$"): void {
  if (value === null || typeof value !== "object") return;
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    expect(forbidden, `forbidden key "${key}" found at ${path}.${key}`).not.toContain(key);
    assertNoForbiddenKeys(val, forbidden, `${path}.${key}`);
  }
}

const FORBIDDEN_KEYS = ["passwordHash", "tokenHash", "linkedPlatformUserId", "sessionId"];

describe.skipIf(!hasTestDb)("Store-auth routes (integration)", () => {
  afterEach(async () => {
    for (const storeId of created.splice(0)) {
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    }
  });

  it("successful ACTIVE login → 200; safe DTO only", async () => {
    const { app } = buildApp();
    const store = await makeStore();
    const { userId, password } = await makeStoreUser(store.storeId, { email: "owner@e.test" });

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: { "x-store-admin-tenant": store.slug },
      payload: { email: "owner@e.test", password },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTypeOf("string");
    expect(body.user.id).toBe(userId);
    expect(body.user.storeId).toBe(store.storeId);
    expect(body.user.role).toBe("ADMIN");
    assertNoForbiddenKeys(body, FORBIDDEN_KEYS);
  });

  it("wrong password → 401 INVALID_CREDENTIALS", async () => {
    const { app } = buildApp();
    const store = await makeStore();
    await makeStoreUser(store.storeId, { email: "owner@e.test" });

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: { "x-store-admin-tenant": store.slug },
      payload: { email: "owner@e.test", password: "totally-wrong" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("unknown email → 401 INVALID_CREDENTIALS", async () => {
    const { app } = buildApp();
    const store = await makeStore();

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: { "x-store-admin-tenant": store.slug },
      payload: { email: "nobody@e.test", password: "whatever12" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("unknown/missing tenant header → 401 (no store leak)", async () => {
    const { app } = buildApp();
    const store = await makeStore();
    const { password } = await makeStoreUser(store.storeId, { email: "owner@e.test" });

    const missing = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      payload: { email: "owner@e.test", password },
    });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error.code).toBe("INVALID_CREDENTIALS");

    const unknown = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: { "x-store-admin-tenant": "does-not-exist" },
      payload: { email: "owner@e.test", password },
    });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("INVITED user → 401", async () => {
    const { app } = buildApp();
    const store = await makeStore();
    const { password } = await makeStoreUser(store.storeId, { email: "invited@e.test", status: "INVITED" });

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: { "x-store-admin-tenant": store.slug },
      payload: { email: "invited@e.test", password },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("DISABLED user → 401", async () => {
    const { app } = buildApp();
    const store = await makeStore();
    const { password } = await makeStoreUser(store.storeId, { email: "disabled@e.test", status: "DISABLED" });

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: { "x-store-admin-tenant": store.slug },
      payload: { email: "disabled@e.test", password },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("legacy null-passwordHash ACTIVE user → 401 (no fallback)", async () => {
    const { app } = buildApp();
    const store = await makeStore();
    await makeStoreUser(store.storeId, { email: "legacy@e.test", password: null });

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: { "x-store-admin-tenant": store.slug },
      payload: { email: "legacy@e.test", password: "anything123" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("same-email two-store isolation", async () => {
    const { app } = buildApp();
    const storeA = await makeStore();
    const storeB = await makeStore();
    await makeStoreUser(storeA.storeId, { email: "same@e.test", password: "password-A-1" });
    await makeStoreUser(storeB.storeId, { email: "same@e.test", password: "password-B-1" });

    const okA = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: { "x-store-admin-tenant": storeA.slug },
      payload: { email: "same@e.test", password: "password-A-1" },
    });
    expect(okA.statusCode).toBe(200);
    expect(okA.json().user.storeId).toBe(storeA.storeId);

    const crossed = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: { "x-store-admin-tenant": storeA.slug },
      payload: { email: "same@e.test", password: "password-B-1" },
    });
    expect(crossed.statusCode).toBe(401);
    expect(crossed.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("PlatformUser-only email → 401 (no PlatformUser fallback)", async () => {
    const { app } = buildApp();
    const store = await makeStore();
    const platformUserId = `sar-pu-${randomUUID().slice(0, 12)}`;
    await prisma.platformUser.create({
      data: {
        id: platformUserId,
        email: "pu@e.test",
        name: "Platform Only",
        passwordHash: await hashPassword("platform-pass-1"),
        role: "SUPPORT_ADMIN",
      },
    });

    try {
      const res = await app.inject({
        method: "POST",
        url: "/auth/store/login",
        headers: { "x-store-admin-tenant": store.slug },
        payload: { email: "pu@e.test", password: "platform-pass-1" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
    } finally {
      await prisma.platformUser.delete({ where: { id: platformUserId } }).catch(() => {});
    }
  });

  it("GET /auth/store/session — 200 with token; 401 without", async () => {
    const { app } = buildApp();
    const store = await makeStore();
    const { password } = await makeStoreUser(store.storeId, { email: "sess@e.test" });

    const login = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: { "x-store-admin-tenant": store.slug },
      payload: { email: "sess@e.test", password },
    });
    expect(login.statusCode).toBe(200);
    const { token, user } = login.json();

    const session = await app.inject({
      method: "GET",
      url: "/auth/store/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(session.statusCode).toBe(200);
    const sessionBody = session.json();
    expect(sessionBody.user).toEqual(user);
    expect(sessionBody.session.timing.warningLeadSeconds).toBeTypeOf("number");
    assertNoForbiddenKeys(sessionBody, FORBIDDEN_KEYS);

    const noToken = await app.inject({ method: "GET", url: "/auth/store/session" });
    expect(noToken.statusCode).toBe(401);
  });

  it("logout revokes the session; subsequent session check → 401", async () => {
    const { app } = buildApp();
    const store = await makeStore();
    const { password } = await makeStoreUser(store.storeId, { email: "logout@e.test" });

    const login = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: { "x-store-admin-tenant": store.slug },
      payload: { email: "logout@e.test", password },
    });
    const { token } = login.json();

    const logout = await app.inject({
      method: "POST",
      url: "/auth/store/logout",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ revoked: true });

    const session = await app.inject({
      method: "GET",
      url: "/auth/store/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(session.statusCode).toBe(401);
  });

  it("audit snapshot: LOGIN + LOGOUT capture STORE_USER actor; no password leak", async () => {
    const { app, audits } = buildApp();
    const store = await makeStore();
    const { userId, password } = await makeStoreUser(store.storeId, {
      email: "audit@e.test",
      name: "Audit Person",
    });

    const login = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: { "x-store-admin-tenant": store.slug },
      payload: { email: "audit@e.test", password },
    });
    const { token } = login.json();

    await app.inject({
      method: "POST",
      url: "/auth/store/logout",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(audits).toHaveLength(2);
    const loginAudit = audits.find((a) => a.action === "LOGIN")!;
    expect(loginAudit.actorKind).toBe("STORE_USER");
    expect(loginAudit.actorStoreUserId).toBe(userId);
    expect(loginAudit.actorName).toBe("Audit Person");
    expect(loginAudit.actorEmail).toBe("audit@e.test");

    const logoutAudit = audits.find((a) => a.action === "LOGOUT")!;
    expect(logoutAudit.actorKind).toBe("STORE_USER");
    expect(logoutAudit.actorStoreUserId).toBe(userId);
    expect(logoutAudit.actorName).toBe("Audit Person");
    expect(logoutAudit.actorEmail).toBe("audit@e.test");

    const auditStr = JSON.stringify(audits);
    expect(auditStr).not.toMatch(/correct-horse-battery-staple/);
    expect(auditStr.toLowerCase()).not.toContain("password");
  });

  it("failed login attempts write NO audit row", async () => {
    const { app, audits } = buildApp();
    const store = await makeStore();
    await makeStoreUser(store.storeId, { email: "noaudit@e.test" });

    await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: { "x-store-admin-tenant": store.slug },
      payload: { email: "noaudit@e.test", password: "wrong-one" },
    });
    expect(audits).toHaveLength(0);
  });

  it("rememberMe timing parity: propagates through login → session", async () => {
    const { app } = buildApp();
    const store = await makeStore();
    const { password } = await makeStoreUser(store.storeId, { email: "remember@e.test" });

    const login = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: { "x-store-admin-tenant": store.slug },
      payload: { email: "remember@e.test", password, rememberMe: true },
    });
    expect(login.statusCode).toBe(200);
    const { token } = login.json();

    const session = await app.inject({
      method: "GET",
      url: "/auth/store/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(session.statusCode).toBe(200);
    const timing = session.json().session.timing;
    expect(timing.rememberMe).toBe(true);

    const absoluteMs = new Date(timing.absoluteExpiresAt).getTime();
    const lastActivityMs = new Date(timing.lastActivityAt).getTime();
    const diffDays = (absoluteMs - lastActivityMs) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThan(29);
    expect(diffDays).toBeLessThan(31);
  });
});
