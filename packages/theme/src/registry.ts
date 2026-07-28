import {
  validateByType,
  type LengthPolicy,
  type NumberPolicy,
  type TokenIssueReason,
  type TokenType,
  type ValidateResult,
} from "./validate.js";
import { isTokenRef, type ThemeDocument } from "./schema.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Theme Token Registry (H-1 — typed token governance)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Her tema token'ı MERKEZİ olarak burada tanımlanır: tipi + doğrulama/normalize
 * politikası. Serializer (css.ts) ve gateway (save/publish) tek otorite olarak
 * bunu kullanır.
 *
 * İLKELER:
 *  - Generic serbest `string` token tipi YOKTUR — her token tipli.
 *  - BİLİNMEYEN primitive anahtarı kabul edilmez (passthrough enjeksiyon yolu
 *    kapatılır): registry'de olmayan `tokens.<grup>.<anahtar>` render'da
 *    yayınlanmaz, save'de THEME_TOKEN_UNKNOWN olur.
 *  - Semantic/component katmanları anlamsal olarak renk-ağırlıklıdır; `{ref}`
 *    değerleri primitive'e çözülür (integrity ayrı denetlenir), somut değerler
 *    tipine göre doğrulanır (semantic→COLOR; component radius→LENGTH,
 *    shadow→SHADOW, diğer→COLOR).
 *
 * NOT: Yeni token eklemek DB migrasyonu GEREKTİRMEZ; yalnız buraya bir kayıt
 * eklenir (kod değişikliği). "Migrasyonsuz genişleme" (ADR-087) bu güvenlik
 * modeliyle uyumlu kalır.
 */

export interface TokenSpec {
  /** Kanonik CSS değişken adı(ları) bu spec'ten türetilmez; type + policy taşır. */
  type: TokenType;
  length?: LengthPolicy;
  number?: NumberPolicy;
}

// ── Paylaşılan politikalar ────────────────────────────────────────────────────
const RADIUS_LENGTH: LengthPolicy = { units: ["px", "rem", "em", "%"], allowZeroUnitless: true };
const SPACING_LENGTH: LengthPolicy = { units: ["px", "rem", "em", "%"], allowZeroUnitless: true };
const FONT_SIZE_LENGTH: LengthPolicy = { units: ["px", "rem", "em"], allowZeroUnitless: true };
const LETTER_SPACING_LENGTH: LengthPolicy = {
  units: ["px", "rem", "em"],
  allowNegative: true,
  allowZeroUnitless: true,
};

const SCALE_NUMBER: NumberPolicy = { min: 0.1, max: 8 };
const LINE_HEIGHT_NUMBER: NumberPolicy = { min: 0.5, max: 4 };
const OPACITY_NUMBER: NumberPolicy = { min: 0, max: 1 };
const HOVER_SCALE_NUMBER: NumberPolicy = { min: 0.5, max: 2 };
const Z_INDEX_NUMBER: NumberPolicy = { min: 0, max: 100000, integer: true };

const COLOR: TokenSpec = { type: "COLOR" };

