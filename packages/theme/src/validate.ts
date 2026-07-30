import { DEFAULT_SHADOW, DEFAULT_TYPOGRAPHY } from "./build.js";
import { FONT_LIBRARY_STACKS } from "./font-library.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Typed Theme Token Validators (H-1 — Theme Token Stored XSS savunması)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GÜVENLİK INVARIANT'I: Tema token değerleri SERBEST CSS DEĞİLDİR. Yalnız tanımlı
 * token tipine ve formatına uygun değerler kabul edilir; her değer PARSE +
 * range + kanonik-normalize edilir (regex-only değil). Geçersiz/güvensiz değer
 * ASLA `<style>` bloğuna girmez.
 *
 * Bu modül SAF'tır (yalnız string işleme). Registry (registry.ts) her token'ı
 * bir {@link TokenType} + politika ile bu doğrulayıcılara bağlar; serializer
 * (css.ts) render anında, gateway ise save/publish anında bunları çağırır.
 */

// ── Tipler ──────────────────────────────────────────────────────────────────
export type TokenType =
  | "COLOR"
  | "LENGTH"
  | "NUMBER"
  | "FONT_FAMILY_PRESET"
  | "FONT_WEIGHT"
  | "SHADOW_PRESET"
  | "DURATION"
  | "EASING";

/**
 * Doğrulama başarısızlık sınıfı → gateway domain hata kodu:
 *   UNKNOWN       → THEME_TOKEN_UNKNOWN       (registry'de tanımsız anahtar)
 *   TYPE_MISMATCH → THEME_TOKEN_TYPE_MISMATCH (değer tipe hiç uymuyor)
 *   INVALID_VALUE → THEME_TOKEN_INVALID_VALUE (biçim/aralık/birim geçersiz)
 *   UNSAFE_VALUE  → THEME_TOKEN_UNSAFE_VALUE  (context-breakout / tehlikeli fonksiyon)
 */
export type TokenIssueReason = "UNKNOWN" | "TYPE_MISMATCH" | "INVALID_VALUE" | "UNSAFE_VALUE";

export type ValidateResult =
  | { ok: true; value: string }
  | { ok: false; reason: TokenIssueReason };

const fail = (reason: TokenIssueReason): ValidateResult => ({ ok: false, reason });
const pass = (value: string): ValidateResult => ({ ok: true, value });

// ── Politikalar ─────────────────────────────────────────────────────────────
export type LengthUnit = "px" | "rem" | "em" | "%" | "vh" | "vw";
export interface LengthPolicy {
  units: readonly LengthUnit[];
  allowNegative?: boolean;
  allowZeroUnitless?: boolean;
}
export interface NumberPolicy {
  min: number;
  max: number;
  integer?: boolean;
}

// ── Ortak güvenlik kapısı ─────────────────────────────────────────────────────
/**
 * Bağlam-kaçışı ve tehlikeli fonksiyon vektörlerini yakalar. TÜM tipler için ilk
 * savunma. `allowParens` yalnız fonksiyonel değer alan tipler için (COLOR/EASING)
 * açılır; diğerlerinde parantez de yasaktır.
 */
