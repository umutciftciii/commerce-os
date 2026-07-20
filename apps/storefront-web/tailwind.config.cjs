const preset = require("../../packages/ui/tailwind-preset.cjs");

/**
 * Vitrin (storefront) Tailwind yapilandirmasi.
 *
 * Paylasilan @commerce-os/ui preset'i temel kalir (brand/slate/canvas, golge
 * skalasi) — store-admin ile ORTAK oldugu icin ona DOKUNULMAZ. Bunun uzerine
 * vitrine-ozel, TEMA-EDILEBILIR semantik token katmani eklenir: renk/font/radius
 * degerleri globals.css'teki CSS custom property'lere (`var(--...)`) baglanir,
 * boylece `[data-theme]` ile override edilebilir (bkz. globals.css).
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  presets: [preset],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        surface: {
          DEFAULT: "var(--surface)",
          muted: "var(--surface-muted)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          muted: "var(--ink-muted)",
          subtle: "var(--ink-subtle)",
        },
        line: {
          DEFAULT: "var(--line)",
          strong: "var(--line-strong)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          ink: "var(--accent-ink)",
          contrast: "var(--accent-contrast)",
        },
      },
      fontFamily: {
        sans: "var(--font-sans)",
        serif: "var(--font-serif)",
      },
      borderRadius: {
        none: "var(--radius-none)",
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-md)",
        md: "var(--radius-md)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      letterSpacing: {
        // Buyuk baslik / eyebrow icin premium genis kerning.
        luxe: "0.2em",
        wideish: "0.08em",
      },
      maxWidth: {
        // Disiplinli genis grid kabi (premium vitrin).
        grid: "1440px",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
};
