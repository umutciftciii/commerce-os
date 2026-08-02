/**
 * Focus-trap SAF cekirdegi (DOM'suz, hook'suz — RSC-guvenli).
 *
 * `computeTrapFocusIndex` birim test edilir: Tab dizisinin ucundan disari cikmayi
 * yakalar ve dairesel olarak sarmalanacak indeksi dondurur. Hook'un kendisi
 * (client) `./use-focus-trap` icindedir; boylece bu saf modul, server component'ler
 * tarafindan da (or. paylasilan barrel uzerinden) guvenle import edilir.
 */

/** Diyalog icindeki odaklanabilir elemanlari secen standart CSS secici. */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Tab/Shift+Tab ile dizinin ucundan cikildiginda sarmalanacak indeksi verir.
 * `null` → tarayicinin varsayilan davranisina birak (ic gecis).
 *
 * @param count       Odaklanabilir eleman sayisi.
 * @param activeIndex Su an odakli elemanin indeksi (-1: kapsayici disi/bilinmiyor).
 * @param shiftKey    Shift basili mi (geri yon).
 */
export function computeTrapFocusIndex(
  count: number,
  activeIndex: number,
  shiftKey: boolean,
): number | null {
  if (count === 0) return null;
  if (shiftKey) {
    // Ilk elemanda (ya da kapsayici disinda) Shift+Tab → sona sarmala.
    if (activeIndex <= 0) return count - 1;
    return null;
  }
  // Son elemanda (ya da kapsayici disinda) Tab → basa sarmala.
  if (activeIndex === -1 || activeIndex >= count - 1) return 0;
  return null;
}
