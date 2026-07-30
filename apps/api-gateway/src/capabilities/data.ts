// TODO-163 (ADR-208…ADR-210) — Tenant Module & Capability veri erişim katmanı.
//
// Persistence, gateway'in AppDataAccess soyutlaması üzerinden ENJEKTE edilir (raw Prisma
// DEĞİL) → in-memory test harness'i (MemoryDataAccess) ile birebir çalışır; tenant-izole.
// StoreModule satırları SPARSE: yalnız açık override edilen modüller için satır bulunur
// (INHERIT set edilince satır SİLİNİR). Plan default'u aktif aboneliğin Plan.metadata'sından
// türetilir. Effective durum SAF resolver ile hesaplanır (bu katman yalnız girdileri toplar).
//
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
  /** Açık override satırları (moduleKey + state). Bilinmeyen key'ler çağıran tarafça elenir. */
  listStoreModuleOverrides(
    storeId: string,
  ): Promise<Array<{ moduleKey: string; state: ModuleOverrideState | string }>>;
  /** Aktif aboneliğin (ACTIVE/TRIALING) plan metadata'sı; yoksa null. */
  getActivePlanMetadata(storeId: string): Promise<unknown>;
  /** Override upsert (state ENABLED/DISABLED). */
  upsertStoreModuleOverride(
    storeId: string,
    moduleKey: string,
    state: ModuleOverrideState,
    source: string | null,
  ): Promise<void>;
  /** Override sil (INHERIT → sparse). */
  deleteStoreModuleOverride(storeId: string, moduleKey: string): Promise<void>;
}

export interface EffectiveStoreModule extends EffectiveModule {
  group: string;
  labelTr: string;
  labelEn: string;
  descriptionTr: string;
  core: boolean;
}

export interface StoreModuleData {
  resolveEffective(storeId: string): Promise<EffectiveStoreModule[]>;
  isEnabled(storeId: string, moduleKey: string): Promise<boolean>;
  setOverride(
    storeId: string,
    moduleKey: string,
    state: ModuleOverrideState,
    source: string | null,
  ): Promise<{ ok: true } | { ok: false; reason: "CORE_IMMUTABLE" | "UNKNOWN_MODULE" }>;
}

function toEffectiveList(
  overrides: Record<string, ModuleOverrideState>,
  planDefaults: Record<string, boolean>,
): EffectiveStoreModule[] {
  const effective = resolveEffectiveModules({ overrides, planDefaults });
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
    return toEffectiveList(overrides, planDefaults);
  }

  async function isEnabled(storeId: string, moduleKey: string): Promise<boolean> {
    if (!isStoreModuleKey(moduleKey)) return false; // fail-closed
    const list = await resolveEffective(storeId);
    return list.find((m) => m.key === moduleKey)?.enabled === true;
  }

  async function setOverride(
    storeId: string,
    moduleKey: string,
    state: ModuleOverrideState,
    source: string | null,
  ): Promise<{ ok: true } | { ok: false; reason: "CORE_IMMUTABLE" | "UNKNOWN_MODULE" }> {
    if (!isStoreModuleKey(moduleKey)) return { ok: false, reason: "UNKNOWN_MODULE" };
    const def = getStoreModuleDefinition(moduleKey as StoreModuleKey);
    if (def.core) return { ok: false, reason: "CORE_IMMUTABLE" };

    if (state === "INHERIT") {
      await persistence.deleteStoreModuleOverride(storeId, moduleKey);
      return { ok: true };
    }
    await persistence.upsertStoreModuleOverride(storeId, moduleKey, state, source);
    return { ok: true };
  }

  return { resolveEffective, isEnabled, setOverride };
}
