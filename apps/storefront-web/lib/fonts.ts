import { Inter, Playfair_Display } from "next/font/google";

/**
 * Vitrin tipografi kaynagi (ADIM 1 — Design System).
 *
 * Premium/editoryel hiyerarsi: ince-orta agirlikta sans (Inter) govde metni +
 * yuksek kontrastli ince serif (Playfair Display) buyuk basliklar icin.
 *
 * Fontlar `next/font/google` ile BUILD sirasinda indirilip cikti icine SELF-HOST
 * edilir; runtime'da harici istek YOKTUR (CSP/gizlilik dostu). Turkce icin
 * `latin-ext` subset'i sart (s/g/i/I/c/o/u glifleri).
 *
 * Her iki font da yalnizca birer CSS degiskeni (`--font-sans-face`,
 * `--font-serif-face`) tanimlar; SEMANTIK ve TEMA-EDILEBILIR `--font-sans` /
 * `--font-serif` bunlarin uzerine globals.css'te kurulur (bkz. `[data-theme]`).
 * Boylece per-store tema font ailesini de override edebilir (hardcoded degil).
 */
export const fontSans = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-sans-face",
});

export const fontSerif = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-serif-face",
});

/** `<html>` uzerine uygulanacak birlesik font-degisken class'i. */
export const fontVariables = `${fontSans.variable} ${fontSerif.variable}`;
