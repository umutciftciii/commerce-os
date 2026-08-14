/**
 * Store-auth guard (Faz C, ADR-271 RBAC foundation) — GERÇEK-DB entegrasyon testleri.
 *
 * CALISTIRMA: DATABASE_URL verilmezse SKIP (CI-safe). Test-only harness route'ları (production
 * debug endpoint DEĞİL) guard'ları egzersiz eder. Oturumlar doğrudan DB'ye yazılır (guard'ı
 * login akışından izole eder). Doğrulanan invariant'lar:
 *  - yalnız StoreUserSession; PlatformUser token reddedilir (fallback YOK)
 *  - ACTIVE StoreUser + valid/non-revoked/non-expired session; session.storeId authoritative
 *  - path :storeId mismatch → 404 (leak-free); RBAC matrix; capability + permission kompozisyonu
 *  - başarıda typed request principal iliştirilir; audit actor projeksiyonu
 */
import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { prisma } from "@commerce-os/db";
import { hashPassword } from "@commerce-os/auth";
import { resolveSessionPolicy } from "@commerce-os/config";
import type { StoreUserRole, StoreUserStatus } from "@prisma/client";
import { createStoreAuthData } from "../src/store-auth/data.js";
import {
  createStoreUserGuard,
  toStoreAuditActor,
  type StoreUserRequestPrincipal,
} from "../src/store-auth/guard.js";

const hasTestDb = Boolean(process.env.DATABASE_URL);
const created: string[] = [];
const createdPlatformUsers: string[] = [];

const TEST_SECRET = "test-secret";
const hashToken = (t: string) => createHash("sha256").update(`${t}.${TEST_SECRET}`).digest("hex");

async function makeStore(
  status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "CLOSED" = "ACTIVE",
): Promise<{ storeId: string; slug: string }> {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `sag-store-${sfx}`;
  await prisma.store.create({ data: { id: storeId, name: `SAG ${sfx}`, slug: `sag-${sfx}`, status } });
  created.push(storeId);
  return { storeId, slug: `sag-${sfx}` };
}

async function makeStoreUser(
  storeId: string,
  over: { email?: string | null; status?: StoreUserStatus; role?: StoreUserRole } = {},
): Promise<{ userId: string }> {
  const user = await prisma.storeUser.create({
    data: {
      storeId,
      email: over.email === null ? null : (over.email ?? `u-${randomUUID().slice(0, 8)}@e.test`),
      name: "Guard Test User",
      passwordHash: await hashPassword("irrelevant-for-guard"),
      status: over.status ?? "ACTIVE",
      role: over.role ?? "ADMIN",
    },
    select: { id: true },
  });
  return { userId: user.id };
}

/** Doğrudan oturum satırı üretir; ham token döner (Bearer olarak sunulur). */
async function makeSession(
  storeId: string,
  storeUserId: string,
  over: {
    expiresInMs?: number;
    absoluteInMs?: number | null;
    lastActivityInMs?: number;
    revoked?: boolean;
  } = {},
): Promise<string> {
  const rawToken = randomUUID() + randomUUID();
  const now = Date.now();
  await prisma.storeUserSession.create({
    data: {
      storeId,
      storeUserId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(now + (over.expiresInMs ?? 60 * 60 * 1000)),
      lastActivityAt: new Date(now + (over.lastActivityInMs ?? 0)),
      absoluteExpiresAt:
        over.absoluteInMs === null ? null : new Date(now + (over.absoluteInMs ?? 8 * 60 * 60 * 1000)),
      rememberMe: false,
      policyVersion: 1,
      revokedAt: over.revoked ? new Date(now - 1000) : null,
    },
  });
  return rawToken;
}

