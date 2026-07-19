/**
 * TODO-156E — Autocomplete eşleşen kısım VURGULAMA (SAF, XSS-güvenli).
 *
 * `dangerouslySetInnerHTML` KULLANMAZ: metni {text, match} segmentlerine böler; React bunları text node
 * olarak render eder (enjeksiyon imkânsız). Eşleşme Türkçe-güvenli + case-insensitive (İ/ı katlaması) ve
 * UZUNLUK-KORUYUCU fold ile yapılır → orijinal metin dilimlenirken indeksler kayar. Fold uzunluğu değişirse
 * (beklenmeyen locale davranışı) güvenli fallback: tüm metin tek match'siz segment.
 */

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/** Uzunluk-koruyucu Türkçe fold (I→ı, İ→i, sonra tr-TR lowercase). Her karakter → tek karakter. */
function fold(input: string): string {
  return input.replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr-TR");
}

/**
 * `text` içinde `query` geçen TÜM (örtüşmeyen) yerleri işaretleyen segment dizisi döner. Boş query →
 * tek match'siz segment. Deterministik + saf.
 */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const needle = fold(query.trim());
  if (!needle) return [{ text, match: false }];
  const hay = fold(text);
  // Uzunluk kayması güvenliği: fold 1:1 değilse indeks eşlemesi bozulur → vurgulama yapma.
  if (hay.length !== text.length) return [{ text, match: false }];

  const segments: HighlightSegment[] = [];
  let i = 0;
  while (i < text.length) {
    const found = hay.indexOf(needle, i);
    if (found < 0) {
      segments.push({ text: text.slice(i), match: false });
      break;
    }
    if (found > i) segments.push({ text: text.slice(i, found), match: false });
    segments.push({ text: text.slice(found, found + needle.length), match: true });
    i = found + needle.length;
  }
  return segments.filter((s) => s.text.length > 0);
}
