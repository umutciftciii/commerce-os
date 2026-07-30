import { validateLength } from "./validate.js";
import type { ResponsivePartial, ThemeBuilderConfig } from "./builder-config.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Builder CSS Serializer (TODO-164A · ADR-227)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Builder config'in YAPISAL + RESPONSIVE kısmını güvenli CSS custom property'lere
 * ve SİSTEM-TANIMLI breakpoint `@media` bloklarına serialize eder. Token belgesi
 * CSS'inden SONRA yayımlanır → override kazanır (aynı `:root[data-theme]` seçici).
 *
 * GÜVENLİK:
 *  - Kullanıcı arbitrary media query / property / selector YAZAMAZ. Yalnız SABİT
 *    değişken adları + SABİT breakpoint'ler emit edilir.
 *  - Uzunluk değerleri render anında yeniden H-1 `validateLength` ile süzülür
 *    (defense-in-depth); geçersizse o değişken ATLANIR.
 *  - Enum → SABİT güvenli değer haritası (kullanıcı değeri asla CSS'e ham girmez).
 *  - Sayısal değerler bounded (config şeması zaten sınırlar; burada da String()).
 *
 * Breakpoint'ler SİSTEM sabiti (storefront Tailwind ile hizalı): tablet ≤1024px,
 * mobile ≤640px. mobile bloğu tablet'ten SONRA gelir → en küçük ekranda kazanır.
 */

const TABLET_MAX = "1024px";
const MOBILE_MAX = "640px";

// ── Enum → güvenli CSS değer haritaları ───────────────────────────────────────
const GUTTER: Record<string, string> = { tight: "16px", normal: "24px", wide: "40px" };
const LISTING_GAP: Record<string, string> = { tight: "12px", normal: "24px", relaxed: "40px" };
const HERO_H: Record<string, string> = {
  compact: "20rem",
  standard: "28rem",
  tall: "38rem",
  full: "48rem",
};
const RATIO: Record<string, string> = { square: "1 / 1", portrait: "3 / 4", landscape: "4 / 3" };
const RADIUS_SCALE: Record<string, [string, string, string]> = {
  sharp: ["0px", "0px", "2px"],
  soft: ["2px", "4px", "8px"],
  rounded: ["6px", "10px", "16px"],
};
const SHADOW_DEPTH: Record<string, [string, string, string]> = {
  none: ["none", "none", "none"],
  subtle: [
    "0 1px 2px 0 rgb(23 20 15 / 0.05)",
    "0 8px 24px -16px rgb(23 20 15 / 0.18)",
    "0 16px 40px -24px rgb(23 20 15 / 0.24)",
  ],
  elevated: [
    "0 2px 6px 0 rgb(23 20 15 / 0.10)",
    "0 24px 56px -28px rgb(23 20 15 / 0.34)",
    "0 40px 80px -32px rgb(23 20 15 / 0.44)",
  ],
};
const CARD_DENSITY_GAP: Record<string, string> = {
  comfortable: "24px",
  compact: "12px",
  editorial: "40px",
};

type Var = [string, string];

/** Güvenli uzunluk mü? (H-1 defense-in-depth). */
function safeLen(v: string | undefined): string | null {
  if (!v) return null;
  const r = validateLength(v);
  return r.ok ? r.value : null;
}

function pushLen(vars: Var[], name: string, v: string | undefined) {
  const s = safeLen(v);
  if (s) vars.push([name, s]);
}

/**
 * Config'in TABAN (breakpoint'siz) CSS değişkenlerini üretir. Deterministik sıra.
 * Yalnız GEÇERLİ değerler emit edilir (fail-safe: geçersiz → atlanır, sayfa kırılmaz).
 */
export function builderBaseVariables(config: ThemeBuilderConfig): Var[] {
  const vars: Var[] = [];

  // Container
  pushLen(vars, "--tb-container-max", config.container?.width);
  pushLen(vars, "--tb-content-max", config.container?.contentMaxWidth);
  if (config.container?.gutter) vars.push(["--tb-gutter", GUTTER[config.container.gutter]]);

  // Listing
  if (typeof config.listing?.columnsDesktop === "number") {
    vars.push(["--tb-listing-cols", String(config.listing.columnsDesktop)]);
  }
  if (config.listing?.gap) vars.push(["--tb-listing-gap", LISTING_GAP[config.listing.gap]]);

  // Hero
  if (config.hero?.height) vars.push(["--tb-hero-h", HERO_H[config.hero.height]]);
  if (config.hero?.contentAlign) {
    vars.push(["--tb-hero-align", config.hero.contentAlign === "center" ? "center" : "flex-start"]);
    vars.push(["--tb-hero-text-align", config.hero.contentAlign]);
  }

  // Kart / medya oranı
  const ratio = config.productCard?.imageRatio ?? config.media?.productRatio;
  if (ratio) vars.push(["--tb-card-ratio", RATIO[ratio]]);
  if (config.productDetail?.galleryAspect) {
    vars.push(["--tb-gallery-ratio", RATIO[config.productDetail.galleryAspect]]);
  }

  // Radius ölçeği
  if (config.radius?.scale) {
    const [sm, md, lg] = RADIUS_SCALE[config.radius.scale];
    vars.push(["--radius-sm", sm], ["--radius-md", md], ["--radius-lg", lg]);
  }

  // Gölge derinliği
  if (config.shadow?.depth) {
    const [sm, md, lg] = SHADOW_DEPTH[config.shadow.depth];
    vars.push(["--shadow-sm", sm], ["--shadow-md", md], ["--shadow-lg", lg]);
  }

  // Token echo (opsiyonel; document CSS'ini override eder)
  if (config.tokenOverrides?.brandPrimary) vars.push(["--accent", config.tokenOverrides.brandPrimary]);
  if (config.tokenOverrides?.background) vars.push(["--paper", config.tokenOverrides.background]);
  if (config.tokenOverrides?.surface) vars.push(["--surface", config.tokenOverrides.surface]);
  if (config.tokenOverrides?.textPrimary) vars.push(["--ink", config.tokenOverrides.textPrimary]);

  // Tipografi
  pushLen(vars, "--tb-base-size", config.typography?.baseSize);
  pushLen(vars, "--tb-letter-spacing", config.typography?.letterSpacing);
  if (typeof config.typography?.lineHeight === "number") {
    vars.push(["--tb-line-height", String(config.typography.lineHeight)]);
  }
  if (typeof config.typography?.headingScale === "number") {
    vars.push(["--tb-heading-scale", String(config.typography.headingScale)]);
  }

  return vars;
}

/** Bir responsive parça → override değişkenleri (breakpoint bloğu içeriği). */
function responsiveVariables(bp: ResponsivePartial | undefined): Var[] {
  if (!bp) return [];
  const vars: Var[] = [];
  if (typeof bp.columns === "number") vars.push(["--tb-listing-cols", String(bp.columns)]);
  pushLen(vars, "--tb-gutter", bp.containerPadding);
  if (bp.heroHeight) vars.push(["--tb-hero-h", HERO_H[bp.heroHeight]]);
  pushLen(vars, "--tb-section-gap", bp.sectionSpacing);
  if (bp.productCardDensity) vars.push(["--tb-card-gap", CARD_DENSITY_GAP[bp.productCardDensity]]);
  // navigationVariant CSS ile değil server slot çözümüyle uygulanır (yalnız doğrulanır).
  return vars;
}

function block(selector: string, vars: Var[], indent: string): string {
  const lines = vars.map(([n, v]) => `${indent}${n}: ${v};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

export interface BuilderCssOptions {
  selector?: string;
  indent?: string;
}

/**
 * Config → tam builder CSS (taban blok + tablet/mobile `@media` blokları). Boş
 * config → boş string. Token belgesi CSS'inden SONRA eklenmelidir.
 */
export function generateBuilderCss(
  config: ThemeBuilderConfig,
  options: BuilderCssOptions = {},
): string {
  const selector = options.selector ?? ":root[data-theme]";
  const indent = options.indent ?? "  ";
  const parts: string[] = [];

  const base = builderBaseVariables(config);
  if (base.length > 0) parts.push(block(selector, base, indent));

  const tablet = responsiveVariables(config.responsiveOverrides?.tablet);
  if (tablet.length > 0) {
    parts.push(`@media (max-width: ${TABLET_MAX}) {\n${block(selector, tablet, indent + indent)}\n}`);
  }
  const mobile = responsiveVariables(config.responsiveOverrides?.mobile);
  if (mobile.length > 0) {
    parts.push(`@media (max-width: ${MOBILE_MAX}) {\n${block(selector, mobile, indent + indent)}\n}`);
  }

  return parts.join("\n\n");
}
