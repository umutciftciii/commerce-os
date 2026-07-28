import type { ThemeDocument } from "./schema.js";
import { resolveValue } from "./resolve.js";
import {
  componentSpec,
  primitiveSpec,
  semanticSpec,
  validateSpec,
  type TokenSpec,
} from "./registry.js";
import type { LengthPolicy } from "./validate.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CSS Variable Engine
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ThemeDocument → CSS custom property'ler. İki çıktı düzlemi:
 *
 *   A) STOREFRONT UYUM VARLARI — vitrinin BUGÜN tükettiği kanonik değişken
 *      isimleri (`--paper`, `--ink`, `--accent`, `--radius-md`, `--font-serif`…
 *      bkz. storefront-web/app/globals.css). Bu binding katmanı sayesinde
 *      MEVCUT bileşenler TEK SATIR değişmeden yeniden temalanır. Bağlamalar
 *      SEMANTIC token'lara işaret eder → doğru katmanlama (var ← semantic ←
 *      design). Varsayılan tema bu varları globals.css ile BİREBİR üretir.
 *
 *   B) DESIGN-SYSTEM VARLARI (`--ds-*`) — zengin, gelecek-yönlü katman. Yeni
 *      Home Experience/CMS bileşenleri ve diğer app'ler bunları tüketir.
 *      Primitive + semantic + component token'larının tamamı yayınlanır.
 *
 * Çıktı deterministiktir (anahtar sırası sabit) → cache/diff dostu.
 */

