import {
  CURRENT_COMMERCE_VERSION,
  THEME_API_VERSION,
  getThemeEntry,
  isKnownThemeKey,
  type ThemeRegistryEntry,
} from "./theme-registry.js";
import { THEME_SCHEMA_VERSION } from "./schema.js";
import {
  isThemeSlotKey,
  isValidSlotVariant,
  type ThemeSlotKey,
} from "./slots.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Theme Compatibility & Versioning (TODO-164 · ADR-221)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bir temanın bu storefront engine'de GÜVENLE yayınlanabilir olup olmadığını
 * denetler. Uyumsuz tema PUBLISH edilemez; mevcut published korunur; storefront
 * base fallback'e geçer; Platform Admin warning görür.
 *
 * Kontroller:
 *   - themeApiVersion ≤ engine THEME_API_VERSION (ileri sürüm reddedilir)
 *   - commerce-os sürümü ≥ temanın minimumCommerceVersion (semver)
 *   - registry'de bilinen key (unknown → hard incompatible)
 *   - status ACTIVE (DISABLED → incompatible; DEPRECATED → uyarı, yayınlanabilir)
 *   - tokenSchemaVersion ≤ engine THEME_SCHEMA_VERSION
 *   - slot seçimleri bilinen slot + izinli variant (bilinmeyen → incompatible)
 *
 * Çıktı ham değer/gizli veri TAŞIMAZ (audit/warning güvenli).
 */

export type CompatibilitySeverity = "ERROR" | "WARNING";

export type CompatibilityCode =
  | "UNKNOWN_THEME_KEY"
  | "THEME_API_TOO_NEW"
  | "COMMERCE_VERSION_TOO_OLD"
  | "THEME_DISABLED"
  | "THEME_DEPRECATED"
  | "TOKEN_SCHEMA_TOO_NEW"
  | "UNKNOWN_SLOT"
  | "INVALID_SLOT_VARIANT"
  | "MISSING_REQUIRED_SLOT";

export interface CompatibilityIssue {
  code: CompatibilityCode;
  severity: CompatibilitySeverity;
  /** İlgili slot (varsa). */
  slot?: ThemeSlotKey | string;
  /** Kısa, güvenli açıklama (ham değer içermez). */
  message: string;
}

export interface CompatibilityResult {
  compatible: boolean;
  issues: CompatibilityIssue[];
}

/** `a >= b` (semver, yalnız x.y.z; pre-release desteklenmez — ürün sürümleri sade). */
export function semverGte(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10));
  const pb = b.split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

export interface CompatibilityContext {
  /** Yayınlanmak/çözülmek istenen slot seçimleri (slot → variant). */
  slotSelections?: Partial<Record<string, string>>;
  /** Belge token şeması sürümü (varsa; yoksa entry.tokenSchemaVersion). */
  tokenSchemaVersion?: number;
  /** Zorunlu slotlar (varsa) mevcut mu — genelde entry.slots. */
  requiredSlots?: readonly ThemeSlotKey[];
}

/**
 * Registry KAYDINA göre uyumluluk. Bilinmeyen key bu fonksiyona ULAŞMAZ (önce
 * `checkThemeKeyCompatibility` bilinmeyeni yakalar); yine de savunma için entry alınır.
 */
export function checkEntryCompatibility(
  entry: ThemeRegistryEntry,
  ctx: CompatibilityContext = {},
): CompatibilityResult {
  const issues: CompatibilityIssue[] = [];

  if (entry.themeApiVersion > THEME_API_VERSION) {
    issues.push({
      code: "THEME_API_TOO_NEW",
      severity: "ERROR",
      message: `Tema API sürümü (${entry.themeApiVersion}) engine sürümünden (${THEME_API_VERSION}) yeni.`,
    });
  }
  if (!semverGte(CURRENT_COMMERCE_VERSION, entry.minimumCommerceVersion)) {
    issues.push({
      code: "COMMERCE_VERSION_TOO_OLD",
      severity: "ERROR",
      message: `commerce-os ${CURRENT_COMMERCE_VERSION}, tema minimum ${entry.minimumCommerceVersion} gerektiriyor.`,
    });
  }
  if (entry.status === "DISABLED") {
    issues.push({
      code: "THEME_DISABLED",
      severity: "ERROR",
      message: "Tema registry'de DISABLED.",
    });
  } else if (entry.status === "DEPRECATED") {
    issues.push({
      code: "THEME_DEPRECATED",
      severity: "WARNING",
      message: "Tema DEPRECATED — çalışır ama gelecekte kaldırılabilir.",
    });
  }
  const tokenSchema = ctx.tokenSchemaVersion ?? entry.tokenSchemaVersion;
  if (tokenSchema > THEME_SCHEMA_VERSION) {
    issues.push({
      code: "TOKEN_SCHEMA_TOO_NEW",
      severity: "ERROR",
      message: `Token şeması (${tokenSchema}) engine şemasından (${THEME_SCHEMA_VERSION}) yeni.`,
    });
  }

  // Slot seçimleri: bilinmeyen slot / izinsiz variant.
  for (const [slot, variant] of Object.entries(ctx.slotSelections ?? {})) {
    if (!isThemeSlotKey(slot)) {
      issues.push({
        code: "UNKNOWN_SLOT",
        severity: "ERROR",
        slot,
        message: `Bilinmeyen slot: ${slot}.`,
      });
      continue;
    }
    if (typeof variant === "string" && !isValidSlotVariant(slot, variant)) {
      issues.push({
        code: "INVALID_SLOT_VARIANT",
        severity: "ERROR",
        slot,
        message: `Slot '${slot}' için izinsiz variant.`,
      });
    }
  }

  // Zorunlu slotlar bilinen slot olmalı (deprecated/missing slot koruması).
  for (const slot of ctx.requiredSlots ?? []) {
    if (!isThemeSlotKey(slot)) {
      issues.push({
        code: "MISSING_REQUIRED_SLOT",
        severity: "ERROR",
        slot,
        message: `Gerekli slot artık mevcut değil: ${slot}.`,
      });
    }
  }

  const compatible = !issues.some((i) => i.severity === "ERROR");
  return { compatible, issues };
}

/**
 * Bir theme KEY için uyumluluk (bilinmeyen key dahil). Gateway publish gate'i ve
 * storefront resolver bunu kullanır.
 */
export function checkThemeKeyCompatibility(
  themeKey: string,
  ctx: CompatibilityContext = {},
): CompatibilityResult {
  if (!isKnownThemeKey(themeKey)) {
    return {
      compatible: false,
      issues: [
        {
          code: "UNKNOWN_THEME_KEY",
          severity: "ERROR",
          message: `Bilinmeyen tema key: ${themeKey}.`,
        },
      ],
    };
  }
  const entry = getThemeEntry(themeKey)!;
  return checkEntryCompatibility(entry, ctx);
}

/** Sadece ERROR sorunları (WARNING'ler yayınlamayı engellemez). */
export function compatibilityErrors(result: CompatibilityResult): CompatibilityIssue[] {
  return result.issues.filter((i) => i.severity === "ERROR");
}
