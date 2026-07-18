/**
 * TODO-154 (ADR-079) — Faz 2C-8A · Metin normalizasyonu (SAF, deterministik).
 *
 * Facet `normalizedText` + doküman `searchText` üretiminde tek kaynak. Lowercase + Türkçe-güvenli
 * (İ/ı) + trim + boşluk sadeleştirme. Dilbilimsel stemming/aksan-katlama İLERİ FAZ (Faz E) — burada
 * bilinçle YOK (deterministik ve öngörülebilir kalır).
 */

/** Türkçe-güvenli lowercase (I→ı, İ→i) + boşluk sadeleştirme + trim. Boş/null → "". */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}

/** searchText parçalarını (null/boş atılarak) tekilleştirip birleştirir → tek normalize metin. */
export function buildSearchText(parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const normalized = normalizeText(part);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out.join(" ");
}
