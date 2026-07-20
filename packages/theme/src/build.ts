import {
  THEME_SCHEMA_VERSION,
  type ComponentTokens,
  type DesignTokens,
  type SemanticTokens,
  type ThemeAssets,
  type ThemeDocument,
} from "./schema.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ThemeDocument fabrikası + paylaşılan semantic/component varsayılanları
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bir preset yalnız PRIMITIVE paletini (brand/surface/text/border/feedback) ve
 * isterse tipografi/şekil ölçeklerini verir; SEMANTIC ve COMPONENT katmanları
 * bu varsayılanlardan OTOMATİK türetilir. Böylece "preset seçilince tüm
 * token'lar otomatik oluşur" (ADR-087). Katmanlar `{ref}` ile bağlanır →
 * component asla ham renk bilmez.
 */

export const DEFAULT_TYPOGRAPHY: DesignTokens["typography"] = {
  headingFont:
    'var(--font-serif-face), "Iowan Old Style", "Palatino Linotype", Georgia, "Times New Roman", serif',
  bodyFont:
    'var(--font-sans-face), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  monoFont:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  headingScale: 1.25,
  baseSize: "16px",
  letterSpacing: "0em",
  lineHeight: 1.6,
  weightRegular: 400,
  weightMedium: 500,
  weightSemibold: 600,
  weightBold: 700,
};

export const DEFAULT_RADIUS: DesignTokens["radius"] = {
  none: "0px",
  xs: "1px",
  sm: "2px",
  md: "4px",
  lg: "8px",
  xl: "12px",
  "2xl": "16px",
  full: "9999px",
};

export const DEFAULT_SHADOW: DesignTokens["shadow"] = {
  none: "none",
  xs: "0 1px 1px 0 rgb(23 20 15 / 0.03)",
  sm: "0 1px 2px 0 rgb(23 20 15 / 0.05)",
  md: "0 20px 48px -28px rgb(23 20 15 / 0.28)",
  lg: "0 30px 60px -30px rgb(23 20 15 / 0.35)",
  xl: "0 40px 80px -32px rgb(23 20 15 / 0.42)",
  "2xl": "0 50px 100px -36px rgb(23 20 15 / 0.5)",
};

export const DEFAULT_MOTION: DesignTokens["motion"] = {
  durationFast: "150ms",
  durationNormal: "250ms",
  durationSlow: "400ms",
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  hoverScale: "1.02",
  hoverOpacity: "0.85",
};

export const DEFAULT_LAYOUT: DesignTokens["layout"] = {
  containerWidth: "1440px",
  gridGap: "24px",
  sectionSpacing: "96px",
  cardSpacing: "16px",
  contentMaxWidth: "768px",
};

export const DEFAULT_ZINDEX: DesignTokens["zIndex"] = {
  navbar: 40,
  drawer: 50,
  modal: 60,
  popover: 70,
  tooltip: 80,
};

export const DEFAULT_BREAKPOINTS: DesignTokens["breakpoints"] = {
  desktop: "1280px",
  tablet: "768px",
  mobile: "375px",
};

/**
 * Paylaşılan SEMANTIC katman. Değerler primitive'lere `{ref}` ile bağlanır.
 * `primaryContrast` (aksan üstü metin) somut verilir — ters kontrast preset'e
 * göre değişebildiğinden.
 */
export function buildSemanticDefaults(primaryContrast: string): SemanticTokens {
  return {
    // Yüzey anlamları
    "page.background": "{surface.background}",
    "page.surface": "{surface.surface}",
    "page.surfaceMuted": "{surface.surfaceMuted}",
    "page.elevated": "{surface.surfaceElevated}",
    "page.overlay": "{surface.overlay}",
    // İçerik (metin) anlamları
    "content.primary": "{text.primary}",
    "content.secondary": "{text.secondary}",
    "content.muted": "{text.muted}",
    "content.inverse": "{text.inverse}",
    "content.link": "{text.link}",
    // Çizgi anlamları
    "line.default": "{border.default}",
    "line.subtle": "{border.subtle}",
    "line.strong": "{border.strong}",
    "line.focus": "{border.focus}",
    // Aksiyon (etkileşim) anlamları
    "action.primary": "{brand.primary}",
    "action.primaryHover": "{brand.secondary}",
    "action.primaryActive": "{brand.secondary}",
    "action.primaryContrast": primaryContrast,
    "action.secondary": "{brand.secondary}",
    "action.accent": "{brand.accent}",
    "action.tertiary": "{brand.tertiary}",
    // Durum (feedback) anlamları
    "status.success": "{feedback.success}",
    "status.warning": "{feedback.warning}",
    "status.error": "{feedback.error}",
    "status.info": "{feedback.info}",
  };
}

