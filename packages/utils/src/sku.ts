/**
 * TODO-160A (ADR-111) — SKU üretim/normalizasyon MOTORU (SAF, çerçeve-bağımsız, TEK OTORİTE).
 *
 * Deterministik, okunabilir varyant SKU'ları üretir: `{PREFIX?}-{PRODUCT_CODE}-{OPTION_CODES…}-{SEQ?}`.
 * Örnekler: `TSH-BASIC-BLK-M`, `LAP-XIAOMI-16GB-512GB`, `MUG-CERAMIC-WHT-001`.
 *
 * Bu modül Next/React/Prisma/HTTP/Date/`Math.random` BİLMEZ; yalnız saf string dönüşümü + kolizyon
 * çözümü. Böylece "SKU üretimi tek yerde + izole test edilebilir" ilkesi uygulanır. Tenant-aware'lik
 * ve DB kolizyon predikatı çağıran (servis) katmandadır — bu motor saf string alır, `isTaken`
 * predikatını dışarıdan alır (slug.ts ile birebir simetrik desen).
 *
 * Determinizm: aynı girdi → aynı SKU. Kolizyon çözümü de deterministiktir (aynı `desired` + aynı
 * `isTaken` davranışı → daima aynı sonuç).
 *
 * Format kuralları (ADR-111): yalnız `A-Z`, `0-9`, `-`; ASCII; Türkçe transliteration; büyük harf;
 * ardışık ayraç yok; başta/sonda ayraç yok; maks uzunluk; boş sonuç üretilemez (fallback).
 */

/** SKU uzunluk/format sabitleri. */
export const SKU_MAX_LENGTH = 64;
/** Segment (product/option kodu) başına üst sınır — tek segment SKU'yu tek başına doldurmasın. */
export const SKU_SEGMENT_MAX_LENGTH = 24;
/** Tamamen geçersiz girdi (yalnız emoji/simge) bu köke düşer. */
export const SKU_FALLBACK = "SKU";
/** Kanonik SKU karakter kümesi (üretilen değerler için — katı alt küme). */
export const SKU_CHARSET = /^[A-Z0-9-]+$/;
/** Kolizyon soneki: başlangıç sayısı + zero-padding genişliği + üst sınır (sonsuz döngü guard). */
export const SKU_SUFFIX_START = 2;
export const SKU_SUFFIX_PADDING = 3;
export const SKU_SUFFIX_MAX = 9999;

/**
 * Türkçe (ve yaygın Latin genişletme) harflerinin ASCII karşılıkları. slug.ts'teki TRANSLITERATION ile
 * kavramsal olarak aynıdır ama BÜYÜK HARF SKU bağlamı için ayrı tutulur (slug lowercase üretir; SKU
 * uppercase). NFKD çoğu aksanı ayrıştırır; ı/İ/ş/ğ gibi harfler NFKD ile inmez → burada AÇIK eşlenir.
 */
const TRANSLITERATION: Record<string, string> = {
  ç: "C", Ç: "C",
  ğ: "G", Ğ: "G",
  ı: "I", İ: "I",
  ö: "O", Ö: "O",
  ş: "S", Ş: "S",
  ü: "U", Ü: "U",
  ß: "SS",
  æ: "AE", Æ: "AE",
  ø: "O", Ø: "O",
  ð: "D", Ð: "D",
  þ: "TH", Þ: "TH",
  œ: "OE", Œ: "OE",
};

/**
 * Ham metni kanonik SKU SEGMENTİNE indirger (SAF, tek kelime/kod — ayraç segmentler ARASINDA join'de
 * eklenir). Adımlar (deterministik sıra):
 *  1. Açık transliterasyon (Türkçe ı/ş/ğ… → ASCII) — NFKD ÖNCESİ (İ/ı kaybolmasın).
 *  2. NFKD normalize + combining işaretleri (U+0300–U+036F) düşür.
 *  3. Uppercase.
 *  4. `A-Z0-9` dışı her şey → tire.
 *  5. Tekrarlı tire → tek; baş/son tire kırp.
 *  6. Segment maks uzunluğa kes (son tire kırp).
 *
 * NOT: boş segment ("" ) döndürebilir (yalnız simge girdi) — join katmanı boş segmentleri atar.
 */
