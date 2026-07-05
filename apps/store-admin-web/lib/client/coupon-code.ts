/**
 * F4A.1 — Otomatik kupon kodu uretici (istemci tarafi).
 *
 * Bicim: <KAMPANYA-ADI-ONEKI><INDIRIM-IPUCU>-<RASTGELE-SONEK>
 * Ornekler: YAZ10-K7P3, INDIRIM250-X9Q2, SUMMER10-A8F4
 *
 * Kurallar: BUYUK harf, yalniz ASCII [A-Z0-9-], Turkce karakterler ASCII'ye
 * cevrilir, sonuc mevcut kupon dogrulamasina sigar
 * (/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/). Uretim yalnizca kolaylik icindir;
 * benzersizligin KAYNAK DOGRUSU backend'in duplicate dogrulamasidir
 * (DUPLICATE_COUPON_CODE) — cakisirsa kullanici yeniden uretir.
 */

/** Karisan karakterler (0/O, 1/I/L) cikarilmis sonek alfabesi. */
const RANDOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Unicode normalize'in cozemedigi TR harfleri (ı/İ dahil) icin acik esleme. */
const TR_ASCII: Record<string, string> = {
  ç: "C", Ç: "C",
  ğ: "G", Ğ: "G",
  ı: "I", İ: "I",
  ö: "O", Ö: "O",
  ş: "S", Ş: "S",
  ü: "U", Ü: "U",
};

const PREFIX_MAX = 12;
const FALLBACK_PREFIX = "KUPON";

/** Kampanya adini ASCII-guvenli BUYUK harf onekine cevirir. */
export function asciiCouponPrefix(name: string): string {
  const mapped = [...name].map((ch) => TR_ASCII[ch] ?? ch).join("");
  const ascii = mapped
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // TR-I tuzagi: locale-BAGIMSIZ uppercase (backend normalizasyonu ile ayni).
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const trimmed = ascii.slice(0, PREFIX_MAX);
  return trimmed.length >= 2 ? trimmed : FALLBACK_PREFIX;
}

/** Indirim ipucu: PERCENT → "10"; FIXED_AMOUNT (minor) → tam lira "250". */
export function discountHint(
  discountType: "PERCENT" | "FIXED_AMOUNT",
  discountValue: number | null,
): string {
  if (discountValue === null || !Number.isFinite(discountValue) || discountValue <= 0) return "";
  if (discountType === "PERCENT") return String(Math.trunc(discountValue));
  return String(Math.round(discountValue / 100));
}

function randomSuffix(length: number, random: () => number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += RANDOM_ALPHABET[Math.floor(random() * RANDOM_ALPHABET.length) % RANDOM_ALPHABET.length];
  }
  return out;
}

export interface GenerateCouponCodeInput {
  name: string;
  discountType: "PERCENT" | "FIXED_AMOUNT";
  /** PERCENT: yuzde degeri; FIXED_AMOUNT: minor unit tutar. Gecersizse yok sayilir. */
  discountValue: number | null;
  /** Test edilebilirlik icin enjekte edilebilir RNG (varsayilan Math.random). */
  random?: () => number;
}

/** Dogrulamaya sigan, duzenlenebilir bir kupon kodu onerisi uretir. */
export function generateCouponCode(input: GenerateCouponCodeInput): string {
  const random = input.random ?? Math.random;
  const prefix = asciiCouponPrefix(input.name);
  const hint = discountHint(input.discountType, input.discountValue);
  // Toplam uzunluk 40'i asamaz: 4 sonek + 1 ayirac → govde en fazla 35.
  const body = `${prefix}${hint}`.slice(0, 35);
  return `${body}-${randomSuffix(4, random)}`;
}

/** Backend couponCodeSchema ile ayni bicim kurali (istemci on-dogrulama). */
export const COUPON_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/;