function hasUnsafe(value: string, allowParens: boolean): boolean {
  // Deklarasyon/kural/etiket kaçışı, kaçış dizileri, backslash unicode-escape.
  if (/[;{}<>\\]/.test(value)) return true;
  // Kontrol karakterleri (newline, tab, null byte, DEL dahil).
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return true;
  // CSS yorumları (breakout).
  if (value.includes("/*") || value.includes("*/")) return true;
  // Tehlikeli fonksiyonlar/URI şemaları — parens'a izin verilse bile daima yasak.
  if (/url\s*\(/i.test(value)) return true;
  if (/@\s*import/i.test(value)) return true;
  if (/@\s*charset/i.test(value)) return true;
  if (/expression\s*\(/i.test(value)) return true;
  if (/javascript\s*:/i.test(value)) return true;
  if (/data\s*:/i.test(value)) return true;
  if (/behavior\s*:/i.test(value)) return true;
  if (/-moz-binding/i.test(value)) return true;
  if (!allowParens && /[()]/.test(value)) return true;
  return false;
}

/** İçteki ardışık boşlukları tek boşluğa indirger (kanonik, güvenli). */
function collapseWs(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

// ── COLOR ─────────────────────────────────────────────────────────────────────
/**
 * Güvenli renk allowlist'i: transparent/currentColor + yaygın adlı renkler.
 * Adlı renkler enjeksiyon taşıyamaz (yalnız harf). Palet çoğunlukla hex/rgb
 * kullanır; bu liste güvenli bir üst-küme.
 */
const NAMED_COLORS = new Set<string>([
  "transparent",
  "currentcolor",
  "black",
  "white",
  "red",
  "green",
  "blue",
  "yellow",
  "orange",
  "purple",
  "gray",
  "grey",
  "silver",
  "maroon",
  "olive",
  "lime",
  "aqua",
  "teal",
  "navy",
  "fuchsia",
  "cyan",
  "magenta",
  "pink",
  "brown",
  "beige",
  "ivory",
  "gold",
  "coral",
  "salmon",
  "khaki",
  "indigo",
  "violet",
  "turquoise",
  "tan",
  "crimson",
  "chocolate",
  "tomato",
]);

function isNumericToken(tok: string, opts?: { percent?: boolean; angle?: boolean }): boolean {
  let t = tok;
  if (opts?.percent && t.endsWith("%")) t = t.slice(0, -1);
  if (opts?.angle) t = t.replace(/(deg|grad|rad|turn)$/i, "");
  // Yalnız ondalık; üstel (e/E), hex, Infinity, NaN reddedilir.
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(t);
}

function inRange(n: number, lo: number, hi: number): boolean {
  return Number.isFinite(n) && n >= lo && n <= hi;
}

/**
 * Renk değerini PARSE ederek doğrular: #RGB[A]/#RRGGBB[AA], adlı renk allowlist'i,
 * güvenli `rgb()/rgba()/hsl()/hsla()` (hem virgüllü hem modern boşluk/slash
 * sözdizimi). Kanal aralıkları kontrol edilir. Başarıda boşluk-normalize edilmiş
 * özgün değer döner (doğrulama zaten güvenli olduğunu kanıtladığından yeniden-
 * kurgu gerekmez; parite korunur).
 */
export function validateColor(raw: string): ValidateResult {
  const v = collapseWs(raw);
  if (v.length === 0 || v.length > 128) return fail("INVALID_VALUE");
  if (hasUnsafe(v, true)) return fail("UNSAFE_VALUE");

  // Hex
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) {
    return pass(v.toLowerCase());
  }
  // Adlı renk
  if (NAMED_COLORS.has(v.toLowerCase())) return pass(v.toLowerCase());

  // Fonksiyonel
  const m = /^(rgba?|hsla?)\(([^()]*)\)$/i.exec(v);
  if (!m) return fail("TYPE_MISMATCH");
  const fn = m[1].toLowerCase();
  const inner = m[2].trim();

  // Alfa: modern sözdiziminde '/' ile ayrılır (en fazla bir tane).
  const slash = inner.split("/");
  if (slash.length > 2) return fail("INVALID_VALUE");
  const colorPart = slash[0].trim();
  let alphaTok: string | null = slash.length === 2 ? slash[1].trim() : null;

  let channels = colorPart.split(/[\s,]+/).filter(Boolean);
  // Virgüllü rgba/hsla: alfa 4. token (slash yoksa).
  if (alphaTok === null && channels.length === 4) {
    alphaTok = channels[3];
    channels = channels.slice(0, 3);
  }
  if (channels.length !== 3) return fail("INVALID_VALUE");

  const isHsl = fn.startsWith("hsl");
  if (isHsl) {
    // hue: sayı (+opsiyonel açı birimi), sonra 2 yüzde.
    if (!isNumericToken(channels[0], { angle: true })) return fail("INVALID_VALUE");
    for (const c of channels.slice(1)) {
      if (!isNumericToken(c, { percent: true })) return fail("INVALID_VALUE");
    }
  } else {
    // rgb: her kanal 0-255 sayı veya yüzde.
    for (const c of channels) {
      if (!isNumericToken(c, { percent: true })) return fail("INVALID_VALUE");
      if (!c.endsWith("%")) {
        if (!inRange(Number(c), 0, 255)) return fail("INVALID_VALUE");
      }
    }
  }
  if (alphaTok !== null) {
    if (!isNumericToken(alphaTok, { percent: true })) return fail("INVALID_VALUE");
    if (!alphaTok.endsWith("%") && !inRange(Number(alphaTok), 0, 1)) {
      return fail("INVALID_VALUE");
    }
  }
  return pass(v);
}

// ── LENGTH ─────────────────────────────────────────────────────────────────────
const DEFAULT_LENGTH_POLICY: LengthPolicy = { units: ["px", "rem", "em", "%"] };

/**
 * Uzunluk/yarıçap değeri: `<sayı><birim>` (birim allowlist'ten). Birimsiz `0`
 * kabul (varsayılan). calc()/var()/url()/fonksiyon/parantez/semicolon/newline
 * reddedilir. Negatif yalnız politika izin verirse.
 */
export function validateLength(raw: string, policy: LengthPolicy = DEFAULT_LENGTH_POLICY): ValidateResult {
  const v = raw.trim();
  if (v.length === 0 || v.length > 64) return fail("INVALID_VALUE");
  if (hasUnsafe(v, false)) return fail("UNSAFE_VALUE");
  if ((policy.allowZeroUnitless ?? true) && /^-?0$/.test(v)) return pass("0");

  const m = /^(-?)(\d+(?:\.\d+)?|\.\d+)(px|rem|em|%|vh|vw)$/i.exec(v);
  if (!m) return fail("TYPE_MISMATCH");
  const negative = m[1] === "-";
  const unit = m[3].toLowerCase() as LengthUnit;
  if (negative && !policy.allowNegative) return fail("INVALID_VALUE");
  if (!policy.units.includes(unit)) return fail("INVALID_VALUE");
  return pass(`${m[1]}${m[2]}${unit}`);
}

// ── NUMBER ─────────────────────────────────────────────────────────────────────
/**
 * Sayısal token: yalnız ondalık gösterim. NaN/Infinity/üstel (1e3)/hex reddedilir.
 * Politika min/max (+isteğe bağlı tam-sayı) uygulanır. Kanonik `String(n)` döner.
 */
export function validateNumber(raw: string, policy: NumberPolicy): ValidateResult {
  const v = raw.trim();
  if (v.length === 0 || v.length > 32) return fail("INVALID_VALUE");
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(v)) return fail("TYPE_MISMATCH");
  const n = Number(v);
  if (!Number.isFinite(n)) return fail("INVALID_VALUE");
  if (policy.integer && !Number.isInteger(n)) return fail("INVALID_VALUE");
  if (n < policy.min || n > policy.max) return fail("INVALID_VALUE");
  return pass(String(n));
}

// ── FONT_WEIGHT ─────────────────────────────────────────────────────────────────
const FONT_WEIGHT_KEYWORDS = new Set(["normal", "bold", "lighter", "bolder"]);
/** Font ağırlığı: 100-900 tam sayı veya keyword allowlist. */
export function validateFontWeight(raw: string): ValidateResult {
  const v = raw.trim().toLowerCase();
  if (FONT_WEIGHT_KEYWORDS.has(v)) return pass(v);
  if (!/^\d{3}$/.test(v)) return fail("TYPE_MISMATCH");
  const n = Number(v);
  if (n < 100 || n > 900) return fail("INVALID_VALUE");
  return pass(String(n));
}

// ── DURATION ─────────────────────────────────────────────────────────────────────
/** Süre: `<sayı>ms|s`, güvenli aralık (0–60000ms). */
export function validateDuration(raw: string): ValidateResult {
  const v = raw.trim();
  if (v.length === 0 || v.length > 16) return fail("INVALID_VALUE");
  if (hasUnsafe(v, false)) return fail("UNSAFE_VALUE");
  const m = /^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/i.exec(v);
  if (!m) return fail("TYPE_MISMATCH");
  const ms = Number(m[1]) * (m[2].toLowerCase() === "s" ? 1000 : 1);
  if (!inRange(ms, 0, 60000)) return fail("INVALID_VALUE");
  return pass(`${m[1]}${m[2].toLowerCase()}`);
}

// ── EASING ─────────────────────────────────────────────────────────────────────
const EASING_KEYWORDS = new Set([
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step-start",
  "step-end",
]);
/** Zamanlama eğrisi: keyword | `cubic-bezier(n,n,n,n)` | `steps(int[,keyword])`. */
export function validateEasing(raw: string): ValidateResult {
  const v = collapseWs(raw);
  if (v.length === 0 || v.length > 64) return fail("INVALID_VALUE");
  if (hasUnsafe(v, true)) return fail("UNSAFE_VALUE");
  if (EASING_KEYWORDS.has(v.toLowerCase())) return pass(v.toLowerCase());

  const cb = /^cubic-bezier\(([^()]*)\)$/i.exec(v);
  if (cb) {
    const nums = cb[1].split(",").map((s) => s.trim());
    if (nums.length !== 4) return fail("INVALID_VALUE");
    for (const n of nums) {
      if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(n)) return fail("INVALID_VALUE");
    }
    // x kontrol noktaları [0,1]; y makul aralık.
    if (!inRange(Number(nums[0]), 0, 1) || !inRange(Number(nums[2]), 0, 1)) {
      return fail("INVALID_VALUE");
    }
    if (!inRange(Number(nums[1]), -10, 10) || !inRange(Number(nums[3]), -10, 10)) {
      return fail("INVALID_VALUE");
    }
    return pass(v);
  }

  const st = /^steps\(([^()]*)\)$/i.exec(v);
  if (st) {
    const parts = st[1].split(",").map((s) => s.trim());
    if (parts.length < 1 || parts.length > 2) return fail("INVALID_VALUE");
    if (!/^\d{1,3}$/.test(parts[0])) return fail("INVALID_VALUE");
    if (parts[1] && !/^(jump-start|jump-end|jump-none|jump-both|start|end)$/i.test(parts[1])) {
      return fail("INVALID_VALUE");
    }
    return pass(v);
  }
  return fail("TYPE_MISMATCH");
}

