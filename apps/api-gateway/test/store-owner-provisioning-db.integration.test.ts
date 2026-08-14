/**
 * Faz D — OWNER provisioning executor (collect + apply) GERÇEK-DB entegrasyon testleri.
 * DATABASE_URL yoksa SKIP. İspatlanan: reuse (link + hash kopyala), idempotent apply,
 * INVITED (credentialless→login-ready DEĞİL), dry-run no-writes, applicable=false → apply reddi.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@commerce-os/db";
import { hashPassword } from "@commerce-os/auth";
import {
  parseOwnerManifest,
  planStoreOwnerProvisioning,
} from "../src/store-auth/provisioning.js";
import { collectProvisioningInput, applyProvisioning } from "../src/store-auth/provisioning-db.js";

const hasTestDb = Boolean(process.env.DATABASE_URL);
const createdStores: string[] = [];
const createdPlatformUsers: string[] = [];

type StoreRow = { id: string; slug: string; status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "CLOSED" };

async function makeStore(status: StoreRow["status"] = "ACTIVE"): Promise<StoreRow> {
  const sfx = randomUUID().slice(0, 12);
  const id = `sop-store-${sfx}`;
  const slug = `sop-${sfx}`;
  await prisma.store.create({ data: { id, name: `SOP ${sfx}`, slug, status } });
  createdStores.push(id);
  return { id, slug, status };
}

async function makePlatformUser(email: string) {
  const id = `sop-pu-${randomUUID().slice(0, 12)}`;
  const passwordHash = await hashPassword("owner-secret-123");
  await prisma.platformUser.create({
    data: { id, email, name: "Platform Owner", passwordHash, role: "SUPPORT_ADMIN" },
  });
  createdPlatformUsers.push(id);
  return { id, email, passwordHash };
}

// İZOLASYON: collectProvisioningInput TÜM mağazaları çeker; paylaşılan test DB'sinde
// unmapped-ACTIVE gürültüsü olur. Planlayıcının mağaza kümesini yalnız bu testin mağazalarıyla
// sınırlarız (existingStoreUsers/platformUsers zaten manifest'e scope'ludur → gürültüsüz).
async function run(manifestJson: unknown, scopeStores: StoreRow[]) {
  const manifest = parseOwnerManifest(manifestJson);
  const input = await collectProvisioningInput(prisma, manifest);
  const report = planStoreOwnerProvisioning({ ...input, stores: scopeStores });
  return { manifest, report };
}

describe.skipIf(!hasTestDb)("OWNER provisioning executor (integration)", () => {
  afterEach(async () => {
    // StoreUser'lar store cascade ile silinir; platform users ayrı.
    for (const id of createdStores.splice(0)) {
      await prisma.store.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdPlatformUsers.splice(0)) {
      await prisma.platformUser.delete({ where: { id } }).catch(() => {});
    }
  });

  it("APPLY: matching PlatformUser → login-ready OWNER (hash reuse + link + ACTIVE)", async () => {
    const s = await makeStore();
    const email = `owner-${randomUUID().slice(0, 8)}@e.test`;
    const pu = await makePlatformUser(email);
    const { report } = await run({ stores: [{ storeSlug: s.slug, ownerEmail: email }] }, [s]);
    expect(report.applicable).toBe(true);
    expect(report.summary.loginReadyOwners).toBe(1);

    const res = await applyProvisioning(prisma, report);
    expect(res.created).toBe(1);

    const su = await prisma.storeUser.findUnique({ where: { storeId_email: { storeId: s.id, email } } });
    expect(su?.role).toBe("OWNER");
    expect(su?.status).toBe("ACTIVE");
    expect(su?.passwordHash).toBe(pu.passwordHash); // reuse
    expect(su?.linkedPlatformUserId).toBe(pu.id); // gerçek eşleşmede link
  });

  it("APPLY idempotent: ikinci çalıştırma NOOP; ikinci StoreUser oluşmaz", async () => {
    const s = await makeStore();
    const email = `owner-${randomUUID().slice(0, 8)}@e.test`;
    await makePlatformUser(email);
    const first = await run({ stores: [{ storeSlug: s.slug, ownerEmail: email }] }, [s]);
    await applyProvisioning(prisma, first.report);

    const second = await run({ stores: [{ storeSlug: s.slug, ownerEmail: email }] }, [s]);
    expect(second.report.decisions[0]?.outcome).toBe("NOOP_LOGIN_READY");
    const res2 = await applyProvisioning(prisma, second.report);
    expect(res2).toEqual({ created: 0, converged: 0, noop: 1, skipped: 0 });

    const count = await prisma.storeUser.count({ where: { storeId: s.id, email } });
    expect(count).toBe(1);
  });

  it("APPLY: no matching PlatformUser → INVITED OWNER, credentialless (login-ready DEĞİL)", async () => {
    const s = await makeStore();
    const email = `nolink-${randomUUID().slice(0, 8)}@e.test`;
    const { report } = await run({ stores: [{ storeSlug: s.slug, ownerEmail: email }] }, [s]);
    expect(report.summary.invited).toBe(1);
    expect(report.summary.loginReadyOwners).toBe(0);
    await applyProvisioning(prisma, report);

    const su = await prisma.storeUser.findUnique({ where: { storeId_email: { storeId: s.id, email } } });
    expect(su?.role).toBe("OWNER");
    expect(su?.status).toBe("INVITED");
    expect(su?.passwordHash).toBeNull(); // ne default ne random ne plaintext
    expect(su?.linkedPlatformUserId).toBeNull();
  });

  it("CONVERGE: mevcut MANAGER → OWNER (idempotent update)", async () => {
    const s = await makeStore();
    const email = `mgr-${randomUUID().slice(0, 8)}@e.test`;
    const pu = await makePlatformUser(email);
    await prisma.storeUser.create({
      data: { storeId: s.id, email, name: "Mgr", role: "MANAGER", status: "ACTIVE", passwordHash: pu.passwordHash },
    });
    const { report } = await run({ stores: [{ storeSlug: s.slug, ownerEmail: email }] }, [s]);
    expect(report.decisions[0]?.outcome).toBe("CONVERGE_LOGIN_READY");
    const res = await applyProvisioning(prisma, report);
    expect(res.converged).toBe(1);
    const su = await prisma.storeUser.findUnique({ where: { storeId_email: { storeId: s.id, email } } });
    expect(su?.role).toBe("OWNER");
  });

  it("DRY-RUN (apply çağrılmaz) → hiçbir yazma yok", async () => {
    const s = await makeStore();
    const email = `dry-${randomUUID().slice(0, 8)}@e.test`;
    await makePlatformUser(email);
    const { report } = await run({ stores: [{ storeSlug: s.slug, ownerEmail: email }] }, [s]);
    expect(report.applicable).toBe(true);
    // apply YOK
    const count = await prisma.storeUser.count({ where: { storeId: s.id } });
    expect(count).toBe(0);
  });

  it("unmapped ACTIVE store → applicable=false → applyProvisioning fail-closed throw", async () => {
    const mapped = await makeStore();
    const unmapped = await makeStore(); // ikinci ACTIVE mağaza manifest'te YOK → unmapped
    const email = `owner-${randomUUID().slice(0, 8)}@e.test`;
    await makePlatformUser(email);
    const { report } = await run({ stores: [{ storeSlug: mapped.slug, ownerEmail: email }] }, [mapped, unmapped]);
    expect(report.applicable).toBe(false);
    await expect(applyProvisioning(prisma, report)).rejects.toThrow(/applicable/i);
  });
});
