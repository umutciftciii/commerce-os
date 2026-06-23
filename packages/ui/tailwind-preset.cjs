/**
 * commerce-os frontend'leri icin paylasimli Tailwind preset.
 *
 * Gorsel ton: light-first, premium, sakin kurumsal SaaS. Tek olculu marka
 * vurgusu (indigo), notr slate yuzeyler, yumusak katmanli golgeler. Dark theme
 * yok, neon yok, agir gradient yok.
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        // Olculu indigo marka vurgusu. Birincil aksiyonlar ve aktif durumlar icin.
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        // Uygulama tuvali: notr slate yerine cok hafif sicaklik tasiyan kirik beyaz.
        canvas: {
          DEFAULT: "#f7f8fa",
          subtle: "#fbfcfd",
          panel: "#ffffff",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        // Katmanli, dusuk yogunluklu golge skalasi (premium, agir degil).
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.05)",
        "card-hover":
          "0 2px 4px -1px rgb(15 23 42 / 0.06), 0 8px 16px -4px rgb(15 23 42 / 0.10)",
        panel: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 12px 24px -12px rgb(15 23 42 / 0.12)",
        sidebar: "inset -1px 0 0 0 rgb(15 23 42 / 0.06)",
      },
      letterSpacing: {
        tightish: "-0.011em",
      },
    },
  },
};
