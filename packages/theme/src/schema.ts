import { z } from "zod";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Enterprise Theme Engine — Design Token Document Schema (ADR-087)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tüm görsel kimlik tek bir versiyonlanmış JSON belgesinde (ThemeDocument)
 * yaşar. Belge üç token katmanı taşır:
 *
 *   1. tokens     — PRIMITIVE (design) token'lar: ham renk/ölçü/sayı değerleri.
 *   2. semantic   — SEMANTIC token'lar: primitive'lere `{ref}` ile veya ham
 *                   değerle bağlanan anlam katmanı (ör. action.primary).
 *   3. components — COMPONENT token'ları: her bileşen kendi setini semantic'e
 *                   `{ref}` ile bağlar (ör. button.bg → {action.primary}).
 *
 * Genişleyebilirlik ilkesi (ADR-086 deseninin devamı): token grupları `passthrough`
 * olduğundan YENİ token anahtarı eklemek MIGRATION GEREKTİRMEZ — yalnız
 * belge içeriği büyür, kolon şeması değişmez. `schemaVersion` ileride kırıcı
 * dönüşümler için migrasyon kancası sağlar (bkz. serialize.ts).
 *
 * Katman izolasyonu: bir bileşen hiçbir zaman doğrudan HEX/Tailwind değeri
 * bilmez → component token → semantic token → design token → CSS değişkeni.
 */

export const THEME_SCHEMA_VERSION = 1 as const;

/** `{brand.primary}` biçiminde bir token referansı mı? */
export function isTokenRef(value: unknown): value is string {
  return typeof value === "string" && /^\{[a-zA-Z0-9._-]+\}$/.test(value);
}

/** `{brand.primary}` → `brand.primary` */
export function tokenRefPath(ref: string): string {
  return ref.replace(/^\{|\}$/g, "");
}

// ── Değer tipleri ───────────────────────────────────────────────────────────
// Primitive değerler SOMUT olmalıdır (referans DEĞİL) — katman izolasyonu.
const zConcrete = z
  .string()
  .min(1)
  .refine((v) => !isTokenRef(v), {
    message: "primitive token somut bir değer olmalı, referans değil",
  });
// Semantic/component değerleri: `{ref}` veya somut değer.
const zRefOrValue = z.string().min(1);
const zScale = z.number().finite();

// ── PRIMITIVE token grupları ────────────────────────────────────────────────
export const brandTokensSchema = z
  .object({
    primary: zConcrete,
    secondary: zConcrete,
    accent: zConcrete,
    tertiary: zConcrete,
  })
  .passthrough();

export const surfaceTokensSchema = z
  .object({
    background: zConcrete,
    surface: zConcrete,
    surfaceMuted: zConcrete,
    surfaceElevated: zConcrete,
    overlay: zConcrete,
  })
  .passthrough();

export const textTokensSchema = z
  .object({
    primary: zConcrete,
    secondary: zConcrete,
    muted: zConcrete,
    inverse: zConcrete,
    link: zConcrete,
  })
  .passthrough();

export const borderTokensSchema = z
  .object({
    default: zConcrete,
    subtle: zConcrete,
    strong: zConcrete,
    focus: zConcrete,
  })
  .passthrough();

export const feedbackTokensSchema = z
  .object({
    success: zConcrete,
    warning: zConcrete,
    error: zConcrete,
    info: zConcrete,
  })
  .passthrough();

export const typographyTokensSchema = z
  .object({
    headingFont: zConcrete,
    bodyFont: zConcrete,
    monoFont: zConcrete,
    /** Modüler ölçek oranı (ör. 1.25). */
    headingScale: zScale,
    /** Gövde temel yazı boyutu (ör. "16px"). */
    baseSize: zConcrete,
    letterSpacing: zConcrete,
    lineHeight: zScale,
    weightRegular: zScale,
    weightMedium: zScale,
    weightSemibold: zScale,
    weightBold: zScale,
  })
  .passthrough();

export const radiusTokensSchema = z
  .object({
    none: zConcrete,
    xs: zConcrete,
    sm: zConcrete,
    md: zConcrete,
    lg: zConcrete,
    xl: zConcrete,
    "2xl": zConcrete,
    full: zConcrete,
  })
  .passthrough();

