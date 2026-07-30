"use client";

import { useEffect } from "react";

/**
 * TODO-164B (ADR-237) — Preview Highlight. Store Admin "Marka ve Görünüm" builder'ı,
 * seçili ayarın vitrindeki bölgesini göstermek için bu preview iframe'ine
 * `postMessage({ type: "cos-theme-highlight", target })` gönderir. Bu bileşen mesajı
 * dinler ve ilgili elemanları kısa süre outline ile vurgular. YALNIZ preview
 * bağlamında (draft cookie varken) mount edilir → production vitrini etkilenmez.
 *
 * Güvenlik: yalnız bilinen mesaj tipini işler; DOM'a HTML enjekte etmez, yalnız
 * geçici outline stili uygular (kaldırılır).
 */

type Target = { kind: "css-var" | "slot" | "asset"; value: string };

// Hedef → vurgulanacak seçici(ler). css-var / slot / asset için makul eşleşmeler.
function selectorsFor(target: Target): string[] {
  if (target.kind === "slot") {
    switch (target.value) {
      case "header":
        return ["header"];
      case "footer":
        return ["footer"];
      case "productCard":
      case "productListingLayout":
        return ["[data-slot-product-card]", "article a[href*='/products/']", "main article"];
      case "productDetailLayout":
        return ["main"];
      case "hero":
      case "homeSectionFrame":
        return ["[data-hero]", "section:first-of-type"];
      case "mobileNavigation":
        return ["header"];
      case "layoutPreset":
        return ["body > div", "main"];
      default:
        return [];
    }
  }
  if (target.kind === "asset") {
    return ["header img", "header a[href='/']"];
  }
  // css-var → tipik tüketiciler.
  switch (target.value) {
    case "--accent":
      return ["[data-cos-cta]", "button", "a[href*='cart']", "header a"];
    case "--paper":
      return ["body"];
    case "--surface":
      return ["article", "[data-slot-product-card]", "main section"];
    case "--surface-muted":
      return ["footer", "main section:nth-of-type(2)"];
    case "--ink":
      return ["h1", "h2", "h3", "main p"];
    case "--ink-muted":
      return ["main p", "small"];
    case "--line":
    case "--line-strong":
      return ["article", "hr", "input"];
    case "--font-serif":
      return ["h1", "h2", "h3"];
    case "--font-sans":
      return ["p", "button", "nav"];
    default:
      return [];
  }
}

const HL_CLASS = "cos-theme-hl";

export function ThemePreviewHighlight() {
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `.${HL_CLASS}{outline:3px solid #7c3aed !important;outline-offset:2px !important;transition:outline-color .2s ease;border-radius:4px;}`;
    document.head.appendChild(style);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      document.querySelectorAll(`.${HL_CLASS}`).forEach((el) => el.classList.remove(HL_CLASS));
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; target?: Target } | null;
      if (!data || data.type !== "cos-theme-highlight" || !data.target) return;
      const target = data.target;
      if (target.kind !== "css-var" && target.kind !== "slot" && target.kind !== "asset") return;
      clear();
      const selectors = selectorsFor(target);
      let count = 0;
      for (const sel of selectors) {
        try {
          document.querySelectorAll(sel).forEach((el) => {
            if (count < 40) {
              el.classList.add(HL_CLASS);
              count += 1;
            }
          });
        } catch {
          /* geçersiz seçici — atla */
        }
      }
      if (count > 0) {
        const first = document.querySelector(`.${HL_CLASS}`);
        first?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(clear, 1600);
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (timer) clearTimeout(timer);
      clear();
      style.remove();
    };
  }, []);

  return null;
}
