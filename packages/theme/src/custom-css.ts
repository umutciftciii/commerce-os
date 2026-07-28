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
  // '<' TAMAMEN kaldırılır: CSS'te '<' meşru değildir; bu tek kural `</style>`,
  // `<script`, tüm HTML etiketi breakout'unu kökten imkânsızlaştırır. ('>' child
  // combinator olduğundan korunur.)
  [/</g, ""],
  [/style\s*>/gi, ""], // '<' kalksa da artık '>' ile kalan `style >` kalıntısı
  [/@\s*import\b[^;]*;?/gi, ""], // harici kaynak çekme (boşluk toleranslı)
  [/expression\s*\(/gi, "("], // IE expression()
  [/javascript\s*:/gi, ""], // javascript: URI
  [/behavior\s*:/gi, ""], // IE behavior
  [/-moz-binding\b/gi, ""], // XBL binding
  [/@\s*charset\b[^;]*;?/gi, ""], // charset yönergesi
  [/@\s*namespace\b[^;]*;?/gi, ""], // namespace (harici URI taşıyabilir)
];

/** CSS yorumlarını (obfuscation vektörü) kaldırır; kapanmamış `/*` de temizlenir. */
const COMMENT_PATTERN = /\/\*[\s\S]*?(?:\*\/|$)/g;

export interface SanitizeResult {
  css: string;
  removed: string[];
}

/**
 * Özel CSS'i temizler; kaldırılan tehlike sınıflarını rapor eder.
 *
 * SERTLEŞTİRME (H-1): (1) yorumlar ÖNCE kaldırılır — yorum-obfuscation
 * (@ ile import arasına yorum sokma) engellenir; (2) tüm `<` silinir → HTML breakout imkânsız;
 * (3) filtreler FIXPOINT'e kadar döngüde uygulanır — kaldırma sonrası yeniden
 * oluşan token'ı (ör. `java`+`javascript:`+`script:`) da yakalar.
 */
export function sanitizeCustomCss(input: string | null | undefined): SanitizeResult {
  if (!input) return { css: "", removed: [] };
  let css = input.slice(0, CUSTOM_CSS_MAX_LENGTH);
  const removed: string[] = [];

  // 1) Yorumları kaldır (obfuscation önlemi).
  if (COMMENT_PATTERN.test(css)) {
    removed.push(COMMENT_PATTERN.source);
    css = css.replace(COMMENT_PATTERN, "");
  }

  // 2) Tehlike kalıplarını fixpoint'e kadar uygula (max 5 tur — güvenlik ağı).
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (const [pattern, replacement] of DANGEROUS_PATTERNS) {
      if (pattern.test(css)) {
        if (!removed.includes(pattern.source)) removed.push(pattern.source);
        css = css.replace(pattern, replacement);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return { css: css.trim(), removed };
}
