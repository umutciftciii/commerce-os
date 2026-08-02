/**
 * Tooltip/popover konumlama cekirdegi (saf, DOM'suz — birim test edilebilir).
 *
 * Portal'a (document.body) render edilen bir ipucunun viewport koordinatlarini
 * hesaplar: tercih edilen kenari dener, viewport'a tasarsa karsi kenara cevirir
 * (collision detection + auto-flip), sonra capraz ekseni kenar boslugu icinde
 * kelepceler. Cikti `position: fixed` icin viewport-goreli top/left verir.
 */

export type TooltipSide = "top" | "bottom" | "left" | "right";

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface TooltipPosition {
  top: number;
  left: number;
  /** Cevirme sonrasi fiilen kullanilan kenar (ok/animasyon yonu icin). */
  side: TooltipSide;
}

const OPPOSITE: Record<TooltipSide, TooltipSide> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

function fitsOnSide(anchor: Rect, tip: Size, viewport: Viewport, side: TooltipSide, gap: number) {
  switch (side) {
    case "top":
      return anchor.top - gap - tip.height >= 0;
    case "bottom":
      return anchor.top + anchor.height + gap + tip.height <= viewport.height;
    case "left":
      return anchor.left - gap - tip.width >= 0;
    case "right":
      return anchor.left + anchor.width + gap + tip.width <= viewport.width;
  }
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * @param anchor  Tetikleyicinin viewport-goreli dikdortgeni (getBoundingClientRect).
 * @param tip     Ipucunun olculen boyutu.
 * @param viewport Gorunur alan (innerWidth/innerHeight).
 * @param preferredSide Tercih edilen kenar.
 * @param gap     Tetikleyici ile ipucu arasi bosluk (px).
 * @param padding Viewport kenarina birakilacak minimum bosluk (px).
 */
export function computeTooltipPosition(
  anchor: Rect,
  tip: Size,
  viewport: Viewport,
  preferredSide: TooltipSide = "top",
  gap = 8,
  padding = 8,
): TooltipPosition {
  // Kenar secimi: tercih edilen sigmazsa karsisina cevir; o da sigmazsa yine
  // tercih edileni kullan (kelepceleme en azindan gorunur tutar).
  let side = preferredSide;
  if (!fitsOnSide(anchor, tip, viewport, side, gap)) {
    const flipped = OPPOSITE[side];
    if (fitsOnSide(anchor, tip, viewport, flipped, gap)) side = flipped;
  }

  const anchorCenterX = anchor.left + anchor.width / 2;
  const anchorCenterY = anchor.top + anchor.height / 2;

  let top: number;
  let left: number;

  if (side === "top" || side === "bottom") {
    left = anchorCenterX - tip.width / 2;
    left = clamp(left, padding, viewport.width - tip.width - padding);
    top = side === "top" ? anchor.top - gap - tip.height : anchor.top + anchor.height + gap;
  } else {
    top = anchorCenterY - tip.height / 2;
    top = clamp(top, padding, viewport.height - tip.height - padding);
    left = side === "left" ? anchor.left - gap - tip.width : anchor.left + anchor.width + gap;
  }

  return { top, left, side };
}