/** camelCase / dotted → kebab-case (CSS değişkeni parçası). */
export function kebab(input: string): string {
  return input
    .replace(/\./g, "-")
    .replace(/_/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

const RADIUS_LENGTH: LengthPolicy = { units: ["px", "rem", "em", "%"], allowZeroUnitless: true };
const colorSpec: TokenSpec = { type: "COLOR" };
const fontSpec: TokenSpec = { type: "FONT_FAMILY_PRESET" };
const radiusSpec: TokenSpec = { type: "LENGTH", length: RADIUS_LENGTH };
const shadowSpec: TokenSpec = { type: "SHADOW_PRESET" };

/**
 * Vitrinin kanonik değişkenleri → semantic/design token referansı + TİP.
 * SIRA ÖNEMLİDİR (deterministik çıktı). Değerler `{ref}`; resolver çözer;
 * çözülmüş değer TİPİNE göre doğrulanır (H-1). Tip: [name, ref, spec].
 */
export const STOREFRONT_VAR_BINDINGS: ReadonlyArray<readonly [string, string, TokenSpec]> = [
  // Tipografi (primitive aile stack'i)
  ["--font-sans", "{typography.bodyFont}", fontSpec],
  ["--font-serif", "{typography.headingFont}", fontSpec],
  // Yüzeyler
  ["--paper", "{page.background}", colorSpec],
  ["--surface", "{page.surface}", colorSpec],
  ["--surface-muted", "{page.surfaceMuted}", colorSpec],
  // Metin
  ["--ink", "{content.primary}", colorSpec],
  ["--ink-muted", "{content.secondary}", colorSpec],
  ["--ink-subtle", "{content.muted}", colorSpec],
  // Çizgi
  ["--line", "{line.default}", colorSpec],
  ["--line-strong", "{line.strong}", colorSpec],
  // Aksan (tek birincil CTA + focus)
  ["--accent", "{action.primary}", colorSpec],
  ["--accent-ink", "{action.primaryActive}", colorSpec],
  ["--accent-contrast", "{action.primaryContrast}", colorSpec],
  // Radius
  ["--radius-none", "{radius.none}", radiusSpec],
  ["--radius-sm", "{radius.sm}", radiusSpec],
  ["--radius-md", "{radius.md}", radiusSpec],
  // Gölge
  ["--shadow-sm", "{shadow.sm}", shadowSpec],
  ["--shadow-md", "{shadow.md}", shadowSpec],
];

/**
 * ThemeDocument → güvenli CSS değişken listesi. HER değer, ait olduğu token
 * tipine göre {@link validateSpec} ile doğrulanır; GEÇERSİZ/GÜVENSİZ değer
 * ATLANIR (render-time defense — ham değer `<style>` bloğuna asla girmez, sayfa
 * kırılmaz, diğer geçerli tokenlar çalışır). Bilinmeyen primitive anahtarı hiç
 * yayınlanmaz. Deterministik sıra korunur.
 *
 * `onDrop` verilirse atlanan her değişken için (payload'suz) geri çağrılır —
 * audit/telemetri için (değer LOGLANMAZ).
 */
export function generateCssVariables(
  doc: ThemeDocument,
  onDrop?: (info: { name: string; reason: string }) => void,
): Array<[string, string]> {
  const vars: Array<[string, string]> = [];

  /** `{ref}`/somut değeri güvenle çözer; çözülemezse null (asla throw etmez). */
  const safeResolve = (value: string): string | null => {
    try {
      return resolveValue(value, doc);
    } catch {
      return null;
    }
  };

  const emit = (name: string, value: string | null, spec: TokenSpec) => {
    if (value === null) {
      if (onDrop) onDrop({ name, reason: "UNRESOLVED" });
      return;
    }
    const result = validateSpec(spec, value);
    if (result.ok) {
      vars.push([name, result.value]);
    } else if (onDrop) {
      onDrop({ name, reason: result.reason });
    }
  };

  // A) Storefront uyum varları
  for (const [name, ref, spec] of STOREFRONT_VAR_BINDINGS) {
    emit(name, safeResolve(ref), spec);
  }

  // B1) Design-system primitive varları — --ds-<grup>-<kebab anahtar>
  const tokens = doc.tokens as unknown as Record<string, unknown>;
  for (const [group, bag] of Object.entries(tokens ?? {})) {
    if (!bag || typeof bag !== "object") continue;
    for (const [key, raw] of Object.entries(bag as Record<string, unknown>)) {
      if (raw == null) continue;
      const path = `${group}.${key}`;
      const spec = primitiveSpec(group, key);
      if (spec === null || (spec as { unknown?: true }).unknown) {
        if (onDrop) onDrop({ name: `--ds-${kebab(path)}`, reason: "UNKNOWN" });
        continue;
      }
      const value = typeof raw === "number" ? String(raw) : String(raw);
      emit(`--ds-${kebab(path)}`, value, spec as TokenSpec);
    }
  }
  // B2) Semantic varları — --ds-<kebab anahtar>
  for (const [key, value] of Object.entries(doc.semantic ?? {})) {
    emit(`--ds-${kebab(key)}`, safeResolve(value), semanticSpec());
  }
  // B3) Component varları — --ds-<bileşen>-<kebab tokenKey>
  for (const [name, set] of Object.entries(doc.components ?? {})) {
    const compTokens = (set as { tokens?: Record<string, unknown> })?.tokens ?? {};
    for (const [key, value] of Object.entries(compTokens)) {
      if (value == null) continue;
      const raw = typeof value === "string" ? value : String(value);
      emit(`--ds-${kebab(name)}-${kebab(key)}`, safeResolve(raw), componentSpec(key));
    }
  }

  return vars;
}

export interface StylesheetOptions {
  /** Sarmalayıcı seçici. Vitrinde `:root[data-theme]` (özgüllük kazanır). */
  selector?: string;
  /** Girinti (okunabilirlik). Üretim için "" verilebilir. */
  indent?: string;
  /** Sanitize edilmiş özel CSS'i var bloğundan sonra ekle. */
  includeCustomCss?: boolean;
}

/**
 * ThemeDocument → tam CSS stylesheet metni (bir seçici bloğu + opsiyonel
 * custom CSS). Vitrin bunu `<style>` olarak head'e enjekte eder.
 */
export function generateThemeStylesheet(
  doc: ThemeDocument,
  options: StylesheetOptions = {},
): string {
  const selector = options.selector ?? ":root";
  const indent = options.indent ?? "  ";
  const vars = generateCssVariables(doc);
  const lines = vars.map(([name, value]) => `${indent}${name}: ${value};`);
  let css = `${selector} {\n${lines.join("\n")}\n}`;
  if (options.includeCustomCss && doc.customCss) {
    css += `\n\n${doc.customCss}`;
  }
  return css;
}

/**
 * Vitrin için hazır stylesheet: `:root[data-theme]` seçicisiyle (globals.css'in
 * `[data-theme="default"]` bloğunu özgüllükte geçer → override garantisi).
 */
export function generateStorefrontThemeCss(doc: ThemeDocument): string {
  return generateThemeStylesheet(doc, {
    selector: ":root[data-theme]",
    includeCustomCss: true,
  });
}
