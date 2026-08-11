import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/index.js";

const hasTestDb = Boolean(process.env.DATABASE_URL);
const created: string[] = [];

describe.skipIf(!hasTestDb)("StoreUser identity schema", () => {
  afterEach(async () => {
    for (const id of created.splice(0)) {
      await prisma.store.delete({ where: { id } }).catch(() => {});
    }
  });

  it("allows same email across stores, rejects duplicate within a store", async () => {
    const sfx = randomUUID().slice(0, 8);
    const a = await prisma.store.create({ data: { name: "A", slug: `a-${sfx}` } });
    const b = await prisma.store.create({ data: { name: "B", slug: `b-${sfx}` } });
    created.push(a.id, b.id);
    await prisma.storeUser.create({ data: { storeId: a.id, email: "x@e.test", passwordHash: "h", status: "ACTIVE", role: "OWNER" } });
    await prisma.storeUser.create({ data: { storeId: b.id, email: "x@e.test", passwordHash: "h", status: "ACTIVE", role: "OWNER" } }); // ok cross-store
    await expect(
      prisma.storeUser.create({ data: { storeId: a.id, email: "x@e.test", passwordHash: "h", status: "ACTIVE", role: "ADMIN" } }),
    ).rejects.toThrow();
  });

  it("StoreUserSession binds to store + storeUser; revoke/expiry primitives", async () => {
    const sfx = randomUUID().slice(0, 8);
    const s = await prisma.store.create({ data: { name: "S", slug: `s-${sfx}` } });
    created.push(s.id);
    const u = await prisma.storeUser.create({ data: { storeId: s.id, email: `o-${sfx}@e.test`, passwordHash: "h", status: "ACTIVE", role: "OWNER" } });
    const sess = await prisma.storeUserSession.create({
      data: { storeId: s.id, storeUserId: u.id, tokenHash: `t-${sfx}`, expiresAt: new Date(Date.now() + 3600_000) },
    });
    expect(sess.storeId).toBe(s.id);
    expect(sess.revokedAt).toBeNull();
    const revoked = await prisma.storeUserSession.update({ where: { id: sess.id }, data: { revokedAt: new Date() } });
    expect(revoked.revokedAt).not.toBeNull();
  });

  it("legacy StoreUser membership (linkedPlatformUserId set, no credential) still valid", async () => {
    const sfx = randomUUID().slice(0, 8);
    const s = await prisma.store.create({ data: { name: "L", slug: `l-${sfx}` } });
    created.push(s.id);
    const pu = await prisma.platformUser.create({ data: { email: `p-${sfx}@e.test`, passwordHash: "h", role: "SUPPORT_ADMIN" } });
    const su = await prisma.storeUser.create({ data: { storeId: s.id, linkedPlatformUserId: pu.id, role: "OWNER", acceptedAt: new Date() } });
    expect(su.linkedPlatformUserId).toBe(pu.id);
    expect(su.passwordHash).toBeNull();
    await prisma.platformUser.delete({ where: { id: pu.id } }); // onDelete SetNull
    const after = await prisma.storeUser.findUnique({ where: { id: su.id } });
    expect(after?.linkedPlatformUserId).toBeNull();
  });
});