export const shadowTokensSchema = z
  .object({
    none: zConcrete,
    xs: zConcrete,
    sm: zConcrete,
    md: zConcrete,
    lg: zConcrete,
    xl: zConcrete,
    "2xl": zConcrete,
  })
  .passthrough();

export const motionTokensSchema = z
  .object({
    durationFast: zConcrete,
    durationNormal: zConcrete,
    durationSlow: zConcrete,
    easing: zConcrete,
    hoverScale: zConcrete,
    hoverOpacity: zConcrete,
  })
  .passthrough();

export const layoutTokensSchema = z
  .object({
    containerWidth: zConcrete,
    gridGap: zConcrete,
    sectionSpacing: zConcrete,
    cardSpacing: zConcrete,
    contentMaxWidth: zConcrete,
  })
  .passthrough();

export const zIndexTokensSchema = z
  .object({
    navbar: zScale,
    drawer: zScale,
    modal: zScale,
    popover: zScale,
    tooltip: zScale,
  })
  .passthrough();

export const breakpointTokensSchema = z
  .object({
    desktop: zConcrete,
    tablet: zConcrete,
    mobile: zConcrete,
  })
  .passthrough();

export const designTokensSchema = z
  .object({
    brand: brandTokensSchema,
    surface: surfaceTokensSchema,
    text: textTokensSchema,
    border: borderTokensSchema,
    feedback: feedbackTokensSchema,
    typography: typographyTokensSchema,
    radius: radiusTokensSchema,
    shadow: shadowTokensSchema,
    motion: motionTokensSchema,
    layout: layoutTokensSchema,
    zIndex: zIndexTokensSchema,
    breakpoints: breakpointTokensSchema,
  })
  .passthrough();

// ── SEMANTIC katman ─────────────────────────────────────────────────────────
// İsim → `{ref}` veya somut değer. Açık kayıt (record): yeni semantic anahtar
// eklemek migrasyon istemez.
export const semanticTokensSchema = z.record(z.string(), zRefOrValue);

// ── COMPONENT katman ────────────────────────────────────────────────────────
// Her bileşen kendi token seti + seçili variant. tokens değerleri semantic'e
// `{ref}` ile bağlanır (ya da somut).
export const componentTokenSetSchema = z
  .object({
    variant: z.string().optional(),
    tokens: z.record(z.string(), zRefOrValue),
  })
  .passthrough();

export const componentTokensSchema = z.record(z.string(), componentTokenSetSchema);

// ── Assets ──────────────────────────────────────────────────────────────────
export const themeAssetsSchema = z
  .object({
    logoMediaId: z.string().nullable().optional(),
    darkLogoMediaId: z.string().nullable().optional(),
    faviconMediaId: z.string().nullable().optional(),
    ogImageMediaId: z.string().nullable().optional(),
    appleTouchIconMediaId: z.string().nullable().optional(),
  })
  .passthrough();

// ── Meta ──────────────────────────────────────────────────────────────────
export const themeMetaSchema = z
  .object({
    name: z.string().min(1),
    basePreset: z.string().optional(),
    colorScheme: z.enum(["light", "dark"]).default("light"),
  })
  .passthrough();

// ── ThemeDocument (kök) ─────────────────────────────────────────────────────
export const themeDocumentSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    meta: themeMetaSchema,
    tokens: designTokensSchema,
    semantic: semanticTokensSchema,
    components: componentTokensSchema,
    assets: themeAssetsSchema.default({}),
    /**
     * Gelişmiş kullanıcı özel CSS'i. GÜVENLİK: doğrudan unsafe injection
     * YAPILMAZ — sunucu tarafında `sanitizeCustomCss` ile temizlenir
     * (bkz. custom-css.ts). Boyut sınırlı.
     */
    customCss: z.string().max(20000).optional(),
  })
  .passthrough();

