/**
 * store-auth authenticateStoreToken (ADR-271) — GERÇEK-DB entegrasyon testleri.
 *
 * CALISTIRMA: DATABASE_URL verilmezse SKIP (CI-safe). İki-kapılı geçerlilik (idle+absolute),
 * DISABLED red, throttle'lı aktivite yenileme ve legacy (policyVersion 0) terfi senaryolarını
 * gerçek Prisma + gerçek @commerce-os/config session-policy ile doğrular.
 */
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { prisma } from "@commerce-os/db";
import type { StoreUserStatus } from "@prisma/client";
import { resolveSessionPolicy } from "@commerce-os/config";
import { createStoreAuthData } from "../src/store-auth/data.js";
import { authenticateStoreToken, type AuthenticateStoreDeps } from "../src/store-auth/authenticate.js";

const hasTestDb = Boolean(process.env.DATABASE_URL);
const created: string[] = [];
const minMs = 60 * 1000;
const hourMs = 60 * minMs;

function hashToken(token: string): string {
  return createHash("sha256").update(`${token}.test-secret`).digest("hex");
}

async function makeStore(): Promise<{ storeId: string }> {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `saa-store-${sfx}`;
  await prisma.store.create({ data: { id: storeId, name: `SAA ${sfx}`, slug: `saa-${sfx}` } });
  created.push(storeId);
  return { storeId };
}

async function makeStoreUser(storeId: string, status: StoreUserStatus = "ACTIVE") {
  const sfx = randomUUID().slice(0, 12);
  return prisma.storeUser.create({
    data: {
      storeId,
      email: `saa-${sfx}@example.test`,
      name: "Auth Test User",
      passwordHash: "irrelevant-for-session-tests",
      status,
      role: "ADMIN",
    },
  });
}

interface SeedSessionOverrides {
  token?: string;
  lastActivityAt?: Date;
  absoluteExpiresAt?: Date | null;
  expiresAt?: Date;
  revokedAt?: Date | null;
  rememberMe?: boolean;
  policyVersion?: number;
}

async function seedSession(storeId: string, storeUserId: string, o: SeedSessionOverrides = {}) {
  const now = new Date();
  const token = o.token ?? randomUUID();
  const absoluteExpiresAt = o.absoluteExpiresAt === undefined ? new Date(now.getTime() + 8 * hourMs) : o.absoluteExpiresAt;
  const session = await prisma.storeUserSession.create({
    data: {
      storeId,
      storeUserId,
      tokenHash: hashToken(token),
      expiresAt: o.expiresAt ?? absoluteExpiresAt ?? new Date(now.getTime() + 8 * hourMs),
      lastActivityAt: o.lastActivityAt ?? now,
      absoluteExpiresAt,
      rememberMe: o.rememberMe ?? false,
      revokedAt: o.revokedAt ?? null,
      policyVersion: o.policyVersion ?? 1,
    },
  });
  return { token, session };
}

/** Gerçek data-access + izlenebilir touch (fire-and-forget promise'ı testte await edebilmek için). */
function buildDeps(): AuthenticateStoreDeps & { lastTouch: { promise: Promise<unknown> | null } } {
  const real = createStoreAuthData(prisma);
  const lastTouch: { promise: Promise<unknown> | null } = { promise: null };
  return {
    data: {
      findStoreSessionByTokenHash: real.findStoreSessionByTokenHash,
      touchStoreSessionActivity: (sessionId: string, now: Date, promoteLegacy = false) => {
        const p = real.touchStoreSessionActivity(sessionId, now, promoteLegacy);
        lastTouch.promise = p;
        return p;
      },
    },
    policy: resolveSessionPolicy({}),
    hashToken,
    lastTouch,
  };
}

