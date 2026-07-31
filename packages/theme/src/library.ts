/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Platform Theme Library — versioning & controlled rollout (TODO-164B Dilim 2)
 * ═══════════════════════════════════════════════════════════════════════════
 * ADR-238 (library store) · ADR-240 (version upgrade) · ADR-241 (controlled rollout).
 *
 * SAF yardımcılar: platform template'lerinin sistem mağazası kimliği, update-available
 * hesabı ve rollout planı tipleri. DOM/IO/DB yok.
 */

/** Platform tema template'lerini tutan sentetik mağaza işareti (Store.systemPurpose). */
export const THEME_LIBRARY_STORE_PURPOSE = "THEME_LIBRARY" as const;
/** Sistem mağazasının deterministik slug'ı (public yüzeylerden dışlanır). */
export const THEME_LIBRARY_STORE_SLUG = "__theme-library__" as const;
export const THEME_LIBRARY_STORE_NAME = "Platform Tema Kütüphanesi" as const;

/** Platform template status'leri (Theme.status süper-kümesi). */
export const THEME_LIBRARY_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
  "INCOMPATIBLE",
  "DISABLED",
] as const;
export type ThemeLibraryStatus = (typeof THEME_LIBRARY_STATUSES)[number];

/** PUBLISHED olmayan template mağazaya ATANAMAZ. */
export function isAssignableTemplateStatus(status: string): boolean {
  return status === "PUBLISHED";
}
/** ARCHIVED template yeni mağazaya atanamaz (mevcut mağaza rollback için kalabilir). */
export function isArchivedTemplateStatus(status: string): boolean {
  return status === "ARCHIVED";
}

/**
 * Bir mağaza teması, türetildiği platform template'inin yeni published sürümüne göre
 * güncel mi? updateAvailable = template published sürümü > mağazanın sourceThemeVersion'ı.
 * sourceThemeVersion null (bağımsız tema) ya da template published yok → false.
 */
export function computeUpdateAvailable(
  storeSourceVersion: number | null | undefined,
  templatePublishedVersion: number | null | undefined,
): boolean {
  if (storeSourceVersion == null || templatePublishedVersion == null) return false;
  return templatePublishedVersion > storeSourceVersion;
}

// ── Controlled rollout (ADR-241) ────────────────────────────────────────────
export const ROLLOUT_MODES = ["single", "selected", "pilot", "all-compatible"] as const;
export type RolloutMode = (typeof ROLLOUT_MODES)[number];

export type RolloutStoreStatus = "success" | "failed" | "skipped";

export interface RolloutStoreResult {
  storeId: string;
  storeName?: string;
  status: RolloutStoreStatus;
  /** Makine-okunur neden kodu (ör. THEME_INCOMPATIBLE, TEMPLATE_NOT_PUBLISHED). PII yok. */
  reasonCode?: string;
  /** Uygulanan yeni store theme revision numarası (success → dolu). */
  newVersion?: number;
}

export interface RolloutSummary {
  mode: RolloutMode;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: RolloutStoreResult[];
}

/**
 * Rollout sonuç listesinden özet üretir. Bir mağaza FAILED olduğunda diğerleri sessizce
 * başarılı SAYILMAZ — sayaçlar ayrı tutulur, failed>0 çağrı tarafına açıkça bildirilir.
 */
export function summarizeRollout(mode: RolloutMode, results: RolloutStoreResult[]): RolloutSummary {
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of results) {
    if (r.status === "success") succeeded += 1;
    else if (r.status === "failed") failed += 1;
    else skipped += 1;
  }
  return { mode, total: results.length, succeeded, failed, skipped, results };
}
