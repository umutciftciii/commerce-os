/**
 * TODO-172 (ADR-273) — Minor-unit finansal tutarlar için GÜVENLİ BigInt taşıma & biçimlendirme.
 *
 * Neden: minor-unit tutarlar DB'de BigInt olabilir (ör. StoreSettings.fastRefundMaxAmountMinor).
 * `JSON.stringify` BigInt'te patlar; `Number(bigint)` / `parseInt` ise 2^53 üstünde SESSİZ precision
 * kaybı üretir. Bu yüzden API contract'ta bu alanlar **kanonik ondalık string** olarak taşınır ve
 * client/server yalnız burada tanımlı BigInt-tabanlı yardımcılarla işler. Float ASLA kullanılmaz.
 *
 * Kanonik minor string: işaretsiz, baştan-sıfırsız base-10 tamsayı (`0` veya `[1-9]\d*`).
 */

/** Kanonik (işaretsiz, baştan-sıfırsız) minor-unit tamsayı string deseni. */
export const CANONICAL_MINOR_STRING_RE = /^(0|[1-9]\d*)$/;

/** Verilen string kanonik bir minor-unit tutar mı? (negatif/ondalık/baştan-sıfır/boş → false) */
export function isCanonicalMinorString(value: string): boolean {
  return CANONICAL_MINOR_STRING_RE.test(value);
}

/**
 * Kanonik minor string → BigInt. Geçersizse RangeError fırlatır (SESSİZ precision kaybı YOK).
 * `parseInt`/`Number` kullanılmaz.
 */
export function parseMinorString(value: string): bigint {
  if (!isCanonicalMinorString(value)) {
    throw new RangeError(`Invalid canonical minor-unit amount: ${JSON.stringify(value)}`);
  }
  return BigInt(value);
}

/** BigInt → kanonik minor string. Negatif reddedilir (minor tutarlar non-negatif). */
export function minorToCanonicalString(value: bigint): string {
  if (value < 0n) {
    throw new RangeError("minor-unit amount must be non-negative");
  }
  return value.toString();
}

/** İki minor string'i float'sız karşılaştırır (-1 | 0 | 1). */
export function compareMinorStrings(a: string, b: string): -1 | 0 | 1 {
  const x = parseMinorString(a);
  const y = parseMinorString(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Minor tutarı (string | bigint) major/ondalık parçalarına AYIRIR — tamamen BigInt aritmetiğiyle
 * (float yok). Ör. "25000" → { major: "250", fraction: "00" }.
 */
export function minorToMajorParts(value: string | bigint): { major: string; fraction: string } {
  const v = typeof value === "bigint" ? value : parseMinorString(value);
  if (v < 0n) throw new RangeError("minor-unit amount must be non-negative");
  const major = (v / 100n).toString();
  const fraction = (v % 100n).toString().padStart(2, "0");
  return { major, fraction };
}

const CURRENCY_SYMBOLS: Record<string, string> = { TRY: "₺", USD: "$", EUR: "€", GBP: "£" };

/**
 * Minor tutarı (string | bigint) para birimiyle GÖRÜNTÜ string'ine biçimlendirir — BigInt tabanlı,
 * float YOK. Locale yalnız ayraç seçimi için (tr: `1.234,56` / diğer: `1,234.56`). Bilinmeyen para
 * birimi kodu simgesiz prefix olarak taşınır. 2^53 üstü tutarlar da precision kaybı olmadan biçimlenir.
 */
export function formatMinorMoney(value: string | bigint, currency: string, locale = "tr"): string {
  const { major, fraction } = minorToMajorParts(value);
  const isTr = locale.startsWith("tr");
  const groupSep = isTr ? "." : ",";
  const decimalSep = isTr ? "," : ".";
  const grouped = major.replace(/\B(?=(\d{3})+(?!\d))/g, groupSep);
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${symbol}${grouped}${decimalSep}${fraction}`;
}
