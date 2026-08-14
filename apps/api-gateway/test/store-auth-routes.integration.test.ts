/**
 * Store-auth routes (Faz B, TODO-B3) — GERÇEK-DB entegrasyon testleri.
 *
 * CALISTIRMA: DATABASE_URL verilmezse SKIP (CI-safe). Fastify inject.
 *
 * TENANT TRUST BOUNDARY: tenant context YALNIZCA sunucu-tarafı deployment config'inden
 * (`buildApp(configuredStoreSlug)` ← STORE_ADMIN_STORE_SLUG) çözülür. İstemci tenant SEÇEMEZ:
 * spoof edilmiş `x-store-admin-tenant` header'ı, host, body/query storeSlug/storeId YOKSAYILIR.
 * Config tanımsız/bilinmeyen ise login fail-closed 401. Güvenlik değişmezleri: TÜM login
 * başarısızlıkları aynı jenerik 401 INVALID_CREDENTIALS (enumeration yok); PlatformUser fallback
 * yok; başarısız denemeler audit YAZMAZ; response body'lerde passwordHash/tokenHash/
 * linkedPlatformUserId/sessionId ASLA yok.
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

async function makeStore(
  status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "CLOSED" = "ACTIVE",
): Promise<{ storeId: string; slug: string }> {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `sar-store-${sfx}`;
  const slug = `sar-${sfx}`;
  await prisma.store.create({ data: { id: storeId, name: `SAR ${sfx}`, slug, status } });
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

// Tenant, deployment config'inden (configuredStoreSlug) enjekte edilir — istemci header'ından
// DEĞİL. Tek-mağaza deployment modeli: her app instance'ı tek bir mağazaya pinlenir.
function buildApp(configuredStoreSlug?: string): { app: FastifyInstance; audits: CapturedAudit[] } {
  const audits: CapturedAudit[] = [];
  const app = Fastify();
  const deps: StoreAuthRouteDeps = {
    data: createStoreAuthData(prisma),
    policy: resolveSessionPolicy({}),
    configuredStoreSlug,
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

  it("configured deployment tenant → successful ACTIVE login → 200; safe DTO only", async () => {
    const store = await makeStore();
    const { userId, password } = await makeStoreUser(store.storeId, { email: "owner@e.test" });
    const { app } = buildApp(store.slug);

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
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
    const store = await makeStore();
    await makeStoreUser(store.storeId, { email: "owner@e.test" });
    const { app } = buildApp(store.slug);

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      payload: { email: "owner@e.test", password: "totally-wrong" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("unknown email → 401 INVALID_CREDENTIALS", async () => {
    const store = await makeStore();
    const { app } = buildApp(store.slug);

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      payload: { email: "nobody@e.test", password: "whatever12" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  // --- STORE STATUS POLICY (Faz D) -----------------------------------------------------------

  it.each(["SUSPENDED", "CLOSED", "DRAFT"] as const)(
    "store %s → login 401 (yalnız ACTIVE eligible)",
    async (status) => {
      const store = await makeStore(status);
      const { password } = await makeStoreUser(store.storeId, { email: "owner@e.test" });
      const { app } = buildApp(store.slug);
      const res = await app.inject({
        method: "POST",
        url: "/auth/store/login",
        payload: { email: "owner@e.test", password },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
    },
  );

  // --- TENANT TRUST BOUNDARY (ADR-271 takip) -------------------------------------------------

  it("missing configured tenant → fail-closed 401 (no store leak)", async () => {
    const store = await makeStore();
    const { password } = await makeStoreUser(store.storeId, { email: "owner@e.test" });
    const { app } = buildApp(undefined); // deployment config yok → resolver null → fail-closed

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      payload: { email: "owner@e.test", password },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("unknown configured tenant → fail-closed 401", async () => {
    // Config gerçek bir mağazaya işaret etmiyor: findStoreBySlug null → generic 401.
    const store = await makeStore();
    const { password } = await makeStoreUser(store.storeId, { email: "owner@e.test" });
    const { app } = buildApp(`does-not-exist-${randomUUID().slice(0, 8)}`);

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      payload: { email: "owner@e.test", password },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("spoofed x-store-admin-tenant header CANNOT change tenant (ignored; config still authenticates)", async () => {
    // App storeA'ya pinli; kullanıcı yalnız storeA'da. Saldırgan spoof header + host yollar.
    const storeA = await makeStore();
    const { userId, password } = await makeStoreUser(storeA.storeId, { email: "owner@e.test" });
    const { app } = buildApp(storeA.slug);

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: {
        "x-store-admin-tenant": "attacker-controlled-slug",
        host: "attacker.example.com",
      },
      payload: { email: "owner@e.test", password },
    });

    // Header/host YOKSAYILIR: config'teki storeA'ya karşı doğrulanır → 200, storeA döner.
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe(userId);
    expect(res.json().user.storeId).toBe(storeA.storeId);
  });

  it("spoofed tenant header pointing at a REAL other store cannot cross-authenticate", async () => {
    // App storeA'ya pinli. Kurban storeB'de geçerli creds'e sahip. Saldırgan storeB.slug'ı
    // header/body ile enjekte etse bile tenant storeA kalır → storeB kullanıcısı storeA'da yok → 401.
    const storeA = await makeStore();
    const storeB = await makeStore();
    await makeStoreUser(storeB.storeId, { email: "victim@e.test", password: "victim-pass-1" });
    const { app } = buildApp(storeA.slug);

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      headers: { "x-store-admin-tenant": storeB.slug },
      payload: {
        email: "victim@e.test",
        password: "victim-pass-1",
        // İstemci gövde alanları da tenant SEÇEMEZ (schema strip'ler; route yoksayar):
        storeSlug: storeB.slug,
        storeId: storeB.storeId,
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("client body storeSlug/storeId is ignored (config tenant wins)", async () => {
    // App storeA'ya pinli, kullanıcı storeA'da. Gövdeye başka mağazayı hedefleyen alanlar konur.
    const storeA = await makeStore();
    const storeB = await makeStore();
    const { userId, password } = await makeStoreUser(storeA.storeId, { email: "owner@e.test" });
    const { app } = buildApp(storeA.slug);

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      payload: {
        email: "owner@e.test",
        password,
        storeSlug: storeB.slug,
        storeId: storeB.storeId,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().user.storeId).toBe(storeA.storeId);
    expect(res.json().user.id).toBe(userId);
  });

  it("INVITED user → 401", async () => {
    const store = await makeStore();
    const { password } = await makeStoreUser(store.storeId, { email: "invited@e.test", status: "INVITED" });
    const { app } = buildApp(store.slug);

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      payload: { email: "invited@e.test", password },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("DISABLED user → 401", async () => {
    const store = await makeStore();
    const { password } = await makeStoreUser(store.storeId, { email: "disabled@e.test", status: "DISABLED" });
    const { app } = buildApp(store.slug);

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      payload: { email: "disabled@e.test", password },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("legacy null-passwordHash ACTIVE user → 401 (no fallback)", async () => {
    const store = await makeStore();
    await makeStoreUser(store.storeId, { email: "legacy@e.test", password: null });
    const { app } = buildApp(store.slug);

    const res = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      payload: { email: "legacy@e.test", password: "anything123" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("same-email different-store isolation (app pinned to storeA)", async () => {
    const storeA = await makeStore();
    const storeB = await makeStore();
    await makeStoreUser(storeA.storeId, { email: "same@e.test", password: "password-A-1" });
    await makeStoreUser(storeB.storeId, { email: "same@e.test", password: "password-B-1" });
    const { app } = buildApp(storeA.slug);

    // storeA creds → storeA'da başarılı.
    const okA = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      payload: { email: "same@e.test", password: "password-A-1" },
    });
    expect(okA.statusCode).toBe(200);
    expect(okA.json().user.storeId).toBe(storeA.storeId);

    // storeB'nin (doğru) şifresi storeA'ya karşı çalışmaz — tenant izolasyonu korunur.
    const crossed = await app.inject({
      method: "POST",
      url: "/auth/store/login",
      payload: { email: "same@e.test", password: "password-B-1" },
    });
    expect(crossed.statusCode).toBe(401);
    expect(crossed.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("PlatformUser-only email → 401 (no PlatformUser fallback)", async () => {
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
    const { app } = buildApp(store.slug);

    try {
      const res = await app.inject({
        method: "POST",
        url: "/auth/store/login",
        payload: { email: "pu@e.test", password: "platform-pass-1" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
    } finally {
      await prisma.platformUser.delete({ where: { id: platformUserId } }).catch(() => {});
    }
  });

  it("GET /auth/store/session — 200 with token; 401 without", async () => {
    const store = await makeStore();
    const { password } = await makeStoreUser(store.storeId, { email: "sess@e.test" });
    const { app } = buildApp(store.slug);

    const login = await app.inject({
      method: "POST",
      url: "/auth/store/login",
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
    const store = await makeStore();
    const { password } = await makeStoreUser(store.storeId, { email: "logout@e.test" });
    const { app } = buildApp(store.slug);

    const login = await app.inject({
      method: "POST",
      url: "/auth/store/login",
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
    const store = await makeStore();
    const { userId, password } = await makeStoreUser(store.storeId, {
      email: "audit@e.test",
      name: "Audit Person",
    });
    const { app, audits } = buildApp(store.slug);

    const login = await app.inject({
      method: "POST",
      url: "/auth/store/login",
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
    const store = await makeStore();
    await makeStoreUser(store.storeId, { email: "noaudit@e.test" });
    const { app, audits } = buildApp(store.slug);

    await app.inject({
      method: "POST",
      url: "/auth/store/login",
      payload: { email: "noaudit@e.test", password: "wrong-one" },
    });
    expect(audits).toHaveLength(0);
  });

  it("rememberMe timing parity: propagates through login → session", async () => {
    const store = await makeStore();
    const { password } = await makeStoreUser(store.storeId, { email: "remember@e.test" });
    const { app } = buildApp(store.slug);

    const login = await app.inject({
      method: "POST",
      url: "/auth/store/login",
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