/**
 * Paylaşılan COMPONENT katmanı. Her bileşen kendi token setini SEMANTIC'e
 * `{ref}` ile bağlar. `variant` alanı seçili görsel varyantı taşır (bkz.
 * variants.ts). Bir bileşen asla primitive'e doğrudan bağlanmaz.
 */
export function buildComponentDefaults(): ComponentTokens {
  return {
    button: {
      variant: "filled",
      tokens: {
        bg: "{action.primary}",
        fg: "{action.primaryContrast}",
        bgHover: "{action.primaryHover}",
        bgActive: "{action.primaryActive}",
        border: "{action.primary}",
        radius: "{radius.md}",
        focusRing: "{line.focus}",
      },
    },
    card: {
      variant: "elevated",
      tokens: {
        bg: "{page.surface}",
        fg: "{content.primary}",
        border: "{line.default}",
        radius: "{radius.md}",
        shadow: "{shadow.md}",
      },
    },
    badge: {
      variant: "soft",
      tokens: {
        bg: "{page.surfaceMuted}",
        fg: "{content.secondary}",
        border: "{line.default}",
        radius: "{radius.sm}",
      },
    },
    input: {
      variant: "outline",
      tokens: {
        bg: "{page.surface}",
        fg: "{content.primary}",
        placeholder: "{content.muted}",
        border: "{line.default}",
        borderFocus: "{line.focus}",
        radius: "{radius.md}",
      },
    },
    navbar: {
      variant: "solid",
      tokens: {
        bg: "{page.background}",
        fg: "{content.primary}",
        border: "{line.default}",
      },
    },
    footer: {
      variant: "solid",
      tokens: {
        bg: "{page.background}",
        fg: "{content.secondary}",
        border: "{line.default}",
      },
    },
    hero: {
      variant: "full",
      tokens: {
        bg: "{page.surface}",
        fg: "{content.primary}",
        overlay: "{page.overlay}",
        ctaBg: "{action.primary}",
        ctaFg: "{action.primaryContrast}",
      },
    },
    productCard: {
      variant: "comfortable",
      tokens: {
        bg: "{page.surface}",
        fg: "{content.primary}",
        border: "{line.default}",
        radius: "{radius.md}",
        price: "{content.primary}",
        shadow: "{shadow.sm}",
      },
    },
    categoryCard: {
      variant: "comfortable",
      tokens: {
        bg: "{page.surfaceMuted}",
        fg: "{content.primary}",
        border: "{line.default}",
        radius: "{radius.md}",
      },
    },
    sectionTitle: {
      variant: "editorial",
      tokens: {
        color: "{content.primary}",
        eyebrow: "{content.muted}",
        accent: "{action.accent}",
      },
    },
    modal: {
      variant: "elevated",
      tokens: {
        bg: "{page.surface}",
        fg: "{content.primary}",
        overlay: "{page.overlay}",
        radius: "{radius.lg}",
        shadow: "{shadow.xl}",
      },
    },
    drawer: {
      variant: "solid",
      tokens: {
        bg: "{page.surface}",
        fg: "{content.primary}",
        overlay: "{page.overlay}",
        shadow: "{shadow.xl}",
      },
    },
    toast: {
      variant: "solid",
      tokens: {
        bg: "{content.primary}",
        fg: "{content.inverse}",
        radius: "{radius.md}",
        shadow: "{shadow.lg}",
      },
    },
    pagination: {
      variant: "soft",
      tokens: {
        fg: "{content.secondary}",
        activeBg: "{action.primary}",
        activeFg: "{action.primaryContrast}",
        radius: "{radius.sm}",
      },
    },
    breadcrumb: {
      variant: "minimal",
      tokens: {
        fg: "{content.muted}",
        activeFg: "{content.primary}",
        separator: "{content.muted}",
      },
    },
    filterChip: {
      variant: "soft",
      tokens: {
        bg: "{page.surfaceMuted}",
        fg: "{content.secondary}",
        border: "{line.default}",
        activeBg: "{action.primary}",
        activeFg: "{action.primaryContrast}",
        radius: "{radius.full}",
      },
    },
  };
}

