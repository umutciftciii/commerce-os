// TODO-163 (ADR-208…ADR-210 · Faz 2 ADR-211/212) — Tenant Module & Capability veri katmanı.
//
// Persistence, gateway'in AppDataAccess soyutlaması üzerinden ENJEKTE edilir (raw Prisma
// DEĞİL) → in-memory test harness'i (MemoryDataAccess) ile birebir çalışır; tenant-izole.
// StoreModule satırları SPARSE (INHERIT → satır SİLİNİR). Plan default'u aktif aboneliğin
// Plan.metadata'sından türetilir. Effective durum SAF resolver ile hesaplanır.
//
// Faz 2: parent-disable guard — bir parent modülü DISABLE ederken aktif (effective açık)
// dependent varsa REDDEDİLİR (sessiz cascade YOK); explicit `cascade` ile onaylanır.
// Effective capability YALNIZ sunucuda türetilir; istemci gönderemez.
import {
  STORE_MODULE_REGISTRY,
  getStoreModuleDefinition,
  isStoreModuleKey,
  type StoreModuleKey,
} from "./registry.js";
import {
  extractPlanModuleDefaults,
  resolveEffectiveModules,
  type EffectiveModule,
  type ModuleOverrideState,
} from "./resolver.js";

/** Gateway AppDataAccess'in bu domain için sağladığı dar persistence yüzeyi. */
export interface StoreModulePersistence {
  listStoreModuleOverrides(
    storeId: string,
  ): Promise<Array<{ moduleKey: string; state: ModuleOverrideState | string }>>;
  getActivePlanMetadata(storeId: string): Promise<unknown>;
  upsertStoreModuleOverride(
    storeId: string,
    moduleKey: string,
    state: ModuleOverrideState,
    source: string | null,
  ): Promise<void>;
  deleteStoreModuleOverride(storeId: string, moduleKey: string): Promise<void>;
}

export interface EffectiveStoreModule extends EffectiveModule {
  group: string;
  labelTr: string;
  labelEn: string;
  descriptionTr: string;
  core: boolean;
}

export type SetOverrideResult =
  | { ok: true }
  | { ok: false; reason: "CORE_IMMUTABLE" | "UNKNOWN_MODULE" }
  | { ok: false; reason: "DEPENDENTS_ACTIVE"; dependents: StoreModuleKey[] };

export interface StoreModuleData {
  resolveEffective(storeId: string): Promise<EffectiveStoreModule[]>;
  isEnabled(storeId: string, moduleKey: string): Promise<boolean>;
  /** Bir modülü DISABLE etmenin kapatacağı aktif (effective açık) dependent'lar. */
  previewDisable(storeId: string, moduleKey: string): Promise<StoreModuleKey[]>;
  setOverride(
    storeId: string,
    moduleKey: string,
    state: ModuleOverrideState,
    source: string | null,
    opts?: { cascade?: boolean },
  ): Promise<SetOverrideResult>;
}

function decorate(effective: Map<StoreModuleKey, EffectiveModule>): EffectiveStoreModule[] {
  return STORE_MODULE_REGISTRY.map((def) => {
    const e = effective.get(def.key)!;
    return {
      ...e,
      group: def.group,
      labelTr: def.labelTr,
      labelEn: def.labelEn,
      descriptionTr: def.descriptionTr,
      core: def.core,
    };
  });
}

/** Bir modülü DISABLE ederse effective açık→kapalı olacak (kendisi hariç) modüller. */
function activeDependents(
  overrides: Record<string, ModuleOverrideState>,
  planDefaults: Record<string, boolean>,
  moduleKey: StoreModuleKey,
): StoreModuleKey[] {
  const current = resolveEffectiveModules({ overrides, planDefaults });
  const simulated = resolveEffectiveModules({
    overrides: { ...overrides, [moduleKey]: "DISABLED" },
    planDefaults,
  });
  const out: StoreModuleKey[] = [];
  for (const [key, eff] of current) {
    if (key === moduleKey) continue;
    if (eff.enabled && simulated.get(key)?.enabled === false) out.push(key);
  }
  return out;
}

export function createStoreModuleData(persistence: StoreModulePersistence): StoreModuleData {
  async function loadInputs(storeId: string): Promise<{
    overrides: Record<string, ModuleOverrideState>;
    planDefaults: Record<string, boolean>;
  }> {
    const [rows, planMetadata] = await Promise.all([
      persistence.listStoreModuleOverrides(storeId),
      persistence.getActivePlanMetadata(storeId),
    ]);
    const overrides: Record<string, ModuleOverrideState> = {};
    for (const row of rows) {
      if (isStoreModuleKey(row.moduleKey)) {
        overrides[row.moduleKey] = row.state as ModuleOverrideState;
      }
    }
    return { overrides, planDefaults: extractPlanModuleDefaults(planMetadata) };
  }

  async function resolveEffective(storeId: string): Promise<EffectiveStoreModule[]> {
    const { overrides, planDefaults } = await loadInputs(storeId);
    return decorate(resolveEffectiveModules({ overrides, planDefaults }));
  }

  async function isEnabled(storeId: string, moduleKey: string): Promise<boolean> {
    if (!isStoreModuleKey(moduleKey)) return false; // fail-closed
    const { overrides, planDefaults } = await loadInputs(storeId);
    return resolveEffectiveModules({ overrides, planDefaults }).get(moduleKey)?.enabled === true;
  }

  async function previewDisable(storeId: string, moduleKey: string): Promise<StoreModuleKey[]> {
    if (!isStoreModuleKey(moduleKey)) return [];
    const { overrides, planDefaults } = await loadInputs(storeId);
    return activeDependents(overrides, planDefaults, moduleKey);
  }

  async function setOverride(
    storeId: string,
    moduleKey: string,
    state: ModuleOverrideState,
    source: string | null,
    opts?: { cascade?: boolean },
  ): Promise<SetOverrideResult> {
    if (!isStoreModuleKey(moduleKey)) return { ok: false, reason: "UNKNOWN_MODULE" };
    const def = getStoreModuleDefinition(moduleKey as StoreModuleKey);
    if (def.core) return { ok: false, reason: "CORE_IMMUTABLE" };

    if (state === "INHERIT") {
      await persistence.deleteStoreModuleOverride(storeId, moduleKey);
      return { ok: true };
    }

    // Parent-disable guard: aktif dependent varsa reddet (cascade onayı yoksa). Sessiz cascade yok.
    if (state === "DISABLED" && !opts?.cascade) {
      const { overrides, planDefaults } = await loadInputs(storeId);
      const dependents = activeDependents(overrides, planDefaults, def.key);
      if (dependents.length > 0) {
        return { ok: false, reason: "DEPENDENTS_ACTIVE", dependents };
      }
    }

    await persistence.upsertStoreModuleOverride(storeId, moduleKey, state, source);
    return { ok: true };
  }

  return { resolveEffective, isEnabled, previewDisable, setOverride };
}
