// TODO-163 Faz 3 (TD-153 · ADR-214) — Worker capability gate.
//
// Opsiyonel, store-scope'lu ZAMANLANMIŞ worker'lar (recommendation/recently-viewed/discovery
// retention, attribution retention, settlement scheduler, campaign reconcile) her store için
// capability kontrolü yapar: modül KAPALIysa o store için MUTATION YOK + `SKIPPED_DISABLED`
// (bounded QueueJobLog; hata SAYILMAZ; retry storm YOK; başka store batch'i DEVAM eder).
//
// CORE worker'lar (inventory reservation, payment/webhook, backup/restore, shipment sync, order
// integrity) capability ile ASLA kapatılmaz — bu gate onlara ENJEKTE EDİLMEZ.
//
// Reuse: gateway AppDataAccess ile AYNI prisma sorgularından (StoreModule + aktif Subscription.
// Plan.metadata) `StoreModulePersistence` kurar → `createStoreModuleData` → `createCapabilityCache`
// (store-scoped, bounded TTL, fail-closed: DB hatası → non-core kapalı/core açık, hata cache'lenmez;
// cross-store leak yok). TEK gate tüm worker'larda paylaşılır (tenant-safe; süreç-yerel).
//
// Worker YALNIZ OKUR — override yazma yolları bilinçli olarak devre dışı (asla çağrılmaz).
import type { PrismaClient } from "@prisma/client";
import { createStoreModuleData, type StoreModulePersistence } from "./data.js";
import { createCapabilityCache } from "./cache.js";

/** Worker gate'in ihtiyaç duyduğu dar prisma yüzeyi (StoreModule + Subscription okuma). */
export type WorkerCapabilityPrisma = Pick<PrismaClient, "storeModule" | "subscription">;

export interface WorkerCapabilityGate {
  /** Store için modül effective AÇIK mı? Bilinmeyen anahtar/DB hatası → fail-closed (false, non-core). */
  isEnabled(storeId: string, moduleKey: string): Promise<boolean>;
}

function createWorkerPersistence(prisma: WorkerCapabilityPrisma): StoreModulePersistence {
  return {
    listStoreModuleOverrides: (storeId) =>
      prisma.storeModule.findMany({ where: { storeId }, select: { moduleKey: true, state: true } }),
    getActivePlanMetadata: async (storeId) => {
      const subscription = await prisma.subscription.findFirst({
        where: { storeId, status: { in: ["ACTIVE", "TRIALING"] } },
        orderBy: [{ status: "asc" }, { startsAt: "desc" }],
        select: { plan: { select: { metadata: true } } },
      });
      return subscription?.plan?.metadata ?? null;
    },
    // Worker OKUMA-yalnız: override yazma yolları asla çağrılmaz (setOverride worker'da kullanılmaz).
    upsertStoreModuleOverride: async () => {
      throw new Error("worker capability gate is read-only");
    },
    deleteStoreModuleOverride: async () => {
      throw new Error("worker capability gate is read-only");
    },
  };
}

export interface WorkerCapabilityGateOptions {
  ttlMs?: number;
  logger?: { warn: (message: string, meta?: Record<string, unknown>) => void };
}

export function createWorkerCapabilityGate(
  prisma: WorkerCapabilityPrisma,
  options: WorkerCapabilityGateOptions = {},
): WorkerCapabilityGate {
  const data = createStoreModuleData(createWorkerPersistence(prisma));
  const cache = createCapabilityCache(data, {
    ttlMs: options.ttlMs ?? 30_000,
    logger: options.logger,
  });
  return { isEnabled: (storeId, moduleKey) => cache.isEnabled(storeId, moduleKey) };
}
