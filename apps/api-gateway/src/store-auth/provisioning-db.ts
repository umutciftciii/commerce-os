/**
 * Store-admin OWNER provisioning (Faz D) — DB I/O katmanı (collect + apply).
 *
 * SAF planlama `provisioning.ts`'tedir; bu modül yalnız Prisma okuma/yazma yapar. passwordHash
 * DEĞERİ yalnız reuse yazarken (StoreUser'a kopyalarken) dokunulur; ASLA loglanmaz/raporlanmaz.
 * Yazmalar tek transaction'da ve idempotenttir (aynı manifest → tekrar çalıştırma güvenli).
 */
import type { PrismaClient } from "@prisma/client";
import {
  normalizeEmail,
  type OwnerManifestEntry,
  type ProvisioningInput,
  type ProvisioningReport,
} from "./provisioning.js";

type PrismaLike = Pick<PrismaClient, "store" | "storeUser" | "platformUser" | "$transaction">;

/** Manifest + DB'den SAF planlayıcı girdisini toplar. */
export async function collectProvisioningInput(
  prisma: PrismaLike,
  manifest: OwnerManifestEntry[],
): Promise<ProvisioningInput> {
  const stores = await prisma.store.findMany({ select: { id: true, slug: true, status: true } });

  const emails = Array.from(new Set(manifest.map((m) => normalizeEmail(m.ownerEmail))));
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const storeBySlug = new Map(stores.map((s) => [s.slug, s]));
  const mappedStoreIds = Array.from(
    new Set(
      manifest
        .map((m) => (m.storeId ? storeById.get(m.storeId)?.id : storeBySlug.get(m.storeSlug ?? "")?.id))
        .filter((id): id is string => !!id),
    ),
  );

  const wantPairs = new Set<string>();
  for (const m of manifest) {
    const store = m.storeId ? storeById.get(m.storeId) : storeBySlug.get(m.storeSlug ?? "");
    if (store) wantPairs.add(`${store.id}::${normalizeEmail(m.ownerEmail)}`);
  }

  const storeUserRows =
    mappedStoreIds.length && emails.length
      ? await prisma.storeUser.findMany({
          where: { storeId: { in: mappedStoreIds }, email: { in: emails } },
          select: {
            id: true,
            storeId: true,
            email: true,
            role: true,
            status: true,
            passwordHash: true,
            linkedPlatformUserId: true,
          },
        })
      : [];

  const existingStoreUsers = storeUserRows
    .filter((u) => u.email != null && wantPairs.has(`${u.storeId}::${normalizeEmail(u.email)}`))
    .map((u) => ({
      id: u.id,
      storeId: u.storeId,
      email: normalizeEmail(u.email as string),
      role: u.role,
      status: u.status,
      hasPasswordHash: !!u.passwordHash,
      linkedPlatformUserId: u.linkedPlatformUserId,
    }));

  const platformRows = emails.length
    ? await prisma.platformUser.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true, name: true, passwordHash: true },
      })
    : [];
  const platformUsers = platformRows.map((p) => ({
    id: p.id,
    email: normalizeEmail(p.email),
    name: p.name,
    hasPasswordHash: !!p.passwordHash,
  }));

  return { manifest, stores, existingStoreUsers, platformUsers };
}

export interface ApplyResult {
  created: number;
  converged: number;
  noop: number;
  skipped: number;
}

/**
 * Planı DB'ye uygular (yalnız `report.applicable` true iken çağrılmalı). passwordHash reuse
 * için PlatformUser.passwordHash burada okunur ve StoreUser'a kopyalanır. Tek transaction.
 */
export async function applyProvisioning(
  prisma: PrismaLike,
  report: ProvisioningReport,
): Promise<ApplyResult> {
  if (!report.applicable) {
    throw new Error("applyProvisioning: report applicable değil — apply reddedildi (fail-closed).");
  }

  // Reuse edilecek passwordHash'leri toplu getir (yalnız gerçekten reuse edilecek platformUserId'ler).
  const reuseIds = Array.from(
    new Set(
      report.decisions
        .filter((d) => d.credential === "PLATFORM_HASH_REUSE" && d.linkedPlatformUserId)
        .map((d) => d.linkedPlatformUserId as string),
    ),
  );
  const hashRows = reuseIds.length
    ? await prisma.platformUser.findMany({
        where: { id: { in: reuseIds } },
        select: { id: true, name: true, passwordHash: true },
      })
    : [];
  const platformById = new Map(hashRows.map((p) => [p.id, p]));

  const result: ApplyResult = { created: 0, converged: 0, noop: 0, skipped: 0 };

  await prisma.$transaction(async (tx) => {
    for (const d of report.decisions) {
      if (d.outcome === "SKIP_STORE_NOT_ACTIVE") {
        result.skipped += 1;
        continue;
      }
      if (d.outcome === "NOOP_LOGIN_READY") {
        result.noop += 1;
        continue;
      }
      const reusePlatform =
        d.credential === "PLATFORM_HASH_REUSE" && d.linkedPlatformUserId
          ? platformById.get(d.linkedPlatformUserId)
          : undefined;

      if (d.existingStoreUserId) {
        await tx.storeUser.update({
          where: { id: d.existingStoreUserId },
          data: {
            role: d.targetRole,
            status: d.targetStatus,
            ...(reusePlatform
              ? { passwordHash: reusePlatform.passwordHash, linkedPlatformUserId: reusePlatform.id }
              : {}),
          },
        });
        result.converged += 1;
      } else {
        await tx.storeUser.create({
          data: {
            storeId: d.storeId!,
            email: d.ownerEmail,
            name: reusePlatform?.name ?? null,
            role: d.targetRole,
            status: d.targetStatus,
            passwordHash: reusePlatform?.passwordHash ?? null,
            linkedPlatformUserId: reusePlatform?.id ?? null,
          },
        });
        result.created += 1;
      }
    }
  });

  return result;
}