export function normalizeSkuSegment(
  input: string,
  options: { maxLength?: number } = {},
): string {
  const maxLength = options.maxLength ?? SKU_SEGMENT_MAX_LENGTH;

  let out = "";
  for (const ch of input) {
    out += TRANSLITERATION[ch] ?? ch;
  }
  out = out.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase();
  out = out.replace(/[^A-Z0-9]+/g, "-");
  out = out.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (out.length > maxLength) {
    out = out.slice(0, maxLength).replace(/-+$/g, "");
  }
  return out;
}

/**
 * Tam bir SKU string'ini kanonik forma indirger (manuel override / mevcut değer normalizasyonu için).
 * Segment mantığının aynısını uygular ama tireleri (ayraçları) KORUR — yalnız normalize eder.
 */
export function normalizeSku(input: string, options: { maxLength?: number } = {}): string {
  const maxLength = options.maxLength ?? SKU_MAX_LENGTH;

  let out = "";
  for (const ch of input) {
    out += TRANSLITERATION[ch] ?? ch;
  }
  out = out.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase();
  out = out.replace(/[^A-Z0-9-]+/g, "-");
  out = out.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (out.length > maxLength) {
    out = out.slice(0, maxLength).replace(/-+$/g, "");
  }
  return out;
}

export interface BuildSkuInput {
  /** Ürün kodu kaynağı (genelde ürün slug'ı veya adı). Zorunlu anlam taşır; boşsa fallback devreye girer. */
  productCode: string;
  /** Varyant option kodları (kanonik/deterministik sırada — çağıran sıralar). Ör. ["BLK", "M"]. */
  optionCodes?: string[];
  /** Opsiyonel öntakı (mağaza/marka kısaltması). */
  prefix?: string;
  /** Opsiyonel sayısal sekans (basit ürün / açık numaralandırma). */
  sequence?: number;
  /** Sekans zero-padding genişliği (default 3 → 001). */
  sequencePadding?: number;
  /** SKU maks uzunluğu (default 64). */
  maxLength?: number;
  /** Segment maks uzunluğu (default 24). */
  segmentMaxLength?: number;
}

export interface BuildSkuResult {
  /** Kolizyon çözümü UYGULANMAMIŞ deterministik temel SKU (kanonik). */
  base: string;
  /** Herhangi bir segment/uzunluk kısaltması uygulandı mı (tanısal). */
  truncated: boolean;
}

/**
 * Deterministik TEMEL SKU üretir (kolizyon çözümü YOK — bkz. resolveUniqueSku). Segmentleri normalize
 * eder, boşları atar, `-` ile birleştirir, toplam uzunluğu sınırlar (aşımda ÖNCE product kodunu, sonra
 * option kodlarını orantılı kısaltır) ve boş sonuçta fallback köküne düşer.
 */
export function buildBaseSku(input: BuildSkuInput): BuildSkuResult {
  const maxLength = input.maxLength ?? SKU_MAX_LENGTH;
  const segmentMax = input.segmentMaxLength ?? SKU_SEGMENT_MAX_LENGTH;
  let truncated = false;

  const rawSegments: string[] = [];
  if (input.prefix) rawSegments.push(input.prefix);
  rawSegments.push(input.productCode);
  for (const code of input.optionCodes ?? []) rawSegments.push(code);

  const segments = rawSegments
    .map((s) => {
      const norm = normalizeSkuSegment(s, { maxLength: segmentMax });
      if (norm.length < s.replace(/[^A-Za-z0-9]/g, "").length) truncated = true;
      return norm;
    })
    .filter((s) => s.length > 0);

  if (input.sequence !== undefined && Number.isFinite(input.sequence)) {
    const padding = input.sequencePadding ?? SKU_SUFFIX_PADDING;
    segments.push(String(Math.max(0, Math.trunc(input.sequence))).padStart(padding, "0"));
  }

  let base = segments.join("-");

  // Toplam uzunluk aşımı: segmentleri sondan (sekans hariç) orantılı değil, deterministik kısalt.
  if (base.length > maxLength) {
    truncated = true;
    base = shrinkToLength(segments, maxLength);
  }

  base = base.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (base.length === 0) base = SKU_FALLBACK;
  return { base, truncated };
}

