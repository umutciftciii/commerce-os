import { z } from "zod";
import {
  BASE_LAYOUT_PRESET_KEY,
  layoutPresetKeySchema,
} from "./layout-presets.js";
import {
  isValidSlotVariant,
  slotSelectionSchema,
  THEME_SLOT_KEYS,
  themeSlotKeySchema,
  type ThemeSlotKey,
} from "./slots.js";
import { BASE_THEME_KEY, isKnownThemeKey } from "./theme-registry.js";
import { validateColor, validateLength } from "./validate.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Custom Theme Builder — Extended Config (TODO-164A · ADR-225)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `themeConfigSchema` (config.ts) ADDITIVE genişletilir. Mevcut `{themeKey,
 * layoutPreset, slots}` KORUNUR; builder yeni yapısal + responsive + colorScheme
 * gruplarını ekler. Kurallar (spec §3):
 *   - strict schema (yeni gruplar unknown key REDDEDER)
 *   - bounded değerler (numeric min/max, length H-1 tipli, enum allowlist)
 *   - unsupported variant reddi (slot allowlist)
 *   - client config OTORİTE DEĞİL → gateway server-side doğrular
 *
 * Token RENDER otoritesi `ThemeDocument` (document) olmaya devam eder; bu config
 * YAPISAL seçimleri (slot variant, container, listing, hero, responsive) + isteğe
 * bağlı token echo'sunu taşır. Yapısal/responsive kısım `builder-css.ts` ile
 * ek CSS'e serialize edilir (document CSS'inden SONRA → override kazanır).
 *
 * GÜVENLİK: uzunluk değerleri H-1 `validateLength`, renkler `validateColor` ile
 * denetlenir (regex-only değil; arbitrary CSS/URL/fonksiyon reddedilir). Kullanıcı
 * media query YAZAMAZ — yalnız izinli responsive anahtar + bounded değer.
 */

// ── H-1 tipli string doğrulayıcılar (zod refine) ──────────────────────────────
const SAFE_LENGTH: z.ZodType<string> = z
  .string()
  .refine((v) => validateLength(v).ok, { message: "geçersiz/güvensiz uzunluk" });
const SAFE_COLOR: z.ZodType<string> = z
  .string()
  .refine((v) => validateColor(v).ok, { message: "geçersiz/güvensiz renk" });

// ── Enum allowlist'leri ───────────────────────────────────────────────────────
export const BUTTON_SHAPES = ["sharp", "rounded", "pill"] as const;
export const BUTTON_WEIGHTS = ["regular", "medium", "bold"] as const;
export const SURFACE_BORDERS = ["none", "subtle", "strong"] as const;
export const SURFACE_ELEVATIONS = ["flat", "raised", "floating"] as const;
export const IMAGE_RATIOS = ["square", "portrait", "landscape"] as const;
export const HERO_HEIGHTS = ["compact", "standard", "tall", "full"] as const;
export const CONTENT_ALIGNS = ["left", "center"] as const;
export const LISTING_GAPS = ["tight", "normal", "relaxed"] as const;
export const RADIUS_SCALES = ["sharp", "soft", "rounded"] as const;
export const SHADOW_DEPTHS = ["none", "subtle", "elevated"] as const;
export const CONTAINER_GUTTERS = ["tight", "normal", "wide"] as const;
export const CARD_DENSITIES = ["comfortable", "compact", "editorial"] as const;
export const COLOR_SCHEMES = ["light", "dark"] as const;

// ── Yapısal gruplar (strict — unknown key reddi) ──────────────────────────────
const tokenOverridesSchema = z
  .object({
    brandPrimary: SAFE_COLOR.optional(),
    brandAccent: SAFE_COLOR.optional(),
    background: SAFE_COLOR.optional(),
    surface: SAFE_COLOR.optional(),
    textPrimary: SAFE_COLOR.optional(),
  })
  .strict();

const typographySchema = z
  .object({
    headingScale: z.number().min(1).max(2).optional(),
    baseSize: SAFE_LENGTH.optional(),
    lineHeight: z.number().min(1).max(2.5).optional(),
    letterSpacing: SAFE_LENGTH.optional(),
  })
  .strict();

const containerSchema = z
  .object({
    width: SAFE_LENGTH.optional(),
    contentMaxWidth: SAFE_LENGTH.optional(),
    gutter: z.enum(CONTAINER_GUTTERS).optional(),
  })
  .strict();

const radiusSchema = z.object({ scale: z.enum(RADIUS_SCALES).optional() }).strict();
const shadowSchema = z.object({ depth: z.enum(SHADOW_DEPTHS).optional() }).strict();
const buttonStyleSchema = z
  .object({ shape: z.enum(BUTTON_SHAPES).optional(), weight: z.enum(BUTTON_WEIGHTS).optional() })
  .strict();
const surfaceStyleSchema = z
  .object({
    border: z.enum(SURFACE_BORDERS).optional(),
    elevation: z.enum(SURFACE_ELEVATIONS).optional(),
  })
  .strict();
const productCardSchema = z.object({ imageRatio: z.enum(IMAGE_RATIOS).optional() }).strict();
const listingSchema = z
  .object({
    columnsDesktop: z.number().int().min(2).max(6).optional(),
    gap: z.enum(LISTING_GAPS).optional(),
  })
  .strict();
const productDetailSchema = z
  .object({ galleryAspect: z.enum(IMAGE_RATIOS).optional() })
  .strict();
const heroSchema = z
  .object({
    height: z.enum(HERO_HEIGHTS).optional(),
    contentAlign: z.enum(CONTENT_ALIGNS).optional(),
  })
  .strict();
const navigationSchema = z.object({ sticky: z.boolean().optional() }).strict();
const mediaSchema = z.object({ productRatio: z.enum(IMAGE_RATIOS).optional() }).strict();

// ── Responsive override (typed breakpoint, izinli anahtar) ─────────────────────
const responsivePartialSchema = z
  .object({
    columns: z.number().int().min(1).max(4).optional(),
    containerPadding: SAFE_LENGTH.optional(),
    heroHeight: z.enum(HERO_HEIGHTS).optional(),
    sectionSpacing: SAFE_LENGTH.optional(),
    productCardDensity: z.enum(CARD_DENSITIES).optional(),
    navigationVariant: z.string().optional(), // slot allowlist ile ayrıca denetlenir
  })
  .strict();

export type ResponsivePartial = z.infer<typeof responsivePartialSchema>;

const responsiveOverridesSchema = z
  .object({
    tablet: responsivePartialSchema.optional(),
    mobile: responsivePartialSchema.optional(),
  })
  .strict();

/**
 * Builder config şeması. Top-level `.strip()` (ileri-uyum: bilinmeyen ÜST anahtar
 * DÜŞÜRÜLÜR — etki etmez); alt gruplar `.strict()` (bilinmeyen anahtar REDDEDİLİR).
 * `slotVariants` = builder-facing slot→variant (slot allowlist `superRefine`'da).
 */
export const themeBuilderConfigSchema = z
  .object({
    themeKey: z.string().min(1).default(BASE_THEME_KEY),
    layoutPreset: layoutPresetKeySchema.default(BASE_LAYOUT_PRESET_KEY),
    slots: slotSelectionSchema.default({}),
    slotVariants: z.record(themeSlotKeySchema, z.string()).optional(),
    tokenOverrides: tokenOverridesSchema.optional(),
    typography: typographySchema.optional(),
    container: containerSchema.optional(),
    radius: radiusSchema.optional(),
    shadow: shadowSchema.optional(),
    buttonStyle: buttonStyleSchema.optional(),
    surfaceStyle: surfaceStyleSchema.optional(),
    productCard: productCardSchema.optional(),
    listing: listingSchema.optional(),
    productDetail: productDetailSchema.optional(),
    hero: heroSchema.optional(),
    navigation: navigationSchema.optional(),
    media: mediaSchema.optional(),
    responsiveOverrides: responsiveOverridesSchema.optional(),
    colorScheme: z.enum(COLOR_SCHEMES).optional(),
  })
  .strip()
  .superRefine((cfg, ctx) => {
    // Builder-facing `slotVariants` içindeki her variant slot allowlist'inde OLMALI
    // (schema-seviyesi red → INVALID_THEME_CONFIG). NOT: legacy `slots` alanı burada
    // DENETLENMEZ — gateway compatibility onu THEME_INCOMPATIBLE olarak yakalar
    // (mevcut sözleşme + testlerle uyumlu; iki alan ayrı sorumluluk taşır).
    for (const [slot, variant] of Object.entries((cfg.slotVariants ?? {}) as Record<string, string>)) {
      if (!isValidSlotVariant(slot, variant)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slotVariants", slot],
          message: `slot '${slot}' için izinsiz variant: ${variant}`,
        });
      }
    }
    // responsive navigationVariant → mobileNavigation allowlist.
    for (const bp of ["tablet", "mobile"] as const) {
      const nav = cfg.responsiveOverrides?.[bp]?.navigationVariant;
      if (nav && !isValidSlotVariant("mobileNavigation", nav)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["responsiveOverrides", bp, "navigationVariant"],
          message: `izinsiz mobil navigasyon variant'ı: ${nav}`,
        });
      }
    }
  });

