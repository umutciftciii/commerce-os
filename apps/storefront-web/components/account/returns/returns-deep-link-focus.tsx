"use client";

import { useEffect } from "react";

/**
 * BUG-RETURN-DEEPLINK — Sipariş detayındaki "#returns" (veya "#return-<no>") derin bağlantısı için
 * erişilebilir odak davranışı. Sunucu bileşeni hook kullanamadığından ayrı client island:
 *
 *  - Mount'ta (refresh sonrası dahil) ve `hashchange`'te hedefi bulur, görünür alana kaydırır ve
 *    erişilebilir başlığa (region) odağı taşır → ekran okuyucu bölümü duyurur, klavye odağı görünür.
 *  - Sticky header altında gizlenmesin diye hedeflerde `scroll-mt-*` var (CSS scroll-margin).
 *  - `prefers-reduced-motion` saygılıdır (ani kaydırma).
 *  - History'e dokunmaz (yalnız focus/scroll) → browser back bozulmaz.
 */
export function ReturnsDeepLinkFocus() {
  useEffect(() => {
    const focusFromHash = () => {
      const hash = window.location.hash;
      if (!hash) return;
      let target: HTMLElement | null = null;
      if (hash === "#returns") {
        target = document.getElementById("returns");
      } else if (hash.startsWith("#return-")) {
        // Belirli bir iade kartı hedeflendiyse onu, yoksa bölümü kullan.
        target = document.getElementById(hash.slice(1)) ?? document.getElementById("returns");
      }
      if (!target) return;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      // Odağı erişilebilir başlığa taşı (yoksa hedefin kendisine). preventScroll → çift kaydırma yok.
      const heading = target.querySelector<HTMLElement>("[data-returns-heading]") ?? target;
      heading.focus({ preventScroll: true });
    };
    // Layout otursun diye bir frame bekle (SSR hydration + sticky header ölçümü).
    const raf = requestAnimationFrame(focusFromHash);
    window.addEventListener("hashchange", focusFromHash);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", focusFromHash);
    };
  }, []);
  return null;
}
