/**
 * commerce-os frontend'leri icin paylasimli Tailwind preset.
 *
 * Gorsel ton: light-first, premium, sakin kurumsal SaaS. Tek olculu marka
 * vurgusu (menekse / amethyst), notr slate yuzeyler, yumusak katmanli golgeler.
 * Dark theme yok, neon yok, agir gradient yok.
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        // Olculu menekse marka vurgusu (anchor: brand-600 = #9743CD / rgb(151 67 205)).
        // Yalnizca birincil aksiyonlar, aktif durumlar ve accent rozetleri icin; govde
        // metni ve genis yuzeyler notr slate kalir. brand-600 uzerine beyaz metin ~5.3:1
        // (AA gecer), text-brand-700 beyaz uzerinde ~7:1.
        brand: {
          50: "#f8f2fc",
          100: "#f0e1f9",
          200: "#e1c4f1",
          300: "#cb9ee7",
          400: "#b375db",
          500: "#a154d3",
          600: "#9743cd",
          700: "#7e34ac",
          800: "#672b8b",
          900: "#4f226d",
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
