// TODO-163 Faz 3 (TD-154 · ADR-215) — Plan → Capability editörü SAF çekirdeği (yan etkisiz).
//
// Platform-admin bir PLANIN opsiyonel modül DEFAULT'larını yönetir. Editör 3 durum sunar (bounded;
// arbitrary JSON DEĞİL):
//   * required     → plan default AÇIK  (metadata.modules[key] = true)
//   * optional     → plan zorlamaz; registry baseline geçerli (key metadata'dan ÇIKARILIR = ON)
//   * unavailable  → plan default KAPALI (metadata.modules[key] = false)
//
// Resolver YALNIZ boolean plan default'u anlar (resolver.ts). Bu modül, editör durumlarını o
// boolean sözleşmesine SAF olarak çevirir + doğrular. Effective ÇÖZÜM SIRASI KORUNUR:
//   store override > plan default > registry baseline > dependency pass  (resolver'da).
//
// Güvenlik (ADR-215):
//   * CORE modül plan ile KAPATILAMAZ → `unavailable`/`required-off` reddedilir (CORE_UNAVAILABLE).
//   * Bilinmeyen anahtar reddedilir (UNKNOWN_MODULE) — allowlist registry.
//   * Geçersiz bağımlılık reddedilir (INVALID_DEPENDENCY): bir modül `required` iken gerektirdiği
//     modül `unavailable` yapılamaz (aksi halde asla etkin olamaz → plan payload dependency bypass edemez).
//   * Plan default'u yazmak StoreModule override'larına DOKUNMAZ → mevcut mağaza override'ları
//     sessizce EZİLMEZ (resolver'da override her zaman plan'ı yener). Veri SİLİNMEZ (yalnız JSON default).
import {
  STORE_MODULE_REGISTRY,
  getStoreModuleDefinition,
  isStoreModuleKey,
  listStoreModuleKeys,
  type StoreModuleKey,
} from "./registry.js";
import { extractPlanModuleDefaults, resolveEffectiveModules } from "./resolver.js";

export type PlanCapabilityStatus = "required" | "optional" | "unavailable";

export interface PlanCapabilityMatrixEntry {
  key: StoreModuleKey;
  group: string;
  labelTr: string;
  labelEn: string;
  descriptionTr: string;
  core: boolean;
  requires: StoreModuleKey[];
  /** Mevcut plan metadata'sından türetilen durum. */
  status: PlanCapabilityStatus;
  /** Plan-default (mağaza override YOKKEN) dependency pass sonrası effective açık mı. */
  effectivePlanEnabled: boolean;
  /** Dependency nedeniyle kapandıysa hangi gereken modül. */
  blockedBy: StoreModuleKey | null;
}

export type PlanCapabilityValidationError =
  | { code: "UNKNOWN_MODULE"; key: string }
  | { code: "CORE_UNAVAILABLE"; key: string }
  | { code: "INVALID_DEPENDENCY"; key: StoreModuleKey; requires: StoreModuleKey };

/** metadata.modules[key] boolean → editör durumu. Yoksa `optional` (baseline). */
export function statusFromPlanDefault(value: boolean | undefined): PlanCapabilityStatus {
  if (value === true) return "required";
  if (value === false) return "unavailable";
  return "optional";
}

/** Editör durumu → plan default boolean (optional → undefined = metadata'dan çıkar). */
export function planDefaultFromStatus(status: PlanCapabilityStatus): boolean | undefined {
  if (status === "required") return true;
  if (status === "unavailable") return false;
  return undefined;
}

/** Mevcut plan metadata'sından tam capability matrisi (registry sırasında). */
export function derivePlanCapabilityMatrix(planMetadata: unknown): PlanCapabilityMatrixEntry[] {
  const planDefaults = extractPlanModuleDefaults(planMetadata);
  const effective = resolveEffectiveModules({ planDefaults });
  return STORE_MODULE_REGISTRY.map((def) => {
    const eff = effective.get(def.key)!;
    const status: PlanCapabilityStatus = def.core
      ? "required"
      : statusFromPlanDefault(planDefaults[def.key]);
    return {
      key: def.key,
      group: def.group,
      labelTr: def.labelTr,
      labelEn: def.labelEn,
      descriptionTr: def.descriptionTr,
      core: def.core,
      requires: [...(def.requires ?? [])],
      status,
      effectivePlanEnabled: eff.enabled,
      blockedBy: eff.blockedBy ?? null,
    };
  });
}

export interface BuildPlanModulesResult {
  ok: boolean;
  /** Doğrulama geçtiyse: metadata.modules'e yazılacak boolean harita (yalnız non-core; optional atlanır). */
  modules: Record<string, boolean>;
  errors: PlanCapabilityValidationError[];
}

/**
 * Editör durum haritasını doğrular ve metadata.modules boolean haritasına çevirir. SAF; DB yok.
 * Bilinmeyen/gövde-dışı anahtarlar reddedilir. CORE `unavailable` reddedilir. `required` bir modülün
 * gerektirdiği modül `unavailable` ise reddedilir (dependency bypass yok).
 */
