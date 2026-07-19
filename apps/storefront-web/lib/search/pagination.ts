/**
 * TODO-156B (brief §10) — Numaralı pagination için SAF pencere üretici (deterministik, test edilebilir).
 *
 * Kompakt pencere: her zaman ilk + son sayfa, geçerli sayfa ± sibling, aradaki boşluklar "ellipsis".
 * SEO otoritesi numaralı sayfalardır; bu yalnız görünür pencereyi belirler (href'ler codec'ten türer).
 */
export type PageToken = number | "ellipsis";

/**
 * `current` ve `total` (1-tabanlı) için gösterilecek sayfa jetonları. `siblingCount` geçerli sayfanın
 * iki yanındaki komşu sayısı. total ≤ 0 → boş; total küçükse tüm sayfalar (ellipsis yok).
 */
export function paginationRange(current: number, total: number, siblingCount = 1): PageToken[] {
  if (total <= 0) return [];
  const clampedCurrent = Math.min(Math.max(current, 1), total);

  // İlk + son + geçerli±sibling + 2 ellipsis yeri: bu sayıdan azsa tüm sayfaları göster.
  const totalNumbers = siblingCount * 2 + 5;
  if (total <= totalNumbers) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(clampedCurrent - siblingCount, 1);
  const rightSibling = Math.min(clampedCurrent + siblingCount, total);
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < total - 1;

  const tokens: PageToken[] = [];
  if (!showLeftEllipsis && showRightEllipsis) {
    // Sol blok geniş: ilk (3 + 2*sibling) sayfa + ellipsis + son.
    const leftCount = 3 + 2 * siblingCount;
    for (let i = 1; i <= leftCount; i += 1) tokens.push(i);
    tokens.push("ellipsis", total);
  } else if (showLeftEllipsis && !showRightEllipsis) {
    // Sağ blok geniş: ilk + ellipsis + son (3 + 2*sibling) sayfa.
    const rightCount = 3 + 2 * siblingCount;
    tokens.push(1, "ellipsis");
    for (let i = total - rightCount + 1; i <= total; i += 1) tokens.push(i);
  } else {
    // İki taraf da ellipsis: ilk + ellipsis + orta pencere + ellipsis + son.
    tokens.push(1, "ellipsis");
    for (let i = leftSibling; i <= rightSibling; i += 1) tokens.push(i);
    tokens.push("ellipsis", total);
  }
  return tokens;
}