/**
 * Segment dizisini `-` ayraçla birleştirirken toplam uzunluğu `maxLength`'e sığdırır. İlk segment
 * (product kodu) en çok yeri hak eder; kalan segmentler eşit paylaşılır. Deterministik.
 */
function shrinkToLength(segments: string[], maxLength: number): string {
  if (segments.length === 0) return "";
  if (segments.length === 1) return segments[0]!.slice(0, maxLength).replace(/-+$/g, "");

  const separators = segments.length - 1;
  const budget = maxLength - separators;
  if (budget <= segments.length) {
    // Aşırı dar: her segmenti 1 karaktere indir, sığdığı kadarını al.
    return segments.map((s) => s.slice(0, 1)).join("-").slice(0, maxLength).replace(/-+$/g, "");
  }
  // İlk segmente yarım bütçe, kalanları eşit paylaştır (deterministik).
  const firstBudget = Math.max(1, Math.floor(budget / 2));
  const restBudget = Math.max(1, Math.floor((budget - firstBudget) / (segments.length - 1)));
  const out = segments.map((s, i) =>
    (i === 0 ? s.slice(0, firstBudget) : s.slice(0, restBudget)).replace(/-+$/g, ""),
  );
  return out.filter((s) => s.length > 0).join("-").slice(0, maxLength).replace(/-+$/g, "");
}

export type SkuValidationError =
  | "empty"
  | "too-long"
  | "invalid-characters"
  | "leading-trailing-dash"
  | "consecutive-dash";

export interface SkuValidationResult {
  ok: boolean;
  /** Kanonik hale getirilmiş öneri (ok=false olsa da "bunu mu demek istediniz" için). */
  normalized: string;
  errors: SkuValidationError[];
}

/**
 * Kanonik SKU FORMATINI doğrular (üretilen değerler + katı manuel override için). Otomatik düzeltmez;
 * çağıran hataları gösterip `normalized`'ı önerebilir. NOT: bu KATI kanonik kontrol (`A-Z0-9-`); manuel
 * SKU kontratı (`skuSchema`, lowercase/./_ kabul eden) DAHA GEVŞEKTİR ve backward-compat için korunur —
 * bu fonksiyon "kanonik üretilmiş SKU" testidir, kontrat validasyonunun yerine geçmez.
 */
export function validateSku(raw: string, options: { maxLength?: number } = {}): SkuValidationResult {
  const maxLength = options.maxLength ?? SKU_MAX_LENGTH;
  const errors: SkuValidationError[] = [];
  const trimmed = raw.trim();

  if (trimmed.length === 0) errors.push("empty");
  else {
    if (trimmed.length > maxLength) errors.push("too-long");
    if (!SKU_CHARSET.test(trimmed)) errors.push("invalid-characters");
    if (/^-|-$/.test(trimmed)) errors.push("leading-trailing-dash");
    if (/--/.test(trimmed)) errors.push("consecutive-dash");
  }

  return { ok: errors.length === 0, normalized: normalizeSku(raw, { maxLength }), errors };
}

export interface ResolveUniqueSkuResult {
  sku: string;
  /** Denenen aday sayısı (1 = temel çakışmadı). */
  attempts: number;
  /** Üst sınıra (SKU_SUFFIX_MAX) ulaşıldı mı — teorik; deterministik son çare döner. */
  exhausted: boolean;
}

/**
 * Deterministik kolizyon çözümü. `desired` kökünü alır; `isTaken(candidate)` true dönen her aday için
 * zero-padded sayısal sonek dener (`-002`, `-003`, …) ve İLK boş adayı döner. Kök+sonek maks uzunluğu
 * aşarsa kök kısaltılır (toplam ≤ maxLength). Retry üst sınırı (SKU_SUFFIX_MAX) → sonsuz döngü yok.
 *
 * SAF: `isTaken` store-scoped uniqueness'ı çağıran katmandan gelir (tenant-aware). DB unique nihai guard;
 * bu yalnız "çakışmayan aday öner" katmanıdır (yarış hâlâ P2002 ile yakalanır).
 */
