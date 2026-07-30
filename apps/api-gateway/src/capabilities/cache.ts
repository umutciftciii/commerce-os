// TODO-163 Faz 2 (ADR-213) — Store-scoped capability cache (public hot-path + enforcement).
//
// Amaç: her istekte capability DB sorgusu (N+1) YAPMAMAK. Process-yerel, store-scoped,
// bounded TTL cache. Kurallar (prompt §4):
//   * key storeId-scoped → başka store capability'si DÖNMEZ (cross-tenant leak yok).
//   * bounded TTL → bayatlık sınırlı; module mutation sonrası EXPLICIT invalidation.
//   * DB erişimi başarısızsa güvenli FAIL-CLOSED: non-core modüller KAPALI sayılır, ama
//     CORE modüller yanlışlıkla kapanmaz (registry'den core=açık). Hata sonucu CACHE'LENMEZ.
//   * Effective capability YALNIZ sunucuda; istemci gönderemez.
import { STORE_MODULE_REGISTRY, isStoreModuleKey, type StoreModuleKey } from "./registry.js";
import type { EffectiveStoreModule, StoreModuleData } from "./data.js";

export interface CapabilityCache {
  /** Store için effective modül listesi (cache'li). Hata → fail-closed liste (cache'lenmez). */
  getEffective(storeId: string): Promise<EffectiveStoreModule[]>;
  /** Tek modül effective açık mı (hot-path). Bilinmeyen key → false. */
  isEnabled(storeId: string, moduleKey: string): Promise<boolean>;
  /** Bir store'un cache'ini geçersiz kıl (module mutation / plan değişimi sonrası). */
  invalidate(storeId: string): void;
  /** Tüm cache'i temizle (test/registry sürüm değişimi). */
  clear(): void;
}

interface Entry {
  value: EffectiveStoreModule[];
  expiresAt: number;
}

/** Hata durumunda fail-closed effective: core=açık, non-core=kapalı. Cache'lenmez. */
function failClosedEffective(): EffectiveStoreModule[] {
  return STORE_MODULE_REGISTRY.map((def) => ({
    key: def.key,
    enabled: def.core, // core → true, diğer → false (fail-closed)
    source: def.core ? "core" : "baseline",
    overrideState: def.core ? "ENABLED" : "INHERIT",
    group: def.group,
    labelTr: def.labelTr,
    labelEn: def.labelEn,
    descriptionTr: def.descriptionTr,
    core: def.core,
  }));
}

export interface CapabilityCacheOptions {
  /** TTL (ms). Bounded; monotonik saat `now()` enjekte edilir (test determinizmi). */
  ttlMs: number;
  /** Şu anki zaman (ms). Test için enjekte edilebilir; varsayılan Date.now. */
  now?: () => number;
  logger?: { warn: (m: string, meta?: Record<string, unknown>) => void };
}

export function createCapabilityCache(
  data: StoreModuleData,
  options: CapabilityCacheOptions,
): CapabilityCache {
  const ttlMs = Math.max(0, options.ttlMs);
  const now = options.now ?? (() => Date.now());
  const store = new Map<string, Entry>();

  async function getEffective(storeId: string): Promise<EffectiveStoreModule[]> {
    const cached = store.get(storeId);
    const ts = now();
    if (cached && cached.expiresAt > ts) return cached.value;
    try {
      const value = await data.resolveEffective(storeId);
      store.set(storeId, { value, expiresAt: ts + ttlMs });
      return value;
    } catch (error) {
      // Fail-closed: non-core kapalı, core açık. HATAYI CACHE'LEME (bir sonraki istek yeniden dener).
      options.logger?.warn("capability-cache resolve failed (fail-closed)", {
        storeId,
        error: error instanceof Error ? error.message : String(error),
      });
      store.delete(storeId);
      return failClosedEffective();
    }
  }

  async function isEnabled(storeId: string, moduleKey: string): Promise<boolean> {
    if (!isStoreModuleKey(moduleKey)) return false; // fail-closed
    const list = await getEffective(storeId);
    return list.find((m) => m.key === (moduleKey as StoreModuleKey))?.enabled === true;
  }

  function invalidate(storeId: string): void {
    store.delete(storeId);
  }

  function clear(): void {
    store.clear();
  }

  return { getEffective, isEnabled, invalidate, clear };
}