// ── Statik tipler ─────────────────────────────────────────────────────────
// NOT: Tipler EL İLE bildirilir (z.infer DEĞİL). Sebep: gruplarda `passthrough`
// olduğundan z.infer indeks-imzalı birleşimler üretir ve indekslendiğinde
// `never`e çöker (zod v3 tuhaflığı). El-ile interface'ler hem temiz tip verir
// hem de indeks imzasıyla TİP-seviyesinde de migrasyonsuz genişlemeye izin verir
// (runtime genişleme passthrough şemalarıyla korunur).
export interface BrandTokens {
  primary: string;
  secondary: string;
  accent: string;
  tertiary: string;
  [key: string]: string;
}
export interface SurfaceTokens {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceElevated: string;
  overlay: string;
  [key: string]: string;
}
export interface TextTokens {
  primary: string;
  secondary: string;
  muted: string;
  inverse: string;
  link: string;
  [key: string]: string;
}
export interface BorderTokens {
  default: string;
  subtle: string;
  strong: string;
  focus: string;
  [key: string]: string;
}
export interface FeedbackTokens {
  success: string;
  warning: string;
  error: string;
  info: string;
  [key: string]: string;
}
export interface TypographyTokens {
  headingFont: string;
  bodyFont: string;
  monoFont: string;
  headingScale: number;
  baseSize: string;
  letterSpacing: string;
  lineHeight: number;
  weightRegular: number;
  weightMedium: number;
  weightSemibold: number;
  weightBold: number;
  [key: string]: string | number;
}
export interface RadiusTokens {
  none: string;
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  "2xl": string;
  full: string;
  [key: string]: string;
}
export interface ShadowTokens {
  none: string;
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  "2xl": string;
  [key: string]: string;
}
export interface MotionTokens {
  durationFast: string;
  durationNormal: string;
  durationSlow: string;
  easing: string;
  hoverScale: string;
  hoverOpacity: string;
  [key: string]: string;
}
export interface LayoutTokens {
  containerWidth: string;
  gridGap: string;
  sectionSpacing: string;
  cardSpacing: string;
  contentMaxWidth: string;
  [key: string]: string;
}
export interface ZIndexTokens {
  navbar: number;
  drawer: number;
  modal: number;
  popover: number;
  tooltip: number;
  [key: string]: number;
}
export interface BreakpointTokens {
  desktop: string;
  tablet: string;
  mobile: string;
  [key: string]: string;
}
export interface DesignTokens {
  brand: BrandTokens;
  surface: SurfaceTokens;
  text: TextTokens;
  border: BorderTokens;
  feedback: FeedbackTokens;
  typography: TypographyTokens;
  radius: RadiusTokens;
  shadow: ShadowTokens;
  motion: MotionTokens;
  layout: LayoutTokens;
  zIndex: ZIndexTokens;
  breakpoints: BreakpointTokens;
}
export type SemanticTokens = Record<string, string>;
export interface ComponentTokenSet {
  variant?: string;
  tokens: Record<string, string>;
}
export type ComponentTokens = Record<string, ComponentTokenSet>;
export interface ThemeAssets {
  logoMediaId?: string | null;
  darkLogoMediaId?: string | null;
  faviconMediaId?: string | null;
  ogImageMediaId?: string | null;
  appleTouchIconMediaId?: string | null;
}
export interface ThemeMeta {
  name: string;
  basePreset?: string;
  colorScheme: "light" | "dark";
}
export interface ThemeDocument {
  schemaVersion: number;
  meta: ThemeMeta;
  tokens: DesignTokens;
  semantic: SemanticTokens;
  components: ComponentTokens;
  assets: ThemeAssets;
  customCss?: string;
}

export type ThemeValidationResult =
  | { ok: true; document: ThemeDocument }
  | { ok: false; errors: string[] };

/**
 * Bir belgeyi doğrular ve normalize eder. Başarısızlıkta okunabilir hata
 * listesi döndürür (throw etmez) — import/API katmanı bunu kullanıcı hatasına
 * çevirir.
 */
export function validateThemeDocument(input: unknown): ThemeValidationResult {
  const parsed = themeDocumentSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, document: parsed.data as unknown as ThemeDocument };
  }
  const errors = parsed.error.issues.map(
    (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
  );
  return { ok: false, errors };
}

/** Doğrular; başarısızsa fırlatır. Güvenilir kaynaklar için (seed/preset). */
export function parseThemeDocument(input: unknown): ThemeDocument {
  return themeDocumentSchema.parse(input) as unknown as ThemeDocument;
}
