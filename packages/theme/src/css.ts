import type { ThemeDocument } from "./schema.js";
import { resolveTheme, resolveValue } from "./resolve.js";

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

/**
 * Vitrinin kanonik değişkenleri → semantic/design token referansı.
 * SIRA ÖNEMLİDİR (deterministik çıktı). Değerler `{ref}`; resolver çözer.
 */
export const STOREFRONT_VAR_BINDINGS: ReadonlyArray<readonly [string, string]> = [
  // Tipografi (primitive aile stack'i)
  ["--font-sans", "{typography.bodyFont}"],
  ["--font-serif", "{typography.headingFont}"],
  // Yüzeyler
  ["--paper", "{page.background}"],
  ["--surface", "{page.surface}"],
  ["--surface-muted", "{page.surfaceMuted}"],
  // Metin
  ["--ink", "{content.primary}"],
  ["--ink-muted", "{content.secondary}"],
  ["--ink-subtle", "{content.muted}"],
  // Çizgi
  ["--line", "{line.default}"],
  ["--line-strong", "{line.strong}"],
  // Aksan (tek birincil CTA + focus)
  ["--accent", "{action.primary}"],
  ["--accent-ink", "{action.primaryActive}"],
  ["--accent-contrast", "{action.primaryContrast}"],
  // Radius
  ["--radius-none", "{radius.none}"],
  ["--radius-sm", "{radius.sm}"],
  ["--radius-md", "{radius.md}"],
  // Gölge
  ["--shadow-sm", "{shadow.sm}"],
  ["--shadow-md", "{shadow.md}"],
];

/** Bir CSS değişken satır listesi: [name, value] çiftleri (deterministik). */
export function generateCssVariables(doc: ThemeDocument): Array<[string, string]> {
  const resolved = resolveTheme(doc);
  const vars: Array<[string, string]> = [];

  // A) Storefront uyum varları
  for (const [name, ref] of STOREFRONT_VAR_BINDINGS) {
    vars.push([name, resolveValue(ref, doc)]);
  }

  // B1) Design-system primitive varları — --ds-<grup>-<kebab anahtar>
  for (const [path, value] of Object.entries(resolved.primitives)) {
    vars.push([`--ds-${kebab(path)}`, value]);
  }
  // B2) Semantic varları — --ds-<kebab anahtar>
  for (const [key, value] of Object.entries(resolved.semantic)) {
    vars.push([`--ds-${kebab(key)}`, value]);
  }
  // B3) Component varları — --ds-<bileşen>-<kebab tokenKey>
  for (const [name, tokens] of Object.entries(resolved.components)) {
    for (const [key, value] of Object.entries(tokens)) {
      vars.push([`--ds-${kebab(name)}-${kebab(key)}`, value]);
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
