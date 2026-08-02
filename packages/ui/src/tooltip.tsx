"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { computeTooltipPosition, type TooltipPosition, type TooltipSide } from "./tooltip-position";

export interface TooltipProps {
  /** Ipucu icerigi (kisa metin veya kucuk dugum). */
  label: ReactNode;
  /** Tek etkilesimli tetikleyici (buton/link/ikon). aria-describedby buna baglanir. */
  children: ReactElement;
  /** Tercih edilen kenar; sigmadiginda otomatik ters cevrilir. */
  side?: TooltipSide;
  /** Ipucu yuzeyini app'e gore biçimlendirmek icin ek sinif. */
  className?: string;
  /**
   * Varsayilan koyu yuzeyi kapatir; cagiran taraf yuzeyi tamamen `className` ile
   * verir (or. store-admin koyu-glass tokenlari). `cn` twMerge olmadigi icin
   * bg/renk cakismasini onlemenin guvenli yolu.
   */
  unstyled?: boolean;
  /** Acilma gecikmesi (ms) — istem disi flicker'i azaltir. */
  openDelay?: number;
}

const SURFACE =
  "max-w-xs rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium leading-snug text-white shadow-lg";

/**
 * Erisilebilir, PORTAL'li ipucu. `document.body`'ye render edilir; boylece
 * overflow/sticky/tablo stacking-context'lerinden bagimsizdir ve kirpilmaz.
 * Hover VE klavye focus'unda acilir, ESC ile kapanir; viewport carpismasinda
 * yon degistirir; en ust katmanda (z-tooltip) durur.
 */
export function Tooltip({
  label,
  children,
  side = "top",
  className,
  unstyled = false,
  openDelay = 80,
}: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<TooltipPosition | null>(null);
  const tooltipId = useId();

  useEffect(() => setMounted(true), []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(true), openDelay);
  }, [clearTimer, openDelay]);

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
    setPos(null);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip) return;
    const a = anchor.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    setPos(
      computeTooltipPosition(
        { top: a.top, left: a.left, width: a.width, height: a.height },
        { width: t.width, height: t.height },
        { width: window.innerWidth, height: window.innerHeight },
        side,
      ),
    );
  }, [side]);

  // Acildiktan sonra olc + konumlandir; scroll/resize'da yeniden hesapla.
  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const onChange = () => reposition();
    window.addEventListener("scroll", onChange, true);
    window.addEventListener("resize", onChange);
    return () => {
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("resize", onChange);
    };
  }, [open, reposition]);

  if (!isValidElement(children)) return children;

  const describedChild = cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, {
    "aria-describedby": open
      ? tooltipId
      : (children.props as { "aria-describedby"?: string })["aria-describedby"],
  });

  return (
    <span
      ref={anchorRef}
      className="inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === "Escape") hide();
      }}
    >
      {describedChild}
      {mounted && open
        ? createPortal(
            <div
              ref={tipRef}
              id={tooltipId}
              role="tooltip"
              data-side={pos?.side ?? side}
              className={cn(
                "pointer-events-none fixed z-tooltip",
                unstyled ? undefined : SURFACE,
                className,
              )}
              style={{
                top: pos ? `${pos.top}px` : 0,
                left: pos ? `${pos.left}px` : 0,
                // Ilk olcum tamamlanana kadar gorunmez tut (layout jump yok).
                visibility: pos ? "visible" : "hidden",
              }}
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