export interface BuildThemeInput {
  name: string;
  basePreset?: string;
  colorScheme?: "light" | "dark";
  brand: DesignTokens["brand"];
  surface: DesignTokens["surface"];
  text: DesignTokens["text"];
  border: DesignTokens["border"];
  feedback: DesignTokens["feedback"];
  typography?: Partial<DesignTokens["typography"]>;
  radius?: Partial<DesignTokens["radius"]>;
  shadow?: Partial<DesignTokens["shadow"]>;
  motion?: Partial<DesignTokens["motion"]>;
  layout?: Partial<DesignTokens["layout"]>;
  zIndex?: Partial<DesignTokens["zIndex"]>;
  breakpoints?: Partial<DesignTokens["breakpoints"]>;
  /** Aksan üstü metin rengi (action.primaryContrast). Varsayılan beyaz. */
  primaryContrast?: string;
  /** Semantic katman üstüne yamalar (nadir; ör. default aktif aksan tonu). */
  semanticOverrides?: SemanticTokens;
  /** Component katman üstüne yamalar (variant seçimi vb.). */
  componentOverrides?: ComponentTokens;
  assets?: ThemeAssets;
  customCss?: string;
}

/**
 * Tam, doğrulanabilir bir {@link ThemeDocument} kurar. Primitive paletini alır,
 * ölçek varsayılanlarını doldurur, semantic + component katmanlarını türetir.
 */
export function buildThemeDocument(input: BuildThemeInput): ThemeDocument {
  const semantic = {
    ...buildSemanticDefaults(input.primaryContrast ?? "#ffffff"),
    ...(input.semanticOverrides ?? {}),
  };
  const components = mergeComponents(buildComponentDefaults(), input.componentOverrides);

  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    meta: {
      name: input.name,
      basePreset: input.basePreset,
      colorScheme: input.colorScheme ?? "light",
    },
    tokens: {
      brand: input.brand,
      surface: input.surface,
      text: input.text,
      border: input.border,
      feedback: input.feedback,
      typography: { ...DEFAULT_TYPOGRAPHY, ...(input.typography ?? {}) } as DesignTokens["typography"],
      radius: { ...DEFAULT_RADIUS, ...(input.radius ?? {}) } as DesignTokens["radius"],
      shadow: { ...DEFAULT_SHADOW, ...(input.shadow ?? {}) } as DesignTokens["shadow"],
      motion: { ...DEFAULT_MOTION, ...(input.motion ?? {}) } as DesignTokens["motion"],
      layout: { ...DEFAULT_LAYOUT, ...(input.layout ?? {}) } as DesignTokens["layout"],
      zIndex: { ...DEFAULT_ZINDEX, ...(input.zIndex ?? {}) } as DesignTokens["zIndex"],
      breakpoints: { ...DEFAULT_BREAKPOINTS, ...(input.breakpoints ?? {}) } as DesignTokens["breakpoints"],
    },
    semantic,
    components,
    assets: input.assets ?? {},
    ...(input.customCss ? { customCss: input.customCss } : {}),
  };
}

function mergeComponents(
  base: ComponentTokens,
  override: ComponentTokens | undefined,
): ComponentTokens {
  if (!override) return base;
  const result: ComponentTokens = { ...base };
  for (const [name, set] of Object.entries(override)) {
    const existing = result[name];
    result[name] = {
      variant: set.variant ?? existing?.variant,
      tokens: { ...(existing?.tokens ?? {}), ...set.tokens },
    };
  }
  return result;
}