// ── PRIMITIVE registry ────────────────────────────────────────────────────────
// Grup → (anahtar → spec). Bilinmeyen anahtar → UNKNOWN.
const PRIMITIVE_REGISTRY: Record<string, Record<string, TokenSpec>> = {
  brand: { primary: COLOR, secondary: COLOR, accent: COLOR, tertiary: COLOR },
  surface: {
    background: COLOR,
    surface: COLOR,
    surfaceMuted: COLOR,
    surfaceElevated: COLOR,
    overlay: COLOR,
  },
  text: { primary: COLOR, secondary: COLOR, muted: COLOR, inverse: COLOR, link: COLOR },
  border: { default: COLOR, subtle: COLOR, strong: COLOR, focus: COLOR },
  feedback: { success: COLOR, warning: COLOR, error: COLOR, info: COLOR },
  typography: {
    headingFont: { type: "FONT_FAMILY_PRESET" },
    bodyFont: { type: "FONT_FAMILY_PRESET" },
    monoFont: { type: "FONT_FAMILY_PRESET" },
    headingScale: { type: "NUMBER", number: SCALE_NUMBER },
    baseSize: { type: "LENGTH", length: FONT_SIZE_LENGTH },
    letterSpacing: { type: "LENGTH", length: LETTER_SPACING_LENGTH },
    lineHeight: { type: "NUMBER", number: LINE_HEIGHT_NUMBER },
    weightRegular: { type: "FONT_WEIGHT" },
    weightMedium: { type: "FONT_WEIGHT" },
    weightSemibold: { type: "FONT_WEIGHT" },
    weightBold: { type: "FONT_WEIGHT" },
  },
  radius: {
    none: { type: "LENGTH", length: RADIUS_LENGTH },
    xs: { type: "LENGTH", length: RADIUS_LENGTH },
    sm: { type: "LENGTH", length: RADIUS_LENGTH },
    md: { type: "LENGTH", length: RADIUS_LENGTH },
    lg: { type: "LENGTH", length: RADIUS_LENGTH },
    xl: { type: "LENGTH", length: RADIUS_LENGTH },
    "2xl": { type: "LENGTH", length: RADIUS_LENGTH },
    full: { type: "LENGTH", length: RADIUS_LENGTH },
  },
  shadow: {
    none: { type: "SHADOW_PRESET" },
    xs: { type: "SHADOW_PRESET" },
    sm: { type: "SHADOW_PRESET" },
    md: { type: "SHADOW_PRESET" },
    lg: { type: "SHADOW_PRESET" },
    xl: { type: "SHADOW_PRESET" },
    "2xl": { type: "SHADOW_PRESET" },
  },
  motion: {
    durationFast: { type: "DURATION" },
    durationNormal: { type: "DURATION" },
    durationSlow: { type: "DURATION" },
    easing: { type: "EASING" },
    hoverScale: { type: "NUMBER", number: HOVER_SCALE_NUMBER },
    hoverOpacity: { type: "NUMBER", number: OPACITY_NUMBER },
  },
  layout: {
    containerWidth: { type: "LENGTH", length: SPACING_LENGTH },
    gridGap: { type: "LENGTH", length: SPACING_LENGTH },
    sectionSpacing: { type: "LENGTH", length: SPACING_LENGTH },
    cardSpacing: { type: "LENGTH", length: SPACING_LENGTH },
    contentMaxWidth: { type: "LENGTH", length: SPACING_LENGTH },
  },
  zIndex: {
    navbar: { type: "NUMBER", number: Z_INDEX_NUMBER },
    drawer: { type: "NUMBER", number: Z_INDEX_NUMBER },
    modal: { type: "NUMBER", number: Z_INDEX_NUMBER },
    popover: { type: "NUMBER", number: Z_INDEX_NUMBER },
    tooltip: { type: "NUMBER", number: Z_INDEX_NUMBER },
  },
  breakpoints: {
    desktop: { type: "LENGTH", length: SPACING_LENGTH },
    tablet: { type: "LENGTH", length: SPACING_LENGTH },
    mobile: { type: "LENGTH", length: SPACING_LENGTH },
  },
};

/**
 * `tokens.<grup>.<anahtar>` için spec. Bilinen grup fakat bilinmeyen anahtar →
 * `{ unknown: true }`. Bilinmeyen grup → null (grup şema tarafından zaten
 * denetlenir; ekstra grup passthrough ile gelse bile css.ts yayınlamaz).
 */
export function primitiveSpec(
  group: string,
  key: string,
): TokenSpec | { unknown: true } | null {
  const bag = PRIMITIVE_REGISTRY[group];
  if (!bag) return null;
  const spec = bag[key];
  if (!spec) return { unknown: true };
  return spec;
}

/** Semantic token değerleri anlamsal olarak renktir. */
export function semanticSpec(): TokenSpec {
  return COLOR;
}

