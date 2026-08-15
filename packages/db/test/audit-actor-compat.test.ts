import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/index.js";

const hasTestDb = Boolean(process.env.DATABASE_URL);
const createdStores: string[] = [];
const createdPlatformUsers: string[] = [];

describe.skipIf(!hasTestDb)("AuditLog dual-actor compatibility", () => {
  afterEach(async () => {
    for (const id of createdStores.splice(0)) await prisma.store.delete({ where: { id } }).catch(() => {});
    for (const id of createdPlatformUsers.splice(0)) await prisma.platformUser.delete({ where: { id } }).catch(() => {});
  });

  it("legacy platform-actor row (actorKind null) and new store-user actor row coexist", async () => {
    const sfx = randomUUID().slice(0, 8);
    const store = await prisma.store.create({ data: { name: "AUD", slug: `aud-${sfx}` } });
    createdStores.push(store.id);
    const pu = await prisma.platformUser.create({ data: { email: `pu-${sfx}@e.test`, passwordHash: "h", role: "SUPPORT_ADMIN" } });
    createdPlatformUsers.push(pu.id);
    const su = await prisma.storeUser.create({ data: { storeId: store.id, email: `su-${sfx}@e.test`, passwordHash: "h", status: "ACTIVE", role: "OWNER" } });

    // 1) legacy row
    const legacy = await prisma.auditLog.create({
      data: { storeId: store.id, platformUserId: pu.id, action: "LOGIN", entityType: "PlatformSession", entityId: "sess-1" },
    });
    expect(legacy.platformUserId).toBe(pu.id);
    expect(legacy.actorKind).toBeNull();
    expect(legacy.actorStoreUserId).toBeNull();

    // 2) new store-user row
    const modern = await prisma.auditLog.create({
      data: {
        storeId: store.id,
        actorKind: "STORE_USER",
        actorStoreUserId: su.id,
        actorName: "Owner Name",
        actorEmail: `su-${sfx}@e.test`,
        action: "LOGIN",
        entityType: "StoreUserSession",
        entityId: "sess-2",
      },
    });
    expect(modern.actorKind).toBe("STORE_USER");
    expect(modern.actorStoreUserId).toBe(su.id);
    expect(modern.platformUserId).toBeNull();
    expect(modern.actorName).toBe("Owner Name");

    // 3) coexist
    const rows = await prisma.auditLog.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.actorKind)).toEqual([null, "STORE_USER"]);
  });
});