describe.skipIf(!hasTestDb)("authenticateStoreToken (ADR-271, integration)", () => {
  afterEach(async () => {
    for (const storeId of created.splice(0)) {
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    }
  });

  it("geçerli ACTIVE oturum → principal döner (hash alanları yok)", async () => {
    const { storeId } = await makeStore();
    const user = await makeStoreUser(storeId);
    const deps = buildDeps();
    const { token } = await seedSession(storeId, user.id);

    const result = await authenticateStoreToken(deps, token, new Date());
    expect(result).not.toBeNull();
    expect(result!.principal).toEqual({
      storeUserId: user.id,
      storeId,
      role: "ADMIN",
      name: "Auth Test User",
      email: user.email,
    });
    expect("passwordHash" in result!.principal).toBe(false);
    expect("tokenHash" in result!.session).toBe(false);
  });

  it("iptal edilmiş (revokedAt set) oturum → null", async () => {
    const { storeId } = await makeStore();
    const user = await makeStoreUser(storeId);
    const deps = buildDeps();
    const { token } = await seedSession(storeId, user.id, { revokedAt: new Date() });

    const result = await authenticateStoreToken(deps, token, new Date());
    expect(result).toBeNull();
  });

  it("idle-expired (lastActivityAt uzak geçmiş, policyVersion 1) → null", async () => {
    const { storeId } = await makeStore();
    const user = await makeStoreUser(storeId);
    const deps = buildDeps();
    const now = new Date();
    // rememberOff idle=30dk; 31dk önce → idle deadline geçmiş, absolute hâlâ açık.
    const { token } = await seedSession(storeId, user.id, {
      lastActivityAt: new Date(now.getTime() - 31 * minMs),
      absoluteExpiresAt: new Date(now.getTime() + hourMs),
      policyVersion: 1,
    });

    const result = await authenticateStoreToken(deps, token, now);
    expect(result).toBeNull();
  });

  it("absolute-expired (absoluteExpiresAt/expiresAt geçmişte) → null", async () => {
    const { storeId } = await makeStore();
    const user = await makeStoreUser(storeId);
    const deps = buildDeps();
    const now = new Date();
    const { token } = await seedSession(storeId, user.id, {
      lastActivityAt: now,
      absoluteExpiresAt: new Date(now.getTime() - minMs),
      expiresAt: new Date(now.getTime() - minMs),
      policyVersion: 1,
    });

    const result = await authenticateStoreToken(deps, token, now);
    expect(result).toBeNull();
  });

  it("DISABLED storeUser (oturum aksi halde geçerli) → null", async () => {
    const { storeId } = await makeStore();
    const user = await makeStoreUser(storeId, "DISABLED");
    const deps = buildDeps();
    const { token } = await seedSession(storeId, user.id);

    const result = await authenticateStoreToken(deps, token, new Date());
    expect(result).toBeNull();
  });

  it("throttle'lı aktivite: eski lastActivityAt + countAsActivity:true → bump; countAsActivity:false → bump yok", async () => {
    const { storeId } = await makeStore();
    const user = await makeStoreUser(storeId);
    const deps = buildDeps();
    const now = new Date();
    // activityThrottleSeconds=5dk (varsayılan); 6dk önce → throttle eşiği aşılmış.
    const { token, session } = await seedSession(storeId, user.id, {
      lastActivityAt: new Date(now.getTime() - 6 * minMs),
    });

    const result = await authenticateStoreToken(deps, token, now, { countAsActivity: true });
    expect(result).not.toBeNull();
    if (deps.lastTouch.promise) await deps.lastTouch.promise;

    const bumped = await prisma.storeUserSession.findUnique({ where: { id: session.id } });
    expect(bumped!.lastActivityAt.getTime()).toBeCloseTo(now.getTime(), -2);

    // İkinci oturum: countAsActivity:false → hiç bump edilmemeli.
    const deps2 = buildDeps();
    const { token: token2, session: session2 } = await seedSession(storeId, user.id, {
      lastActivityAt: new Date(now.getTime() - 6 * minMs),
    });
    const oldLastActivity = session2.lastActivityAt.getTime();

    const result2 = await authenticateStoreToken(deps2, token2, now, { countAsActivity: false });
    expect(result2).not.toBeNull();
    expect(deps2.lastTouch.promise).toBeNull();

    const notBumped = await prisma.storeUserSession.findUnique({ where: { id: session2.id } });
    expect(notBumped!.lastActivityAt.getTime()).toBe(oldLastActivity);
  });

  it("legacy terfi: policyVersion:0 (absolute'a göre geçerli) → doğrulama sonrası policyVersion 1 olur", async () => {
    const { storeId } = await makeStore();
    const user = await makeStoreUser(storeId);
    const deps = buildDeps();
    const now = new Date();
    const { token, session } = await seedSession(storeId, user.id, {
      lastActivityAt: new Date(now.getTime() - 10 * hourMs), // idle uygulanmaz (legacy)
      absoluteExpiresAt: new Date(now.getTime() + hourMs),
      policyVersion: 0,
    });

    const result = await authenticateStoreToken(deps, token, now);
    expect(result).not.toBeNull();
    if (deps.lastTouch.promise) await deps.lastTouch.promise;

    const promoted = await prisma.storeUserSession.findUnique({ where: { id: session.id } });
    expect(promoted!.policyVersion).toBe(1);
  });
});
