"use client";

/**
 * Focus-trap hook (D1, client). Saf cekirdek `./focus-trap` icindedir; bu dosya
 * onu gercek DOM'a baglar: acilista ilk uygun elemani odaklar, Tab dongusunu
 * kapsayici icinde tutar, kapaninca odaki tetikleyiciye geri dondurur.
 */

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { computeTrapFocusIndex, FOCUSABLE_SELECTOR } from "./focus-trap";

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Bir diyalog kapsayicisina focus-trap davranisi ekler. `active` true oldugunda:
 *  - o anki odaki (tetikleyici) hatirlar,
 *  - `initialFocusRef` ya da ilk odaklanabilir elemani (yoksa kapsayiciyi) odaklar,
 *  - Tab dongusunu kapsayici icinde tutar,
 *  - kapaninca odaki tetikleyiciye geri dondurur.
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Acan elemani (tetikleyici) hatirla — kapaninca odagi buraya dondurecegiz.
    triggerRef.current = (document.activeElement as HTMLElement | null) ?? null;

    // Acilista ilk uygun elemani odakla.
    const focusables = focusableWithin(container);
    const initial = initialFocusRef?.current ?? focusables[0] ?? container;
    initial.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const els = focusableWithin(container as HTMLElement);
      if (els.length === 0) {
        // Odaklanabilir eleman yoksa odak kapsayicida kalsin.
        event.preventDefault();
        (container as HTMLElement).focus();
        return;
      }
      const activeIndex = els.indexOf(document.activeElement as HTMLElement);
      const target = computeTrapFocusIndex(els.length, activeIndex, event.shiftKey);
      if (target !== null) {
        event.preventDefault();
        els[target].focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Odagi tetikleyiciye geri dondur (hala DOM'da ve odaklanabilirse).
      const trigger = triggerRef.current;
      if (trigger && typeof trigger.focus === "function" && document.contains(trigger)) {
        trigger.focus();
      }
    };
  }, [active, containerRef, initialFocusRef]);
}