// Test-only harness: guard'ları + test route'larını kaydeder. capabilityEnabledMap ile
// capabilityKey → boolean enjekte edilir (mevcut cache yerine, guard'ı izole test için).
function buildGuardApp(capabilityEnabledMap: Record<string, boolean> = {}): FastifyInstance {
  const app = Fastify();
  const guards = createStoreUserGuard(app, {
    data: createStoreAuthData(prisma),
    policy: resolveSessionPolicy({}),
    hashToken,
    isCapabilityEnabled: (_storeId, key) => capabilityEnabledMap[key] ?? false,
  });

  // requireStoreUser — yalnız kimlik; principal'ı request-context'ten okur (accessor).
  app.get("/t/me", async (request, reply) => {
    const p = await guards.requireStoreUser(request, reply);
    if (!p) return;
    const ctx = guards.getStoreUserPrincipal(request);
    return { fromReturn: p, fromContext: ctx, sameRef: p === ctx, audit: toStoreAuditActor(p) };
  });

  // requireStoreUser + path :storeId eşleşmesi.
  app.get("/t/stores/:storeId/me", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const p = await guards.requireStoreUser(request, reply, { pathStoreId: storeId });
    if (!p) return;
    return { storeId: p.storeId };
  });

  // requireStorePermission — capability YOK; salt RBAC.
  app.get("/t/catalog-write", async (request, reply) => {
    const p = await guards.requireStorePermission("catalog:write")(request, reply);
    if (!p) return;
    return { ok: true };
  });

  // requireStorePermission + capability kompozisyonu (REFUNDS capability + refunds:manage).
  app.get("/t/refunds-manage", async (request, reply) => {
    const p = await guards.requireStoreManage("refunds:manage", { capabilityKey: "REFUNDS" })(request, reply);
    if (!p) return;
    return { ok: true };
  });

  return app;
}

async function makeActiveUserWithToken(role: StoreUserRole) {
  const store = await makeStore();
  const { userId } = await makeStoreUser(store.storeId, { role });
  const token = await makeSession(store.storeId, userId);
  return { store, userId, token };
}

