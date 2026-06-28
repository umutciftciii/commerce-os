/* ────────────────────────────────────────────────────────────────────────────
 * Paylasilan dogrulama yardimcilari — SAF/BAGIMSIZ modul (zod ya da baska runtime
 * bagimliligi YOK). Tek otorite burada; gateway (server-otoriter) ve vitrin
 * (client UX) ayni mantigi kullanir.
 *
 * Bu dosya bilincli olarak `@commerce-os/contracts` ana index'inden ayri tutulur:
 * boylece client component'ler `@commerce-os/api-client/validators` alt-modulu
 * uzerinden yalniz bu saf yardimcilari import edebilir ve client bundle'a zod /
 * kontrat semalari / `createApiClient` SIZMAZ.
 *
 * Kart yardimcilari yalniz dogrulama/turetme icindir; FULL PAN/CVC asla saklanmaz.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Bir degerden yalnizca rakamlari birakir. */
export function digitsOnly(value: string): string {
  return value.replace(/\D+/g, "");
}

/**
 * T.C. Kimlik No dogrulamasi (resmi algoritma): 11 hane, ilk hane 0 olamaz;
 * 10. ve 11. hane checksum kurallarina uyar.
 */
export function isValidTckn(value: string): boolean {
  const tckn = digitsOnly(value);
  if (!/^[1-9][0-9]{10}$/.test(tckn)) return false;
  const d = tckn.split("").map(Number);
  const oddSum = d[0] + d[2] + d[4] + d[6] + d[8];
  const evenSum = d[1] + d[3] + d[5] + d[7];
  const tenth = (((oddSum * 7 - evenSum) % 10) + 10) % 10;
  if (tenth !== d[9]) return false;
  const firstTenSum = d.slice(0, 10).reduce((sum, digit) => sum + digit, 0);
  return firstTenSum % 10 === d[10];
}

/** Vergi numarasi (TR VKN): 10 haneli sayisal. */
export function isValidTaxNumber(value: string): boolean {
  return /^[0-9]{10}$/.test(digitsOnly(value));
}

/** IBAN'i normalize eder: bosluk/ayrac temizler, buyuk harfe cevirir. */
export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/**
 * IBAN dogrulamasi (ISO 13616 mod-97). TR icin uzunluk 26. Genel kontrol:
 * 2 harf ulke + 2 kontrol hane + BBAN; ilk 4 karakter sona alinir, harfler
 * 10..35'e cevrilir, mod 97 == 1 olmali.
 */
export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith("TR") && iban.length !== 26) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const part = code >= 65 ? (code - 55).toString() : ch; // A=10..Z=35
    for (const digit of part) {
      remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
    }
  }
  return remainder === 1;
}

/** IBAN'i gosterim icin maskeler: TR12 **** **** **** **** **34 gibi. */
export function maskIban(value: string): string {
  const iban = normalizeIban(value);
  if (iban.length < 8) return "****";
  const head = iban.slice(0, 4);
  const tail = iban.slice(-2);
  return `${head} **** **** **** **** ${tail}`;
}

/** TCKN/VKN gosterim maskesi: yalniz son 2 hane (PII minimizasyonu). */
export function maskTaxId(value: string): string {
  const digits = digitsOnly(value);
  if (digits.length < 2) return "****";
  return `${"*".repeat(digits.length - 2)}${digits.slice(-2)}`;
}

/**
 * TR cep telefonunu yerel 10 haneye indirger (0/+90/90 onekleri temizler).
 * Ornek: "+90 532 111 22 33" -> "5321112233".
 */
export function normalizeTrPhone(value: string): string {
  let digits = digitsOnly(value);
  if (digits.startsWith("90")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/** Gecerli TR cep numarasi mi? (10 hane, "5" ile baslar). */
export function isValidTrPhone(value: string): boolean {
  const d = normalizeTrPhone(value);
  return d.length === 10 && d.startsWith("5");
}

/**
 * E-posta dogrulama regex'i. zod v3 `z.string().email()` ile AYNI desen; bu modulu
 * zod'dan bagimsiz tutmak icin birebir kopyalanmistir (gateway + vitrin tek otorite).
 */
const EMAIL_REGEX = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;

/**
 * Kayit/giris tanimlayicisi (email|GSM) tipini tespit eder. "@" iceriyorsa email,
 * aksi halde TR telefon olarak normalize edilir. Gecersizse type="invalid".
 */
export function classifyIdentifier(
  raw: string,
): { type: "email"; value: string } | { type: "phone"; value: string } | { type: "invalid" } {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) {
    const candidate = trimmed.toLowerCase();
    return candidate.length <= 320 && EMAIL_REGEX.test(candidate)
      ? { type: "email", value: candidate }
      : { type: "invalid" };
  }
  if (isValidTrPhone(trimmed)) {
    return { type: "phone", value: normalizeTrPhone(trimmed) };
  }
  return { type: "invalid" };
}

/** Luhn saglama (kart numarasi). PAN saklanmaz; yalniz dogrulama icin. */
export function luhnValid(pan: string): boolean {
  const digits = digitsOnly(pan);
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export type CardBrand = "VISA" | "MASTERCARD" | "AMEX" | "TROY" | "CARD";

/** Kart markasini BIN aralidan turetir (gosterim icin; PAN saklanmaz). */
export function detectCardBrand(pan: string): CardBrand {
  const digits = digitsOnly(pan);
  if (/^4/.test(digits)) return "VISA";
  if (/^3[47]/.test(digits)) return "AMEX";
  if (/^9792/.test(digits) || /^65/.test(digits)) return "TROY";
  const first2 = Number(digits.slice(0, 2));
  const first4 = Number(digits.slice(0, 4));
  if ((first2 >= 51 && first2 <= 55) || (first4 >= 2221 && first4 <= 2720)) return "MASTERCARD";
  return "CARD";
}

/** PAN'in son 4 hanesi (gosterim/observability; full PAN saklanmaz). */
export function cardLast4(pan: string): string {
  return digitsOnly(pan).slice(-4);
}
