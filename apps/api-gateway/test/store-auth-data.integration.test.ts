/**
 * store-auth data-access — GERÇEK-DB entegrasyon testleri.
 *
 * CALISTIRMA: DATABASE_URL verilmezse SKIP (CI-safe). Select-allowlist'lerin sızdırmadığını
 * (passwordHash/tokenHash) ve idempotent revoke davranışını doğrular.
 */
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { prisma } from "@commerce-os/db";
import { createStoreAuthData } from "../src/store-auth/data.js";

const hasTestDb = Boolean(process.env.DATABASE_URL);
const created: string[] = [];

function hashToken(token: string): string {
  return createHash("sha256").update(`${token}.test-secret`).digest("hex");
}

async function makeStore(): Promise<{ storeId: string }> {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `sad-store-${sfx}`;
  await prisma.store.create({ data: { id: storeId, name: `SAD ${sfx}`, slug: `sad-${sfx}`, status: "ACTIVE" } });
  created.push(storeId);
  return { storeId };
}

async function makeStoreUser(
  storeId: string,
  over?: { email?: string; status?: "INVITED" | "ACTIVE" | "DISABLED"; passwordHash?: string },
) {
  const sfx = randomUUID().slice(0, 12);
  const email = over?.email ?? `sad-${sfx}@example.test`;
  const user = await prisma.storeUser.create({
    data: {
      storeId,
      email,
      name: "Test Store Admin",
      passwordHash: over?.passwordHash ?? "hashed-password-placeholder",
      status: over?.status ?? "ACTIVE",
      role: "OWNER",
    },
  });
  return user;
}

describe.skipIf(!hasTestDb)("store-auth data-access (integration)", () => {
  afterEach(async () => {
    for (const storeId of created.splice(0)) {
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    }
  });

  it("createStoreSession: yalnız {id, expiresAt} döner; ham satırda tokenHash var, yanlış hash null döner", async () => {
    const { storeId } = await makeStore();
    const user = await makeStoreUser(storeId);
    const data = createStoreAuthData(prisma);
    const now = new Date();
    const token = randomUUID();

    const created_ = await data.createStoreSession({
      storeUserId: user.id,
      storeId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
      lastActivityAt: now,
      absoluteExpiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
      rememberMe: false,
    });

    expect(Object.keys(created_).sort()).toEqual(["expiresAt", "id"]);

    const raw = await prisma.storeUserSession.findUnique({ where: { id: created_.id } });
    expect(raw?.tokenHash).toBe(hashToken(token));

    const wrongHash = await data.findStoreSessionByTokenHash(hashToken("not-the-token"));
    expect(wrongHash).toBeNull();
  });

  it("findStoreSessionByTokenHash: allowlist şekli döner; storeUser altında passwordHash YOK", async () => {
    const { storeId } = await makeStore();
    const user = await makeStoreUser(storeId);
    const data = createStoreAuthData(prisma);
    const now = new Date();
    const token = randomUUID();

    await data.createStoreSession({
      storeUserId: user.id,
      storeId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
      lastActivityAt: now,
      absoluteExpiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
      rememberMe: false,
    });

    const row = await data.findStoreSessionByTokenHash(hashToken(token));
    expect(row).not.toBeNull();
    expect(row!.storeId).toBe(storeId);
    expect(row!.storeUser.id).toBe(user.id);
    expect("passwordHash" in row!.storeUser).toBe(false);
    expect("tokenHash" in row!).toBe(false);
    // store allowlist (Faz E1): slug + name (session store context için) + status (status policy).
    // Başka store alanı sızmaz (id/metadata/timestamps YOK — storeId zaten üst düzeyde taşınır).
    expect(Object.keys(row!.store).sort()).toEqual(["name", "slug", "status"]);
    expect(row!.store.status).toBe("ACTIVE");
    expect(row!.store.slug).toBeTypeOf("string");
    expect(row!.store.name).toBeTypeOf("string");
  });

  it("revokeStoreSession: ilk çağrıda true, ikinci çağrıda false (idempotent-safe)", async () => {
    const { storeId } = await makeStore();
    const user = await makeStoreUser(storeId);
    const data = createStoreAuthData(prisma);
    const now = new Date();
    const token = randomUUID();

    const sess = await data.createStoreSession({
      storeUserId: user.id,
      storeId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
      lastActivityAt: now,
      absoluteExpiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
      rememberMe: false,
    });

    const first = await data.revokeStoreSession(sess.id);
    expect(first).toBe(true);
    const second = await data.revokeStoreSession(sess.id);
    expect(second).toBe(false);

    const raw = await prisma.storeUserSession.findUnique({ where: { id: sess.id } });
    expect(raw?.revokedAt).not.toBeNull();
  });

  it("findStoreUserForAuth: (storeId, normalizedEmail) ile bulur ve passwordHash döner; farklı mağazada aynı email null", async () => {
    const { storeId: storeA } = await makeStore();
    const { storeId: storeB } = await makeStore();
    const email = `owner-${randomUUID().slice(0, 8)}@example.test`;
    await makeStoreUser(storeA, { email, passwordHash: "the-real-hash" });

    const data = createStoreAuthData(prisma);
    const found = await data.findStoreUserForAuth(storeA, email);
    expect(found).not.toBeNull();
    expect(found!.passwordHash).toBe("the-real-hash");
    expect(found!.storeId).toBe(storeA);

    const crossStore = await data.findStoreUserForAuth(storeB, email);
    expect(crossStore).toBeNull();
  });
});
