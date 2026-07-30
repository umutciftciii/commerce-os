// TODO-163 (ADR-208/ADR-210) — Effective module resolution (SAF; yan etkisiz).
//
// Bir magazanin effective modul durumunu SADECE su girdilerden turetir:
//   1) STORE_MODULE_REGISTRY (WHAT-var + core + baseline default + dependency)
//   2) plan defaults      (Plan.metadata.modules: key -> boolean)
//   3) store overrides    (StoreModule satirlari: key -> INHERIT|ENABLED|DISABLED)
//
// Oncelik (core olmayan modul icin): store override > plan default > registry baseline.
// Sonra DEPENDENCY pass: bir modulun ENABLED olmasi icin gereken (requires) modullerden
// biri effective KAPALIysa, o modul de KAPATILIR (source="dependency"). Fixpoint'e kadar
// tekrarlanir (bounded; modul sayisi kadar).
//
// SAF: DB/IO yok, Date.now/random yok. Bilinmeyen key'ler yok sayilir (registry otorite).
// Effective capability YALNIZ sunucuda bu fonksiyonla turetilir; istemci gonderemez.

import {
  STORE_MODULE_REGISTRY,
  getStoreModuleDefinition,
  isStoreModuleKey,
  listStoreModuleKeys,
  type StoreModuleKey,
} from "./registry.js";

export type ModuleOverrideState = "INHERIT" | "ENABLED" | "DISABLED";

export type EffectiveModuleSource =
  | "core" // core modul; her zaman acik
  | "override" // magaza acik override'i (ENABLED/DISABLED)
  | "plan" // plan default'u
  | "baseline" // registry baseline default'u
  | "dependency"; // gereken bir modul kapali oldugundan zorla kapatildi

export interface EffectiveModule {
  key: StoreModuleKey;
  enabled: boolean;
  source: EffectiveModuleSource;
  /** Magaza icin cozulen ACIK override durumu (satir yoksa INHERIT). */
  overrideState: ModuleOverrideState;
  /** Bagimlilik nedeniyle kapatildiysa, hangi gereken modul kapaliydi. */
  blockedBy?: StoreModuleKey;
}

export interface ResolveEffectiveModulesInput {
  /** StoreModule satirlarindan: moduleKey -> state. Bilinmeyen key'ler yok sayilir. */
  overrides?: Record<string, ModuleOverrideState | string | null | undefined>;
  /** Plan.metadata.modules'tan: moduleKey -> enabled. Bilinmeyen key'ler yok sayilir. */
  planDefaults?: Record<string, boolean | null | undefined>;
}

function normalizeOverride(value: unknown): ModuleOverrideState {
  if (value === "ENABLED" || value === "DISABLED" || value === "INHERIT") {
    return value;
  }
  return "INHERIT";
}

/**
 * Effective modul haritasini dondurur (registry sirasinda; her modul icin bir kayit).
 */
export function resolveEffectiveModules(
  input: ResolveEffectiveModulesInput = {},
): Map<StoreModuleKey, EffectiveModule> {
  const overrides = input.overrides ?? {};
  const planDefaults = input.planDefaults ?? {};

  const result = new Map<StoreModuleKey, EffectiveModule>();

  // 1. Pass — override > plan > baseline (dependency henuz uygulanmadi).
  for (const def of STORE_MODULE_REGISTRY) {
    if (def.core) {
      result.set(def.key, {
        key: def.key,
        enabled: true,
        source: "core",
        overrideState: "ENABLED",
      });
      continue;
    }

    const overrideState = normalizeOverride(overrides[def.key]);
    if (overrideState === "ENABLED" || overrideState === "DISABLED") {
      result.set(def.key, {
        key: def.key,
        enabled: overrideState === "ENABLED",
        source: "override",
        overrideState,
      });
      continue;
    }

    // INHERIT → plan default varsa onu, yoksa registry baseline'i.
    const planValue = planDefaults[def.key];
    if (planValue === true || planValue === false) {
      result.set(def.key, {
        key: def.key,
        enabled: planValue,
        source: "plan",
        overrideState,
      });
      continue;
    }

    result.set(def.key, {
      key: def.key,
      enabled: def.baselineEnabled,
      source: "baseline",
      overrideState,
    });
  }

  // 2. Pass — dependency: gereken modul kapaliysa bu modul de kapanir (fixpoint).
  const maxIterations = STORE_MODULE_REGISTRY.length + 1;
  for (let i = 0; i < maxIterations; i += 1) {
    let changed = false;
    for (const def of STORE_MODULE_REGISTRY) {
      if (def.core || !def.requires || def.requires.length === 0) continue;
      const current = result.get(def.key);
      if (!current || !current.enabled) continue;
      for (const req of def.requires) {
        const dep = result.get(req);
        if (dep && !dep.enabled) {
          result.set(def.key, {
            ...current,
            enabled: false,
            source: "dependency",
            blockedBy: req,
          });
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }

  return result;
}

/**
 * Tek bir modul icin effective enabled degeri. Bilinmeyen/registry-disi key → false
 * (fail-closed: tanimsiz capability asla acik sayilmaz).
 */
export function isModuleEnabled(
  key: string,
  input: ResolveEffectiveModulesInput = {},
): boolean {
  if (!isStoreModuleKey(key)) return false;
  const effective = resolveEffectiveModules(input);
  return effective.get(key)?.enabled === true;
}

/**
 * Plan.metadata (bilinmeyen sekil) → guvenli planDefaults haritasi. Yalniz registry
 * anahtarlari + boolean degerler alinir; digeri yok sayilir.
 */
export function extractPlanModuleDefaults(
  planMetadata: unknown,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!planMetadata || typeof planMetadata !== "object") return out;
  const modules = (planMetadata as { modules?: unknown }).modules;
  if (!modules || typeof modules !== "object") return out;
  for (const key of listStoreModuleKeys()) {
    const value = (modules as Record<string, unknown>)[key];
    if (value === true || value === false) {
      // core moduller plan ile kapatilamaz; resolver zaten yok sayar ama burada da eleyelim.
      if (!getStoreModuleDefinition(key).core) {
        out[key] = value;
      }
    }
  }
  return out;
}