// ── FONT_FAMILY_PRESET ──────────────────────────────────────────────────────────
/**
 * Ham `font-family` string KABUL EDİLMEZ. Yalnız preset ID veya kanonik güvenli
 * stack (sunucu-tanımlı sabit) → güvenli sabit stack'e map edilir. Kullanıcı
 * girdisi doğrudan font-family CSS'ine YAZILMAZ.
 */
export const FONT_FAMILY_PRESETS: Record<string, string> = {
  // Legacy id'ler (TODO-164A — 3 font) KORUNUR.
  system: DEFAULT_TYPOGRAPHY.bodyFont,
  sans: DEFAULT_TYPOGRAPHY.bodyFont,
  inter: DEFAULT_TYPOGRAPHY.bodyFont,
  serif: DEFAULT_TYPOGRAPHY.headingFont,
  playfair: DEFAULT_TYPOGRAPHY.headingFont,
  mono: DEFAULT_TYPOGRAPHY.monoFont,
  monospace: DEFAULT_TYPOGRAPHY.monoFont,
  // TODO-164B — Safe Font Library (font-library.ts) familyId'leri ADDITIVE eklenir.
  // Değerler sunucu-tanımlı sabit stack'ler (kullanıcı girdisi değil).
  ...FONT_LIBRARY_STACKS,
};

