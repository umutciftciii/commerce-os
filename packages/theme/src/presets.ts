import { buildThemeDocument, type BuildThemeInput } from "./build.js";
import type { ThemeDocument } from "./schema.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Theme Presets (ADR-087)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Her preset yalnız primitive paleti + birkaç ölçek override'ı verir; tam belge
 * `buildThemeDocument` ile (semantic + component katmanları OTOMATİK) kurulur.
 *
 * `DEFAULT_THEME_DOCUMENT` vitrinin BUGÜNKÜ görünümünü (globals.css) BİREBİR
 * üretir → yapılandırılmamış/temasız mağaza görsel olarak değişmez (geriye
 * uyumluluk). Diğer 10 preset seed ile birlikte gelir.
 *
 * NOT: Preset'lerin serif/sans seçimi bugün paketli Inter/Playfair yüzlerini
 * kullanır; başka font aileleri için @font-face yükleme ayrı bir iş kalemidir
 * (bkz. TECHNICAL_DEBT — Theme Engine font yükleme).
 */

const LIGHT_FEEDBACK: BuildThemeInput["feedback"] = {
  success: "#1f7a4d",
  warning: "#b7791f",
  error: "#c0392b",
  info: "#2b6cb0",
};

const DARK_FEEDBACK: BuildThemeInput["feedback"] = {
  success: "#34d399",
  warning: "#fbbf24",
  error: "#f87171",
  info: "#60a5fa",
};

/**
 * VARSAYILAN TEMA — globals.css `[data-theme="default"]` ile parite. Bu belgeden
 * üretilen storefront uyum varları globals.css değerlerini birebir verir.
 */
export const DEFAULT_THEME_DOCUMENT: ThemeDocument = buildThemeDocument({
  name: "Varsayılan",
  colorScheme: "light",
  brand: { primary: "#735389", secondary: "#5a4570", accent: "#735389", tertiary: "#9a948a" },
  surface: {
    background: "#f7f6f3",
    surface: "#ffffff",
    surfaceMuted: "#f1efea",
    surfaceElevated: "#ffffff",
    overlay: "rgb(23 20 15 / 0.5)",
  },
  text: {
    primary: "#17140f",
    secondary: "#6d685f",
    muted: "#9a948a",
    inverse: "#f7f6f3",
    link: "#735389",
  },
  border: { default: "#e6e2da", subtle: "#f1efea", strong: "#d0cbc1", focus: "#735389" },
  feedback: LIGHT_FEEDBACK,
});

// Sans başlık kullanan preset'ler için başlık ailesini gövde stack'ine bağlar.
const SANS_HEADING = DEFAULT_THEME_DOCUMENT.tokens.typography.bodyFont;

export interface ThemePresetMeta {
  id: string;
  name: string;
  description: string;
  document: ThemeDocument;
}

function preset(
  id: string,
  name: string,
  description: string,
  input: Omit<BuildThemeInput, "name" | "basePreset">,
): ThemePresetMeta {
  return {
    id,
    name,
    description,
    document: buildThemeDocument({ ...input, name, basePreset: id }),
  };
}