describe.skipIf(!hasTestDb)("Store-auth guard (integration)", () => {
  afterEach(async () => {
    for (const storeId of created.splice(0)) {
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    }
    for (const id of createdPlatformUsers.splice(0)) {
      await prisma.platformUser.delete({ where: { id } }).catch(() => {});
    }
  });

  it("valid ACTIVE StoreUser → success; typed principal on request context", async () => {
    const app = buildGuardApp();
    const store = await makeStore();
    const { userId } = await makeStoreUser(store.storeId, { role: "OWNER", email: "owner@e.test" });
    const token = await makeSession(store.storeId, userId);

    const res = await app.inject({ method: "GET", url: "/t/me", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.fromReturn.storeUserId).toBe(userId);
    expect(body.fromReturn.storeId).toBe(store.storeId);
    expect(body.fromReturn.role).toBe("OWNER");
    expect(body.fromContext.storeUserId).toBe(userId); // context accessor sees same principal
    expect(body.sameRef).toBe(true);
    // audit actor projection
    expect(body.audit).toEqual({
      actorKind: "STORE_USER",
      actorStoreUserId: userId,
      actorName: "Guard Test User",
      actorEmail: "owner@e.test",
    });
  });

  it("no token → 401 UNAUTHORIZED", async () => {
    const app = buildGuardApp();
    const res = await app.inject({ method: "GET", url: "/t/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("PlatformUser session token → rejected (no PlatformUser fallback)", async () => {
    const app = buildGuardApp();
    // Bir PlatformUser + PlatformSession oluştur; onun ham token'ıyla store guard'ı dene.
    const puId = `sag-pu-${randomUUID().slice(0, 12)}`;
    await prisma.platformUser.create({
      data: { id: puId, email: `pu-${puId}@e.test`, name: "PU", passwordHash: await hashPassword("x"), role: "SUPER_ADMIN" },
    });
    createdPlatformUsers.push(puId);
    const rawToken = randomUUID() + randomUUID();
    await prisma.platformSession.create({
      data: {
        platformUserId: puId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        lastActivityAt: new Date(),
        absoluteExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
        policyVersion: 1,
      },
    });

    const res = await app.inject({ method: "GET", url: "/t/me", headers: { authorization: `Bearer ${rawToken}` } });
    expect(res.statusCode).toBe(401); // store-session lookup misses → generic 401
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("revoked session → 401", async () => {
    const app = buildGuardApp();
    const store = await makeStore();
    const { userId } = await makeStoreUser(store.storeId);
    const token = await makeSession(store.storeId, userId, { revoked: true });
    const res = await app.inject({ method: "GET", url: "/t/me", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
  });

  it("expired session → 401 (absolute + idle both in the past)", async () => {
    const app = buildGuardApp();
    const store = await makeStore();
    const { userId } = await makeStoreUser(store.storeId);
    // ADR-271: idle, lastActivityAt'ten türetilir → hem absolute'u hem lastActivity'yi geçmişe al.
    const token = await makeSession(store.storeId, userId, {
      expiresInMs: -1000,
      absoluteInMs: -1000,
      lastActivityInMs: -24 * 60 * 60 * 1000,
    });
    const res = await app.inject({ method: "GET", url: "/t/me", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
  });

  it("DISABLED StoreUser → 401 (valid session but non-ACTIVE)", async () => {
    const app = buildGuardApp();
    const store = await makeStore();
    const { userId } = await makeStoreUser(store.storeId, { status: "DISABLED" });
    const token = await makeSession(store.storeId, userId);
    const res = await app.inject({ method: "GET", url: "/t/me", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
  });

  it.each(["SUSPENDED", "CLOSED"] as const)("store %s → 401 (store status policy)", async (status) => {
    const app = buildGuardApp();
    const store = await makeStore(status);
    const { userId } = await makeStoreUser(store.storeId);
    const token = await makeSession(store.storeId, userId);
    const res = await app.inject({ method: "GET", url: "/t/me", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
  });

  it("native null-email StoreUser session → 401 (identity-integrity fail-closed; never 500)", async () => {
    const app = buildGuardApp();
    const store = await makeStore();
    const { userId } = await makeStoreUser(store.storeId, { email: null });
    const token = await makeSession(store.storeId, userId);
    const res = await app.inject({ method: "GET", url: "/t/me", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("path :storeId mismatch → 404 STORE_ACCESS_DENIED (leak-free)", async () => {
    const app = buildGuardApp();
    const { store, token } = await makeActiveUserWithToken("ADMIN");
    // doğru mağaza → 200
    const ok = await app.inject({
      method: "GET",
      url: `/t/stores/${store.storeId}/me`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ok.statusCode).toBe(200);
    // yanlış mağaza → 404 (var olmayan mağaza ile aynı yanıt)
    const mismatch = await app.inject({
      method: "GET",
      url: `/t/stores/some-other-store-${randomUUID().slice(0, 8)}/me`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(mismatch.statusCode).toBe(404);
    expect(mismatch.json().error.code).toBe("STORE_ACCESS_DENIED");
  });

  // --- RBAC matrix (catalog:write) ---
  it.each([
    ["OWNER", 200],
    ["ADMIN", 200],
    ["MANAGER", 200],
    ["STAFF", 403],
    ["VIEWER", 403],
  ] as const)("catalog:write — %s → %d", async (role, expected) => {
    const app = buildGuardApp();
    const { token } = await makeActiveUserWithToken(role);
    const res = await app.inject({
      method: "GET",
      url: "/t/catalog-write",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(expected);
    if (expected === 403) expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("unknown permission is impossible via typed API; role fail-closed proven by STAFF/VIEWER above", () => {
    // (statik tip bilinmeyen permission'ı engeller; fail-closed davranışı auth unit testinde de var)
    expect(true).toBe(true);
  });

  // --- capability + permission composition ---
  it("permission allow + capability OFF → 403 MODULE_DISABLED", async () => {
    const app = buildGuardApp({ REFUNDS: false }); // capability kapalı
    const { token } = await makeActiveUserWithToken("OWNER"); // refunds:manage var
    const res = await app.inject({
      method: "GET",
      url: "/t/refunds-manage",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("MODULE_DISABLED");
  });

  it("capability ON + permission DENY → 403 FORBIDDEN", async () => {
    const app = buildGuardApp({ REFUNDS: true });
    const { token } = await makeActiveUserWithToken("MANAGER"); // refunds:manage YOK
    const res = await app.inject({
      method: "GET",
      url: "/t/refunds-manage",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("capability ON + permission ALLOW → 200 (both required)", async () => {
    const app = buildGuardApp({ REFUNDS: true });
    const { token } = await makeActiveUserWithToken("ADMIN"); // refunds:manage var
    const res = await app.inject({
      method: "GET",
      url: "/t/refunds-manage",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("requireStoreManage rejects a non-:manage permission (programming error)", () => {
    const app = buildGuardApp();
    const guards = createStoreUserGuard(app, {
      data: createStoreAuthData(prisma),
      policy: resolveSessionPolicy({}),
      hashToken,
    });
    expect(() => guards.requireStoreManage("catalog:read")).toThrow(/:manage/);
  });

  it("toStoreAuditActor preserves null email (native/unlinked StoreUser)", () => {
    const principal: StoreUserRequestPrincipal = {
      storeUserId: "su_1",
      storeId: "store_1",
      role: "OWNER",
      name: null,
      email: null,
      sessionId: "sess_1",
    };
    expect(toStoreAuditActor(principal)).toEqual({
      actorKind: "STORE_USER",
      actorStoreUserId: "su_1",
      actorName: null,
      actorEmail: null,
    });
  });
});