/** Component token'ının tipi anahtar adına göre: radius→LENGTH, shadow→SHADOW, diğer→COLOR. */
export function componentSpec(tokenKey: string): TokenSpec {
  if (tokenKey === "radius") return { type: "LENGTH", length: RADIUS_LENGTH };
  if (tokenKey === "shadow") return { type: "SHADOW_PRESET" };
  return COLOR;
}

/** Bir spec + değeri doğrular. */
export function validateSpec(spec: TokenSpec, value: string): ValidateResult {
  return validateByType(spec.type, value, { length: spec.length, number: spec.number });
}

// ── Sorun raporu ──────────────────────────────────────────────────────────────
export interface TokenIssue {
  /** `tokens.brand.primary`, `semantic.action.primary`, `components.button.bg` */
  path: string;
  layer: "primitive" | "semantic" | "component";
  type?: TokenType;
  reason: TokenIssueReason;
}

export const REASON_TO_ERROR_CODE: Record<TokenIssueReason, string> = {
  UNKNOWN: "THEME_TOKEN_UNKNOWN",
  TYPE_MISMATCH: "THEME_TOKEN_TYPE_MISMATCH",
  INVALID_VALUE: "THEME_TOKEN_INVALID_VALUE",
  UNSAFE_VALUE: "THEME_TOKEN_UNSAFE_VALUE",
};

function toStr(value: unknown): string {
  return typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
}

/**
 * Bir belgenin TÜM token değerlerini registry üzerinden doğrular ve sorunları
 * toplar (throw etmez). Save-time savunma bunu kullanır.
 *
 *  - PRIMITIVE: bilinmeyen grup/anahtar → UNKNOWN; somut değer tipine göre doğrulanır.
 *  - SEMANTIC/COMPONENT: `{ref}` değerleri atlanır (integrity `collectResolutionErrors`
 *    ile ayrıca denetlenir); somut değerler tipine göre doğrulanır.
 *
 * GÜVENLİK: Sonuçta ham (saldırgan) değer TAŞINMAZ — yalnız path/type/reason.
 */
export function collectThemeTokenIssues(doc: ThemeDocument): TokenIssue[] {
  const issues: TokenIssue[] = [];

  // Primitive katman
  const tokens = doc.tokens as unknown as Record<string, unknown>;
  for (const [group, bag] of Object.entries(tokens ?? {})) {
    if (!bag || typeof bag !== "object") continue;
    for (const [key, raw] of Object.entries(bag as Record<string, unknown>)) {
      const spec = primitiveSpec(group, key);
      if (spec === null || (spec as { unknown?: true }).unknown) {
        issues.push({ path: `tokens.${group}.${key}`, layer: "primitive", reason: "UNKNOWN" });
        continue;
      }
      const s = spec as TokenSpec;
      const result = validateSpec(s, toStr(raw));
      if (!result.ok) {
        issues.push({
          path: `tokens.${group}.${key}`,
          layer: "primitive",
          type: s.type,
          reason: result.reason,
        });
      }
    }
  }

  // Semantic katman (yalnız somut değerler)
  for (const [key, value] of Object.entries(doc.semantic ?? {})) {
    if (isTokenRef(value)) continue;
    const s = semanticSpec();
    const result = validateSpec(s, toStr(value));
    if (!result.ok) {
      issues.push({ path: `semantic.${key}`, layer: "semantic", type: s.type, reason: result.reason });
    }
  }

  // Component katman (yalnız somut değerler)
  for (const [name, set] of Object.entries(doc.components ?? {})) {
    const compTokens = (set as { tokens?: Record<string, unknown> })?.tokens ?? {};
    for (const [key, value] of Object.entries(compTokens)) {
      if (typeof value === "string" && isTokenRef(value)) continue;
      const s = componentSpec(key);
      const result = validateSpec(s, toStr(value));
      if (!result.ok) {
        issues.push({
          path: `components.${name}.${key}`,
          layer: "component",
          type: s.type,
          reason: result.reason,
        });
      }
    }
  }

  return issues;
}
