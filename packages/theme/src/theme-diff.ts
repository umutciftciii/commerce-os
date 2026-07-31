import { FIELD_LABELS } from "./field-labels.js";
import {
  CANONICAL_FIELD_PATHS,
  fieldPolicy,
  resolveFieldValue,
  type CanonicalFieldPath,
  type PolicyThemeState,
  type StoreOverridePolicy,
} from "./override-policy.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Theme Before/After Diff (TODO-164B Dilim 2 · ADR-242)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * İki tema durumu (published↔draft, current↔target version, store↔template update)
 * arasındaki farkı KULLANICI-DOSTU bir özete çevirir. Ham JSON DÖNMEZ — her değişiklik
 * kategorize edilir (renk/tipografi/düzen/slot/medya/policy), alan etiketi field-labels'tan
 * çözülür, yalnız before/after string değerleri taşınır.
 *
 * GÜVENLİK: logo/favicon değeri belge/config'te DEĞİL (StoreSettings otoritesi) → asset
 * görünümü ayrıca `assets` ile verilir. Ham token belgesi/secret bu özete GİRMEZ. SAF modül.
 */

export const THEME_CHANGE_CATEGORIES = [
  "color",
  "typography",
  "layout",
  "slot",
  "media",
  "policy",
] as const;
export type ThemeChangeCategory = (typeof THEME_CHANGE_CATEGORIES)[number];

export type ThemeChangeKind = "added" | "removed" | "changed";

export interface ThemeFieldChange {
  /** Canonical alan yolu ya da allowlist anahtarı (ör. "allowedFonts"). */
  path: string;
  labelTr: string;
  labelEn: string;
  category: ThemeChangeCategory;
  before: string | null;
  after: string | null;
  kind: ThemeChangeKind;
}

export interface ThemeChangeSummary {
  changes: ThemeFieldChange[];
  counts: Record<ThemeChangeCategory, number>;
  total: number;
  hasChanges: boolean;
}

export interface ThemeAssetView {
  logoMediaId?: string | null;
  faviconMediaId?: string | null;
}

/** Diff için tek tema tarafı: token/config durumu + (opsiyonel) asset + policy. */
export interface ThemeDiffSide {
  state: PolicyThemeState;
  assets?: ThemeAssetView;
  policy?: StoreOverridePolicy;
}

function categoryForPath(path: CanonicalFieldPath): ThemeChangeCategory {
  if (path === "brand.logo" || path === "brand.favicon") return "media";
  if (path === "layoutPreset") return "layout";
  if (path.startsWith("slot.") || path === "responsive.mobileNavigation") return "slot";
  if (path.startsWith("typography.")) return "typography";
  return "color"; // brand.primaryColor/accentColor + color.*
}

function assetValue(view: ThemeAssetView | undefined, path: CanonicalFieldPath): string | null {
  if (!view) return null;
  if (path === "brand.logo") return view.logoMediaId ?? null;
  if (path === "brand.favicon") return view.faviconMediaId ?? null;
  return null;
}

function norm(value: string | null | undefined): string | null {
  return value == null || value === "" ? null : value;
}

function kindOf(before: string | null, after: string | null): ThemeChangeKind {
  if (before == null) return "added";
  if (after == null) return "removed";
  return "changed";
}

function emptyCounts(): Record<ThemeChangeCategory, number> {
  return { color: 0, typography: 0, layout: 0, slot: 0, media: 0, policy: 0 };
}

/**
 * İki tema tarafı arasındaki değişiklikleri özetler. Kanonik token/slot/layout alanları
 * `resolveFieldValue` ile, logo/favicon `assets` ile, policy (varsa iki tarafta da) alan
 * bazlı + allowlist bazlı karşılaştırılır. Sonuç kategori sayaçlarıyla döner.
 */
export function summarizeThemeChanges(prev: ThemeDiffSide, next: ThemeDiffSide): ThemeChangeSummary {
  const changes: ThemeFieldChange[] = [];
  const counts = emptyCounts();

  for (const path of CANONICAL_FIELD_PATHS) {
    const category = categoryForPath(path);
    const before =
      category === "media" ? norm(assetValue(prev.assets, path)) : norm(resolveFieldValue(prev.state, path));
    const after =
      category === "media" ? norm(assetValue(next.assets, path)) : norm(resolveFieldValue(next.state, path));
    if (before === after) continue;
    const label = FIELD_LABELS[path];
    counts[category] += 1;
    changes.push({
      path,
      labelTr: label.labelTr,
      labelEn: label.labelEn,
      category,
      before,
      after,
      kind: kindOf(before, after),
    });
  }

  // ── Policy (yalnız iki tarafta da policy verildiyse) ─────────────────────────
  if (prev.policy && next.policy) {
    for (const path of CANONICAL_FIELD_PATHS) {
      const bp = fieldPolicy(prev.policy, path);
      const ap = fieldPolicy(next.policy, path);
      if (bp === ap) continue;
      const label = FIELD_LABELS[path];
      counts.policy += 1;
      changes.push({
        path: `policy:${path}`,
        labelTr: `${label.labelTr} (yetki)`,
        labelEn: `${label.labelEn} (policy)`,
        category: "policy",
        before: bp,
        after: ap,
        kind: "changed",
      });
    }
    for (const key of ["allowedFonts", "allowedPalettes", "allowedLayoutPresets"] as const) {
      const before = [...prev.policy[key]].sort().join(", ");
      const after = [...next.policy[key]].sort().join(", ");
      if (before === after) continue;
      counts.policy += 1;
      changes.push({
        path: `policy:${key}`,
        labelTr: ALLOWLIST_LABEL_TR[key],
        labelEn: key,
        category: "policy",
        before: before === "" ? null : before,
        after: after === "" ? null : after,
        kind: kindOf(before === "" ? null : before, after === "" ? null : after),
      });
    }
  }

  const total = changes.length;
  return { changes, counts, total, hasChanges: total > 0 };
}

const ALLOWLIST_LABEL_TR: Record<"allowedFonts" | "allowedPalettes" | "allowedLayoutPresets", string> = {
  allowedFonts: "İzinli yazı tipleri",
  allowedPalettes: "İzinli paletler",
  allowedLayoutPresets: "İzinli düzenler",
};
