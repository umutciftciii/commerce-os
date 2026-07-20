/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Custom CSS Sandbox (ADR-087)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gelişmiş kullanıcı özel CSS'i DOĞRUDAN unsafe biçimde enjekte EDİLMEZ.
 * `sanitizeCustomCss` savunma amaçlı temizler: `<style>` etiketinden kaçış,
 * `@import` (harici kaynak), `javascript:`/`expression()`/`behavior`/`-moz-binding`
 * (legacy IE script vektörleri) kaldırılır; uzunluk sınırlanır. Sonuç yalnız
 * `<style>` bloğu içinde, tema var bloğundan SONRA yayımlanır.
 *
 * Bu bir CSS "sandbox" temelidir; tam kapsam (scoped nesting/allowlist) ileri
 * fazda genişletilir (bkz. TECHNICAL_DEBT).
 */

export const CUSTOM_CSS_MAX_LENGTH = 20000;

const DANGEROUS_PATTERNS: Array<[RegExp, string]> = [
  [/<\s*\/?\s*style[^>]*>/gi, ""], // </style> ile blok kaçışı
  [/<[^>]*>/g, ""], // her türlü HTML etiketi
  [/@import\b[^;]*;?/gi, ""], // harici kaynak çekme
  [/expression\s*\(/gi, "("], // IE expression()
  [/javascript\s*:/gi, ""], // javascript: URI
  [/behavior\s*:/gi, ""], // IE behavior
  [/-moz-binding\b/gi, ""], // XBL binding
  [/@charset\b[^;]*;?/gi, ""], // charset yönergesi (blok başı gerektirir)
];

export interface SanitizeResult {
  css: string;
  removed: string[];
}

/** Özel CSS'i temizler; kaldırılan tehlike sınıflarını rapor eder. */
export function sanitizeCustomCss(input: string | null | undefined): SanitizeResult {
  if (!input) return { css: "", removed: [] };
  let css = input.slice(0, CUSTOM_CSS_MAX_LENGTH);
  const removed: string[] = [];
  for (const [pattern, replacement] of DANGEROUS_PATTERNS) {
    if (pattern.test(css)) {
      removed.push(pattern.source);
      css = css.replace(pattern, replacement);
    }
  }
  return { css: css.trim(), removed };
}