export const THEME_PRESETS: ThemePresetMeta[] = [
  preset("classic", "Classic", "Zamansız lacivert + altın, krem zemin, serif başlık.", {
    colorScheme: "light",
    brand: { primary: "#1f3a5f", secondary: "#16293f", accent: "#b8860b", tertiary: "#8a8a8a" },
    surface: {
      background: "#faf8f4",
      surface: "#ffffff",
      surfaceMuted: "#f2ede4",
      surfaceElevated: "#ffffff",
      overlay: "rgb(20 25 35 / 0.5)",
    },
    text: {
      primary: "#1a2230",
      secondary: "#4a5568",
      muted: "#94a3b8",
      inverse: "#faf8f4",
      link: "#1f3a5f",
    },
    border: { default: "#e4ddd0", subtle: "#f2ede4", strong: "#cdc3b0", focus: "#1f3a5f" },
    feedback: LIGHT_FEEDBACK,
  }),

  preset("modern", "Modern", "Temiz indigo, geometrik, yumuşak yuvarlaklık, sans başlık.", {
    colorScheme: "light",
    brand: { primary: "#4f46e5", secondary: "#4338ca", accent: "#06b6d4", tertiary: "#64748b" },
    surface: {
      background: "#ffffff",
      surface: "#ffffff",
      surfaceMuted: "#f8fafc",
      surfaceElevated: "#ffffff",
      overlay: "rgb(15 23 42 / 0.5)",
    },
    text: {
      primary: "#0f172a",
      secondary: "#475569",
      muted: "#94a3b8",
      inverse: "#ffffff",
      link: "#4f46e5",
    },
    border: { default: "#e2e8f0", subtle: "#f1f5f9", strong: "#cbd5e1", focus: "#4f46e5" },
    feedback: LIGHT_FEEDBACK,
    typography: { headingFont: SANS_HEADING, headingScale: 1.2 },
    radius: { sm: "6px", md: "8px", lg: "12px", xl: "16px", "2xl": "24px" },
  }),

  preset("luxury", "Luxury", "Siyah & altın, keskin köşeler, geniş kerning, serif başlık.", {
    colorScheme: "light",
    brand: { primary: "#0a0a0a", secondary: "#000000", accent: "#c8a04a", tertiary: "#8c7b5a" },
    surface: {
      background: "#ffffff",
      surface: "#fbfbf9",
      surfaceMuted: "#f4f2ec",
      surfaceElevated: "#ffffff",
      overlay: "rgb(0 0 0 / 0.55)",
    },
    text: {
      primary: "#0a0a0a",
      secondary: "#4a4a4a",
      muted: "#9a9a9a",
      inverse: "#ffffff",
      link: "#0a0a0a",
    },
    border: { default: "#e8e5dd", subtle: "#f4f2ec", strong: "#cfc9bb", focus: "#c8a04a" },
    feedback: LIGHT_FEEDBACK,
    typography: { letterSpacing: "0.02em" },
    radius: { xs: "0px", sm: "0px", md: "0px", lg: "0px", xl: "0px", "2xl": "0px" },
  }),

  preset("fashion", "Fashion", "Cesur monokrom + neon fuşya aksan, sans başlık.", {
    colorScheme: "light",
    brand: { primary: "#111111", secondary: "#000000", accent: "#ff2d6f", tertiary: "#777777" },
    surface: {
      background: "#ffffff",
      surface: "#ffffff",
      surfaceMuted: "#f5f5f5",
      surfaceElevated: "#ffffff",
      overlay: "rgb(0 0 0 / 0.5)",
    },
    text: {
      primary: "#111111",
      secondary: "#555555",
      muted: "#999999",
      inverse: "#ffffff",
      link: "#ff2d6f",
    },
    border: { default: "#eaeaea", subtle: "#f5f5f5", strong: "#cccccc", focus: "#111111" },
    feedback: LIGHT_FEEDBACK,
    typography: { headingFont: SANS_HEADING, letterSpacing: "0.01em" },
    radius: { sm: "2px", md: "2px", lg: "4px", xl: "6px", "2xl": "8px" },
  }),

  preset("electronics", "Electronics", "Teknoloji mavisi, enerjik, açık gri zemin, sans başlık.", {
    colorScheme: "light",
    brand: { primary: "#0066ff", secondary: "#0052cc", accent: "#00d1b2", tertiary: "#64748b" },
    surface: {
      background: "#f5f7fa",
      surface: "#ffffff",
      surfaceMuted: "#eef2f7",
      surfaceElevated: "#ffffff",
      overlay: "rgb(11 18 32 / 0.5)",
    },
    text: {
      primary: "#0b1220",
      secondary: "#475569",
      muted: "#94a3b8",
      inverse: "#ffffff",
      link: "#0066ff",
    },
    border: { default: "#dbe3ec", subtle: "#eef2f7", strong: "#c3cedb", focus: "#0066ff" },
    feedback: LIGHT_FEEDBACK,
    typography: { headingFont: SANS_HEADING },
    radius: { sm: "4px", md: "6px", lg: "10px", xl: "14px", "2xl": "20px" },
  }),

  preset("minimal", "Minimal", "Gri tonlu, ferah, sade; büyük boşluk, sans başlık.", {
    colorScheme: "light",
    brand: { primary: "#111827", secondary: "#000000", accent: "#111827", tertiary: "#9ca3af" },
    surface: {
      background: "#ffffff",
      surface: "#ffffff",
      surfaceMuted: "#f9fafb",
      surfaceElevated: "#ffffff",
      overlay: "rgb(17 24 39 / 0.45)",
    },
    text: {
      primary: "#111827",
      secondary: "#6b7280",
      muted: "#9ca3af",
      inverse: "#ffffff",
      link: "#111827",
    },
    border: { default: "#f0f0f0", subtle: "#f9fafb", strong: "#e5e7eb", focus: "#111827" },
    feedback: LIGHT_FEEDBACK,
    typography: { headingFont: SANS_HEADING, letterSpacing: "0em" },
    radius: { sm: "2px", md: "4px", lg: "6px", xl: "8px", "2xl": "12px" },
    layout: { sectionSpacing: "128px", gridGap: "32px" },
  }),

  preset("dark-luxury", "Dark Luxury", "Koyu mod, altın aksan, sinematik yüzeyler.", {
    colorScheme: "dark",
    brand: { primary: "#d4af37", secondary: "#b8942b", accent: "#d4af37", tertiary: "#6b6252" },
    surface: {
      background: "#0c0c0e",
      surface: "#141417",
      surfaceMuted: "#1c1c20",
      surfaceElevated: "#202024",
      overlay: "rgb(0 0 0 / 0.6)",
    },
    text: {
      primary: "#f5f3ec",
      secondary: "#b9b4a6",
      muted: "#7c776b",
      inverse: "#0c0c0e",
      link: "#d4af37",
    },
    border: { default: "#2a2a30", subtle: "#202024", strong: "#3a3a42", focus: "#d4af37" },
    feedback: DARK_FEEDBACK,
    primaryContrast: "#0c0c0e",
    typography: { letterSpacing: "0.02em" },
    radius: { xs: "0px", sm: "0px", md: "0px", lg: "0px", xl: "0px", "2xl": "0px" },
  }),

  preset("natural", "Natural", "Organik yeşil + toprak tonu, kırık-beyaz, serif başlık.", {
    colorScheme: "light",
    brand: { primary: "#4b7f52", secondary: "#3a6640", accent: "#c98a3b", tertiary: "#8d9b7e" },
    surface: {
      background: "#f6f4ee",
      surface: "#ffffff",
      surfaceMuted: "#eceadf",
      surfaceElevated: "#ffffff",
      overlay: "rgb(35 41 31 / 0.5)",
    },
    text: {
      primary: "#23291f",
      secondary: "#586154",
      muted: "#9aa190",
      inverse: "#f6f4ee",
      link: "#4b7f52",
    },
    border: { default: "#e2ded0", subtle: "#eceadf", strong: "#cdc7b3", focus: "#4b7f52" },
    feedback: LIGHT_FEEDBACK,
    radius: { sm: "4px", md: "8px", lg: "14px", xl: "20px", "2xl": "28px" },
  }),

  preset("beauty", "Beauty", "Yumuşak gül/mor, zarif, açık pembe zemin, serif başlık.", {
    colorScheme: "light",
    brand: { primary: "#b05c7a", secondary: "#94465f", accent: "#d9a7b0", tertiary: "#a98a94" },
    surface: {
      background: "#fdf7f8",
      surface: "#ffffff",
      surfaceMuted: "#f8edf0",
      surfaceElevated: "#ffffff",
      overlay: "rgb(58 40 49 / 0.5)",
    },
    text: {
      primary: "#3a2831",
      secondary: "#6d5560",
      muted: "#a98a94",
      inverse: "#fdf7f8",
      link: "#b05c7a",
    },
    border: { default: "#f0dfe4", subtle: "#f8edf0", strong: "#e2c6ce", focus: "#b05c7a" },
    feedback: LIGHT_FEEDBACK,
    radius: { sm: "6px", md: "10px", lg: "16px", xl: "24px", "2xl": "32px" },
  }),

  preset("sports", "Sports", "Enerjik kırmızı/siyah, cesur, sans başlık.", {
    colorScheme: "light",
    brand: { primary: "#e63329", secondary: "#c21f16", accent: "#111111", tertiary: "#6b7280" },
    surface: {
      background: "#ffffff",
      surface: "#ffffff",
      surfaceMuted: "#f4f5f6",
      surfaceElevated: "#ffffff",
      overlay: "rgb(16 20 24 / 0.55)",
    },
    text: {
      primary: "#101418",
      secondary: "#4b5563",
      muted: "#9aa1ab",
      inverse: "#ffffff",
      link: "#e63329",
    },
    border: { default: "#e4e7ea", subtle: "#f4f5f6", strong: "#c9cfd6", focus: "#e63329" },
    feedback: LIGHT_FEEDBACK,
    typography: { headingFont: SANS_HEADING, letterSpacing: "0.01em" },
    radius: { sm: "2px", md: "4px", lg: "6px", xl: "8px", "2xl": "10px" },
  }),
];

export const THEME_PRESET_IDS = THEME_PRESETS.map((p) => p.id);

export function getPreset(id: string): ThemePresetMeta | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}