export function buildPlanModulesFromStatuses(
  statuses: Record<string, PlanCapabilityStatus>,
): BuildPlanModulesResult {
  const errors: PlanCapabilityValidationError[] = [];
  const normalized = new Map<StoreModuleKey, PlanCapabilityStatus>();

  for (const [key, status] of Object.entries(statuses)) {
    if (!isStoreModuleKey(key)) {
      errors.push({ code: "UNKNOWN_MODULE", key });
      continue;
    }
    const def = getStoreModuleDefinition(key);
    if (def.core) {
      // Core plan ile kapatılamaz; yalnız `required`/`optional` anlamlı (ikisi de ON). `unavailable` → reddet.
      if (status === "unavailable") {
        errors.push({ code: "CORE_UNAVAILABLE", key });
      }
      continue; // core hiçbir zaman metadata.modules'e yazılmaz
    }
    normalized.set(key, status);
  }

  // Dependency doğrulaması: `required` bir modülün gerektirdiği modül `unavailable` olamaz.
  for (const [key, status] of normalized) {
    if (status !== "required") continue;
    const def = getStoreModuleDefinition(key);
    for (const req of def.requires ?? []) {
      if (normalized.get(req) === "unavailable") {
        errors.push({ code: "INVALID_DEPENDENCY", key, requires: req });
      }
    }
  }

  const modules: Record<string, boolean> = {};
  if (errors.length === 0) {
    for (const [key, status] of normalized) {
      const value = planDefaultFromStatus(status);
      if (value !== undefined) modules[key] = value;
    }
  }
  return { ok: errors.length === 0, modules, errors };
}

export interface PlanCapabilityPreviewEntry {
  key: StoreModuleKey;
  proposedStatus: PlanCapabilityStatus;
  /** Plan-default (mağaza override YOKKEN) dependency pass sonrası effective açık mı. */
  effectivePlanEnabled: boolean;
  blockedBy: StoreModuleKey | null;
  /** Bu modülün plan-default'u mevcut plana göre DEĞİŞİYOR mu. */
  changed: boolean;
}

export interface PlanCapabilityPreview {
  ok: boolean;
  errors: PlanCapabilityValidationError[];
  entries: PlanCapabilityPreviewEntry[];
  /** Plan-default'u değişen (non-core) modül anahtarları. */
  changedModules: StoreModuleKey[];
  /** Yalnız dependency nedeniyle kapanan modüller (plan `unavailable` yapmadı ama gereken kapalı). */
  dependencyDisabled: StoreModuleKey[];
}

/**
 * Önerilen durum haritasının etkisini ÖZETLER (uygulamadan). Doğrulama + dependency pass + mevcut
 * plana göre değişen modüller. `apply` bunu yazmadan önce operatöre gösterilir.
 */
export function previewPlanCapabilities(
  currentMetadata: unknown,
  proposed: Record<string, PlanCapabilityStatus>,
): PlanCapabilityPreview {
  const built = buildPlanModulesFromStatuses(proposed);
  const currentDefaults = extractPlanModuleDefaults(currentMetadata);
  const proposedDefaults = built.ok ? built.modules : currentDefaults;
  const effective = resolveEffectiveModules({ planDefaults: proposedDefaults });

  const entries: PlanCapabilityPreviewEntry[] = [];
  const changedModules: StoreModuleKey[] = [];
  const dependencyDisabled: StoreModuleKey[] = [];

  for (const def of STORE_MODULE_REGISTRY) {
    if (def.core) continue;
    const eff = effective.get(def.key)!;
    const proposedStatus: PlanCapabilityStatus = statusFromPlanDefault(proposedDefaults[def.key]);
    const currentStatus: PlanCapabilityStatus = statusFromPlanDefault(currentDefaults[def.key]);
    const changed = built.ok && proposedStatus !== currentStatus;
    if (changed) changedModules.push(def.key);
    if (eff.source === "dependency") dependencyDisabled.push(def.key);
    entries.push({
      key: def.key,
      proposedStatus,
      effectivePlanEnabled: eff.enabled,
      blockedBy: eff.blockedBy ?? null,
      changed,
    });
  }

  return { ok: built.ok, errors: built.errors, entries, changedModules, dependencyDisabled };
}

/**
 * Plan.metadata'yı BİRLEŞTİREREK günceller: yalnız `modules` alt-anahtarını yeni boolean haritayla
 * değiştirir; diğer metadata anahtarları (fiyat vb.) KORUNUR (full-replace DEĞİL). Mağaza override'ına
 * dokunulmaz (ayrı tablo). Doğrulama başarısızsa `null` döner (yazma yapılmaz).
 */
export function mergePlanModulesIntoMetadata(
  currentMetadata: unknown,
  statuses: Record<string, PlanCapabilityStatus>,
): { metadata: Record<string, unknown>; modules: Record<string, boolean> } | { errors: PlanCapabilityValidationError[] } {
  const built = buildPlanModulesFromStatuses(statuses);
  if (!built.ok) return { errors: built.errors };
  const base =
    currentMetadata && typeof currentMetadata === "object" && !Array.isArray(currentMetadata)
      ? { ...(currentMetadata as Record<string, unknown>) }
      : {};
  base.modules = built.modules;
  return { metadata: base, modules: built.modules };
}

/** Tam registry anahtar listesi (UI'nin durum haritasını seed etmesi için). */
export function planCapabilityKeys(): StoreModuleKey[] {
  return listStoreModuleKeys();
}