/** Legacy uyumu: hâlihazırda depolanmış kanonik stack string'leri de geçerli. */
const FONT_STACK_ALLOWLIST = new Set<string>([
  DEFAULT_TYPOGRAPHY.bodyFont,
  DEFAULT_TYPOGRAPHY.headingFont,
  DEFAULT_TYPOGRAPHY.monoFont,
  // Font kütüphanesi stack'leri de doğrudan (çözülmüş) değerle geçerli olmalı.
  ...Object.values(FONT_LIBRARY_STACKS),
]);

export function validateFontFamily(raw: string): ValidateResult {
  const v = raw.trim();
  const preset = FONT_FAMILY_PRESETS[v.toLowerCase()];
  if (preset) return pass(preset);
  if (FONT_STACK_ALLOWLIST.has(v)) return pass(v);
  return fail("TYPE_MISMATCH");
}

// ── SHADOW_PRESET ───────────────────────────────────────────────────────────────
/**
 * Ham `box-shadow` string KABUL EDİLMEZ. Preset ID (none/xs/sm/md/lg/xl/2xl) veya
 * kanonik güvenli shadow (sunucu-tanımlı sabit) → güvenli değere map. Özel
 * shadow değerleri bu fazda desteklenmez.
 */
const SHADOW_ALLOWLIST = new Set<string>(Object.values(DEFAULT_SHADOW));

export function validateShadow(raw: string): ValidateResult {
  const v = raw.trim();
  if (v.toLowerCase() === "none") return pass("none");
  const preset = (DEFAULT_SHADOW as Record<string, string>)[v];
  if (preset) return pass(preset);
  if (SHADOW_ALLOWLIST.has(v)) return pass(v);
  return fail("TYPE_MISMATCH");
}

// ── Dispatcher ──────────────────────────────────────────────────────────────────
export interface TypeOptions {
  length?: LengthPolicy;
  number?: NumberPolicy;
}

/** Tipe göre doğrulayıcıyı seçer. Registry tarafından tek giriş noktası. */
export function validateByType(type: TokenType, value: string, opts?: TypeOptions): ValidateResult {
  switch (type) {
    case "COLOR":
      return validateColor(value);
    case "LENGTH":
      return validateLength(value, opts?.length);
    case "NUMBER":
      if (!opts?.number) return fail("INVALID_VALUE");
      return validateNumber(value, opts.number);
    case "FONT_FAMILY_PRESET":
      return validateFontFamily(value);
    case "FONT_WEIGHT":
      return validateFontWeight(value);
    case "SHADOW_PRESET":
      return validateShadow(value);
    case "DURATION":
      return validateDuration(value);
    case "EASING":
      return validateEasing(value);
    default:
      return fail("TYPE_MISMATCH");
  }
}