export function resolveUniqueSku(
  desired: string,
  isTaken: (candidate: string) => boolean,
  options: { maxLength?: number; startAt?: number; padding?: number } = {},
): ResolveUniqueSkuResult {
  const maxLength = options.maxLength ?? SKU_MAX_LENGTH;
  const padding = options.padding ?? SKU_SUFFIX_PADDING;
  const startAt = options.startAt ?? SKU_SUFFIX_START;
  const base = normalizeSku(desired, { maxLength }) || SKU_FALLBACK;

  if (!isTaken(base)) return { sku: base, attempts: 1, exhausted: false };

  let attempts = 1;
  for (let n = startAt; n <= SKU_SUFFIX_MAX; n += 1) {
    attempts += 1;
    const suffix = `-${String(n).padStart(padding, "0")}`;
    const room = maxLength - suffix.length;
    const root = base.length > room ? base.slice(0, room).replace(/-+$/g, "") : base;
    const candidate = `${root}${suffix}`;
    if (!isTaken(candidate)) return { sku: candidate, attempts, exhausted: false };
  }
  // Teorik olarak ulaşılamaz (9999 çakışma); deterministik son çare.
  return { sku: `${base}-${SKU_SUFFIX_MAX}`, attempts, exhausted: true };
}

export interface GenerateSkuParams {
  productCode: string;
  optionCodes?: string[];
  prefix?: string;
  sequence?: number;
  /** Kullanıcının verdiği manuel taban (varsa). Geçerliyse normalize edilip base olarak kullanılır. */
  manualBase?: string | null;
  /** Store-scoped uniqueness predikatı (çağıran enjekte eder). */
  isTaken: (candidate: string) => boolean;
}

export interface GenerateSkuResult {
  /** Kolizyon çözülmüş nihai SKU. */
  sku: string;
  /** Kolizyon öncesi deterministik temel. */
  base: string;
  /** Manuel taban mı kullanıldı (kaynak ipucu; nihai skuSource'u servis belirler). */
  usedManualBase: boolean;
  attempts: number;
  exhausted: boolean;
}

/**
 * Üst düzey giriş noktası (auto + manuel taban). Manuel taban verilmiş ve normalize sonrası boş değilse
 * onu base alır; aksi halde productCode+optionCodes+sequence'ten deterministik base kurar. Sonra
 * kolizyonu çözer. TEK giriş noktası — route/servis rastgele SKU üretmez, daima bunu kullanır.
 */
export function generateSku(
  params: GenerateSkuParams,
  options: { maxLength?: number; segmentMaxLength?: number; sequencePadding?: number } = {},
): GenerateSkuResult {
  const maxLength = options.maxLength ?? SKU_MAX_LENGTH;

  const manual = params.manualBase?.trim();
  let base: string;
  let usedManualBase = false;
  if (manual && manual.length > 0) {
    const normalized = normalizeSku(manual, { maxLength });
    if (normalized.length > 0) {
      base = normalized;
      usedManualBase = true;
    } else {
      base = buildBaseSku(baseInputFrom(params, options)).base;
    }
  } else {
    base = buildBaseSku(baseInputFrom(params, options)).base;
  }

  const resolved = resolveUniqueSku(base, params.isTaken, { maxLength });
  return {
    sku: resolved.sku,
    base,
    usedManualBase,
    attempts: resolved.attempts,
    exhausted: resolved.exhausted,
  };
}

function baseInputFrom(
  params: GenerateSkuParams,
  options: { maxLength?: number; segmentMaxLength?: number; sequencePadding?: number },
): BuildSkuInput {
  return {
    productCode: params.productCode,
    optionCodes: params.optionCodes,
    prefix: params.prefix,
    sequence: params.sequence,
    maxLength: options.maxLength,
    segmentMaxLength: options.segmentMaxLength,
    sequencePadding: options.sequencePadding,
  };
}