export type ThemeBuilderConfig = z.infer<typeof themeBuilderConfigSchema>;

export type ThemeBuilderConfigValidation =
  | { ok: true; config: ThemeBuilderConfig }
  | { ok: false; errors: string[] };

/**
 * Builder config'i doğrular (gateway 400 için okunur hata listesi). Ham değer
 * mesaja sızmaz (yalnız path + kısa mesaj). Başarısızlıkta throw ETMEZ.
 */
export function validateThemeBuilderConfig(input: unknown): ThemeBuilderConfigValidation {
  const parsed = themeBuilderConfigSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  return { ok: true, config: parsed.data };
}

/**
 * Builder config'i güvenli, normalize haline getirir (parse hatası → base default).
 * `slotVariants` → `slots` içine MERGE edilir (slotVariants öncelikli); downstream
 * `resolveConfigSlots` yalnız `slots`'u okuduğundan tek kod yolu korunur. Bilinmeyen
 * themeKey → BASE (fail-closed).
 */
export function parseThemeBuilderConfig(input: unknown): ThemeBuilderConfig {
  const parsed = themeBuilderConfigSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return {
      themeKey: BASE_THEME_KEY,
      layoutPreset: BASE_LAYOUT_PRESET_KEY,
      slots: {},
    } as ThemeBuilderConfig;
  }
  const cfg = parsed.data;
  const themeKey = isKnownThemeKey(cfg.themeKey) ? cfg.themeKey : BASE_THEME_KEY;
  // slotVariants → slots merge (slotVariants öncelikli, yalnız geçerli variant).
  const slots: Partial<Record<ThemeSlotKey, string>> = { ...(cfg.slots ?? {}) };
  for (const [slot, variant] of Object.entries(cfg.slotVariants ?? {})) {
    if (isValidSlotVariant(slot, variant)) slots[slot as ThemeSlotKey] = variant;
  }
  return { ...cfg, themeKey, slots };
}

export const EMPTY_BUILDER_CONFIG: ThemeBuilderConfig = {
  themeKey: BASE_THEME_KEY,
  layoutPreset: BASE_LAYOUT_PRESET_KEY,
  slots: {},
} as ThemeBuilderConfig;

/** Builder'ın düzenleyebildiği slot anahtarları (UI iterasyonu için). */
export const BUILDER_SLOT_KEYS = THEME_SLOT_KEYS;
